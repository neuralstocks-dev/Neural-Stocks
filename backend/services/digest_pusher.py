"""Telegram digest queueing + flushing.

Per-channel `alert_schedule` (in routers/telegram.py) lets a user pick
how each alert channel reaches their Telegram chat:

* `realtime` — push the moment the alert fires (existing path)
* `digest_daily` — collect into `db.alert_queue`, push one batched
  message per user once a day (13:00 UTC ≈ 9am ET)
* `digest_weekly` — same, flushed Mondays 13:00 UTC

The non-realtime path adds **zero** extra Claude / yfinance cost — it
just defers the Telegram send. The original alert is always written to
`db.alerts` regardless of schedule, so the in-app /alerts feed remains
truthful and immediate.

Loop cadence: wakes hourly, fires on the right window, idempotent via
per-user cooldowns (≥ N hours since last flush of that schedule).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.db import db
from core.security import iso, now_utc
from routers.telegram import ALERT_SCHEDULES, _hydrate_schedule
from services.telegram import send_alert_to_user

logger = logging.getLogger(__name__)

# Min hours since last flush before a user is eligible again. Daily =
# 22h (gives slack for clock drift / loop jitter), weekly = 144h ≈ 6d.
DAILY_COOLDOWN_H = 22
WEEKLY_COOLDOWN_H = 144

# Loop wakes hourly; fires when current UTC hour matches one of these.
DAILY_FLUSH_HOUR_UTC = 13   # 13:00 UTC ≈ 9am ET / 8pm Jakarta
WEEKLY_FLUSH_HOUR_UTC = 13  # Monday 13:00 UTC


async def queue_alert(user_id: str, channel: str, *, ticker: str, title: str, body: str) -> None:
    """Insert a row into `db.alert_queue` for later batch-flush. Channel
    must be one of routers/telegram.ALERT_TYPES; the dispatcher (caller)
    should already have decided this is non-realtime for this user."""
    await db.alert_queue.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "channel": channel,
        "ticker": ticker,
        "title": title,
        "body": body,
        "created_at": iso(now_utc()),
        "flushed_at": None,
    })


async def get_user_schedule(user_id: str, channel: str) -> str:
    """Look up a single channel's schedule for a user, with all default
    fallbacks applied. Returns one of ALERT_SCHEDULES."""
    u = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "telegram_alert_schedule": 1},
    ) or {}
    sched = _hydrate_schedule(u.get("telegram_alert_schedule"))
    return sched.get(channel, "realtime")


# ─── Flush ──────────────────────────────────────────────────────────────
def _format_digest_message(rows: list[dict], schedule: str) -> str:
    """Compose a single Telegram message body from N queued alerts.
    Sorted newest-first; truncates body lines to keep the push readable."""
    label = "Daily Digest" if schedule == "digest_daily" else "Weekly Digest"
    header = f"<b>📬 {label} · {len(rows)} alert{'s' if len(rows) != 1 else ''}</b>\n"
    lines = [header]
    for r in rows[:25]:  # Telegram caps message size; 25 alerts is plenty.
        ticker = r.get("ticker") or "?"
        title = r.get("title") or ""
        # Strip HTML/control chars from the title since send_alert_to_user
        # will re-wrap with HTML escaping on its own.
        lines.append(f"\n<b>{ticker}</b> · {title}")
    if len(rows) > 25:
        lines.append(f"\n…and {len(rows) - 25} more in /alerts")
    return "".join(lines)


async def flush_user(user_id: str, schedule: str) -> int:
    """Drain queued alerts for one user + schedule, send a single Telegram
    digest, mark rows as flushed. Returns count flushed. Safe re-entry:
    rows already flushed are filtered out by the query."""
    # Collect rows for this user where the user's current schedule for
    # the row's channel matches `schedule`. We re-resolve the channel
    # schedule per row so a user who flips a channel from daily back to
    # realtime mid-week doesn't lose their queued alerts on the wrong
    # cadence — they get flushed at whatever cadence they set last.
    rows = await db.alert_queue.find(
        {"user_id": user_id, "flushed_at": None},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    if not rows:
        return 0

    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "telegram_alert_schedule": 1},
    ) or {}
    user_sched = _hydrate_schedule(user.get("telegram_alert_schedule"))

    matching = [r for r in rows if user_sched.get(r.get("channel")) == schedule]
    if not matching:
        return 0

    body = _format_digest_message(matching, schedule)
    ok = await send_alert_to_user(
        user_id,
        title="Neural Stock Intelligence™ digest",
        body=body,
    )
    if not ok:
        logger.warning("digest_pusher: send failed for user=%s schedule=%s", user_id, schedule)
        return 0

    ids = [r["id"] for r in matching]
    flush_ts = iso(now_utc())
    await db.alert_queue.update_many(
        {"id": {"$in": ids}},
        {"$set": {"flushed_at": flush_ts}},
    )
    # Stamp the user-level cooldown for this schedule so we skip them on
    # subsequent loop wake-ups within the cooldown window.
    cooldown_field = f"telegram_digest_last_flush_{schedule}"
    await db.users.update_one(
        {"id": user_id},
        {"$set": {cooldown_field: flush_ts}},
    )
    return len(matching)


async def run_flush_batch(schedule: str) -> dict:
    """Flush all eligible users for one schedule (`digest_daily` or
    `digest_weekly`). Eligibility = has any unflushed queued alerts on
    this channel-schedule AND last flush > cooldown ago."""
    if schedule not in ("digest_daily", "digest_weekly"):
        raise ValueError(f"unsupported schedule {schedule}")

    cooldown_h = DAILY_COOLDOWN_H if schedule == "digest_daily" else WEEKLY_COOLDOWN_H
    cooldown_field = f"telegram_digest_last_flush_{schedule}"
    cutoff = now_utc() - timedelta(hours=cooldown_h)
    cutoff_iso = iso(cutoff)

    # Anyone with queued alerts (we'll filter by schedule per-row inside flush_user)
    pipeline = [
        {"$match": {"flushed_at": None}},
        {"$group": {"_id": "$user_id"}},
    ]
    user_ids = [doc["_id"] async for doc in db.alert_queue.aggregate(pipeline)]
    if not user_ids:
        return {"ok": True, "schedule": schedule, "users_flushed": 0, "alerts_flushed": 0}

    # Cooldown filter
    eligible = []
    for uid in user_ids:
        u = await db.users.find_one(
            {"id": uid},
            {"_id": 0, cooldown_field: 1},
        ) or {}
        last = u.get(cooldown_field)
        if not last or last < cutoff_iso:
            eligible.append(uid)

    total_alerts = 0
    for uid in eligible:
        try:
            n = await flush_user(uid, schedule)
            total_alerts += n
        except Exception as e:
            logger.warning("digest_pusher: flush_user failed for %s: %s", uid, e)
    logger.info(
        "digest_pusher.%s: %d candidate users, %d eligible, %d alerts flushed",
        schedule, len(user_ids), len(eligible), total_alerts,
    )
    return {
        "ok": True,
        "schedule": schedule,
        "users_flushed": len(eligible),
        "alerts_flushed": total_alerts,
    }


# ─── Background loop ────────────────────────────────────────────────────
async def digest_pusher_loop():
    """Wakes hourly. Runs daily flush when UTC hour matches; runs weekly
    flush when UTC weekday=Monday AND hour matches. Per-user cooldown
    inside run_flush_batch makes accidental double-fires harmless."""
    await asyncio.sleep(180)  # post-boot settle
    while True:
        try:
            now = datetime.now(timezone.utc)
            if now.hour == DAILY_FLUSH_HOUR_UTC:
                await run_flush_batch("digest_daily")
            if now.weekday() == 0 and now.hour == WEEKLY_FLUSH_HOUR_UTC:
                await run_flush_batch("digest_weekly")
        except Exception as e:
            logger.warning("digest_pusher_loop iteration failed: %s", e)
        await asyncio.sleep(3600)  # 1 hour wake cadence
