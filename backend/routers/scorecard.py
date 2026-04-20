"""AI Accuracy Scorecard — per-user and global."""
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import asyncio
from fastapi import APIRouter, Depends

from core.db import db
from core.security import get_current_user
from services.yfinance_svc import get_quote

router = APIRouter(prefix="/scorecard", tags=["scorecard"])

# Minimum % move from price_at_analysis for a BUY/SELL to count as "hit".
# For HOLD: absolute move must stay within this tolerance.
HIT_THRESHOLD_PCT = 5.0
# Verdicts younger than this are "pending" (not yet evaluable)
MIN_AGE_DAYS = 7


def _parse(dt_str):
    if not dt_str:
        return None
    try:
        d = datetime.fromisoformat(dt_str)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def _score_one(analysis: dict, current_price: float | None):
    """Returns (status, return_pct) where status in {pending, hit, miss, stale}."""
    created = _parse(analysis.get("created_at"))
    if not created:
        return "stale", None
    age_days = (datetime.now(timezone.utc) - created).total_seconds() / 86400.0
    if age_days < MIN_AGE_DAYS:
        return "pending", None
    p0 = analysis.get("price_at_analysis")
    if not p0 or not current_price:
        return "stale", None
    change_pct = ((current_price - p0) / p0) * 100
    rec = analysis.get("recommendation")
    if rec == "BUY":
        status = "hit" if change_pct >= HIT_THRESHOLD_PCT else "miss"
    elif rec == "SELL":
        status = "hit" if change_pct <= -HIT_THRESHOLD_PCT else "miss"
    elif rec == "HOLD":
        status = "hit" if abs(change_pct) <= HIT_THRESHOLD_PCT else "miss"
    else:
        status = "stale"
    return status, round(change_pct, 2)


async def _resolve_quotes(tickers: list[str]) -> dict:
    unique = list({t for t in tickers if t})
    quotes = await asyncio.gather(*[get_quote(t) for t in unique], return_exceptions=True)
    out = {}
    for t, q in zip(unique, quotes):
        if isinstance(q, dict):
            out[t] = q.get("price")
        else:
            out[t] = None
    return out


def _empty_summary():
    return {
        "total": 0, "pending": 0, "hits": 0, "misses": 0,
        "hit_rate": None,
        "by_recommendation": {
            r: {"total": 0, "hits": 0, "misses": 0, "hit_rate": None}
            for r in ("BUY", "SELL", "HOLD")
        },
    }


def _finalize_summary(s):
    resolved = s["hits"] + s["misses"]
    s["hit_rate"] = round((s["hits"] / resolved) * 100, 1) if resolved else None
    for rec in ("BUY", "SELL", "HOLD"):
        r = s["by_recommendation"][rec]
        res = r["hits"] + r["misses"]
        r["hit_rate"] = round((r["hits"] / res) * 100, 1) if res else None
    return s


@router.get("/me")
async def my_scorecard(user=Depends(get_current_user)):
    analyses = await db.analyses.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)

    tickers = [a.get("ticker") for a in analyses]
    current = await _resolve_quotes(tickers)

    summary = _empty_summary()
    recent = []

    for a in analyses:
        ticker = a.get("ticker")
        status, ret_pct = _score_one(a, current.get(ticker))
        rec = a.get("recommendation")
        summary["total"] += 1
        if rec in summary["by_recommendation"]:
            summary["by_recommendation"][rec]["total"] += 1
        if status == "pending":
            summary["pending"] += 1
        elif status == "hit":
            summary["hits"] += 1
            if rec in summary["by_recommendation"]:
                summary["by_recommendation"][rec]["hits"] += 1
        elif status == "miss":
            summary["misses"] += 1
            if rec in summary["by_recommendation"]:
                summary["by_recommendation"][rec]["misses"] += 1
        recent.append({
            "analysis_id": a.get("id"),
            "ticker": ticker,
            "recommendation": rec,
            "confidence_score": a.get("confidence_score"),
            "price_at_analysis": a.get("price_at_analysis"),
            "price_target": a.get("price_target"),
            "actual_price": current.get(ticker),
            "return_pct": ret_pct,
            "status": status,
            "created_at": a.get("created_at"),
            "time_horizon_weeks": a.get("time_horizon_weeks"),
        })

    _finalize_summary(summary)
    summary["threshold_pct"] = HIT_THRESHOLD_PCT
    summary["min_age_days"] = MIN_AGE_DAYS
    return {"summary": summary, "verdicts": recent[:50]}


@router.get("/global")
async def global_scorecard(_user=Depends(get_current_user)):
    """Platform-wide stats (auth required). Response is scrubbed of user_id/email."""
    analyses = await db.analyses.find({}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(2000)
    tickers = [a.get("ticker") for a in analyses]
    current = await _resolve_quotes(tickers)
    summary = _empty_summary()
    for a in analyses:
        status, _ = _score_one(a, current.get(a.get("ticker")))
        rec = a.get("recommendation")
        summary["total"] += 1
        if rec in summary["by_recommendation"]:
            summary["by_recommendation"][rec]["total"] += 1
        if status == "pending":
            summary["pending"] += 1
        elif status == "hit":
            summary["hits"] += 1
            if rec in summary["by_recommendation"]:
                summary["by_recommendation"][rec]["hits"] += 1
        elif status == "miss":
            summary["misses"] += 1
            if rec in summary["by_recommendation"]:
                summary["by_recommendation"][rec]["misses"] += 1
    _finalize_summary(summary)
    summary["threshold_pct"] = HIT_THRESHOLD_PCT
    summary["min_age_days"] = MIN_AGE_DAYS
    return {"summary": summary}
