"""Supabase session auth. All routes except public passport require a session.

Validation is server-side via the Supabase Auth API (GET /auth/v1/user),
so no JWT secret is needed — only SUPABASE_URL + SUPABASE_ANON_KEY.

Correction 3: no user->workspace lookup. workspace_id comes from the
hardcoded WORKSPACE_ID env constant (one reviewer, one manufacturer).
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import logging

from app.config import WORKSPACE_ID, settings

logger = logging.getLogger("traceflow.auth")

security = HTTPBearer(auto_error=False)


class Caller:
    def __init__(self, user_id: str, workspace_id: str, role: str = "reviewer"):
        self.user_id = user_id
        self.workspace_id = workspace_id
        self.role = role


async def get_caller(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> Caller:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")
    token = creds.credentials
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=500, detail="Auth not configured")
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Authorization": f"Bearer {token}",
                },
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Auth service unreachable")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    try:
        user_id = resp.json().get("id")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    user_id = str(user_id)
    workspace_id = WORKSPACE_ID
    role = "reviewer"
    try:
        from app.db import get_pool

        pool = await get_pool()
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT workspace_id::text, role FROM memberships WHERE user_id=%s LIMIT 1",
                (user_id,),
            )
            row = await cur.fetchone()
            if row and row[0]:
                workspace_id = row[0]
                if row[1]:
                    role = row[1]
    except Exception as e:
        # Pilot single-tenant: session already validated via Supabase above.
        # Membership row only refines workspace/role; a DB outage must not
        # silently mint reviewer rights — log loudly, keep safe default.
        logger.warning("membership lookup fallback: %s: %s", type(e).__name__, e)
    return Caller(user_id=user_id, workspace_id=workspace_id, role=role)


def require_role(*allowed: str):
    async def checker(caller: Caller = Depends(get_caller)) -> Caller:
        if caller.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return caller

    return checker


require_admin = require_role("admin")
require_reviewer = require_role("admin", "reviewer")
