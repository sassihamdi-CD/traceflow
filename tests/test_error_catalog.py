"""Error catalog contract: every helper returns {code, message, hint}.

Manufacturers must never see class names, tracebacks, or raw JSON.
"""
from __future__ import annotations

import json
import pathlib

from fastapi import HTTPException

from app import errors

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = (REPO_ROOT / "docs" / "ERROR_CATALOG.md").read_text()


def _detail(exc: HTTPException) -> dict:
    assert isinstance(exc.detail, dict), f"{exc} detail is not a dict"
    return exc.detail


def test_shape_code_message_hint():
    for fn in [errors.session_missing, errors.session_invalid, errors.auth_unavailable,
               errors.auth_unconfigured, errors.membership_unavailable, errors.not_member,
               errors.forbidden_role, errors.workspace_missing, errors.ai_unconfigured,
               errors.ai_unavailable, errors.intake_failed, errors.intake_unconfigured,
               errors.bad_intake_secret, errors.bad_request_body, errors.bad_status,
               errors.bad_pilot_code, errors.bad_invite, errors.invite_expired,
               errors.invite_used, errors.nothing_to_update,
               errors.bad_founder_key, errors.founder_disabled]:
        d = _detail(fn())
        assert d["code"] and d["message"] and "hint" in d, fn.__name__
        # No engineer-speak: no exception class names, no tracebacks.
        blob = json.dumps(d)
        for banned in ("Traceback", "Traceback ", "Error:", "Exception", "psycopg", "NoneType"):
            assert banned not in blob, f"{fn.__name__} leaks {banned}"


def test_publish_blocked_uses_labels_and_lists_all_categories():
    d = _detail(errors.publish_blocked(
        ["Product name", "SKU"], ["Upper material"], ["REACH compliance"], ["Sole material"]))
    assert d["code"] == "publish_blocked"
    assert "Product name" in d["message"] and "product_name" not in d["message"]
    assert "new evidence to review" in d["message"]
    assert "expired documents" in d["message"]
    assert "rejected with no replacement" in d["message"]
    assert d["data"]["unverified"] == ["Product name", "SKU"]


def test_review_and_lookup_helpers():
    assert _detail(errors.already_decided("accepted", "accepted"))["code"] == "already_decided"
    assert _detail(errors.not_candidate())["code"] == "not_candidate"
    assert "could not be found" in _detail(errors.not_found("That product"))["message"]
    assert "missing" in _detail(errors.missing_field("a supplier name"))["message"].lower()
    assert "too long" in _detail(errors.too_long("question", "2000 characters"))["message"]
    assert "25 MB" in _detail(errors.file_too_large(25))["message"]
    assert "PDF" in _detail(errors.unsupported_type("report.exe"))["message"]
    for kind in ("not_a_pdf", "not_a_workbook", "csv_binary", "csv_unreadable", "csv_no_table"):
        d = _detail(errors.file_content_problem(kind))
        assert d["code"] == kind and d["hint"], kind


def test_every_code_documented_in_catalog():
    codes = {"session_missing", "session_invalid", "auth_unavailable", "auth_unconfigured",
             "membership_unavailable", "not_member", "forbidden_role", "workspace_missing",
             "not_found", "missing_field", "too_long", "nothing_to_update", "publish_blocked",
             "already_decided", "not_candidate", "file_too_large", "unsupported_type",
             "not_a_pdf", "not_a_workbook", "csv_binary", "csv_unreadable", "csv_no_table",
             "bad_pilot_code", "bad_invite", "invite_expired", "invite_used",
             "ai_unconfigured", "ai_unavailable", "intake_failed", "intake_unconfigured",
             "bad_intake_secret", "bad_request_body", "bad_status", "validation",
             "bad_founder_key", "founder_disabled"}
    for code in codes:
        assert code in CATALOG, f"code {code} missing from docs/ERROR_CATALOG.md"
