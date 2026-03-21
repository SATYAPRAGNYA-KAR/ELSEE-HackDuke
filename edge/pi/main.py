"""
SeeForMe — Raspberry Pi Edge Pipeline
======================================
Runs YOLOv8 (ONNX Runtime) + MiDaS depth estimation continuously.
Detects obstacles, tags left/center/right, estimates proximity,
and alerts only when objects are near. Sends results via WebSocket
to the cloud backend.

Usage:
    python main.py --source 0              # webcam / Pi Camera
    python main.py --source video.mp4      # test video file
    python main.py --source rtsp://...     # RTSP stream from phone
"""

import argparse
import asyncio
import base64
import json
import logging
import os
import time
from pathlib import Path

import cv2
import numpy as np
import websockets
from dotenv import load_dotenv

from detector import YOLOv8Detector
from depth_estimator import MiDaSDepthEstimator
from obstacle_logic import classify_position, should_alert
from audio_trigger import AudioTrigger

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger("seefore.pi")

BACKEND_WS_URL = os.getenv("BACKEND_WS_URL", "ws://localhost:8000/ws/obstacles")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
PROXIMITY_THRESHOLD = float(os.getenv("PROXIMITY_ALERT_THRESHOLD", "0.65"))
ALERT_COOLDOWN_SEC = 2.0   # Don't re-alert same object within 2 seconds


async def run_pipeline(source: str):
    """Main edge inference loop."""
    detector = YOLOv8Detector(
        model_path=os.getenv("YOLO_MODEL_PATH", "./models/yolov8n.onnx"),
        confidence=CONFIDENCE_THRESHOLD
    )
    depth_estimator = MiDaSDepthEstimator(
        model_path=os.getenv("MIDAS_MODEL_PATH", "./models/midas_small.onnx")
    )
    audio_trigger = AudioTrigger()

    cap = cv2.VideoCapture(source if source != "0" else 0)
    if not cap.isOpened():
        log.error(f"Cannot open video source: {source}")
        return

    log.info(f"✅ Pipeline started — source: {source}")
    log.info(f"   YOLO confidence: {CONFIDENCE_THRESHOLD}")
    log.info(f"   Proximity threshold: {PROXIMITY_THRESHOLD}")

    alert_cooldowns: dict[str, float] = {}

    async with websockets.connect(BACKEND_WS_URL, ping_interval=20) as ws:
        log.info(f"🔌 Connected to backend: {BACKEND_WS_URL}")

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                log.info("End of video stream.")
                break

            frame_idx += 1
            t0 = time.time()

            # ── 1. Object Detection ──────────────────────────────────────────
            detections = detector.detect(frame)

            # ── 2. Depth Estimation ──────────────────────────────────────────
            depth_map = depth_estimator.estimate(frame)

            # ── 3. Per-detection logic ───────────────────────────────────────
            obstacles = []
            now = time.time()

            for det in detections:
                label = det["label"]
                bbox = det["bbox"]   # [x1, y1, x2, y2]
                conf = det["confidence"]

                # Position: left / center / right
                position = classify_position(bbox, frame.shape[1])

                # Depth: sample depth map in bbox center
                cx = int((bbox[0] + bbox[2]) / 2)
                cy = int((bbox[1] + bbox[3]) / 2)
                depth_score = float(depth_map[cy, cx])  # 0=far, 1=near

                near = depth_score >= PROXIMITY_THRESHOLD

                # Cooldown per label+position key
                key = f"{label}_{position}"
                last_alerted = alert_cooldowns.get(key, 0)
                cooldown_ok = (now - last_alerted) >= ALERT_COOLDOWN_SEC

                if near and cooldown_ok:
                    alert_cooldowns[key] = now
                    signal = should_alert(label, position, depth_score)
                    log.info(f"🚨 ALERT: {signal}")
                    print(f"[HAPTIC SIGNAL] {signal}")   # Actuator hook

                obstacles.append({
                    "label": label,
                    "confidence": round(conf, 3),
                    "bbox": bbox,
                    "position": position,
                    "depth_score": round(depth_score, 3),
                    "near": near,
                })

            # ── 4. Send to backend via WebSocket ────────────────────────────
            if frame_idx % 5 == 0:   # Send every 5th frame to reduce bandwidth
                # Encode frame as JPEG for dashboard display
                _, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                frame_b64 = base64.b64encode(jpg.tobytes()).decode()

                payload = {
                    "frame_idx": frame_idx,
                    "timestamp": now,
                    "obstacles": obstacles,
                    "frame_b64": frame_b64,
                }
                try:
                    await ws.send(json.dumps(payload))
                except websockets.exceptions.ConnectionClosed:
                    log.warning("WebSocket disconnected. Reconnecting...")
                    break

            # ── 5. Local display (for testing) ───────────────────────────────
            annotated = draw_annotations(frame, obstacles)
            cv2.imshow("SeeForMe — Edge Preview", annotated)

            elapsed = time.time() - t0
            fps = 1.0 / max(elapsed, 0.001)
            log.debug(f"Frame {frame_idx} | FPS: {fps:.1f} | Detections: {len(obstacles)}")

            if cv2.waitKey(1) & 0xFF == ord("q"):
                log.info("Quit requested.")
                break

    cap.release()
    cv2.destroyAllWindows()


def draw_annotations(frame: np.ndarray, obstacles: list) -> np.ndarray:
    """Draw bounding boxes and labels on frame for local preview."""
    h, w = frame.shape[:2]
    for obs in obstacles:
        x1, y1, x2, y2 = obs["bbox"]
        color = (0, 0, 255) if obs["near"] else (0, 200, 100)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label_text = f"{obs['label']} {obs['position']} d={obs['depth_score']:.2f}"
        cv2.putText(frame, label_text, (x1, max(y1 - 8, 0)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    return frame


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SeeForMe Pi Edge Pipeline")
    parser.add_argument("--source", default="0", help="Video source: 0=webcam, path, or RTSP URL")
    args = parser.parse_args()
    asyncio.run(run_pipeline(args.source))
