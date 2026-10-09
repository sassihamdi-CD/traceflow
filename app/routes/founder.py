"""TraceFlow founder area — NOT part of the manufacturer portal.

The founder (non-technical) opens /founder in a browser, enters the founder
key ONCE, and mints one company code per manufacturer: company name, contact,
seats. No terminal, no scripts, no Supabase login — the founder key (server
env FOUNDER_KEY, checked with hmac) is the only gate.

Plaintext codes are returned ONCE at creation; only the SHA-256 hash is
stored, so a code can never be displayed again.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app import errors
from app.auth import ensure_workspace_exists
from app.config import settings
from app.db import get_pool

router = APIRouter()

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion


class MintBody(BaseModel):
    company_name: str = ""
    contact_name: str = ""
    contact_email: str = ""
    seats: int = 5
    days: int = 90
    prefix: str = ""


def _require_founder(request: Request) -> None:
    expected = settings.founder_key or os.environ.get("FOUNDER_KEY", "")
    if not expected:
        raise errors.founder_disabled()
    got = request.headers.get("X-Founder-Key", "")
    if not got or not hmac.compare_digest(got, expected):
        raise errors.bad_founder_key()


def _mint_code(prefix: str) -> tuple[str, str]:
    suffix = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
    code = f"{prefix.upper()}-{suffix}" if prefix else suffix
    return code, hashlib.sha256(code.encode()).hexdigest()


@router.get("/api/founder/invites")
async def founder_list(request: Request):
    """Every company code: who it is for, seats used/max, expiry."""
    _require_founder(request)
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, role, used_count, max_uses, expires_at, created_at,"
            " company_name, contact_name, contact_email"
            " FROM invites ORDER BY created_at DESC"
            " LIMIT 200",
        )
        rows = await cur.fetchall()
    return {"items": [
        {"id": str(r[0]), "role": r[1], "used_count": r[2], "max_uses": r[3],
         "expires_at": r[4].isoformat() if r[4] else None,
         "created_at": r[5].isoformat() if r[5] else None,
         "company_name": r[6] or "", "contact_name": r[7] or "",
         "contact_email": r[8] or ""}
        for r in rows
    ]}


@router.post("/api/founder/invites")
async def founder_mint(body: MintBody, request: Request):
    """Mint ONE company code. Returns plaintext ONCE — the founder copies it
    and sends it to the manufacturer. Everyone at that company joins with it."""
    _require_founder(request)
    company = (body.company_name or "").strip()
    if not company:
        raise errors.missing_field("the company name")
    seats = max(1, min(body.seats or 5, 100))
    days = max(1, min(body.days or 90, 365))
    prefix = (body.prefix or "").strip().upper()[:12]
    code, code_hash = _mint_code(prefix)
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, settings.workspace_id)
        async with conn.transaction():
            cur = await conn.execute(
                "INSERT INTO invites (workspace_id, code_hash, role, max_uses, expires_at,"
                " company_name, contact_name, contact_email)"
                " VALUES (%s,%s,'reviewer',%s, now() + (%s || ' days')::interval,%s,%s,%s)"
                " RETURNING id, expires_at",
                (settings.workspace_id, code_hash, seats, str(days), company,
                 (body.contact_name or "").strip()[:200],
                 (body.contact_email or "").strip()[:200]),
            )
            row = await cur.fetchone()
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
                " VALUES (%s,'founder','invite.minted','workspace',%s,%s::jsonb)",
                (settings.workspace_id, settings.workspace_id,
                 json.dumps({"company": company, "seats": seats, "days": days})),
            )
    return {"code": code, "company": company, "seats": seats, "days": days,
            "expires_at": row[1].isoformat() if row[1] else None}
