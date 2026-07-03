"""Iteration 3 backend tests: admin auto-elevation, admin user management,
test-unlock grant/reset, login tracking, and AI Accuracy Scorecard (per-user + global).

Covers:
  - Login tracking (login_count increments, login_events written)
  - Admin auto-elevation via ADMIN_EMAILS env (jolor69@gmail.com)
  - GET /api/admin/users (admin-only)
  - GET /api/admin/logins (admin-only)
  - POST /api/admin/users/{id}/unlock (durations, forever, 422 invalid, 404 missing user)
  - POST /api/admin/users/{id}/reset
  - Unlock enforcement — Free user becomes elite when unlocked, re-limited after reset
  - GET /api/scorecard/me and /api/scorecard/global response shape
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SHORT = 30
MED = 60
LONG = 120

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"


# ---------- Shared helpers ----------
def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register_user(email: str | None = None, password: str = "Passw0rd!123", name: str = "TEST User"):
    email = email or f"TEST_it3_{uuid.uuid4().hex[:10]}@example.com"
    s = _session()
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": password, "full_name": name
    }, timeout=SHORT)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    # Iteration 4: accept disclaimer so analysis endpoints aren't 428-gated
    s.post(f"{API}/disclaimer/accept", timeout=SHORT)
    return s, data["user"], {"email": email, "password": password}


def _login(email: str, password: str):
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=SHORT)
    return s, r


def _ensure_admin_session():
    """Ensure admin user exists with known credentials and return an authenticated session."""
    s, r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if r.status_code == 200:
        data = r.json()
        s.headers.update({"Authorization": f"Bearer {data['token']}"})
        return s, data["user"]
    # not registered (or password mismatch) → try to register
    s = _session()
    r = s.post(f"{API}/auth/register", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "full_name": "Neural Admin"
    }, timeout=SHORT)
    if r.status_code == 200:
        data = r.json()
        s.headers.update({"Authorization": f"Bearer {data['token']}"})
        return s, data["user"]
    # Already exists with a different password — cannot recover without DB access.
    pytest.skip(f"Admin account already exists with different password: {r.status_code} {r.text}")


@pytest.fixture(scope="module")
def admin_client():
    s, user = _ensure_admin_session()
    # Iteration 4: accept disclaimer so admin analyses aren't 428-gated
    s.post(f"{API}/disclaimer/accept", timeout=SHORT)
    return {"session": s, "user": user}


@pytest.fixture(scope="module")
def fresh_free_user():
    s, user, creds = _register_user()
    return {"session": s, "user": user, "creds": creds}


# ---------- Login tracking ----------
class TestLoginTracking:
    def test_register_increments_login_count(self):
        s, user, creds = _register_user()
        r = s.get(f"{API}/auth/me", timeout=SHORT)
        assert r.status_code == 200, r.text
        me = r.json()
        # register itself is counted as a login event → count should be >=1
        assert (me.get("login_count") or 0) >= 1, f"login_count not incremented after register: {me.get('login_count')}"
        assert me.get("last_login_at"), "last_login_at not set after register"

    def test_login_increments_login_count_again(self):
        s, user, creds = _register_user()
        # Now login again
        s2, r = _login(creds["email"], creds["password"])
        assert r.status_code == 200
        s2.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        me = s2.get(f"{API}/auth/me", timeout=SHORT).json()
        # register → 1, login → 2
        assert (me.get("login_count") or 0) >= 2, f"expected >=2, got {me.get('login_count')}"


# ---------- Admin auto-elevation ----------
class TestAdminAutoElevation:
    def test_regular_user_is_not_admin(self, fresh_free_user):
        s = fresh_free_user["session"]
        me = s.get(f"{API}/auth/me", timeout=SHORT).json()
        assert me.get("is_admin") is False
        q = s.get(f"{API}/quota", timeout=SHORT).json()
        assert q.get("is_admin") is False
        assert q.get("plan") == "free"

    def test_admin_user_is_admin_and_effective_elite(self, admin_client):
        s = admin_client["session"]
        me = s.get(f"{API}/auth/me", timeout=SHORT).json()
        assert me.get("is_admin") is True, f"admin flag missing for {ADMIN_EMAIL}: {me}"
        assert me.get("email", "").lower() == ADMIN_EMAIL
        # Quota should show effective plan elite
        q = s.get(f"{API}/quota", timeout=SHORT).json()
        assert q.get("is_admin") is True
        assert q.get("plan") == "elite", f"admin effective plan should be elite, got {q.get('plan')}"
        assert q["watchlist_limit"] == 25
        assert q["analyses_day_limit"] is None
        assert q["quick_actions"] is True


# ---------- Admin endpoints authorization ----------
class TestAdminAuth:
    def test_admin_users_requires_admin(self, fresh_free_user):
        s = fresh_free_user["session"]
        r = s.get(f"{API}/admin/users", timeout=SHORT)
        assert r.status_code == 403
        assert "admin" in (r.json().get("detail") or "").lower()

    def test_admin_logins_requires_admin(self, fresh_free_user):
        s = fresh_free_user["session"]
        r = s.get(f"{API}/admin/logins", timeout=SHORT)
        assert r.status_code == 403

    def test_admin_unlock_requires_admin(self, fresh_free_user):
        s = fresh_free_user["session"]
        r = s.post(f"{API}/admin/users/anything/unlock", json={"duration": "1h"}, timeout=SHORT)
        assert r.status_code == 403

    def test_admin_reset_requires_admin(self, fresh_free_user):
        s = fresh_free_user["session"]
        r = s.post(f"{API}/admin/users/anything/reset", timeout=SHORT)
        assert r.status_code == 403

    def test_admin_endpoints_require_auth(self):
        for path in ("users", "logins"):
            r = requests.get(f"{API}/admin/{path}", timeout=SHORT)
            assert r.status_code in (401, 403)


# ---------- Admin user management ----------
class TestAdminUserListing:
    def test_admin_users_returns_list(self, admin_client):
        s = admin_client["session"]
        r = s.get(f"{API}/admin/users", timeout=MED)
        assert r.status_code == 200, r.text
        users = r.json()
        assert isinstance(users, list)
        assert len(users) > 0
        # Shape check
        sample = users[0]
        for k in ("id", "email", "plan", "is_admin", "login_count"):
            assert k in sample, f"missing {k} in admin user entry"
        # No password hash leaked anywhere
        blob = str(users).lower()
        assert "password_hash" not in blob
        assert "password" not in blob
        # Admin entry should have is_admin true
        admin_entry = next((u for u in users if (u.get("email") or "").lower() == ADMIN_EMAIL), None)
        assert admin_entry, "admin user not in list"
        assert admin_entry["is_admin"] is True

    def test_admin_logins_shape(self, admin_client):
        s = admin_client["session"]
        r = s.get(f"{API}/admin/logins", timeout=MED)
        assert r.status_code == 200, r.text
        events = r.json()
        assert isinstance(events, list)
        if events:  # if any login events, validate shape
            e = events[0]
            for k in ("email", "method", "at"):
                assert k in e, f"login event missing {k}"


# ---------- Admin: unlock & reset flow ----------
class TestUnlockFlow:
    def test_unlock_nonexistent_user_returns_404(self, admin_client):
        s = admin_client["session"]
        r = s.post(f"{API}/admin/users/does-not-exist-xyz/unlock", json={"duration": "1h"}, timeout=SHORT)
        assert r.status_code == 404

    def test_unlock_invalid_duration_returns_422(self, admin_client, fresh_free_user):
        s = admin_client["session"]
        target_id = fresh_free_user["user"]["id"]
        r = s.post(f"{API}/admin/users/{target_id}/unlock", json={"duration": "99z"}, timeout=SHORT)
        assert r.status_code == 422

    def test_unlock_1h_grants_elite_effective_plan(self, admin_client):
        # Create a brand-new free user, have admin unlock for 1h, verify that user's /quota flips.
        target_s, target_user, _ = _register_user()
        s = admin_client["session"]
        r = s.post(f"{API}/admin/users/{target_user['id']}/unlock", json={"duration": "1h"}, timeout=SHORT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["email"].lower() == target_user["email"].lower()
        expires = body["test_unlock_expires_at"]
        assert expires and expires != "forever"
        # ISO date format check
        assert re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", expires), f"bad iso: {expires}"

        # Target user's quota should now reflect elite (test_unlock_active=true)
        q = target_s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["plan"] == "elite", f"expected elite after unlock, got {q['plan']}"
        assert q["test_unlock_active"] is True
        assert q["watchlist_limit"] == 25
        assert q["quick_actions"] is True

    def test_unlock_forever_sets_string_literal(self, admin_client):
        target_s, target_user, _ = _register_user()
        s = admin_client["session"]
        r = s.post(f"{API}/admin/users/{target_user['id']}/unlock",
                   json={"duration": "forever"}, timeout=SHORT)
        assert r.status_code == 200, r.text
        assert r.json()["test_unlock_expires_at"] == "forever"
        q = target_s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["plan"] == "elite"
        assert q["test_unlock_active"] is True
        assert q["test_unlock_expires_at"] == "forever"

    def test_reset_clears_unlock_and_back_to_free(self, admin_client):
        target_s, target_user, _ = _register_user()
        s = admin_client["session"]
        # grant unlock first
        s.post(f"{API}/admin/users/{target_user['id']}/unlock", json={"duration": "1d"}, timeout=SHORT)
        # then reset
        r = s.post(f"{API}/admin/users/{target_user['id']}/reset", timeout=SHORT)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # target user quota reverts
        q = target_s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["plan"] == "free"
        assert q["test_unlock_active"] is False
        assert q.get("test_unlock_expires_at") in (None, "")

    def test_reset_nonexistent_user_returns_404(self, admin_client):
        s = admin_client["session"]
        r = s.post(f"{API}/admin/users/nonexistent-xyz-999/reset", timeout=SHORT)
        assert r.status_code == 404


# ---------- Unlock enforcement (quota gates) ----------
class TestUnlockEnforcement:
    def test_unlocked_user_bypasses_watchlist_limit(self, admin_client):
        target_s, target_user, _ = _register_user()
        # as free, only 3 watchlist items allowed — prove it
        for tk in ["AAPL", "MSFT", "GOOGL"]:
            r = target_s.post(f"{API}/watchlist", json={"ticker": tk, "category": "tech"}, timeout=MED)
            assert r.status_code == 200, r.text
        r = target_s.post(f"{API}/watchlist", json={"ticker": "TSLA", "category": "tech"}, timeout=MED)
        assert r.status_code == 402  # free limit hit

        # Admin unlocks user → elite limits (25)
        admin_s = admin_client["session"]
        up = admin_s.post(f"{API}/admin/users/{target_user['id']}/unlock",
                          json={"duration": "1h"}, timeout=SHORT)
        assert up.status_code == 200

        # Now the same add should succeed
        r = target_s.post(f"{API}/watchlist", json={"ticker": "TSLA", "category": "tech"}, timeout=MED)
        assert r.status_code == 200, f"after unlock, 4th add should succeed: {r.status_code} {r.text}"

        # And a 5th too
        r = target_s.post(f"{API}/watchlist", json={"ticker": "NVDA", "category": "tech"}, timeout=MED)
        assert r.status_code == 200

        # Reset → back to free; a new add beyond 3 should now fail again
        admin_s.post(f"{API}/admin/users/{target_user['id']}/reset", timeout=SHORT)
        r = target_s.post(f"{API}/watchlist", json={"ticker": "AMZN", "category": "tech"}, timeout=MED)
        assert r.status_code == 402, f"after reset, should be re-limited: {r.status_code} {r.text}"

    def test_unlocked_user_can_call_quick_top(self, admin_client):
        target_s, target_user, _ = _register_user()
        target_s.post(f"{API}/watchlist", json={"ticker": "AAPL", "category": "tech"}, timeout=MED)
        # free user → 402 on quick_top
        r = target_s.post(f"{API}/analysis/quick/top", timeout=SHORT)
        assert r.status_code == 402

        admin_s = admin_client["session"]
        admin_s.post(f"{API}/admin/users/{target_user['id']}/unlock",
                     json={"duration": "1h"}, timeout=SHORT)

        # Now gate should be lifted; we don't invoke the heavy endpoint,
        # just re-confirm via quota that the user can access quick actions.
        q = target_s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["quick_actions"] is True
        assert q["plan"] == "elite"


# ---------- Scorecard ----------
class TestScorecard:
    def test_scorecard_me_requires_auth(self):
        r = requests.get(f"{API}/scorecard/me", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_scorecard_global_requires_auth(self):
        r = requests.get(f"{API}/scorecard/global", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_scorecard_me_shape_empty(self):
        s, user, _ = _register_user()
        r = s.get(f"{API}/scorecard/me", timeout=MED)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "summary" in body and "verdicts" in body
        summ = body["summary"]
        for k in ("total", "resolved", "pending", "unresolvable", "hits", "misses",
                  "hit_rate", "by_recommendation", "by_confidence_band",
                  "by_confidence_band_pre_calibration", "threshold_pct", "methodology"):
            assert k in summ, f"missing {k} in scorecard summary"
        assert summ["threshold_pct"] == 5.0 or summ["threshold_pct"] == 5
        for rec in ("BUY", "SELL", "HOLD"):
            assert rec in summ["by_recommendation"]
            for k in ("total", "hits", "misses", "hit_rate"):
                assert k in summ["by_recommendation"][rec]
        # Confidence bands: 5 bands, each with hit/miss/total/hit_rate shape
        assert len(summ["by_confidence_band"]) == 5
        for band in summ["by_confidence_band"].values():
            for k in ("total", "hits", "misses", "hit_rate"):
                assert k in band
        # fresh user has no analyses
        assert summ["total"] == 0
        assert summ["resolved"] == 0
        assert body["verdicts"] == []

    def test_scorecard_global_shape(self, admin_client):
        s = admin_client["session"]
        r = s.get(f"{API}/scorecard/global", timeout=MED)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "summary" in body
        # MUST NOT expose user_id or email anywhere
        blob = str(body).lower()
        assert "user_id" not in blob, f"global scorecard leaks user_id: {blob[:400]}"
        assert "@" not in blob or "email" not in blob, f"global scorecard leaks email"
        summ = body["summary"]
        for k in ("total", "resolved", "pending", "hits", "misses",
                  "hit_rate", "by_recommendation", "by_confidence_band", "threshold_pct"):
            assert k in summ

    def test_scorecard_pending_after_fresh_analysis(self, admin_client):
        """Admin has elite effective plan → can create real analyses unlimited.
        Newly-created analysis must show status=pending — its time_horizon_weeks
        (minimum 2 weeks per ai.py) has not elapsed yet, so verdict_resolution.py
        has nothing to grade. This must remain true regardless of how short the
        horizon is, since resolution only runs from the background loop, never
        inline during the request."""
        s = admin_client["session"]
        # Create a fresh analysis
        r = s.post(f"{API}/analysis/AAPL", timeout=LONG)
        if r.status_code == 503:
            pytest.skip("LLM budget exhausted; cannot create analysis")
        assert r.status_code == 200, f"analysis POST failed: {r.status_code} {r.text[:300]}"
        analysis = r.json()
        aid = analysis.get("id")
        assert aid, f"no id in analysis response: {analysis}"

        # Fetch scorecard
        sc = s.get(f"{API}/scorecard/me", timeout=MED).json()
        # Find the verdict
        v = next((x for x in sc["verdicts"] if x.get("analysis_id") == aid), None)
        assert v, f"newly created analysis {aid} not in verdicts list"
        # Required fields — note actual_price is gone (see verdict_resolution.py
        # docstring): resolution_price only appears once a verdict is graded,
        # and grading happens once, permanently, not on every scorecard read.
        for k in ("analysis_id", "ticker", "recommendation", "confidence_score",
                  "price_at_analysis", "price_target", "resolution_price", "return_pct",
                  "status", "created_at", "time_horizon_weeks"):
            assert k in v, f"scorecard verdict missing {k}"
        # Fresh → pending, and no resolution price yet (nothing to resolve against)
        assert v["status"] == "pending", f"expected pending for a just-created analysis, got {v['status']}"
        assert v["resolution_price"] is None
        # summary pending count >=1
        assert sc["summary"]["pending"] >= 1
