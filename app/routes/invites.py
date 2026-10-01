"""Invite code redemption. A valid code grants workspace membership."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import Caller, get_caller
from app.db import get_pool

router = APIRouter()


class RedeemBody(BaseModel):
    code: str


@router.post("/api/invites/redeem")
async def redeem_invite(body: RedeemBody, caller: Caller = Depends(get_caller)):
    code_hash = hashlib.sha256(body.code.strip().encode()).hexdigest()
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, workspace_id, role, expires_at, max_uses, used_count"
            " FROM invites WHERE code_hash = %s",
            (code_hash,),
        )
        row = await cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Invalid invite code")
        invite_id, workspace_id, role, expires_at, max_uses, used_count = (
            row[0],
            str(row[1]),
            row[2],
            row[3],
            row[4],
            row[5],
        )
        if expires_at is not None and expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invite expired")
        if max_uses is not None and used_count >= max_uses:
            raise HTTPException(status_code=409, detail="Invite already redeemed")
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO memberships (user_id, workspace_id, role)"
                " VALUES (%s, %s, %s)"
                " ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role",
                (caller.user_id, workspace_id, role),
            )
            await conn.execute(
                "UPDATE invites SET used_count = used_count + 1 WHERE id = %s",
                (invite_id,),
            )
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
                " VALUES (%s, %s, 'invite.redeemed', 'workspace', %s, %s::jsonb)",
                (workspace_id, caller.user_id, workspace_id, json.dumps({"role": role})),
            )
    return {"workspace_id": workspace_id, "role": role}
