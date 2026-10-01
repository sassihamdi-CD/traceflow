from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Caller, get_caller
from app.config import settings
from app.db import get_pool
from app.services.ask import ask_workspace, build_snapshot

router = APIRouter()


@router.post("/api/ask")
async def ask(body: dict, caller: Caller = Depends(get_caller)):
    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="Missing question")
    if len(question) > 2000:
        raise HTTPException(status_code=422, detail="Question too long (max 2000 chars)")
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI not configured")
    pool = await get_pool()
    async with pool.connection() as conn:
        snapshot = await build_snapshot(conn, caller.workspace_id)
    try:
        answer = await ask_workspace(question, snapshot)
    except Exception as e:  # noqa: BLE001 - surface class only, never keys
        raise HTTPException(status_code=502, detail=f"AI unavailable: {type(e).__name__}")
    return {"answer": answer}
