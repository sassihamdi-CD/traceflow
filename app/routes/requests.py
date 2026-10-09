from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from app import errors

from app.auth import Caller, ensure_workspace_exists, require_member, require_reviewer
from app.db import get_pool
from app.schemas import uuid_or_404
from app.services.requests import request_detail

router = APIRouter()


@router.post("/api/requests")
async def create_request(body: dict, caller: Caller = Depends(require_reviewer)):
    """One intake for the client's email: creates the product dossier AND the
    request in a single transaction. Accepts either an existing product_id or
    a new_product {sku, name, manufacturer_name, category?} object."""
    for k in ("requester_name", "subject"):
        if not body.get(k):
            raise errors.missing_field(k)
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            product_id = body.get("product_id")
            if product_id:
                uuid_or_404(product_id, "That product")
                cur = await conn.execute(
                    "SELECT id FROM products WHERE id = %s AND workspace_id = %s",
                    (product_id, caller.workspace_id),
                )
                if await cur.fetchone() is None:
                    raise errors.not_found("That product")
            else:
                np = body.get("new_product") or {}
                for k in ("sku", "name", "manufacturer_name"):
                    if not np.get(k):
                        raise errors.missing_field(
                            f"a product to link (existing product, or a new one with SKU, name and manufacturer — missing “{k}”)"
                        )
                import nanoid as _nanoid
                cur = await conn.execute(
                    "INSERT INTO products (workspace_id, sku, name, category,"
                    " manufacturer_name, public_slug) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                    (caller.workspace_id, np["sku"], np["name"],
                     np.get("category", "footwear"), np["manufacturer_name"],
                     _nanoid.generate(size=12)),
                )
                product_id = str((await cur.fetchone())[0])
                await conn.execute(
                    "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                    " VALUES (%s,%s,'product.created','product',%s)",
                    (caller.workspace_id, caller.user_id, product_id),
                )
            cur = await conn.execute(
                "INSERT INTO client_requests (workspace_id, product_id, requester_name,"
                " requester_org, subject, message) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                (caller.workspace_id, product_id, body["requester_name"],
                 body.get("requester_org"), body["subject"], body.get("message", "")),
            )
            rid = str((await cur.fetchone())[0])
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'request.created','client_request',%s)",
                (caller.workspace_id, caller.user_id, rid),
            )
    return {"id": rid, "product_id": product_id}


@router.get("/api/requests")
async def get_requests(caller: Caller = Depends(require_member)):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT r.id, r.product_id, r.requester_name, r.requester_org, r.subject,"
            " r.status, r.received_at, p.name, p.sku FROM client_requests r"
            " JOIN products p ON p.id = r.product_id"
            " WHERE r.workspace_id = %s ORDER BY r.received_at DESC",
            (caller.workspace_id,),
        )
        items = [{
            "id": str(x[0]), "product_id": str(x[1]), "requester_name": x[2],
            "requester_org": x[3], "subject": x[4], "status": x[5],
            "received_at": x[6].isoformat(), "product_name": x[7], "product_sku": x[8],
        } for x in await cur.fetchall()]
        out = []
        for it in items:
            d = await request_detail(conn, caller.workspace_id, it["id"])
            if d is None:
                continue
            dos = d["dossier"]
            out.append({**it,
                        "readiness_percent": dos["readiness_percent"],
                        "actions_required": dos["actions_required"],
                        "counts": dos["counts"]})
    return out


@router.get("/api/requests/{request_id}")
async def get_request(request_id: str, caller: Caller = Depends(require_member)):
    uuid_or_404(request_id)
    pool = await get_pool()
    async with pool.connection() as conn:
        d = await request_detail(conn, caller.workspace_id, request_id)
    if d is None:
        raise errors.not_found("That request")
    return d


@router.post("/api/requests/{request_id}/status")
async def set_request_status(request_id: str, body: dict, caller: Caller = Depends(require_reviewer)):
    """UI contract (D22): {status: open|responded}. 422 on bad status,
    404 when the request is not in the caller's workspace."""
    uuid_or_404(request_id)
    if body.get("status") not in ("open", "responded"):
        raise errors.bad_status()
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            cur = await conn.execute(
                "UPDATE client_requests SET status = %s WHERE id = %s AND workspace_id = %s",
                (body["status"], request_id, caller.workspace_id),
            )
            # psycopg async rowcount via cursor attribute
            if cur.rowcount == 0:
                raise errors.not_found("That request")
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
                " VALUES (%s,%s,'request.status','client_request',%s,%s::jsonb)",
                (caller.workspace_id, caller.user_id, request_id,
                 json.dumps({"status": body["status"]})),
            )
    return {"ok": True, "status": body["status"]}
