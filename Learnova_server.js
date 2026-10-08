const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const app = express();

function getSecureDataDirectory() {
  const homeDirectory = process.env.HOME || process.env.USERPROFILE;
  let dataDirectory;
  if (process.platform === 'win32') {
    dataDirectory = path.join(process.env.APPDATA || homeDirectory, 'LearnovaData');
  } else if (process.platform === 'darwin') {
    dataDirectory = path.join(homeDirectory, 'Library', 'Application Support', 'LearnovaData');
  } else {
    dataDirectory = path.join(homeDirectory, '.learnovadata');
  }
  fs.mkdirSync(dataDirectory, { recursive: true });
  return dataDirectory;
}

const dataDirectory = getSecureDataDirectory();
const databasePath = path.join(dataDirectory, 'users.json');
const legacyDatabasePath = path.join(__dirname, 'users.json');

if (!fs.existsSync(databasePath) && fs.existsSync(legacyDatabasePath)) {
  fs.copyFileSync(legacyDatabasePath, databasePath, fs.constants.COPYFILE_EXCL);
  console.log("✅ Existing Learnova user data was migrated to the secure data folder.");
}

const adapter = new JSONFile(databasePath);
const db = new Low(adapter, { users: [] });


// ==========================================================================
// ✅ SMART AUTOMATIC FOLDER RESOLVER FOR TAURI DEPLOYMENT
// ==========================================================================
let finalSrcPath = __dirname;

// Use a nested frontend only when it contains the expected dashboard entry point.
if (fs.existsSync(path.join(__dirname, "src", "index.html"))) {
    finalSrcPath = path.join(__dirname, "src");
}
if (fs.existsSync(path.join(__dirname, "src", "src", "index.html"))) {
    finalSrcPath = path.join(__dirname, "src", "src");
}

console.log("🎯 Learnova is reading frontend files from:", finalSrcPath);

app.use(express.static(finalSrcPath));
for (const [legacyName, currentName] of Object.entries({
  "Scorelytics.css": "Learnova.css",
  "Scorelytics_login.css": "Learnova_login.css",
  "Scorelytics_login.html": "Learnova_login.html",
  "Scorelytics_login.js": "Learnova_login.js"
})) {
  app.get(`/${legacyName}`, (req, res, next) => {
    res.sendFile(path.join(finalSrcPath, currentName), error => {
      if (error && !res.headersSent) next(error);
    });
  });
}
app.get("/:filename", (req, res, next) => {
  const filename = req.params.filename;
  if (!/^(?:Learnova|Scorelytics)_Study_Plan_.+\.pdf$/i.test(filename) || path.basename(filename) !== filename) {
    return next();
  }
  res.download(path.join(dataDirectory, filename), filename, error => {
    if (error && !res.headersSent) next(error);
  });
});

// ✅ ALLOW LARGE WEBCAM IMAGES TO PASS TO YOUR ENDPOINTS
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

async function geocodeLocation(req, res) {
  const query = typeof req.query.q === "string"
    ? req.query.q.trim()
    : typeof req.body?.query === "string"
      ? req.body.query.trim()
      : "";
  if (!query) {
    return res.status(400).json({ error: "A location query is required." });
  }

  try {
    const geocodingUrl = new URL("https://nominatim.openstreetmap.org/search");
    geocodingUrl.search = new URLSearchParams({
      format: "jsonv2",
      q: query,
      limit: "1"
    }).toString();

    const response = await fetch(geocodingUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Learnova/1.0 (location search)"
      }
    });
    if (!response.ok) {
      console.error("Geocoding service returned HTTP", response.status);
      return res.status(502).json({ error: "The geocoding service could not complete the search." });
    }

    const results = await response.json();
    if (!Array.isArray(results)) {
      throw new Error("Geocoding service returned an invalid response.");
    }
    res.json(results.slice(0, 1));
  } catch (error) {
    console.error("GEOCODING ROUTE ERROR:", error);
    res.status(502).json({ error: "Could not connect to the geocoding service." });
  }
}

