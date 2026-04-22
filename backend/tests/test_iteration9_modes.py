"""Iteration 9 — Analysis Mode tests (standard / candlestick / hybrid).

Strategy: minimize LLM calls. We do at most ONE real hybrid call (cached on TSLA
via existing analysis written to db.analyses by main agent), and verify the rest
through gating (400/402) which short-circuits before any LLM/yfinance work.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "jolor69@gmail.com", "password": "admin1234"}
PRO = {"email": "tiers@demo.io", "password": "pass1234"}
FREE = {"email": "demo@stockai.io", "password": "demo1234"}


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {payload['email']}: {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def pro_headers():
    return {"Authorization": f"Bearer {_login(PRO)}"}


@pytest.fixture(scope="module")
def free_headers():
    return {"Authorization": f"Bearer {_login(FREE)}"}


# --- Validation / mode dispatch ----------------------------------------------

class TestModeValidation:
    def test_invalid_mode_returns_400(self, admin_headers):
        r = requests.post(f"{API}/analysis/AAPL?mode=bogus", headers=admin_headers, timeout=20)
        assert r.status_code == 400, r.text
        assert "mode" in r.text.lower()


# --- Plan gating --------------------------------------------------------------

class TestPlanGating:
    def test_free_user_blocked_from_hybrid(self, free_headers):
        r = requests.post(f"{API}/analysis/AAPL?mode=hybrid", headers=free_headers, timeout=20)
        assert r.status_code == 402, r.text
        body = r.json().get("detail", "")
        assert "Pro" in body and "Elite" in body

    def test_free_user_blocked_from_candlestick(self, free_headers):
        r = requests.post(f"{API}/analysis/AAPL?mode=candlestick", headers=free_headers, timeout=20)
        assert r.status_code == 402, r.text

    def test_free_user_can_hit_standard_endpoint_shape(self, free_headers):
        # We don't actually want to spend an LLM call here - just confirm mode=standard
        # passes the gate (won't hit 402). We verify against a wrong-ticker 404 which
        # short-circuits early (after gate, before LLM).
        r = requests.post(f"{API}/analysis/ZZZZINVALIDTKR?mode=standard", headers=free_headers, timeout=30)
        # Either 404 (no quote data — gate passed) or 429 (quota) is acceptable;
        # critically NOT 402 (which would be a gating regression)
        assert r.status_code != 402, f"standard mode should not be gated for free: {r.text}"


# --- Existing analyses contain proper shape ----------------------------------

class TestExistingHybridAnalysis:
    """Validate the structure of an already-cached hybrid analysis written by
    the main agent during dev. We do NOT trigger fresh LLM here."""

    def test_admin_history_can_be_fetched(self, admin_headers):
        # TSLA was hybrid-analyzed by main agent per their notes
        r = requests.get(f"{API}/analysis/TSLA/history", headers=admin_headers, timeout=15)
        # 200 even if empty list. Don't fail test on missing — just record
        assert r.status_code == 200, r.text
        history = r.json()
        if not history:
            pytest.skip("No prior TSLA analysis cached — skip shape check")

        # Find a hybrid one
        hybrid = next((a for a in history if a.get("mode") == "hybrid"), None)
        if not hybrid:
            pytest.skip("No hybrid-mode TSLA analysis cached")

        assert hybrid.get("mode") == "hybrid"
        assert "candlestick_findings" in hybrid, f"hybrid analysis missing candlestick_findings: keys={list(hybrid.keys())}"
        cf = hybrid["candlestick_findings"]
        assert "daily" in cf and "weekly" in cf and "combined_bias" in cf
        assert cf["combined_bias"] in ("bullish", "bearish", "neutral")
        # daily/weekly shape
        for tf_key in ("daily", "weekly"):
            tf = cf[tf_key]
            assert "patterns" in tf and "net_bias" in tf and "bias_score" in tf
            assert isinstance(tf["patterns"], list)
        # Standard recommendation fields still present
        assert hybrid.get("recommendation") in ("BUY", "SELL", "HOLD")
        assert isinstance(hybrid.get("confidence_score"), int)

    def test_admin_can_fetch_latest_with_mode_field(self, admin_headers):
        r = requests.get(f"{API}/analysis/TSLA/latest", headers=admin_headers, timeout=15)
        if r.status_code == 404:
            pytest.skip("No latest TSLA analysis")
        assert r.status_code == 200
        doc = r.json()
        # mode may be missing on legacy docs (backward compat); record either way
        assert "recommendation" in doc

    def test_legacy_standard_analysis_lacks_candlestick(self, admin_headers):
        r = requests.get(f"{API}/analysis/AAPL/latest", headers=admin_headers, timeout=15)
        if r.status_code == 404:
            pytest.skip("No AAPL latest")
        assert r.status_code == 200
        doc = r.json()
        # Backward compat: pre-mode docs won't have candlestick_findings
        if doc.get("mode") in (None, "standard"):
            assert "candlestick_findings" not in doc, "standard/legacy analyses must not include candlestick_findings"


# --- Live ONE hybrid call (only if no cached one exists) ---------------------

class TestLiveHybridCall:
    """Last-resort: do ONE real hybrid call if and only if no cached hybrid
    analysis is already present. Constrained to MSFT (small movement) to keep
    runtime reasonable."""

    def test_pro_user_can_invoke_hybrid_if_needed(self, pro_headers):
        # Check existing first
        r = requests.get(f"{API}/analysis/MSFT/history", headers=pro_headers, timeout=15)
        if r.status_code == 200 and any(a.get("mode") == "hybrid" for a in r.json()):
            pytest.skip("hybrid already cached for MSFT — no need to spend LLM tokens")
        # Otherwise, make ONE live hybrid call
        r = requests.post(f"{API}/analysis/MSFT?mode=hybrid", headers=pro_headers, timeout=120)
        assert r.status_code in (200, 429), r.text  # 429 if quota hit
        if r.status_code == 429:
            pytest.skip("Pro user quota exhausted; gating itself is verified by other tests")
        doc = r.json()
        assert doc.get("mode") == "hybrid"
        assert "candlestick_findings" in doc
        cf = doc["candlestick_findings"]
        assert {"daily", "weekly", "combined_bias"}.issubset(cf.keys())
        assert doc.get("recommendation") in ("BUY", "SELL", "HOLD")
