"""
Obstacle Logic — Position Classification & Alert Signals
"""

from typing import Tuple


def classify_position(bbox: list, frame_width: int) -> str:
    """
    Classify object as left / center / right based on bbox center X.
    Divides frame into 3 equal thirds.
    """
    x1, y1, x2, y2 = bbox
    cx = (x1 + x2) / 2
    third = frame_width / 3

    if cx < third:
        return "left"
    elif cx < 2 * third:
        return "center"
    else:
        return "right"


def should_alert(label: str, position: str, depth_score: float) -> str:
    """
    Generate a human-readable + haptic signal string.
    Format: "ALERT|<label>|<position>|<urgency>"
    Urgency: HIGH (>0.85), MEDIUM (>0.65), LOW otherwise
    """
    if depth_score > 0.85:
        urgency = "HIGH"
        verbal = f"Warning! {label} very close on your {position}!"
    elif depth_score > 0.65:
        urgency = "MEDIUM"
        verbal = f"{label.capitalize()} ahead on {position}."
    else:
        urgency = "LOW"
        verbal = f"{label.capitalize()} detected on {position}."

    signal = f"ALERT|{label}|{position}|{urgency}"
    print(f"[SIGNAL] {signal}")
    print(f"[VERBAL] {verbal}")
    return signal


def format_obstacles_for_llm(obstacles: list) -> str:
    """
    Convert obstacle list to natural language for Gemini context injection.
    e.g., "A chair is close on the left. A person is very close in the center."
    """
    if not obstacles:
        return "No obstacles detected."

    parts = []
    for obs in obstacles:
        label = obs["label"]
        pos = obs["position"]
        depth = obs["depth_score"]
        near = obs["near"]

        if depth > 0.85:
            dist = "very close"
        elif depth > 0.65:
            dist = "nearby"
        elif depth > 0.4:
            dist = "at moderate distance"
        else:
            dist = "far away"

        parts.append(f"A {label} is {dist} on your {pos}.")

    return " ".join(parts)