app.get("/api/geocode", geocodeLocation);
app.post("/api/geocode", geocodeLocation);

// ==========================================================================
// ✅ LOWDB ARCHITECTURE SETUP
// ==========================================================================
// ✅ INIT DB
async function initDB() {
  await db.read();
  if (!db.data || !Array.isArray(db.data.users)) {
    throw new Error(`Database has an invalid users array: ${databasePath}`);
  }

  if (!fs.existsSync(databasePath)) {
    console.warn("No user database exists yet; leaving it uncreated until the first account is saved.");
  }
}

// ==========================================================================
// ✅ INTERFACE PAGE ROUTING TARGETS
// ==========================================================================

// Home Dashboard Route
app.get("/", (req, res) => {
  res.sendFile(path.join(finalSrcPath, "index.html"));
});

// Login Page Route
app.get("/login", (req, res) => {
  res.sendFile(path.join(finalSrcPath, "Learnova_login.html"));
});

// ==========================================================================
// ✅ CORE APPLICATION ROUTING API ENDPOINTS
// ==========================================================================

// ✅ LOGIN SESSION VERIFICATION
app.post("/login", async (req, res) => {
  await db.read();
  const { username, password } = req.body;
  const user = db.data.users.find(
    u => u.username === username && u.password === password
  );
  res.json({ success: !!user });
});

// ✅ SIGNUP / NEW USER CAPTURE PROFILE
app.post("/signup", async (req, res) => {
  await db.read();
  const { username, password } = req.body;

  if (db.data.users.find(u => u.username === username)) {
    return res.json({ success: false });
  }

  db.data.users.push({
    username,
    password,
    tests: []
  });

  await db.write();
  res.json({ success: true });
});

// ✅ MANUAL TEST ENTRY UPLOADER
app.post("/addTest", async (req, res) => {
  await db.read();
  const { username, test } = req.body;

  const user = db.data.users.find(u => u.username === username);
  if (!user) return res.json({ success: false });
  if (!Array.isArray(user.tests)) {
    user.tests = [];
  }
  user.tests.push(test);

  await db.write();
  res.json({ success: true });
});

// ✅ FETCH DATA FOR OVERVIEW, PROFILE, AND ANALYTICS CHARTS
app.post("/getTests", async (req, res) => {
  try {
    await db.read();
    if (!db.data || !Array.isArray(db.data.users)) {
      db.data = { users: [] };
    }
    const { username } = req.body;
    const user = db.data.users.find(u => u.username === username);
    res.json(user ? user.tests : []);
  } catch (err) {
    console.error("GET TESTS ERROR:", err);
    res.json([]);
  }
});

// ✅ MANAGE INTERACTIVE TABLE MODIFICATIONS
app.post("/saveAllTests", async (req, res) => {
  await db.read();
  const { username, tests } = req.body;

  const user = db.data.users.find(u => u.username === username);
  if (!user) return res.json({ success: false });

  user.tests = tests;

  await db.write();
  res.json({ success: true });
});

// ✅ SECURE V1.5.7 AUTOMATED REPORT COMPILATION SYSTEM (REPRORTLAB INTEGRATION)
app.post("/api/export-pdf", async (req, res) => {
  try {
    await db.read();
    const { username } = req.body;
    const user = db.data.users.find(u => u.username === username);

    if (!user) {
      return res.json({ success: false, message: "Active tracking session has expired." });
    }

    const matrixPayload = JSON.stringify(Array.isArray(user.tests) ? user.tests : []);

    execFile("python", [path.join(__dirname, "Generate_pdf.py"), username, matrixPayload], {
      cwd: dataDirectory,
      encoding: 'utf-8'
    }, (error, stdout, stderr) => {
      if (error) {
        console.error("PDF Compilation System Fault:", error, stderr);
        return res.status(500).json({ success: false, message: "PDF generation failed. Check the backend log for details." });
      }
      if (stderr && stderr.trim()) {
        console.error("PDF generation diagnostics:", stderr.trim());
      }

      try {
        const resolution = JSON.parse(stdout.trim());
        res.json(resolution);
      } catch (parseFault) {
        console.error("PDF output parse failure:", parseFault, stdout);
        res.status(500).json({ success: false, message: "PDF generation returned an invalid response." });
      }
    });

  } catch (globalFault) {
    console.error("Express routing thread lock:", globalFault);
    res.json({ success: false, message: "Server error executing system compile pipelines." });
  }
});

