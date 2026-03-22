"""
Public config served from MongoDB (`app_config` doc `_id: 'default'`) + env fallbacks.
Mobile uses GET /api/public/config — never embed MONGODB_URI in the app.
"""

import os

from fastapi import APIRouter

from services.mongodb import get_app_config

router = APIRouter()


@router.get("/public/config")
async def read_public_config():
    mongo_cfg = await get_app_config()

    api_base = (mongo_cfg.get("api_base_url") or os.getenv("PUBLIC_API_BASE_URL") or "").strip()
    ws_url = (mongo_cfg.get("ws_url") or os.getenv("PUBLIC_WS_URL") or "").strip()
    dev_sync = (mongo_cfg.get("dev_sync_url") or os.getenv("PUBLIC_DEV_SYNC_URL") or "").strip()

    return {
        "api_base_url": api_base,
        "ws_url": ws_url,
        "dev_sync_url": dev_sync,
        "from_mongodb": bool(mongo_cfg),
    }
