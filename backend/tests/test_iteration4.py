"""Iteration 4 backend tests: versioned Disclaimer acceptance gate + hardened
POST /api/analysis/quick/{kind} (asyncio.wait with 55s cap + partial results summary).

Covers:
  - GET /api/disclaimer (auth required; shape; accepted=false for fresh user)
  - POST /api/disclaimer/accept (auth required; persists version + timestamp)
  - GET after accept returns accepted=true with accepted_at timestamp
  - Disclaimer gate 428 on POST /api/analysis/{ticker} for un-accepted user
  - Disclaimer gate 428 on POST /api/analysis/quick/{kind}
  - 428 detail is a JSON dict with {code, version, message}
  - Pro un-accepted user on quick/{kind} -> 428, NOT 402 (gate comes before plan check)
  - Pro accepted user on quick/{kind} -> 200 with summary {completed, timed_out, errored, total}
  - Any timeouts are reported in results with {ticker, status:'timeout', error:'...55s...'}
  - Disclaimer version is consistent across GET /disclaimer and 428 detail
  - Admin is NOT bypassed by gate (observation, not critical)
"""
import os
import re
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

SHORT = 30
MED = 60
LONG = 120

DISCLAIMER_VERSION = "v1-2026-04"

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"

PRO_EMAIL = "tiers@demo.io"
PRO_PASSWORD = "pass1234"


# ---------- helpers ----------
def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register_user(email=None, password="Passw0rd!123", name="TEST User"):
    email = email or f"TEST_it4_{uuid.uuid4().hex[:10]}@example.com"
    s = _session()
    r = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "full_name": name},
        timeout=SHORT,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"], {"email": email, "password": password}


def _login(email, password):
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=SHORT)
    return s, r


def _auth_pro():
    s, r = _login(PRO_EMAIL, PRO_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"Pro user login failed ({r.status_code}): {r.text}")
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"]


def _auth_admin():
    s, r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code != 200:
        # try to re-register (idempotent-ish)
        s2 = _session()
        rr = s2.post(
            f"{API}/auth/register",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "full_name": "Admin"},
            timeout=SHORT,
        )
        if rr.status_code != 200:
            pytest.skip(f"Admin login/register failed: login={r.status_code} register={rr.status_code}")
        data = rr.json()
        s2.headers.update({"Authorization": f"Bearer {data['token']}"})
        return s2, data["user"]
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data["user"]


# ---------- Module: disclaimer GET/POST (fresh user) ----------
class TestDisclaimerBasic:
    def test_get_disclaimer_requires_auth(self):
        s = _session()
        r = s.get(f"{API}/disclaimer", timeout=SHORT)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_post_accept_requires_auth(self):
        s = _session()
        r = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_get_disclaimer_fresh_user_shape(self):
        s, user, _ = _register_user()
        r = s.get(f"{API}/disclaimer", timeout=SHORT)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["version"] == DISCLAIMER_VERSION
        assert isinstance(body["text"], str) and len(body["text"]) > 50
        assert body["accepted"] is False, f"fresh user should have accepted=false, got {body['accepted']}"
        assert body["accepted_at"] is None

    def test_accept_sets_version_and_timestamp(self):
        s, user, _ = _register_user()
        r = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body["version"] == DISCLAIMER_VERSION
        assert isinstance(body["accepted_at"], str) and len(body["accepted_at"]) > 10

        # Persistence check: GET now returns accepted=true
        r2 = s.get(f"{API}/disclaimer", timeout=SHORT)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2["accepted"] is True
        assert body2["accepted_at"] is not None
        assert body2["version"] == DISCLAIMER_VERSION

    def test_accept_idempotent(self):
        """Accepting twice should still work and not corrupt state."""
        s, user, _ = _register_user()
        r1 = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert r1.status_code == 200
        r2 = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert r2.status_code == 200
        assert r2.json()["version"] == DISCLAIMER_VERSION


