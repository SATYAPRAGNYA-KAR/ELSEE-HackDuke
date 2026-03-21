"""
Query Router
============
POST /api/query
  - Receives: audio (base64 WAV), frame (base64 JPEG), obstacle context
  - STT via Gemini (or Google Speech-to-Text)
  - Scene analysis + OCR via Gemini Vision
  - TTS via ElevenLabs
  - Returns: text response + audio response (base64) + annotated frame
"""

import base64
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from middleware.auth0 import get_current_user
from models.schemas import QueryRequest, QueryResponse
from services.gemini_client import analyze_frame_with_query, speech_to_text
from services.elevenlabs_client import text_to_speech
from services.mongodb import log_query_session
from services.snowflake_client import log_event

log = logging.getLogger("seefore.query")
router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def handle_query(
    request: QueryRequest,
    user: dict = Depends(get_current_user),
):
    """
    Full pipeline:
    audio → STT → Gemini Vision (frame + text) → ElevenLabs TTS
    """
    t0 = time.time()

    # ── 1. Speech-to-Text ────────────────────────────────────────────────────
    if request.audio_b64:
        transcribed_query = await speech_to_text(request.audio_b64)
    elif request.text_query:
        transcribed_query = request.text_query
    else:
        raise HTTPException(status_code=400, detail="Provide audio_b64 or text_query")

    log.info(f"Query transcribed: '{transcribed_query}'")

    # ── 2. Build obstacle context string ─────────────────────────────────────
    obstacle_context = _format_obstacles(request.obstacles or [])

    # ── 3. Gemini Vision Analysis ─────────────────────────────────────────────
    gemini_result = await analyze_frame_with_query(
        frame_b64=request.frame_b64,
        query=transcribed_query,
        obstacle_context=obstacle_context,
    )

    text_response = gemini_result["text"]
    annotated_frame_b64 = gemini_result.get("annotated_frame_b64", request.frame_b64)

    # ── 4. ElevenLabs TTS ─────────────────────────────────────────────────────
    audio_response_b64 = await text_to_speech(text_response)

    elapsed = round(time.time() - t0, 3)
    log.info(f"Query pipeline complete in {elapsed}s")

    # ── 5. Log to MongoDB + Snowflake ─────────────────────────────────────────
    session_doc = {
        "user_id": user["sub"],
        "query": transcribed_query,
        "response": text_response,
        "obstacle_context": obstacle_context,
        "elapsed_sec": elapsed,
        "timestamp": time.time(),
    }
    await log_query_session(session_doc)
    log_event("query", {"user_id": user["sub"], "elapsed_sec": elapsed})

    return QueryResponse(
        query=transcribed_query,
        text_response=text_response,
        audio_response_b64=audio_response_b64,
        annotated_frame_b64=annotated_frame_b64,
        elapsed_sec=elapsed,
    )


def _format_obstacles(obstacles: list) -> str:
    if not obstacles:
        return "No obstacles currently detected."
    parts = []
    for obs in obstacles:
        label = obs.get("label", "object")
        pos = obs.get("position", "ahead")
        depth = obs.get("depth_score", 0)
        dist = "very close" if depth > 0.85 else ("nearby" if depth > 0.65 else "in the distance")
        parts.append(f"a {label} {dist} on the {pos}")
    return "Currently detected: " + ", ".join(parts) + "."
