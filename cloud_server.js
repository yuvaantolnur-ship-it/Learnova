const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
const port = Number(process.env.PORT) || 10000;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "") || "https://fqazplfrjgapvcwqcacr.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const frontendDirectory = __dirname;
const publicFrontendFiles = new Set([
  "Learnova.css",
  "Learnova_login.css",
  "Learnova_login.html",
  "Learnova_login.js",
  "Tests.js",
  "analytics.js",
  "api-client.js",
  "auth.js",
  "index.html",
  "legacy-import.html",
  "legacy-import.js",
  "runtime-config.js",
  "scanner.js",
  "studybot.js",
  "ui.js"
]);
const legacyFrontendAliases = new Map([
  ["Scorelytics.css", "Learnova.css"],
  ["Scorelytics_login.css", "Learnova_login.css"],
  ["Scorelytics_login.html", "Learnova_login.html"],
  ["Scorelytics_login.js", "Learnova_login.js"]
]);
const dataDirectory = process.env.SCORELYTICS_DATA_DIR || path.join(os.tmpdir(), "scorelytics");
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);
const userRequestWindows = new Map();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
}

fs.mkdirSync(dataDirectory, { recursive: true });

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

app.use((req, res, next) => {
  const origin = req.get("Origin");
  console.log("CORS:", req.method, req.path, origin);
  const serviceOrigin = process.env.RENDER_EXTERNAL_HOSTNAME
    ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    : null;
  const permitted = !origin ||
    allowedOrigins.has(origin) ||
    origin === serviceOrigin ||
    origin === "capacitor://localhost" ||
    origin === "http://localhost" ||
    origin === "https://localhost";

  if (!permitted) {
    return res.status(403).json({ error: "This application origin is not allowed." });
  }
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

app.get("/runtime-config.js", (req, res) => {
  const apiBaseUrl = process.env.SCORELYTICS_PUBLIC_API_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : "");
  res.type("application/javascript").send(
    `window.SCORELYTICS_RUNTIME_CONFIG = Object.freeze(${JSON.stringify({
      authMode: "supabase",
      apiBaseUrl
    })});`
  );
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (req, res) => res.sendFile(path.join(frontendDirectory, "index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(frontendDirectory, "Learnova_login.html")));
app.get("/:filename", (req, res, next) => {
  const filename = legacyFrontendAliases.get(req.params.filename) || req.params.filename;
  if ((!publicFrontendFiles.has(filename) && !legacyFrontendAliases.has(req.params.filename)) || filename === "runtime-config.js") {
    return next();
  }
  res.sendFile(path.join(frontendDirectory, filename), error => {
    if (error && !res.headersSent) next(error);
  });
});

function getBearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("Authorization") || "");
  return match ? match[1] : null;
}

async function supabaseRequest(pathname, { method = "GET", token, body, prefer } = {}) {
  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token || supabaseAnonKey}`,
    Accept: "application/json"
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const responseText = await response.text();
  let responseBody = null;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
  }

  if (!response.ok) {
    const message = typeof responseBody === "object" && responseBody
      ? responseBody.message || responseBody.msg || responseBody.error_description || responseBody.error
      : null;
    throw new ApiError(response.status, message || "The hosted data service rejected the request.");
  }
  return responseBody;
}

function limitUserRequests(maximum, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const recent = (userRequestWindows.get(req.authUser.id) || [])
      .filter(timestamp => now - timestamp < windowMs);
    if (recent.length >= maximum) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many requests. Please wait and try again." });
    }
    recent.push(now);
    userRequestWindows.set(req.authUser.id, recent);
    if (userRequestWindows.size > 1000) {
      for (const [userId, timestamps] of userRequestWindows) {
        if (!timestamps.some(timestamp => now - timestamp < windowMs)) {
          userRequestWindows.delete(userId);
        }
      }
    }
    next();
  };
}

async function requireUser(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Please sign in again." });
  }

  try {
    const user = await supabaseRequest("/auth/v1/user", { token });
    if (!user || typeof user.id !== "string") {
      return res.status(401).json({ error: "Please sign in again." });
    }
    req.authToken = token;
    req.authUser = user;
    next();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
    }
    next(error);
  }
}

function validUsername(username) {
  return typeof username === "string" && username.trim().length > 0 && username.trim().length <= 64;
}

function validTest(test) {
  const score = Number(test?.score);
  const total = Number(test?.total);
  return typeof test?.subject === "string" &&
    test.subject.trim().length > 0 &&
    test.subject.trim().length <= 120 &&
    Number.isFinite(score) &&
    Number.isFinite(total) &&
    score >= 0 &&
    total > 0 &&
    score <= total;
}

async function getTestResults(user, token) {
  const query = new URLSearchParams({
    select: "subject,score,total,test_date",
    user_id: `eq.${user.id}`,
    order: "created_at.asc"
  });
  const rows = await supabaseRequest(`/rest/v1/test_results?${query}`, { token });
  return rows.map(row => ({
    subject: row.subject,
    score: Number(row.score),
    total: Number(row.total),
    date: row.test_date
  }));
}

app.post("/login", async (req, res, next) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return res.status(400).json({ success: false, message: "Enter your email and password." });
  }

  try {
    const session = await supabaseRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: email.trim(), password }
    });
    const username = session.user?.user_metadata?.username;
    res.json({
      success: true,
      username: validUsername(username) ? username.trim() : email.trim(),
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }
    next(error);
  }
});

app.post("/signup", async (req, res, next) => {
  const { email, password, username } = req.body;
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 8 ||
    !validUsername(username)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid recovery email, username, and password of at least 8 characters are required."
    });
  }

  try {
    const result = await supabaseRequest("/auth/v1/signup", {
      method: "POST",
      body: {
        email: email.trim(),
        password,
        data: { username: username.trim() }
      }
    });
    res.json({
      success: true,
      username: username.trim(),
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      confirmationRequired: !result.access_token,
      message: result.access_token
        ? "Account created. You can sign in now."
        : "Check the recovery email to confirm the account before signing in."
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      return res.status(409).json({ success: false, message: "That email address is already registered." });
    }
    next(error);
  }
});

app.post("/auth/refresh", async (req, res, next) => {
  const { refresh_token: refreshToken } = req.body;
  if (typeof refreshToken !== "string" || !refreshToken) {
    return res.status(400).json({ error: "A refresh token is required." });
  }
  try {
    const session = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken }
    });
    res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
  } catch (error) {
    next(error);
  }
});

app.post("/logout", requireUser, async (req, res, next) => {
  try {
    await supabaseRequest("/auth/v1/logout", { method: "POST", token: req.authToken });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/getTests", requireUser, async (req, res, next) => {
  try {
    res.json(await getTestResults(req.authUser, req.authToken));
  } catch (error) {
    next(error);
  }
});

app.post("/addTest", requireUser, async (req, res, next) => {
  const { test } = req.body;
  if (!validTest(test)) {
    return res.status(400).json({ success: false, message: "Enter a valid subject, score, and total." });
  }
  try {
    await supabaseRequest("/rest/v1/test_results", {
      method: "POST",
      token: req.authToken,
      prefer: "return=minimal",
      body: {
        user_id: req.authUser.id,
        subject: test.subject.trim(),
        score: Number(test.score),
        total: Number(test.total),
        test_date: typeof test.date === "string" && test.date.trim()
          ? test.date.trim()
          : new Date().toLocaleDateString()
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/saveAllTests", requireUser, async (req, res, next) => {
  const { tests } = req.body;
  if (!Array.isArray(tests) || tests.some(test => !validTest(test))) {
    return res.status(400).json({ success: false, message: "The test list contains invalid data." });
  }
  try {
    await supabaseRequest("/rest/v1/rpc/replace_my_test_results", {
      method: "POST",
      token: req.authToken,
      prefer: "return=minimal",
      body: { test_items: tests }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/changePassword", requireUser, async (req, res, next) => {
  const { newPassword } = req.body;
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: "The new password must be at least 8 characters." });
  }
  try {
    await supabaseRequest("/auth/v1/user", {
      method: "PUT",
      token: req.authToken,
      body: { password: newPassword }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/location", requireUser, async (req, res, next) => {
  const query = new URLSearchParams({
    select: "region,school_name,latitude,longitude",
    user_id: `eq.${req.authUser.id}`,
    limit: "1"
  });
  try {
    const rows = await supabaseRequest(`/rest/v1/school_locations?${query}`, { token: req.authToken });
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No saved school location was found." });
    }
    const location = rows[0];
    res.json({
      success: true,
      location: {
        region: location.region,
        schoolName: location.school_name,
        coordinates: { lat: location.latitude, lng: location.longitude }
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/save-location", requireUser, async (req, res, next) => {
  const { region, schoolName, coordinates } = req.body;
  const lat = Number(coordinates?.lat);
  const lng = Number(coordinates?.lng);
  if (
    typeof region !== "string" ||
    !region.trim() ||
    typeof schoolName !== "string" ||
    !schoolName.trim() ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({ success: false, message: "Enter a region, school name, and valid map coordinates." });
  }

  try {
    await supabaseRequest("/rest/v1/school_locations?on_conflict=user_id", {
      method: "POST",
      token: req.authToken,
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        user_id: req.authUser.id,
        region: region.trim(),
        school_name: schoolName.trim(),
        latitude: lat,
        longitude: lng,
        updated_at: new Date().toISOString()
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

async function geocodeLocation(req, res, next) {
  const query = typeof req.query.q === "string"
    ? req.query.q.trim()
    : typeof req.body?.query === "string"
      ? req.body.query.trim()
      : "";
  if (!query) {
    return res.status(400).json({ error: "A location query is required." });
  }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ format: "jsonv2", q: query, limit: "1" }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Learnova/1.0 (location search)" }
    });
    if (!response.ok) {
      throw new ApiError(502, "The geocoding service could not complete the search.");
    }
    const results = await response.json();
    if (!Array.isArray(results)) throw new Error("The geocoding service returned invalid data.");
    res.json(results.slice(0, 1));
  } catch (error) {
    next(error);
  }
}

app.get("/api/geocode", requireUser, limitUserRequests(30, 60_000), geocodeLocation);
app.post("/api/geocode", requireUser, limitUserRequests(30, 60_000), geocodeLocation);

app.post("/api/save-confirmed-score", requireUser, async (req, res, next) => {
  const { subject, score, total } = req.body;
  const test = { subject, score, total };
  if (!validTest(test)) {
    return res.status(400).json({ success: false, message: "The scanned score is invalid." });
  }
  try {
    await supabaseRequest("/rest/v1/test_results", {
      method: "POST",
      token: req.authToken,
      prefer: "return=minimal",
      body: {
        user_id: req.authUser.id,
        subject: subject.trim(),
        score: Number(score),
        total: Number(total),
        test_date: new Date().toLocaleDateString()
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import-legacy", requireUser, async (req, res, next) => {
  const { legacyUsername, tests, location } = req.body;
  if (!validUsername(legacyUsername) || !Array.isArray(tests) || tests.length > 2000 || tests.some(test => !validTest(test))) {
    return res.status(400).json({
      success: false,
      message: "Choose one legacy account and provide a valid list of up to 2,000 test records."
    });
  }

  let importedLocation = null;
  if (location) {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (
      typeof location.region !== "string" ||
      !location.region.trim() ||
      typeof location.school_name !== "string" ||
      !location.school_name.trim() ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({ success: false, message: "The selected account has an invalid saved location." });
    }
    importedLocation = {
      region: location.region.trim(),
      school_name: location.school_name.trim(),
      latitude: lat,
      longitude: lng
    };
  }

  try {
    await supabaseRequest("/rest/v1/rpc/import_my_legacy_data", {
      method: "POST",
      token: req.authToken,
      prefer: "return=minimal",
      body: {
        p_legacy_username: legacyUsername.trim(),
        p_tests: tests,
        p_location: importedLocation
      }
    });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return res.status(409).json({
        success: false,
        message: "This account’s records could not be imported, or they were already imported."
      });
    }
    next(error);
  }
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.get("/api/chat-sessions", requireUser, async (req, res, next) => {
  const query = new URLSearchParams({
    select: "id,title,updated_at",
    user_id: `eq.${req.authUser.id}`,
    order: "updated_at.desc",
    limit: "50"
  });
  try {
    const sessions = await supabaseRequest(`/rest/v1/chat_sessions?${query}`, { token: req.authToken });
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat-sessions", requireUser, limitUserRequests(10, 60_000), async (req, res, next) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "New chat";
  if (!title || title.length > 80) {
    return res.status(400).json({ error: "Chat titles must be between 1 and 80 characters." });
  }
  try {
    const countQuery = new URLSearchParams({
      select: "id",
      user_id: `eq.${req.authUser.id}`,
      limit: "50"
    });
    const existingSessions = await supabaseRequest(`/rest/v1/chat_sessions?${countQuery}`, { token: req.authToken });
    if (existingSessions.length >= 50) {
      return res.status(409).json({ error: "You have reached the 50 saved-chat limit. Delete an old chat to make room." });
    }
    const sessions = await supabaseRequest("/rest/v1/chat_sessions", {
      method: "POST",
      token: req.authToken,
      prefer: "return=representation",
      body: { user_id: req.authUser.id, title }
    });
    if (!Array.isArray(sessions) || typeof sessions[0]?.id !== "string") {
      throw new Error("The data service did not return the created chat session.");
    }
    res.status(201).json(sessions[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat-sessions/:sessionId/messages", requireUser, async (req, res, next) => {
  if (!uuidPattern.test(req.params.sessionId)) {
    return res.status(400).json({ error: "The requested chat session ID is invalid." });
  }
  const sessionQuery = new URLSearchParams({
    select: "id",
    id: `eq.${req.params.sessionId}`,
    user_id: `eq.${req.authUser.id}`,
    limit: "1"
  });
  const messagesQuery = new URLSearchParams({
    select: "id,role,content,created_at",
    session_id: `eq.${req.params.sessionId}`,
    user_id: `eq.${req.authUser.id}`,
    order: "created_at.asc",
    limit: "200"
  });
  try {
    const sessions = await supabaseRequest(`/rest/v1/chat_sessions?${sessionQuery}`, { token: req.authToken });
    if (!sessions.length) {
      return res.status(404).json({ error: "That chat session was not found." });
    }
    res.json(await supabaseRequest(`/rest/v1/chat_messages?${messagesQuery}`, { token: req.authToken }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/chat-sessions/:sessionId", requireUser, async (req, res, next) => {
  if (!uuidPattern.test(req.params.sessionId)) {
    return res.status(400).json({ error: "The requested chat session ID is invalid." });
  }
  const query = new URLSearchParams({
    id: `eq.${req.params.sessionId}`,
    user_id: `eq.${req.authUser.id}`
  });
  try {
    await supabaseRequest(`/rest/v1/chat_sessions?${query}`, {
      method: "DELETE",
      token: req.authToken,
      prefer: "return=minimal"
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/chat", requireUser, limitUserRequests(10, 60_000), async (req, res, next) => {
  const { message, sessionId } = req.body;
  if (typeof message !== "string" || !message.trim() || message.length > 4000 || !uuidPattern.test(sessionId || "")) {
    return res.status(400).json({ reply: "Enter a message of up to 4,000 characters." });
  }
  try {
    const sessionQuery = new URLSearchParams({
      select: "id",
      id: `eq.${sessionId}`,
      user_id: `eq.${req.authUser.id}`,
      limit: "1"
    });
    const sessions = await supabaseRequest(`/rest/v1/chat_sessions?${sessionQuery}`, { token: req.authToken });
    if (!sessions.length) {
      return res.status(404).json({ reply: "That chat session was not found. Start a new chat and try again." });
    }
    const historyQuery = new URLSearchParams({
      select: "role,content",
      session_id: `eq.${sessionId}`,
      user_id: `eq.${req.authUser.id}`,
      order: "created_at.desc",
      limit: "12"
    });
    const history = await supabaseRequest(`/rest/v1/chat_messages?${historyQuery}`, { token: req.authToken });
    const tests = await getTestResults(req.authUser, req.authToken);
    execFile(
      process.env.SCORELYTICS_PYTHON || (process.platform === "win32" ? "python" : "python3"),
      [path.join(__dirname, "studybot.py"), message.trim(), JSON.stringify(tests), JSON.stringify(history.reverse())],
      {
        cwd: dataDirectory,
        encoding: "utf-8",
        env: { ...process.env, SCORELYTICS_HOSTED: "1" },
        timeout: 70000,
        maxBuffer: 2 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Hosted StudyBot failed:", error, String(stderr || "").slice(-4000));
          return res.status(502).json({ reply: "StudyBot could not finish that request. Please try again later." });
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (typeof result.reply !== "string") throw new Error("StudyBot returned no reply.");
          supabaseRequest("/rest/v1/rpc/append_my_chat_turn", {
            method: "POST",
            token: req.authToken,
            prefer: "return=minimal",
            body: {
              p_session_id: sessionId,
              p_user_message: message.trim(),
              p_assistant_message: result.reply,
              p_title: message.trim().slice(0, 80)
            }
          }).then(() => {
            res.json({ reply: result.reply });
          }).catch(next);
        } catch (parseError) {
          console.error("Hosted StudyBot returned invalid output:", parseError);
          res.status(502).json({ reply: "StudyBot returned an invalid response." });
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

function parseScannerImage(imageBase64) {
  const match = typeof imageBase64 === "string"
    ? imageBase64.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/)
    : null;
  if (!match) throw new ApiError(400, "A valid PNG image is required.");
  const image = Buffer.from(match[1], "base64");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (image.length > 10 * 1024 * 1024 || image.length < 8 || !image.subarray(0, 8).equals(signature)) {
    throw new ApiError(400, "The uploaded image is invalid or too large.");
  }
  return image;
}

app.post("/api/auto-upload", requireUser, limitUserRequests(40, 60_000), async (req, res, next) => {
  let tempFile;
  try {
    const image = parseScannerImage(req.body.imageBase64);
    tempFile = path.join(dataDirectory, `temp_capture_${crypto.randomUUID()}.png`);
    await fs.promises.writeFile(tempFile, image);
    execFile(
      process.env.SCORELYTICS_PYTHON || (process.platform === "win32" ? "python" : "python3"),
      [path.join(__dirname, "parser.py"), tempFile],
      {
        cwd: dataDirectory,
        encoding: "utf-8",
        timeout: 120000,
        maxBuffer: 12 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        fs.unlink(tempFile, cleanupError => {
          if (cleanupError && cleanupError.code !== "ENOENT") {
            console.error("Could not remove scanner image:", cleanupError);
          }
        });
        if (error) {
          console.error("Hosted scanner failed:", error, String(stderr || "").slice(-4000));
          return res.status(502).json({ success: false, message: "Scanner processing failed. Please try again." });
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) return res.json({ success: false, message: result.error });
          res.json({ success: true, data: result });
        } catch (parseError) {
          console.error("Hosted scanner returned invalid output:", parseError);
          res.status(502).json({ success: false, message: "Scanner returned an invalid response." });
        }
      }
    );
  } catch (error) {
    if (tempFile) {
      fs.unlink(tempFile, cleanupError => {
        if (cleanupError && cleanupError.code !== "ENOENT") {
          console.error("Could not remove scanner image:", cleanupError);
        }
      });
    }
    next(error);
  }
});

app.post("/api/export-pdf", requireUser, limitUserRequests(5, 60_000), async (req, res, next) => {
  try {
    const tests = await getTestResults(req.authUser, req.authToken);
    const filename = `Learnova_Study_Plan_${req.authUser.id}.pdf`;
    execFile(
      process.env.SCORELYTICS_PYTHON || (process.platform === "win32" ? "python" : "python3"),
      [path.join(__dirname, "Generate_pdf.py"), req.authUser.id, JSON.stringify(tests)],
      {
        cwd: dataDirectory,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Hosted PDF generation failed:", error, String(stderr || "").slice(-4000));
          return res.status(502).json({ success: false, message: "PDF generation failed. Please try again." });
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.success || result.filename !== filename) {
            throw new Error("The PDF generator returned an unexpected filename.");
          }
          res.json({ success: true, filename });
        } catch (parseError) {
          console.error("Hosted PDF generation returned invalid output:", parseError);
          res.status(502).json({ success: false, message: "PDF generation returned an invalid response." });
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/download-pdf/:filename", requireUser, (req, res, next) => {
  const allowedFilenames = new Set([
    `Learnova_Study_Plan_${req.authUser.id}.pdf`,
    `Scorelytics_Study_Plan_${req.authUser.id}.pdf`
  ]);
  if (!allowedFilenames.has(req.params.filename)) {
    return res.status(404).json({ error: "The requested report was not found." });
  }
  res.download(path.join(dataDirectory, req.params.filename), req.params.filename, error => {
    if (error && !res.headersSent) next(error);
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ApiError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error("Cloud API request failed:", error);
  res.status(500).json({ error: "The Learnova service could not complete the request." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Learnova hosted API listening on port ${port}.`);
});
