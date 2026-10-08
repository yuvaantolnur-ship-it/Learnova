
[Setup]
AppName=Learnova
AppVersion=2.0
DefaultDirName={autopf}\Learnova
DefaultGroupName=Learnova
UninstallDisplayIcon={app}\Learnova.exe
Compression=lzma2
SolidCompression=yes
OutputDir=C:\Yuv Docs\Coding\Learnova
OutputBaseFilename=Learnova_Setup

[Files]
Source: "C:\Yuv Docs\Coding\Learnova\dist\Learnova\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Learnova"; Filename: "{app}\Learnova.exe"
Name: "{autodesktop}\Learnova"; Filename: "{app}\Learnova.exe"

[Run]
Filename: "{app}\Learnova.exe"; Description: "Launch Learnova"; Flags: nowait postinstall skipifsilent
