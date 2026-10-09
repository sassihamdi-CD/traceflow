from __future__ import annotations

import json

import nanoid
from fastapi import APIRouter, Depends, Form, UploadFile

from app import errors

from app.auth import Caller, ensure_workspace_exists, get_caller, require_member, require_reviewer
from app.db import get_pool
from app.schemas import ProductCreate, uuid_or_404
from app.services.detail import fetch_field_definitions, product_detail
from app.services.listing import list_products
from app.services.extraction import (
    csv_to_table,
    extract_parties_pdf,
    extract_pdf_native,
    extract_table_mapped,
    sanitize_items,
    validate_item_locations,
    xlsx_to_table,
)
from app.services.storage import (
    check_size,
    classify_file,
    new_storage_key,
    upload_to_storage,
    verify_file_content,
)

router = APIRouter()


@router.get("/api/products")
async def get_products(caller: Caller = Depends(require_member)):
    pool = await get_pool()
    async with pool.connection() as conn:
        return await list_products(conn, caller.workspace_id)


@router.post("/api/products")
async def create_product(body: ProductCreate, caller: Caller = Depends(require_reviewer)):
    pool = await get_pool()
    slug = nanoid.generate(size=12)
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
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
    uuid_or_404(product_id)
    allowed = {k: (body.get(k) or "").strip() for k in ("name", "sku", "manufacturer_name")}
    allowed = {k: v for k, v in allowed.items() if v}
    if not allowed:
        raise errors.nothing_to_update()
    import json as _json
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            sets = ", ".join(f"{k} = %s" for k in allowed)
            cur = await conn.execute(
                f"UPDATE products SET {sets} WHERE id = %s AND workspace_id = %s",
                (*allowed.values(), product_id, caller.workspace_id),
            )
            if cur.rowcount == 0:
                raise errors.not_found("That item")
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
    uuid_or_404(document_id, "That document")
    supplier_id = body.get("supplier_id")
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        async with conn.transaction():
            if supplier_id is not None:
                cur = await conn.execute(
                    "SELECT id FROM suppliers WHERE id = %s AND workspace_id = %s",
                    (supplier_id, caller.workspace_id),
                )
                if await cur.fetchone() is None:
                    raise errors.not_found("That supplier")
            cur = await conn.execute(
                "UPDATE documents SET supplier_id = %s WHERE id = %s AND workspace_id = %s",
                (supplier_id, document_id, caller.workspace_id),
            )
            if cur.rowcount == 0:
                raise errors.not_found("That document")
            await conn.execute(
                "INSERT INTO audit_log (workspace_id, actor, action, entity_type, entity_id)"
                " VALUES (%s,%s,'document.linked','document',%s)",
                (caller.workspace_id, caller.user_id, document_id),
            )
    return {"ok": True, "supplier_id": supplier_id}


@router.get("/api/products/{product_id}")
async def get_product(product_id: str, caller: Caller = Depends(require_member)):
    uuid_or_404(product_id)
    pool = await get_pool()
    async with pool.connection() as conn:
        detail = await product_detail(conn, caller.workspace_id, product_id)
    if detail is None:
        raise errors.not_found("That item")
    return detail


