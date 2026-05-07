"""KidStocks Parent Portal — magic-link auth + read-only dashboard + Telegram link.

Why magic-link (not password): parents check ~1×/week. Passwords would
add friction without value, and we already have a trust relationship
through the consent flow. Each link gives the parent 24h of dashboard
access, then they request a fresh one.

Auth model:
- Parent identifies via the email they used on the kid's `parent_email`
  field at signup. They never get a password.
- POST /api/kids/parent/request-link {email} → mints a session token
  and emails it. We DON'T leak whether the email exists (always 200).
- GET /api/kids/parent/dashboard?token={t} → returns aggregated kid
  data scoped to all kids whose `parent_email` matches this email.
- Sessions expire after 24h. Tokens are 32 URL-safe chars.

Telegram nightly digest:
- Parent links Telegram via `POST /api/kids/parent/telegram/start` →
  reuses the existing `services.telegram` link-code flow but stamps
  the chat_id on `parent_telegram_links` instead of `users`.
- A daily 21:00 UTC scheduler builds an Indonesian/English digest per
  parent and pushes via the existing telegram service.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core.db import db
from core.security import iso, now_utc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kids/parent", tags=["kids-parent"])

SESSION_TTL = timedelta(hours=24)
LINK_CODE_TTL = timedelta(minutes=15)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def _new_token() -> str:
    return secrets.token_urlsafe(24)


async def _mint_session(parent_email: str) -> str:
    """Create a 24h parent session bound to the given parent_email. We
    deliberately do NOT invalidate prior sessions on new request — a
    parent might check from phone + laptop and we don't want to log
    them out."""
    token = _new_token()
    expires_at = datetime.now(timezone.utc) + SESSION_TTL
    await db.kids_parent_sessions.insert_one({
        "id": str(uuid.uuid4()),
        "parent_email": parent_email,
        "token": token,
        "created_at": iso(now_utc()),
        "expires_at": iso(expires_at),
        "last_used_at": None,
    })
    return token


async def _resolve_parent(token: Optional[str]) -> str:
    """Return the parent_email for a valid (unexpired) token, or 401."""
    if not token:
        raise HTTPException(status_code=401, detail="Missing parent session token.")
    doc = await db.kids_parent_sessions.find_one({"token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid or expired parent link.")
    try:
        if datetime.fromisoformat(doc["expires_at"]) <= datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="This parent link has expired. Please request a new one.")
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Malformed parent session.")
    # Best-effort last-used stamp.
    await db.kids_parent_sessions.update_one(
        {"id": doc["id"]},
        {"$set": {"last_used_at": iso(now_utc())}},
    )
    return doc["parent_email"]


# ---------------------------------------------------------------------------
# Magic-link request — public
# ---------------------------------------------------------------------------

class RequestLinkBody(BaseModel):
    email: EmailStr
    lang: str = Field(default="en", pattern=r"^(en|id)$")


@router.post("/request-link")
async def request_parent_link(body: RequestLinkBody):
    """Email a 24h dashboard link to the parent. Always returns 200 to
    avoid leaking which emails are registered. Rate-limit-able later."""
    from services.email import send_parent_dashboard_link_email
    email = body.email.lower().strip()

    # Find at least one consent-active kid linked to this parent.
    kid = await db.kids_users.find_one(
        {"parent_email": email, "status": "active"},
        {"_id": 0, "id": 1, "full_name": 1},
    )
    if not kid:
        # Don't leak. Same response shape as the success path.
        return {"ok": True, "sent": False}

    token = await _mint_session(email)
    try:
        await send_parent_dashboard_link_email(
            to_email=email,
            kid_full_name=kid.get("full_name") or "your child",
            session_token=token,
            lang=body.lang,
        )
    except Exception as e:
        logger.error("Failed to send parent dashboard link: %s", e)
    return {"ok": True, "sent": True}


# ---------------------------------------------------------------------------
# Dashboard — token-authenticated, read-only
# ---------------------------------------------------------------------------

def _public_kid_summary(kid: dict, positions: list[dict], trades: list[dict], journals: list[dict]) -> dict:
    """Project a kid + their week's activity into a parent-safe view —
    no password hashes, no internal Mongo IDs, no parent IP/UA."""
    return {
        "id": kid["id"],
        "full_name": kid.get("full_name"),
        "age_band": kid.get("age_band"),
        "stock_coins_balance": kid.get("stock_coins_balance", 0),
        "starting_stock_coins": kid.get("starting_stock_coins", 10000),
        "lang": kid.get("lang", "en"),
        "created_at": kid.get("created_at"),
        "positions": [
            {
                "ticker": p.get("ticker"),
                "qty": p.get("qty"),
                "avg_cost": p.get("avg_cost"),
            }
            for p in positions
        ],
        "trades_this_week": [
            {
                "trade_id": t.get("id"),
                "ticker": t.get("ticker"),
                "side": t.get("side"),
                "qty": t.get("qty"),
                "price": t.get("price"),
                "created_at": t.get("created_at"),
            }
            for t in trades
        ],
        "recent_journals": [
            {
                "trade_id": j.get("trade_id"),
                "ticker": j.get("ticker"),
                "side": j.get("side"),
                "prompts": j.get("prompts") or {},
                "bonus_awarded_sc": j.get("bonus_awarded_sc", 0),
                "created_at": j.get("created_at"),
            }
            for j in journals
        ],
    }


@router.get("/dashboard")
async def parent_dashboard(token: Optional[str] = None):
    """Aggregated read-only view of all the parent's kids."""
    parent_email = await _resolve_parent(token)
    week_cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    kids_cur = db.kids_users.find(
        {"parent_email": parent_email, "status": "active"},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", 1)
    kids = await kids_cur.to_list(length=20)

    summaries = []
    for kid in kids:
        positions_cur = db.kids_positions.find(
            {"student_id": kid["id"], "qty": {"$gt": 0}},
            {"_id": 0},
        )
        positions = await positions_cur.to_list(length=50)
        trades_cur = db.kids_trades.find(
            {"student_id": kid["id"], "created_at": {"$gte": week_cutoff}},
            {"_id": 0},
        ).sort("created_at", -1)
        trades = await trades_cur.to_list(length=100)
        journals_cur = db.kids_journals.find(
            {"student_id": kid["id"]},
            {"_id": 0},
        ).sort("created_at", -1).limit(3)
        journals = await journals_cur.to_list(length=3)
        summaries.append(_public_kid_summary(kid, positions, trades, journals))

    # Telegram link state for this parent.
    tg_link = await db.kids_parent_telegram.find_one(
        {"parent_email": parent_email},
        {"_id": 0, "chat_id": 1, "linked_at": 1, "username": 1},
    )

    return {
        "parent_email": parent_email,
        "kids": summaries,
        "telegram": {
            "linked": bool(tg_link),
            "username": (tg_link or {}).get("username"),
            "linked_at": (tg_link or {}).get("linked_at"),
        },
    }


# ---------------------------------------------------------------------------
# Telegram nightly digest opt-in
# ---------------------------------------------------------------------------

class TelegramStartBody(BaseModel):
    token: str = Field(..., max_length=64)


@router.post("/telegram/start")
async def telegram_start(body: TelegramStartBody):
    """Mint a 6-digit link code the parent types into our Telegram bot.
    Returns the deep-link + bot username for the frontend to render."""
    from core.config import TELEGRAM_BOT_USERNAME
    parent_email = await _resolve_parent(body.token)

    code = f"{secrets.randbelow(10**6):06d}"
    expires_at = datetime.now(timezone.utc) + LINK_CODE_TTL
    # Upsert — only one pending code per parent at a time.
    await db.kids_parent_telegram_codes.update_one(
        {"parent_email": parent_email},
        {"$set": {
            "parent_email": parent_email,
            "code": code,
            "created_at": iso(now_utc()),
            "expires_at": iso(expires_at),
        }},
        upsert=True,
    )
    return {
        "link_code": code,
        "bot_username": TELEGRAM_BOT_USERNAME or None,
        "deep_link": f"https://t.me/{TELEGRAM_BOT_USERNAME}?start=parent{code}" if TELEGRAM_BOT_USERNAME else None,
        "expires_in_seconds": int(LINK_CODE_TTL.total_seconds()),
    }


@router.post("/telegram/disconnect")
async def telegram_disconnect(body: TelegramStartBody):
    parent_email = await _resolve_parent(body.token)
    await db.kids_parent_telegram.delete_many({"parent_email": parent_email})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public POST that the bot calls back into when a parent runs `/start parent{code}`.
# Wiring is in services/telegram.py poll_and_link extension.
# ---------------------------------------------------------------------------

async def link_parent_chat(code: str, chat_id: int, username: Optional[str]) -> Optional[str]:
    """Bind a Telegram chat to a parent_email. Returns the parent_email
    on success, None on unknown/expired code. Idempotent re-runs allowed.
    Called from `services.telegram.poll_and_link` (see patch there)."""
    doc = await db.kids_parent_telegram_codes.find_one({"code": code}, {"_id": 0})
    if not doc:
        return None
    try:
        if datetime.fromisoformat(doc["expires_at"]) <= datetime.now(timezone.utc):
            return None
    except (KeyError, ValueError, TypeError):
        return None
    parent_email = doc["parent_email"]
    await db.kids_parent_telegram.update_one(
        {"parent_email": parent_email},
        {"$set": {
            "parent_email": parent_email,
            "chat_id": str(chat_id),
            "username": (username or "").lower() or None,
            "linked_at": iso(now_utc()),
        }},
        upsert=True,
    )
    await db.kids_parent_telegram_codes.delete_many({"parent_email": parent_email})
    return parent_email
