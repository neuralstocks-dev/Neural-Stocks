"""Watchlist Auto-Scan — Option C ("RF pre-filter + Telegram").

Runs once daily at 09:45 ET market open. For each Pro/Elite user who has
enabled `auto_scan` in settings and linked a Telegram chat, walks their
watchlist and computes the Random-Forest P(up) signal on each ticker.

Only fires a Telegram push when the model shows **strong** edge
(|P − 0.5| > 0.15 — the same threshold used elsewhere in the app). No
LLM LLM call, no candlestick scan, no executive summary. This is
intentionally narrower than clicking "Analyze" — the user is told this
clearly in the alert body and in the Settings toggle.

Cost profile at 100 Pro users × 20 tickers average watchlist:
  * LLM calls: 0
  * yfinance pulls: 2,000/day (cached + batched) ~ 30 seconds wall-time
  * RF inference: 2,000 × ~1 ms = 2 seconds
  * Telegram sends: ~100-200 (only strong-edge tickers)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import yfinance as yf

from core.db import db
from core.security import iso, now_utc
from services import rf_predictor
from services.features import feature_row_for_today
from services.telegram import send_alert_to_user

logger = logging.getLogger(__name__)

# Only surface alerts with clear model conviction. 0.65 / 0.35 aligns with
# rf_predictor._EDGE_STRONG_HALFWIDTH = 0.15 (|p - 0.5| > 0.15).
BULL_THRESHOLD = 0.65
BEAR_THRESHOLD = 0.35

# Interval for the scheduler loop — run every 4 hours; actual scan only
# fires when the "has this user been scanned in the last 20 hours?" check
# passes. Makes the loop robust to backend restarts / deploys.
LOOP_CHECK_INTERVAL_S = 4 * 3600

# Gate users who haven't been scanned in the last N hours. 20h instead of
# exactly 24h so a small drift in restart timing doesn't skip a day.
MIN_HOURS_BETWEEN_SCANS = 20


async def _fetch_history(ticker: str) -> dict | None:
    """Pull 12 months of daily OHLCV for RF feature computation. Returns
    None if yfinance has no data (delisted, wrong symbol, etc.)."""
    try:
        df = await asyncio.to_thread(
            lambda: yf.Ticker(ticker).history(period="1y", interval="1d", auto_adjust=True),
        )
        if df is None or df.empty or len(df) < 60:
            return None
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        return df
    except Exception as e:
        logger.warning("auto_scan: yfinance %s failed: %s", ticker, e)
        return None


async def _fetch_market_context() -> dict:
    """Once-per-scan SPY + VIX pull. Cached across the full user sweep."""
    out = {}
    for key, tk in (("spy", "SPY"), ("vix", "^VIX")):
        try:
            df = await asyncio.to_thread(
                lambda t=tk: yf.Ticker(t).history(period="1y", interval="1d", auto_adjust=True),
            )
            if df is not None and not df.empty:
                if df.index.tz is not None:
                    df.index = df.index.tz_localize(None)
                out[key] = df
        except Exception as e:
            logger.warning("auto_scan: market ctx %s failed: %s", tk, e)
    return out


async def _scan_user(user: dict, market_df: dict) -> int:
    """Scan a single user's watchlist. Returns the number of alerts sent."""
    user_id = user["id"]
    watch_rows = await db.watchlist.find({"user_id": user_id}, {"_id": 0, "ticker": 1}).to_list(100)
    tickers = [r["ticker"].upper() for r in watch_rows if r.get("ticker")]
    if not tickers:
        return 0

    sent = 0
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
        prob_up = opinion["prob_up"]
        if opinion["edge"] != "strong":
            continue  # insufficient model conviction — stay quiet

        direction = "BUY" if prob_up >= BULL_THRESHOLD else ("SELL" if prob_up <= BEAR_THRESHOLD else None)
        if direction is None:
            continue

        # Look up last close so the user has concrete context
        try:
            last_close = float(df["Close"].iloc[-1])
        except Exception:
            last_close = None
        price_line = f" · last close {last_close:.2f}" if last_close else ""
        horizon = opinion.get("horizon_days", 20)
        acc = opinion.get("model_info", {}).get("holdout_accuracy")
        acc_line = f" · model hist. accuracy {round((acc or 0)*100)}%" if acc else ""

        # Educational framing — RF model is a research signal, not a trade
        # instruction. We keep the BUY/SELL "direction" string for routing
        # and color but describe it as analytical bias in the user-facing copy.
        bias_word = {"BUY": "Bullish", "SELL": "Bearish"}.get(direction, "Neutral")
        title = f"RF watchlist scan · {bias_word} bias · {ticker} · {round(prob_up*100)}% model probability"
        body = (
            f"The Random-Forest model classifies {ticker}{price_line} with a "
            f"{bias_word.lower()} analytical bias over a {horizon}-day horizon "
            f"(model probability {round(prob_up*100)}%).\n\n"
            f"⚠️ This is a lightweight RF-only scan — NOT a full Neural Stock Intelligence™ research "
            f"summary. No LLM reasoning, no candlestick verification, no "
            f"scenario levels. Open the app and tap Analyze on {ticker} for the "
            f"full multi-lens research view before drawing conclusions.\n"
            f"Mode: Auto-scan (RF only){acc_line}\n\n"
            f"<i>Educational research output — model probability is classification "
            f"strength based on the inputs, not a forecast probability. Not "
            f"personalized financial advice.</i>"
        )

        # Create dashboard alert (type="rf_watchlist_scan" so UI can label clearly)
        from uuid import uuid4
        await db.alerts.insert_one({
            "id": str(uuid4()),
            "user_id": user_id,
            "ticker": ticker,
            "type": "rf_watchlist_scan",
            "signal": direction,
            "prob_up": prob_up,
            "confidence_score": round(prob_up * 100) if direction == "BUY" else round((1 - prob_up) * 100),
            "title": title,
            "message": body,
            "read": False,
            "created_at": iso(now_utc()),
        })
        # Fire Telegram push (best-effort, gated by user prefs).
        # Filter rule: respect `telegram_alert_types`. Default = all types.
        # Schedule rule: per-channel realtime/digest_daily/digest_weekly.
        try:
            user_doc = await db.users.find_one(
                {"id": user_id},
                {"_id": 0, "telegram_alert_types": 1, "telegram_alert_schedule": 1, "telegram_quiet_hours": 1},
            ) or {}
            allowed_types = user_doc.get("telegram_alert_types")
            if allowed_types is None or "rf_watchlist_scan" in allowed_types:
                from routers.telegram import _hydrate_schedule, _hydrate_quiet_hours, is_in_quiet_hours
                from services.digest_pusher import queue_alert
                schedule = _hydrate_schedule(user_doc.get("telegram_alert_schedule")).get("rf_watchlist_scan", "realtime")
                qh = _hydrate_quiet_hours(user_doc.get("telegram_quiet_hours"))
                if schedule == "realtime" and not is_in_quiet_hours(qh):
                    await send_alert_to_user(user_id, title, body, ticker=ticker)
                else:
                    await queue_alert(user_id, "rf_watchlist_scan", ticker=ticker, title=title, body=body)
        except Exception as e:
            logger.warning("auto_scan: telegram send failed for user %s: %s", user_id, e)
        sent += 1

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"auto_scan_last_run_at": iso(now_utc()), "auto_scan_last_alerts_sent": sent}},
    )
    return sent


