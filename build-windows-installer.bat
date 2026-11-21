@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows-installer.ps1"
set "result=%ERRORLEVEL%"

echo.
if "%result%"=="0" (
  echo Windows-Installer erfolgreich erstellt.
  echo Ausgabe: %~dp0src-tauri\target\release\bundle
) else (
  echo Build fehlgeschlagen. Exit-Code: %result%
  echo Bitte die Fehlermeldung oben pruefen.
)
echo.
pause
exit /b %result%
