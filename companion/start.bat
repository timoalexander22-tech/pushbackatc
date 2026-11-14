@echo off
title Virtual Ground Crew Companion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte die LTS-Version von https://nodejs.org installieren.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installiere Abhaengigkeiten, einmalig...
  call npm install --omit=dev
)
node index.js
pause