async def _run_extraction(document_id: str, product_id: str, ext: str, body: bytes, workspace_id: str):
    """Legacy in-process extraction (kept for tests/backfill only).

    NOT on the upload path anymore: uploads enqueue one row in
    extraction_jobs and the standalone worker (scripts/worker.py) is the
    SOLE extractor, so each document yields exactly one set of
    field_values. Calling this alongside the worker would double-insert.

    Always records the outcome on the document row (done + count, or failed +
    error message) so the reviewer can tell "empty but processed" apart from
    "processing failed". Failure still yields zero rows, never partial data.
    """
    pool = await get_pool()
    async with pool.connection() as conn:
        async def mark(status: str, count: int = 0, error: str | None = None, truncated: bool = False):
            await conn.execute(
                "UPDATE documents SET extraction_status = %s, extracted_count = %s,"
                " extraction_error = %s, extraction_truncated = %s WHERE id = %s",
                (status, count, error, truncated, document_id),
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
        table = None
        try:
            if ext == ".pdf":
                items = await extract_pdf_native(body, defs)
            elif ext == ".xlsx":
                table = xlsx_to_table(body)
                items = await extract_table_mapped(table, defs)
            else:  # .csv
                table = csv_to_table(body)
                items = await extract_table_mapped(table, defs)
        except Exception as e:
            await mark("failed", 0, f"{type(e).__name__}: {e}"[:500])
            return
        allowed = {d["field_key"] for d in defs}
        clean = validate_item_locations(sanitize_items(items, allowed), ext, table)
        for it in clean:
            await conn.execute(
                "INSERT INTO field_values (workspace_id, product_id, field_key, value, unit,"
                " status, document_id, location, extracted_by)"
                " VALUES (%s,%s,%s,%s,%s,'proposed',%s,%s,'ai_system')",
                (workspace_id, product_id, it["field_key"], it["value"],
                 it["unit"], document_id, it["location"]),
            )
        truncated = bool(getattr(table, "truncated", False))
        await mark("done", len(clean), truncated=truncated)
        # Track A: full per-document transcription (every labeled value).
        # Passport mapping above stays untouched. PDF only; failure-tolerant.
        try:
            if ext == ".pdf":
                from app.services.document_items import extract_full_items_pdf, store_document_items
                full = await extract_full_items_pdf(body)
                if full:
                    stored = await store_document_items(conn, workspace_id, document_id, full)
                    if getattr(stored, "truncated", False):
                        truncated = True
                        await mark("done", len(clean), truncated=True)
        except Exception as e:
            print(f"document_items fallback: {type(e).__name__}: {e}")
        # Who is on this document? Stored for one-click supplier linking.
        # Failure-tolerant by design: [] when detection fails.
        if ext == ".pdf":
            parties = await extract_parties_pdf(body)
            if getattr(parties, "truncated", False) and not truncated:
                truncated = True
                await mark("done", len(clean), truncated=True)
            if parties:
                import json as _json
                await conn.execute(
                    "UPDATE documents SET detected_parties = %s::jsonb WHERE id = %s",
                    (_json.dumps(parties), document_id),
                )
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
    supplier_id: str | None = Form(None),
    caller: Caller = Depends(require_reviewer),
):
    """Store the file + enqueue ONE extraction job. Single-path extraction:
    the worker (scripts/worker.py) is the sole extractor — no BackgroundTasks
    here, so a document can never yield two sets of field_values."""
    uuid_or_404(product_id, "That product")
    # Normalize empty-string supplier_id from HTML forms ("") to None
    # so the FK insert can't 500 on a zero-length id.
    if supplier_id is not None and not str(supplier_id).strip():
        supplier_id = None
    if supplier_id is not None:
        uuid_or_404(supplier_id, "That supplier")
    body = await file.read()
    if len(body) > 25 * 1024 * 1024:
        raise errors.file_too_large(25)
    ext = classify_file(file.filename or "", body[:8])  # 415 here on unknown type
    check_size(ext, len(body))  # 413 per-type caps (PDF < 25MB for Claude limits)
    verify_file_content(file.filename or "", ext, body)  # 415 deep content check
    content_types = {".pdf": "application/pdf",
                     ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     ".csv": "text/csv"}
    pool = await get_pool()
    async with pool.connection() as conn:
        await ensure_workspace_exists(conn, caller.workspace_id)
        cur = await conn.execute(
            "SELECT id FROM products WHERE id = %s AND workspace_id = %s",
            (product_id, caller.workspace_id),
        )
        if await cur.fetchone() is None:
            raise errors.not_found("That product")
        if supplier_id:
            cur = await conn.execute(
                "SELECT id FROM suppliers WHERE id = %s AND workspace_id = %s",
                (supplier_id, caller.workspace_id),
            )
            if await cur.fetchone() is None:
                raise errors.not_found("That supplier")
        key = new_storage_key(caller.workspace_id, product_id, file.filename or "upload")
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
    return {"document_id": doc_id, "status": "extracting"}
