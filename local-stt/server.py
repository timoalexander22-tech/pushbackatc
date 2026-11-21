from __future__ import annotations

import io
import json
import gc
import os
import subprocess
import threading
import time
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
HOST = "127.0.0.1"
PORT = int(os.environ.get("VGC_LOCAL_STT_PORT", "8788"))
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
ALLOWED_MODELS = {"base", "base.en", "small", "small.en"}
INITIAL_PROMPT = (
    "Pilot talking to airport ground crew on headset: pushback, facing north, "
    "south, east, west, brakes released, parking brake set, starting engines "
    "one and two, ground power, chocks, doors."
)
MODEL_LOCK = threading.Lock()
LOADED_MODEL = None
LOADED_MODEL_NAME = None
LOADED_DEVICE = None
LAST_DEVICE_INFO = {"device": "cpu", "reason": "Not loaded"}
FORCE_CPU = False


def available_vram() -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,memory.free",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=3,
        )
        values = [
            (int(index.strip()), int(free.strip()))
            for line in result.stdout.splitlines()
            if line.strip()
            for index, free in [line.split(",", 1)]
        ]
        return max(values, key=lambda value: value[1]) if values else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def choose_device(
    model_name: str,
    preferred: str,
    vram: tuple[int, int] | None,
) -> tuple[str, str, str]:
    if preferred == "cpu":
        return "cpu", "int8", "CPU selected"
    if preferred not in {"auto", "cuda"}:
        return "cpu", "int8", f"Unknown device preference {preferred}; using CPU"
    if vram is None:
        return "cpu", "int8", "NVIDIA GPU or nvidia-smi unavailable; using CPU"

    try:
        configured_minimum = max(0, int(os.environ.get("VGC_STT_MIN_VRAM_MB", "2048")))
    except ValueError:
        configured_minimum = 2048
    model_minimum = 2560 if model_name.startswith("small") else 1536
    required_mb = max(configured_minimum, model_minimum)
    gpu_index, free_vram_mb = vram
    if free_vram_mb < required_mb:
        return (
            "cpu",
            "int8",
            f"Only {free_vram_mb} MB VRAM free; {required_mb} MB required for {model_name}; using CPU",
        )
    return (
        f"cuda:{gpu_index}",
        "int8_float16",
        f"{free_vram_mb} MB VRAM free; GPU threshold {required_mb} MB met",
    )


def parse_multipart(content_type: str, body: bytes) -> dict[str, bytes]:
    envelope = (
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("ascii")
        + body
    )
    message = BytesParser(policy=policy.default).parsebytes(envelope)
    if not message.is_multipart():
        raise ValueError("Expected multipart/form-data.")
    fields: dict[str, bytes] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        fields[name] = payload
    return fields


def load_model(model_name: str):
    global LOADED_MODEL, LOADED_MODEL_NAME, LOADED_DEVICE, LAST_DEVICE_INFO

    if model_name not in ALLOWED_MODELS:
        raise ValueError(
            f"Unsupported local model '{model_name}'. "
            "Choose base, base.en, small, or small.en."
        )

    if LOADED_MODEL is not None and LOADED_MODEL_NAME == model_name:
        return LOADED_MODEL

    from faster_whisper import WhisperModel

    preferred = "cpu" if FORCE_CPU else os.environ.get("VGC_STT_DEVICE", "cpu").lower()
    vram = available_vram()
    device, compute_type, reason = choose_device(model_name, preferred, vram)
    print(
        f"[local-stt] loading model={model_name} device={device} "
        f"compute={compute_type}: {reason}",
        flush=True,
    )

    try:
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
    except Exception as error:
        if not device.startswith("cuda"):
            raise
        reason = f"GPU model load failed ({type(error).__name__}); falling back to CPU int8"
        print(f"[local-stt] {reason}", flush=True)
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        device = "cpu"
        compute_type = "int8"

    LOADED_MODEL = model
    LOADED_MODEL_NAME = model_name
    LOADED_DEVICE = device
    LAST_DEVICE_INFO = {
        "device": device,
        "compute_type": compute_type,
        "reason": reason,
        "free_vram_mb": vram[1] if vram else None,
    }
    return model


