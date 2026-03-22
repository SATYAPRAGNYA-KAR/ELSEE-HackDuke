"""
Minimal dev server: POST /api/dev/query-wav → writes elsee/query.wav (same path brain.py uses).

Does not import the full backend (avoids heavy deps on Python 3.14).

Run:  uvicorn dev_sync_server:app --host 0.0.0.0 --port 8000 --reload
Or:   ./backend/run_dev_sync.sh  (uses this when USE_MINIMAL_DEV_SYNC=1)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parent
QUERY_WAV = REPO_ROOT / "query.wav"


def _enabled() -> bool:
    return os.getenv("ENABLE_DEV_FILE_SYNC", "").lower() in ("1", "true", "yes")


app = FastAPI(title="elsee dev sync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/dev/query-wav")
async def save_query_wav(
    file: UploadFile = File(...),
    frame: UploadFile | None = File(None),
    x_dev_sync_key: str | None = Header(None, alias="X-Dev-Sync-Key"),
):
    if not _enabled():
        raise HTTPException(status_code=404, detail="Not found")

    secret = os.getenv("DEV_SYNC_SECRET", "").strip()
    if secret and x_dev_sync_key != secret:
        raise HTTPException(status_code=403, detail="Invalid X-Dev-Sync-Key")

    override = os.getenv("QUERY_WAV_PATH", "").strip()
    target = Path(override).expanduser().resolve() if override else QUERY_WAV
    target.parent.mkdir(parents=True, exist_ok=True)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    target.write_bytes(data)
    out: dict = {"ok": True, "path": str(target), "bytes": len(data)}

    if frame is not None:
        jpg = await frame.read()
        if jpg:
            jpath = REPO_ROOT / "test.jpg"
            jpath.write_bytes(jpg)
            out["frame_path"] = str(jpath)
            out["frame_bytes"] = len(jpg)

    return out
