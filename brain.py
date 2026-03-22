import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from elevenlabs.client import ElevenLabs
from elevenlabs import stream

load_dotenv()

# Repo root (directory containing this file)
SCRIPT_DIR = Path(__file__).resolve().parent
# Mobile app saves recordings as query.wav — copy that file here to run the brain locally
QUERY_WAV = SCRIPT_DIR / "query.wav"
TEST_IMAGE = SCRIPT_DIR / "test.jpg"

# API keys: prefer server-style names; fall back to Expo public key from .env
GEMINI_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("EXPO_PUBLIC_GEMINI_API_KEY")
)
ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")

gen_client = genai.Client(api_key=GEMINI_KEY) if GEMINI_KEY else None
eleven_client = ElevenLabs(api_key=ELEVEN_KEY) if ELEVEN_KEY else None

_db = None
if MONGO_URI:
    try:
        from pymongo import MongoClient

        _db = MongoClient(MONGO_URI)["elsee_db"]["logs"]
    except Exception:
        _db = None


def _detect_audio_mime(sample: bytes) -> str:
    """Guess MIME from magic bytes (phone may save AAC as query.wav)."""
    if len(sample) < 12:
        return "audio/wav"
    if sample[:4] == b"RIFF" and sample[8:12] == b"WAVE":
        return "audio/wav"
    if sample[:4] == b"ftyp":
        return "audio/mp4"
    if sample[:3] == b"ID3" or (sample[0] == 0xFF and (sample[1] & 0xE0) == 0xE0):
        return "audio/mpeg"
    return "audio/wav"


def process_elsee_request(image_path: str | Path, audio_path: str | Path) -> None:
    """
    Core pipeline: image + spoken query (query.wav from the app) → Gemini → optional log → ElevenLabs.
    """
    if not gen_client:
        print("❌ Set GEMINI_API_KEY, GOOGLE_API_KEY, or EXPO_PUBLIC_GEMINI_API_KEY in .env")
        return

    image_path = Path(image_path)
    audio_path = Path(audio_path)

    if not audio_path.is_file():
        print(f"❌ Audio not found: {audio_path}")
        print(f"   Copy the recording from the app to: {QUERY_WAV}")
        return
    if not image_path.is_file():
        print(f"❌ Image not found: {image_path}")
        return

    try:
        print("--- 🧠 elsee is thinking... ---")

        with open(image_path, "rb") as f:
            image_bytes = f.read()
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

        mime = _detect_audio_mime(audio_bytes[:32])
        print(f"   Audio: {audio_path.name} ({mime}, {len(audio_bytes)} bytes)")

        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime)

        response = gen_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                "Context: You are the eyes for a blind person. "
                "Task: Answer the user's spoken question based on the image. "
                "Constraint: Be concise, focus on immediate hazards, and keep it under 40 words.",
                image_part,
                audio_part,
            ],
        )

        ai_response_text = response.text
        print(f"Response: {ai_response_text}")

        if _db is not None:
            try:
                _db.insert_one(
                    {
                        "mode": "multimodal_audio",
                        "ai_text": ai_response_text,
                        "audio_file": str(audio_path.name),
                        "timestamp": time.time(),
                    }
                )
                print("✅ Logged to MongoDB.")
            except Exception as log_err:
                print(f"⚠️  MongoDB log skipped: {log_err}")

        if eleven_client:
            print("--- 🗣️ speaking... ---")
            audio_stream = eleven_client.text_to_speech.stream(
                text=ai_response_text,
                voice_id="JBFqnCBsd6RMkjVDRZzb",
                model_id="eleven_turbo_v2_5",
            )
            stream(audio_stream)
        else:
            print("⚠️  ELEVENLABS_API_KEY not set; skipping TTS.")

    except Exception as e:
        print(f"❌ Error in elsee brain: {e}")


if __name__ == "__main__":
    img = TEST_IMAGE
    aud = QUERY_WAV

    if aud.is_file() and img.is_file():
        process_elsee_request(img, aud)
    else:
        print("\n⚠️  FILES MISSING — brain.py needs both of these next to itself:")
        print(f"   Repo folder: {SCRIPT_DIR}")
        print()
        if not aud.is_file():
            print(f"  1) AUDIO  → {aud}")
            print("     Run ./backend/run_dev_sync.sh on this Mac, set in mobile/.env:")
            print("       EXPO_PUBLIC_DEV_SYNC_URL=http://<this-mac-lan-ip>:8000")
            print("       EXPO_PUBLIC_DEV_SYNC_SECRET=<same as DEV_SYNC_SECRET>")
            print("     Record in Ask — app POSTs audio (+ camera frame) to /api/dev/query-wav.")
            print("     Do not use api.seefore.tech for sync; it never writes to your laptop.")
            print()
        if not img.is_file():
            print(f"  2) IMAGE  → {img}")
            print("     With dev sync, test.jpg is written when you record (same POST as query.wav).")
            print("     Or add any JPEG manually for testing.")
            print()
