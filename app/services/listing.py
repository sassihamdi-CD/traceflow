"""Product listing with computed readiness (powers the console dashboard).

Read-only aggregate. Same pure state/readiness functions as the detail view,
same workspace scoping. Adds no new write paths.
"""
from __future__ import annotations

from app.services.detail import fetch_field_definitions
from app.services.readiness import compute_readiness
from app.services.state import compute_state


async def _has_documents(conn, product_id: str, workspace_id: str) -> bool:
    cur = await conn.execute(
        "SELECT 1 FROM documents WHERE product_id = %s AND workspace_id = %s LIMIT 1",
        (product_id, workspace_id),
    )
    return await cur.fetchone() is not None


def next_action(counts: dict, total_required: int, published: bool, has_documents: bool) -> dict:
    """The single most useful next step for a dossier, computed from state."""
    if published:
        return {"key": "live", "label": "Live — share the passport link"}
    if total_required > 0 and counts["verified"] == total_required:
        return {"key": "publish", "label": "Ready to publish"}
    if counts["conflicting"] > 0:
        return {"key": "resolve", "label": f"Resolve {counts['conflicting']} conflict(s)"}
    if counts["proposed"] > 0:
        return {"key": "review", "label": f"Review {counts['proposed']} proposal(s)"}
    if not has_documents:
        return {"key": "upload", "label": "Upload source documents"}
    return {"key": "chase", "label": f"Chase {counts['missing']} missing field(s)"}


async def list_products(conn, workspace_id: str) -> list[dict]:
    cur = await conn.execute(
        "SELECT id, sku, name, category, manufacturer_name, public_slug,"
        " passport_published, published_at, created_at FROM products"
        " WHERE workspace_id = %s ORDER BY created_at DESC",
        (workspace_id,),
    )
    products = []
    for r in await cur.fetchall():
        products.append({
            "id": str(r[0]), "sku": r[1], "name": r[2], "category": r[3],
            "manufacturer_name": r[4], "public_slug": r[5],
            "passport_published": bool(r[6]),
            "published_at": r[7].isoformat() if r[7] else None,
            "created_at": r[8].isoformat(),
        })
    for p in products:
        defs = await fetch_field_definitions(conn, p["category"])
        cur = await conn.execute(
            "SELECT field_key, status FROM field_values"
            " WHERE product_id = %s AND workspace_id = %s",
            (p["id"], workspace_id),
        )
        by_field: dict[str, list[str]] = {}
        for fk, st in await cur.fetchall():
            by_field.setdefault(fk, []).append(st)
        counts = {"verified": 0, "proposed": 0, "missing": 0, "conflicting": 0}
        for d in defs:
            if d["required"]:
                counts[compute_state(by_field.get(d["field_key"], []))["state"]] += 1
        total = sum(1 for d in defs if d["required"])
        p["counts"] = counts
        p["total_required"] = total
        p.update(compute_readiness(
            counts["verified"], counts["proposed"],
            counts["missing"], counts["conflicting"], total))
        p["next_action"] = next_action(
            counts, total, bool(r[6]),
            await _has_documents(conn, p["id"], workspace_id),
        )
    return products
