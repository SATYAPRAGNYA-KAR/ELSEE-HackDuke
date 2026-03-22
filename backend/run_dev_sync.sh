#!/usr/bin/env bash
# Run API so the Expo app can POST to /api/dev/query-wav → elsee/query.wav for brain.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/venv/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/venv/bin/activate"
fi

export ENABLE_DEV_FILE_SYNC="${ENABLE_DEV_FILE_SYNC:-1}"
export DEV_SYNC_SECRET="${DEV_SYNC_SECRET:-dev-local-secret}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"

# Minimal server (dev_sync_server.py) — only needs: fastapi uvicorn python-multipart python-dotenv
pip install -q fastapi "uvicorn[standard]" python-multipart python-dotenv 2>/dev/null || true

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[[ -z "${LAN_IP}" ]] && LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
[[ -z "${LAN_IP}" ]] && LAN_IP="127.0.0.1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dev sync — writes: $ROOT/query.wav"
echo "  mobile/.env (use DEV_SYNC_URL so prod BACKEND_URL can stay as-is):"
echo "    EXPO_PUBLIC_DEV_SYNC_URL=http://${LAN_IP}:8000"
echo "    EXPO_PUBLIC_DEV_SYNC_SECRET=${DEV_SYNC_SECRET}"
echo "  Same Wi‑Fi as this Mac → Ask tab → record."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exec uvicorn dev_sync_server:app --host 0.0.0.0 --port 8000 --reload
