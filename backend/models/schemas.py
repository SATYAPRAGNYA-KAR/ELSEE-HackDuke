"""Pydantic schemas for SeeForMe API."""

from typing import List, Optional
from pydantic import BaseModel


class ObstacleItem(BaseModel):
    label: str
    confidence: float
    bbox: List[int]
    position: str          # left / center / right
    depth_score: float
    near: bool


class QueryRequest(BaseModel):
    audio_b64: Optional[str] = None       # base64 WAV audio
    text_query: Optional[str] = None      # alternative text input
    frame_b64: Optional[str] = None       # base64 JPEG frame
    obstacles: Optional[List[ObstacleItem]] = []


class QueryResponse(BaseModel):
    query: str
    text_response: str
    audio_response_b64: Optional[str] = None   # base64 MP3 from ElevenLabs
    annotated_frame_b64: Optional[str] = None  # frame with Gemini annotations
    elapsed_sec: float


class SceneRequest(BaseModel):
    frame_b64: str   # base64 JPEG frame


class SceneResponse(BaseModel):
    description: str
    ocr_text: str
    objects_detected: List[str]
    summary: str
    audio_response_b64: Optional[str] = None
    elapsed_sec: float
