"""
TensorRT YOLOv8 Detector — Jetson Nano
Uses tensorrt + pycuda for GPU-accelerated inference.

Export model for TensorRT:
    # On Jetson, after pip install ultralytics:
    yolo export model=yolov8n.pt format=engine device=0 imgsz=640

Requirements (Jetson-specific):
    - JetPack 5.x (includes TensorRT, CUDA, cuDNN)
    - pip install pycuda
    - tensorrt Python bindings (included with JetPack)
"""

import logging
import numpy as np
import cv2
from typing import List, Dict, Any

log = logging.getLogger("seefore.trt_detector")

# Import same COCO classes and obstacle filter from Pi detector
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../pi"))
from detector import COCO_CLASSES, OBSTACLE_CLASSES


class TRTDetector:
    """
    TensorRT-based YOLOv8 detector.
    ~10–20x faster than CPU ONNX on Jetson Nano.
    """

    def __init__(self, model_path: str, confidence: float = 0.45, input_size: int = 640):
        self.confidence  = confidence
        self.input_size  = input_size
        self.engine      = None
        self.context     = None
        self._load_engine(model_path.replace(".onnx", ".engine"))

    def _load_engine(self, engine_path: str):
        try:
            import tensorrt as trt
            import pycuda.driver as cuda
            import pycuda.autoinit  # noqa: F401

            self.cuda = cuda
            TRT_LOGGER = trt.Logger(trt.Logger.WARNING)
            runtime = trt.Runtime(TRT_LOGGER)

            with open(engine_path, "rb") as f:
                engine_data = f.read()

            self.engine  = runtime.deserialize_cuda_engine(engine_data)
            self.context = self.engine.create_execution_context()

            # Allocate buffers
            self._allocate_buffers()
            log.info(f"✅ TensorRT engine loaded: {engine_path}")

        except (ImportError, FileNotFoundError) as e:
            log.warning(f"TensorRT load failed ({e}) — raise ImportError to trigger ONNX fallback")
            raise ImportError(f"TensorRT unavailable: {e}")

    def _allocate_buffers(self):
        import pycuda.driver as cuda
        import numpy as np

        self.inputs  = []
        self.outputs = []
        self.bindings = []
        self.stream = cuda.Stream()

        for i in range(self.engine.num_io_tensors):
            name  = self.engine.get_tensor_name(i)
            dtype = np.float32
            shape = self.engine.get_tensor_shape(name)
            size  = abs(int(np.prod(shape)))

            host_mem   = cuda.pagelocked_empty(size, dtype)
            device_mem = cuda.mem_alloc(host_mem.nbytes)
            self.bindings.append(int(device_mem))

            if self.engine.get_tensor_mode(name).name == "INPUT":
                self.inputs.append({"host": host_mem, "device": device_mem, "name": name})
            else:
                self.outputs.append({"host": host_mem, "device": device_mem, "name": name})

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if self.context is None:
            return []

        h, w = frame.shape[:2]
        blob, scale_x, scale_y, pad_x, pad_y = self._preprocess(frame)

        # Copy input to device
        np.copyto(self.inputs[0]["host"], blob.ravel())
        self.cuda.memcpy_htod_async(
            self.inputs[0]["device"], self.inputs[0]["host"], self.stream
        )

        # Run inference
        self.context.execute_async_v2(
            bindings=self.bindings, stream_handle=self.stream.handle
        )

        # Copy output from device
        self.cuda.memcpy_dtoh_async(
            self.outputs[0]["host"], self.outputs[0]["device"], self.stream
        )
        self.stream.synchronize()

        output = self.outputs[0]["host"].reshape(1, -1, self.input_size * self.input_size // (32 * 32) * 3)
        return self._postprocess(output, scale_x, scale_y, pad_x, pad_y, w, h)

    def _preprocess(self, frame: np.ndarray):
        h, w = frame.shape[:2]
        scale = min(self.input_size / w, self.input_size / h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(frame, (new_w, new_h))

        pad_x = (self.input_size - new_w) // 2
        pad_y = (self.input_size - new_h) // 2
        padded = cv2.copyMakeBorder(
            resized, pad_y, pad_y, pad_x, pad_x,
            cv2.BORDER_CONSTANT, value=(114, 114, 114)
        )
        padded = padded[:self.input_size, :self.input_size]
        blob = padded.astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)[np.newaxis, ...]
        return blob, 1.0 / scale, 1.0 / scale, pad_x, pad_y

    def _postprocess(self, output, scale_x, scale_y, pad_x, pad_y, orig_w, orig_h):
        """Parse YOLOv8 output — same logic as ONNX detector."""
        preds = output[0].T
        boxes = preds[:, :4]
        scores = preds[:, 4:]

        class_ids    = np.argmax(scores, axis=1)
        confidences  = scores[np.arange(len(class_ids)), class_ids]
        mask         = confidences >= self.confidence
        boxes        = boxes[mask]
        confidences  = confidences[mask]
        class_ids    = class_ids[mask]

        results = []
        for box, conf, cls_id in zip(boxes, confidences, class_ids):
            label = COCO_CLASSES[int(cls_id)] if int(cls_id) < len(COCO_CLASSES) else "unknown"
            if label not in OBSTACLE_CLASSES:
                continue
            cx, cy, bw, bh = box
            x1 = int((cx - bw / 2 - pad_x) * scale_x)
            y1 = int((cy - bh / 2 - pad_y) * scale_y)
            x2 = int((cx + bw / 2 - pad_x) * scale_x)
            y2 = int((cy + bh / 2 - pad_y) * scale_y)
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(orig_w, x2), min(orig_h, y2)
            results.append({"label": label, "confidence": float(conf), "bbox": [x1, y1, x2, y2]})

        if results:
            boxes_nms  = [[r["bbox"][0], r["bbox"][1], r["bbox"][2]-r["bbox"][0], r["bbox"][3]-r["bbox"][1]] for r in results]
            scores_nms = [r["confidence"] for r in results]
            indices    = cv2.dnn.NMSBoxes(boxes_nms, scores_nms, self.confidence, 0.45)
            results    = [results[i] for i in indices.flatten()] if len(indices) > 0 else []

        return results
