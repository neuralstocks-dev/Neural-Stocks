"""Admin ops nightly digest — daily 09:00 SGT (=01:00 UTC) Telegram push.

One concise message giving each admin a daily operational pulse without
requiring them to open the admin panel:

    Yesterday — Apr 30
    📊 Verdicts: 47
    ⚡ 30s-goal: 78% (n=12)
    🔁 Fallback: 12% (gemini ×6)
    ⚠️ Top failure: ChatError ×3
    🧠 Universal Key: 99.43

Audience: ONLY users in `ADMIN_EMAILS` who have already linked Telegram.
Free users / non-admins NEVER receive this digest. Sending lives on a
separate background loop from the Telegram digest pusher because the
data sources, cooldown, and gating logic differ — keeping them in
separate modules avoids the existing pusher growing into a god-loop.

Cadence:
  * Wakes hourly.
  * Fires when `current UTC hour == DIGEST_HOUR_UTC` (default 01:00 UTC
    ≈ 09:00 SGT / 08:00 WIB).
  * Idempotent via a per-admin `admin_digest_last_run_at` field on the
    user document — if the loop double-wakes inside the firing hour we
    skip duplicates.

Window: aggregates events from the last 24 hours ending at the current
wall clock. We label the day in SGT (one-day-ago) for reader clarity,
even though the underlying window is rolling.
"""
from __future__ import annotations

import asyncio
import logging
import time as _time
from datetime import datetime, timedelta, timezone
from typing import List

from core.config import ADMIN_EMAILS
from core.db import db
from core.security import iso, now_utc
from services.telegram import _send_message, is_configured as _tg_configured

logger = logging.getLogger(__name__)

# Fire at 01:00 UTC = 09:00 SGT / 08:00 WIB (Indonesia western). Pick
# 01:00 UTC because it's a low-traffic hour for both major audiences.
DIGEST_HOUR_UTC = 1

# Skip an admin who already received a digest within the last N hours
# (defends against double-firing if the loop wakes twice inside the
# firing hour due to drift).
COOLDOWN_HOURS = 22

LOOP_SLEEP_SECONDS = 60 * 60  # 1h


