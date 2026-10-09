"""Intake + notification-center contract tests (no DB/network — source-level)."""
from __future__ import annotations

import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION_SRC = (REPO_ROOT / "migrations" / "012_request_notifications.sql").read_text()
INTAKE_SVC = (REPO_ROOT / "app" / "services" / "intake.py").read_text()
INTAKE_ROUTER = (REPO_ROOT / "app" / "routes" / "intake.py").read_text()
NOTIF_ROUTER = (REPO_ROOT / "app" / "routes" / "notifications.py").read_text()


def test_migration_has_request_items():
    assert "request_items" in MIGRATION_SRC
    assert "idx_request_items_req" in MIGRATION_SRC
    assert "ON DELETE CASCADE" in MIGRATION_SRC
    for col in ("request_id", "label", "value", "unit"):
        assert col in MIGRATION_SRC


def test_migration_has_notifications():
    assert "CREATE TABLE" in MIGRATION_SRC and "notifications" in MIGRATION_SRC
    assert "idx_notifications_ws" in MIGRATION_SRC
    for col in ("workspace_id", "type", "title", "body", "entity_type", "entity_id", "read_at"):
        assert col in MIGRATION_SRC


def test_migration_grants():
    assert "GRANT SELECT,INSERT,UPDATE,DELETE ON" in MIGRATION_SRC.replace(" ", "").replace(
        "GRANTSELECT,INSERT,UPDATE,DELETEON", "GRANT SELECT,INSERT,UPDATE,DELETE ON")
    assert "traceflow_app" in MIGRATION_SRC


def test_intake_extract_contract():
    assert "async def extract_requirements" in INTAKE_SVC
    assert "cap 100" in INTAKE_SVC
    assert "IntakeError" in INTAKE_SVC
    assert "raise IntakeError" in INTAKE_SVC
    assert "{label, value, unit|null}" in INTAKE_SVC
    assert "never invent" in INTAKE_SVC


def test_intake_create_contract():
    assert "async def create_intake" in INTAKE_SVC
    assert "INSERT INTO client_requests" in INTAKE_SVC
    assert "requester_name" in INTAKE_SVC
    assert "Email intake" in INTAKE_SVC
    assert "INSERT INTO request_items" in INTAKE_SVC or "request_items" in INTAKE_SVC
    assert "notification" in INTAKE_SVC.lower()
    assert "request.received" in INTAKE_SVC
    assert "audit_log" in INTAKE_SVC
    assert "conn.transaction()" in INTAKE_SVC


def test_intake_router_paths_and_guards():
    assert "/api/intake" in INTAKE_ROUTER
    assert "/api/intake/email" in INTAKE_ROUTER
    assert "require_reviewer" in INTAKE_ROUTER
    assert "X-Intake-Secret" in INTAKE_ROUTER
    assert "bad_intake_secret" in INTAKE_ROUTER
    assert "intake_unconfigured" in INTAKE_ROUTER
    assert "intake_failed" in INTAKE_ROUTER
    assert "intake_secret" in INTAKE_ROUTER


def test_notifications_router_paths_and_guards():
    assert "/api/notifications" in NOTIF_ROUTER
    assert "/read" in NOTIF_ROUTER
    assert "read-all" in NOTIF_ROUTER
    assert "require_member" in NOTIF_ROUTER  # fail-closed member auth (was get_caller)
    assert "require_reviewer" not in NOTIF_ROUTER  # reads stay strict, no write-guard needed
    assert "workspace_id" in NOTIF_ROUTER
    assert "ORDER BY created_at DESC" in NOTIF_ROUTER
    assert "read_at" in NOTIF_ROUTER