def transcribe(model, file_bytes: bytes, language: str, prompt: str):
    return model.transcribe(
        io.BytesIO(file_bytes),
        language=language,
        initial_prompt=prompt,
        beam_size=5,
        condition_on_previous_text=False,
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "PushbackATC-LocalSTT/1.0"

    def log_message(self, _format: str, *_args) -> None:
        return

    def respond(self, status: int, payload: dict) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path != "/health":
            self.respond(404, {"error": "Not found"})
            return
        self.respond(
            200,
            {
                "ok": True,
                "loaded_model": LOADED_MODEL_NAME,
                "device": LAST_DEVICE_INFO,
            },
        )

    def do_POST(self) -> None:
        global FORCE_CPU, LOADED_MODEL
        if self.path != "/v1/audio/transcriptions":
            self.respond(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_UPLOAD_BYTES + 1024 * 1024:
                self.respond(413, {"error": "Audio upload is empty or too large."})
                return
            fields = parse_multipart(
                self.headers.get("Content-Type", ""),
                self.rfile.read(length),
            )
            file_bytes = fields.get("file", b"")
            if not file_bytes or len(file_bytes) > MAX_UPLOAD_BYTES:
                self.respond(400, {"error": "Missing audio file or audio upload exceeds 8 MB."})
                return
            model_name = (
                fields.get("model", b"base.en").decode("utf-8", "replace").strip()
            )
            language = (
                fields.get("language", b"en").decode("utf-8", "replace").strip() or "en"
            )
            prompt = fields.get("prompt", INITIAL_PROMPT.encode()).decode(
                "utf-8", "replace"
            )
            if model_name not in ALLOWED_MODELS:
                self.respond(
                    400,
                    {
                        "error": f"Unsupported model '{model_name}'. "
                        "Choose base, base.en, small, or small.en."
                    },
                )
                return

            started = time.monotonic()
            with MODEL_LOCK:
                model = load_model(model_name)
                try:
                    segments, _info = transcribe(model, file_bytes, language, prompt)
                except Exception as error:
                    if not (
                        str(LOADED_DEVICE).startswith("cuda")
                        and "out of memory" in str(error).lower()
                    ):
                        raise
                    print(
                        "[local-stt] GPU ran out of VRAM during transcription; "
                        "retrying on CPU int8 for subsequent requests",
                        flush=True,
                    )
                    FORCE_CPU = True
                    LOADED_MODEL = None
                    model = None
                    gc.collect()
                    model = load_model(model_name)
                    segments, _info = transcribe(model, file_bytes, language, prompt)
                text = " ".join(segment.text.strip() for segment in segments).strip()
                elapsed_ms = round((time.monotonic() - started) * 1000)
                device = LOADED_DEVICE
            print(
                f"[local-stt] transcription model={model_name} device={device} "
                f"duration_ms={elapsed_ms} audio_bytes={len(file_bytes)}",
                flush=True,
            )
            self.respond(200, {"text": text})
        except ValueError as error:
            self.respond(400, {"error": str(error)})
        except Exception as error:
            elapsed_ms = round((time.monotonic() - started) * 1000) if "started" in locals() else 0
            print(
                f"[local-stt] transcription failed "
                f"model={locals().get('model_name', 'unknown')} "
                f"duration_ms={elapsed_ms} error={type(error).__name__}: {error}",
                flush=True,
            )
            self.respond(
                500,
                {"error": f"Local transcription failed: {type(error).__name__}: {error}"},
            )


if __name__ == "__main__":
    print(f"[local-stt] Listening only on http://{HOST}:{PORT}", flush=True)
    print("[local-stt] Allowed models: base, base.en, small, small.en", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
