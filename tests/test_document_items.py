"""Track A document_items contract tests (no DB/network — source-level assertions)."""
from __future__ import annotations

import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION_SRC = (REPO_ROOT / "migrations" / "011_document_items.sql").read_text()
SERVICE_SRC = (REPO_ROOT / "app" / "services" / "document_items.py").read_text()
ROUTES_SRC = (REPO_ROOT / "app" / "routes" / "documents.py").read_text()
PRODUCTS_SRC = (REPO_ROOT / "app" / "routes" / "products.py").read_text()
WORKER_SRC = (REPO_ROOT / "scripts" / "worker.py").read_text()


def test_migration_defines_document_items():
    assert "document_items" in MIGRATION_SRC
    assert "CREATE TABLE" in MIGRATION_SRC


def test_migration_columns():
    for token in ("workspace_id", "document_id", "label", "value", "unit", "location"):
        assert token in MIGRATION_SRC, f"migration missing column {token}"


def test_migration_index():
    assert "idx_document_items_doc" in MIGRATION_SRC
    assert "document_id" in MIGRATION_SRC


def test_migration_grant():
    assert "GRANT SELECT,INSERT,UPDATE,DELETE ON document_items TO traceflow_app" in MIGRATION_SRC.replace(
        "GRANT SELECT, INSERT, UPDATE, DELETE", "GRANT SELECT,INSERT,UPDATE,DELETE"
    )


def test_service_surface():
    assert "async def extract_full_items_pdf" in SERVICE_SRC
    assert "async def store_document_items" in SERVICE_SRC
    assert "def sanitize_doc_items" in SERVICE_SRC


def test_service_dedicated_claude_call_with_new_prompt():
    # Full transcriptions exceed the passport helper's 2000-token cap
    # (truncated mid-array -> silently []), so the service uses its own
    # call with the transcription system prompt + large budget + a
    # truncation-tolerant row parser.
    assert "FULL_ITEMS_SYSTEM" in SERVICE_SRC
    assert "max_tokens=12000" in SERVICE_SRC
    assert "parse_items_lenient" in SERVICE_SRC
    assert "transcribe every labeled value/table row in this pdf as" in SERVICE_SRC.lower()
    assert "cap 200 items" in SERVICE_SRC


def test_service_caps_and_truncates():
    assert "200" in SERVICE_SRC
    assert "500" in SERVICE_SRC


def test_service_failure_tolerant():
    assert SERVICE_SRC.count("except Exception") >= 3
    assert "return []" in SERVICE_SRC


def test_routes_both_get_paths_and_caller():
    assert "/api/documents/{document_id}/items" in ROUTES_SRC
    assert "/api/documents/{document_id}" in ROUTES_SRC
    # Auth-gated: get_caller directly or via the require_member/require_role wrappers.
    assert "get_caller" in ROUTES_SRC or "require_member" in ROUTES_SRC
    assert "404" in ROUTES_SRC


def test_products_calls_store():
    assert "store_document_items" in PRODUCTS_SRC
    assert "extract_full_items_pdf" in PRODUCTS_SRC


def test_worker_calls_store_and_keeps_contract():
    assert "store_document_items" in WORKER_SRC
    assert "SKIP LOCKED" in WORKER_SRC
    assert "--once" in WORKER_SRC
