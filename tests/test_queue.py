"""Phase 3 queue contract tests (no DB needed — source-level assertions)."""
from __future__ import annotations

import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION_SRC = (REPO_ROOT / "migrations" / "008_extraction_jobs.sql").read_text()
WORKER_SRC = (REPO_ROOT / "scripts" / "worker.py").read_text()


def test_migration_defines_extraction_jobs():
    assert "extraction_jobs" in MIGRATION_SRC
    assert "CREATE TABLE" in MIGRATION_SRC


def test_migration_status_check():
    for token in ("'queued'", "'running'", "'done'", "'failed'"):
        assert token in MIGRATION_SRC, f"migration missing status value {token}"
    assert "CHECK" in MIGRATION_SRC


def test_migration_index():
    assert "idx_jobs_status" in MIGRATION_SRC
    assert "status" in MIGRATION_SRC and "created_at" in MIGRATION_SRC


def test_migration_grant():
    assert "GRANT SELECT,INSERT,UPDATE,DELETE ON extraction_jobs TO traceflow_app" in MIGRATION_SRC.replace(
        "GRANT SELECT, INSERT, UPDATE, DELETE", "GRANT SELECT,INSERT,UPDATE,DELETE"
    )


def test_worker_claims_with_skip_locked():
    assert "SKIP LOCKED" in WORKER_SRC
    assert "FOR UPDATE" in WORKER_SRC
    assert "status = 'queued'" in WORKER_SRC or 'status="queued"' in WORKER_SRC or "status='queued'" in WORKER_SRC


def test_worker_once_flag():
    assert "--once" in WORKER_SRC


def test_worker_status_transitions():
    for token in ("running", "done", "failed"):
        assert token in WORKER_SRC, f"worker.py missing '{token}' transition"
    assert "attempts" in WORKER_SRC
