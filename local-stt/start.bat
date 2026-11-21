@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.10-3.12 was not found. Install Python from https://www.python.org/downloads/
  pause
  exit /b 1
)

py -3.12 --version >nul 2>nul
if errorlevel 1 (
  echo Python 3.12 was not found. Install Python 3.12 from https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist .venv\Scripts\python.exe (
  py -3.12 -m venv .venv
  if errorlevel 1 (
    echo Could not create the local STT virtual environment.
    pause
    exit /b 1
  )
)

.venv\Scripts\python.exe -c "import av, faster_whisper" >nul 2>nul
if errorlevel 1 (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Could not install faster-whisper dependencies.
    pause
    exit /b 1
  )
)

.venv\Scripts\python.exe server.py
pause
