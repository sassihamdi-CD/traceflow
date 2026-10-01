"""Request detail: the client request plus the product's computed dossier.

Reuses product_detail for all field states/readiness — single source of truth.
Adds request-scoped gap analysis and open follow-ups.
"""
from __future__ import annotations

from app.services.detail import product_detail


async def request_detail(conn, workspace_id: str, request_id: str) -> dict | None:
    cur = await conn.execute(
        "SELECT id, product_id, requester_name, requester_org, subject, message,"
        " status, received_at, created_at FROM client_requests"
        " WHERE id = %s AND workspace_id = %s",
        (request_id, workspace_id),
    )
    r = await cur.fetchone()
    if r is None:
        return None
    request = {
        "id": str(r[0]), "product_id": str(r[1]), "requester_name": r[2],
        "requester_org": r[3], "subject": r[4], "message": r[5], "status": r[6],
        "received_at": r[7].isoformat(), "created_at": r[8].isoformat(),
    }
    dossier = await product_detail(conn, workspace_id, request["product_id"])
    if dossier is None:
        return None

    # Gap analysis over required fields.
    gaps = {"missing": [], "conflicting": [], "proposed": [], "out_of_date": [], "rejected_unreplaced": []}
    for f in dossier["fields"]:
        if not f["required"]:
            continue
        if f["state"] == "missing":
            gaps["missing"].append(f["field_key"])
        elif f["state"] == "conflicting":
            gaps["conflicting"].append(f["field_key"])
        elif f["state"] == "proposed":
            gaps["proposed"].append(f["field_key"])
        elif f["state"] == "verified":
            rejected = [v for v in f["values"] if v["status"] == "rejected"]
            if rejected and not any(v["status"] == "proposed" for v in f["values"]):
                pass  # verified with history: not a gap
    # Out-of-date: documents past valid_until that back otherwise-verified fields.
    cur = await conn.execute(
        "SELECT DISTINCT fv.field_key FROM field_values fv JOIN documents d ON d.id = fv.document_id"
        " WHERE fv.product_id = %s AND fv.workspace_id = %s"
        " AND fv.status IN ('accepted','corrected') AND d.valid_until IS NOT NULL AND d.valid_until < CURRENT_DATE",
        (request["product_id"], workspace_id),
    )
    gaps["out_of_date"] = [row[0] for row in await cur.fetchall()]
    # Rejected-unreplaced: fields with only rejected rows (still count as missing in state,
    # surfaced separately so reviewers see a proposal was turned down, not just absent).
    for f in dossier["fields"]:
        if f["required"] and f["state"] == "missing" and any(v["status"] == "rejected" for v in f["values"]):
            gaps["rejected_unreplaced"].append(f["field_key"])

    cur = await conn.execute(
        "SELECT id, supplier_id, field_key, status, recipient, subject, items, created_at"
        " FROM supplier_followups WHERE product_id = %s AND workspace_id = %s ORDER BY created_at DESC",
        (request["product_id"], workspace_id),
    )
    followups = [{
        "id": str(x[0]), "supplier_id": str(x[1]), "field_key": x[2], "status": x[3],
        "recipient": x[4], "subject": x[5], "items": x[6],
        "created_at": x[7].isoformat(),
    } for x in await cur.fetchall()]

    return {"request": request, "dossier": dossier, "gaps": gaps, "followups": followups}
