"""
Audio Trigger — Raspberry Pi
Listens for user voice input (press Enter to trigger),
captures audio, sends to backend for STT + Gemini processing.

For Pi: uses sounddevice + scipy for audio capture.
"""

import logging
import threading
import base64
import os
import time
import requests
import numpy as np

log = logging.getLogger("seefore.audio")

BACKEND_REST_URL = os.getenv("BACKEND_REST_URL", "http://localhost:8000")
SAMPLE_RATE = 16000
RECORD_SECONDS = 5


class AudioTrigger:
    """
    Non-blocking audio trigger.
    Runs a background thread that waits for Enter key,
    records audio, sends to /api/query endpoint.
    """

    def __init__(self):
        self._latest_frame_b64: str = ""
        self._latest_obstacles: list = []
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        log.info("🎙️  Audio trigger active — press [ENTER] to ask a question")

    def update_context(self, frame_b64: str, obstacles: list):
        """Called each frame to keep context fresh."""
        self._latest_frame_b64 = frame_b64
        self._latest_obstacles = obstacles

    def _listen_loop(self):
        while True:
            try:
                input()   # Block until Enter pressed
                log.info("🎙️  Recording for 5 seconds... speak now!")
                audio_b64 = self._record_audio()
                self._send_query(audio_b64)
            except Exception as e:
                log.error(f"Audio trigger error: {e}")
                time.sleep(1)

    def _record_audio(self) -> str:
        try:
            import sounddevice as sd
            from scipy.io.wavfile import write
            import io

            audio = sd.rec(
                int(RECORD_SECONDS * SAMPLE_RATE),
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16"
            )
            sd.wait()

            buf = io.BytesIO()
            write(buf, SAMPLE_RATE, audio)
            return base64.b64encode(buf.getvalue()).decode()
        except ImportError:
            log.warning("sounddevice not installed — using mock audio")
            return ""

    def _send_query(self, audio_b64: str):
        payload = {
            "audio_b64": audio_b64,
            "frame_b64": self._latest_frame_b64,
            "obstacles": self._latest_obstacles,
        }
        try:
            resp = requests.post(
                f"{BACKEND_REST_URL}/api/query",
                json=payload,
                timeout=30
            )
            data = resp.json()
            log.info(f"🤖 Gemini response: {data.get('text_response', '')}")
        except Exception as e:
            log.error(f"Failed to send query to backend: {e}")
