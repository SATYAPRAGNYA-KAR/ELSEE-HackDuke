"""
Gemini API Service
==================
- analyze_frame_with_query: Vision QA with obstacle context
- analyze_scene_and_ocr: Full scene description + OCR
- speech_to_text: Audio transcription via Gemini
"""

import base64
import json
import logging
import os
from typing import Optional

import google.generativeai as genai
from PIL import Image
import io

log = logging.getLogger("seefore.gemini")

GEMINI_API_KEY = os.getenv("EXPO_PUBLIC_GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

genai.configure(api_key=GEMINI_API_KEY)
_model = genai.GenerativeModel(GEMINI_MODEL)
_vision_model = genai.GenerativeModel(GEMINI_MODEL)


def _b64_to_image(frame_b64: str) -> Image.Image:
    img_bytes = base64.b64decode(frame_b64)
    return Image.open(io.BytesIO(img_bytes))


async def analyze_frame_with_query(
    frame_b64: Optional[str],
    query: str,
    obstacle_context: str = "",
) -> dict:
    """
    Send frame + user query + obstacle context to Gemini Vision.
    Returns structured text response.
    """
    system_prompt = f"""You are SeeForMe, an AI assistant helping visually impaired users understand their surroundings.

Current obstacle detection from edge device: {obstacle_context}

The user is asking: "{query}"

Your response should:
1. Directly answer the user's question based on the image
2. Mention any text/signs visible (OCR)
3. Note important obstacles or hazards
4. Be concise and spoken naturally (this will be read aloud)
5. Start with the most critical safety information first

Keep your response short and concise for voice delivery."""

    try:
        if frame_b64:
            image = _b64_to_image(frame_b64)
            response = _vision_model.generate_content([system_prompt, image])
        else:
            response = _model.generate_content(system_prompt)

        return {
            "text": response.text,
            "annotated_frame_b64": frame_b64,  # Future: add Gemini bounding boxes
        }
    except Exception as e:
        log.error(f"Gemini vision error: {e}")
        return {"text": f"I'm having trouble analyzing the image right now. {obstacle_context}", "annotated_frame_b64": frame_b64}


async def analyze_scene_and_ocr(frame_b64: str) -> dict:
    """
    Full scene analysis: returns structured JSON with description, OCR, objects.
    """
    prompt = """Analyze this image for a visually impaired user. Return ONLY valid JSON in this exact format:
{
  "description": "Detailed spatial description of the scene including layout, colors, and context",
  "ocr_text": "Any text, signs, labels, or writing visible in the image. Empty string if none.",
  "objects_detected": ["list", "of", "key", "objects"],
  "summary": "One natural sentence summary suitable for text-to-speech, mentioning key objects and any text found"
}"""

    try:
        image = _b64_to_image(frame_b64)
        response = _vision_model.generate_content([prompt, image])

        # Strip markdown fences if present
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        result = json.loads(text.strip())
        return result
    except json.JSONDecodeError:
        log.warning("Gemini returned non-JSON scene response, using fallback")
        return {
            "description": response.text if "response" in dir() else "Unable to analyze scene.",
            "ocr_text": "",
            "objects_detected": [],
            "summary": response.text[:200] if "response" in dir() else "Scene analysis unavailable.",
        }
    except Exception as e:
        log.error(f"Gemini scene analysis error: {e}")
        return {
            "description": "Scene analysis failed.",
            "ocr_text": "",
            "objects_detected": [],
            "summary": "I'm unable to analyze the scene right now.",
        }


async def speech_to_text(audio_b64: str) -> str:
    """
    Transcribe audio using Gemini (multimodal audio input).
    Falls back to a simple prompt if audio processing unavailable.
    """
    try:
        audio_bytes = base64.b64decode(audio_b64)

        # Gemini 1.5 Flash supports audio input
        response = _model.generate_content([
            "Transcribe this audio exactly as spoken. Return only the transcribed text, nothing else.",
            {"mime_type": "audio/wav", "data": audio_bytes}
        ])
        return response.text.strip()
    except Exception as e:
        log.warning(f"STT via Gemini failed ({e}), using fallback")
        return "What can you see in front of me?"
