"""Intake endpoints: pasted-email intake + provider webhook STUB.

POST /api/intake — reviewer pastes {subject, body_text, from_email?}.
POST /api/intake/email — STUB for a future email provider webhook
  (e.g. Resend/SendGrid inbound parse). Today it accepts the provider's
  normalized JSON {subject, text, from} and runs the SAME create path as
  /api/intake; signature verification / attachment handling are NOT
  implemented yet. Guarded by the X-Intake-Secret shared secret, not by a
  reviewer session, because the caller is the email provider, not a human.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import Caller, require_reviewer
from app.config import settings
from app.db import get_pool
from app.services.intake import IntakeError, create_intake

router = APIRouter()

# Secret lives in Settings (INTAKE_SECRET env). Empty secret => 503 "intake not configured".
intake_secret: str = ""


def _secret() -> str:
    return intake_secret or settings.intake_secret or os.environ.get("INTAKE_SECRET", "")


@router.post("/api/intake")
async def post_intake(body: dict, caller: Caller = Depends(require_reviewer)):
    subject = (body.get("subject") or "").strip()
    body_text = (body.get("body_text") or body.get("message") or "").strip()
    if not subject or not body_text:
        raise HTTPException(status_code=422, detail="Missing subject or body_text")
    if len(subject) > 500 or len(body_text) > 50000:
        raise HTTPException(status_code=422, detail="Subject or body too long")
    pool = await get_pool()
    try:
        async with pool.connection() as conn:
            out = await create_intake(
                conn, caller.workspace_id, caller.user_id,
                subject, body_text, body.get("from_email"),
            )
    except IntakeError as e:
        raise HTTPException(status_code=502, detail=f"Intake extraction failed: {type(e).__name__}")
    return out


@router.post("/api/intake/email")
async def intake_email_webhook(request: Request):
    """Provider webhook STUB (see module docstring). Shared-secret auth only."""
    configured = _secret()
    if not configured:
        raise HTTPException(status_code=503, detail="intake not configured")
    if request.headers.get("X-Intake-Secret") != configured:
        raise HTTPException(status_code=403, detail="Bad intake secret")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON payload")
    # Accept both provider-normalized {subject, text, from} and console-style keys.
    subject = (payload.get("subject") or "").strip()
    body_text = (payload.get("text") or payload.get("body_text") or payload.get("message") or "").strip()
    from_email = payload.get("from") or payload.get("from_email")
    if not subject or not body_text:
        raise HTTPException(status_code=422, detail="Missing subject or text")
    if len(subject) > 500 or len(body_text) > 50000:
        raise HTTPException(status_code=422, detail="Subject or body too long")
    # TODO(stub): verify provider signature, handle attachments, dedupe by Message-ID.
    # Webhook has no reviewer session; workspace comes from the intake secret
    # binding. For the stub phase we resolve the pilot workspace server-side.
    from app.config import WORKSPACE_ID

    pool = await get_pool()
    try:
        async with pool.connection() as conn:
            out = await create_intake(
                conn, WORKSPACE_ID, "email-webhook", subject, body_text, from_email,
            )
    except IntakeError as e:
        raise HTTPException(status_code=502, detail=f"Intake extraction failed: {type(e).__name__}")
    return out
