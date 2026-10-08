# === FILE: build.py ===
import os
import subprocess
import sys
import shutil

def build_learnova():
    print("🚀 Starting single-command PySide6 build pipeline for Learnova...")

    # 1. Force release any lingering background locks on ports or directories
    if os.name == 'nt':
        subprocess.run("taskkill /f /im node.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)
        subprocess.run("taskkill /f /im Learnova.exe", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True)

    # 2. Clean up old workspace build directories safely
    print("🧹 Cleaning old build folders...")
    for folder in ["build", "dist"]:
        if os.path.exists(folder):
            try:
                shutil.rmtree(folder)
            except Exception:
                pass

    # 3. Package all application files with PyInstaller
    print("\n📦 Step 1: Bundling app elements with PyInstaller...")
    pyinstaller_cmd = [
        "python", "-m", "PyInstaller",
        "--noconsole",
        "--noconfirm",
        "--clean",
        "--name=Learnova",
        "--add-data=studybot.py;.",
        "--add-data=generate_pdf.py;.",
        "--add-data=parser.py;.",
        "--add-data=Server.py;.",
        "--add-data=schedule_planner.py;.",
        "--add-data=Learnova_server.js;.",
        "--add-data=users.json;.",
        "--add-data=index.html;.",
        "--add-data=Learnova_login.html;.",
        "--add-data=Learnova_login.js;.",
        "--add-data=studybot.js;.",
        "--add-data=auth.js;.",
        "--add-data=scanner.js;.",
        "--add-data=Tests.js;.",  
        "--add-data=ui.js;.",
        "--add-data=Learnova.css;.",
        "--add-data=Learnova_login.css;.",
        "main.py"
    ]
    
    result = subprocess.run(pyinstaller_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ PyInstaller Error:")
        print(result.stderr)
        sys.exit(1)
    print("✅ PyInstaller bundling complete!")

    # 4. Dynamically write the Inno Setup configuration script using absolute paths
    print("\n📝 Step 2: Generating Installer Configuration...")
    
    current_dir = os.path.abspath(os.getcwd())
    
    iss_content = f"""
[Setup]
AppName=Learnova
AppVersion=2.0
DefaultDirName={{autopf}}\\Learnova
DefaultGroupName=Learnova
UninstallDisplayIcon={{app}}\\Learnova.exe
Compression=lzma2
SolidCompression=yes
OutputDir={current_dir}
OutputBaseFilename=Learnova_Setup

[Files]
Source: "{current_dir}\\dist\\Learnova\\*"; DestDir: "{{app}}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{{group}}\\Learnova"; Filename: "{{app}}\\Learnova.exe"
Name: "{{autodesktop}}\\Learnova"; Filename: "{{app}}\\Learnova.exe"

[Run]
Filename: "{{app}}\\Learnova.exe"; Description: "Launch Learnova"; Flags: nowait postinstall skipifsilent
"""
    
    with open("installer.iss", "w", encoding='utf-8') as f:
        f.write(iss_content)

    # 5. Compile the final executable installation wizard file using local compiler
    print("\n🛠️ Step 3: Compiling final Windows Setup Installer...")
    
    # Resolve the path to your internal folder setup
    inno_path = os.path.abspath(os.path.join(current_dir, "Inno Setup 6", "ISCC.exe"))
    
    if not os.path.exists(inno_path):
        # Fallback path safety check
        inno_path = r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"

    if not os.path.exists(inno_path):
        print(f"❌ Error: Inno Setup compiler compiler binary execution file not found!")
        print("Please verify the folder name matches exactly (e.g., 'Inno Setup 6' inside your project root).")
        sys.exit(1)

    result = subprocess.run([inno_path, "installer.iss"], capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ Inno Setup Error:")
        print(result.stderr)
        sys.exit(1)

    # Clean up the configuration file after a successful build
    if os.path.exists("installer.iss"):
        os.remove("installer.iss")

    print("\n🎉 Success! Your installable file 'Learnova_Setup.exe' is officially ready in your folder root.")

if __name__ == "__main__":
    build_learnova()
