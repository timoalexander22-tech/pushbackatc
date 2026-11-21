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

## Speech providers (local development)

Speech-to-text and online text-to-speech call providers directly from server functions; they do not require the Lovable AI gateway. Configure provider credentials in the environment of the process running `npm run dev`. Never put API keys in browser code or commit them.

OpenAI speech-to-text:

```sh
export VGC_STT_PROVIDER=openai
export OPENAI_API_KEY="<your OpenAI API key>"
npm run dev
```

In Windows PowerShell:

```powershell
$env:VGC_STT_PROVIDER = "openai"
$env:OPENAI_API_KEY = "<your OpenAI API key>"
npm run dev
```

Groq speech-to-text:

```sh
export VGC_STT_PROVIDER=groq
export GROQ_API_KEY="<your Groq API key>"
npm run dev
```

In Windows PowerShell:

```powershell
$env:VGC_STT_PROVIDER = "groq"
$env:GROQ_API_KEY = "<your Groq API key>"
npm run dev
```

For a custom OpenAI-compatible transcription service, set `VGC_STT_PROVIDER=openai-compatible`, `VGC_STT_BASE_URL` to its `/v1` API base, and optionally `VGC_STT_API_KEY` and `VGC_STT_MODEL`. The service must implement `/audio/transcriptions`.

### Local faster-whisper (CPU INT8, optional NVIDIA GPU)

The local sidecar implements the OpenAI-compatible transcription endpoint without sending audio to a cloud provider. Install Python 3.10-3.12, then start `local-stt/start.bat` on Windows (or `local-stt/start.sh` on Linux/macOS). On first run it creates a virtual environment and installs `faster-whisper` with a compatible PyAV version; the selected model downloads when first used. The server binds to `127.0.0.1` only.

In a second terminal, start the app against the sidecar:

```powershell
$env:VGC_STT_PROVIDER = "faster-whisper"
$env:VGC_STT_MODEL = "base.en"
npm run dev
```

In **Settings → STT-Modell**, enter `base.en` or `small.en` to compare them; leave the field blank to use `VGC_STT_MODEL`. The model downloads on its first transcription. Only push-to-talk recordings are sent to the local service. Its terminal logs the model, selected device, processing duration, and audio byte count, not the transcript.

CPU INT8 is the default. To allow GPU acceleration, set `VGC_STT_DEVICE=auto` in the terminal used to start the local sidecar. It checks free NVIDIA VRAM with `nvidia-smi`: it requires at least 1,536 MB for `base` or 2,560 MB for `small`, and never less than `VGC_STT_MIN_VRAM_MB` (default 2,048 MB). If VRAM is insufficient or no NVIDIA GPU is detected, it uses CPU INT8. If GPU model loading fails, it retries on CPU INT8. GPU use also requires a compatible NVIDIA driver and CUDA/cuDNN runtime for CTranslate2; otherwise it falls back to CPU. The first call can be slow while model files download and load.

Online text-to-speech uses OpenAI when enabled in the app settings. Set `OPENAI_API_KEY` and optionally `VGC_TTS_MODEL` (default `tts-1`) and `VGC_TTS_VOICE` (default `alloy`). Crew speech defaults to the built-in device voice, so no TTS model or API key is required unless you enable natural online voices. A custom OpenAI-compatible service can instead use `VGC_TTS_PROVIDER=openai-compatible`, `VGC_TTS_BASE_URL`, and optionally `VGC_TTS_API_KEY`, `VGC_TTS_MODEL`, and `VGC_TTS_VOICE`; it must implement `/audio/speech`. Use `VGC_STT_PROVIDER=disabled` or `VGC_TTS_PROVIDER=disabled` to disable either service and use the built-in device voice where applicable.

On Windows PowerShell, each `$env:` setting lasts only for that terminal session; restart the dev server after changing providers. A `localhost` model endpoint is reached from the machine running the app server (in Codespaces, that is the Codespace, not the Windows host).

The **STT-Modell** field overrides `VGC_STT_MODEL` for radio recognition. For a local Piper crew voice, start `local-tts/start.bat` on Windows (Python 3.12 required) or `local-tts/start.sh` on Linux/macOS (Python 3.14 or 3.12); the script installs Piper, downloads the default `en_US-lessac-medium` voice on first run, and serves it on `127.0.0.1:5000`. Set `VGC_TTS_PROVIDER=piper` in the terminal that starts the app, and enter `en_US-lessac-medium` in **TTS-Modell**. To use another Piper voice, set `VGC_PIPER_VOICE` before starting the sidecar and enter the same voice name in Settings. The model field uses only the configured local service and never falls back to OpenAI or the Windows voice. Crew audio is routed to the selected output device; if routing fails, playback stops instead of using the wrong device. With no TTS model, the Online-TTS toggle is optional; the built-in Windows voice uses the Windows/browser default output and cannot be routed by the browser's output-device selector.

The local Piper service exposes its own HTTP API and does not require an API key. The default voice is distributed separately from the Piper software; review its voice-card license before redistribution. Piper is GPL-3.0-licensed. For a custom OpenAI-compatible TTS service instead, use `VGC_TTS_PROVIDER=openai-compatible`, set `VGC_TTS_BASE_URL`, and enter its model ID in Settings.
