// === FILE: runtime-config.js ===
window.SCORELYTICS_RUNTIME_CONFIG = Object.freeze({
  authMode: "local",         // ✅ Tells the interceptor to process local database queries
  apiBaseUrl: "http://127.0.0.1:8000" // ✅ Targets your running local Express backend port!
});