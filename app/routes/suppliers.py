from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Caller, get_caller, require_reviewer
from app.db import get_pool

router = APIRouter()


@router.post("/api/suppliers")
async def create_supplier(body: dict, caller: Caller = Depends(require_reviewer)):
    """Create a supplier (name + optional external_code). Audited, same txn."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Missing name")
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            cur = await conn.execute(
                "INSERT INTO suppliers (workspace_id, name, external_code)"
                " VALUES (%s,%s,%s) RETURNING id",
                (caller.workspace_id, name, (body.get("external_code") or "").strip() or None),
            )
            sid = str((await cur.fetchone())[0])
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'supplier.created','supplier',%s)",
                (caller.workspace_id, caller.user_id, sid),
            )
    return {"id": sid, "name": name}


@router.get("/api/suppliers")
async def list_suppliers(caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, name, external_code FROM suppliers WHERE workspace_id = %s ORDER BY name",
            (caller.workspace_id,),
        )
        suppliers = [{"id": str(r[0]), "name": r[1], "external_code": r[2]} for r in await cur.fetchall()]
        for s in suppliers:
            cur = await conn.execute(
                "SELECT COUNT(*), COUNT(*) FILTER (WHERE fv.status IN ('accepted','corrected'))"
                " FROM field_values fv JOIN documents d ON d.id = fv.document_id"
                " WHERE d.supplier_id = %s AND fv.workspace_id = %s",
                (s["id"], caller.workspace_id),
            )
            total, good = await cur.fetchone()
            s["evidence_health_percent"] = round(good * 100 / total) if total else None
            cur = await conn.execute(
                "SELECT COUNT(*) FROM supplier_followups WHERE supplier_id = %s"
                " AND workspace_id = %s AND status != 'resolved'",
                (s["id"], caller.workspace_id),
            )
            s["open_requests"] = (await cur.fetchone())[0]
    return suppliers


@router.post("/api/suppliers/{supplier_id}/followups")
async def create_followup(supplier_id: str, body: dict, caller: Caller = Depends(require_reviewer)):
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            cur = await conn.execute(
                "SELECT id FROM suppliers WHERE id = %s AND workspace_id = %s",
                (supplier_id, caller.workspace_id),
            )
            if await cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Supplier not found")
            import json as _json
            cur = await conn.execute(
                "INSERT INTO supplier_followups (workspace_id, supplier_id, product_id, field_key,"
                " status, recipient, subject, items)"
                " VALUES (%s,%s,%s,%s,'draft',%s,%s,%s::jsonb) RETURNING id",
                (caller.workspace_id, supplier_id, body.get("product_id"), body.get("field_key"),
                 body.get("recipient"), body.get("subject"),
                 _json.dumps(body.get("items") or [])),
            )
            fid = str((await cur.fetchone())[0])
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'followup.drafted','supplier_followup',%s)",
                (caller.workspace_id, caller.user_id, fid),
            )
    return {"id": fid, "status": "draft"}
