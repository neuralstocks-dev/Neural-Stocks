"""Iteration 2 backend tests: plans, quota, Google OAuth, plan upgrade,
plan enforcement (watchlist / quick actions / analysis quota), share verdict,
and public verdict endpoints for Neural (AI Stock Analysis Platform)."""
import os
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


# ---------- Shared helpers ----------
def _register():
    """Register a fresh user and return (session-with-token, user_dict)."""
    uniq = uuid.uuid4().hex[:10]
    creds = {
        "email": f"TEST_it2_{uniq}@example.com",
        "password": "Passw0rd!123",
        "full_name": "TEST Iter2",
    }
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json=creds, timeout=SHORT)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    # Iteration 4: accept disclaimer so analysis endpoints aren't 428-gated.
    # Tests that specifically assert plan/quota gates (402/429) still work
    # because the disclaimer gate only fires before acceptance.
    s.post(f"{API}/disclaimer/accept", timeout=SHORT)
    return s, data["user"], creds


@pytest.fixture(scope="module")
def fresh_free_user():
    s, user, creds = _register()
    return {"session": s, "user": user, "creds": creds}


# ---------- Plans ----------
class TestPlans:
    def test_plans_returns_all_three(self):
        r = requests.get(f"{API}/plans", timeout=SHORT)
        assert r.status_code == 200
        plans = r.json()
        for key in ("free", "pro", "elite"):
            assert key in plans, f"missing plan {key}"
            p = plans[key]
            for field in (
                "watchlist_limit",
                "analyses_per_day",
                "analyses_per_week",
                "quick_actions",
                "share_verdicts",
                "analysis_history_days",
            ):
                assert field in p, f"plan {key} missing {field}"

    def test_plan_limits_per_tier(self):
        plans = requests.get(f"{API}/plans", timeout=SHORT).json()
        # free
        assert plans["free"]["watchlist_limit"] == 3
        assert plans["free"]["analyses_per_day"] == 1
        assert plans["free"]["analyses_per_week"] == 2
        assert plans["free"]["quick_actions"] is False
        assert plans["free"]["share_verdicts"] is False
        # pro
        assert plans["pro"]["watchlist_limit"] == 10
        assert plans["pro"]["analyses_per_day"] == 15
        assert plans["pro"]["analyses_per_week"] == 60
        assert plans["pro"]["quick_actions"] is True
        assert plans["pro"]["share_verdicts"] is True
        # elite (unlimited analyses => None)
        assert plans["elite"]["watchlist_limit"] == 25
        assert plans["elite"]["analyses_per_day"] is None
        assert plans["elite"]["analyses_per_week"] is None
        assert plans["elite"]["quick_actions"] is True
        assert plans["elite"]["share_verdicts"] is True


