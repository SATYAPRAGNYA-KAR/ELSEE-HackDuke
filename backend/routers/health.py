"""Health check router."""
from fastapi import APIRouter
router = APIRouter()

@router.get("/")
async def health():
    return {"status": "ok", "service": "SeeForMe API"}

@router.get("/ready")
async def ready():
    return {"ready": True}
