"""Weekly RF Digest — "Sunday evening recap".

Scans every opt-in user's watchlist once a week and emails a digest of
the top-N RF-ranked outperform/underperform-vs-SPY edges. Reuses the
Random-Forest scoring pipeline from `services.auto_scan`, but delivers
via email instead of Telegram — so it works for Free users (no Telegram
link required).

Free tier sees top 3 signals fully, top 4-5 blurred with an upgrade CTA
to Auto-Scan (Pro/Elite) for real-time Telegram pushes instead of once
a week.

Cadence: Sunday 22-24 UTC (= 6-8pm ET depending on DST). Each user is
scanned at most once per 150 hours (roughly weekly) — robust to restarts.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from core.db import db
from core.security import iso, now_utc
from services import rf_predictor
from services.auto_scan import _fetch_history, _fetch_market_context
from services.email import send_weekly_digest_email
from services.features import feature_row_for_today

logger = logging.getLogger(__name__)

# Minimum edge to include a ticker in the digest. 0.10 is looser than
# auto-scan's 0.15 because the digest is meant to surface the *best of
# what you have* — even if nothing is screaming. Users can still see
# "No strong edges this week" when the whole watchlist is ambiguous.
MIN_EDGE_FOR_DIGEST = 0.10

# Free users see top 3 signals; Pro/Elite/Daypass/Admin see top 5.
FREE_TOP_N = 3
PRO_TOP_N = 5

# Scheduler cadence: loop wakes every 6h, but each user gated by "last
# digest > N hours ago" so digest is roughly weekly with some slack.
LOOP_CHECK_INTERVAL_S = 6 * 3600
MIN_HOURS_BETWEEN_DIGESTS = 150  # ~6.25 days


async def _rank_user_watchlist(user_id: str, market_df: dict) -> list[dict]:
    """Score every ticker on the user's watchlist and return a ranked
    list sorted by edge strength descending. Only keeps tickers that
    clear `MIN_EDGE_FOR_DIGEST`."""
    watch_rows = await db.watchlist.find({"user_id": user_id}, {"_id": 0, "ticker": 1}).to_list(100)
    tickers = [r["ticker"].upper() for r in watch_rows if r.get("ticker")]
    if not tickers:
        return []

    signals: list[dict] = []
    for ticker in tickers:
        df = await _fetch_history(ticker)
        if df is None:
            continue
        feat = feature_row_for_today(df, market_df=market_df)
        if feat is None:
            continue
        opinion = rf_predictor.predict_from_features(feat)
        if opinion is None:
            continue
        prob_outperform = float(opinion["prob_outperform"])
        edge = abs(prob_outperform - 0.5)
        if edge < MIN_EDGE_FOR_DIGEST:
            continue

        try:
            last_close = float(df["Close"].iloc[-1])
        except Exception:
            last_close = None

        signals.append({
            "ticker": ticker,
            # NOTE: this is a relative-outperformance-vs-SPY call, not an
            # absolute BUY/SELL recommendation — deliberately NOT reusing
            # "BUY"/"SELL" labels here (see rf_predictor.py) since a stock
            # can be "likely to outperform" while still expected to fall
            # in absolute terms during a broad selloff. The digest copy
            # that renders this field must say "outperform"/"underperform",
            # not "buy"/"sell".
            "relative_direction": "outperform" if prob_outperform >= 0.5 else "underperform",
            "prob_outperform": prob_outperform,
            "edge_pct": round(edge * 100, 1),
            "confidence_pct": round((prob_outperform if prob_outperform >= 0.5 else (1 - prob_outperform)) * 100),
            "last_close": last_close,
            "horizon_days": opinion.get("horizon_days", 20),
        })

    # Strongest edges first — those are the most worth reading on a Sunday.
    signals.sort(key=lambda s: s["edge_pct"], reverse=True)
    return signals


async def _send_digest_for_user(user: dict, market_df: dict) -> bool:
    """Compute digest for one user and email it. Returns True on send."""
    from core.config import ADMIN_EMAILS
    user_id = user["id"]
    plan = user.get("plan", "free")
    # `is_admin` not persisted in DB — derive from email allow-list.
    is_admin = (user.get("email") or "").lower() in ADMIN_EMAILS
    is_paid = plan in ("pro", "elite", "daypass") or is_admin

    signals = await _rank_user_watchlist(user_id, market_df)
    top_n = PRO_TOP_N if is_paid else FREE_TOP_N
    top_signals = signals[:top_n]

    # Optional "locked" preview slots — for Free users, show that 2 more
    # edges exist but are gated behind upgrade.
    locked_count = 0
    if not is_paid and len(signals) > FREE_TOP_N:
        locked_count = min(len(signals) - FREE_TOP_N, PRO_TOP_N - FREE_TOP_N)

    try:
        ok = await send_weekly_digest_email(
            to_email=user["email"],
            full_name=user.get("full_name") or user.get("email", "").split("@")[0],
            signals=top_signals,
            locked_count=locked_count,
            is_paid=is_paid,
            plan=plan,
        )
    except Exception as e:
        logger.warning("weekly_digest: send failed for %s: %s", user.get("email"), e)
        ok = False

    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "weekly_digest_last_run_at": iso(now_utc()),
            "weekly_digest_last_signal_count": len(top_signals),
        }},
    )
    return ok


async def run_weekly_digest_batch() -> dict:
    """One pass across all opt-in users. Safe to call more than once per
    day — the per-user cooldown gates actual sends."""
    if not rf_predictor.is_available():
        logger.info("weekly_digest: RF model not loaded — skipping batch")
        return {"ok": False, "reason": "rf_not_loaded"}

    cutoff = now_utc() - timedelta(hours=MIN_HOURS_BETWEEN_DIGESTS)
    cutoff_iso = iso(cutoff)

    cursor = db.users.find(
        {"weekly_digest_enabled": True, "email": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "email": 1, "full_name": 1, "plan": 1,
         "weekly_digest_last_run_at": 1},
    )
    candidates = await cursor.to_list(5000)
    due = [
        u for u in candidates
        if not u.get("weekly_digest_last_run_at") or u["weekly_digest_last_run_at"] < cutoff_iso
    ]
    if not due:
        logger.info("weekly_digest: 0 users due")
        return {"ok": True, "users_due": 0, "emails_sent": 0}

    logger.info("weekly_digest: %d users due", len(due))
    market_df = await _fetch_market_context()
    sent = 0
    for u in due:
        try:
            if await _send_digest_for_user(u, market_df):
                sent += 1
        except Exception as e:
            logger.warning("weekly_digest: user %s failed: %s", u.get("email", "?"), e)
    logger.info("weekly_digest: finished — %d users, %d emails sent", len(due), sent)
    return {"ok": True, "users_due": len(due), "emails_sent": sent}


# ─── Background loop ────────────────────────────────────────────────────
async def weekly_digest_loop():
    """Runs forever. Fires Sundays 22-24 UTC (≈ 5-7pm ET). Per-user
    150h cooldown prevents double-sends even if the loop wakes more
    than once in the window."""
    await asyncio.sleep(150)  # post-boot settle
    while True:
        try:
            now = datetime.now(timezone.utc)
            # weekday(): Monday=0 ... Sunday=6. Send Sunday evening UTC.
            if now.weekday() == 6 and 22 <= now.hour <= 23:
                await run_weekly_digest_batch()
        except Exception as e:
            logger.warning("weekly_digest_loop iteration failed: %s", e)
        await asyncio.sleep(LOOP_CHECK_INTERVAL_S)