# ---------- Auth plan field ----------
class TestAuthPlanField:
    def test_register_returns_plan_free(self):
        _, user, _ = _register()
        assert user.get("plan") == "free"

    def test_login_returns_plan(self):
        s, user, creds = _register()
        r = requests.post(
            f"{API}/auth/login",
            json={"email": creds["email"], "password": creds["password"]},
            timeout=SHORT,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["user"].get("plan") == "free"


# ---------- Quota ----------
class TestQuota:
    def test_quota_requires_auth(self):
        r = requests.get(f"{API}/quota", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_quota_shape_free(self, fresh_free_user):
        s = fresh_free_user["session"]
        r = s.get(f"{API}/quota", timeout=SHORT)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["plan"] == "free"
        for key in (
            "watchlist_used",
            "watchlist_limit",
            "analyses_today",
            "analyses_day_limit",
            "analyses_this_week",
            "analyses_week_limit",
            "quick_actions",
            "share_verdicts",
        ):
            assert key in q, f"missing {key}"
        assert q["watchlist_limit"] == 3
        assert q["analyses_day_limit"] == 1
        assert q["analyses_week_limit"] == 2
        assert q["quick_actions"] is False
        assert q["share_verdicts"] is False


# ---------- Google OAuth endpoint ----------
class TestGoogleOAuth:
    def test_google_session_invalid_returns_401(self):
        r = requests.post(
            f"{API}/auth/google/session",
            json={"session_id": "fake-session-id-xxx"},
            timeout=SHORT,
        )
        # Real Emergent endpoint should reject fake session → our API wraps as 401.
        # Accept 401 (invalid) or 502 (upstream unreachable) but NOT 500 / 200.
        assert r.status_code in (401, 502), f"got {r.status_code}: {r.text}"
        if r.status_code == 401:
            detail = (r.json().get("detail") or "").lower()
            assert "invalid" in detail or "expired" in detail or "google" in detail

    def test_google_session_missing_body_returns_422(self):
        r = requests.post(f"{API}/auth/google/session", json={}, timeout=SHORT)
        # Pydantic validation error
        assert r.status_code in (400, 422)


# ---------- Plan upgrade ----------
class TestPlanUpgrade:
    def test_upgrade_to_pro(self):
        s, _, _ = _register()
        r = s.post(f"{API}/plan/upgrade", json={"plan": "pro"}, timeout=SHORT)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("plan") == "pro"
        assert "message" in j
        # Verify quota reflects pro
        q = s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["plan"] == "pro"
        assert q["watchlist_limit"] == 10
        assert q["quick_actions"] is True

    def test_upgrade_invalid_plan(self):
        s, _, _ = _register()
        r = s.post(f"{API}/plan/upgrade", json={"plan": "invalid"}, timeout=SHORT)
        assert r.status_code in (400, 422), r.text

    def test_upgrade_requires_auth(self):
        r = requests.post(
            f"{API}/plan/upgrade", json={"plan": "pro"}, timeout=SHORT
        )
        assert r.status_code in (401, 403)

    def test_upgrade_to_elite_unlimited(self):
        s, _, _ = _register()
        r = s.post(f"{API}/plan/upgrade", json={"plan": "elite"}, timeout=SHORT)
        assert r.status_code == 200
        q = s.get(f"{API}/quota", timeout=SHORT).json()
        assert q["plan"] == "elite"
        assert q["watchlist_limit"] == 25
        assert q["analyses_day_limit"] is None
        assert q["analyses_week_limit"] is None


# ---------- Plan enforcement: Free tier ----------
class TestFreeTierEnforcement:
    def test_watchlist_limit_free_is_three(self):
        s, _, _ = _register()
        # add 3 should succeed, 4th returns 402
        for tk in ["AAPL", "MSFT", "GOOGL"]:
            r = s.post(f"{API}/watchlist", json={"ticker": tk, "category": "tech"}, timeout=MED)
            assert r.status_code == 200, f"add {tk} failed: {r.status_code} {r.text}"
        r = s.post(f"{API}/watchlist", json={"ticker": "TSLA", "category": "tech"}, timeout=MED)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "")
        assert "free" in detail.lower() or "limit" in detail.lower()

    def test_quick_top_gated_for_free(self):
        s, _, _ = _register()
        # watchlist non-empty (so the gate triggers BEFORE the empty check
        # — our server actually checks plan before items; verify)
        s.post(f"{API}/watchlist", json={"ticker": "AAPL", "category": "tech"}, timeout=MED)
        r = s.post(f"{API}/analysis/quick/top", timeout=MED)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "pro" in detail or "elite" in detail or "upgrade" in detail

    def test_analysis_daily_quota_free(self):
        """Free plan: 1 analysis/day. First may succeed OR 503 (budget).
        Second on same day MUST return 402 IF first succeeded.
        If first returns 503 (budget exhausted), assert the message mentions budget."""
        s, _, _ = _register()
        r1 = s.post(f"{API}/analysis/AAPL", timeout=LONG)
        if r1.status_code == 503:
            detail = (r1.json().get("detail") or "").lower()
            assert "budget" in detail, f"503 should mention budget, got: {detail}"
            pytest.skip("LLM budget exhausted — quota-depletion assertion skipped per spec")
        elif r1.status_code == 200:
            # second call should be gated by daily quota
            r2 = s.post(f"{API}/analysis/MSFT", timeout=LONG)
            assert r2.status_code == 402, f"expected 402 on 2nd analysis, got {r2.status_code}: {r2.text}"
            detail = (r2.json().get("detail") or "").lower()
            assert "limit" in detail or "free" in detail or "upgrade" in detail
        else:
            pytest.fail(f"unexpected status from /analysis: {r1.status_code} {r1.text}")


# ---------- Share Verdict ----------
class TestShareVerdict:
    @pytest.fixture(scope="class")
    def pro_user_with_analysis(self):
        """Pro user; attempts one analysis. If LLM budget is exhausted, return
        {'analysis_id': None} so tests can skip gracefully."""
        s, user, _ = _register()
        up = s.post(f"{API}/plan/upgrade", json={"plan": "pro"}, timeout=SHORT)
        assert up.status_code == 200
        r = s.post(f"{API}/analysis/AAPL", timeout=LONG)
        analysis_id = None
        if r.status_code == 200:
            analysis_id = r.json().get("id")
        elif r.status_code == 503:
            pass  # budget exhausted
        else:
            pytest.fail(f"unexpected analysis status: {r.status_code} {r.text[:300]}")
        return {"session": s, "user": user, "analysis_id": analysis_id}

    def test_share_requires_pro_plan(self):
        """Free tier gets 402 on share."""
        s, _, _ = _register()  # free
        r = s.post(f"{API}/analysis/does-not-matter/share", timeout=SHORT)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or "").lower()
        assert "pro" in detail or "elite" in detail or "upgrade" in detail

    def test_share_requires_auth(self):
        r = requests.post(f"{API}/analysis/x/share", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_share_nonexistent_analysis_returns_404(self):
        s, _, _ = _register()
        s.post(f"{API}/plan/upgrade", json={"plan": "pro"}, timeout=SHORT)
        r = s.post(f"{API}/analysis/nonexistent-id-xyz/share", timeout=SHORT)
        assert r.status_code == 404

    def test_share_creates_and_is_idempotent(self, pro_user_with_analysis):
        if not pro_user_with_analysis["analysis_id"]:
            pytest.skip("LLM budget exhausted — cannot create analysis to share")
        s = pro_user_with_analysis["session"]
        aid = pro_user_with_analysis["analysis_id"]

        r1 = s.post(f"{API}/analysis/{aid}/share", timeout=SHORT)
        assert r1.status_code == 200, r1.text
        j1 = r1.json()
        assert "share_id" in j1 and isinstance(j1["share_id"], str) and len(j1["share_id"]) >= 6
        assert j1["url_path"] == f"/v/{j1['share_id']}"
        assert "created_at" in j1

        # idempotent: same share_id on second call
        r2 = s.post(f"{API}/analysis/{aid}/share", timeout=SHORT)
        assert r2.status_code == 200
        assert r2.json()["share_id"] == j1["share_id"]

    def test_public_verdict_no_auth(self, pro_user_with_analysis):
        if not pro_user_with_analysis["analysis_id"]:
            pytest.skip("LLM budget exhausted — cannot create shared verdict")
        s = pro_user_with_analysis["session"]
        aid = pro_user_with_analysis["analysis_id"]
        share_id = s.post(f"{API}/analysis/{aid}/share", timeout=SHORT).json()["share_id"]

        # NO auth header
        r = requests.get(f"{API}/public/verdict/{share_id}", timeout=SHORT)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["share_id"] == share_id
        assert "shared_at" in j
        assert "shared_by_name" in j
        a = j.get("analysis") or {}
        # Required fields in public analysis
        for field in (
            "ticker",
            "recommendation",
            "confidence_score",
            "price_target",
            "stop_loss",
            "reasoning",
            "risk_factors",
            "executive_summary",
            "technical_analysis",
            "fundamental_analysis",
            "peer_comparison",
            "technicals",
            "fundamentals",
            "quote_snapshot",
        ):
            assert field in a, f"public verdict missing field {field}"
        # Must NOT leak private fields
        flat = str(j).lower()
        assert "password_hash" not in flat
        assert "user_id" not in a  # analysis block must not have user_id
        # The public endpoint scrubs email/id from owner — ensure not in public view of owner
        assert "email" not in str(j).lower() or "@" not in j.get("shared_by_name", "")

    def test_public_verdict_nonexistent_404(self):
        r = requests.get(f"{API}/public/verdict/does-not-exist-xyz", timeout=SHORT)
        assert r.status_code == 404
