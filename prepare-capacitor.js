const fs = require("node:fs");
const path = require("node:path");

const webFiles = [
  "Scorelytics.css",
  "Scorelytics_login.css",
  "Scorelytics_login.html",
  "Scorelytics_login.js",
  "Tests.js",
  "analytics.js",
  "api-client.js",
  "auth.js",
  "index.html",
  "legacy-import.html",
  "legacy-import.js",
  "scanner.js",
  "studybot.js",
  "ui.js"
];
const apiBaseUrl = process.env.SCORELYTICS_PUBLIC_API_URL || "https://scorelytics-api.onrender.com";
const parsedApiUrl = new URL(apiBaseUrl);

if (
  !["https:", "http:"].includes(parsedApiUrl.protocol) ||
  (parsedApiUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedApiUrl.hostname)) ||
  parsedApiUrl.username ||
  parsedApiUrl.password ||
  parsedApiUrl.search ||
  parsedApiUrl.hash ||
  parsedApiUrl.pathname !== "/"
) {
  throw new Error("SCORELYTICS_PUBLIC_API_URL must be an HTTPS API origin (HTTP is allowed only for localhost).");
}

const root = __dirname;
const outputDirectory = path.join(root, "capacitor-web");
fs.mkdirSync(outputDirectory, { recursive: true });

for (const filename of webFiles) {
  const source = fs.readFileSync(path.join(root, filename));
  const bundledSource = ["auth.js", "legacy-import.js"].includes(filename)
    ? source.toString("utf8").replaceAll('"/login"', '"/Scorelytics_login.html"')
    : source;
  fs.writeFileSync(path.join(outputDirectory, filename), bundledSource);
}

fs.writeFileSync(
  path.join(outputDirectory, "runtime-config.js"),
  `window.SCORELYTICS_RUNTIME_CONFIG = Object.freeze(${JSON.stringify({
    authMode: "supabase",
    apiBaseUrl: parsedApiUrl.origin
  })});\n`
);

console.log(`Prepared the allowlisted mobile frontend for ${parsedApiUrl.origin}.`);
