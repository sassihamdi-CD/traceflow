from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Caller, get_caller, require_admin
from app.db import get_pool
from app.services.detail import product_detail

router = APIRouter()


@router.post("/api/products/{product_id}/publish")
async def publish_product(product_id: str, caller: Caller = Depends(require_admin)):
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            detail = await product_detail(conn, caller.workspace_id, product_id)
            if detail is None:
                raise HTTPException(status_code=404, detail="Not found")
            unverified = [f["field_key"] for f in detail["fields"]
                          if f["required"] and f["state"] != "verified"]
            if unverified:
                raise HTTPException(
                    status_code=422,
                    detail=f"Cannot publish: unverified required fields: {', '.join(unverified)}",
                )
            await conn.execute(
                "UPDATE products SET passport_published = TRUE, published_at = now()"
                " WHERE id = %s AND workspace_id = %s",
                (product_id, caller.workspace_id),
            )
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'passport.published','product',%s)",
                (caller.workspace_id, caller.user_id, product_id),
            )
    return {"ok": True, "published": True}
