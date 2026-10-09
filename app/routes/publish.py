from __future__ import annotations

from fastapi import APIRouter, Depends

from app import errors
from app.auth import Caller, ensure_workspace_exists, get_caller, require_admin
from app.db import get_pool
from app.schemas import uuid_or_404
from app.services.detail import product_detail

router = APIRouter()


@router.post("/api/products/{product_id}/publish")
async def publish_product(product_id: str, caller: Caller = Depends(require_admin)):
    """Publish the public passport.

    PILOT: single role — any workspace member can publish (require_admin is
    an alias of require_member until the commercial phase reintroduces tiers).

    Gate blocks publish when ANY of these hold for required fields:
    - unverified: state != verified (missing/proposed/conflicting)
    - pending_review: state == verified BUT has_new_proposal (a fresh
      proposal arrived after verification — explicit, not publishable)
    - out_of_date: backing accepted/corrected rows from documents past
      valid_until (same query as request gaps)
    - rejected_unreplaced: only rejected rows, nothing verified/proposed
    """
    uuid_or_404(product_id)
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            detail = await product_detail(conn, caller.workspace_id, product_id)
            if detail is None:
                raise errors.not_found("That product")
            labels = {f["field_key"]: f.get("label") or f["field_key"]
                      for f in detail["fields"]}
            unverified = [labels[f["field_key"]] for f in detail["fields"]
                          if f["required"] and f["state"] != "verified"]
            # Explicit: verified + a new unreviewed proposal is NOT publishable.
            pending_review = [labels[f["field_key"]] for f in detail["fields"]
                              if f["required"] and f["state"] == "verified"
                              and f.get("has_new_proposal")]
            cur = await conn.execute(
                "SELECT DISTINCT fv.field_key FROM field_values fv"
                " JOIN documents d ON d.id = fv.document_id"
                " WHERE fv.product_id = %s AND fv.workspace_id = %s"
                " AND fv.status IN ('accepted','corrected')"
                " AND d.valid_until IS NOT NULL AND d.valid_until < CURRENT_DATE",
                (product_id, caller.workspace_id),
            )
            out_of_date = [labels.get(row[0], row[0]) for row in await cur.fetchall()]
            rejected_unreplaced = [
                labels[f["field_key"]] for f in detail["fields"]
                if f["required"] and f["state"] == "missing"
                and any(v["status"] == "rejected" for v in f.get("values", []))
            ]
            if unverified or pending_review or out_of_date or rejected_unreplaced:
                raise errors.publish_blocked(unverified, pending_review or None,
                                             out_of_date or None, rejected_unreplaced or None)
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
