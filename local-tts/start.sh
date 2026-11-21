#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

PYTHON=""
for candidate in python3.14 python3.12; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "Python 3.14 or 3.12 is required. Install it from https://www.python.org/downloads/." >&2
  exit 1
fi

if [ ! -x .venv/bin/python ] || ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  "$PYTHON" -m venv --clear .venv || {
    echo "Could not create a Python virtual environment. On Debian/Ubuntu, install the matching python3-venv package." >&2
    exit 1
  }
fi

VOICE="${VGC_PIPER_VOICE:-en_US-lessac-medium}"
if ! .venv/bin/python -c "import piper.http_server" >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt
fi

if [ ! -f "voices/${VOICE}.onnx" ] || [ ! -f "voices/${VOICE}.onnx.json" ]; then
  .venv/bin/python -m piper.download_voices "$VOICE" --data-dir voices
fi

exec .venv/bin/python -m piper.http_server -m "$VOICE" --data-dir voices --host 127.0.0.1 --port 5000
