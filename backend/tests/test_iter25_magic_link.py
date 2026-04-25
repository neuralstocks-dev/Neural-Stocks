"""Iter 25 — Magic-link auto-login tests.

Covers:
* services/magic_link.create_magic_token: doc shape + TTL/unique indexes
* services/magic_link.redeem_magic_token: valid, bogus, consumed, expired, empty
* POST /api/auth/magic: success shape, 401 bogus/consumed/expired, 400 missing
* services/telegram.send_alert_to_user: appends &t=<token>, gracefully
  degrades when create_magic_token raises.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock

import pytest
import requests

# --- env / path bootstrap so we can import the running backend modules ----
sys.path.insert(0, "/app/backend")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")

from core.db import db  # noqa: E402
from services.magic_link import create_magic_token, redeem_magic_token  # noqa: E402
from services import telegram as tg  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"


# A single shared event loop so motor's client (bound to its first loop) keeps working.
_LOOP = asyncio.new_event_loop()


def run(coro):
    return _LOOP.run_until_complete(coro)


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_user_id():
    """Resolve admin user id via DB lookup."""
    async def _go():
        u = await db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "id": 1})
        return u["id"] if u else None
    uid = run(_go())
    if not uid:
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        if r.status_code == 200:
            uid = r.json()["user"]["id"]
    assert uid, "Admin user not found / not seeded"
    return uid


# ---------- magic_link service tests ----------

class TestMagicLinkService:
    def test_create_token_doc_shape(self, admin_user_id):
        async def _go():
            tok = await create_magic_token(admin_user_id)
            doc = await db.magic_tokens.find_one({"token": tok})
            return tok, doc
        tok, doc = run(_go())
        assert isinstance(tok, str) and len(tok) >= 32
        assert doc is not None
        # Required fields
        for k in ("token", "user_id", "created_at", "expires_at", "expires_at_iso", "consumed_at"):
            assert k in doc, f"missing field {k}"
        assert doc["user_id"] == admin_user_id
        assert doc["consumed_at"] is None
        assert isinstance(doc["expires_at"], datetime), "expires_at must be a real datetime for TTL index"
        assert isinstance(doc["expires_at_iso"], str)
        assert doc["expires_at"] > datetime.now(timezone.utc).replace(tzinfo=doc["expires_at"].tzinfo)

    def test_indexes_exist(self):
        async def _go():
            # Ensure indexes by minting one token first
            await create_magic_token("dummy-not-real-user")
            return await db.magic_tokens.index_information()
        info = run(_go())
        # TTL index on expires_at
        ttl_found = any(
            any(k == "expires_at" for k, _ in v.get("key", []))
            and v.get("expireAfterSeconds") == 0
            for v in info.values()
        )
        unique_found = any(
            any(k == "token" for k, _ in v.get("key", []))
            and v.get("unique") is True
            for v in info.values()
        )
        assert ttl_found, f"TTL index on expires_at missing. indexes={info}"
        assert unique_found, f"Unique index on token missing. indexes={info}"

    def test_redeem_valid_returns_user_id(self, admin_user_id):
        async def _go():
            tok = await create_magic_token(admin_user_id)
            return await redeem_magic_token(tok)
        assert run(_go()) == admin_user_id

    def test_redeem_one_time_use(self, admin_user_id):
        async def _go():
            tok = await create_magic_token(admin_user_id)
            first = await redeem_magic_token(tok)
            second = await redeem_magic_token(tok)
            return first, second
        first, second = run(_go())
        assert first == admin_user_id
        assert second is None, "consumed token must not redeem twice"

    def test_redeem_bogus(self):
        assert run(redeem_magic_token("not-a-real-token-" + uuid.uuid4().hex)) is None

    def test_redeem_empty_or_none(self):
        assert run(redeem_magic_token("")) is None
        assert run(redeem_magic_token(None)) is None

    def test_redeem_expired(self, admin_user_id):
        """Force-expire a token via direct DB update, then redeem must return None."""
        async def _go():
            tok = await create_magic_token(admin_user_id)
            past = datetime.now(timezone.utc) - timedelta(hours=1)
            await db.magic_tokens.update_one({"token": tok}, {"$set": {"expires_at": past}})
            return await redeem_magic_token(tok)
        assert run(_go()) is None

    def test_redeem_atomic_concurrent(self, admin_user_id):
        """Concurrent redemptions must produce exactly one success."""
        async def _go():
            tok = await create_magic_token(admin_user_id)
            results = await asyncio.gather(
                redeem_magic_token(tok),
                redeem_magic_token(tok),
                redeem_magic_token(tok),
            )
            return results
        results = run(_go())
        wins = [r for r in results if r == admin_user_id]
        losses = [r for r in results if r is None]
        assert len(wins) == 1, f"exactly one redemption must win, got {results}"
        assert len(losses) == 2


# ---------- /api/auth/magic endpoint ----------

class TestAuthMagicEndpoint:
    def test_success_returns_login_shape(self, admin_user_id):
        tok = run(create_magic_token(admin_user_id))
        r = requests.post(f"{BASE_URL}/api/auth/magic", json={"token": tok}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 20
        assert "user" in data
        u = data["user"]
        assert u["email"] == ADMIN_EMAIL
        assert u["id"] == admin_user_id
        assert "is_admin" in u
        assert "plan" in u
        # JWT should authenticate /auth/me
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"},
            timeout=15,
        )
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN_EMAIL

    def test_missing_token_field_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/magic", json={}, timeout=15)
        assert r.status_code == 400, r.text

    def test_empty_token_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/magic", json={"token": ""}, timeout=15)
        assert r.status_code == 400, r.text

    def test_bogus_token_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/magic",
            json={"token": "bogus-" + uuid.uuid4().hex},
            timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_consumed_token_401(self, admin_user_id):
        tok = run(create_magic_token(admin_user_id))
        r1 = requests.post(f"{BASE_URL}/api/auth/magic", json={"token": tok}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/auth/magic", json={"token": tok}, timeout=15)
        assert r2.status_code == 401, "consumed token must be rejected"

    def test_expired_token_401(self, admin_user_id):
        async def _seed():
            tok = await create_magic_token(admin_user_id)
            past = datetime.now(timezone.utc) - timedelta(hours=1)
            await db.magic_tokens.update_one({"token": tok}, {"$set": {"expires_at": past}})
            return tok
        tok = run(_seed())
        r = requests.post(f"{BASE_URL}/api/auth/magic", json={"token": tok}, timeout=15)
        assert r.status_code == 401


# ---------- telegram.send_alert_to_user deep-link integration ----------

class TestTelegramDeepLinkMagic:
    def test_alert_appends_magic_token(self, admin_user_id):
        """When ticker + PUBLIC_APP_URL set, alert text must include &t=<uuid>."""
        captured = {}

        async def fake_send(chat_id, text):
            captured["chat_id"] = chat_id
            captured["text"] = text
            return True

        async def _run():
            # Ensure admin has a chat_id (mocked) so the alert path proceeds
            orig = await db.users.find_one({"id": admin_user_id}, {"_id": 0, "telegram_chat_id": 1})
            had_chat = bool((orig or {}).get("telegram_chat_id"))
            if not had_chat:
                await db.users.update_one(
                    {"id": admin_user_id}, {"$set": {"telegram_chat_id": "999999"}}
                )
            try:
                with patch.object(tg, "_send_message", new=fake_send), \
                     patch.object(tg, "_PUBLIC_APP_URL", "https://example.test"):
                    ok = await tg.send_alert_to_user(admin_user_id, "Title", "Body", ticker="aapl")
                return ok
            finally:
                if not had_chat:
                    await db.users.update_one(
                        {"id": admin_user_id}, {"$unset": {"telegram_chat_id": ""}}
                    )
        ok = run(_run())
        assert ok is True
        assert "text" in captured
        text = captured["text"]
        # Deep link with autorun=1 + magic token
        assert "/analysis/AAPL?autorun=1" in text, f"deep link missing/incorrect: {text}"
        assert "&t=" in text, f"magic token param missing: {text}"
        # Extract token and verify it's a real uuid that redeems to admin
        import re
        m = re.search(r"&t=([0-9a-fA-F-]{30,})", text)
        assert m, f"could not extract token from: {text}"
        tok = m.group(1)
        # Verify it actually redeems
        uid = run(redeem_magic_token(tok))
        assert uid == admin_user_id

    def test_alert_graceful_when_mint_fails(self, admin_user_id):
        """If create_magic_token raises, alert still sends without &t="""
        captured = {}

        async def fake_send(chat_id, text):
            captured["text"] = text
            return True

        async def boom(*a, **kw):
            raise RuntimeError("simulated mint failure")

        async def _run():
            orig = await db.users.find_one({"id": admin_user_id}, {"_id": 0, "telegram_chat_id": 1})
            had_chat = bool((orig or {}).get("telegram_chat_id"))
            if not had_chat:
                await db.users.update_one(
                    {"id": admin_user_id}, {"$set": {"telegram_chat_id": "999999"}}
                )
            try:
                # Patch the symbol that telegram.py imports lazily inside the function
                import services.magic_link as ml
                with patch.object(tg, "_send_message", new=fake_send), \
                     patch.object(tg, "_PUBLIC_APP_URL", "https://example.test"), \
                     patch.object(ml, "create_magic_token", new=boom):
                    return await tg.send_alert_to_user(admin_user_id, "T", "B", ticker="msft")
            finally:
                if not had_chat:
                    await db.users.update_one(
                        {"id": admin_user_id}, {"$unset": {"telegram_chat_id": ""}}
                    )
        ok = run(_run())
        assert ok is True
        text = captured.get("text", "")
        assert "/analysis/MSFT?autorun=1" in text
        assert "&t=" not in text, f"magic param must be absent on mint failure: {text}"
