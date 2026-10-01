"""Manager notification center API. All routes workspace-scoped; reads strict."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Caller, get_caller
from app.db import get_pool

router = APIRouter()


@router.get("/api/notifications")
async def list_notifications(
    unread_only: bool = False, limit: int = 50, caller: Caller = Depends(get_caller),
):
    limit = max(1, min(int(limit or 50), 100))
    pool = await get_pool()
    async with pool.connection() as conn:
        if unread_only:
            cur = await conn.execute(
                "SELECT id, type, title, body, entity_type, entity_id, read_at, created_at"
                " FROM notifications WHERE workspace_id = %s AND read_at IS NULL"
                " ORDER BY created_at DESC LIMIT %s",
                (caller.workspace_id, limit),
            )
        else:
            cur = await conn.execute(
                "SELECT id, type, title, body, entity_type, entity_id, read_at, created_at"
                " FROM notifications WHERE workspace_id = %s"
                " ORDER BY created_at DESC LIMIT %s",
                (caller.workspace_id, limit),
            )
        rows = await cur.fetchall()
        cur = await conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE workspace_id = %s AND read_at IS NULL",
            (caller.workspace_id,),
        )
        unread = (await cur.fetchone())[0]
    return {
        "items": [{
            "id": str(r[0]), "type": r[1], "title": r[2], "body": r[3],
            "entity_type": r[4], "entity_id": str(r[5]) if r[5] else None,
            "read_at": r[6].isoformat() if r[6] else None,
            "created_at": r[7].isoformat() if r[7] else None,
        } for r in rows],
        "unread_count": unread,
    }


@router.post("/api/notifications/{notif_id}/read")
async def mark_read(notif_id: str, caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "UPDATE notifications SET read_at = now()"
            " WHERE id = %s AND workspace_id = %s AND read_at IS NULL",
            (notif_id, caller.workspace_id),
        )
        if cur.rowcount == 0:
            # Distinguish missing/wrong-workspace (404) from already-read (ok).
            cur = await conn.execute(
                "SELECT id FROM notifications WHERE id = %s AND workspace_id = %s",
                (notif_id, caller.workspace_id),
            )
            if await cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@router.post("/api/notifications/read-all")
async def mark_all_read(caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "UPDATE notifications SET read_at = now()"
            " WHERE workspace_id = %s AND read_at IS NULL",
            (caller.workspace_id,),
        )
        marked = cur.rowcount or 0
    return {"ok": True, "marked": marked}
