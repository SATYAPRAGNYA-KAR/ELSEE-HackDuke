"""
SeeForMe — Jetson Nano Edge Pipeline
======================================
TensorRT-accelerated YOLOv8 inference on Jetson Nano.
Falls back to ONNX Runtime if TensorRT is unavailable.

Usage:
    python main.py --source 0              # CSI / USB camera
    python main.py --source video.mp4      # test video
    python main.py --source rtsp://...     # mobile RTSP stream
"""

import argparse
import asyncio
import base64
import json
import logging
import os
import time

import cv2
import numpy as np
import websockets
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger("seefore.jetson")

BACKEND_WS_URL        = os.getenv("BACKEND_WS_URL", "ws://localhost:8000/ws/obstacles")
CONFIDENCE_THRESHOLD  = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
PROXIMITY_THRESHOLD   = float(os.getenv("PROXIMITY_ALERT_THRESHOLD", "0.65"))
ALERT_COOLDOWN_SEC    = 2.0

# ── Try importing TensorRT detector; fall back to ONNX ─────────────────────
try:
    from detector_trt import TRTDetector as Detector
    log.info("Using TensorRT detector")
except ImportError:
    log.warning("TensorRT not available — falling back to ONNX detector")
    import sys
    sys.path.insert(0, "../pi")
    from detector import YOLOv8Detector as Detector  # type: ignore

from depth_estimator import MiDaSDepthEstimator
from obstacle_logic import classify_position, should_alert


async def run_pipeline(source: str):
    detector = Detector(
        model_path=os.getenv("YOLO_MODEL_PATH", "./models/yolov8n.onnx"),
        confidence=CONFIDENCE_THRESHOLD,
    )
    depth_estimator = MiDaSDepthEstimator(
        model_path=os.getenv("MIDAS_MODEL_PATH", "./models/midas_small.onnx")
    )

    # Open camera/video
    if source == "0":
        # Jetson CSI camera GStreamer pipeline
        gst_pipeline = (
            "nvarguscamerasrc ! "
            "video/x-raw(memory:NVMM), width=1280, height=720, framerate=30/1 ! "
            "nvvidconv flip-method=0 ! "
            "video/x-raw, width=720, height=480, format=BGRx ! "
            "videoconvert ! video/x-raw, format=BGR ! appsink"
        )
        cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)
        if not cap.isOpened():
            log.warning("CSI camera unavailable — trying USB camera (index 0)")
            cap = cv2.VideoCapture(0)
    else:
        cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        log.error(f"Cannot open source: {source}")
        return

    log.info(f"✅ Jetson pipeline started | Source: {source}")

    alert_cooldowns: dict[str, float] = {}

    async with websockets.connect(BACKEND_WS_URL, ping_interval=20) as ws:
        log.info(f"🔌 Connected to backend WebSocket")

        frame_idx = 0
        fps_counter = 0
        fps_t0 = time.time()

        while True:
            ret, frame = cap.read()
            if not ret:
                log.info("Stream ended.")
                break

            frame_idx += 1
            t0 = time.time()

            # ── Object Detection ────────────────────────────────────────────
            detections = detector.detect(frame)

            # ── Depth Estimation ────────────────────────────────────────────
            depth_map = depth_estimator.estimate(frame)

            # ── Obstacle Logic ──────────────────────────────────────────────
            obstacles = []
            now = time.time()

            for det in detections:
                label    = det["label"]
                bbox     = det["bbox"]
                conf     = det["confidence"]
                position = classify_position(bbox, frame.shape[1])

                cx = int((bbox[0] + bbox[2]) / 2)
                cy = int((bbox[1] + bbox[3]) / 2)
                cy = min(cy, depth_map.shape[0] - 1)
                cx = min(cx, depth_map.shape[1] - 1)
                depth_score = float(depth_map[cy, cx])
                near = depth_score >= PROXIMITY_THRESHOLD

                key = f"{label}_{position}"
                if near and (now - alert_cooldowns.get(key, 0)) >= ALERT_COOLDOWN_SEC:
                    alert_cooldowns[key] = now
                    should_alert(label, position, depth_score)

                obstacles.append({
                    "label": label,
                    "confidence": round(conf, 3),
                    "bbox": bbox,
                    "position": position,
                    "depth_score": round(depth_score, 3),
                    "near": near,
                })

            # ── Send to Backend ──────────────────────────────────────────────
            if frame_idx % 3 == 0:   # Jetson can afford more frequent sends
                _, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 65])
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
                    log.warning("WebSocket closed — reconnecting...")
                    break

            # ── FPS counter ─────────────────────────────────────────────────
            fps_counter += 1
            if fps_counter % 30 == 0:
                fps = fps_counter / (time.time() - fps_t0)
                log.info(f"FPS: {fps:.1f} | Detections: {len(obstacles)}")
                fps_t0 = time.time()
                fps_counter = 0

            # ── Local display ────────────────────────────────────────────────
            _draw(frame, obstacles)
            cv2.imshow("SeeForMe — Jetson", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


def _draw(frame: np.ndarray, obstacles: list):
    for obs in obstacles:
        x1, y1, x2, y2 = obs["bbox"]
        color = (0, 0, 255) if obs["near"] else (0, 220, 80)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{obs['label']} [{obs['position']}] {obs['depth_score']:.2f}"
        cv2.putText(frame, label, (x1, max(y1 - 6, 12)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 2)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="0")
    args = parser.parse_args()
    asyncio.run(run_pipeline(args.source))
