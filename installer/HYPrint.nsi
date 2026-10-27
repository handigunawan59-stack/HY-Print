Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!ifndef AppVersion
  !define AppVersion "0.1.0"
!endif
Name "HY Print"
OutFile "..\dist\installer\HY-Print-Setup-${AppVersion}.exe"
InstallDir "$LOCALAPPDATA\Programs\HY Print"
InstallDirRegKey HKCU "Software\HY Print" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\HY Print.exe"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"

Section "HY Print" SEC01
  SetOutPath "$INSTDIR"
  File /r "..\dist\HY Print\*"
  File "..\LICENSE"
  File "..\README.md"
  SetOutPath "$INSTDIR\source"
  File "..\app.py"
  File "..\backend.py"
  File "..\pricing.py"
  File "..\requirements.txt"
  File "..\build.ps1"
  File "..\BUILD.md"
  File "..\LICENSE"
  File "..\README.md"
  SetOutPath "$INSTDIR\source\installer"
  File "HYPrint.nsi"
  File "collect_licenses.py"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\HY Print"
  CreateShortCut "$SMPROGRAMS\HY Print\HY Print.lnk" "$INSTDIR\HY Print.exe"
  WriteRegStr HKCU "Software\HY Print" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "DisplayName" "HY Print"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "DisplayVersion" "${AppVersion}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "DisplayIcon" "$INSTDIR\HY Print.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\HY Print\HY Print.lnk"
  RMDir "$SMPROGRAMS\HY Print"
  Delete "$INSTDIR\HY Print.exe"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\source\app.py"
  Delete "$INSTDIR\source\backend.py"
  Delete "$INSTDIR\source\pricing.py"
  Delete "$INSTDIR\source\requirements.txt"
  Delete "$INSTDIR\source\build.ps1"
  Delete "$INSTDIR\source\BUILD.md"
  Delete "$INSTDIR\source\LICENSE"
  Delete "$INSTDIR\source\README.md"
  Delete "$INSTDIR\source\installer\HYPrint.nsi"
  Delete "$INSTDIR\source\installer\collect_licenses.py"
  RMDir "$INSTDIR\source\installer"
  RMDir "$INSTDIR\source"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\_internal"
  RMDir /r "$INSTDIR\third_party_licenses"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\HY Print"
  DeleteRegKey HKCU "Software\HY Print"
SectionEnd