async def _aggregate_admin_metrics(window_hours: int = 24) -> dict:
    """Pull the 4 numbers the digest cares about — lightweight queries
    over `analyses`, `llm_events`, and the user document for the
    Universal Key balance.

    All queries swallow exceptions so a single broken collection (e.g.
    indexes still building) doesn't kill the whole digest. Missing
    fields render as "—" in the message so the digest stays useful even
    in degraded conditions."""
    metrics = {
        "verdicts": None,
        "thirty_second_goal_pct": None,
        "thirty_second_goal_n": None,
        "fallback_rate_pct": None,
        "fallback_top_provider": None,  # e.g. "gemini ×6"
        "top_failure_reason": None,     # e.g. "ChatError ×3"
        "universal_key_balance": None,
        "window_hours": window_hours,
    }

    cutoff_dt = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    cutoff_iso = cutoff_dt.isoformat().replace("+00:00", "Z")
    cutoff_ts = _time.time() - window_hours * 3600

    # 1. Verdict count + fallback breakdown — drives the "Verdicts:" and
    # "Fallback:" lines. Pulled in one aggregation to halve the round trips.
    try:
        rows = await db.analyses.aggregate([
            {"$match": {"created_at": {"$gte": cutoff_iso}}},
            {"$group": {"_id": "$llm_provider", "n": {"$sum": 1}}},
        ]).to_list(length=50)
        by_provider = {(r["_id"] or "unknown"): r["n"] for r in rows}
        total = sum(by_provider.values())
        metrics["verdicts"] = total
        if total > 0:
            fb = sum(n for p, n in by_provider.items() if p not in ("openrouter", None, "unknown"))
            metrics["fallback_rate_pct"] = round(100 * fb / total, 1)
            # Find the top fallback provider (excluding the primary). If
            # nothing fell back, leave None — the message hides the line.
            fb_only = {p: n for p, n in by_provider.items() if p not in ("anthropic", None, "unknown")}
            if fb_only:
                top = max(fb_only.items(), key=lambda kv: kv[1])
                metrics["fallback_top_provider"] = f"{top[0]} ×{top[1]}"
    except Exception as e:
        logger.warning("admin_digest: analyses aggregation failed: %s", e)

    # 2. Wizard 30s-goal — pull `wizard_opened` + `wizard_step2_complete`
    # events from telemetry, group by session, count those with elapsed
    # ≤30s. Same logic as the admin endpoint but compressed.
    try:
        cursor = db.telemetry_events.find(
            {"ts": {"$gte": cutoff_ts},
             "event": {"$in": ["wizard_opened", "wizard_step2_complete"]}},
            {"_id": 0, "event": 1, "ts": 1, "session_id": 1, "anonymous_id": 1},
        )
        sessions: dict[str, dict] = {}
        async for ev in cursor:
            sid = ev.get("session_id") or ev.get("anonymous_id")
            if not sid:
                continue
            bucket = sessions.setdefault(sid, {})
            prev = bucket.get(ev["event"])
            if prev is None or ev["ts"] < prev:
                bucket[ev["event"]] = ev["ts"]
        elapsed = []
        for s in sessions.values():
            o = s.get("wizard_opened")
            v = s.get("wizard_step2_complete")
            if o and v and v >= o:
                elapsed.append(v - o)
        if elapsed:
            metrics["thirty_second_goal_n"] = len(elapsed)
            metrics["thirty_second_goal_pct"] = round(
                100 * sum(1 for e in elapsed if e <= 30.0) / len(elapsed), 1,
            )
    except Exception as e:
        logger.warning("admin_digest: telemetry aggregation failed: %s", e)

    # 3. Top failure-reason from llm_events — most common reason on
    # failure rows in the window.
    try:
        rows = await db.llm_events.aggregate([
            {"$match": {
                "ts": {"$gte": cutoff_ts},
                "kind": "provider_attempt",
                "outcome": "failure",
            }},
            {"$group": {"_id": "$reason", "n": {"$sum": 1}}},
            {"$sort": {"n": -1}},
            {"$limit": 1},
        ]).to_list(length=1)
        if rows:
            r = rows[0]
            # Reason is stored like "transient:ChatError" or "hard_error:..."
            # — strip the prefix for a cleaner one-line summary.
            label = (r["_id"] or "unknown").split(":", 1)[-1]
            metrics["top_failure_reason"] = f"{label} ×{r['n']}"
    except Exception as e:
        logger.warning("admin_digest: llm_events aggregation failed: %s", e)

    # 4. Universal Key remaining credits — pulled from the same
    # anchor-projection logic the admin cost panel uses, so the digest
    # number agrees with what the admin sees in the UI.
    try:
        from services.cost_reminder import _compute_projection
        proj = await _compute_projection()
        if proj and proj.get("remaining_credits") is not None:
            metrics["universal_key_balance"] = round(float(proj["remaining_credits"]), 2)
    except Exception as e:
        logger.warning("admin_digest: balance fetch failed: %s", e)

    return metrics


def _format_digest(metrics: dict) -> str:
    """Render the digest as a single Telegram-HTML message. Lines that
    correspond to missing data are omitted so the message stays terse
    instead of showing a wall of "—"."""
    # Label the digest with yesterday's date in SGT (UTC+8) so the
    # reader doesn't have to time-zone math at 9am.
    sgt_now = datetime.now(timezone.utc) + timedelta(hours=8)
    yesterday = (sgt_now - timedelta(hours=24)).strftime("%b %-d")  # "Apr 30"

    lines: List[str] = [f"<b>Admin ops digest — {yesterday}</b>", ""]

    if metrics.get("verdicts") is not None:
        lines.append(f"📊 <b>Verdicts</b>: {metrics['verdicts']}")
    if metrics.get("thirty_second_goal_pct") is not None:
        lines.append(
            f"⚡ <b>30s-goal</b>: {metrics['thirty_second_goal_pct']}% "
            f"(n={metrics['thirty_second_goal_n']})"
        )
    fb = metrics.get("fallback_rate_pct")
    if fb is not None:
        if metrics.get("fallback_top_provider"):
            lines.append(f"🔁 <b>Fallback</b>: {fb}% ({metrics['fallback_top_provider']})")
        else:
            lines.append(f"🔁 <b>Fallback</b>: {fb}%")
    if metrics.get("top_failure_reason"):
        lines.append(f"⚠️ <b>Top failure</b>: {metrics['top_failure_reason']}")
    if metrics.get("universal_key_balance") is not None:
        lines.append(f"🧠 <b>Universal Key</b>: {metrics['universal_key_balance']}")

    lines.append("")
    lines.append(
        "<i>Open </i><a href=\"https://stock.neulab.xyz/admin\"><i>admin panel</i></a> for details."
        
    )
    return "\n".join(lines)


