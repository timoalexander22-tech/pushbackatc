# Pushbackatc

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1bddbcae-4e9d-4f22-8416-07ddae033088).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Windows-Desktop-App

The Windows edition is a Tauri desktop app. The installer bundles the app server,
SimConnect companion, Whisper/Piper service executables, and Node.js runtime.
It starts the companion and local speech services automatically, using `base.en`
for STT and `en_US-lessac-medium` for TTS by default. Whisper and Piper voice
models download locally on first launch/recognition; later runs can work offline.
The installer bootstraps WebView2 when needed.

To build the unsigned Windows installers on Windows 10/11 x64, install Node.js 22,
Python 3.12, Rust stable, and the Microsoft C++ build tools, then run:

```powershell
./build-windows-installer.bat
```

The MSI and NSIS installers are written under `src-tauri/target/release/bundle/`.
No Node.js or Python installation is needed on users' PCs after installing the app.
The batch file keeps its window open and displays build errors.

## Speech providers (local development)

Speech-to-text and text-to-speech run on local server processes. Neither service sends audio or text to a cloud provider, and no API key is needed. After the app dependencies, Python packages, and speech models have been installed/downloaded once, the training and speech features work without an internet connection. The sidecar start scripts skip package installation when their local dependencies are already present.

For one manually managed Python environment, install both speech services with
`py -3.12 -m pip install -r requirements.txt`. The Windows desktop build keeps
the STT and TTS packaging environments isolated.

SimBrief import, the tablet internet relay, and downloading app/companion updates require internet only when those optional features are used.

### Local faster-whisper (CPU INT8, optional NVIDIA GPU)

The local sidecar implements the transcription endpoint without sending audio to a cloud provider. Install Python 3.10-3.12, then start `local-stt/start.bat` on Windows (or `local-stt/start.sh` on Linux/macOS). On first run it creates a virtual environment and installs `faster-whisper` with a compatible PyAV version; the selected model downloads when first used. Let that first download finish before disconnecting from the internet. The server binds to `127.0.0.1` only.

In a second terminal, start the app against the sidecar:

```powershell
$env:VGC_STT_PROVIDER = "faster-whisper"
$env:VGC_STT_MODEL = "base.en"
npm run dev
```

In **Settings → STT-Modell**, enter `base.en` or `small.en` to compare them; leave the field blank to use `VGC_STT_MODEL`. The model downloads on its first transcription. Only push-to-talk recordings are sent to the local service. Its terminal logs the model, selected device, processing duration, and audio byte count, not the transcript.

CPU INT8 is the default. To allow GPU acceleration, set `VGC_STT_DEVICE=auto` in the terminal used to start the local sidecar. It checks free NVIDIA VRAM with `nvidia-smi`: it requires at least 1,536 MB for `base` or 2,560 MB for `small`, and never less than `VGC_STT_MIN_VRAM_MB` (default 2,048 MB). If VRAM is insufficient or no NVIDIA GPU is detected, it uses CPU INT8. If GPU model loading fails, it retries on CPU INT8. GPU use also requires a compatible NVIDIA driver and CUDA/cuDNN runtime for CTranslate2; otherwise it falls back to CPU. The first call can be slow while model files download and load.

Crew speech uses the local Piper service when a TTS model is configured. With no TTS model, it uses the built-in device voice. No API key or cloud TTS provider is required.

On Windows PowerShell, each `$env:` setting lasts only for that terminal session; restart the dev server after changing providers. A `localhost` model endpoint is reached from the machine running the app server (in Codespaces, that is the Codespace, not the Windows host).

The **STT-Modell** field overrides `VGC_STT_MODEL` for radio recognition. For a local Piper crew voice, start `local-tts/start.bat` on Windows (Python 3.12 required) or `local-tts/start.sh` on Linux/macOS (Python 3.14 or 3.12); the script installs Piper, downloads the default `en_US-lessac-medium` voice on first run, and serves it on `127.0.0.1:5000`. Set `VGC_TTS_PROVIDER=piper` in the terminal that starts the app, and enter `en_US-lessac-medium` in **TTS-Modell**. To use another Piper voice, set `VGC_PIPER_VOICE` before starting the sidecar and enter the same voice name in Settings. The model field uses only the local Piper service and never falls back to a cloud or Windows voice. Crew audio is routed to the selected output device; if routing fails, playback stops instead of using the wrong device. With no TTS model, the built-in Windows voice uses the Windows/browser default output and cannot be routed by the browser's output-device selector.

The local Piper service exposes its own HTTP API and does not require an API key. The default voice is distributed separately from the Piper software; review its voice-card license before redistribution. Piper is GPL-3.0-licensed.
