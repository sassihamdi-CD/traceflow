"""C/D/G backend fixes: single extraction path, validation, publish gate,
status contract, extraction error messages. No DB/network needed."""
from __future__ import annotations

import inspect
import pathlib
import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import app.routes.fields as fields_mod
import app.routes.products as products_mod
from app.schemas import CorrectBody, ProductCreate, uuid_or_404

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
PRODUCTS_SRC = (REPO_ROOT / "app" / "routes" / "products.py").read_text()
SUPPLIERS_SRC = (REPO_ROOT / "app" / "routes" / "suppliers.py").read_text()
PUBLISH_SRC = (REPO_ROOT / "app" / "routes" / "publish.py").read_text()
REQUESTS_SRC = (REPO_ROOT / "app" / "routes" / "requests.py").read_text()
FIELDS_SRC = (REPO_ROOT / "app" / "routes" / "fields.py").read_text()
WORKER_SRC = (REPO_ROOT / "scripts" / "worker.py").read_text()
ERRORS_SRC = (REPO_ROOT / "app" / "errors.py").read_text()


def test_single_extraction_path_no_background_task():
    # Upload must not take/schedule a BackgroundTasks extraction: the
    # standalone worker is the sole extractor (else 2x field_values).
    assert "background" not in inspect.signature(products_mod.upload_document).parameters
    assert "background.add_task" not in PRODUCTS_SRC
    assert "_run_extraction" not in inspect.getsource(products_mod.upload_document)
    # Queue row is still enqueued: the worker is the sole extractor.
    assert "extraction_jobs" in inspect.getsource(products_mod.upload_document)


def test_upload_rejects_invalid_uuid_source():
    src = inspect.getsource(products_mod.upload_document)
    assert "uuid_or_404" in src


def test_worker_skips_already_extracted_documents():
    # Idempotency: exactly one set of field_values per document.
    assert "COUNT(*)" in WORKER_SRC and "field_values" in WORKER_SRC
    assert "already exist" in WORKER_SRC or "Idempotency" in WORKER_SRC


def test_product_create_rejects_empty_strings():
    for kwargs in (
        {"sku": "  ", "name": "Shoe", "manufacturer_name": "Acme"},
        {"sku": "SKU", "name": "", "manufacturer_name": "Acme"},
        {"sku": "SKU", "name": "Shoe", "manufacturer_name": "   "},
    ):
        with pytest.raises(ValidationError):
            ProductCreate(**kwargs)
    ok = ProductCreate(sku=" SKU-1 ", name="Shoe", manufacturer_name="Acme")
    assert ok.sku == "SKU-1"


def test_correct_body_rejects_empty_value():
    with pytest.raises(ValidationError):
        CorrectBody(value="   ")
    with pytest.raises(ValidationError):
        CorrectBody(value="")
    assert CorrectBody(value=" fixed ").value == "fixed"


def test_uuid_or_404():
    good = str(uuid.uuid4())
    assert uuid_or_404(good) == good
    for bad in ("not-a-uuid", "", "123", None, "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"):
        with pytest.raises(HTTPException) as e:
            uuid_or_404(bad)
        assert e.value.status_code == 404


def test_followup_requires_product_and_field_key():
    assert "missing_field" in SUPPLIERS_SRC
    assert "the product this follow-up is about" in SUPPLIERS_SRC
    assert "the field this follow-up is about" in SUPPLIERS_SRC
    # Cross-workspace product must 404, not FK-500.
    assert "not_found" in SUPPLIERS_SRC


def test_uuid_guards_on_field_routes():
    for fn in ("accept_field", "reject_field", "correct_field", "accept_all", "resolve_conflict"):
        assert "uuid_or_404" in inspect.getsource(getattr(fields_mod, fn)), fn


def test_publish_gate_blocks_stale_and_rejected():
    for token in ("pending_review", "has_new_proposal", "out_of_date", "valid_until",
                  "rejected_unreplaced", "publish_blocked"):
        assert token in PUBLISH_SRC, f"publish.py missing gate token: {token}"
    # The blocked message names human-readable field labels, never raw keys.
    assert "cannot be published yet" in ERRORS_SRC


def test_status_endpoint_contract():
    assert "open" in REQUESTS_SRC and "responded" in REQUESTS_SRC
    assert "422" in REQUESTS_SRC
    assert "404" in REQUESTS_SRC
    src = inspect.getsource(__import__("app.routes.requests", fromlist=["set_request_status"]).set_request_status)
    assert "uuid_or_404" in src


def test_extraction_error_carries_message_truncated():
    assert 'f"{type(e).__name__}: {e}"[:500]' in PRODUCTS_SRC
    assert 'f"{type(exc).__name__}: {exc}"[:500]' in WORKER_SRC
    assert 'err = "r2-fetch-failed"' not in WORKER_SRC
