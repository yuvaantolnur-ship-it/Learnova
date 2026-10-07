# === FILE: main.py ===
import sys
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from PySide6.QtCore import QUrl
from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow, QMessageBox
from PySide6.QtWebEngineCore import QWebEngineDownloadRequest, QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView

express_process = None
backend_log = None

def start_express_backend():
    global express_process, backend_log
    print("🚀 Launching Core Express Server instance on background pipeline threads...")
    resource_dir = os.path.dirname(os.path.abspath(__file__))
    server_path = os.path.join(resource_dir, "Scorelytics_server.js")
    bundled_node = os.path.join(resource_dir, "node.exe")
    node_path = bundled_node if os.path.isfile(bundled_node) else shutil.which("node")

    if not os.path.isfile(server_path):
        raise FileNotFoundError(f"Unable to locate the backend server file: {server_path}")
    if not node_path:
        raise FileNotFoundError("Node.js is missing. Rebuild the installer with the bundled Node.js runtime.")

    app_data_dir = os.environ.get("APPDATA") or os.path.expanduser("~")
    log_directory = os.path.join(app_data_dir, "ScorelyticsData")
    os.makedirs(log_directory, exist_ok=True)
    backend_log = open(os.path.join(log_directory, "backend.log"), "a", encoding="utf-8")

    express_process = subprocess.Popen(
        [node_path, server_path],
        cwd=resource_dir,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    )

    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if express_process.poll() is not None:
            raise RuntimeError(
                f"The local server stopped during startup. See {os.path.join(log_directory, 'backend.log')}."
            )
        try:
            with urllib.request.urlopen("http://127.0.0.1:8000/login", timeout=1) as response:
                if response.status == 200 and b"Login - Scorelytics" in response.read():
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(0.25)

    express_process.terminate()
    raise RuntimeError(
        f"The local server did not become ready. See {os.path.join(log_directory, 'backend.log')}."
    )

