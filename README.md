# 👁️ ELSEE — AI-Powered Accessibility Vision Assistant

> Real-time obstacle detection, scene understanding, and OCR for the visually impaired — powered by YOLOv8, MiDaS, Gemini, and ElevenLabs.

---

## 🏗️ Architecture Overview

```
Mobile Camera (React Native App)
        │
        ▼
┌─────────────────────────────────────────────┐
│           EDGE LAYER                        │
│                                             │
│  Raspberry Pi (YOLOv8 ONNX + MiDaS)        │
│  ├── Continuous obstacle detection          │
│  ├── Left/Right/Center tagging              │
│  ├── Depth proximity estimation             │
│  └── Prints haptic/alert signals            │
└─────────────────┬───────────────────────────┘
                  │ WebSocket (obstacles)
                  ▼
┌─────────────────────────────────────────────┐
│           CLOUD BACKEND (FastAPI)           │
│  Deployed on: DigitalOcean + Cloudflare     │
│                                             │
│  ├── Auth0 (user login + M2M API security)  │
│  ├── Gemini API (scene analysis + OCR)      │
│  ├── ElevenLabs (TTS voice response)        │
│  ├── MongoDB Atlas (session logs)           │
│  └── Snowflake (LLM usage analytics)       │
└─────────────────┬───────────────────────────┘
                  │ REST + WebSocket
                  ▼
┌─────────────────────────────────────────────┐
│     MOBILE APP (React Native iOS/Android)   │
│  ├── Live camera feed                       │
│  ├── Voice query → tap to send              │
│  ├── Annotated frame display                │
│  ├── Audio response playback (ElevenLabs)   │
│  └── Real-time obstacle overlay             │
└─────────────────────────────────────────────┘
```

---

## 📁 Repository Structure

```
elsee/
├── edge/
│   ├── pi/                    # Raspberry Pi pipeline (YOLO + MiDaS)
│   └── jetson/                # Jetson Nano pipeline (TensorRT variant)
├── backend/                   # FastAPI cloud backend
│   ├── routers/               # API route handlers
│   ├── models/                # Pydantic schemas
│   ├── services/              # Gemini, ElevenLabs, MongoDB, Snowflake
│   └── middleware/            # Auth0 JWT validation
├── mobile/                    # React Native app (iOS + Android)
│   └── src/
│       ├── screens/           # App screens
│       ├── components/        # UI components
│       ├── services/          # API clients
│       ├── hooks/             # Custom hooks
│       └── navigation/        # React Navigation
├── docs/                      # Architecture diagrams
├── docker-compose.yml         # Local dev environment
└── .env.example               # All required environment variables
```

---

## 🚀 Quick Start

### 1. Clone & configure environment
```bash
git clone https://github.com/ShipraaMathur/elsee.git
touch .env
# Fill in all API keys in .env
```

### 2. Run backend locally
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Run Pi edge pipeline
```bash
cd edge/pi
pip install -r requirements.txt
python main.py --source 0          # webcam
python main.py --source video.mp4  # video file
```

### 4. Run React Native app
```bash
cd mobile
npm install
npx expo start
```

---

## 🔑 Required API Keys

| Service | Purpose | Get it at |
|---|---|---|
| `EXPO_PUBLIC_GEMINI_API_KEY` | Scene analysis + OCR | aistudio.google.com |
| `ELEVENLABS_API_KEY` | Text-to-speech | elevenlabs.io |
| `AUTH0_DOMAIN` | Auth | auth0.com |
| `AUTH0_CLIENT_ID` | Auth | auth0.com |
| `AUTH0_CLIENT_SECRET` | M2M API security | auth0.com |
| `MONGODB_URI` | Session storage | mongodb.com/atlas |
| `SNOWFLAKE_*` | Analytics | snowflake.com |

---

## 🏆 Built for Code for Good 2026

**Team ELSEE** — Accessibility Track / Interactive Media Track

Tech stack: YOLOv8 · MiDaS · Gemini API · ElevenLabs · Auth0 · Cloudflare · Vultr · DigitalOcean · Snowflake · MongoDB Atlas · React Native · FastAPI · ONNX Runtime

# elsee
`python3 -m venv venv `
`source venv/bin/activate`
`pip install -q -U google-genai elevenlabs pymongo python-dotenv`
