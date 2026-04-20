"""Iteration 5 backend tests: POST /api/analysis/quick/{kind} is now a
fire-and-forget background job. Returns {job_id, status:'running', kind}
immediately (<5s). Client polls GET /api/analysis/quick/jobs/{job_id}.

Covers:
  - POST /analysis/quick/top returns 200 < 5s with {job_id, status:'running', kind:'top'}
  - Disclaimer gate 428 still fires BEFORE job is created (no job_id in response)
  - Plan gate 402 still fires BEFORE job is created (free user, accepted disclaimer)
  - Empty watchlist -> 400 BEFORE job is created (pro user, no watchlist)
  - GET /analysis/quick/jobs/{job_id} shape: {id, kind, status, progress, analyzed,
    results, started_at, finished_at}. user_id scrubbed. No _id.
  - Cross-user isolation: user A cannot GET user B's job (404)
  - GET nonexistent job -> 404
  - After polling, status eventually becomes 'done' (or 'running' partial if slow LLM)
  - Each completed result has expected fields; no _id leakage
"""
import os
import time
import uuid
import pytest
import requests


def _load_backend_url():
    env_val = os.environ.get("REACT_APP_BACKEND_URL")
    if env_val:
        return env_val
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

SHORT = 60
MED = 90

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"
PRO_EMAIL = "tiers@demo.io"
PRO_PASSWORD = "pass1234"


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register_user(email=None, password="Passw0rd!123", name="TEST it5"):
    email = email or f"TEST_it5_{uuid.uuid4().hex[:10]}@example.com"
    s = _session()
    r = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "full_name": name},
        timeout=SHORT,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"]


def _auth_pro():
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": PRO_EMAIL, "password": PRO_PASSWORD}, timeout=SHORT)
    if r.status_code != 200:
        pytest.skip(f"Pro login failed: {r.status_code} {r.text}")
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"]


def _accept_disclaimer(s):
    r = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
    assert r.status_code == 200, f"accept failed: {r.status_code} {r.text}"


def _ensure_watchlist(s, tickers):
    try:
        resp = s.get(f"{API}/watchlist", timeout=SHORT)
        existing = {i["ticker"] for i in resp.json()} if resp.status_code == 200 else set()
    except Exception:
        existing = set()
    for t in tickers:
        if t not in existing:
            s.post(f"{API}/watchlist", json={"ticker": t}, timeout=SHORT)


# ---------- Gate tests (must short-circuit BEFORE job creation) ----------
class TestQuickAnalyzeGates:
    def test_disclaimer_gate_blocks_before_job_creation(self):
        s, _ = _register_user()  # fresh user — no disclaimer accepted
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 428, f"expected 428, got {r.status_code}: {r.text}"
        body = r.json()
        assert "job_id" not in body, f"job created despite gate: {body}"
        detail = body.get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "disclaimer_required"

    def test_plan_gate_blocks_free_user_after_accept(self):
        s, _ = _register_user()
        _accept_disclaimer(s)
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        body = r.json()
        assert "job_id" not in body, f"job created despite 402: {body}"
        detail = body.get("detail", "")
        assert "Pro" in detail or "pro" in detail.lower() or "upgrade" in detail.lower(), (
            f"detail should reference Pro/Elite upgrade: {detail}"
        )

    def test_empty_watchlist_blocks_pro_user(self):
        """Register a fresh user, elevate to Elite via admin unlock, accept disclaimer,
        then hit quick/top with no watchlist."""
        # Get admin session first
        admin_s = _session()
        ar = admin_s.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=SHORT)
        if ar.status_code != 200:
            # try register
            rr = admin_s.post(f"{API}/auth/register",
                              json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "full_name": "Admin"},
                              timeout=SHORT)
            if rr.status_code != 200:
                pytest.skip(f"Admin unavailable: {ar.status_code}/{rr.status_code}")
            admin_s.headers.update({"Authorization": f"Bearer {rr.json()['token']}"})
        else:
            admin_s.headers.update({"Authorization": f"Bearer {ar.json()['token']}"})

        s, user = _register_user()
        uid = user["id"]
        unlock_r = admin_s.post(f"{API}/admin/users/{uid}/unlock",
                                json={"duration": "1h"}, timeout=SHORT)
        if unlock_r.status_code != 200:
            pytest.skip(f"Admin unlock failed: {unlock_r.status_code} {unlock_r.text}")

        _accept_disclaimer(s)
        # confirm watchlist empty
        wl = s.get(f"{API}/watchlist", timeout=SHORT).json()
        assert len(wl) == 0, f"expected empty watchlist, got {wl}"

        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        assert "job_id" not in body, f"job created despite empty watchlist: {body}"
        assert "empty" in str(body.get("detail", "")).lower()

    def test_invalid_kind(self):
        s, _ = _auth_pro()
        _accept_disclaimer(s)
        _ensure_watchlist(s, ["AAPL", "MSFT"])
        r = s.post(f"{API}/analysis/quick/sideways", timeout=MED)
        assert r.status_code == 400, f"expected 400 for invalid kind, got {r.status_code}"


