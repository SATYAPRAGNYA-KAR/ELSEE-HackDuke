"""
ElevenLabs Text-to-Speech Service
Converts Gemini text responses to natural voice audio.
"""

import base64
import logging
import os

import httpx

log = logging.getLogger("seefore.elevenlabs")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"


async def text_to_speech(text: str, voice_id: str = None) -> str:
    """
    Convert text to speech via ElevenLabs API.
    Returns base64-encoded MP3 audio.
    """
    if not ELEVENLABS_API_KEY:
        log.warning("ElevenLabs API key not set — skipping TTS")
        return ""

    voice = voice_id or ELEVENLABS_VOICE_ID
    url = f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice}"

    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2",   # Lowest latency model
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            audio_bytes = response.content
            return base64.b64encode(audio_bytes).decode()
    except httpx.HTTPStatusError as e:
        log.error(f"ElevenLabs HTTP error: {e.response.status_code} — {e.response.text}")
        return ""
    except Exception as e:
        log.error(f"ElevenLabs error: {e}")
        return ""


def get_available_voices() -> list:
    """Fetch available ElevenLabs voices (sync, for setup)."""
    import requests
    headers = {"xi-api-key": ELEVENLABS_API_KEY}
    resp = requests.get(f"{ELEVENLABS_BASE_URL}/voices", headers=headers)
    if resp.ok:
        return [{"id": v["voice_id"], "name": v["name"]} for v in resp.json().get("voices", [])]
    return []
