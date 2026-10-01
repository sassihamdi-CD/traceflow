"""Readiness computation (spec section 5). Pure function, no I/O."""
from __future__ import annotations


def compute_readiness(
    verified_count: int,
    proposed_count: int,
    missing_count: int,
    conflicting_count: int,
    total_required: int,
) -> dict:
    if total_required <= 0:
        return {"readiness_percent": 0, "actions_required": missing_count + conflicting_count}
    readiness_percent = round((verified_count * 1.0 + proposed_count * 0.5) / total_required * 100)
    actions_required = missing_count + conflicting_count
    return {"readiness_percent": readiness_percent, "actions_required": actions_required}
