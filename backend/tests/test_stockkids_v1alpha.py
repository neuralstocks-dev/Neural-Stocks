"""KidStocks V1-alpha end-to-end backend tests.

Covers: signup (happy + age floor + dup + bad date), login, /me, JWT isolation
(adult vs kid), tradable list, portfolio, BUY/SELL trades (incl. error paths),
trade history, watchlist add/remove (idempotent), and authenticated kid
analyze endpoint (real GAL LLM round-trip).
"""
import os
import time
import uuid
from datetime import date

import pytest
import requests
from dotenv import dotenv_values

# Load REACT_APP_BACKEND_URL from frontend .env so tests work in CI/local.
_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or _env.get("REACT_APP_BACKEND_URL")
    or ""
).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is not set"

# Existing kid + adult creds from /app/memory/test_credentials.md
KID_EMAIL = "alex@kids.io"
KID_PASS = "securepass123"
ADULT_EMAIL = "tiers@demo.io"
ADULT_PASS = "pass1234"
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"


# ---------- shared helpers ----------
def _signup_payload(age_offset_years: int = -14, **overrides):
    """Build a unique signup payload. age_offset_years: e.g. -14 = 14yo."""
    today = date.today()
    bd = today.replace(year=today.year + age_offset_years)
    payload = {
        "email": f"TEST_kid_{uuid.uuid4().hex[:8]}@kids.io",
        "password": "supersecret123",
        "full_name": "Test Kid",
        "birthdate": bd.isoformat(),
    }
    payload.update(overrides)
    return payload


