"""Magic-link tokens for frictionless Telegram → app login.

Every Telegram alert deep-link includes `?t=<token>`. The token is a
one-time, short-lived (7 days) random UUID stored in `db.magic_tokens`.
When the frontend lands on any page with that param, it POSTs to
`/api/auth/magic` to exchange the magic token for a regular JWT — so
the user never sees a login screen after tapping a Telegram alert.

Design properties:
* One-time use: redemption stamps `consumed_at`; subsequent requests 404.
* Short-lived: TTL index on `expires_at` cleans up after 7 days even if
  never redeemed (e.g., user ignored the Telegram alert).
* Per-link, not per-user: a fresh token is minted on every Telegram
  push, so leaking a single URL only compromises that one window.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from core.db import db
from core.security import iso, now_utc

logger = logging.getLogger(__name__)

MAGIC_TOKEN_TTL_HOURS = 24 * 7  # 7 days


_index_ensured = False


async def _ensure_index():
    global _index_ensured
    if _index_ensured:
        return
    try:
        # TTL index — Mongo deletes docs after expires_at.
        await db.magic_tokens.create_index(
            "expires_at", expireAfterSeconds=0
        )
        await db.magic_tokens.create_index("token", unique=True)
        _index_ensured = True
    except Exception as e:
        logger.warning("magic_tokens: ensure_index failed: %s", e)


async def create_magic_token(user_id: str) -> str:
    """Mint a fresh one-time magic token for `user_id`. Returns the
    opaque token string the caller can splice into a deep link."""
    await _ensure_index()
    token = str(uuid.uuid4())
    now = now_utc()
    # Mongo TTL needs a real datetime, not ISO string, so we store both:
    # `expires_at` as datetime (for the TTL index) and `expires_at_iso`
    # for human inspection during debugging.
    expires_dt = now + timedelta(hours=MAGIC_TOKEN_TTL_HOURS)
    await db.magic_tokens.insert_one({
        "token": token,
        "user_id": user_id,
        "created_at": iso(now),
        "expires_at": expires_dt,
        "expires_at_iso": iso(expires_dt),
        "consumed_at": None,
    })
    return token


async def redeem_magic_token(token: str) -> str | None:
    """Atomically consume a magic token. Returns the user_id if the
    token was valid + unconsumed + unexpired; None otherwise.

    Uses find_one_and_update with a strict filter so concurrent
    redemptions can't both succeed."""
    if not token:
        return None
    await _ensure_index()
    now = now_utc()
    doc = await db.magic_tokens.find_one_and_update(
        {
            "token": token,
            "consumed_at": None,
            "expires_at": {"$gt": now},
        },
        {"$set": {"consumed_at": iso(now)}},
        projection={"_id": 0, "user_id": 1},
    )
    if not doc:
        return None
    return doc.get("user_id")
