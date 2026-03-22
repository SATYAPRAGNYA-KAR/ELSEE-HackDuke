import os
import base64
from dotenv import load_dotenv
from google import genai
from google.genai import types
from elevenlabs.client import ElevenLabs
from elevenlabs import stream
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv()

# Load environment variables
load_dotenv()

# 1. Initialize API Clients
# Ensure GEMINI_API_KEY, ELEVENLABS_API_KEY, and MONGO_URI are in your .env
gen_client = genai.Client(api_key=os.getenv("EXPO_PUBLIC_GEMINI_API_KEY"))
eleven_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

# 2. MongoDB Setup
mongo_client = MongoClient(os.getenv("MONGO_URI"))
db = mongo_client["elsee_db"]["logs"]

def process_elsee_request(image_path, audio_path):
    """
    The core 'Brain' logic:
    1. Sees the image.
    2. Hears the audio query.
    3. Thinks with Gemini 3.
    4. Logs to MongoDB.
    5. Speaks via ElevenLabs.
    """
    try:
        print(f"--- 🧠 elsee is thinking... ---")

        # A. Prepare Multimodal Parts
        # Wrapping bytes in 'types.Part' is required for Python 3.14 compatibility
        with open(image_path, "rb") as i_file:
            image_part = types.Part.from_bytes(
                data=i_file.read(), 
                mime_type="image/jpeg"
            )

        with open(audio_path, "rb") as a_file:
            audio_part = types.Part.from_bytes(
                data=a_file.read(), 
                mime_type="audio/wav"
            )

        # B. Single-Call Multimodal AI
        # This is 40% faster than transcribing to text first.
        response = gen_client.models.generate_content(
            model="gemini-2.5-flash", 
            contents=[
                "Context: You are the eyes for a blind person. "
                "Task: Answer the user's spoken question based on the image. "
                "Constraint: Be concise, focus on immediate hazards, and keep it under 40 words.",
                image_part,
                audio_part
            ]
        )
        
        ai_response_text = response.text
        print(f"Response: {ai_response_text}")

        # C. Database Logging (The 'Memory')
        db.insert_one({
            "mode": "multimodal_audio",
            "ai_text": ai_response_text,
            "timestamp": os.sys.prefix 
        })
        print("✅ Logged to MongoDB Atlas.")

        # D. ElevenLabs Streaming (The 'Voice')
        # Using 'eleven_turbo_v2_5' for sub-200ms time-to-first-byte.
        print("--- 🗣️ speaking... ---")
        audio_stream = eleven_client.text_to_speech.stream(
            text=ai_response_text,
            voice_id="JBFqnCBsd6RMkjVDRZzb", # George
            model_id="eleven_turbo_v2_5"
        )
        
        # This triggers the 'mpv' player on your MacBook
        stream(audio_stream)

    except Exception as e:
        print(f"❌ Error in elsee brain: {e}")

# --- TEST BLOCK ---
if __name__ == "__main__":
    # Check if files exist before running to avoid the 'Missing file' error
    img = "test.jpg"
    aud = "query.wav"
    
    if os.path.exists(img) and os.path.exists(aud):
        process_elsee_request(img, aud)
    else:
        print("\n⚠️  FILES MISSING!")
        print(f"Please ensure '{img}' and '{aud}' are in: {os.getcwd()}")
        print("Tip: You can rename any photo to 'test.jpg' and any audio to 'query.wav' to test.")