#!/usr/bin/env python3
"""Insert default app_config in MongoDB (run once). Loads elsee/.env and backend/.env."""

import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "backend" / ".env")

# FastAPI uses MONGODB_URI; brain.py uses MONGO_URI — accept either
uri = (os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or "").strip()
db_name = (os.getenv("MONGODB_DB_NAME") or os.getenv("MONGO_DB_NAME") or "seefore").strip()

if not uri:
    print("Set MONGODB_URI or MONGO_URI in elsee/.env (or backend/.env)")
    raise SystemExit(1)

client = MongoClient(uri)
db = client[db_name]
db["app_config"].update_one(
    {"_id": "default"},
    {
        "$set": {
            "api_base_url": os.getenv("PUBLIC_API_BASE_URL", "https://api.seefore.tech"),
            "ws_url": os.getenv("PUBLIC_WS_URL", "wss://api.seefore.tech"),
            "dev_sync_url": os.getenv("PUBLIC_DEV_SYNC_URL", ""),
        }
    },
    upsert=True,
)
print(f"✅ app_config seeded in {db_name}.app_config (_id: default)")
