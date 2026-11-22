$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$buildMutex = New-Object System.Threading.Mutex($false, "Local\PushbackATC-Windows-Installer")
$buildMutexAcquired = $false
$locationPushed = $false

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Executable failed with exit code $LASTEXITCODE"
  }
}

try {
  try {
    $buildMutexAcquired = $buildMutex.WaitOne(0)
    if (-not $buildMutexAcquired) {
      Write-Host "Ein anderer Windows-Installer-Build läuft bereits. Warte auf dessen Abschluss..."
      $buildMutex.WaitOne() | Out-Null
      $buildMutexAcquired = $true
    }
  }
  catch [System.Threading.AbandonedMutexException] {
    $buildMutexAcquired = $true
    Write-Host "Eine vorherige Build-Instanz wurde unerwartet beendet. Fahre mit dem Build fort..."
  }

  Push-Location $root
  $locationPushed = $true

  Invoke-Checked "npm.cmd" @("ci")

  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $runtimeDir = Join-Path $root "src-tauri\resources\runtime"
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  Copy-Item -Force $nodePath (Join-Path $runtimeDir "node.exe")

  Invoke-Checked "npm.cmd" @("ci", "--prefix", "companion", "--omit=dev")

  $sttEnv = Join-Path $root ".build-envs\stt"
  $ttsEnv = Join-Path $root ".build-envs\tts"
  Invoke-Checked "python" @("-m", "venv", $sttEnv)
  Invoke-Checked "python" @("-m", "venv", $ttsEnv)
  $sttPython = Join-Path $sttEnv "Scripts\python.exe"
  $ttsPython = Join-Path $ttsEnv "Scripts\python.exe"

  Invoke-Checked $sttPython @("-m", "pip", "install", "-r", "local-stt\requirements.txt", "pyinstaller")
  Invoke-Checked $sttPython @(
    "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "local-stt",
    "--distpath", "local-stt\dist", "--workpath", "local-stt\build",
    "--collect-all", "faster_whisper", "--collect-all", "ctranslate2", "--collect-all", "av",
    "--collect-all", "tokenizers", "--collect-all", "huggingface_hub", "local-stt\server.py"
  )

  Invoke-Checked $ttsPython @("-m", "pip", "install", "-r", "local-tts\requirements.txt", "pyinstaller")
  Invoke-Checked $ttsPython @("-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "local-tts",
    "--distpath", "local-tts\dist", "--workpath", "local-tts\build",
    "--collect-all", "piper", "--collect-all", "onnxruntime", "local-tts\desktop_server.py")

  Invoke-Checked "npm.cmd" @("run", "tauri:build")
}
catch {
  Write-Host ""
  Write-Host "Windows-Installer-Build fehlgeschlagen:" -ForegroundColor Red
  Write-Host $_ -ForegroundColor Red
  exit 1
}
finally {
  if ($locationPushed) {
    Pop-Location
  }
  if ($buildMutexAcquired) {
    $buildMutex.ReleaseMutex()
  }
  $buildMutex.Dispose()
}

Write-Host ""
Write-Host "Windows-Installer erfolgreich erstellt:"
Write-Host (Join-Path $root "src-tauri\target\release\bundle")
