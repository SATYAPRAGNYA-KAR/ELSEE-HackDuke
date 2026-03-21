# SeeForMe — Devpost Submission

## Tagline
AI-powered real-time vision assistant for the visually impaired — see the world through intelligent ears.

## What it does
SeeForMe is an accessibility platform that gives blind and visually impaired users real-time awareness of their surroundings through AI-powered obstacle detection, scene description, and text recognition.

**Core features:**
- **Obstacle detection** — YOLOv8 runs on a Raspberry Pi / Jetson Nano, detecting objects (chairs, tables, people, cars) and tagging them as left, center, or right
- **Proximity alerts** — MiDaS depth estimation ensures users are only alerted when obstacles are actually nearby, not far away
- **Voice queries** — Users press a button, ask "What's in front of me?" or "What does that sign say?", and receive a natural spoken response
- **Scene analysis + OCR** — Gemini Vision analyzes the full frame and reads any text visible in the scene
- **Voice responses** — ElevenLabs synthesizes natural speech for all responses
- **Session history** — MongoDB Atlas stores all sessions so users can recall what they saw

## How we built it
- **Edge layer (Raspberry Pi):** YOLOv8n ONNX + MiDaS Small ONNX for continuous obstacle detection at 4–8 FPS, streamed to backend via WebSocket
- **Cloud backend (FastAPI + DigitalOcean):** Receives edge stream, handles voice queries, calls Gemini Vision API for scene analysis + OCR, synthesizes responses with ElevenLabs
- **Security:** Auth0 for user login and machine-to-machine API security between edge devices and cloud
- **Storage:** MongoDB Atlas for session logs; Snowflake for usage analytics
- **Delivery:** Cloudflare Workers proxy for low-latency edge delivery; seefore.tech domain via .TECH Domains
- **Mobile app:** React Native (iOS + Android) with live feed, voice query interface, annotated frame display, and session history

## Challenges we ran into
- Getting MiDaS depth estimation to run at acceptable speed on a Raspberry Pi CPU required careful model quantization and input resolution tuning
- Synchronizing the WebSocket obstacle stream with the voice query pipeline without race conditions
- Auth0 M2M token validation for embedded edge devices

## Accomplishments
- Full end-to-end pipeline running in real-time from camera → edge → cloud → voice
- Sub-1-second response time for voice queries
- Robust obstacle detection with meaningful proximity filtering (no alert spam)

## What we learned
- Edge AI + cloud hybrid architectures are the right pattern for latency-sensitive accessibility tools
- MiDaS monocular depth estimation is surprisingly effective for proximity alerting without stereo cameras

## What's next
- Haptic wearable integration (vibration motors for left/center/right signals)
- Personalized memory ("remember where I put my keys")
- Indoor mapping with obstacle history
- Low-power mode for all-day battery usage

## Built with
YOLOv8 · MiDaS · Gemini API · ElevenLabs · Auth0 · MongoDB Atlas · Snowflake · DigitalOcean · Cloudflare · React Native · FastAPI · ONNX Runtime · TensorRT · Python · TypeScript
