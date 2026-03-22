"""
SeeForMe — FastAPI Cloud Backend
=================================
Handles:
  - Auth0 JWT validation (user login + M2M)
  - WebSocket: receive obstacle stream from Pi
  - POST /api/query: STT → Gemini vision → ElevenLabs TTS
  - POST /api/scene: Scene analysis on frame
  - MongoDB Atlas: session logging
  - Snowflake: analytics logging
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import obstacles, query, scene, auth, health, dev_sync, public_config
from services.mongodb import connect_mongo, close_mongo
from services.snowflake_client import init_snowflake

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_mongo()
    init_snowflake()
    yield
    # Shutdown
    await close_mongo()


app = FastAPI(
    title="SeeForMe API",
    description="AI accessibility vision assistant backend",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(obstacles.router, prefix="/ws", tags=["WebSocket"])
app.include_router(query.router, prefix="/api", tags=["Query"])
app.include_router(scene.router, prefix="/api", tags=["Scene"])
app.include_router(dev_sync.router, prefix="/api", tags=["Dev"])
app.include_router(public_config.router, prefix="/api", tags=["Config"])
