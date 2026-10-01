from __future__ import annotations

import json

import nanoid
from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile

from app.auth import Caller, get_caller, require_reviewer
from app.db import get_pool
from app.schemas import ProductCreate
from app.services.detail import fetch_field_definitions, product_detail
from app.services.listing import list_products
from app.services.extraction import (
    csv_to_table,
    extract_parties_pdf,
    extract_pdf_native,
    extract_table_mapped,
    sanitize_items,
    xlsx_to_table,
)
from app.services.storage import classify_file, new_storage_key, upload_to_storage

router = APIRouter()


@router.get("/api/products")
async def get_products(caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        return await list_products(conn, caller.workspace_id)


@router.post("/api/products")
async def create_product(body: ProductCreate, caller: Caller = Depends(require_reviewer)):
    pool = await get_pool()
    slug = nanoid.generate(size=12)
    async with pool.connection() as conn:
        cur = await conn.execute(
            "INSERT INTO products (workspace_id, sku, name, category, manufacturer_name, public_slug)"
            " VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            (caller.workspace_id, body.sku, body.name, body.category, body.manufacturer_name, slug),
        )
        pid = str((await cur.fetchone())[0])
        await conn.execute(
            "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
            " VALUES (%s,%s,'product.created','product',%s,%s::jsonb)",
            (caller.workspace_id, caller.user_id, pid, json.dumps({"sku": body.sku})),
        )
    return {"id": pid, "public_slug": slug}


@router.patch("/api/products/{product_id}")
async def rename_product(product_id: str, body: dict, caller: Caller = Depends(require_reviewer)):
    """Rename a dossier (name / sku / manufacturer_name). Identity fields only;
    evidence and history are untouched. One audit row, same transaction."""
    allowed = {k: (body.get(k) or "").strip() for k in ("name", "sku", "manufacturer_name")}
    allowed = {k: v for k, v in allowed.items() if v}
    if not allowed:
        raise HTTPException(status_code=422, detail="Nothing to update")
    import json as _json
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            sets = ", ".join(f"{k} = %s" for k in allowed)
            cur = await conn.execute(
                f"UPDATE products SET {sets} WHERE id = %s AND workspace_id = %s",
                (*allowed.values(), product_id, caller.workspace_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Not found")
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
                " VALUES (%s,%s,'product.renamed','product',%s,%s::jsonb)",
                (caller.workspace_id, caller.user_id, product_id, _json.dumps(allowed)),
            )
    return {"ok": True, "updated": allowed}


@router.patch("/api/documents/{document_id}")
async def link_document(document_id: str, body: dict, caller: Caller = Depends(require_reviewer)):
    """Link a document to a supplier (or unlink with supplier_id null).
    Used by the one-click 'detected party → supplier' flow and manual linking."""
    supplier_id = body.get("supplier_id")
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            if supplier_id is not None:
                cur = await conn.execute(
                    "SELECT id FROM suppliers WHERE id = %s AND workspace_id = %s",
                    (supplier_id, caller.workspace_id),
                )
                if await cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Supplier not found")
            cur = await conn.execute(
                "UPDATE documents SET supplier_id = %s WHERE id = %s AND workspace_id = %s",
                (supplier_id, document_id, caller.workspace_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Document not found")
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'document.linked','document',%s)",
                (caller.workspace_id, caller.user_id, document_id),
            )
    return {"ok": True, "supplier_id": supplier_id}


@router.get("/api/products/{product_id}")
async def get_product(product_id: str, caller: Caller = Depends(get_caller)):
    pool = await get_pool()
    async with pool.connection() as conn:
        detail = await product_detail(conn, caller.workspace_id, product_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Not found")
    return detail


async def _run_extraction(document_id: str, product_id: str, ext: str, body: bytes, workspace_id: str):
    """Background task: branch by file type, insert proposed rows only.

    Always records the outcome on the document row (done + count, or failed +
    error class) so the reviewer can tell "empty but processed" apart from
    "processing failed". Failure still yields zero rows, never partial data.
    """
    pool = await get_pool()
    async with pool.connection() as conn:
        async def mark(status: str, count: int = 0, error: str | None = None):
            await conn.execute(
                "UPDATE documents SET extraction_status = %s, extracted_count = %s,"
                " extraction_error = %s WHERE id = %s",
                (status, count, error, document_id),
            )

        cur = await conn.execute(
            "SELECT category FROM products WHERE id = %s AND workspace_id = %s",
            (product_id, workspace_id),
        )
        row = await cur.fetchone()
        if row is None:
            await mark("failed", 0, "product gone")
            return
        defs = await fetch_field_definitions(conn, row[0])
        try:
            if ext == ".pdf":
                items = await extract_pdf_native(body, defs)
            elif ext == ".xlsx":
                items = await extract_table_mapped(xlsx_to_table(body), defs)
            else:  # .csv
                items = await extract_table_mapped(csv_to_table(body), defs)
        except Exception as e:
            await mark("failed", 0, f"{type(e).__name__}")
            return
        allowed = {d["field_key"] for d in defs}
        clean = sanitize_items(items, allowed)
        for it in clean:
            await conn.execute(
                "INSERT INTO field_values (workspace_id, product_id, field_key, value, unit,"
                " status, document_id, location, extracted_by)"
                " VALUES (%s,%s,%s,%s,%s,'proposed',%s,%s,'ai_system')",
                (workspace_id, product_id, it["field_key"], it["value"],
                 it["unit"], document_id, it["location"]),
            )
        await mark("done", len(clean))
        # Track A: full per-document transcription (every labeled value).
        # Passport mapping above stays untouched. PDF only; failure-tolerant.
        try:
            if ext == ".pdf":
                from app.services.document_items import extract_full_items_pdf, store_document_items
                full = await extract_full_items_pdf(body)
                if full:
                    await store_document_items(conn, workspace_id, document_id, full)
        except Exception as e:
            print(f"document_items fallback: {type(e).__name__}: {e}")
        # Who is on this document? Stored for one-click supplier linking.
        # Failure-tolerant by design: [] when detection fails.
        if ext == ".pdf":
            parties = await extract_parties_pdf(body)
            if parties:
                import json as _json
                await conn.execute(
                    "UPDATE documents SET detected_parties = %s::jsonb WHERE id = %s",
                    (_json.dumps(parties), document_id),
                )


@router.post("/api/products/{product_id}/documents")
async def upload_document(
    product_id: str,
    file: UploadFile,
    background: BackgroundTasks,
    supplier_id: str | None = Form(None),
    caller: Caller = Depends(require_reviewer),
):
    # Normalize empty-string supplier_id from HTML forms ("") to None
    # so the FK insert can't 500 on a zero-length id.
    if supplier_id is not None and not str(supplier_id).strip():
        supplier_id = None
    body = await file.read()
    if len(body) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 25MB).")
    ext = classify_file(file.filename or "", body[:8])  # 415 here on unknown type
    content_types = {".pdf": "application/pdf",
                     ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     ".csv": "text/csv"}
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id FROM products WHERE id = %s AND workspace_id = %s",
            (product_id, caller.workspace_id),
        )
        if await cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Product not found")
        if supplier_id:
            cur = await conn.execute(
                "SELECT id FROM suppliers WHERE id = %s AND workspace_id = %s",
                (supplier_id, caller.workspace_id),
            )
            if await cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Supplier not found")
        key = new_storage_key(product_id, file.filename or "upload")
        upload_to_storage(key, body, content_types[ext])
        cur = await conn.execute(
            "INSERT INTO documents (workspace_id, product_id, supplier_id, filename, storage_key,"
            " extraction_status, extracted_count)"
            " VALUES (%s,%s,%s,%s,%s,'extracting',0) RETURNING id",
            (caller.workspace_id, product_id, supplier_id, file.filename, key),
        )
        doc_id = str((await cur.fetchone())[0])
        try:
            await conn.execute(
                "INSERT INTO extraction_jobs (workspace_id, document_id, status)"
                " VALUES (%s,%s,'queued')",
                (caller.workspace_id, doc_id),
            )
        except Exception as e:
            print(f"extraction_jobs insert fallback: {type(e).__name__}: {e}")
        await conn.execute(
            "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id, detail)"
            " VALUES (%s,%s,'document.uploaded','document',%s,%s::jsonb)",
            (caller.workspace_id, caller.user_id, doc_id, json.dumps({"filename": file.filename or ""})),
        )
    background.add_task(_run_extraction, doc_id, product_id, ext, body, caller.workspace_id)
    return {"document_id": doc_id, "status": "extracting"}
