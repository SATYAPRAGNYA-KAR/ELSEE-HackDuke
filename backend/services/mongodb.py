"""
MongoDB Atlas Service
Logs obstacle sessions and query history for persistence and recall.
"""

import logging
import os
from datetime import datetime
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("seefore.mongodb")

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "seefore")

_client: Optional[AsyncIOMotorClient] = None
_db = None


async def connect_mongo():
    global _client, _db
    if not MONGODB_URI:
        log.warning("MONGODB_URI not set — MongoDB logging disabled")
        return
    try:
        _client = AsyncIOMotorClient(MONGODB_URI)
        _db = _client[MONGODB_DB_NAME]
        # Ping to verify connection
        await _client.admin.command("ping")
        log.info("✅ MongoDB Atlas connected")
    except Exception as e:
        log.error(f"MongoDB connection failed: {e}")
        _client = None
        _db = None


async def close_mongo():
    global _client
    if _client:
        _client.close()
        log.info("MongoDB connection closed")


async def log_obstacle_session(data: dict):
    """Log obstacle detection frame to MongoDB."""
    if _db is None:
        return
    try:
        data["created_at"] = datetime.utcnow()
        await _db["obstacle_sessions"].insert_one(data)
    except Exception as e:
        log.error(f"MongoDB obstacle log error: {e}")


async def log_query_session(data: dict):
    """Log user query + Gemini response to MongoDB."""
    if _db is None:
        return
    try:
        data["created_at"] = datetime.utcnow()
        await _db["query_sessions"].insert_one(data)
    except Exception as e:
        log.error(f"MongoDB query log error: {e}")


async def get_recent_sessions(user_id: str, limit: int = 20) -> list:
    """Retrieve recent sessions for a user."""
    if _db is None:
        return []
    try:
        cursor = _db["query_sessions"].find(
            {"user_id": user_id},
            sort=[("created_at", -1)],
            limit=limit
        )
        docs = await cursor.to_list(length=limit)
        # Convert ObjectId to str
        for doc in docs:
            doc["_id"] = str(doc["_id"])
        return docs
    except Exception as e:
        log.error(f"MongoDB fetch error: {e}")
        return []
