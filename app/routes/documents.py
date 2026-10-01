"""Per-document reads: full transcribed values for one document.

Read-only, workspace-scoped. The passport mapping (field_values) is untouched;
this surface exposes document_items written by the Track A full extraction.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Caller, get_caller
from app.db import get_pool

router = APIRouter()


async def _fetch_document(conn, workspace_id: str, document_id: str) -> dict | None:
    cur = await conn.execute(
        "SELECT d.id, d.product_id, d.filename, d.extraction_status,"
        " d.extracted_count, d.extraction_error, d.uploaded_at"
        " FROM documents d WHERE d.id = %s AND d.workspace_id = %s",
        (document_id, workspace_id),
    )
    row = await cur.fetchone()
    if row is None:
        return None
    return {
        "id": str(row[0]),
        "product_id": str(row[1]),
        "filename": row[2],
        "extraction_status": row[3],
        "extracted_count": row[4],
        "extraction_error": row[5],
        "uploaded_at": row[6].isoformat() if row[6] is not None else None,
    }


async def _fetch_items(conn, workspace_id: str, document_id: str) -> list[dict]:
    cur = await conn.execute(
        "SELECT id, label, value, unit, location, created_at FROM document_items"
        " WHERE workspace_id = %s AND document_id = %s ORDER BY created_at",
        (workspace_id, document_id),
    )
    items = []
    for r in await cur.fetchall():
        items.append({
            "id": str(r[0]),
            "label": r[1],
            "value": r[2],
            "unit": r[3],
            "location": r[4],
            "created_at": r[5].isoformat() if r[5] is not None else None,
        })
    return items


@router.get("/api/documents/{document_id}")
async def get_document(document_id: str, caller: Caller = Depends(get_caller)):
    """Document detail: doc row + all transcribed items. 404 outside workspace."""
    pool = await get_pool()
    async with pool.connection() as conn:
        doc = await _fetch_document(conn, caller.workspace_id, document_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        doc["items"] = await _fetch_items(conn, caller.workspace_id, document_id)
    return doc


@router.get("/api/documents/{document_id}/items")
async def list_document_items(document_id: str, caller: Caller = Depends(get_caller)):
    """All transcribed items for one document. 404 outside workspace."""
    pool = await get_pool()
    async with pool.connection() as conn:
        doc = await _fetch_document(conn, caller.workspace_id, document_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        items = await _fetch_items(conn, caller.workspace_id, document_id)
    return {"document_id": document_id, "count": len(items), "items": items}