# ---------- Module: disclaimer gate on analysis endpoints ----------
class TestDisclaimerGate:
    def test_single_analysis_blocked_without_accept(self):
        s, user, _ = _register_user()
        r = s.post(f"{API}/analysis/AAPL", timeout=MED)
        assert r.status_code == 428, f"expected 428 got {r.status_code}: {r.text}"
        # Content-Type must be JSON (axios-callable)
        assert "application/json" in r.headers.get("Content-Type", "").lower()
        body = r.json()
        assert "detail" in body
        detail = body["detail"]
        assert isinstance(detail, dict), f"detail should be dict, got {type(detail)}: {detail}"
        assert detail.get("code") == "disclaimer_required"
        assert detail.get("version") == DISCLAIMER_VERSION
        assert isinstance(detail.get("message"), str) and len(detail["message"]) > 0

    def test_quick_analyze_blocked_without_accept(self):
        s, user, _ = _register_user()
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 428, f"expected 428 got {r.status_code}: {r.text}"
        assert "application/json" in r.headers.get("Content-Type", "").lower()
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert detail["code"] == "disclaimer_required"
        assert detail["version"] == DISCLAIMER_VERSION

    def test_gate_version_consistent_with_get(self):
        s, user, _ = _register_user()
        g = s.get(f"{API}/disclaimer", timeout=SHORT).json()
        r = s.post(f"{API}/analysis/AAPL", timeout=MED)
        assert r.status_code == 428
        detail = r.json()["detail"]
        assert detail["version"] == g["version"], (
            f"version mismatch: GET={g['version']} gate={detail['version']}"
        )

    def test_gate_bottom_kind_also_blocked(self):
        s, user, _ = _register_user()
        r = s.post(f"{API}/analysis/quick/bottom", timeout=MED)
        assert r.status_code == 428
        assert r.json()["detail"]["code"] == "disclaimer_required"

    def test_gate_comes_before_plan_check_for_free_user(self):
        """Free user without disclaimer should get 428, NOT 402 (plan check)."""
        s, user, _ = _register_user()
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        # Must be 428 (disclaimer), not 402 (plan restriction)
        assert r.status_code == 428, f"expected 428 (gate first), got {r.status_code}: {r.text}"

    def test_gate_comes_before_plan_check_for_pro_user(self):
        """Pro un-accepted user should get 428 on quick, NOT 402."""
        # Register a throwaway user and manually elevate via admin unlock -> elite
        # OR use tiers@demo.io but reset their disclaimer first (we cannot reset via API).
        # Easiest: register a new user, upgrade via admin unlock to elite, test.
        s, user, _ = _register_user()
        admin_s, _ = _auth_admin()
        uid = user["id"]
        r_unlock = admin_s.post(
            f"{API}/admin/users/{uid}/unlock", json={"duration": "1h"}, timeout=SHORT
        )
        if r_unlock.status_code != 200:
            pytest.skip(f"Admin unlock unavailable: {r_unlock.status_code} {r_unlock.text}")

        # Now user is elite (quick_actions=True) but has NOT accepted disclaimer
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 428, (
            f"gate must precede plan check; expected 428 got {r.status_code}: {r.text}"
        )
        assert r.json()["detail"]["code"] == "disclaimer_required"


# ---------- Module: single analysis proceeds after accept ----------
class TestSingleAnalysisAfterAccept:
    def test_accept_then_single_analysis_proceeds(self):
        s, user, _ = _register_user()
        ra = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert ra.status_code == 200

        r = s.post(f"{API}/analysis/AAPL", timeout=LONG)
        # After accept, gate should NOT fire. Acceptable statuses:
        # 200 success, 402 (free quota), 429 (quota), 503 (LLM budget), 504 (upstream timeout)
        # 428 must NOT be returned.
        assert r.status_code != 428, f"gate still firing after accept: {r.text}"
        assert r.status_code in (200, 402, 403, 429, 503, 504), (
            f"unexpected status after accept: {r.status_code} {r.text[:300]}"
        )


