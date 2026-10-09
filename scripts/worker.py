"""Standalone DB-backed extraction queue poller (Phase 3).

Polls extraction_jobs for queued rows with SELECT ... FOR UPDATE SKIP LOCKED,
marks running (attempts+1), runs real extraction (document bytes from R2 +
branch by file type), and on exception marks failed with error truncated to
500 chars.

Usage:
    DATABASE_URL=postgresql://... python scripts/worker.py [--once]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

# Repo-root bootstrap: when run as `python scripts/worker.py` (Docker CMD),
# sys.path[0] is scripts/, so `from app...` imports fail. Same pattern as
# scripts/backfill_parties.py. Without this every job fails with
# ModuleNotFoundError: No module named 'app'.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg

CLAIM_SQL = """
SELECT id, document_id, workspace_id
FROM extraction_jobs
WHERE status = 'queued'
ORDER BY created_at
LIMIT 1
FOR UPDATE SKIP LOCKED
"""


def get_conn():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(dsn)


def _fetch_document_bytes(storage_key: str) -> bytes:
    """Download document bytes from R2. Lazy boto3 import so --help/tests
    never require AWS deps."""
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("R2_ENDPOINT") or None,
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY") or None,
    )
    bucket = os.environ.get("R2_BUCKET", "traceflow-docs")
    obj = client.get_object(Bucket=bucket, Key=storage_key)
    return obj["Body"].read()


def _run_real_extraction(conn, job_id, document_id, workspace_id) -> None:
    """Fetch document + product + field defs, download bytes from R2, branch
    by storage_key extension, insert proposed field_values, and mark both the
    document and the job done/failed. Raises on failure (caller records it)."""
    from app.services.extraction import (
        csv_to_table,
        extract_parties_pdf,
        extract_pdf_native,
        extract_table_mapped,
        sanitize_items,
        validate_item_locations,
        xlsx_to_table,
    )

    with conn.cursor() as cur:
        cur.execute(
            "SELECT product_id, storage_key FROM documents WHERE id = %s",
            (document_id,),
        )
        doc = cur.fetchone()
        if doc is None:
            raise RuntimeError("document gone")
        product_id, storage_key = doc

        cur.execute("SELECT category FROM products WHERE id = %s", (product_id,))
        prow = cur.fetchone()
        if prow is None:
            raise RuntimeError("product gone")
        category = prow[0]

        cur.execute(
            "SELECT field_key, label, required, display_order FROM field_definitions"
            " WHERE category = %s ORDER BY display_order",
            (category,),
        )
        defs = [
            {"field_key": r[0], "label": r[1], "required": bool(r[2]), "display_order": r[3]}
            for r in cur.fetchall()
        ]

    with conn.cursor() as cur:
        # Idempotency: exactly one set of field_values per document. If rows
        # already exist (legacy BackgroundTasks double-path or a duplicate
        # queue row), mark done without inserting a second set.
        cur.execute(
            "SELECT COUNT(*) FROM field_values WHERE document_id = %s",
            (document_id,),
        )
        if (cur.fetchone() or [0])[0] > 0:
            cur.execute(
                "UPDATE documents SET extraction_status = 'done', extraction_error = NULL"
                " WHERE id = %s",
                (document_id,),
            )
            cur.execute(
                "UPDATE extraction_jobs SET status = 'done', error = NULL,"
                " updated_at = now() WHERE id = %s",
                (job_id,),
            )
            conn.commit()
            return

    try:
        body = _fetch_document_bytes(storage_key)
    except Exception as exc:
        raise RuntimeError(f"r2-fetch-failed: {exc}") from exc

    ext = os.path.splitext(storage_key or "")[1].lower()
    table = None
    if ext == ".pdf":
        items = asyncio.run(extract_pdf_native(body, defs))
    elif ext == ".xlsx":
        table = xlsx_to_table(body)
        items = asyncio.run(extract_table_mapped(table, defs))
    elif ext == ".csv":
        table = csv_to_table(body)
        items = asyncio.run(extract_table_mapped(table, defs))
    else:
        raise RuntimeError(f"unsupported-type: {ext or '(none)'}")

    allowed = {d["field_key"] for d in defs}
    clean = validate_item_locations(sanitize_items(items, allowed), ext, table)
    truncated = bool(getattr(table, "truncated", False))

    with conn.cursor() as cur:
        for it in clean:
            cur.execute(
                "INSERT INTO field_values (workspace_id, product_id, field_key, value, unit,"
                " status, document_id, location, extracted_by)"
                " VALUES (%s,%s,%s,%s,%s,'proposed',%s,%s,'ai_system')",
                (
                    workspace_id,
                    product_id,
                    it["field_key"],
                    it["value"],
                    it["unit"],
                    document_id,
                    it["location"],
                ),
            )
        # Track A: full per-document transcription (every labeled value).
        # Passport mapping above stays untouched. PDF only; failure-tolerant.
        try:
            if ext == ".pdf":
                from app.services.document_items import extract_full_items_pdf, store_document_items
                full = asyncio.run(extract_full_items_pdf(body))
                if full:
                    stored = asyncio.run(store_document_items(conn, workspace_id, document_id, full))
                    if getattr(stored, "truncated", False):
                        truncated = True
        except Exception as exc:  # noqa: BLE001
            print(f"document_items fallback: {type(exc).__name__}: {exc}")
        parties: list = []
        if ext == ".pdf":
            try:
                parties = asyncio.run(extract_parties_pdf(body)) or []
                if getattr(parties, "truncated", False):
                    truncated = True
            except Exception:
                parties = []
            cur.execute(
                "UPDATE documents SET extraction_status = 'done', extracted_count = %s,"
                " extraction_error = NULL, extraction_truncated = %s,"
                " detected_parties = %s::jsonb WHERE id = %s",
                (len(clean), truncated, json.dumps(parties), document_id),
            )
        else:
            cur.execute(
                "UPDATE documents SET extraction_status = 'done', extracted_count = %s,"
                " extraction_error = NULL, extraction_truncated = %s WHERE id = %s",
                (len(clean), truncated, document_id),
            )
        cur.execute(
            "UPDATE extraction_jobs SET status = 'done', error = NULL, "
            "updated_at = now() WHERE id = %s",
            (job_id,),
        )
        conn.commit()


def process_one(conn) -> bool:
    """Claim a single queued job and transition it. Returns True if a job was handled."""
    with conn.cursor() as cur:
        cur.execute(CLAIM_SQL)
        row = cur.fetchone()
        if row is None:
            conn.commit()
            return False
        job_id, document_id, workspace_id = row
        cur.execute(
            "UPDATE extraction_jobs SET status = 'running', attempts = attempts + 1, "
            "updated_at = now() WHERE id = %s",
            (job_id,),
        )
        conn.commit()
        try:
            _run_real_extraction(conn, job_id, document_id, workspace_id)
        except Exception as exc:  # noqa: BLE001
            # Class + message (truncated): class-only errors are low-signal
            # for reviewers (audit C15). The r2-fetch prefix survives inside
            # the message instead of being collapsed to a bare token.
            err = f"{type(exc).__name__}: {exc}"[:500]
            with conn.cursor() as cur2:
                cur2.execute(
                    "UPDATE extraction_jobs SET status = 'failed', error = %s, "
                    "updated_at = now() WHERE id = %s",
                    (err, job_id),
                )
                try:
                    cur2.execute(
                        "UPDATE documents SET extraction_status = 'failed',"
                        " extraction_error = %s WHERE id = %s",
                        (err, document_id),
                    )
                except Exception:
                    pass
            conn.commit()
        return True


def run_loop(once: bool = False, poll_interval: float = 2.0) -> None:
    with get_conn() as conn:
        while True:
            handled = process_one(conn)
            if once:
                return
            if not handled:
                time.sleep(poll_interval)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="TraceFlow extraction queue worker")
    parser.add_argument("--once", action="store_true", help="Process at most one job then exit (tests/CI)")
    args = parser.parse_args(argv)
    run_loop(once=args.once)


if __name__ == "__main__":
    main()
