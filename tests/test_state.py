from app.services.state import compute_state


def test_missing():
    assert compute_state([])["state"] == "missing"


def test_proposed_single():
    assert compute_state(["proposed"])["state"] == "proposed"


def test_conflicting_two_proposed():
    assert compute_state(["proposed", "proposed"])["state"] == "conflicting"


def test_verified_accepted_ignores_rejected():
    assert compute_state(["rejected", "accepted", "rejected"])["state"] == "verified"


def test_verified_corrected():
    assert compute_state(["corrected"])["state"] == "verified"


def test_new_proposal_after_verified_stays_verified_with_flag():
    out = compute_state(["accepted", "proposed"])
    assert out["state"] == "verified"
    assert out["has_new_proposal"] is True


def test_verified_without_new_proposal_flag_off():
    out = compute_state(["accepted"])
    assert out["has_new_proposal"] is False
