"""
MiDaS Monocular Depth Estimator — Raspberry Pi
Uses MiDaS Small (ONNX) for CPU-efficient depth estimation.

Download model:
    wget https://github.com/isl-org/MiDaS/releases/download/v2_1/midas_v21_small_256.onnx
    mv midas_v21_small_256.onnx models/midas_small.onnx

Output: depth map normalized to [0, 1] where 1.0 = closest/nearest
"""

import logging
import numpy as np
import cv2

log = logging.getLogger("seefore.depth")

MIDAS_INPUT_SIZE = 256   # MiDaS Small uses 256x256


class MiDaSDepthEstimator:
    def __init__(self, model_path: str):
        self._load_model(model_path)

    def _load_model(self, model_path: str):
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(
                model_path, providers=["CPUExecutionProvider"]
            )
            self.input_name = self.session.get_inputs()[0].name
            log.info(f"✅ MiDaS ONNX loaded: {model_path}")
        except Exception as e:
            log.error(f"Failed to load MiDaS: {e}")
            log.warning("Running depth estimator in MOCK mode")
            self.session = None

    def estimate(self, frame: np.ndarray) -> np.ndarray:
        """
        Returns a depth map of same spatial size as frame.
        Values: 0.0 = far away, 1.0 = very close.
        """
        if self.session is None:
            return self._mock_depth(frame)

        h, w = frame.shape[:2]

        # Preprocess
        img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (MIDAS_INPUT_SIZE, MIDAS_INPUT_SIZE))
        img = img.astype(np.float32) / 255.0

        # MiDaS normalization
        mean = np.array([0.485, 0.456, 0.406])
        std  = np.array([0.229, 0.224, 0.225])
        img = (img - mean) / std
        img = img.transpose(2, 0, 1)[np.newaxis, ...]   # NCHW

        # Inference
        depth = self.session.run(None, {self.input_name: img.astype(np.float32)})[0]
        depth = depth.squeeze()   # [256, 256]

        # Normalize to [0, 1] — MiDaS outputs inverse depth (higher = closer)
        depth_min, depth_max = depth.min(), depth.max()
        if depth_max > depth_min:
            depth = (depth - depth_min) / (depth_max - depth_min)
        else:
            depth = np.zeros_like(depth)

        # Resize back to frame size
        depth_resized = cv2.resize(depth, (w, h), interpolation=cv2.INTER_LINEAR)
        return depth_resized

    def _mock_depth(self, frame: np.ndarray) -> np.ndarray:
        """Return gradient mock depth (center=near) for testing."""
        h, w = frame.shape[:2]
        y = np.linspace(0, 1, h)
        x = np.linspace(0, 1, w)
        xv, yv = np.meshgrid(x, y)
        depth = 1.0 - np.sqrt((xv - 0.5)**2 + (yv - 0.5)**2) * 1.4
        return np.clip(depth, 0, 1).astype(np.float32)
