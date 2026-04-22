"""Telegram bot integration — link accounts + push alerts to user chats.

Flow:
1. Admin creates a bot via @BotFather and sets TELEGRAM_BOT_TOKEN in env.
2. User visits /settings → clicks "Connect Telegram" → backend generates a
   6-digit one-time link_code and stores it on the user doc.
3. User opens https://t.me/<bot_username>?start=<link_code> or opens the bot
   and sends the code manually.
4. The frontend polls /api/telegram/link-status which calls getUpdates and
   looks for a message containing the user's link_code. If found, we link the
   chat_id to the user and retire the code.
5. When an alert fires, send_alert() pushes a formatted message to the user's
   linked chat_id via sendMessage.

Zero webhook setup required — we use long-poll getUpdates with a server-side
cursor (`settings._telegram_updates_offset`).
"""
import logging
import secrets
from typing import Optional

import httpx

from core.config import TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME
from core.db import db
from core.security import iso, now_utc

logger = logging.getLogger(__name__)

TG_API = "https://api.telegram.org/bot"


def _api_url(method: str) -> str:
    if not TELEGRAM_BOT_TOKEN:
        return ""
    return f"{TG_API}{TELEGRAM_BOT_TOKEN}/{method}"


def is_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


async def generate_link_code(user_id: str) -> dict:
    """Create a 6-digit one-time code and persist on the user doc."""
    code = f"{secrets.randbelow(10**6):06d}"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "telegram_link_code": code,
            "telegram_link_code_created_at": iso(now_utc()),
        }},
    )
    return {
        "link_code": code,
        "bot_username": TELEGRAM_BOT_USERNAME or None,
        "deep_link": f"https://t.me/{TELEGRAM_BOT_USERNAME}?start={code}" if TELEGRAM_BOT_USERNAME else None,
    }


async def _get_updates_offset() -> int:
    doc = await db.settings.find_one({"id": "telegram_updates_offset"}, {"_id": 0}) or {}
    return int(doc.get("offset") or 0)


async def _set_updates_offset(offset: int):
    await db.settings.update_one(
        {"id": "telegram_updates_offset"},
        {"$set": {"id": "telegram_updates_offset", "offset": offset}},
        upsert=True,
    )


async def poll_and_link() -> int:
    """Fetch new Telegram updates and auto-link any message whose text
    contains a user's pending link_code. Returns number of new links made."""
    if not is_configured():
        return 0
    offset = await _get_updates_offset()
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.get(_api_url("getUpdates"), params={"offset": offset, "timeout": 0, "limit": 50})
        if r.status_code != 200:
            logger.warning("Telegram getUpdates non-200: %s", r.text[:200])
            return 0
        data = r.json()
    except Exception as e:
        logger.warning("Telegram getUpdates failed: %s", e)
        return 0
    if not data.get("ok"):
        return 0

    updates = data.get("result") or []
    linked = 0
    max_id = offset - 1
    for u in updates:
        max_id = max(max_id, int(u.get("update_id") or 0))
        msg = u.get("message") or u.get("edited_message") or {}
        chat = msg.get("chat") or {}
        chat_id = chat.get("id")
        text = (msg.get("text") or "").strip()
        if not chat_id or not text:
            continue
        # Accept "/start 123456" or just "123456"
        tokens = text.split()
        candidate = None
        for tok in tokens:
            if tok.isdigit() and len(tok) == 6:
                candidate = tok
                break
        if not candidate:
            continue
        user = await db.users.find_one({"telegram_link_code": candidate}, {"_id": 0})
        if not user:
            # Send an unknown-code reply
            await _send_message(chat_id, "Sorry, that Neulab link code wasn't found. Please generate a fresh code from the Neulab app.")
            continue
        # Link
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {
                    "telegram_chat_id": str(chat_id),
                    "telegram_username": (chat.get("username") or "").lower() or None,
                    "telegram_linked_at": iso(now_utc()),
                },
                "$unset": {"telegram_link_code": "", "telegram_link_code_created_at": ""},
            },
        )
        linked += 1
        name = user.get("full_name") or user.get("email", "there")
        await _send_message(
            chat_id,
            f"✅ Your Neulab account is now linked, {name.split()[0] if isinstance(name, str) else 'there'}.\n\n"
            "You'll receive pattern alerts and verdict notifications here. Reply /unlink to disconnect."
        )
    if max_id >= offset:
        await _set_updates_offset(max_id + 1)
    return linked


async def _send_message(chat_id, text: str) -> bool:
    if not is_configured() or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            r = await hc.post(
                _api_url("sendMessage"),
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            )
        return r.status_code == 200
    except Exception as e:
        logger.warning("Telegram sendMessage failed: %s", e)
        return False


async def send_alert_to_user(user_id: str, title: str, body: str) -> bool:
    """Public helper: push an alert to the user's linked Telegram chat."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "telegram_chat_id": 1})
    chat_id = (user or {}).get("telegram_chat_id")
    if not chat_id:
        return False
    formatted = f"<b>{title}</b>\n\n{body}"
    return await _send_message(chat_id, formatted)


async def unlink_user(user_id: str) -> bool:
    res = await db.users.update_one(
        {"id": user_id},
        {"$unset": {"telegram_chat_id": "", "telegram_username": "", "telegram_linked_at": ""}},
    )
    return res.modified_count > 0


async def link_status(user_id: str) -> dict:
    """Returns current linking/linked state for a user."""
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "telegram_chat_id": 1, "telegram_link_code": 1,
         "telegram_username": 1, "telegram_linked_at": 1},
    )
    if not user:
        return {"configured": is_configured(), "linked": False}
    return {
        "configured": is_configured(),
        "bot_username": TELEGRAM_BOT_USERNAME or None,
        "linked": bool(user.get("telegram_chat_id")),
        "pending_link_code": user.get("telegram_link_code"),
        "telegram_username": user.get("telegram_username"),
        "linked_at": user.get("telegram_linked_at"),
    }
