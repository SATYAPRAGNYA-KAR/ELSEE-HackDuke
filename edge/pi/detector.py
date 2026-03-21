"""
YOLOv8 ONNX Detector — Raspberry Pi
Uses onnxruntime (CPU) for broadest Pi compatibility.
Export your model with: yolo export model=yolov8n.pt format=onnx imgsz=640
"""

import os
import time
import logging
from pathlib import Path
from typing import List, Dict, Any

import cv2
import numpy as np

log = logging.getLogger("seefore.detector")

# COCO class names (80 classes)
COCO_CLASSES = [
    "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
    "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
    "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
    "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
    "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
    "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
    "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
    "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
    "remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator",
    "book","clock","vase","scissors","teddy bear","hair drier","toothbrush"
]

# Obstacle-relevant classes for accessibility
OBSTACLE_CLASSES = set(os.getenv(
    "OBSTACLE_CLASSES",
    "person,chair,table,bed,couch,car,bicycle,motorcycle,truck,bus,dog,cat,bottle,laptop,tv,dining table,potted plant"
).split(","))


class YOLOv8Detector:
    def __init__(self, model_path: str, confidence: float = 0.45, input_size: int = 640):
        self.confidence = confidence
        self.input_size = input_size
        self._load_model(model_path)

    def _load_model(self, model_path: str):
        try:
            import onnxruntime as ort
            providers = ["CPUExecutionProvider"]
            self.session = ort.InferenceSession(model_path, providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            log.info(f"✅ YOLOv8 ONNX loaded: {model_path}")
        except Exception as e:
            log.error(f"Failed to load ONNX model: {e}")
            log.warning("Running in MOCK mode — install onnxruntime and download yolov8n.onnx")
            self.session = None

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.session is None:
            return self._mock_detect(frame)

        h, w = frame.shape[:2]
        blob, scale_x, scale_y, pad_x, pad_y = self._preprocess(frame)

        outputs = self.session.run(None, {self.input_name: blob})
        detections = self._postprocess(outputs[0], scale_x, scale_y, pad_x, pad_y, w, h)
        return detections

    def _preprocess(self, frame: np.ndarray):
        """Letterbox resize + normalize to [0,1]."""
        h, w = frame.shape[:2]
        scale = min(self.input_size / w, self.input_size / h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h))

        pad_x = (self.input_size - new_w) // 2
        pad_y = (self.input_size - new_h) // 2
        padded = cv2.copyMakeBorder(resized, pad_y, pad_y, pad_x, pad_x,
                                    cv2.BORDER_CONSTANT, value=(114, 114, 114))
        padded = padded[:self.input_size, :self.input_size]  # ensure exact size

        blob = padded.astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)[np.newaxis, ...]   # NCHW
        return blob, 1.0 / scale, 1.0 / scale, pad_x, pad_y

    def _postprocess(self, output, scale_x, scale_y, pad_x, pad_y, orig_w, orig_h):
        """Parse YOLOv8 output tensor [1, 84, 8400] -> detections."""
        # YOLOv8 output: [batch, 4+num_classes, num_anchors]
        preds = output[0].T   # [8400, 84]
        boxes = preds[:, :4]
        scores = preds[:, 4:]

        class_ids = np.argmax(scores, axis=1)
        confidences = scores[np.arange(len(class_ids)), class_ids]

        mask = confidences >= self.confidence
        boxes = boxes[mask]
        confidences = confidences[mask]
        class_ids = class_ids[mask]

        results = []
        for box, conf, cls_id in zip(boxes, confidences, class_ids):
            label = COCO_CLASSES[int(cls_id)] if int(cls_id) < len(COCO_CLASSES) else "unknown"
            if label not in OBSTACLE_CLASSES:
                continue

            # xywh -> xyxy, undo letterbox
            cx, cy, bw, bh = box
            x1 = int((cx - bw / 2 - pad_x) * scale_x)
            y1 = int((cy - bh / 2 - pad_y) * scale_y)
            x2 = int((cx + bw / 2 - pad_x) * scale_x)
            y2 = int((cy + bh / 2 - pad_y) * scale_y)

            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(orig_w, x2), min(orig_h, y2)

            results.append({
                "label": label,
                "confidence": float(conf),
                "bbox": [x1, y1, x2, y2],
            })

        # NMS
        if results:
            boxes_nms = [[r["bbox"][0], r["bbox"][1],
                          r["bbox"][2] - r["bbox"][0],
                          r["bbox"][3] - r["bbox"][1]] for r in results]
            scores_nms = [r["confidence"] for r in results]
            indices = cv2.dnn.NMSBoxes(boxes_nms, scores_nms, self.confidence, 0.45)
            results = [results[i] for i in indices.flatten()] if len(indices) > 0 else []

        return results

    def _mock_detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Fallback mock detections for testing without model."""
        h, w = frame.shape[:2]
        return [
            {"label": "chair", "confidence": 0.87, "bbox": [50, 100, 200, 300]},
            {"label": "person", "confidence": 0.92, "bbox": [300, 50, 500, 400]},
        ]
