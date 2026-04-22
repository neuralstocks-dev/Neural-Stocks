"""Regression contract: Finnhub market context in /api/analysis/{ticker}.

Locks in the shape the Analysis Report UI + PDF depend on. This test caught a
silent regression in Apr 2026 where the endpoint returned None for every field
after the Finnhub hybrid-quote wiring was introduced.

Strategy — minimise LLM spend:
  * At most ONE real Claude call (standard mode on AAPL).
  * Unit tests for services/finnhub helpers (sentiment, parsers) run offline.
"""
import os
import sys
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "jolor69@gmail.com", "password": "admin1234"}


# Make backend/services importable for offline unit tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Offline unit tests — no network, no LLM
# ---------------------------------------------------------------------------

class TestFinnhubServiceUnits:
    """Guard the deterministic parts of services/finnhub.py."""

    def test_sentiment_positive_keyword(self):
        from services.finnhub import _classify_sentiment
        assert _classify_sentiment("Apple shares surge to record high") == "positive"

    def test_sentiment_negative_keyword(self):
        from services.finnhub import _classify_sentiment
        assert _classify_sentiment("Tesla shares plunge on lawsuit concerns") == "negative"

    def test_sentiment_neutral_when_no_signal(self):
        from services.finnhub import _classify_sentiment
        assert _classify_sentiment("Company names new CFO effective next quarter") == "neutral"

    def test_sentiment_empty_string(self):
        from services.finnhub import _classify_sentiment
        assert _classify_sentiment("") == "neutral"

    def test_is_configured_reflects_env(self, monkeypatch):
        import services.finnhub as fh
        monkeypatch.setattr(fh, "FINNHUB_API_KEY", "")
        assert fh.is_configured() is False
        monkeypatch.setattr(fh, "FINNHUB_API_KEY", "abc123")
        assert fh.is_configured() is True


# ---------------------------------------------------------------------------
# Integration contract — one real analysis call
# ---------------------------------------------------------------------------