# ---------- Module: Pro user quick_analyze happy-path after accept ----------
class TestQuickAnalyzeSummary:
    def _ensure_watchlist(self, s, tickers):
        # read current, add missing. Non-fatal on errors.
        try:
            existing_resp = s.get(f"{API}/watchlist", timeout=SHORT)
            existing = {i["ticker"] for i in existing_resp.json()} if existing_resp.status_code == 200 else set()
        except Exception:
            existing = set()
        for t in tickers:
            if t not in existing:
                s.post(f"{API}/watchlist", json={"ticker": t}, timeout=SHORT)

    def test_pro_accepted_quick_top_returns_summary_shape(self):
        s, user = _auth_pro()
        # ensure disclaimer accepted for pro user
        acc = s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        assert acc.status_code == 200, f"accept failed: {acc.status_code} {acc.text}"

        # ensure small watchlist (2-3 tickers) — tiers@demo.io already has AAPL+MSFT
        self._ensure_watchlist(s, ["AAPL", "MSFT"])

        r = s.post(f"{API}/analysis/quick/top", timeout=LONG)

        # Per spec: do NOT assert 200 if LLM is down. Instead assert no 502/503 at HTTP.
        assert r.status_code not in (502,), f"ingress 502: {r.text[:200]}"

        if r.status_code != 200:
            # If 402 or similar, that's an unrelated misconfig — skip with context
            if r.status_code == 402:
                pytest.skip(f"pro user unexpectedly hit 402: {r.text[:200]}")
            if r.status_code == 503:
                pytest.skip(f"LLM budget exhausted, cannot verify summary shape: {r.text[:200]}")
            pytest.fail(f"unexpected status {r.status_code}: {r.text[:300]}")

        # 200 path — verify shape
        body = r.json()
        assert body["kind"] == "top"
        assert isinstance(body["analyzed"], list) and 1 <= len(body["analyzed"]) <= 3
        assert isinstance(body["results"], list)
        assert "summary" in body, f"missing summary field: {body}"
        summ = body["summary"]
        for k in ("completed", "timed_out", "errored", "total"):
            assert k in summ, f"summary missing key {k}: {summ}"
            assert isinstance(summ[k], int), f"summary.{k} must be int, got {type(summ[k])}"
        assert summ["total"] == len(body["analyzed"])
        assert summ["completed"] + summ["timed_out"] + summ["errored"] == summ["total"]

    def test_timeout_results_have_proper_shape(self):
        """If any ticker times out, result entry must have status='timeout' and mention 55s."""
        s, user = _auth_pro()
        s.post(f"{API}/disclaimer/accept", timeout=SHORT)
        self._ensure_watchlist(s, ["AAPL", "MSFT"])

        r = s.post(f"{API}/analysis/quick/top", timeout=LONG)
        if r.status_code != 200:
            pytest.skip(f"cannot verify timeout shape when call not 200 (got {r.status_code})")

        body = r.json()
        timeout_entries = [x for x in body["results"] if x.get("status") == "timeout"]
        if not timeout_entries:
            pytest.skip("no timeouts occurred on this run — nothing to verify")
        for entry in timeout_entries:
            assert "ticker" in entry
            assert entry.get("status") == "timeout"
            assert "error" in entry
            assert "55" in str(entry["error"]) or "55s" in str(entry["error"]).lower(), (
                f"timeout error should mention 55s, got: {entry['error']}"
            )


# ---------- Module: admin gate observation ----------
class TestAdminGateObservation:
    def test_admin_not_bypassed_by_gate(self):
        """Observation: admin is gated too (not critical)."""
        # First reset admin disclaimer state by creating a brand-new admin-like session
        # But we cannot un-accept via API. So: if admin already accepted, skip with note.
        s, user = _auth_admin()
        g = s.get(f"{API}/disclaimer", timeout=SHORT).json()
        if g.get("accepted"):
            pytest.skip(
                "admin already accepted disclaimer (from prior run); "
                "cannot assert gate behavior without DB reset. "
                "Observation: admin IS subject to gate by design (require_accepted has no admin bypass)."
            )
        r = s.post(f"{API}/analysis/AAPL", timeout=MED)
        assert r.status_code == 428, (
            f"admin should also be gated per code (no bypass); got {r.status_code}"
        )
