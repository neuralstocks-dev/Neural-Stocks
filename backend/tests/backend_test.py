"""Backend API tests for AI Stock Analysis Platform (Phase 1 MVP)."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Timeouts
SHORT = 30
MED = 60
LONG = 120  # for AI analysis


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def user_creds():
    uniq = uuid.uuid4().hex[:10]
    return {
        "email": f"TEST_{uniq}@example.com",
        "password": "Passw0rd!123",
        "full_name": "TEST User",
    }


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth(session, user_creds):
    # Register
    r = session.post(f"{API}/auth/register", json=user_creds, timeout=SHORT)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["token"]
    user = data["user"]
    session.headers.update({"Authorization": f"Bearer {token}"})
    return {"token": token, "user": user}


# ---------- Health ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=SHORT)
        assert r.status_code == 200
        j = r.json()
        assert j.get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_register_returns_token_and_user(self, auth, user_creds):
        assert isinstance(auth["token"], str) and len(auth["token"]) > 20
        assert auth["user"]["email"] == user_creds["email"].lower()
        assert auth["user"]["full_name"] == user_creds["full_name"]
        assert "id" in auth["user"]

    def test_register_duplicate_email(self, session, user_creds):
        r = session.post(f"{API}/auth/register", json=user_creds, timeout=SHORT)
        assert r.status_code == 400

    def test_login_success(self, user_creds):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": user_creds["email"], "password": user_creds["password"]},
            timeout=SHORT,
        )
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and "user" in j
        assert j["user"]["email"] == user_creds["email"].lower()

    def test_login_invalid(self, user_creds):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": user_creds["email"], "password": "wrong"},
            timeout=SHORT,
        )
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_me_returns_user(self, session, auth, user_creds):
        r = session.get(f"{API}/auth/me", timeout=SHORT)
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == user_creds["email"].lower()
        assert "password_hash" not in j


# ---------- Stocks ----------
class TestStocks:
    def test_search_with_query(self, session):
        r = session.get(f"{API}/stocks/search", params={"q": "AAPL"}, timeout=SHORT)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert any(s["ticker"] == "AAPL" for s in arr)

    def test_search_empty_returns_popular(self, session):
        r = session.get(f"{API}/stocks/search", timeout=SHORT)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        assert all("ticker" in s and "name" in s for s in arr)

    def test_quote_requires_auth(self):
        r = requests.get(f"{API}/stocks/AAPL/quote", timeout=SHORT)
        assert r.status_code in (401, 403)

    def test_quote_aapl(self, session, auth):
        r = session.get(f"{API}/stocks/AAPL/quote", timeout=MED)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["ticker"] == "AAPL"
        assert q.get("price") is not None
        assert "change" in q and "change_pct" in q

    def test_history(self, session, auth):
        r = session.get(
            f"{API}/stocks/AAPL/history",
            params={"period": "1mo", "interval": "1d"},
            timeout=MED,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["ticker"] == "AAPL"
        assert isinstance(j["points"], list) and len(j["points"]) >= 5
        p0 = j["points"][0]
        assert "date" in p0 and "close" in p0


# ---------- Watchlist ----------
class TestWatchlist:
    def test_add_aapl(self, session, auth):
        r = session.post(f"{API}/watchlist", json={"ticker": "AAPL", "category": "tech"}, timeout=MED)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ticker"] == "AAPL"

    def test_list_watchlist(self, session, auth):
        r = session.get(f"{API}/watchlist", timeout=SHORT)
        assert r.status_code == 200
        arr = r.json()
        assert any(i["ticker"] == "AAPL" for i in arr)

    def test_add_duplicate_returns_400(self, session, auth):
        r = session.post(f"{API}/watchlist", json={"ticker": "AAPL", "category": "tech"}, timeout=MED)
        assert r.status_code == 400

    def test_add_invalid_ticker_returns_404(self, session, auth):
        r = session.post(f"{API}/watchlist", json={"ticker": "ZZZZZZ", "category": "other"}, timeout=MED)
        assert r.status_code == 404

    def test_fill_to_max_then_exceed(self, session, auth):
        # Already have AAPL (1). Add 4 more to hit limit of 5.
        for tk in ["MSFT", "GOOGL", "TSLA", "NVDA"]:
            r = session.post(f"{API}/watchlist", json={"ticker": tk, "category": "tech"}, timeout=MED)
            assert r.status_code == 200, f"add {tk} failed: {r.status_code} {r.text}"
        # 6th should be rejected
        r = session.post(f"{API}/watchlist", json={"ticker": "AMZN", "category": "tech"}, timeout=MED)
        assert r.status_code == 400
        assert "limit" in r.json().get("detail", "").lower()

    def test_live_watchlist(self, session, auth):
        r = session.get(f"{API}/watchlist/live", timeout=MED)
        assert r.status_code == 200
        arr = r.json()
        assert len(arr) == 5
        for item in arr:
            assert "quote" in item
            assert item["quote"].get("price") is not None or item["quote"].get("ticker")
            # latest_analysis should be None initially for at least some
        # initial: most items should have None latest_analysis
        nones = [i for i in arr if i.get("latest_analysis") is None]
        assert len(nones) >= 1

    def test_delete_watchlist(self, session, auth):
        r = session.delete(f"{API}/watchlist/NVDA", timeout=SHORT)
        assert r.status_code == 200
        # 404 when deleting again
        r = session.delete(f"{API}/watchlist/NVDA", timeout=SHORT)
        assert r.status_code == 404


# ---------- Analysis (AI) ----------
class TestAnalysis:
    @pytest.fixture(scope="class")
    def analysis_doc(self, session, auth):
        r = session.post(f"{API}/analysis/AAPL", timeout=LONG)
        assert r.status_code == 200, f"analysis failed: {r.status_code} {r.text[:500]}"
        return r.json()

    def test_analysis_shape(self, analysis_doc):
        d = analysis_doc
        assert d["ticker"] == "AAPL"
        assert d["recommendation"] in ("BUY", "SELL", "HOLD")
        assert isinstance(d["confidence_score"], int)
        assert 0 <= d["confidence_score"] <= 100
        assert isinstance(d["price_target"], (int, float))
        assert isinstance(d["stop_loss"], (int, float))
        assert isinstance(d["reasoning"], str) and len(d["reasoning"]) > 50
        assert isinstance(d["risk_factors"], list) and len(d["risk_factors"]) >= 3
        assert "technicals" in d and "fundamentals" in d
        assert "id" in d and "created_at" in d

    def test_latest(self, session, auth, analysis_doc):
        r = session.get(f"{API}/analysis/AAPL/latest", timeout=SHORT)
        assert r.status_code == 200
        j = r.json()
        assert j["ticker"] == "AAPL"
        assert j["recommendation"] in ("BUY", "SELL", "HOLD")

    def test_history(self, session, auth, analysis_doc):
        r = session.get(f"{API}/analysis/AAPL/history", timeout=SHORT)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        assert arr[0]["ticker"] == "AAPL"

    def test_quick_top(self, session, auth, analysis_doc):
        # Reduce work: trim watchlist to 2 to speed up AI calls
        # (analysis_doc ensures at least 1 watchlist item was present earlier)
        # Ensure watchlist has items
        wl = session.get(f"{API}/watchlist", timeout=SHORT).json()
        assert len(wl) >= 1
        # Delete all but 2 for speed
        keep = {"AAPL", "MSFT"}
        for item in wl:
            if item["ticker"] not in keep:
                session.delete(f"{API}/watchlist/{item['ticker']}", timeout=SHORT)
        r = session.post(f"{API}/analysis/quick/top", timeout=LONG * 2)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["kind"] == "top"
        assert isinstance(j["analyzed"], list) and len(j["analyzed"]) >= 1
        assert isinstance(j["results"], list) and len(j["results"]) >= 1

    def test_quick_bottom_empty_watchlist(self, session, auth):
        # Clear watchlist
        wl = session.get(f"{API}/watchlist", timeout=SHORT).json()
        for item in wl:
            session.delete(f"{API}/watchlist/{item['ticker']}", timeout=SHORT)
        r = session.post(f"{API}/analysis/quick/bottom", timeout=SHORT)
        assert r.status_code == 400


# ---------- Alerts ----------
class TestAlerts:
    def test_list_alerts(self, session, auth):
        r = session.get(f"{API}/alerts", timeout=SHORT)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_read_all(self, session, auth):
        r = session.post(f"{API}/alerts/read_all", timeout=SHORT)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_read_nonexistent_alert(self, session, auth):
        r = session.post(f"{API}/alerts/nonexistent-id/read", timeout=SHORT)
        assert r.status_code == 404


# ---------- Auth enforcement ----------
class TestAuthEnforcement:
    @pytest.mark.parametrize(
        "method,path",
        [
            ("GET", "/auth/me"),
            ("GET", "/stocks/AAPL/quote"),
            ("GET", "/stocks/AAPL/history"),
            ("GET", "/watchlist"),
            ("POST", "/watchlist"),
            ("GET", "/watchlist/live"),
            ("POST", "/analysis/AAPL"),
            ("GET", "/analysis/AAPL/latest"),
            ("GET", "/analysis/AAPL/history"),
            ("POST", "/analysis/quick/top"),
            ("GET", "/alerts"),
            ("POST", "/alerts/read_all"),
        ],
    )
    def test_requires_auth(self, method, path):
        r = requests.request(method, f"{API}{path}", timeout=SHORT)
        assert r.status_code in (401, 403), f"{method} {path} returned {r.status_code}"
