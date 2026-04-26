"""Iteration 37 — 504 Gateway Timeout fix on stock re-analysis.

Validates:
- POST /api/analysis/{ticker}/start returns 200 with job_id within 1s (NFLX, BBCA.JK)
- Deprecated POST /api/analysis/{ticker} (no /start) now also returns immediately (job_id, status running)
- GET /api/analysis/jobs/{job_id} polls running → done within 120s
- Hybrid mode produces a verdict (recommendation/confidence/exec_summary) in db.analyses (via /latest)
- Re-analysis grows history by 1
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=45,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _start(ticker, mode, headers):
    t0 = time.time()
    r = requests.post(
        f"{BASE_URL}/api/analysis/{ticker}/start",
        params={"mode": mode},
        headers=headers,
        timeout=30,
    )
    dt = time.time() - t0
    return r, dt


def _start_deprecated(ticker, mode, headers):
    """Hit the deprecated POST /analysis/{ticker} (no /start) — should now also return immediately."""
    t0 = time.time()
    r = requests.post(
        f"{BASE_URL}/api/analysis/{ticker}",
        params={"mode": mode},
        headers=headers,
        timeout=30,
    )
    dt = time.time() - t0
    return r, dt


def _poll_until_done(job_id, headers, timeout_s=180):
    """Poll GET /api/analysis/jobs/{job_id} until done/failed. Return final body + elapsed."""
    deadline = time.time() + timeout_s
    last = None
    while time.time() < deadline:
        rt0 = time.time()
        r = requests.get(f"{BASE_URL}/api/analysis/jobs/{job_id}", headers=headers, timeout=30)
        rt = time.time() - rt0
        assert rt < 5.0, f"polling endpoint too slow: {rt:.2f}s"
        assert r.status_code == 200, f"poll {job_id}: {r.status_code} {r.text}"
        body = r.json()
        last = body
        if body.get("status") != "running":
            return body
        time.sleep(2.5)
    return last


# ---------- Tests ----------

class TestStartEndpoint:
    """POST /api/analysis/{ticker}/start returns 200 + job_id <1s."""

    def test_start_us_ticker_nflx(self, auth_headers):
        r, dt = _start("NFLX", "standard", auth_headers)
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
        body = r.json()
        assert "job_id" in body and isinstance(body["job_id"], str)
        assert body["status"] == "running"
        assert body["ticker"] == "NFLX"
        assert body["mode"] == "standard"
        # <1s target — allow 3s slack for cold start
        assert dt < 3.0, f"start endpoint took {dt:.2f}s (target <1s, slack 3s)"

    def test_start_idx_ticker_bbca(self, auth_headers):
        r, dt = _start("BBCA.JK", "standard", auth_headers)
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
        body = r.json()
        assert body["job_id"]
        assert body["status"] == "running"
        assert body["ticker"] == "BBCA.JK"
        assert dt < 3.0, f"start endpoint took {dt:.2f}s"


class TestDeprecatedSyncEndpoint:
    """The deprecated POST /api/analysis/{ticker} must now also return immediately."""

    def test_deprecated_returns_job_id_immediately(self, auth_headers):
        r, dt = _start_deprecated("NFLX", "standard", auth_headers)
        assert r.status_code == 200, f"deprecated endpoint failed: {r.status_code} {r.text}"
        body = r.json()
        # Body shape per request: {job_id, status: 'running', ticker, mode}
        assert "job_id" in body, f"no job_id in deprecated response: {body}"
        assert body.get("status") == "running"
        assert body.get("ticker") == "NFLX"
        assert body.get("mode") == "standard"
        # 504 trap fix: must respond <2s, not 50-60s
        assert dt < 2.0, f"deprecated endpoint took {dt:.2f}s — STILL the 504 trap!"


class TestHybridAnalysisCompletes:
    """Full e2e: start NFLX hybrid → poll → verdict in /latest."""

    def test_nflx_hybrid_full_pipeline(self, auth_headers):
        # 1. snapshot history count BEFORE
        h_before = requests.get(
            f"{BASE_URL}/api/analysis/NFLX/history",
            headers=auth_headers, timeout=45,
        )
        before_count = 0
        if h_before.status_code == 200:
            try:
                hist = h_before.json()
                before_count = len(hist) if isinstance(hist, list) else len(hist.get("items", []))
            except Exception:
                before_count = 0

        # 2. start hybrid analysis
        r, dt = _start("NFLX", "hybrid", auth_headers)
        assert r.status_code == 200, f"start failed: {r.status_code} {r.text}"
        assert dt < 3.0, f"start took {dt:.2f}s"
        job_id = r.json()["job_id"]

        # 3. poll until done
        final = _poll_until_done(job_id, auth_headers, timeout_s=150)
        assert final is not None, "polling returned None"
        assert final.get("status") == "done", (
            f"job did not complete: status={final.get('status')} "
            f"error={final.get('error')}"
        )

        # 4. verify verdict in /latest
        time.sleep(1.0)
        latest = requests.get(
            f"{BASE_URL}/api/analysis/NFLX/latest",
            headers=auth_headers, timeout=45,
        )
        assert latest.status_code == 200, f"/latest failed: {latest.status_code} {latest.text}"
        verdict = latest.json()
        assert verdict.get("recommendation"), f"no recommendation: {verdict}"
        assert isinstance(verdict.get("confidence_score"), (int, float)), (
            f"bad confidence: {verdict.get('confidence_score')}"
        )
        assert verdict.get("executive_summary"), "no executive_summary"
        assert verdict.get("ticker") == "NFLX"

        # 5. re-analysis grows history by 1
        h_after = requests.get(
            f"{BASE_URL}/api/analysis/NFLX/history",
            headers=auth_headers, timeout=45,
        )
        assert h_after.status_code == 200
        after_data = h_after.json()
        after_count = len(after_data) if isinstance(after_data, list) else len(after_data.get("items", []))
        assert after_count >= before_count + 1, (
            f"history did not grow: before={before_count} after={after_count}"
        )


class TestPollEndpointPerformance:
    """GET /api/analysis/jobs/{job_id} responds <1s."""

    def test_poll_endpoint_fast(self, auth_headers):
        r, _ = _start("NFLX", "standard", auth_headers)
        assert r.status_code == 200
        job_id = r.json()["job_id"]

        # Check 3 polls — all should be <1s
        for i in range(3):
            t0 = time.time()
            pr = requests.get(
                f"{BASE_URL}/api/analysis/jobs/{job_id}",
                headers=auth_headers, timeout=5,
            )
            dt = time.time() - t0
            assert pr.status_code == 200
            assert dt < 1.5, f"poll #{i} took {dt:.2f}s (target <1s)"
            time.sleep(0.5)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
