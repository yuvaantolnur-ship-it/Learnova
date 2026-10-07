# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('studybot.py', '.'), ('generate_pdf.py', '.'), ('parser.py', '.'), ('Server.py', '.'), ('schedule_planner.py', '.'), ('Scorelytics_server.js', '.'), ('users.json', '.'), ('index.html', '.'), ('Scorelytics_login.html', '.'), ('Scorelytics_login.js', '.'), ('studybot.js', '.'), ('auth.js', '.'), ('scanner.js', '.'), ('Tests.js', '.'), ('ui.js', '.'), ('Scorelytics.css', '.'), ('Scorelytics_login.css', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Scorelytics',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Scorelytics',
)