async def run_auto_scan_batch() -> dict:
    """Single pass across all eligible users. Returns a summary dict."""
    if not rf_predictor.is_available():
        logger.info("auto_scan: RF model not loaded — skipping batch")
        return {"ok": False, "reason": "rf_not_loaded"}

    cutoff = now_utc() - timedelta(hours=MIN_HOURS_BETWEEN_SCANS)
    cutoff_iso = iso(cutoff)

    # Candidate users: auto_scan enabled + telegram linked + Pro/Elite/Admin
    # `is_admin` isn't persisted in the DB, so we filter in Python by email
    # against the ADMIN_EMAILS allow-list rather than relying on a DB field.
    from core.config import ADMIN_EMAILS
    cursor = db.users.find(
        {
            "auto_scan_enabled": True,
            "telegram_chat_id": {"$exists": True, "$ne": None},
            "$or": [
                {"plan": {"$in": ["pro", "elite", "daypass"]}},
                {"email": {"$in": list(ADMIN_EMAILS)}},
            ],
        },
        {"_id": 0, "id": 1, "email": 1, "plan": 1, "auto_scan_last_run_at": 1},
    )
    candidates = await cursor.to_list(500)
    # Filter in Python for the "last run > MIN_HOURS_BETWEEN_SCANS ago" check
    due = [
        u for u in candidates
        if not u.get("auto_scan_last_run_at") or u["auto_scan_last_run_at"] < cutoff_iso
    ]
    if not due:
        logger.info("auto_scan: 0 users due for scan")
        return {"ok": True, "users_due": 0, "alerts_sent": 0}

    logger.info("auto_scan: %d users due", len(due))
    market_df = await _fetch_market_context()
    total_alerts = 0
    for u in due:
        try:
            sent = await _scan_user(u, market_df)
            total_alerts += sent
        except Exception as e:
            logger.warning("auto_scan: user %s failed: %s", u.get("email", "?"), e)
    logger.info("auto_scan: finished — %d users, %d alerts sent", len(due), total_alerts)
    return {"ok": True, "users_due": len(due), "alerts_sent": total_alerts}


# ─── Background loop ────────────────────────────────────────────────────
async def auto_scan_loop():
    """Runs forever. Wakes every 4h and runs a batch — `_scan_user` itself
    is gated by `auto_scan_last_run_at` so each user is scanned once per
    ~24h regardless of loop frequency."""
    await asyncio.sleep(120)  # let the app settle after boot
    while True:
        try:
            # Only run during "user-friendly" alert hours (09–22 UTC
            # covers most of the US/EU/Asian active windows). This avoids
            # buzzing phones at 3am for daily batches.
            hour = datetime.now(timezone.utc).hour
            if 9 <= hour <= 22:
                await run_auto_scan_batch()
        except Exception as e:
            logger.warning("auto_scan_loop iteration failed: %s", e)
        await asyncio.sleep(LOOP_CHECK_INTERVAL_S)