@pytest.fixture(scope="session")
def adult_token():
    """Adult JWT for cross-isolation tests."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADULT_EMAIL, "password": ADULT_PASS},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Adult login failed {r.status_code}: {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def kid_token():
    """Reusable kid token — login or signup if missing."""
    r = requests.post(
        f"{BASE_URL}/api/kids/auth/login",
        json={"email": KID_EMAIL, "password": KID_PASS},
        timeout=15,
    )
    if r.status_code == 200:
        return r.json()["token"]
    # Recreate the canonical kid account
    r = requests.post(
        f"{BASE_URL}/api/kids/auth/signup",
        json={
            "email": KID_EMAIL,
            "password": KID_PASS,
            "full_name": "Alex Kid",
            "birthdate": "2011-06-15",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def kid_headers(tok):
    return {"Authorization": f"Bearer {tok}"}


# ===================== SIGNUP =====================
class TestKidsSignup:
    def test_signup_happy(self):
        body = _signup_payload(age_offset_years=-14)
        r = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        st = data["student"]
        assert st["email"] == body["email"].lower()
        assert st["age_band"] == "14-18"
        assert st["stock_coins_balance"] == 10000

    def test_signup_age_floor_under_13(self):
        body = _signup_payload(age_offset_years=-10)  # 10yo
        r = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r.status_code == 400
        assert "13" in r.text or "age" in r.text.lower() or "younger" in r.text.lower()

    def test_signup_duplicate_email(self):
        body = _signup_payload(age_offset_years=-15)
        r1 = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r2.status_code == 409

    def test_signup_bad_birthdate(self):
        body = _signup_payload()
        body["birthdate"] = "06/15/2011"
        r = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r.status_code in (400, 422)


# ===================== LOGIN + /me =====================
class TestKidsLoginMe:
    def test_login_wrong_password(self):
        r = requests.post(
            f"{BASE_URL}/api/kids/auth/login",
            json={"email": KID_EMAIL, "password": "WRONG_PASSWORD"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_login_success(self, kid_token):
        assert kid_token and len(kid_token) > 20

    def test_me(self, kid_token):
        r = requests.get(
            f"{BASE_URL}/api/kids/auth/me", headers=kid_headers(kid_token), timeout=15
        )
        assert r.status_code == 200
        st = r.json()
        assert st["email"] == KID_EMAIL
        assert st["age_band"] in ("11-13", "14-18", "8-10")


# ===================== JWT ISOLATION =====================
class TestJwtIsolation:
    def test_adult_token_rejected_on_kids_route(self, adult_token):
        r = requests.get(
            f"{BASE_URL}/api/kids/auth/me",
            headers={"Authorization": f"Bearer {adult_token}"},
            timeout=15,
        )
        assert r.status_code == 401, f"adult token must NOT access kids route, got {r.status_code}"

    def test_kid_token_rejected_on_adult_route(self, kid_token):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=kid_headers(kid_token),
            timeout=15,
        )
        assert r.status_code == 401, f"kid token must NOT access adult route, got {r.status_code}"

    def test_kids_route_no_token(self):
        r = requests.get(f"{BASE_URL}/api/kids/auth/me", timeout=15)
        assert r.status_code in (401, 403)


# ===================== TRADABLE + PORTFOLIO =====================
class TestKidsTradable:
    def test_tradable_list(self, kid_token):
        r = requests.get(
            f"{BASE_URL}/api/kids/tradable", headers=kid_headers(kid_token), timeout=20
        )
        assert r.status_code == 200
        body = r.json()
        assert "tickers" in body
        assert isinstance(body["tickers"], list)
        # Each entry must have ticker+price
        for it in body["tickers"]:
            assert it["ticker"]
            assert "price" in it

    def test_portfolio_returns_balance(self, kid_token):
        r = requests.get(
            f"{BASE_URL}/api/kids/portfolio", headers=kid_headers(kid_token), timeout=15
        )
        assert r.status_code == 200
        body = r.json()
        assert "stock_coins_balance" in body
        assert isinstance(body["positions"], list)


# ===================== TRADES =====================
class TestKidsTrades:
    """Use a fresh signup so we have a clean balance/positions slate."""

    @pytest.fixture(scope="class")
    def fresh_kid(self):
        body = _signup_payload(age_offset_years=-15)
        r = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()["token"]

    def test_buy_invalid_ticker(self, fresh_kid):
        r = requests.post(
            f"{BASE_URL}/api/kids/trades",
            headers=kid_headers(fresh_kid),
            json={"ticker": "FAKEXYZ", "qty": 1, "side": "BUY"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_sell_with_no_holdings(self, fresh_kid):
        r = requests.post(
            f"{BASE_URL}/api/kids/trades",
            headers=kid_headers(fresh_kid),
            json={"ticker": "AAPL", "qty": 1, "side": "SELL"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_buy_insufficient_sc(self, fresh_kid):
        # qty=10000 of AAPL would cost ~$1.7M >> 10k SC
        r = requests.post(
            f"{BASE_URL}/api/kids/trades",
            headers=kid_headers(fresh_kid),
            json={"ticker": "AAPL", "qty": 10000, "side": "BUY"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "StockCoins" in r.text or "balance" in r.text.lower() or "need" in r.text.lower()

    def test_buy_then_portfolio_then_sell(self, fresh_kid):
        # BUY 1 AAPL
        r = requests.post(
            f"{BASE_URL}/api/kids/trades",
            headers=kid_headers(fresh_kid),
            json={"ticker": "AAPL", "qty": 1, "side": "BUY"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        buy = r.json()
        assert buy["ticker"] == "AAPL"
        assert buy["side"] == "BUY"
        assert buy["new_balance"] < 10000  # SC deducted
        old_balance = buy["new_balance"]

        # Portfolio shows 1 AAPL position
        r2 = requests.get(
            f"{BASE_URL}/api/kids/portfolio", headers=kid_headers(fresh_kid), timeout=15
        )
        assert r2.status_code == 200
        port = r2.json()
        positions = port["positions"]
        aapl = next((p for p in positions if p["ticker"] == "AAPL"), None)
        assert aapl is not None
        assert aapl["qty"] == 1
        assert aapl["avg_cost"] > 0
        assert "market_value" in aapl
        assert "pnl" in aapl

        # Trade history shows the BUY
        rh = requests.get(
            f"{BASE_URL}/api/kids/trades", headers=kid_headers(fresh_kid), timeout=15
        )
        assert rh.status_code == 200
        trades = rh.json()["trades"]
        assert len(trades) >= 1
        assert trades[0]["side"] == "BUY"  # most recent first

        # SELL 1 AAPL → balance restored (approximately)
        rs = requests.post(
            f"{BASE_URL}/api/kids/trades",
            headers=kid_headers(fresh_kid),
            json={"ticker": "AAPL", "qty": 1, "side": "SELL"},
            timeout=20,
        )
        assert rs.status_code == 200, rs.text
        sell = rs.json()
        assert sell["side"] == "SELL"
        assert sell["new_balance"] > old_balance


# ===================== WATCHLIST =====================
class TestKidsWatchlist:
    @pytest.fixture(scope="class")
    def w_kid(self):
        body = _signup_payload(age_offset_years=-16)
        r = requests.post(f"{BASE_URL}/api/kids/auth/signup", json=body, timeout=15)
        assert r.status_code == 200
        return r.json()["token"]

    def test_add_idempotent_then_get_then_delete(self, w_kid):
        # Add
        r1 = requests.post(
            f"{BASE_URL}/api/kids/watchlist/AAPL",
            headers=kid_headers(w_kid), timeout=15,
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["ok"] is True
        # Idempotent re-add
        r2 = requests.post(
            f"{BASE_URL}/api/kids/watchlist/AAPL",
            headers=kid_headers(w_kid), timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json().get("already") is True

        # GET decorated with price
        rg = requests.get(
            f"{BASE_URL}/api/kids/watchlist", headers=kid_headers(w_kid), timeout=15
        )
        assert rg.status_code == 200
        items = rg.json()["watchlist"]
        assert any(it["ticker"] == "AAPL" for it in items)
        aapl = next(it for it in items if it["ticker"] == "AAPL")
        assert "price" in aapl

        # DELETE
        rd = requests.delete(
            f"{BASE_URL}/api/kids/watchlist/AAPL",
            headers=kid_headers(w_kid), timeout=15,
        )
        assert rd.status_code == 200
        assert rd.json()["removed"] >= 1

        # Verify removed
        rg2 = requests.get(
            f"{BASE_URL}/api/kids/watchlist", headers=kid_headers(w_kid), timeout=15
        )
        assert not any(it["ticker"] == "AAPL" for it in rg2.json()["watchlist"])

    def test_invalid_ticker(self, w_kid):
        r = requests.post(
            f"{BASE_URL}/api/kids/watchlist/FAKEXYZ",
            headers=kid_headers(w_kid), timeout=15,
        )
        assert r.status_code == 400


# ===================== ANALYZE (real LLM, slow) =====================
class TestKidsAnalyze:
    def test_analyze_aapl_returns_kid_view(self, kid_token):
        # GAL pipeline can take 15-25s on first call
        r = requests.get(
            f"{BASE_URL}/api/kids/analyze/AAPL",
            headers=kid_headers(kid_token),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ticker"] == "AAPL"
        assert body.get("age_band")
        kv = body.get("kid_view") or {}
        assert kv.get("kid_headline")
        assert kv.get("kid_explanation")
        # did_you_know + reflection_question per spec
        assert "did_you_know" in kv
        assert "reflection_question" in kv

    def test_analyze_invalid_ticker(self, kid_token):
        r = requests.get(
            f"{BASE_URL}/api/kids/analyze/FAKEXYZ",
            headers=kid_headers(kid_token), timeout=15,
        )
        assert r.status_code == 400
