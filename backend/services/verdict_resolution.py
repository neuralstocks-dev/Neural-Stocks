"""Verdict resolution — permanently grades a verdict's outcome once its
stated time horizon has elapsed, and never recomputes it again.

WHY THIS EXISTS
----------------
The original scorecard (backend/routers/scorecard.py, pre-this-change)
compared price_at_analysis to the CURRENT live price on every request,
using a fixed minimum-age filter (7/30/90 days) as a stand-in for the
verdict's actual horizon. Two problems with that:

  1. It ignores `time_horizon_weeks`, which the LLM sets per-verdict
     (2-12 weeks depending on mode/gates). A verdict issued with a
     2-week horizon and one issued with a 12-week horizon were both
     graded against the same generic day-count buckets.
  2. Because it always re-reads the LIVE price, the same verdict's
     hit/miss status changes every time the page loads — a verdict
     graded "hit" today can flip to "miss" tomorrow, forever. That's
     not a measurement, it's a snapshot of market drift with a
     timestamp attached. It can never be trusted as a track record.

This module fixes both: once `now >= created_at + time_horizon_weeks`,
we fetch the price ONE time, compute hit/miss against that price, and
write it into an immutable `resolution` sub-document on the analysis.
From that point on, the scorecard reads `resolution` directly — no
live price fetch, no drift, no recomputation. A resolved verdict's
grade is permanent, exactly like a real forecast being checked against
what actually happened at the deadline.

Verdicts that haven't reached their horizon yet are left alone (still
"pending" — this is correct, not a bug). Verdicts whose ticker/price
can't be resolved (delisted, bad quote) are marked `unresolvable` so
they stop being retried forever.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.db import db
from services.yfinance_svc import get_quote

logger = logging.getLogger(__name__)

# How often the loop wakes up to look for newly-due verdicts. Resolution
# isn't time-critical to the minute — once daily would honestly suffice —
# but checking more often means a verdict shows as resolved on the
# scorecard shortly after its horizon passes rather than up to a day late.
LOOP_CHECK_INTERVAL_S = 3600  # 1 hour

# Same threshold the old scorecard used for BUY/SELL/HOLD grading. Kept
# here (not imported from scorecard.py) because resolution is the
# source of truth now; scorecard.py imports IT, not the other way round.
HIT_THRESHOLD_PCT = 5.0

# Batch size per loop iteration — avoids loading thousands of docs into
# memory at once if resolution has been down for a while and a backlog
# built up (e.g. after a deploy gap).
BATCH_SIZE = 200


def _parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        d = datetime.fromisoformat(dt_str)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def _horizon_due_at(analysis: dict) -> Optional[datetime]:
    """When does this verdict's horizon elapse? Falls back to 1 week for
    older documents created before time_horizon_weeks was populated —
    matches the scorecard's old DEFAULT_MIN_AGE_DAYS=7 assumption so we
    don't silently change grading behaviour for historical verdicts."""
    created = _parse_iso(analysis.get("created_at"))
    if not created:
        return None
    weeks = analysis.get("time_horizon_weeks")
    if not isinstance(weeks, (int, float)) or weeks <= 0:
        weeks = 1  # ~7 days, matches prior default
    return created + timedelta(weeks=weeks)


def _grade(recommendation: Optional[str], change_pct: float) -> str:
    rec = (recommendation or "").upper()
    if rec == "BUY":
        return "hit" if change_pct >= HIT_THRESHOLD_PCT else "miss"
    if rec == "SELL":
        return "hit" if change_pct <= -HIT_THRESHOLD_PCT else "miss"
    if rec == "HOLD":
        return "hit" if abs(change_pct) <= HIT_THRESHOLD_PCT else "miss"
    return "unresolvable"


async def resolve_due_verdicts() -> dict:
    """Find analyses whose horizon has elapsed and aren't resolved yet,
    grade them against a ONE-TIME price fetch, and persist the grade.
    Returns a small summary dict for logging/testing."""
    now = datetime.now(timezone.utc)

    # Candidate set: no `resolution` field yet, has a recommendation to
    # grade, and is old enough that even the shortest possible horizon
    # (2 weeks) could plausibly have elapsed — cheap pre-filter before
    # we do the more precise per-doc horizon check in Python.
    cutoff = now - timedelta(weeks=2)
    cursor = db.analyses.find(
        {
            "resolution": {"$exists": False},
            "recommendation": {"$exists": True},
            "created_at": {"$lte": cutoff.isoformat()},
        },
        {"_id": 0, "id": 1, "ticker": 1, "created_at": 1, "time_horizon_weeks": 1,
         "recommendation": 1, "price_at_analysis": 1},
    ).limit(BATCH_SIZE)

    candidates = await cursor.to_list(BATCH_SIZE)
    due = [a for a in candidates if (_horizon_due_at(a) or now) <= now]

    if not due:
        return {"checked": len(candidates), "resolved": 0, "unresolvable": 0}

    tickers = list({a["ticker"] for a in due if a.get("ticker")})
    quotes = await asyncio.gather(
        *[get_quote(t) for t in tickers], return_exceptions=True
    )
    price_by_ticker = {}
    for t, q in zip(tickers, quotes):
        if isinstance(q, dict) and isinstance(q.get("price"), (int, float)):
            price_by_ticker[t] = q["price"]

    resolved_count = 0
    unresolvable_count = 0

    for a in due:
        ticker = a.get("ticker")
        p0 = a.get("price_at_analysis")
        p1 = price_by_ticker.get(ticker)
        due_at = _horizon_due_at(a)

        if not p0 or not p1 or not isinstance(p0, (int, float)):
            # Can't grade — write a terminal unresolvable marker so this
            # doc stops being re-fetched every hour forever. Distinct
            # from "pending" (not due yet) — this is "due but unscoreable".
            await db.analyses.update_one(
                {"id": a["id"]},
                {"$set": {"resolution": {
                    "status": "unresolvable",
                    "reason": "missing_price" if not p1 else "missing_entry_price",
                    "resolved_at": now.isoformat(),
                    "horizon_due_at": due_at.isoformat() if due_at else None,
                }}},
            )
            unresolvable_count += 1
            continue

        change_pct = round(((p1 - p0) / p0) * 100, 2)
        status = _grade(a.get("recommendation"), change_pct)

        await db.analyses.update_one(
            {"id": a["id"]},
            {"$set": {"resolution": {
                "status": status,               # "hit" | "miss"
                "resolution_price": p1,
                "return_pct": change_pct,
                "resolved_at": now.isoformat(),
                "horizon_due_at": due_at.isoformat() if due_at else None,
                "threshold_pct": HIT_THRESHOLD_PCT,
            }}},
        )
        resolved_count += 1

    logger.info(
        "Verdict resolution: checked=%d resolved=%d unresolvable=%d",
        len(candidates), resolved_count, unresolvable_count,
    )
    return {
        "checked": len(candidates),
        "resolved": resolved_count,
        "unresolvable": unresolvable_count,
    }


async def verdict_resolution_loop():
    """Background task registered at startup in server.py, matching the
    pattern used by rf_retrain/auto_scan/weekly_digest etc. Runs forever,
    sleeping LOOP_CHECK_INTERVAL_S between passes. Never lets one bad
    batch kill the loop — logs and continues."""
    # Small initial delay so this doesn't compete with other startup
    # tasks (DB indexes, RF model load) for the first few seconds.
    await asyncio.sleep(30)
    while True:
        try:
            await resolve_due_verdicts()
        except Exception as e:
            logger.warning("verdict_resolution_loop iteration failed: %s", e)
        await asyncio.sleep(LOOP_CHECK_INTERVAL_S)