def _login(payload):
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.post(f"{API}/auth/login", json=payload, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login failed for {payload['email']}: {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)
    hdr = {"Authorization": f"Bearer {tok}"}
    # Disclaimer must be accepted before analysis is allowed
    requests.post(f"{API}/disclaimer/accept", headers=hdr, timeout=15)
    return hdr


@pytest.fixture(scope="module")
def analysis(admin_headers):
    """Run ONE real analysis on AAPL in standard mode. Shared across tests."""
    r = requests.post(
        f"{API}/analysis/AAPL?mode=standard",
        headers=admin_headers,
        timeout=120,
    )
    if r.status_code == 503:
        pytest.skip(f"LLM budget exhausted: {r.text[:200]}")
    assert r.status_code == 200, f"analysis failed: {r.status_code} {r.text[:300]}"
    return r.json()


class TestAnalysisContract:
    """These fields are consumed by AnalysisReportPage + VerdictRing + PDF.
    If any of them come back None / wrong type, the UI breaks silently."""

    def test_core_verdict_fields_present(self, analysis):
        assert analysis["recommendation"] in ("BUY", "SELL", "HOLD"), analysis["recommendation"]
        conf = analysis["confidence_score"]
        assert isinstance(conf, int) and 0 <= conf <= 100, conf
        assert isinstance(analysis["price_target"], (int, float))
        assert isinstance(analysis["stop_loss"], (int, float))
        assert (analysis.get("executive_summary") or "").strip(), "empty executive_summary"
        assert (analysis.get("reasoning") or "").strip(), "empty reasoning"

    def test_quote_snapshot_has_live_price(self, analysis):
        q = analysis.get("quote_snapshot") or {}
        assert isinstance(q.get("price"), (int, float)) and q["price"] > 0
        assert q.get("currency"), "missing currency"
        # After Apr 2026: we merge Finnhub live quote into yfinance snapshot.
        # quote_source is either 'finnhub+yfinance' (primary) or 'yfinance' (fallback).
        assert q.get("quote_source") in ("finnhub+yfinance", "yfinance"), q.get("quote_source")

    def test_mode_and_id_echoed(self, analysis):
        assert analysis["mode"] == "standard"
        assert analysis.get("id")
        assert analysis.get("ticker") == "AAPL"


class TestFinnhubMarketContext:
    """Only runs when FINNHUB_API_KEY is configured on the server. Skips
    gracefully otherwise so the suite passes on free-yfinance-only deploys."""

    def _mc(self, analysis):
        return analysis.get("market_context") or {}

    def test_market_context_configured_when_key_present(self, analysis):
        mc = self._mc(analysis)
        if not mc or not mc.get("configured"):
            pytest.skip("Finnhub not configured on this environment")
        assert mc["configured"] is True

    def test_at_least_one_finnhub_stream_populated(self, analysis):
        mc = self._mc(analysis)
        if not mc.get("configured"):
            pytest.skip("Finnhub not configured")
        has_any = bool(
            (mc.get("news") or {}).get("articles")
            or mc.get("analyst_consensus")
            or mc.get("earnings")
        )
        assert has_any, f"Finnhub configured but all 3 streams empty: {mc}"

    def test_news_article_shape(self, analysis):
        mc = self._mc(analysis)
        if not mc.get("configured"):
            pytest.skip("Finnhub not configured")
        articles = (mc.get("news") or {}).get("articles") or []
        if not articles:
            pytest.skip("No news available for AAPL this window")
        a = articles[0]
        # Fields the UI reads directly
        for key in ("headline", "source", "url", "published_at", "sentiment"):
            assert key in a, f"news article missing key {key}"
        assert a["sentiment"] in ("positive", "negative", "neutral")
        summary = (mc.get("news") or {}).get("summary_sentiment")
        assert summary in ("positive", "negative", "neutral")
        score = (mc.get("news") or {}).get("score")
        assert isinstance(score, (int, float)) and -1.0 <= score <= 1.0

    def test_analyst_consensus_shape(self, analysis):
        mc = self._mc(analysis)
        if not mc.get("configured"):
            pytest.skip("Finnhub not configured")
        c = mc.get("analyst_consensus")
        if not c:
            pytest.skip("No analyst coverage for AAPL")
        for key in ("strong_buy", "buy", "hold", "sell", "strong_sell", "total",
                    "score", "recommendation_label"):
            assert key in c, f"analyst_consensus missing key {key}"
        # All vote buckets must be non-negative ints
        for bucket in ("strong_buy", "buy", "hold", "sell", "strong_sell"):
            assert isinstance(c[bucket], int) and c[bucket] >= 0
        assert c["total"] == c["strong_buy"] + c["buy"] + c["hold"] + c["sell"] + c["strong_sell"]
        assert c["recommendation_label"] in ("BUY", "OVERWEIGHT", "HOLD", "UNDERWEIGHT", "SELL")
        assert -1.0 <= c["score"] <= 1.0

    def test_earnings_shape(self, analysis):
        mc = self._mc(analysis)
        if not mc.get("configured"):
            pytest.skip("Finnhub not configured")
        e = mc.get("earnings")
        if not e:
            pytest.skip("No upcoming earnings for AAPL")
        # date is ISO YYYY-MM-DD, days_until is int (can be 0 or negative if stale)
        assert isinstance(e.get("date"), str) and len(e["date"]) >= 10
        if e.get("days_until") is not None:
            assert isinstance(e["days_until"], int)
        # Optional fields but when present must be the right shape
        if e.get("hour") is not None:
            assert (e["hour"] or "").lower() in ("bmo", "amc", "dmh", "")
        if e.get("eps_estimate") is not None:
            assert isinstance(e["eps_estimate"], (int, float))
        if e.get("revenue_estimate") is not None:
            assert isinstance(e["revenue_estimate"], (int, float))


class TestPdfIncludesMarketContext:
    """PDF export must still render cleanly when market_context is populated."""

    def test_pdf_download(self, admin_headers, analysis):
        aid = analysis["id"]
        r = requests.get(f"{API}/analysis/{aid}/pdf", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        # Minimal sanity: PDF magic header + reasonable size (> 4 KB)
        assert r.content.startswith(b"%PDF"), "response is not a PDF"
        assert len(r.content) > 4000, f"PDF suspiciously small: {len(r.content)} bytes"
