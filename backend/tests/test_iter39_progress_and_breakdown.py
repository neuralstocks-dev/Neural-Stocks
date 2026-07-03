"""Iteration 39 — Per-stage progress stepper + score-breakdown pre-calibration field.

Verifies:
  1. POST /api/analysis/{ticker}/start seeds progress.phases / completed / phase=queued
     immediately, with mode-conditional phase set.
  2. confidence_score_pre_calibration is added to verdicts by calibrate_verdict and
     mirrored into the persisted /latest doc when calibration_version === 'v2'.
  3. Pre-calibration unit logic: the snapshot equals the LLM raw value (≥ final score
     when any rule fires).
"""
import os, time, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code} {r.text[:120]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, "no token in login response"
    return {"Authorization": f"Bearer {tok}"}


# ---------- progress phases on /start ----------

def test_start_standard_seeds_phases_without_patterns(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/analysis/AAPL/start?mode=standard",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    # Immediately fetch — should be queued/running with progress seeded
    j = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}", headers=auth_headers, timeout=10).json()
    prog = j.get("progress") or {}
    assert prog.get("phase") in ("queued", "fetching_data", "computing_technicals", "llm_thinking",
                                  "rf_scoring", "calibrating", "done"), prog
    phases = prog.get("phases") or []
    expected = ["fetching_data", "computing_technicals", "llm_thinking", "rf_scoring", "calibrating"]
    assert phases == expected, f"standard phases mismatch: {phases}"
    assert "scanning_patterns" not in phases
    assert isinstance(prog.get("completed"), list)


def test_start_hybrid_includes_scanning_patterns(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/analysis/MSFT/start?mode=hybrid",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    j = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}", headers=auth_headers, timeout=10).json()
    prog = j.get("progress") or {}
    phases = prog.get("phases") or []
    expected = ["fetching_data", "computing_technicals", "scanning_patterns",
                "llm_thinking", "rf_scoring", "calibrating"]
    assert phases == expected, f"hybrid phases mismatch: {phases}"


def test_start_candlestick_includes_scanning_patterns(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/analysis/GOOGL/start?mode=candlestick",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    j = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}", headers=auth_headers, timeout=10).json()
    prog = j.get("progress") or {}
    phases = prog.get("phases") or []
    assert "scanning_patterns" in phases
    assert phases[0] == "fetching_data"
    assert phases[-1] == "calibrating"


def test_phase_advances_during_run(auth_headers):
    """Poll a few times — at least one non-queued phase must be seen + completed grows."""
    r = requests.post(
        f"{BASE_URL}/api/analysis/TSLA/start?mode=standard",
        headers=auth_headers, timeout=15,
    )
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    seen_phases = set()
    max_completed = 0
    deadline = time.time() + 90
    final_status = None
    while time.time() < deadline:
        j = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}", headers=auth_headers, timeout=10).json()
        prog = j.get("progress") or {}
        if prog.get("phase"):
            seen_phases.add(prog["phase"])
        max_completed = max(max_completed, len(prog.get("completed") or []))
        final_status = j.get("status")
        if final_status != "running":
            break
        time.sleep(2)
    # We should have observed at least 2 distinct phases (more than just 'queued')
    assert len(seen_phases - {"queued"}) >= 1, f"only saw {seen_phases}"
    # The completed list must have grown beyond 0 at least once
    assert max_completed >= 1, f"completed never grew, saw {max_completed}"


# ---------- pre-calibration field in /latest ----------

def test_latest_includes_pre_calibration_field(auth_headers):
    """Run a fresh standard analysis on AAPL and verify the persisted doc carries
    confidence_score_pre_calibration when calibration_version === 'v2'."""
    r = requests.post(f"{BASE_URL}/api/analysis/AAPL/start?mode=standard",
                      headers=auth_headers, timeout=15)
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    deadline = time.time() + 120
    while time.time() < deadline:
        j = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}",
                         headers=auth_headers, timeout=10).json()
        if j.get("status") != "running":
            break
        time.sleep(3)
    assert j.get("status") == "done", f"job status={j.get('status')} err={j.get('error')}"
    latest = requests.get(f"{BASE_URL}/api/analysis/AAPL/latest",
                          headers=auth_headers, timeout=10).json()
    assert latest.get("calibration_version") == "v2"
    pre = latest.get("confidence_score_pre_calibration")
    final = latest.get("confidence_score")
    assert isinstance(pre, int), f"pre type={type(pre)} val={pre}"
    assert isinstance(final, int)
    # Pre-calibration must be ≥ final (calibration only ever lowers score)
    assert pre >= final, f"pre={pre} final={final}"


# ---------- pure unit: pre-calibration snapshot equals raw LLM value ----------

def test_pre_calibration_field_set_by_calibrate_verdict():
    from services.verdict_calibration import calibrate_verdict
    v = {"recommendation": "BUY", "confidence_score": 78}
    rf = {"relative_direction": "underperform", "edge": "strong", "prob_outperform": 0.20}
    calibrate_verdict(v, market_context=None, rf_opinion=rf)
    assert v["confidence_score_pre_calibration"] == 78
    assert v["confidence_score"] == 78 - 12  # RF penalty applied
    assert v["confidence_score_pre_calibration"] >= v["confidence_score"]


def test_pre_calibration_field_when_no_rule_fires():
    from services.verdict_calibration import calibrate_verdict
    v = {"recommendation": "BUY", "confidence_score": 60}
    calibrate_verdict(v, market_context=None, rf_opinion=None)
    assert v["confidence_score_pre_calibration"] == 60
    assert v["confidence_score"] == 60
    assert v["calibration_version"] == "v2"