# Lazy-loaded public app URL (so the digest links land on the live
# domain in the deployed env, fall back to a relative path locally).
import os as _os
_PUBLIC_APP_URL = _os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
def _get_public_app_url() -> str:
    return _PUBLIC_APP_URL


async def _eligible_admins() -> List[dict]:
    """Return admin users who have a linked Telegram chat AND are inside
    the cooldown-met window. Hard-gates on `ADMIN_EMAILS` — non-admin
    users with the field set in their doc would be rejected here."""
    cutoff_iso = iso(now_utc() - timedelta(hours=COOLDOWN_HOURS))
    if not ADMIN_EMAILS:
        return []
    cursor = db.users.find(
        {
            "email": {"$in": list(ADMIN_EMAILS)},
            "telegram_chat_id": {"$exists": True, "$nin": [None, ""]},
            "$or": [
                {"admin_digest_last_run_at": {"$exists": False}},
                {"admin_digest_last_run_at": None},
                {"admin_digest_last_run_at": {"$lt": cutoff_iso}},
            ],
        },
        {"_id": 0, "id": 1, "email": 1, "telegram_chat_id": 1},
    )
    return await cursor.to_list(length=20)


async def run_admin_digest_once(force: bool = False) -> dict:
    """Send the digest to every eligible admin. Used by the loop AND
    a manual trigger endpoint for testing. `force=True` skips the
    cooldown so admins can preview the digest on demand."""
    if not _tg_configured():
        return {"sent": 0, "skipped_reason": "telegram_not_configured"}

    if force:
        admins = []
        if ADMIN_EMAILS:
            cursor = db.users.find(
                {"email": {"$in": list(ADMIN_EMAILS)},
                 "telegram_chat_id": {"$exists": True, "$nin": [None, ""]}},
                {"_id": 0, "id": 1, "email": 1, "telegram_chat_id": 1},
            )
            admins = await cursor.to_list(length=20)
    else:
        admins = await _eligible_admins()

    if not admins:
        return {"sent": 0, "skipped_reason": "no_eligible_admins"}

    metrics = await _aggregate_admin_metrics()
    # Materialise PUBLIC_APP_URL once so the formatter can use it.
    _get_public_app_url()
    body = _format_digest(metrics)

    sent = 0
    for u in admins:
        chat_id = u.get("telegram_chat_id")
        if not chat_id:
            continue
        ok = await _send_message(chat_id, body)
        if ok:
            sent += 1
            await db.users.update_one(
                {"id": u["id"]},
                {"$set": {"admin_digest_last_run_at": iso(now_utc())}},
            )
        else:
            logger.warning("admin_digest: send failed for %s", u.get("email"))

    return {"sent": sent, "metrics": metrics}


async def admin_digest_loop():
    """Background coroutine — wake hourly, fire at DIGEST_HOUR_UTC. The
    cooldown gate inside `run_admin_digest_once` keeps this idempotent."""
    logger.info("admin_digest_loop started (fires daily at %02d:00 UTC)", DIGEST_HOUR_UTC)
    while True:
        try:
            now = datetime.now(timezone.utc)
            if now.hour == DIGEST_HOUR_UTC:
                result = await run_admin_digest_once()
                if result.get("sent", 0) > 0:
                    logger.info("admin_digest: sent to %d admin(s)", result["sent"])
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("admin_digest_loop: iteration failed: %s", e)
        await asyncio.sleep(LOOP_SLEEP_SECONDS)
