"""Obstacle logic — shared between Pi and Jetson pipelines."""


def classify_position(bbox: list, frame_width: int) -> str:
    x1, _, x2, _ = bbox
    cx = (x1 + x2) / 2
    third = frame_width / 3
    if cx < third:
        return "left"
    elif cx < 2 * third:
        return "center"
    else:
        return "right"


def should_alert(label: str, position: str, depth_score: float) -> str:
    if depth_score > 0.85:
        urgency = "HIGH"
        verbal  = f"Warning! {label} very close on your {position}!"
    elif depth_score > 0.65:
        urgency = "MEDIUM"
        verbal  = f"{label.capitalize()} ahead on {position}."
    else:
        urgency = "LOW"
        verbal  = f"{label.capitalize()} on {position}."

    signal = f"ALERT|{label}|{position}|{urgency}"
    print(f"[SIGNAL] {signal}")
    print(f"[VERBAL] {verbal}")
    return signal
