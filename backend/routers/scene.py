"""
Scene Analysis Router
POST /api/scene — Analyze a single frame for scene description + OCR
"""

import time
import logging

from fastapi import APIRouter, Depends
from middleware.auth0 import get_current_user
from models.schemas import SceneRequest, SceneResponse
from services.gemini_client import analyze_scene_and_ocr
from services.elevenlabs_client import text_to_speech
from services.mongodb import log_query_session

log = logging.getLogger("seefore.scene")
router = APIRouter()


@router.post("/scene", response_model=SceneResponse)
async def analyze_scene(
    request: SceneRequest,
    user: dict = Depends(get_current_user),
):
    """
    Full scene analysis: description + OCR on a given frame.
    Returns structured JSON + spoken audio.
    """
    t0 = time.time()

    result = await analyze_scene_and_ocr(request.frame_b64)
    audio_b64 = await text_to_speech(result["summary"])

    elapsed = round(time.time() - t0, 3)

    await log_query_session({
        "user_id": user["sub"],
        "type": "scene_analysis",
        "scene_description": result["description"],
        "ocr_text": result["ocr_text"],
        "elapsed_sec": elapsed,
        "timestamp": time.time(),
    })

    return SceneResponse(
        description=result["description"],
        ocr_text=result["ocr_text"],
        objects_detected=result["objects_detected"],
        summary=result["summary"],
        audio_response_b64=audio_b64,
        elapsed_sec=elapsed,
    )