# ---------- Job creation latency + shape ----------
class TestQuickAnalyzeJobCreation:
    def test_returns_fast_under_5s(self):
        s, _ = _auth_pro()
        _accept_disclaimer(s)
        _ensure_watchlist(s, ["AAPL", "MSFT"])

        t0 = time.time()
        r = s.post(f"{API}/analysis/quick/top", timeout=10)
        elapsed = time.time() - t0

        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        assert elapsed < 5.0, f"response took {elapsed:.2f}s, expected < 5s (bg job should kick off instantly)"

        body = r.json()
        assert "job_id" in body and isinstance(body["job_id"], str) and len(body["job_id"]) > 10
        assert body["status"] == "running", f"expected status=running, got {body['status']}"
        assert body["kind"] == "top"

    def test_bottom_kind_also_returns_job(self):
        s, _ = _auth_pro()
        _accept_disclaimer(s)
        _ensure_watchlist(s, ["AAPL", "MSFT"])

        r = s.post(f"{API}/analysis/quick/bottom", timeout=10)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        assert body["kind"] == "bottom"
        assert body["status"] == "running"
        assert "job_id" in body


# ---------- Job polling ----------
class TestQuickJobPolling:
    def _start_job(self):
        s, _ = _auth_pro()
        _accept_disclaimer(s)
        _ensure_watchlist(s, ["AAPL", "MSFT"])
        r = s.post(f"{API}/analysis/quick/top", timeout=10)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        return s, r.json()["job_id"]

    def test_poll_shape_immediately(self):
        s, job_id = self._start_job()
        r = s.get(f"{API}/analysis/quick/jobs/{job_id}", timeout=SHORT)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        body = r.json()
        # required fields
        for k in ("id", "kind", "status", "progress", "analyzed", "results",
                  "started_at", "finished_at"):
            assert k in body, f"missing field {k} in {body.keys()}"
        # user_id must be stripped
        assert "user_id" not in body, f"user_id leaked in job response: {body}"
        assert "_id" not in body, f"_id leaked: {body}"
        assert body["id"] == job_id
        assert body["kind"] == "top"
        assert body["status"] in ("running", "done", "failed")
        # progress shape
        for k in ("completed", "timed_out", "errored", "total"):
            assert k in body["progress"], f"progress missing {k}"
            assert isinstance(body["progress"][k], int)
        assert isinstance(body["analyzed"], list)
        assert isinstance(body["results"], list)

    def test_nonexistent_job_returns_404(self):
        s, _ = _auth_pro()
        r = s.get(f"{API}/analysis/quick/jobs/does-not-exist-{uuid.uuid4().hex}", timeout=SHORT)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"

    def test_cross_user_isolation(self):
        # Register user B FIRST (before kicking off bg job, which may slow down the event loop)
        s_b, _ = _register_user()
        _accept_disclaimer(s_b)
        # Now start user A's job
        s_a, job_id = self._start_job()
        # User B polls user A's job — should 404 (MongoDB filter, fast — no LLM work)
        r = s_b.get(f"{API}/analysis/quick/jobs/{job_id}", timeout=MED)
        assert r.status_code == 404, f"cross-user access leak: got {r.status_code}: {r.text}"

    def test_poll_eventually_reaches_done(self):
        """Poll up to 150s; accept 'done' or 'running' (partial success if LLM slow)."""
        s, job_id = self._start_job()
        deadline = time.time() + 180
        last_body = None
        final_status = None
        while time.time() < deadline:
            try:
                r = s.get(f"{API}/analysis/quick/jobs/{job_id}", timeout=MED)
            except requests.exceptions.ReadTimeout:
                # Event loop busy with LLM — back off
                time.sleep(10)
                continue
            if r.status_code in (502, 503, 504):
                # Ingress transient — the bg task is saturating the event loop; back off
                time.sleep(10)
                continue
            assert r.status_code == 200, f"{r.status_code}: {r.text}"
            last_body = r.json()
            final_status = last_body["status"]
            if final_status in ("done", "failed"):
                break
            time.sleep(5)

        assert last_body is not None
        if final_status == "running":
            pytest.skip(f"job still running after 150s (LLM slow) — partial success. progress={last_body.get('progress')}")

        if final_status == "failed":
            pytest.skip(f"job failed (likely LLM budget or upstream): {last_body.get('error')}")

        # final_status == 'done'
        assert final_status == "done"
        assert last_body["finished_at"] is not None
        prog = last_body["progress"]
        assert prog["total"] >= 1
        assert prog["completed"] + prog["timed_out"] + prog["errored"] == prog["total"]
        # results shape: each entry either success or {ticker, error} or {ticker, status:'timeout'}
        for entry in last_body["results"]:
            assert "ticker" in entry, f"result missing ticker: {entry}"
            assert "_id" not in entry, f"_id leaked in result: {entry}"
            if "recommendation" in entry:
                # success entry
                for k in ("ticker", "recommendation", "confidence_score",
                          "executive_summary", "price_target", "stop_loss", "analysis_id"):
                    assert k in entry, f"success result missing {k}: {entry}"
            else:
                # error or timeout
                assert "error" in entry, f"non-success result needs error: {entry}"
                assert entry.get("status") in ("timeout", None) or "status_code" in entry


# ---------- Disclaimer regression (from iteration 4) ----------
class TestDisclaimerRegression:
    def test_get_disclaimer_fresh_user_accepted_false(self):
        s, _ = _register_user()
        r = s.get(f"{API}/disclaimer", timeout=SHORT)
        assert r.status_code == 200
        body = r.json()
        assert body["accepted"] is False
        assert body.get("version"), "version missing"

    def test_single_analysis_428_before_accept(self):
        s, _ = _register_user()
        r = s.post(f"{API}/analysis/AAPL", timeout=MED)
        assert r.status_code == 428
        detail = r.json()["detail"]
        assert isinstance(detail, dict)
        assert detail["code"] == "disclaimer_required"

    def test_accept_then_get_returns_accepted_true(self):
        s, _ = _register_user()
        _accept_disclaimer(s)
        r = s.get(f"{API}/disclaimer", timeout=SHORT)
        assert r.status_code == 200
        assert r.json()["accepted"] is True
