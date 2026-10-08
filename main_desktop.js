const { app, BrowserWindow, dialog, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const configPath = path.join(__dirname, "desktop-config.json");
const desktopConfig = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf8"))
  : {};
const appUrl = process.env.SCORELYTICS_PUBLIC_API_URL
  || desktopConfig.apiBaseUrl
  || "https://scorelytics-app.onrender.com";
const parsedAppUrl = new URL(appUrl);
if (
  !["https:", "http:"].includes(parsedAppUrl.protocol) ||
  (parsedAppUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedAppUrl.hostname)) ||
  parsedAppUrl.username ||
  parsedAppUrl.password
) {
  throw new Error("SCORELYTICS_PUBLIC_API_URL must use HTTPS (HTTP is allowed only for localhost).");
}
const appOrigin = parsedAppUrl.origin;

function isAppOrigin(origin) {
  try {
    return new URL(origin).origin === appOrigin;
  } catch {
    return false;
  }
}

function createWindow() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = details?.mediaTypes || [];
    callback(
      isAppOrigin(details?.requestingUrl || webContents.getURL()) &&
      permission === "media" &&
      mediaTypes.includes("video") &&
      !mediaTypes.includes("audio")
    );
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const mediaTypes = details?.mediaTypes || [];
    return isAppOrigin(requestingOrigin) &&
      permission === "media" &&
      mediaTypes.includes("video") &&
      !mediaTypes.includes("audio");
  });

  const window = new BrowserWindow({
    width: 1300,
    height: 880,
    minWidth: 760,
    minHeight: 600,
    title: "Learnova",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAppOrigin(targetUrl)) event.preventDefault();
  });

  window.loadURL(appUrl).catch(error => {
    console.error("Could not load the Learnova hosted app:", error);
    dialog.showErrorBox(
      "Learnova could not connect",
      "Check your internet connection and confirm the hosted Learnova service is deployed."
    );
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
