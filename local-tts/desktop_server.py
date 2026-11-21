from __future__ import annotations

import os
import sys
from pathlib import Path

from piper.download_voices import download_voice
from piper.http_server import main as run_server


def main() -> None:
    data_dir = Path(os.environ.get("VGC_PIPER_DATA_DIR", Path.cwd() / "voices"))
    voice = os.environ.get("VGC_PIPER_VOICE", "en_US-lessac-medium")
    port = os.environ.get("VGC_TTS_PORT", "5000")
    data_dir.mkdir(parents=True, exist_ok=True)
    download_voice(voice, data_dir)
    sys.argv = [
        "piper-http-server",
        "--model",
        voice,
        "--data-dir",
        str(data_dir),
        "--download-dir",
        str(data_dir),
        "--host",
        "127.0.0.1",
        "--port",
        port,
    ]
    run_server()


if __name__ == "__main__":
    main()
