#!/usr/bin/env bash
# download_models.sh — Download YOLOv8n ONNX + MiDaS Small ONNX
# Run from edge/pi/ directory

set -e
mkdir -p models

echo "📥 Downloading YOLOv8n ONNX..."
# Option 1: Use ultralytics to export (recommended)
# pip install ultralytics
# python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=640)"
# mv yolov8n.onnx models/

# Option 2: Direct download (pre-exported)
wget -q --show-progress \
  "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt" \
  -O models/yolov8n.pt
echo "  → Exporting to ONNX (requires ultralytics)..."
python -c "
from ultralytics import YOLO
model = YOLO('models/yolov8n.pt')
model.export(format='onnx', imgsz=640, simplify=True)
import shutil
shutil.move('models/yolov8n.onnx', 'models/yolov8n.onnx')
print('YOLOv8n ONNX ready at models/yolov8n.onnx')
" 2>/dev/null || echo "  ⚠️  ultralytics not installed — manually export yolov8n.pt to ONNX"

echo ""
echo "📥 Downloading MiDaS Small ONNX..."
wget -q --show-progress \
  "https://github.com/isl-org/MiDaS/releases/download/v2_1/midas_v21_small_256.onnx" \
  -O models/midas_small.onnx
echo "  → MiDaS Small ready at models/midas_small.onnx"

echo ""
echo "✅ All models ready!"
ls -lh models/