// ✅ CHANGE DASHBOARD ACCOUNT SECURITY CREDS
app.post("/changePassword", async (req, res) => {
  try {
    await db.read();
    const { username, newPassword } = req.body;

    if (!username || !newPassword) {
      return res.json({ success: false });
    }

    const user = db.data.users.find(u => u.username === username);
    if (!user) return res.json({ success: false });

    user.password = newPassword;

    await db.write();
    res.json({ success: true });
  } catch (err) {
    console.error("PASSWORD ERROR:", err);
    res.json({ success: false });
  }
});

// ✅ INTERACTIVE STUDYBOT PIPELINE (LOCAL OLLAMA WRAPPER ENGINE)
app.post("/chat", async (req, res) => {
  try {
    await db.read();
    const { username, message } = req.body;
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ reply: "Please enter a message for StudyBot." });
    }

    const user = db.data.users.find(u => u.username === username);
    if (!user) {
      return res.json({ reply: "User session expired." });
    }

    const testsDataString = JSON.stringify(Array.isArray(user.tests) ? user.tests : []);
    execFile("python", [path.join(__dirname, "studybot.py"), message, testsDataString], {
      cwd: dataDirectory,
      encoding: "utf-8"
    }, (error, stdout, stderr) => {
      if (error) {
        console.error("StudyBot execution failed:", error, stderr);
        return res.status(500).json({ reply: "StudyBot could not start. Check the backend log for details." });
      }
      if (stderr && stderr.trim()) {
        console.error("StudyBot diagnostics:", stderr.trim());
      }

      try {
        const output = JSON.parse(stdout.trim());
        if (typeof output.reply !== "string") {
          throw new Error("StudyBot response did not contain a reply.");
        }
        res.json({ reply: output.reply });
      } catch (parseError) {
        console.error("StudyBot output parse failure:", parseError, stdout);
        res.status(500).json({ reply: "StudyBot returned an invalid response." });
      }
    });
  } catch (error) {
    console.error("StudyBot route failed:", error);
    res.status(500).json({ reply: "StudyBot could not load your study data." });
  }
});

// ✅ AUTOMATED UPLOAD CAMERA SCANNER (HYBRID TESSERACT & EASYOCR RUNNER)
app.post("/api/auto-upload", async (req, res) => {
  let tempFilePath;
  try {
    const { imageBase64 } = req.body;
    const imageMatch = typeof imageBase64 === "string"
      ? imageBase64.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!imageMatch) {
      return res.status(400).json({ success: false, message: "A valid PNG image is required." });
    }

    const imageBuffer = Buffer.from(imageMatch[1], "base64");
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (
      imageBuffer.length > 10 * 1024 * 1024 ||
      imageBuffer.length < pngSignature.length ||
      !imageBuffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      return res.status(400).json({ success: false, message: "The uploaded image is invalid or too large." });
    }

    tempFilePath = path.join(dataDirectory, `temp_capture_${crypto.randomUUID()}.png`);
    await fs.promises.writeFile(tempFilePath, imageBuffer);

    execFile("python", [path.join(__dirname, "parser.py"), tempFilePath], {
      cwd: dataDirectory,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      fs.unlink(tempFilePath, cleanupError => {
        if (cleanupError && cleanupError.code !== "ENOENT") {
          console.error("Could not remove temporary scanner image:", cleanupError);
        }
      });

      if (error) {
        console.error("Scanner execution failed:", error, String(stderr || "").slice(-4000));
        return res.status(500).json({ success: false, message: "Scanner processing failed. Check the backend log for details." });
      }

      try {
        const parsedResults = JSON.parse(stdout.trim());
        if (parsedResults.error) {
          return res.json({ success: false, message: parsedResults.error });
        }
        res.json({ success: true, data: parsedResults });
      } catch (parseError) {
        console.error("Scanner output parse failure:", parseError, stdout);
        res.status(500).json({ success: false, message: "Scanner returned an invalid response." });
      }
    });
  } catch (error) {
    if (tempFilePath) {
      fs.unlink(tempFilePath, cleanupError => {
        if (cleanupError && cleanupError.code !== "ENOENT") {
          console.error("Could not remove temporary scanner image:", cleanupError);
        }
      });
    }
    console.error("Scanner route failed:", error);
    res.status(500).json({ success: false, message: "Scanner could not process the image." });
  }
});

