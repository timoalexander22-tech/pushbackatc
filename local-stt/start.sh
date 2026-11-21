#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
if ! python -c "import av, faster_whisper" >/dev/null 2>&1; then
  python -m pip install -r requirements.txt
fi
exec python server.py