def main():
    app = QApplication(sys.argv)
    try:
        start_express_backend()
    except (OSError, RuntimeError) as error:
        QMessageBox.critical(None, "Scorelytics startup failed", str(error))
        if backend_log:
            backend_log.close()
        sys.exit(1)

    window = QMainWindow()
    window.setWindowTitle("Scorelytics Dashboard Platform")
    window.resize(1280, 850)

    # ==========================================================================
    # 🔒 CHROMIUM PROFILE ENGINE LOCK DOWN (FOR PERSISTENT SESSION RETENTION)
    # ==========================================================================
    # Force the embedded browser engine to create a persistent profile memory folder
    # This prevents localStorage and cookies from being wiped on application restarts!
    profile = QWebEngineProfile("Scorelytics", app)
    
    # Establish a persistent data path layout right inside the local app directory data scopes
    if os.name == 'nt':
        app_data_root = os.environ.get('APPDATA') or os.path.expanduser('~')
        storage_root = os.path.join(app_data_root, 'ScorelyticsData', 'BrowserCache')
    else:
        storage_root = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'ScorelyticsData', 'BrowserCache') if sys.platform == 'darwin' else os.path.join(os.path.expanduser('~'), '.scorelyticsdata', 'BrowserCache')
        
    os.makedirs(storage_root, exist_ok=True)
    profile.setPersistentStoragePath(storage_root)
    profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)

    web_view = QWebEngineView()
    web_page = QWebEnginePage(profile, web_view)
    web_view.setPage(web_page)

    def handle_download_requested(download):
        file_name = os.path.basename(download.downloadFileName() or download.suggestedFileName())
        if not file_name:
            file_name = "Scorelytics_Report.pdf"
        default_path = os.path.join(os.path.expanduser("~"), "Downloads", file_name)
        save_path, _ = QFileDialog.getSaveFileName(
            window,
            "Save Scorelytics download",
            default_path,
            "PDF files (*.pdf);;All files (*)"
        )
        if not save_path:
            download.cancel()
            return

        download.setDownloadDirectory(os.path.dirname(save_path))
        download.setDownloadFileName(os.path.basename(save_path))
        download.stateChanged.connect(
            lambda state: window.statusBar().showMessage(
                f"Download completed: {save_path}" if state == QWebEngineDownloadRequest.DownloadState.DownloadCompleted
                else f"Download interrupted: {save_path}" if state == QWebEngineDownloadRequest.DownloadState.DownloadInterrupted
                else f"Download cancelled: {save_path}" if state == QWebEngineDownloadRequest.DownloadState.DownloadCancelled
                else "Downloading..."
            )
        )
        download.accept()

    profile.downloadRequested.connect(handle_download_requested)

    def handle_web_feature_permission(origin, feature):
        permission = QWebEnginePage.PermissionPolicy.PermissionDeniedByUser
        is_local_app = origin.host() in {"localhost", "127.0.0.1"} and origin.port() == 8000
        if is_local_app and feature == QWebEnginePage.Feature.MediaVideoCapture:
            answer = QMessageBox.question(
                window,
                "Scorelytics camera access",
                "Allow Scorelytics to use your camera for the Scanner feature?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            if answer == QMessageBox.StandardButton.Yes:
                permission = QWebEnginePage.PermissionPolicy.PermissionGrantedByUser

        web_page.setFeaturePermission(origin, feature, permission)

    web_page.featurePermissionRequested.connect(handle_web_feature_permission)
    
    # Configure parameters to match web security bypass requirements and enable local storage engines
    settings = web_view.settings()
    settings.setAttribute(settings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
    settings.setAttribute(settings.WebAttribute.LocalContentCanAccessFileUrls, True)
    settings.setAttribute(settings.WebAttribute.LocalStorageEnabled, True)

    # 3. AUTOMATED REST API COMPATIBILITY INJECTION SHIM
    # Intercepts legacy pywebview calls and maps them cleanly onto Express fetch routes over Port 8000!
    compatibility_shim_js = """
    window.pywebview = {
        api: {
            verify_student_login: async function(username, password) {
                const res = await fetch("http://localhost:8000/login", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username, password })
                });
                return await res.json();
            },
            register_new_student: async function(username, password) {
                const res = await fetch("http://localhost:8000/signup", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username, password })
                });
                return await res.json();
            },
            get_student_tests: async function(username) {
                const res = await fetch("http://localhost:8000/getTests", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username })
                });
                return await res.json();
            },
            save_student_score: async function(username, subject, score, total) {
                const test = { subject, score, total, date: new Date().toLocaleDateString() };
                const res = await fetch("http://localhost:8000/addTest", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username, test })
                });
                const data = await res.json();
                return data.success;
            },
            save_school_location: async function(username, region, schoolName, lat, lng) {
                const res = await fetch("http://localhost:8000/api/save-location", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username, region, schoolName, coordinates: { lat, lng } })
                });
                const data = await res.json();
                return data.success;
            },
            change_student_password: async function(username, newPassword) {
                const res = await fetch("http://localhost:8000/changePassword", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ username, newPassword })
                });
                return await res.json();
            }
        }
    };
    console.log("🔒 Scorelytics JavaScript Bridging Channels Engaged Successfully.");
    
    // Smart Execution Check: Only run boot routines when page transitions into main dashboard layouts
    if (window.location.href.includes("index.html") || document.getElementById("schoolMap")) {
        if (typeof runSynchronizedBootSequence === 'function') { 
            runSynchronizedBootSequence(); 
        }
    } else {
        // Automatically ensure any stuck loading splash screen animations clear cleanly on account logins
        const loginLoader = document.getElementById("pageLoader") || document.getElementById("loader") || document.querySelector(".loader");
        if (loginLoader) loginLoader.style.display = "none";
    }
    """

    # Bind the shim script execution right onto the page loading cycle hook
    web_view.page().loadFinished.connect(lambda: web_view.page().runJavaScript(compatibility_shim_js))
    
    # ✅ INSIDER DEV-TOOLS HOTKEY: Press F12 or Ctrl+Shift+I while running the app to inspect live background events!
    from PySide6.QtGui import QShortcut, QKeySequence
    developer_shortcut = QShortcut(QKeySequence("F12"), window)
    developer_shortcut.activated.connect(lambda: web_view.page().setDevToolsPage(QWebEngineView()))
    
    # Route target view frames directly into your running local Express app instance
    web_view.load(QUrl("http://localhost:8000/Scorelytics_login.html"))
    window.setCentralWidget(web_view)
    
    window.show()
    
    # Listen for window exit triggers to cleanly release background task pipelines
    exit_code = app.exec()
    if express_process:
        print("🔌 Releasing background execution worker allocations...")
        express_process.terminate()
        try:
            express_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            express_process.kill()
            express_process.wait()
    if backend_log:
        backend_log.close()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()