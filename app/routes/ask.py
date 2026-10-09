from __future__ import annotations

from fastapi import APIRouter, Depends

from app import errors

from app.auth import Caller, require_member
from app.config import settings
from app.db import get_pool
from app.services.ask import ask_workspace, build_snapshot

router = APIRouter()


@router.post("/api/ask")
async def ask(body: dict, caller: Caller = Depends(require_member)):
    question = (body.get("question") or "").strip()
    if not question:
        raise errors.missing_field("a question")
    if len(question) > 2000:
        raise errors.too_long("question", "2000 characters")
    if not settings.anthropic_api_key:
        raise errors.ai_unconfigured()
    pool = await get_pool()
    async with pool.connection() as conn:
        snapshot = await build_snapshot(conn, caller.workspace_id)
    try:
        answer = await ask_workspace(question, snapshot)
    except Exception as e:  # noqa: BLE001 - surface class only, never keys
        raise errors.ai_unavailable()
    return {"answer": answer}
