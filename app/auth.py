"""Supabase session auth. All routes except public passport require a session.

Validation is server-side via the Supabase Auth API (GET /auth/v1/user),
so no JWT secret is needed — only SUPABASE_URL + SUPABASE_ANON_KEY.

Correction 3: no user->workspace lookup. workspace_id comes from the
hardcoded WORKSPACE_ID env constant (one reviewer, one manufacturer).
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import logging

from app import errors
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
    """Validate Supabase session, then resolve workspace/role from memberships.

    FAIL-CLOSED (per-company DB decision):
    - Supabase session invalid/missing -> 401.
    - Membership lookup DB error -> 503 (never mint rights on outage).
    - No membership row -> role "none" (callers must redeem an invite;
      console routes requiring membership return 403, they do NOT
      silently fall back to reviewer).
    The invite-redeem endpoint stays on get_caller (auth-only) so a new
    user with no membership yet can redeem. All other console routes must
    use require_member / require_reviewer / require_admin.
    """
    if creds is None or not creds.credentials:
        raise errors.session_missing()
    token = creds.credentials
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise errors.auth_unconfigured()
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
        raise errors.auth_unavailable()
    if resp.status_code != 200:
        raise errors.session_invalid()
    try:
        user_id = resp.json().get("id")
    except ValueError:
        raise errors.session_invalid()
    if not user_id:
        raise errors.session_invalid()
    user_id = str(user_id)
    workspace_id = WORKSPACE_ID
    role = "none"
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
    except HTTPException:
        raise
    except Exception as e:
        # Fail closed: a DB outage must never mint reviewer rights.
        logger.warning("membership lookup failed closed: %s: %s", type(e).__name__, e)
        raise errors.membership_unavailable()
    return Caller(user_id=user_id, workspace_id=workspace_id, role=role)


async def ensure_workspace_exists(conn, workspace_id: str) -> None:
    """Workspace boot check: refuse writes when WORKSPACE_ID has no row.

    Raises 409 (FK-safe, human-actionable) instead of letting the INSERT
    hit the workspaces FK and surface as a 500.
    """
    cur = await conn.execute("SELECT 1 FROM workspaces WHERE id = %s", (workspace_id,))
    if await cur.fetchone() is None:
        raise errors.workspace_missing()


def require_role(*allowed: str):
    async def checker(caller: Caller = Depends(get_caller)) -> Caller:
        if caller.role == "none":
            raise errors.not_member()
        if caller.role not in allowed:
            raise errors.forbidden_role()
        return caller

    return checker


# PILOT: single role. The person running the pilot inside the manufacturer
# owns the workspace and can do EVERYTHING — upload, review, publish.
# require_admin / require_reviewer are aliases of require_member: the role
# column is informational only until the commercial phase reintroduces tiers.
# Only non-members ("none", no invite redeemed) are blocked, with guidance.
require_member = require_role("admin", "reviewer", "supplier", "auditor", "owner")
require_admin = require_member
require_reviewer = require_member
