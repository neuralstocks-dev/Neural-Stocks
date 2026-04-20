"""Iteration 8 (Timeline Fit) — backend tests.

Covers POST /api/analysis/timeline/{ticker}, GET /api/analysis/timeline/{ticker}/latest,
Pro/Elite gating, disclaimer gate, watchlist validation, 24h cache, and quota side-effects.

Admin (jolor69) already has AAPL in watchlist + a cached timeline reco (within 24h) —
we rely on that for the cache-hit path to avoid 10-20s Claude calls.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"
PRO_EMAIL = "tiers@demo.io"
PRO_PASS = "pass1234"
FREE_EMAIL = "demo@stockai.io"
FREE_PASS = "demo1234"


def _login(email, password):
    r = requests.post(
        f"{API}/auth/login", json={"email": email, "password": password}, timeout=20
    )
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PASS)
    # Accept disclaimer if needed (idempotent)
    requests.post(f"{API}/disclaimer/accept", headers=_hdr(tok), timeout=15)
    return tok


@pytest.fixture(scope="session")
def pro_token():
    tok = _login(PRO_EMAIL, PRO_PASS)
    requests.post(f"{API}/disclaimer/accept", headers=_hdr(tok), timeout=15)
    return tok


@pytest.fixture(scope="session")
def free_token():
    tok = _login(FREE_EMAIL, FREE_PASS)
    requests.post(f"{API}/disclaimer/accept", headers=_hdr(tok), timeout=15)
    return tok


# ---------- Shape / cache hit (admin has cached AAPL) ----------
class TestTimelineResponseShape:
    def test_admin_aapl_cache_returns_full_shape(self, admin_token):
        r = requests.post(
            f"{API}/analysis/timeline/AAPL", headers=_hdr(admin_token), timeout=60
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        d = r.json()

        # Top-level server-added fields
        for key in (
            "recommended_timeline",
            "recommendation_label",
            "confidence_score",
            "summary",
            "explanation",
            "strengths",
            "risks",
            "other_timelines",
            "data_completeness_note",
            "ticker",
            "name",
            "price_at_analysis",
            "currency",
            "created_at",
            "cached",
        ):
            assert key in d, f"missing key: {key}"

        assert d["recommended_timeline"] in ("short_term", "medium_term", "long_term")
        assert isinstance(d["recommendation_label"], str) and d["recommendation_label"]
        assert isinstance(d["confidence_score"], (int, float))
        assert 0 <= d["confidence_score"] <= 100
        assert d["ticker"] == "AAPL"

        # strengths / risks bounded 3-5 items
        assert isinstance(d["strengths"], list) and 3 <= len(d["strengths"]) <= 5
        assert isinstance(d["risks"], list) and 3 <= len(d["risks"]) <= 5
        for s in d["strengths"] + d["risks"]:
            assert isinstance(s, str) and s
            # Prompt forbids direct BUY/SELL language
            low = s.lower()
            assert " buy" not in low and " sell" not in low, (
                f"strength/risk contains buy/sell directive: {s}"
            )

        # other_timelines — 3 keys each with fit_score + note
        ot = d["other_timelines"]
        assert set(ot.keys()) == {"short_term", "medium_term", "long_term"}
        for k, v in ot.items():
            assert "fit_score" in v and "note" in v
            assert 0 <= v["fit_score"] <= 100
            assert isinstance(v["note"], str) and v["note"]

    def test_cache_hit_returns_cached_true(self, admin_token):
        # Two back-to-back calls → both should be cached=True (first may already be cached)
        r1 = requests.post(
            f"{API}/analysis/timeline/AAPL", headers=_hdr(admin_token), timeout=60
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{API}/analysis/timeline/AAPL", headers=_hdr(admin_token), timeout=60
        )
        assert r2.status_code == 200
        assert r2.json().get("cached") is True


# ---------- Plan gating ----------
class TestTimelinePlanGate:
    def test_free_user_gets_402(self, free_token):
        # free user may or may not have AAPL; gate triggers before watchlist check
        r = requests.post(
            f"{API}/analysis/timeline/AAPL", headers=_hdr(free_token), timeout=20
        )
        assert r.status_code == 402, f"{r.status_code} {r.text[:200]}"
        assert "Pro/Elite" in r.json().get("detail", "")


# ---------- Watchlist gating ----------
class TestTimelineWatchlistGate:
    def test_ticker_not_in_watchlist_400(self, admin_token):
        # Pick a ticker very unlikely to be in admin watchlist
        r = requests.post(
            f"{API}/analysis/timeline/ZZZZXYZ", headers=_hdr(admin_token), timeout=20
        )
        assert r.status_code == 400
        assert "not in your watchlist" in r.json().get("detail", "")

    def test_pro_ticker_not_in_watchlist_400(self, pro_token):
        r = requests.post(
            f"{API}/analysis/timeline/NVDA", headers=_hdr(pro_token), timeout=20
        )
        # tiers@demo.io watchlist is AAPL + MSFT only
        assert r.status_code in (400,), f"{r.status_code} {r.text[:200]}"
        assert "not in your watchlist" in r.json().get("detail", "")


# ---------- GET /latest ----------
class TestTimelineLatest:
    def test_latest_returns_stored_reco(self, admin_token):
        r = requests.get(
            f"{API}/analysis/timeline/AAPL/latest", headers=_hdr(admin_token), timeout=15
        )
        assert r.status_code == 200
        d = r.json()
        assert d["ticker"] == "AAPL"
        assert d["recommended_timeline"] in ("short_term", "medium_term", "long_term")
        assert "created_at" in d

    def test_latest_returns_404_when_none(self, admin_token):
        r = requests.get(
            f"{API}/analysis/timeline/ZZZZXYZ/latest",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 404

    def test_latest_case_insensitive(self, admin_token):
        r = requests.get(
            f"{API}/analysis/timeline/aapl/latest", headers=_hdr(admin_token), timeout=15
        )
        assert r.status_code == 200
        assert r.json()["ticker"] == "AAPL"


# ---------- Cached call does NOT increment analysis quota ----------
class TestTimelineQuota:
    def test_cached_call_does_not_add_to_analyses(self, admin_token):
        # Use /analysis/AAPL/history which lists user's per-ticker analyses
        before = requests.get(
            f"{API}/analysis/AAPL/history", headers=_hdr(admin_token), timeout=15
        ).json()
        assert isinstance(before, list)
        before_timeline = sum(1 for a in before if a.get("kind") == "timeline")

        # Trigger cached call
        r = requests.post(
            f"{API}/analysis/timeline/AAPL", headers=_hdr(admin_token), timeout=60
        )
        assert r.status_code == 200
        assert r.json().get("cached") is True

        after = requests.get(
            f"{API}/analysis/AAPL/history", headers=_hdr(admin_token), timeout=15
        ).json()
        after_timeline = sum(1 for a in after if a.get("kind") == "timeline")
        assert after_timeline == before_timeline, (
            f"cached call wrongly inserted into db.analyses "
            f"(before={before_timeline}, after={after_timeline})"
        )


# ---------- Sanity regression on existing endpoints ----------
class TestExistingEndpointsStillWork:
    def test_auth_login_works(self):
        _login(PRO_EMAIL, PRO_PASS)

    def test_pricing_billing_config(self, pro_token):
        r = requests.get(f"{API}/billing/config", headers=_hdr(pro_token), timeout=90)
        assert r.status_code == 200
        d = r.json()
        assert "plan_ids" in d and "prices" in d

    def test_plans_endpoint_public(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "pro" in d and "elite" in d

    def test_watchlist_live(self, pro_token):
        r = requests.get(f"{API}/watchlist/live", headers=_hdr(pro_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_share_public_verdict(self):
        r = requests.get(f"{API}/public/verdict/d4e2f5710f6a", timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text[:150]}"
        d = r.json()
        assert d.get("share_id") == "d4e2f5710f6a"
        assert "analysis" in d
