const fs = require("node:fs");
const path = require("node:path");

const apiBaseUrl = process.env.SCORELYTICS_PUBLIC_API_URL || "https://learnova-app-sad7.onrender.com";
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

fs.writeFileSync(
  path.join(__dirname, "desktop-config.json"),
  `${JSON.stringify({ apiBaseUrl: parsedApiUrl.origin }, null, 2)}\n`
);
console.log(`Prepared the desktop app for ${parsedApiUrl.origin}.`);
