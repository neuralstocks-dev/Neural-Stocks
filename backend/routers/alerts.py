"""Smart Alert Triage — consolidated inbox + scoreboard.

Takes the `db.alerts` collection (populated by analysis signals, pattern
scans, and the RF auto-scan) and adds three dimensions on top:

1. **Triage actions** — star / archive / mark-as-taken — so users can
   curate a scoreboard of signals they actually acted on.
2. **Win-rate tracking** — for every "taken" alert, we snapshot the
   entry price on action and, after `RESOLVE_HORIZON_DAYS` (20 calendar
   days), look up the close and classify as win/loss/break-even.
3. **Per-type aggregation** — running KPIs grouped by alert `type`
   (signal / pattern / rf_watchlist_scan) so users can see which
   channel of the platform has been most profitable for them.

Routes are mounted under `/api/alerts`.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import db
from core.security import get_current_user, iso, now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])

# Trading window we wait before classifying a taken alert as win/loss.
# 20 calendar days mirrors the default RF horizon_days — same budget we
# ask the model to predict over.
RESOLVE_HORIZON_DAYS = 20

# Below this |P&L| we call it a break-even instead of win/loss — avoids
# classifying dust moves as "hits".
BREAK_EVEN_BAND_PCT = 0.5


async def _get_last_close(ticker: str) -> Optional[float]:
    """Fetch last daily close for a ticker. Returns None on failure."""
    try:
        df = await asyncio.to_thread(
            lambda: yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=True)
        )
        if df is None or df.empty:
            return None
        return float(df["Close"].iloc[-1])
    except Exception as e:
        logger.warning("alerts: yfinance %s close lookup failed: %s", ticker, e)
        return None


async def _resolve_pending(user_id: str) -> int:
    """For each taken-but-unresolved alert older than the horizon,
    compute P&L, classify, and persist. Returns count resolved. Safe to
    call on every stats fetch — limited to 50 per call for sanity."""
    cutoff = now_utc() - timedelta(days=RESOLVE_HORIZON_DAYS)
    cutoff_iso = iso(cutoff)
    pending = await db.alerts.find(
        {
            "user_id": user_id,
            "taken": True,
            "outcome": None,
            "taken_at": {"$lte": cutoff_iso},
            "entry_price": {"$ne": None},
        },
        {"_id": 0},
    ).to_list(50)
    if not pending:
        return 0
    resolved = 0
    for a in pending:
        exit_price = await _get_last_close(a["ticker"])
        entry = a.get("entry_price")
        if exit_price is None or not entry:
            continue
        pnl_pct = ((exit_price - entry) / entry) * 100.0
        # Short: profit if price fell
        if a.get("signal") == "SELL":
            pnl_pct = -pnl_pct
        if abs(pnl_pct) < BREAK_EVEN_BAND_PCT:
            outcome = "break_even"
        elif pnl_pct > 0:
            outcome = "win"
        else:
            outcome = "loss"
        await db.alerts.update_one(
            {"id": a["id"], "user_id": user_id},
            {"$set": {
                "outcome": outcome,
                "outcome_resolved_at": iso(now_utc()),
                "outcome_pnl_pct": round(pnl_pct, 2),
                "exit_price": round(exit_price, 2),
            }},
        )
        resolved += 1
    return resolved


# ─── Listing + basic actions ────────────────────────────────────────────
@router.get("")
async def list_alerts(
    user=Depends(get_current_user),
    filter: str = Query("all", pattern="^(all|unread|starred|taken|archived)$"),
    limit: int = Query(200, ge=1, le=500),
):
    """Return the user's alerts, filtered by the `filter` query param.

    * `all` — everything except archived (default inbox)
    * `unread` — unread AND not archived
    * `starred` — explicitly starred
    * `taken` — marked as acted upon (the scoreboard tab)
    * `archived` — archive bin
    """
    q: dict = {"user_id": user["id"]}
    if filter == "unread":
        q["read"] = {"$ne": True}
        q["archived"] = {"$ne": True}
    elif filter == "starred":
        q["starred"] = True
    elif filter == "taken":
        q["taken"] = True
    elif filter == "archived":
        q["archived"] = True
    else:  # all
        q["archived"] = {"$ne": True}
    return (
        await db.alerts.find(q, {"_id": 0})
        .sort("created_at", -1)
        .to_list(limit)
    )


@router.post("/{alert_id}/read")
async def mark_read(alert_id: str, user=Depends(get_current_user)):
    r = await db.alerts.update_one(
        {"id": alert_id, "user_id": user["id"]},
        {"$set": {"read": True}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@router.post("/read_all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.alerts.update_many(
        {"user_id": user["id"]},
        {"$set": {"read": True}},
    )
    return {"ok": True}


# ─── Triage actions ─────────────────────────────────────────────────────
@router.post("/{alert_id}/star")
async def star_alert(alert_id: str, payload: dict, user=Depends(get_current_user)):
    starred = bool(payload.get("starred"))
    r = await db.alerts.update_one(
        {"id": alert_id, "user_id": user["id"]},
        {"$set": {"starred": starred}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True, "starred": starred}


@router.post("/{alert_id}/archive")
async def archive_alert(alert_id: str, payload: dict, user=Depends(get_current_user)):
    archived = bool(payload.get("archived"))
    update: dict = {"archived": archived}
    if archived:
        update["read"] = True  # archiving implies acknowledgment
    r = await db.alerts.update_one(
        {"id": alert_id, "user_id": user["id"]},
        {"$set": update},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True, "archived": archived}


@router.post("/{alert_id}/taken")
async def mark_taken(alert_id: str, payload: dict, user=Depends(get_current_user)):
    """User is telling us they acted on this signal. Snapshots `entry_price`
    from the current yfinance close so we can compute win/loss later.

    `{taken: false}` un-marks (clears all outcome fields)."""
    want_taken = bool(payload.get("taken", True))
    alert = await db.alerts.find_one(
        {"id": alert_id, "user_id": user["id"]},
        {"_id": 0},
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if want_taken and alert.get("signal") not in ("BUY", "SELL"):
        raise HTTPException(
            status_code=400,
            detail="Only BUY or SELL alerts can be marked as taken (HOLD has no directional P&L).",
        )
    if not want_taken:
        await db.alerts.update_one(
            {"id": alert_id, "user_id": user["id"]},
            {"$set": {
                "taken": False,
                "taken_at": None,
                "entry_price": None,
                "outcome": None,
                "outcome_resolved_at": None,
                "outcome_pnl_pct": None,
                "exit_price": None,
            }},
        )
        return {"ok": True, "taken": False}
    entry_price = await _get_last_close(alert["ticker"])
    if entry_price is None:
        raise HTTPException(
            status_code=502,
            detail="Couldn't fetch current price to snapshot entry. Try again in a minute.",
        )
    await db.alerts.update_one(
        {"id": alert_id, "user_id": user["id"]},
        {"$set": {
            "taken": True,
            "taken_at": iso(now_utc()),
            "entry_price": round(entry_price, 4),
            "read": True,
            "outcome": None,
            "outcome_resolved_at": None,
            "outcome_pnl_pct": None,
            "exit_price": None,
        }},
    )
    return {"ok": True, "taken": True, "entry_price": round(entry_price, 4)}


# ─── Stats / scoreboard ─────────────────────────────────────────────────
@router.post("/resolve_pending")
async def resolve_pending(user=Depends(get_current_user)):
    """Manual trigger for resolving taken alerts past the horizon.
    Also runs lazily inside GET /stats, so typically no need to call."""
    n = await _resolve_pending(user["id"])
    return {"ok": True, "resolved": n}


@router.get("/stats")
async def get_stats(user=Depends(get_current_user)):
    """Scoreboard. Lazy-resolves any pending taken alerts before computing."""
    try:
        await _resolve_pending(user["id"])
    except Exception as e:
        logger.warning("alerts.stats: _resolve_pending failed: %s", e)

    rows = await db.alerts.find(
        {"user_id": user["id"], "taken": True},
        {"_id": 0},
    ).to_list(1000)

    by_type: dict = {}
    totals = {"taken": 0, "wins": 0, "losses": 0, "break_even": 0,
              "active": 0, "resolved": 0, "sum_pnl_pct": 0.0}

    for a in rows:
        t = a.get("type") or "unknown"
        b = by_type.setdefault(t, {
            "taken": 0, "wins": 0, "losses": 0, "break_even": 0,
            "active": 0, "resolved": 0, "sum_pnl_pct": 0.0,
        })
        b["taken"] += 1
        totals["taken"] += 1
        if a.get("outcome") is None:
            b["active"] += 1
            totals["active"] += 1
        else:
            b["resolved"] += 1
            totals["resolved"] += 1
            pnl = a.get("outcome_pnl_pct") or 0.0
            b["sum_pnl_pct"] += pnl
            totals["sum_pnl_pct"] += pnl
            outcome = a["outcome"]
            if outcome == "win":
                b["wins"] += 1
                totals["wins"] += 1
            elif outcome == "loss":
                b["losses"] += 1
                totals["losses"] += 1
            else:
                b["break_even"] += 1
                totals["break_even"] += 1

    # Post-compute derived rates
    for t, b in by_type.items():
        decisive = b["wins"] + b["losses"]
        b["win_rate_pct"] = round(100.0 * b["wins"] / decisive, 1) if decisive > 0 else None
        b["avg_pnl_pct"] = round(b["sum_pnl_pct"] / b["resolved"], 2) if b["resolved"] > 0 else None
        del b["sum_pnl_pct"]  # internal only

    total_decisive = totals["wins"] + totals["losses"]
    return {
        "total_taken": totals["taken"],
        "total_resolved": totals["resolved"],
        "total_active": totals["active"],
        "total_wins": totals["wins"],
        "total_losses": totals["losses"],
        "total_break_even": totals["break_even"],
        "overall_win_rate_pct": round(100.0 * totals["wins"] / total_decisive, 1) if total_decisive > 0 else None,
        "overall_avg_pnl_pct": round(totals["sum_pnl_pct"] / totals["resolved"], 2) if totals["resolved"] > 0 else None,
        "resolve_horizon_days": RESOLVE_HORIZON_DAYS,
        "by_type": by_type,
    }
