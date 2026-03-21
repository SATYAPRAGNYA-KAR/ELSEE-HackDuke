"""
MiDaS Depth Estimator — Jetson Nano
Same as Pi version but with optional GPU acceleration via ONNX CUDA provider.
"""

import logging
import numpy as np
import cv2

log = logging.getLogger("seefore.depth")
MIDAS_INPUT_SIZE = 256


class MiDaSDepthEstimator:
    def __init__(self, model_path: str):
        self._load_model(model_path)

    def _load_model(self, model_path: str):
        try:
            import onnxruntime as ort
            # Try CUDA first on Jetson, fall back to CPU
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            self.session = ort.InferenceSession(model_path, providers=providers)
            active = self.session.get_providers()[0]
            self.input_name = self.session.get_inputs()[0].name
            log.info(f"✅ MiDaS loaded with provider: {active}")
        except Exception as e:
            log.error(f"MiDaS load failed: {e}")
            self.session = None

    def estimate(self, frame: np.ndarray) -> np.ndarray:
        if self.session is None:
            return self._mock_depth(frame)

        h, w = frame.shape[:2]
        img = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (MIDAS_INPUT_SIZE, MIDAS_INPUT_SIZE))
        img = img.astype(np.float32) / 255.0
        img = (img - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])
        img = img.transpose(2, 0, 1)[np.newaxis, ...]

        depth = self.session.run(None, {self.input_name: img.astype(np.float32)})[0].squeeze()
        d_min, d_max = depth.min(), depth.max()
        if d_max > d_min:
            depth = (depth - d_min) / (d_max - d_min)
        return cv2.resize(depth.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)

    def _mock_depth(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        xv, yv = np.meshgrid(np.linspace(0, 1, w), np.linspace(0, 1, h))
        return np.clip(1.0 - np.sqrt((xv - 0.5)**2 + (yv - 0.5)**2) * 1.4, 0, 1).astype(np.float32)
