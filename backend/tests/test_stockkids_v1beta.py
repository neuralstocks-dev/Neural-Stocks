"""StockKids V1-β tests — COPPA parental consent + Trade Journal bonus.

Covers:
  * Signup tiers: <8 reject, 8-12 awaiting consent, 13+ instant active
  * Login gate on awaiting kid (403)
  * Parental consent GET/POST/resend (idempotent + supersede flow)
  * Trade journal upsert: bonus, idempotency, validation, daily cap, isolation

Reads consent tokens directly from Mongo (we don't rely on email delivery).
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import date, datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load /app/frontend/.env for REACT_APP_BACKEND_URL when not exported.
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- helpers ----------------------------------------------------------

def _birthdate_for_age(age: int) -> str:
    today = datetime.now(timezone.utc).date()
    # Use Jan 2 to avoid leap-year edge; ensure we are past the birthday
    return date(today.year - age, 1, 2).isoformat()


def _unique_email(prefix: str = "TEST_v1b") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@kids.io"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


def _fetch_token(mongo, kid_email: str) -> str:
    doc = mongo.kids_consents.find_one(
        {"kid_email": kid_email.lower(), "consented_at": None, "superseded_at": None},
        sort=[("sent_at", -1)],
    )
    return doc["consent_token"] if doc else None


# ---------- SIGNUP TIERS -----------------------------------------------------

class TestSignupTiers:
    def test_under13_with_parent_returns_awaiting(self, s):
        email = _unique_email("TEST_under13")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Kid11", "birthdate": _birthdate_for_age(11),
            "parent_email": f"parent_{uuid.uuid4().hex[:6]}@example.com",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "awaiting_parental_consent"
        assert data["parent_email"]
        assert "token" not in data
        assert data["student"]["stock_coins_balance"] == 0
        assert data["student"]["status"] == "awaiting_parental_consent"

    def test_under13_without_parent_email_400(self, s):
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": _unique_email("TEST_under13_np"),
            "password": "securepass123", "full_name": "TEST Kid",
            "birthdate": _birthdate_for_age(11),
        })
        assert r.status_code == 400
        assert "parent" in r.text.lower()

    def test_under8_rejected(self, s):
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": _unique_email("TEST_age7"),
            "password": "securepass123", "full_name": "TEST Tiny",
            "birthdate": _birthdate_for_age(7),
            "parent_email": "p@example.com",
        })
        assert r.status_code == 400
        assert "8" in r.text

    def test_age13_instant_active(self, s):
        email = _unique_email("TEST_age13")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Teen", "birthdate": _birthdate_for_age(13),
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "active"
        assert data.get("token")
        assert data["student"]["stock_coins_balance"] == 10000

    def test_age18_instant_active(self, s):
        email = _unique_email("TEST_age18")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Adult-ish", "birthdate": _birthdate_for_age(18),
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "active"
        assert data.get("token")
        assert data["student"]["stock_coins_balance"] == 10000


# ---------- LOGIN GATE -------------------------------------------------------

class TestLoginGate:
    @pytest.fixture(scope="class")
    def awaiting_kid(self, s):
        email = _unique_email("TEST_awaiting")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Awaiting", "birthdate": _birthdate_for_age(10),
            "parent_email": "parent@example.com",
        })
        assert r.status_code == 200
        return email

    def test_login_awaiting_returns_403(self, s, awaiting_kid):
        r = s.post(f"{API}/kids/auth/login", json={
            "email": awaiting_kid, "password": "securepass123",
        })
        assert r.status_code == 403
        assert "parent" in r.text.lower()

    def test_login_wrong_pw_on_awaiting_returns_401(self, s, awaiting_kid):
        r = s.post(f"{API}/kids/auth/login", json={
            "email": awaiting_kid, "password": "WRONG_pw_123",
        })
        assert r.status_code == 401


# ---------- PARENTAL CONSENT -------------------------------------------------

class TestParentalConsent:
    def test_full_consent_flow(self, s, mongo):
        email = _unique_email("TEST_consent")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Consent Kid", "birthdate": _birthdate_for_age(10),
            "parent_email": "parent_consent@example.com",
        })
        assert r.status_code == 200
        token = _fetch_token(mongo, email)
        assert token, "No consent token in DB"

        # GET preview
        rg = s.get(f"{API}/kids/auth/parental-consent/{token}")
        assert rg.status_code == 200, rg.text
        prev = rg.json()
        assert prev["already_consented"] is False
        assert prev["kid_email"] == email.lower()
        assert prev["kid_age_at_signup"] == 10
        assert prev["parent_email"] == "parent_consent@example.com"
        assert "expires_at" in prev

        # GET invalid token
        rb = s.get(f"{API}/kids/auth/parental-consent/INVALID_TOKEN_XYZ")
        assert rb.status_code == 404

        # POST agree:false → 400
        r400 = s.post(f"{API}/kids/auth/parental-consent/{token}",
                      json={"parent_full_name": "Mom Smith", "agree": False})
        assert r400.status_code == 400

        # POST happy
        rp = s.post(f"{API}/kids/auth/parental-consent/{token}",
                    json={"parent_full_name": "Mom Smith", "agree": True})
        assert rp.status_code == 200, rp.text
        body = rp.json()
        assert body["ok"] is True
        assert body["already_consented"] is False

        # DB check
        cdoc = mongo.kids_consents.find_one({"consent_token": token})
        assert cdoc["parent_full_name"] == "Mom Smith"
        assert cdoc["parent_user_agent"]
        assert cdoc["consented_at"]

        kid = mongo.kids_users.find_one({"email": email.lower()})
        assert kid["status"] == "active"
        assert kid["stock_coins_balance"] == 10000

        # Idempotent re-submit
        rp2 = s.post(f"{API}/kids/auth/parental-consent/{token}",
                     json={"parent_full_name": "Mom Smith", "agree": True})
        assert rp2.status_code == 200
        assert rp2.json()["already_consented"] is True

        # Login now succeeds
        rl = s.post(f"{API}/kids/auth/login",
                    json={"email": email, "password": "securepass123"})
        assert rl.status_code == 200
        assert rl.json()["token"]
        assert rl.json()["student"]["stock_coins_balance"] == 10000

    def test_resend_supersedes_old_token(self, s, mongo):
        email = _unique_email("TEST_resend")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Resend Kid", "birthdate": _birthdate_for_age(9),
            "parent_email": "parent_resend@example.com",
        })
        assert r.status_code == 200
        old_token = _fetch_token(mongo, email)
        assert old_token

        rr = s.post(f"{API}/kids/auth/resend-consent", json={"email": email})
        assert rr.status_code == 200
        assert rr.json() == {"ok": True, "sent": True}

        # Old token should now be 410 (superseded)
        rg = s.get(f"{API}/kids/auth/parental-consent/{old_token}")
        assert rg.status_code == 410

        # Fresh token works
        new_token = _fetch_token(mongo, email)
        assert new_token and new_token != old_token
        rg2 = s.get(f"{API}/kids/auth/parental-consent/{new_token}")
        assert rg2.status_code == 200

    def test_resend_on_active_kid_no_leak(self, s, mongo):
        email = _unique_email("TEST_active_resend")
        r = s.post(f"{API}/kids/auth/signup", json={
            "email": email, "password": "securepass123",
            "full_name": "TEST Active", "birthdate": _birthdate_for_age(15),
        })
        assert r.status_code == 200
        rr = s.post(f"{API}/kids/auth/resend-consent", json={"email": email})
        assert rr.status_code == 200
        assert rr.json() == {"ok": True, "sent": False}

    def test_resend_on_nonexistent_no_leak(self, s):
        rr = s.post(f"{API}/kids/auth/resend-consent",
                    json={"email": f"nope_{uuid.uuid4().hex}@nowhere.io"})
        assert rr.status_code == 200
        assert rr.json() == {"ok": True, "sent": False}


# ---------- TRADE JOURNAL ----------------------------------------------------

@pytest.fixture(scope="module")
def kid_token_and_trades(s):
    """Sign up an active 14-year-old, do BUY trades, return (token, trade_ids)."""
    email = _unique_email("TEST_journal")
    r = s.post(f"{API}/kids/auth/signup", json={
        "email": email, "password": "securepass123",
        "full_name": "TEST Journal Kid", "birthdate": _birthdate_for_age(14),
    })
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    trade_ids = []
    for ticker in ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "AMD", "NFLX", "DIS"]:
        rb = s.post(f"{API}/kids/trades", json={
            "ticker": ticker, "side": "BUY", "qty": 1,
        }, headers=headers)
        if rb.status_code == 200:
            tj = rb.json()
            tid = tj.get("trade_id") or tj.get("id")
            if tid:
                trade_ids.append(tid)
        if len(trade_ids) >= 7:
            break
    return {"token": token, "headers": headers, "trade_ids": trade_ids, "email": email}


class TestJournal:
    def test_first_journal_awards_bonus(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        assert len(ctx["trade_ids"]) >= 1, "Need at least 1 trade for journal tests"
        trade_id = ctx["trade_ids"][0]
        # Get balance before
        rme = s.get(f"{API}/kids/auth/me", headers=ctx["headers"])
        bal_before = rme.json()["stock_coins_balance"]

        rj = s.post(f"{API}/kids/trades/{trade_id}/journal", json={
            "why": "Strong momentum and earnings beat",
            "signal": "Breakout above 200dma",
            "exit_plan": "Stop at -10%, target +20%",
        }, headers=ctx["headers"])
        assert rj.status_code == 200, rj.text
        body = rj.json()
        assert body["bonus_awarded_sc"] == 50
        assert body["already_journaled"] is False
        assert body["new_balance"] == bal_before + 50

        rme2 = s.get(f"{API}/kids/auth/me", headers=ctx["headers"])
        assert rme2.json()["stock_coins_balance"] == bal_before + 50

    def test_journal_idempotent(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        trade_id = ctx["trade_ids"][0]
        rme = s.get(f"{API}/kids/auth/me", headers=ctx["headers"])
        bal_before = rme.json()["stock_coins_balance"]

        rj = s.post(f"{API}/kids/trades/{trade_id}/journal", json={
            "why": "Updated reason",
            "signal": "Updated signal",
            "exit_plan": "Updated exit",
        }, headers=ctx["headers"])
        assert rj.status_code == 200
        body = rj.json()
        assert body["already_journaled"] is True
        assert body["bonus_awarded_sc"] == 0

        rme2 = s.get(f"{API}/kids/auth/me", headers=ctx["headers"])
        assert rme2.json()["stock_coins_balance"] == bal_before

        # Verify prompts updated
        rg = s.get(f"{API}/kids/trades/{trade_id}/journal", headers=ctx["headers"])
        assert rg.status_code == 200
        assert rg.json()["prompts"]["why"] == "Updated reason"

    def test_empty_why_422(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        if len(ctx["trade_ids"]) < 2:
            pytest.skip("Need >=2 trades")
        trade_id = ctx["trade_ids"][1]
        rj = s.post(f"{API}/kids/trades/{trade_id}/journal", json={
            "why": "", "signal": "x", "exit_plan": "y",
        }, headers=ctx["headers"])
        assert rj.status_code == 422

    def test_journal_unknown_trade_404(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        rj = s.post(f"{API}/kids/trades/UNKNOWN_TRADE_123/journal", json={
            "why": "x", "signal": "x", "exit_plan": "x",
        }, headers=ctx["headers"])
        assert rj.status_code == 404

    def test_get_journal_unknown_404(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        rg = s.get(f"{API}/kids/trades/UNKNOWN/journal", headers=ctx["headers"])
        assert rg.status_code == 404

    def test_list_journals_filtered(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        rl = s.get(f"{API}/kids/journals?ticker=AAPL", headers=ctx["headers"])
        assert rl.status_code == 200
        items = rl.json()["journals"]
        for it in items:
            assert it["ticker"] == "AAPL"

    def test_daily_cap(self, s, kid_token_and_trades):
        """Trade #1 is already journaled. Journal trades 2-5 → bonus.
        Trade 6 → save, no bonus."""
        ctx = kid_token_and_trades
        if len(ctx["trade_ids"]) < 6:
            pytest.skip(f"Need 6 trades, have {len(ctx['trade_ids'])}")

        # Already journaled: trade_ids[0]. Bonus count = 1.
        # Journal trades 1..4 (4 more) → bonus count goes 1→5.
        for i in range(1, 5):
            rj = s.post(f"{API}/kids/trades/{ctx['trade_ids'][i]}/journal", json={
                "why": f"reason {i}", "signal": f"sig {i}", "exit_plan": f"exit {i}",
            }, headers=ctx["headers"])
            assert rj.status_code == 200
            assert rj.json()["bonus_awarded_sc"] == 50, f"trade {i} expected bonus"

        # 6th journal: bonus=0, daily_cap_hit
        rj6 = s.post(f"{API}/kids/trades/{ctx['trade_ids'][5]}/journal", json={
            "why": "6th", "signal": "6th", "exit_plan": "6th",
        }, headers=ctx["headers"])
        assert rj6.status_code == 200
        b = rj6.json()
        assert b["bonus_awarded_sc"] == 0
        assert b["daily_cap_hit"] is True
        assert b["already_journaled"] is False

    def test_jwt_isolation_adult_token_rejected(self, s, kid_token_and_trades):
        ctx = kid_token_and_trades
        # Get adult token
        ra = s.post(f"{API}/auth/login", json={
            "email": "jolor69@gmail.com", "password": "admin1234",
        })
        if ra.status_code != 200:
            pytest.skip("Adult login failed")
        adult_token = ra.json().get("token") or ra.json().get("access_token")
        if not adult_token:
            pytest.skip("No adult token returned")
        if not ctx["trade_ids"]:
            pytest.skip("No trades")
        rj = s.post(f"{API}/kids/trades/{ctx['trade_ids'][0]}/journal",
                    json={"why": "x", "signal": "x", "exit_plan": "x"},
                    headers={"Authorization": f"Bearer {adult_token}",
                             "Content-Type": "application/json"})
        assert rj.status_code == 401
