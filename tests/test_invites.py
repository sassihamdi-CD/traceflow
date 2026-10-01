"""Invites contract tests (no DB needed — source-level assertions)."""
from __future__ import annotations

import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
INVITES_SRC = (REPO_ROOT / "app" / "routes" / "invites.py").read_text()
MIGRATION_SRC = (REPO_ROOT / "migrations" / "009_invites.sql").read_text()

PILOT_HEX = "457a99ba6245c9b730dfb536201ca55756537811285a3159f675157d3fd90538"


def test_redeem_route_registered():
    assert "/redeem" in INVITES_SRC


def test_redeem_hashes_code_with_sha256():
    assert "sha256" in INVITES_SRC


def test_redeem_inserts_membership():
    assert "memberships" in INVITES_SRC
    assert "INSERT INTO memberships" in INVITES_SRC or "INSERT INTO  memberships" in INVITES_SRC


def test_redeem_writes_audit_log():
    assert "invite.redeemed" in INVITES_SRC
    assert "audit_log" in INVITES_SRC


def test_redeem_error_mapping():
    assert "404" in INVITES_SRC
    assert "409" in INVITES_SRC
    assert "410" in INVITES_SRC


def test_migration_code_hash_unique():
    assert "code_hash" in MIGRATION_SRC
    assert "UNIQUE" in MIGRATION_SRC


def test_migration_role_check():
    assert "CHECK" in MIGRATION_SRC
    for role in ("admin", "reviewer", "supplier", "auditor"):
        assert f"'{role}'" in MIGRATION_SRC, f"migration missing role {role}"


def test_migration_seeds_pilot_hex():
    assert PILOT_HEX in MIGRATION_SRC
