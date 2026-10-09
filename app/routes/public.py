"""Public passport: isolated handler, no auth, verified-only SQL (spec section 8).

- Lookup by public_slug, never id.
- Unpublished -> 404 (no existence leak).
- WHERE status IN ('accepted','corrected') in the SQL itself.
- Response: label, value, unit ONLY.
"""
from __future__ import annotations

from fastapi import APIRouter

from app import errors

from app.db import get_pool

router = APIRouter()


@router.get("/api/public/passport/{public_slug}")
async def public_passport(public_slug: str):
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id, name, category FROM products WHERE public_slug = %s AND passport_published = TRUE",
            (public_slug,),
        )
        row = await cur.fetchone()
        if row is None:
            raise errors.not_found("That passport")
        product_id, name, category = row[0], row[1], row[2]
        # Structurally incapable of returning proposed/rejected: filter is in SQL.
        cur = await conn.execute(
            "SELECT fd.label, fv.value, fv.unit FROM field_values fv"
            " JOIN field_definitions fd ON fd.category = %s AND fd.field_key = fv.field_key"
            " WHERE fv.product_id = %s AND fv.status IN ('accepted','corrected')"
            " ORDER BY fd.display_order",
            (category, product_id),
        )
        fields = [{"label": r[0], "value": r[1], "unit": r[2]} for r in await cur.fetchall()]
    return {"product_name": name, "fields": fields}
