# SeeForMe — Complete Setup Guide

## Prerequisites

| Component | Minimum | Recommended |
|---|---|---|
| Raspberry Pi | Pi 4 (4 GB) | Pi 5 (8 GB) |
| Jetson | Nano 4 GB | Orin Nano |
| Backend server | 2 vCPU, 2 GB RAM | DigitalOcean Droplet 4 GB |
| Python | 3.10+ | 3.11 |
| Node.js | 18+ | 20 LTS |

---

## 1. API Keys Checklist

Before anything else, gather these keys:

```
☐ Gemini API key       → https://aistudio.google.com/app/apikey
☐ ElevenLabs API key   → https://elevenlabs.io/app/settings
☐ Auth0 tenant         → https://auth0.com (create free account)
☐ MongoDB Atlas URI    → https://cloud.mongodb.com (free M0 cluster)
☐ Snowflake account    → https://trial.snowflake.com
☐ DigitalOcean token   → https://cloud.digitalocean.com/account/api
☐ Cloudflare account   → https://dash.cloudflare.com
```

Copy `.env.example` → `.env` and fill in all values.

---

## 2. Raspberry Pi Setup

### 2a. Install OS + dependencies
```bash
# Use Raspberry Pi OS Lite 64-bit (recommended)
# SSH into Pi, then:

sudo apt update && sudo apt install -y \
  python3-pip python3-venv \
  libopencv-dev python3-opencv \
  portaudio19-dev

cd /home/pi
git clone https://github.com/yourteam/seefore.git
cd seefore/edge/pi

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2b. Download models
```bash
chmod +x download_models.sh
./download_models.sh
```

This downloads:
- `models/yolov8n.onnx` — YOLOv8 Nano (COCO, 80 classes)
- `models/midas_small.onnx` — MiDaS v2.1 Small (256×256)

### 2c. Configure environment
```bash
cp ../../.env.example .env
nano .env   # Set BACKEND_WS_URL and BACKEND_REST_URL
```

### 2d. Run the pipeline
```bash
# Test with video file
python main.py --source /path/to/test_video.mp4

# Live webcam
python main.py --source 0

# Pi Camera (if using picamera2 instead of OpenCV)
python main.py --source 0
```

### 2e. Performance expectations on Pi 4
| Model | Resolution | FPS (CPU) |
|---|---|---|
| YOLOv8n ONNX | 640×640 | ~4–8 FPS |
| MiDaS Small ONNX | 256×256 | ~3–5 FPS |
| Combined pipeline | 720×480 | ~3–5 FPS |

> **Tip:** Reduce `input_size=320` in detector.py for ~2× speedup with slight accuracy loss.

---

## 3. Jetson Nano Setup

### 3a. Flash JetPack
- Use JetPack 5.1.3 (Ubuntu 20.04 + CUDA 11.4 + TensorRT 8.x)
- Flash with Balena Etcher or NVIDIA SDK Manager

### 3b. Install Python dependencies
```bash
git clone https://github.com/yourteam/seefore.git
cd seefore/edge/jetson

pip3 install -r requirements.txt
# For pycuda (TensorRT bindings):
pip3 install pycuda
```

### 3c. Export YOLOv8 TensorRT engine (on Jetson)
```bash
pip3 install ultralytics
yolo export model=yolov8n.pt format=engine device=0 imgsz=640
mv yolov8n.engine models/
```

### 3d. Run
```bash
# CSI camera (Jetson native)
python main.py --source 0

# USB camera
python main.py --source 1

# Test video
python main.py --source /path/to/video.mp4
```

### 3e. Performance expectations on Jetson Nano
| Backend | Resolution | FPS |
|---|---|---|
| YOLOv8n TensorRT | 640×640 | ~25–35 FPS |
| YOLOv8n ONNX (CPU fallback) | 640×640 | ~6–10 FPS |
| MiDaS Small (ONNX CUDA) | 256×256 | ~10–15 FPS |

---

## 4. Cloud Backend Setup

### 4a. Local development
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp ../.env.example .env
# Fill in API keys

uvicorn main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### 4b. Auth0 Configuration

1. Create Auth0 Application → **Native** (for mobile app)
2. Create Auth0 API → Audience: `https://api.seefore.tech`
3. Create Machine-to-Machine application for Pi→Backend auth
4. Add callback URL: `com.seefore.app://auth`

### 4c. MongoDB Atlas Setup
1. Create free M0 cluster
2. Create database user
3. Whitelist all IPs (0.0.0.0/0) for hackathon
4. Copy connection string to `MONGODB_URI`

### 4d. Snowflake Setup
1. Create trial account
2. Create warehouse `COMPUTE_WH`
3. Create database `SEEFORE_DB`
4. Tables are auto-created on first run

### 4e. Deploy to DigitalOcean
```bash
# Create a $12/mo Droplet (2 vCPU, 2 GB RAM, Ubuntu 24.04)
chmod +x deploy_digitalocean.sh
./deploy_digitalocean.sh <your-droplet-ip>
```

### 4f. Cloudflare Setup
```bash
npm install -g wrangler
cd cloudflare
wrangler login
# Edit wrangler.toml: set BACKEND_ORIGIN to your Droplet IP
wrangler deploy
```

Add DNS record in Cloudflare:
```
CNAME  api.seefore.tech  →  your-worker.workers.dev
```

---

## 5. Mobile App Setup

### 5a. Install dependencies
```bash
cd mobile
npm install

cp .env.example .env
# Set EXPO_PUBLIC_BACKEND_URL and Auth0 values
```

### 5b. Run on iOS Simulator
```bash
npx expo start --ios
```

### 5c. Run on physical device
```bash
# Install Expo Go on your phone
npx expo start
# Scan QR code in Expo Go
```

### 5d. Build standalone iOS app
```bash
npx expo build:ios
# or with EAS Build:
npx eas build --platform ios
```

---

## 6. End-to-End Test Flow

1. **Start backend**: `uvicorn main:app --port 8000`
2. **Start Pi pipeline**: `python edge/pi/main.py --source test_video.mp4`
3. **Open app**: Run Expo, go to Live tab
4. **Verify WebSocket**: Obstacles should appear in real-time
5. **Test query**: Go to Ask tab → hold mic → say "What's in front of me?"
6. **Verify response**: Gemini analyzes frame → ElevenLabs speaks response

---

## 7. Hackathon Demo Tips

- Pre-download YOLO + MiDaS models before the event (no WiFi dependency)
- Use a test video for the demo if hardware isn't ready
- The backend `/docs` page makes a great live API demo for judges
- MongoDB Atlas dashboard shows real-time session logs impressively
- Snowflake query page shows analytics beautifully

---

## 8. Domain Setup

1. Register `seefore.tech` via `.TECH Domains` or GoDaddy
2. Set nameservers to Cloudflare
3. Add DNS records:
   - `api.seefore.tech` → Cloudflare Worker
   - `seefore.tech` → Expo Web build (optional)
