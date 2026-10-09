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
    assert "bad_invite" in INVITES_SRC
    assert "invite_used" in INVITES_SRC
    assert "invite_expired" in INVITES_SRC


def test_migration_code_hash_unique():
    assert "code_hash" in MIGRATION_SRC
    assert "UNIQUE" in MIGRATION_SRC


def test_migration_role_check():
    assert "CHECK" in MIGRATION_SRC
    for role in ("admin", "reviewer", "supplier", "auditor"):
        assert f"'{role}'" in MIGRATION_SRC, f"migration missing role {role}"


def test_migration_seeds_pilot_hex():
    # Key hygiene (checklist A5): TF-133C98 was committed to git = compromised.
    # 009 must NOT ship a live seed hex; 014 deletes the row on existing DBs.
    assert PILOT_HEX not in MIGRATION_SRC
    import pathlib as _pl
    h014 = (_pl.Path(__file__).resolve().parents[1] / "migrations" / "014_invite_hygiene.sql").read_text()
    assert PILOT_HEX in h014  # cleanup migration targets the compromised row
