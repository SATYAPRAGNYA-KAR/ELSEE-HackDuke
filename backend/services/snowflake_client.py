"""
Snowflake Analytics Service
Logs usage events for analytics and LLM usage tracking.
Uses Snowflake Cortex for LLM access if needed.
"""

import logging
import os
import json
import time
from typing import Optional

log = logging.getLogger("seefore.snowflake")

SNOWFLAKE_ACCOUNT   = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER      = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD  = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_DATABASE  = os.getenv("SNOWFLAKE_DATABASE", "SEEFORE_DB")
SNOWFLAKE_SCHEMA    = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")

_conn = None


def init_snowflake():
    global _conn
    if not SNOWFLAKE_ACCOUNT:
        log.warning("Snowflake credentials not set — analytics logging disabled")
        return
    try:
        import snowflake.connector
        _conn = snowflake.connector.connect(
            account=SNOWFLAKE_ACCOUNT,
            user=SNOWFLAKE_USER,
            password=SNOWFLAKE_PASSWORD,
            warehouse=SNOWFLAKE_WAREHOUSE,
            database=SNOWFLAKE_DATABASE,
            schema=SNOWFLAKE_SCHEMA,
        )
        _ensure_tables()
        log.info("✅ Snowflake connected")
    except Exception as e:
        log.error(f"Snowflake connection failed: {e}")
        _conn = None


def _ensure_tables():
    """Create analytics tables if they don't exist."""
    if _conn is None:
        return
    ddl = """
    CREATE TABLE IF NOT EXISTS SEEFORE_EVENTS (
        EVENT_ID    VARCHAR(64) DEFAULT UUID_STRING(),
        EVENT_TYPE  VARCHAR(64),
        PAYLOAD     VARIANT,
        CREATED_AT  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
    );
    """
    try:
        with _conn.cursor() as cur:
            cur.execute(ddl)
        log.info("Snowflake tables ready")
    except Exception as e:
        log.error(f"Snowflake DDL error: {e}")


def log_event(event_type: str, payload: dict):
    """Fire-and-forget analytics event logging."""
    if _conn is None:
        return
    try:
        sql = """
        INSERT INTO SEEFORE_EVENTS (EVENT_TYPE, PAYLOAD)
        SELECT %s, PARSE_JSON(%s)
        """
        with _conn.cursor() as cur:
            cur.execute(sql, (event_type, json.dumps(payload)))
    except Exception as e:
        log.error(f"Snowflake log_event error: {e}")


def query_usage_stats(user_id: Optional[str] = None) -> list:
    """Pull usage analytics from Snowflake."""
    if _conn is None:
        return []
    try:
        where = f"WHERE PAYLOAD:user_id = '{user_id}'" if user_id else ""
        sql = f"""
        SELECT EVENT_TYPE, COUNT(*) as COUNT, MAX(CREATED_AT) as LAST_SEEN
        FROM SEEFORE_EVENTS
        {where}
        GROUP BY EVENT_TYPE
        ORDER BY COUNT DESC
        """
        with _conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            return [{"event_type": r[0], "count": r[1], "last_seen": str(r[2])} for r in rows]
    except Exception as e:
        log.error(f"Snowflake query error: {e}")
        return []
