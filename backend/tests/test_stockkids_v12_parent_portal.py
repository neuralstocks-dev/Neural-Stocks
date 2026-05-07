"""KidStocks V1.2 — Parent Portal + Telegram nightly digest.

Covers:
  * POST /api/kids/parent/request-link — leak prevention + active-kid only
  * GET  /api/kids/parent/dashboard — auth, expiry, kid card shape, week filter
  * POST /api/kids/parent/telegram/start — link code mint + upsert
  * POST /api/kids/parent/telegram/disconnect
  * routers/kids_parent.link_parent_chat — bind / unknown / expired
  * services.kids_parent_digest._digest_for_parent — silent / EN / ID copy
  * services.kids_parent_digest.run_once — idempotent (last_digest_day)
  * services.telegram.poll_and_link routes parentNNNNNN to parent linker
"""
from __future__ import annotations

import asyncio
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

# Motor (used by backend code under test) caches the asyncio loop it was
# first awakened on. _arun() creates and closes a new loop per call,
# which leaves motor holding a closed loop reference → "Event loop is closed"
# on subsequent runs. We allocate one persistent loop and reuse it for all
# direct async-coroutine calls in this module.
_LOOP = asyncio.new_event_loop()


def _arun(coro):
    return _LOOP.run_until_complete(coro)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Fixtures: throwaway parents/kids to keep tests isolated
# ---------------------------------------------------------------------------

@pytest.fixture
def active_parent_kid():
    """Create one ACTIVE kid (en) bound to a fresh parent_email. Cleanup after."""
    suffix = uuid.uuid4().hex[:8]
    parent = f"test_v12_parent_{suffix}@kids.io"
    kid_email = f"test_v12_kid_{suffix}@kids.io"
    kid_id = str(uuid.uuid4())
    _db.kids_users.insert_one({
        "id": kid_id,
        "email": kid_email,
        "full_name": "Mini V12",
        "age_band": "11-13",
        "parent_email": parent,
        "status": "active",
        "stock_coins_balance": 8766,
        "starting_stock_coins": 10000,
        "lang": "en",
        "created_at": _iso(datetime.now(timezone.utc)),
    })
    yield {"parent": parent, "kid_id": kid_id, "kid_email": kid_email}
    _db.kids_users.delete_many({"email": kid_email})
    _db.kids_parent_sessions.delete_many({"parent_email": parent})
    _db.kids_parent_telegram.delete_many({"parent_email": parent})
    _db.kids_parent_telegram_codes.delete_many({"parent_email": parent})
    _db.kids_trades.delete_many({"student_id": kid_id})
    _db.kids_journals.delete_many({"student_id": kid_id})
    _db.kids_positions.delete_many({"student_id": kid_id})


@pytest.fixture
def awaiting_parent_kid():
    suffix = uuid.uuid4().hex[:8]
    parent = f"test_v12_pwait_{suffix}@kids.io"
    kid_email = f"test_v12_kwait_{suffix}@kids.io"
    kid_id = str(uuid.uuid4())
    _db.kids_users.insert_one({
        "id": kid_id,
        "email": kid_email,
        "full_name": "Wait Kid",
        "age_band": "11-13",
        "parent_email": parent,
        "status": "awaiting_parental_consent",
        "stock_coins_balance": 0,
        "lang": "en",
        "created_at": _iso(datetime.now(timezone.utc)),
    })
    yield {"parent": parent, "kid_id": kid_id, "kid_email": kid_email}
    _db.kids_users.delete_many({"email": kid_email})
    _db.kids_parent_sessions.delete_many({"parent_email": parent})


