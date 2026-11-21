@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.12 was not found. Install Python from https://www.python.org/downloads/
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
    echo Could not create the local TTS virtual environment.
    pause
    exit /b 1
  )
)

.venv\Scripts\python.exe -c "import piper.http_server" >nul 2>nul
if errorlevel 1 (
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  if errorlevel 1 (
    echo Could not install Piper TTS dependencies.
    pause
    exit /b 1
  )
)

if not defined VGC_PIPER_VOICE set VGC_PIPER_VOICE=en_US-lessac-medium
if not exist voices\%VGC_PIPER_VOICE%.onnx (
  .venv\Scripts\python.exe -m piper.download_voices %VGC_PIPER_VOICE% --data-dir voices
  if errorlevel 1 (
    echo Could not download Piper voice %VGC_PIPER_VOICE%.
    pause
    exit /b 1
  )
)
if not exist voices\%VGC_PIPER_VOICE%.onnx.json (
  .venv\Scripts\python.exe -m piper.download_voices %VGC_PIPER_VOICE% --data-dir voices
  if errorlevel 1 (
    echo Could not download Piper voice %VGC_PIPER_VOICE%.
    pause
    exit /b 1
  )
)

.venv\Scripts\python.exe -m piper.http_server -m %VGC_PIPER_VOICE% --data-dir voices --host 127.0.0.1 --port 5000
