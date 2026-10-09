"""Ops console reads: review queue + activity feed.

Both read-only, workspace-scoped. No new write paths; review actions still go
through the spec section-4 endpoints so audit rows stay co-transactional.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import Caller, ensure_workspace_exists, require_member, require_reviewer
from app.db import get_pool

router = APIRouter()


@router.get("/api/review-queue")
async def review_queue(caller: Caller = Depends(require_member)):
    """Every proposed value awaiting human action, newest last (FIFO)."""
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT fv.id, fv.product_id, fv.field_key, fv.value, fv.unit,"
            " fv.location, fv.created_at, p.name, p.sku, d.filename,"
            " fd.label FROM field_values fv"
            " JOIN products p ON p.id = fv.product_id"
            " LEFT JOIN documents d ON d.id = fv.document_id"
            " LEFT JOIN field_definitions fd"
            "   ON fd.category = p.category AND fd.field_key = fv.field_key"
            " WHERE fv.workspace_id = %s AND fv.status = 'proposed'"
            " ORDER BY fv.created_at",
            (caller.workspace_id,),
        )
        items = []
        for r in await cur.fetchall():
            items.append({
                "id": str(r[0]), "product_id": str(r[1]), "field_key": r[2],
                "value": r[3], "unit": r[4], "location": r[5],
                "created_at": r[6].isoformat(),
                "product_name": r[7], "product_sku": r[8],
                "document_filename": r[9], "field_label": r[10] or r[2],
            })
    return {"count": len(items), "items": items}


@router.post("/api/review-queue/accept-all")
async def review_queue_accept_all(caller: Caller = Depends(require_reviewer)):
    """Bulk accept across the whole queue. Same rule as the dossier version:
    only unambiguous (single-candidate) fields; conflicts need explicit choice."""
    from app.routes.fields import _audit

    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            cur = await conn.execute(
                "SELECT id, product_id, field_key FROM field_values"
                " WHERE workspace_id = %s AND status = 'proposed'",
                (caller.workspace_id,),
            )
            cands = [(str(r[0]), str(r[1]), r[2]) for r in await cur.fetchall()]
            per_field: dict[tuple[str, str], list[str]] = {}
            for vid, pid, fk in cands:
                per_field.setdefault((pid, fk), []).append(vid)
            accepted, skipped = [], 0
            for (pid, fk), ids in per_field.items():
                if len(ids) != 1:
                    skipped += len(ids)
                    continue
                await conn.execute(
                    "UPDATE field_values SET status='accepted', reviewed_by=%s,"
                    " reviewed_at=now() WHERE id = %s",
                    (caller.user_id, ids[0]),
                )
                await _audit(conn, caller.workspace_id, caller.user_id,
                             "field.accepted", ids[0], '{"bulk": true}')
                accepted.append(ids[0])
    return {"ok": True, "accepted_count": len(accepted), "skipped_conflicts": skipped}


@router.get("/api/activity")
async def activity(caller: Caller = Depends(require_member), limit: int = 50):
    """Most recent audit rows. Insert-only table: this endpoint only SELECTs."""
    limit = max(1, min(limit, 200))
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT actor, action, entity_type, entity_id, detail, created_at"
            " FROM audit_log WHERE workspace_id = %s"
            " ORDER BY created_at DESC LIMIT %s",
            (caller.workspace_id, limit),
        )
        items = [{
            "actor": r[0], "action": r[1], "entity_type": r[2],
            "entity_id": str(r[3]), "detail": r[4],
            "created_at": r[5].isoformat(),
        } for r in await cur.fetchall()]
    return {"items": items}
