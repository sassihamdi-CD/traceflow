"""Computed field display state (spec section 4). Pure function, no I/O.

Rules:
- missing: zero rows
- conflicting: >=2 proposed, none accepted/corrected
- proposed: exactly 1 proposed, none accepted/corrected
- verified: exactly 1 accepted/corrected (older rejected rows ignored;
  a fresh proposed row alongside a verified row still displays verified
  but sets has_new_proposal=True so the reviewer is surfaced it)
"""
from __future__ import annotations


def compute_state(statuses: list[str]) -> dict:
    live = [s for s in statuses if s in ("proposed", "accepted", "corrected")]
    verified = [s for s in live if s in ("accepted", "corrected")]
    proposed = [s for s in live if s == "proposed"]

    if not live:
        return {"state": "missing", "has_new_proposal": False}
    if len(verified) == 1:
        return {"state": "verified", "has_new_proposal": len(proposed) > 0}
    if len(proposed) >= 2:
        return {"state": "conflicting", "has_new_proposal": False}
    if len(proposed) == 1:
        return {"state": "proposed", "has_new_proposal": False}
    # Defensive: >1 verified row should never happen via the API, but if
    # legacy data contains it, surface as conflicting rather than verified.
    return {"state": "conflicting", "has_new_proposal": False}
