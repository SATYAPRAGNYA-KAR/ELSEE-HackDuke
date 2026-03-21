"""Auth router — Auth0 token exchange + user info."""
import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

AUTH0_DOMAIN        = os.getenv("AUTH0_DOMAIN", "")
AUTH0_CLIENT_ID     = os.getenv("AUTH0_CLIENT_ID", "")
AUTH0_CLIENT_SECRET = os.getenv("AUTH0_CLIENT_SECRET", "")
AUTH0_AUDIENCE      = os.getenv("AUTH0_AUDIENCE", "")


class TokenRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/token")
async def exchange_code(req: TokenRequest):
    """Exchange Auth0 authorization code for tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{AUTH0_DOMAIN}/oauth/token",
            json={
                "grant_type": "authorization_code",
                "client_id": AUTH0_CLIENT_ID,
                "client_secret": AUTH0_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri,
                "audience": AUTH0_AUDIENCE,
            },
        )
    if not resp.is_success:
        raise HTTPException(status_code=400, detail=resp.json())
    return resp.json()


@router.get("/config")
async def auth_config():
    """Return public Auth0 config for mobile app."""
    return {
        "domain": AUTH0_DOMAIN,
        "clientId": AUTH0_CLIENT_ID,
        "audience": AUTH0_AUDIENCE,
    }
