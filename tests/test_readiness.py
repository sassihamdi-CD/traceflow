"""Spec section 5 worked example: 2 verified, 2 proposed, 1 missing,
2 conflicting, 7 total -> readiness 43, actions_required 3."""
from app.services.readiness import compute_readiness


def test_spec_worked_example():
    out = compute_readiness(
        verified_count=2, proposed_count=2, missing_count=1,
        conflicting_count=2, total_required=7,
    )
    assert out["readiness_percent"] == 43
    assert out["actions_required"] == 3


def test_all_verified_is_100():
    out = compute_readiness(7, 0, 0, 0, 7)
    assert out == {"readiness_percent": 100, "actions_required": 0}


def test_zero_total_guards_division():
    out = compute_readiness(0, 0, 0, 0, 0)
    assert out["readiness_percent"] == 0
