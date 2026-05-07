"""StockKids Parent Telegram Digest — nightly per-parent summary.

Runs once per UTC day at 21:00 (≈ early morning Asia / late evening US,
balancing both target audiences). Builds a short message per linked
parent summarising the day's StockKids activity for all of their kids:

  • StockCoin balance change (+/− vs yesterday)
  • Trades placed today
  • New journal entries today
  • Outstanding "ready for reflection" trades

Skips parents whose kids did nothing today — silence is a feature.
Best-effort: any failure is logged and the next parent is processed.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from core.db import db
from services.telegram import _send_message, is_configured

logger = logging.getLogger(__name__)

# 21:00 UTC = 04:00 WIB (Indonesia next day morning) and 17:00 EDT
# (US east-coast end-of-day). One run per UTC day, idempotent.
DIGEST_HOUR_UTC = 21


def _today_utc_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _digest_for_parent(parent_email: str, chat_id: str, lang: str = "en") -> str | None:
    """Return the formatted digest text or None if there's nothing
    worth pushing today."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = today.isoformat()

    kids_cur = db.kids_users.find(
        {"parent_email": parent_email, "status": "active"},
        {"_id": 0, "id": 1, "full_name": 1, "stock_coins_balance": 1, "lang": 1},
    )
    kids = await kids_cur.to_list(length=20)
    if not kids:
        return None

    lines: list[str] = []
    any_activity = False
    for kid in kids:
        trades_today = await db.kids_trades.count_documents({
            "student_id": kid["id"],
            "created_at": {"$gte": today_iso},
        })
        journals_today = await db.kids_journals.count_documents({
            "student_id": kid["id"],
            "created_at": {"$gte": today_iso},
        })
        if trades_today == 0 and journals_today == 0:
            continue
        any_activity = True
        if lang == "id":
            lines.append(
                f"• <b>{kid.get('full_name')}</b>: {trades_today} transaksi, "
                f"{journals_today} jurnal · saldo {int(kid.get('stock_coins_balance', 0))} SC"
            )
        else:
            lines.append(
                f"• <b>{kid.get('full_name')}</b>: {trades_today} trades, "
                f"{journals_today} reflections · balance {int(kid.get('stock_coins_balance', 0))} SC"
            )

    if not any_activity:
        return None

    if lang == "id":
        header = "🌙 <b>Ringkasan StockKids hari ini</b>\n\n"
        footer = "\n\n<i>Edukasi · bukan saran investasi · uang virtual saja.</i>"
    else:
        header = "🌙 <b>StockKids · today's activity</b>\n\n"
        footer = "\n\n<i>Educational · not financial advice · virtual money only.</i>"
    return header + "\n".join(lines) + footer


async def run_once():
    """Send today's digest to every linked parent, marking each as sent
    so a same-day re-run is a no-op."""
    if not is_configured():
        logger.info("Telegram not configured, skipping parent digest run")
        return 0
    today = _today_utc_str()
    cur = db.kids_parent_telegram.find({"last_digest_day": {"$ne": today}}, {"_id": 0})
    sent = 0
    async for tg in cur:
        parent_email = tg.get("parent_email")
        chat_id = tg.get("chat_id")
        if not parent_email or not chat_id:
            continue
        # Use the kid's lang preference — pull the most-recently-active
        # kid's lang as the parent's default.
        kid = await db.kids_users.find_one(
            {"parent_email": parent_email, "status": "active"},
            {"_id": 0, "lang": 1},
            sort=[("created_at", -1)],
        )
        lang = (kid or {}).get("lang") or "en"
        try:
            text = await _digest_for_parent(parent_email, chat_id, lang)
            if text:
                ok = await _send_message(chat_id, text)
                if ok:
                    sent += 1
            await db.kids_parent_telegram.update_one(
                {"parent_email": parent_email},
                {"$set": {"last_digest_day": today}},
            )
        except Exception as e:
            logger.error("Parent digest failed for %s: %s", parent_email, e)
    if sent:
        logger.info("StockKids parent digest pushed to %d parent(s)", sent)
    return sent


async def digest_loop():
    """Long-running scheduler — fires once per UTC day at DIGEST_HOUR_UTC."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            target = now.replace(hour=DIGEST_HOUR_UTC, minute=0, second=0, microsecond=0)
            if target <= now:
                target = target + timedelta(days=1)
            sleep_s = max(60, int((target - now).total_seconds()))
            await asyncio.sleep(sleep_s)
            await run_once()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("kids parent digest_loop error: %s", e)
            await asyncio.sleep(300)
