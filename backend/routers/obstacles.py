"""
WebSocket Router — Obstacle Stream
Receives real-time obstacle data from Pi edge device.
Broadcasts to connected dashboard clients.
"""

import json
import logging
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.mongodb import log_obstacle_session
from services.snowflake_client import log_event

log = logging.getLogger("seefore.ws")
router = APIRouter()

# Connected dashboard clients
dashboard_clients: Set[WebSocket] = set()


class ConnectionManager:
    def __init__(self):
        self.edge_connections: Dict[str, WebSocket] = {}

    async def connect_edge(self, ws: WebSocket, device_id: str):
        await ws.accept()
        self.edge_connections[device_id] = ws
        log.info(f"Edge device connected: {device_id}")

    def disconnect_edge(self, device_id: str):
        self.edge_connections.pop(device_id, None)
        log.info(f"Edge device disconnected: {device_id}")

    async def broadcast_to_dashboards(self, data: dict):
        dead = set()
        for client in dashboard_clients:
            try:
                await client.send_json(data)
            except Exception:
                dead.add(client)
        dashboard_clients.difference_update(dead)


manager = ConnectionManager()


@router.websocket("/obstacles")
async def obstacle_websocket(ws: WebSocket, device_id: str = "pi-001"):
    """Pi edge device connects here to stream obstacle data."""
    await manager.connect_edge(ws, device_id)
    try:
        while True:
            raw = await ws.receive_text()
            payload = json.loads(raw)

            obstacles = payload.get("obstacles", [])
            frame_b64 = payload.get("frame_b64", "")
            timestamp = payload.get("timestamp", 0)

            # Log to MongoDB Atlas
            await log_obstacle_session({
                "device_id": device_id,
                "timestamp": timestamp,
                "obstacles": obstacles,
                "frame_idx": payload.get("frame_idx", 0),
            })

            # Log to Snowflake for analytics
            log_event("obstacle_frame", {
                "device_id": device_id,
                "obstacle_count": len(obstacles),
                "near_count": sum(1 for o in obstacles if o.get("near")),
            })

            # Broadcast to dashboard clients (strip heavy frame data for speed)
            dashboard_payload = {
                "type": "obstacles",
                "device_id": device_id,
                "timestamp": timestamp,
                "obstacles": obstacles,
                "frame_b64": frame_b64,
            }
            await manager.broadcast_to_dashboards(dashboard_payload)

    except WebSocketDisconnect:
        manager.disconnect_edge(device_id)


@router.websocket("/dashboard")
async def dashboard_websocket(ws: WebSocket):
    """Dashboard clients connect here to receive live obstacle feed."""
    await ws.accept()
    dashboard_clients.add(ws)
    log.info(f"Dashboard client connected. Total: {len(dashboard_clients)}")
    try:
        while True:
            await ws.receive_text()  # keep-alive ping handling
    except WebSocketDisconnect:
        dashboard_clients.discard(ws)
        log.info(f"Dashboard client disconnected. Total: {len(dashboard_clients)}")