def _mint_session_via_api(parent_email: str) -> str:
    """Force-mint by calling request-link, then read the token from Mongo."""
    r = requests.post(
        f"{BASE_URL}/api/kids/parent/request-link",
        json={"email": parent_email, "lang": "en"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] is True, body
    doc = _db.kids_parent_sessions.find_one(
        {"parent_email": parent_email.lower().strip()},
        sort=[("created_at", -1)],
    )
    assert doc, "no session minted"
    return doc["token"]


# ---------------------------------------------------------------------------
# Magic-link request
# ---------------------------------------------------------------------------

class TestRequestLink:
    def test_unknown_email_returns_sent_false(self):
        r = requests.post(
            f"{BASE_URL}/api/kids/parent/request-link",
            json={"email": f"nobody_{uuid.uuid4().hex[:6]}@kids.io"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"ok": True, "sent": False}

    def test_active_kid_parent_returns_sent_true_and_mints_session(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        before = datetime.now(timezone.utc)
        r = requests.post(
            f"{BASE_URL}/api/kids/parent/request-link",
            json={"email": parent, "lang": "en"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["sent"] is True
        # Session row in mongo
        doc = _db.kids_parent_sessions.find_one(
            {"parent_email": parent.lower().strip()},
            sort=[("created_at", -1)],
        )
        assert doc, "no session row"
        assert doc.get("token") and len(doc["token"]) >= 16
        exp = datetime.fromisoformat(doc["expires_at"])
        delta = exp - before
        assert timedelta(hours=23, minutes=30) <= delta <= timedelta(hours=24, minutes=30)

    def test_awaiting_consent_parent_returns_sent_false(self, awaiting_parent_kid):
        parent = awaiting_parent_kid["parent"]
        r = requests.post(
            f"{BASE_URL}/api/kids/parent/request-link",
            json={"email": parent},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True, "sent": False}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class TestDashboard:
    def test_dashboard_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/kids/parent/dashboard", timeout=15)
        assert r.status_code == 401
        assert "Missing parent session token" in r.json().get("detail", "")

    def test_dashboard_bogus_token_401(self):
        r = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": "BOGUSDOESNOTEXIST"},
            timeout=15,
        )
        assert r.status_code == 401
        assert "Invalid or expired" in r.json().get("detail", "")

    def test_dashboard_valid_token_returns_kids_and_stamps_last_used(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        token = _mint_session_via_api(parent)
        r = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["parent_email"] == parent.lower().strip()
        assert isinstance(body["kids"], list)
        assert len(body["kids"]) == 1
        kid = body["kids"][0]
        assert kid["full_name"] == "Mini V12"
        assert kid["age_band"] == "11-13"
        assert kid["stock_coins_balance"] == 8766
        # default unlinked
        assert body["telegram"]["linked"] is False
        # last_used_at stamped on the session
        doc = _db.kids_parent_sessions.find_one({"token": token})
        assert doc.get("last_used_at"), "last_used_at not stamped"

    def test_dashboard_expired_session_401(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        token = _mint_session_via_api(parent)
        # Force expiry into the past
        _db.kids_parent_sessions.update_one(
            {"token": token},
            {"$set": {"expires_at": _iso(datetime.now(timezone.utc) - timedelta(hours=1))}},
        )
        r = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token},
            timeout=15,
        )
        assert r.status_code == 401
        assert "expired" in r.json().get("detail", "").lower()

    def test_dashboard_excludes_awaiting_consent_kids(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        # Add an awaiting kid under the SAME parent — should be hidden
        kid_id_w = str(uuid.uuid4())
        _db.kids_users.insert_one({
            "id": kid_id_w,
            "email": f"TEST_v12_hidden_{uuid.uuid4().hex[:6]}@kids.io",
            "full_name": "Hidden Kid",
            "age_band": "11-13",
            "parent_email": parent,
            "status": "awaiting_parental_consent",
            "stock_coins_balance": 0,
            "lang": "en",
            "created_at": _iso(datetime.now(timezone.utc)),
        })
        try:
            token = _mint_session_via_api(parent)
            r = requests.get(
                f"{BASE_URL}/api/kids/parent/dashboard",
                params={"token": token},
                timeout=15,
            )
            assert r.status_code == 200
            names = {k["full_name"] for k in r.json()["kids"]}
            assert "Hidden Kid" not in names
            assert "Mini V12" in names
        finally:
            _db.kids_users.delete_many({"id": kid_id_w})

    def test_kid_card_shape_and_week_filter(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        kid_id = active_parent_kid["kid_id"]
        # Position
        _db.kids_positions.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": kid_id,
            "ticker": "AAPL",
            "qty": 5,
            "avg_cost": 180.0,
        })
        now = datetime.now(timezone.utc)
        # 5 trades within last week
        for i in range(5):
            _db.kids_trades.insert_one({
                "id": str(uuid.uuid4()),
                "student_id": kid_id,
                "ticker": "AAPL",
                "side": "buy",
                "qty": 1,
                "price": 180.0 + i,
                "created_at": _iso(now - timedelta(hours=i)),
            })
        # 1 ancient trade — must be filtered out
        _db.kids_trades.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": kid_id,
            "ticker": "OLD",
            "side": "buy",
            "qty": 1,
            "price": 1.0,
            "created_at": _iso(now - timedelta(days=10)),
        })
        # 4 journals — only 3 most recent should surface
        for i in range(4):
            _db.kids_journals.insert_one({
                "id": str(uuid.uuid4()),
                "student_id": kid_id,
                "trade_id": str(uuid.uuid4()),
                "ticker": "AAPL",
                "side": "buy",
                "prompts": {"why_buy": f"reason {i}", "lesson": f"lesson {i}"},
                "bonus_awarded_sc": 50,
                "created_at": _iso(now - timedelta(hours=i * 2)),
            })

        token = _mint_session_via_api(parent)
        r = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        kid = r.json()["kids"][0]
        # Required keys on kid_card
        for key in ("id", "full_name", "age_band", "stock_coins_balance", "lang",
                    "positions", "trades_this_week", "recent_journals"):
            assert key in kid, f"missing {key}"
        # Position shape
        assert len(kid["positions"]) == 1
        pos = kid["positions"][0]
        assert pos["ticker"] == "AAPL" and pos["qty"] == 5 and pos["avg_cost"] == 180.0
        # 5 trades, sorted desc, no OLD
        trades = kid["trades_this_week"]
        assert len(trades) == 5, f"expected 5 trades, got {len(trades)}"
        tickers = {t["ticker"] for t in trades}
        assert "OLD" not in tickers
        # desc by created_at
        ts = [t["created_at"] for t in trades]
        assert ts == sorted(ts, reverse=True), "trades not desc"
        # trade row shape
        for t in trades:
            for k in ("trade_id", "ticker", "side", "qty", "price", "created_at"):
                assert k in t, f"trade missing {k}"
        # journals capped at 3, prompts dict present
        assert len(kid["recent_journals"]) == 3
        for j in kid["recent_journals"]:
            assert isinstance(j["prompts"], dict)


# ---------------------------------------------------------------------------
# Telegram start / disconnect
# ---------------------------------------------------------------------------

class TestTelegramStart:
    def test_telegram_start_invalid_token_401(self):
        r = requests.post(
            f"{BASE_URL}/api/kids/parent/telegram/start",
            json={"token": "BOGUS"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_telegram_start_returns_code_and_upserts(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        token = _mint_session_via_api(parent)
        r1 = requests.post(
            f"{BASE_URL}/api/kids/parent/telegram/start",
            json={"token": token},
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert "link_code" in b1 and re.fullmatch(r"\d{6}", b1["link_code"]), b1
        assert "expires_in_seconds" in b1
        # Mongo upserted
        docs = list(_db.kids_parent_telegram_codes.find(
            {"parent_email": parent.lower().strip()}
        ))
        assert len(docs) == 1
        assert docs[0]["code"] == b1["link_code"]
        # Re-run upserts (still 1 doc, code may differ)
        r2 = requests.post(
            f"{BASE_URL}/api/kids/parent/telegram/start",
            json={"token": token},
            timeout=15,
        )
        assert r2.status_code == 200
        docs2 = list(_db.kids_parent_telegram_codes.find(
            {"parent_email": parent.lower().strip()}
        ))
        assert len(docs2) == 1, "upsert should keep exactly one pending code per parent"

    def test_telegram_disconnect(self, active_parent_kid):
        parent = active_parent_kid["parent"]
        # Pre-link
        _db.kids_parent_telegram.insert_one({
            "parent_email": parent.lower().strip(),
            "chat_id": "999",
            "username": "tester",
            "linked_at": _iso(datetime.now(timezone.utc)),
        })
        token = _mint_session_via_api(parent)
        # Verify dashboard shows linked=true first
        d = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token}, timeout=15,
        ).json()
        assert d["telegram"]["linked"] is True
        assert d["telegram"]["username"] == "tester"
        # Disconnect
        r = requests.post(
            f"{BASE_URL}/api/kids/parent/telegram/disconnect",
            json={"token": token},
            timeout=15,
        )
        assert r.status_code == 200 and r.json().get("ok") is True
        # Confirm dashboard now reports unlinked
        d2 = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token}, timeout=15,
        ).json()
        assert d2["telegram"]["linked"] is False


# ---------------------------------------------------------------------------
# link_parent_chat helper (direct unit test)
# ---------------------------------------------------------------------------

class TestLinkParentChat:
    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro) if False else _arun(coro)

    def test_unknown_code_returns_none(self):
        from routers.kids_parent import link_parent_chat
        result = _arun(link_parent_chat("000000", 12345, "ghost"))
        assert result is None

    def test_expired_code_returns_none(self, active_parent_kid):
        parent = active_parent_kid["parent"].lower().strip()
        # Use a uuid-derived code to avoid collisions with the unique
        # index on `code` from prior runs.
        code = uuid.uuid4().int.__str__()[:6].zfill(6)
        _db.kids_parent_telegram_codes.delete_many({"code": code})
        _db.kids_parent_telegram_codes.insert_one({
            "parent_email": parent,
            "code": code,
            "created_at": _iso(datetime.now(timezone.utc) - timedelta(hours=1)),
            "expires_at": _iso(datetime.now(timezone.utc) - timedelta(minutes=1)),
        })
        from routers.kids_parent import link_parent_chat
        result = _arun(link_parent_chat(code, 444, "expired"))
        assert result is None

    def test_link_success_binds_chat_and_dashboard_reflects(self, active_parent_kid):
        parent = active_parent_kid["parent"].lower().strip()
        code = uuid.uuid4().int.__str__()[:6].zfill(6)
        _db.kids_parent_telegram_codes.delete_many({"code": code})
        _db.kids_parent_telegram_codes.insert_one({
            "parent_email": parent,
            "code": code,
            "created_at": _iso(datetime.now(timezone.utc)),
            "expires_at": _iso(datetime.now(timezone.utc) + timedelta(minutes=10)),
        })
        from routers.kids_parent import link_parent_chat
        result = _arun(link_parent_chat(code, 5566, "ParentTester"))
        assert result == parent
        link_doc = _db.kids_parent_telegram.find_one({"parent_email": parent})
        assert link_doc, "telegram link doc missing"
        assert link_doc["chat_id"] == "5566"
        assert link_doc["username"] == "parenttester"
        # Code consumed
        assert _db.kids_parent_telegram_codes.find_one({"parent_email": parent}) is None

        # Dashboard reflects linked=true
        token = _mint_session_via_api(active_parent_kid["parent"])
        d = requests.get(
            f"{BASE_URL}/api/kids/parent/dashboard",
            params={"token": token}, timeout=15,
        ).json()
        assert d["telegram"]["linked"] is True
        assert d["telegram"]["username"] == "parenttester"


# ---------------------------------------------------------------------------
# kids_parent_digest._digest_for_parent + run_once
# ---------------------------------------------------------------------------

class TestDigest:
    def test_digest_silent_when_no_activity(self, active_parent_kid):
        from services.kids_parent_digest import _digest_for_parent
        result = _arun(
            _digest_for_parent(active_parent_kid["parent"].lower().strip(), "999", "en")
        )
        assert result is None

    def test_digest_en_includes_kid_name_and_html_and_emoji(self, active_parent_kid):
        # Insert a trade today
        _db.kids_trades.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": active_parent_kid["kid_id"],
            "ticker": "AAPL",
            "side": "buy",
            "qty": 1,
            "price": 100.0,
            "created_at": _iso(datetime.now(timezone.utc)),
        })
        from services.kids_parent_digest import _digest_for_parent
        text = _arun(
            _digest_for_parent(active_parent_kid["parent"].lower().strip(), "999", "en")
        )
        assert text is not None
        assert "Mini V12" in text
        assert "<b>" in text
        # has at least one emoji-ish (moon or sparkle)
        assert re.search(r"[\U0001F300-\U0001FAFF]", text), f"no emoji in: {text}"
        assert "trades" in text.lower() and "reflections" in text.lower()

    def test_digest_id_uses_indonesian_copy(self, active_parent_kid):
        # Switch kid lang to id
        _db.kids_users.update_one(
            {"id": active_parent_kid["kid_id"]},
            {"$set": {"lang": "id"}},
        )
        _db.kids_journals.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": active_parent_kid["kid_id"],
            "trade_id": str(uuid.uuid4()),
            "ticker": "AAPL",
            "side": "buy",
            "prompts": {"why_buy": "x"},
            "bonus_awarded_sc": 50,
            "created_at": _iso(datetime.now(timezone.utc)),
        })
        from services.kids_parent_digest import _digest_for_parent
        text = _arun(
            _digest_for_parent(active_parent_kid["parent"].lower().strip(), "999", "id")
        )
        assert text is not None, "digest should not be None when there's activity"
        for word in ("transaksi", "jurnal", "saldo"):
            assert word in text.lower(), f"missing Indonesian word '{word}' in: {text}"

    def test_run_once_idempotent_and_updates_last_digest_day(self, active_parent_kid, monkeypatch):
        """run_once: skips parents stamped today, otherwise sends + stamps."""
        from services import kids_parent_digest as kpd
        parent = active_parent_kid["parent"].lower().strip()
        # Force is_configured True and stub _send_message
        monkeypatch.setattr(kpd, "is_configured", lambda: True)

        sent_calls = {"n": 0}

        async def _fake_send(chat_id, text):
            sent_calls["n"] += 1
            return True

        monkeypatch.setattr(kpd, "_send_message", _fake_send)

        # Pre-link parent telegram + add 1 trade today so digest fires
        _db.kids_parent_telegram.insert_one({
            "parent_email": parent,
            "chat_id": "777",
            "username": "p",
            "linked_at": _iso(datetime.now(timezone.utc)),
        })
        _db.kids_trades.insert_one({
            "id": str(uuid.uuid4()),
            "student_id": active_parent_kid["kid_id"],
            "ticker": "AAPL",
            "side": "buy",
            "qty": 1,
            "price": 100.0,
            "created_at": _iso(datetime.now(timezone.utc)),
        })

        # First run — should send
        sent1 = _arun(kpd.run_once())
        assert sent1 == 1, f"expected 1 send, got {sent1}"
        assert sent_calls["n"] == 1

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc = _db.kids_parent_telegram.find_one({"parent_email": parent})
        assert doc.get("last_digest_day") == today

        # Second run same day — must skip (filter excludes parents already stamped)
        sent2 = _arun(kpd.run_once())
        assert sent2 == 0, "same-day re-run should be a no-op"
        assert sent_calls["n"] == 1, "no extra send"


# ---------------------------------------------------------------------------
# Telegram poll_and_link parent prefix routing (unit test)
# ---------------------------------------------------------------------------

class TestPollAndLinkParentPrefix:
    """We don't hit Telegram; we verify the routing branch in source."""
    def test_parent_prefix_pattern_recognised_in_source(self):
        import services.telegram as tg
        import inspect
        src = inspect.getsource(tg.poll_and_link)
        # The patch must reference the parent-prefix codepath.
        assert "parent" in src and "link_parent_chat" in src
        # Length check 12 (parent + 6 digits)
        assert "len(tok) == 12" in src or "== 12" in src
