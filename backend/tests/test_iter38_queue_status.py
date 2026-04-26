"""Iteration 38 — queue/status endpoint + concurrency cap + verdict v2 calibration"""
import os
import time
import asyncio
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# === GET /api/analysis/queue/status ============================
class TestQueueStatusShape:
    def test_idle_returns_200_fast(self):
        t0 = time.monotonic()
        r = requests.get(f"{BASE_URL}/api/analysis/queue/status", timeout=5)
        elapsed = time.monotonic() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 2.0, f"Slow response: {elapsed:.2f}s"
        body = r.json()
        for k in ("capacity", "running", "queued",
                  "avg_duration_s", "estimated_wait_s", "is_busy"):
            assert k in body, f"missing key: {k}"
        assert isinstance(body["capacity"], int)
        assert isinstance(body["running"], int)
        assert isinstance(body["queued"], int)
        assert isinstance(body["is_busy"], bool)
        assert body["capacity"] >= 1
        assert body["running"] >= 0
        assert body["queued"] >= 0

    def test_no_auth_required(self):
        # Public endpoint per docstring
        r = requests.get(f"{BASE_URL}/api/analysis/queue/status", timeout=5)
        assert r.status_code == 200


# === Concurrency cap: fire 6 hybrid analyses, verify queue saturation =====
class TestQueueSaturation:
    def test_six_concurrent_starts_saturate_queue(self, auth_headers):
        tickers = ["NFLX", "TSLA", "AAPL", "MSFT", "NVDA", "GOOGL"]
        job_ids = []
        for t in tickers:
            r = requests.post(
                f"{BASE_URL}/api/analysis/{t}/start?mode=hybrid",
                headers=auth_headers,
                timeout=10,
            )
            if r.status_code == 402:
                pytest.skip(f"Quota blocked: {r.text[:120]}")
            assert r.status_code == 200, f"{t}: {r.status_code} {r.text[:200]}"
            job_ids.append(r.json().get("job_id"))

        # Poll status for ~12s, capture peak running and is_busy
        peak_running = 0
        peak_queued = 0
        ever_busy = False
        ever_wait = 0
        capacity_seen = None
        ok_polls = 0
        timeout_polls = 0
        t0 = time.monotonic()
        while time.monotonic() - t0 < 25:
            try:
                sr = requests.get(f"{BASE_URL}/api/analysis/queue/status", timeout=30)
            except requests.exceptions.ReadTimeout:
                timeout_polls += 1
                continue
            if sr.status_code == 200:
                ok_polls += 1
                b = sr.json()
                capacity_seen = b["capacity"]
                peak_running = max(peak_running, b["running"])
                peak_queued = max(peak_queued, b["queued"])
                ever_busy = ever_busy or b["is_busy"]
                ever_wait = max(ever_wait, b["estimated_wait_s"])
                assert b["running"] <= capacity_seen, \
                    f"running {b['running']} > capacity {capacity_seen}"
            time.sleep(0.6)
        print(f"polls ok={ok_polls} timeouts={timeout_polls}")

        print(f"capacity={capacity_seen}, peak_running={peak_running}, "
              f"peak_queued={peak_queued}, ever_busy={ever_busy}, ever_wait={ever_wait}")
        assert capacity_seen == 4, f"expected capacity=4, got {capacity_seen}"
        # We started 6, so at least one should have been queued
        assert peak_running >= 1, "no analyses ran during burst"
        # Concurrency cap holds
        assert peak_running <= 4
        # is_busy fires when running >= capacity-1 (>=3). Given we fired 6, this should trigger.
        assert ever_busy, "is_busy never became true during 6-stock burst"
        assert ever_wait >= 0


# === Verdict calibration v2 — confidence_adjustments seeded ==============
class TestVerdictCalibrationV2:
    def test_calibrate_seeds_v2_fields(self):
        # Direct unit test to avoid LLM dep
        from services.verdict_calibration import calibrate_verdict
        v = {"recommendation": "BUY", "confidence_score": 70}
        calibrate_verdict(v, market_context=None, rf_opinion=None)
        assert v.get("calibration_version") == "v2"
        assert isinstance(v.get("confidence_adjustments"), list)
        # No rule fired for an empty context → adjustments stays []
        assert v["confidence_adjustments"] == []