// ✅ LOG CONFIRMED PARSED ACADEMIC METRICS BACK INTO SYSTEM
app.post("/api/save-confirmed-score", async (req, res) => {
  const { username, subject, score, total } = req.body;
  
  await db.read();
  const user = db.data.users.find(u => u.username === username);
  
  if (user) {
    user.tests.push({
      subject: subject,
      score: score,
      total: total,
      date: new Date().toLocaleDateString()
    });
    await db.write();
    return res.json({ success: true });
  }
  
  res.json({ success: false, message: "User session expired." });
});

// ==========================================================================
// ✅ GLOBAL CAMPUS ARCHITECTURE MAPPING PROFILE SAVE ENDPOINT
// ==========================================================================
app.post("/api/save-location", async (req, res) => {
  try {
    const { username, region, schoolName, coordinates } = req.body;

    const lat = Number(coordinates?.lat);
    const lng = Number(coordinates?.lng);
    if (
      typeof username !== "string" || !username.trim() ||
      typeof region !== "string" || !region.trim() ||
      typeof schoolName !== "string" || !schoolName.trim() ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "A username, region, school name, and valid map coordinates are required."
      });
    }

    await db.read();
    if (!db.data || !Array.isArray(db.data.users)) {
      throw new Error(`Database has an invalid users array: ${databasePath}`);
    }
    const user = db.data.users.find(u => u.username === username);

    if (!user) {
      return res.json({ success: false, message: "Active tracking session has expired." });
    }

    user.region = region.trim();
    user.school_name = schoolName.trim();
    user.school_coordinates = { lat, lng };

    await db.write();
    res.json({ success: true });
  } catch (err) {
    console.error("LOCATION ROUTE ERROR:", err);
    res.status(500).json({ success: false, message: "Server error saving geography records." });
  }
});

app.get("/api/location", async (req, res) => {
  try {
    const username = typeof req.query.username === "string" ? req.query.username : "";
    await db.read();
    const user = db.data.users.find(entry => entry.username === username);
    if (!user) {
      return res.status(404).json({ success: false, message: "User profile was not found." });
    }

    res.json({
      success: true,
      location: {
        region: user.region || "",
        schoolName: user.school_name || "",
        coordinates: user.school_coordinates || null
      }
    });
  } catch (error) {
    console.error("LOAD LOCATION ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load the saved location." });
  }
});

// ==========================================================================
// ✅ RUN DATABASE INITIALIZATION & START DASHBOARD SERVER LISTENERS
// ==========================================================================
const serverPort = Number(process.env.PORT) || 8000;
initDB().then(() => {
  app.listen(serverPort, "127.0.0.1", () => {
    console.log(`✅ Server running on http://localhost:${serverPort}`);
  });
}).catch(error => {
  console.error("DATABASE STARTUP ERROR: refusing to overwrite invalid user data.", error);
  process.exitCode = 1;
});