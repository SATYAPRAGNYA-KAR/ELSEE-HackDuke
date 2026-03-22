"""
Dev-only: receive query.wav from the mobile app and write it next to brain.py (repo root).

Set ENABLE_DEV_FILE_SYNC=1 when running the API on the machine where you run brain.py.
Point EXPO_PUBLIC_BACKEND_URL at that machine (e.g. http://192.168.1.5:8000).
"""

import os
from pathlib import Path

from fastapi import APIRouter, File, Header, HTTPException, UploadFile

router = APIRouter()

# backend/routers/dev_sync.py -> parent x3 = repo root (elsee/)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _query_wav_path() -> Path:
    override = os.getenv("QUERY_WAV_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return _REPO_ROOT / "query.wav"


def _sync_enabled() -> bool:
    return os.getenv("ENABLE_DEV_FILE_SYNC", "").lower() in ("1", "true", "yes")


@router.post("/dev/query-wav")
async def save_query_wav(
    file: UploadFile = File(...),
    frame: UploadFile | None = File(None),
    x_dev_sync_key: str | None = Header(None, alias="X-Dev-Sync-Key"),
):
    if not _sync_enabled():
        raise HTTPException(status_code=404, detail="Not found")

    secret = os.getenv("DEV_SYNC_SECRET", "").strip()
    if secret and x_dev_sync_key != secret:
        raise HTTPException(status_code=403, detail="Invalid X-Dev-Sync-Key")

    target = _query_wav_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    target.write_bytes(data)
    out: dict = {"ok": True, "path": str(target), "bytes": len(data)}

    if frame is not None:
        jpg = await frame.read()
        if jpg:
            jpath = _REPO_ROOT / "test.jpg"
            jpath.write_bytes(jpg)
            out["frame_path"] = str(jpath)
            out["frame_bytes"] = len(jpg)

    return out
