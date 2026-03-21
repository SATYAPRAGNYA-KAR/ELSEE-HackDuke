"""
Auth0 JWT Middleware
Validates Bearer tokens for both user sessions and M2M (machine-to-machine) clients.
"""

import os
import logging
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

log = logging.getLogger("seefore.auth")

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "")
ALGORITHMS = ["RS256"]

security = HTTPBearer()


@lru_cache(maxsize=1)
def get_jwks() -> dict:
    """Fetch Auth0 JWKS (cached)."""
    url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json()


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    """
    Validate Auth0 JWT token.
    Returns decoded payload on success, raises HTTPException on failure.
    """
    token = credentials.credentials
    try:
        jwks = get_jwks()
        unverified_header = jwt.get_unverified_header(token)

        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"],
                }

        if not rsa_key:
            raise HTTPException(status_code=401, detail="Invalid token key")

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/",
        )
        return payload

    except JWTError as e:
        log.warning(f"JWT validation failed: {e}")
        raise HTTPException(status_code=401, detail=f"Token invalid: {str(e)}")


def get_current_user(payload: dict = Depends(verify_token)) -> dict:
    """Extract user info from validated JWT payload."""
    return {
        "sub": payload.get("sub"),
        "email": payload.get("email", ""),
        "name": payload.get("name", ""),
        "is_m2m": payload.get("gty") == "client-credentials",
    }
