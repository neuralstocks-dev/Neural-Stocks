"""KidStocks Phase Zero router — single public endpoint to prove the GAL.

Scope (strictly Phase Zero — no auth, no DB writes beyond feedback):
  * GET  /api/kids/preview/{ticker}?age=8-10|11-13|14-18
        → Fetches the MOST RECENT adult NSI analysis for the ticker
          (<24h old, any user), runs it through the Grade Adaptation
          Layer, returns a kid-friendly JSON card.
  * POST /api/kids/preview/feedback
        → Captures 👍/👎 + optional 1-line comment for the testers
          WhatsApp feedback flow. Writes to `kids_preview_feedback`.

Out of scope: auth, students table, virtual portfolio, StockCoins,
rewards, curriculum modules, parent/educator portals, multi-language
GAL. All of those ship post-proof.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.db import db
from services.gal import VALID_BANDS, translate_for_age

log = logging.getLogger(__name__)

router = APIRouter(prefix="/kids", tags=["kids"])

# Demo tickers locked in with the user — Phase Zero only runs on these.
# Keeps the surface area tight for the 5-10 kid feedback session and
# ensures fresh cached NSI verdicts are always available (these are the
# most-analyzed tickers in production).
DEMO_TICKERS = frozenset({"AAPL", "MSFT", "NVDA", "TSLA", "BBCA.JK"})

# How fresh must a cached analysis be to reuse it for the kid preview?
# 14 days for Phase Zero — the pilot is about proving the GAL explains
# things clearly, not about real-time market signals. After we ship V1
# with auth + students, this drops to 24h and we trigger a fresh NSI
# job whenever the cache is stale.
_MAX_CACHE_AGE = timedelta(days=14)

# In-process memo of GAL outputs — same ticker+age+analysis_id returns
# the exact same translation, so we can skip the ~$0.005 LLM call for
# feedback-session replays. TTL matches the cache-age of the underlying
# adult verdict.
_GAL_MEMO: dict[tuple[str, str, str], tuple[float, dict]] = {}
_GAL_MEMO_TTL_S = 60 * 60 * 24  # 24h


def _adult_to_gal_input(doc: dict) -> dict:
    """Project the raw `analyses` Mongo doc down to the shape the GAL
    prompt expects. The collection stores richer fields than the GAL
    needs — filter to just what the translation layer uses."""
    # Some legacy analysis docs store `technical_analysis` /
    # `what_could_change_view` as plain strings rather than nested
    # dicts. Coerce defensively so the GAL never sees an
    # AttributeError mid-prompt-build.
    def _safe_dict(v) -> dict:
        return v if isinstance(v, dict) else {}

    quote = _safe_dict(doc.get("quote_snapshot"))
    technicals = _safe_dict(doc.get("technical_analysis"))
    change_view = _safe_dict(doc.get("what_could_change_view"))

    # Surface the most useful one-line signals from the adult verdict.
    # Prefer explicit signals, fall back to a flattened technicals dict.
    signals = technicals.get("signals") if isinstance(technicals.get("signals"), list) else None
    if not signals:
        signals = []
        for k, v in (doc.get("technicals") or {}).items():
            if v is None:
                continue
            signals.append(f"{k}: {v}")
            if len(signals) >= 6:
                break

    return {
        "ticker": doc.get("ticker"),
        "name": quote.get("name") or doc.get("ticker"),
        "recommendation": doc.get("recommendation"),
        "confidence_score": doc.get("confidence_score"),
        "price_target": doc.get("price_target"),
        "stop_loss": doc.get("stop_loss"),
        "time_horizon": doc.get("time_horizon_weeks"),
        "reasoning": doc.get("reasoning") or doc.get("executive_summary") or "",
        "key_signals": signals,
        "risks": doc.get("risk_factors") or [],
        "strengths": (
            change_view.get("bull_case")
            if isinstance(change_view.get("bull_case"), list)
            else []
        ),
        "current_price": doc.get("price_at_analysis"),
        "currency": quote.get("currency") or "USD",
    }


@router.get("/preview/{ticker}")
async def preview_kids(
    ticker: str,
    age: str = Query(default="11-13", description="Age band: 8-10, 11-13, or 14-18"),
    lang: str = Query(default="en", description="Output language: en or id"),
):
    """Public kid-friendly translation of the latest NSI verdict."""
    ticker = ticker.upper().strip()

    # Basic shape validation only — no allowlist. Any ticker the adult
    # NSI engine has analysed (by ANY user, within the cache window) is
    # eligible for kid translation. Tickers no adult has analysed yet
    # fall through to the 503 fallback below with a kid-friendly tip.
    if not ticker or len(ticker) > 12 or not all(c.isalnum() or c in ".-^" for c in ticker):
        raise HTTPException(
            status_code=400,
            detail="That doesn't look like a valid ticker. Try something like AAPL, KO, NVDA, or BBCA.JK.",
        )

    if age not in VALID_BANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid age band '{age}'. Use one of {list(VALID_BANDS)}.",
        )

    if lang not in ("en", "id"):
        # Silent coercion is intentional here (vs. strict 422 on /signup):
        # the public preview is hit by random visitors via shareable URLs
        # and we'd rather show English than break the demo.
        lang = "en"

    # 1) Pull most-recent adult analysis from the shared pool — ANY user.
    cutoff = (datetime.now(timezone.utc) - _MAX_CACHE_AGE).isoformat()
    doc = await db.analyses.find_one(
        {"ticker": ticker, "created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(
            status_code=503,
            detail=(
                f"We haven't analysed {ticker} yet — none of our grown-up "
                f"investors have looked at it in the last 14 days. Try a "
                f"big famous one like AAPL, MSFT, NVDA, KO, TSLA, or BBCA.JK."
            ),
        )

    # 2) In-process memo lookup — keyed by (ticker, age, analysis_id, lang)
    #    so EN and ID outputs cache independently.
    analysis_id = doc.get("id", "")
    memo_key = (ticker, age, analysis_id, lang)
    now_s = time.time()
    cached = _GAL_MEMO.get(memo_key)
    if cached and (now_s - cached[0]) < _GAL_MEMO_TTL_S:
        kid_view = cached[1]
    else:
        kid_view = await translate_for_age(_adult_to_gal_input(doc), age, ticker, lang)
        _GAL_MEMO[memo_key] = (now_s, kid_view)

    # 4) Shape the final response. Include a minimal "adult snapshot" so
    #    teens can toggle to see the raw adult verdict (PRD 14-18 band
    #    requirement), but nothing that could be user-identifying.
    quote = doc.get("quote_snapshot") if isinstance(doc.get("quote_snapshot"), dict) else {}
    return {
        "ticker": ticker,
        "name": quote.get("name") or ticker,
        "age_band": age,
        "analysis_id": analysis_id,
        "generated_at": doc.get("created_at"),
        "kid_view": {
            k: v for k, v in kid_view.items()
            if not k.startswith("_")  # strip internal provenance
        },
        "adult_snapshot": {
            "recommendation": doc.get("recommendation"),
            "confidence_score": doc.get("confidence_score"),
            "price_target": doc.get("price_target"),
            "stop_loss": doc.get("stop_loss"),
            "current_price": doc.get("price_at_analysis"),
            "currency": quote.get("currency") or "USD",
            "time_horizon_weeks": doc.get("time_horizon_weeks"),
            "reasoning_excerpt": (doc.get("reasoning") or "")[:600],
        },
        "provider": kid_view.get("_provider"),  # for admin debugging
    }


# ---------------------------------------------------------------------------
# Feedback capture — 👍 / 👎 + optional comment. Powers the "≥85% rated
# clear by ages 10-14" PRD success metric during Phase Zero field-testing.
# ---------------------------------------------------------------------------

class PreviewFeedback(BaseModel):
    ticker: str = Field(..., max_length=16)
    age_band: str = Field(..., max_length=8)
    analysis_id: Optional[str] = Field(default=None, max_length=64)
    sentiment: str = Field(..., pattern=r"^(up|down)$")  # 👍 or 👎
    comment: Optional[str] = Field(default=None, max_length=500)


@router.post("/preview/feedback")
async def submit_preview_feedback(body: PreviewFeedback, request: Request):
    """Capture a thumbs-up/thumbs-down + optional 1-line comment.

    Stores to `kids_preview_feedback` — a new collection, keeps the
    feedback isolated from any production telemetry so we can delete
    the whole collection after the pilot without side effects.
    """
    if body.age_band not in VALID_BANDS:
        raise HTTPException(status_code=400, detail="Invalid age band")
    if body.ticker.upper() not in DEMO_TICKERS:
        raise HTTPException(status_code=400, detail="Unknown demo ticker")

    # Best-effort user-agent capture to distinguish kid-phone vs desktop
    # without ever storing IP or any PII.
    ua = (request.headers.get("user-agent") or "")[:200]

    await db.kids_preview_feedback.insert_one({
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "ticker": body.ticker.upper(),
        "age_band": body.age_band,
        "analysis_id": body.analysis_id,
        "sentiment": body.sentiment,
        "comment": (body.comment or "").strip() or None,
        "user_agent": ua,
    })
    return {"ok": True}


@router.get("/preview/feedback/stats")
async def feedback_stats():
    """Simple aggregate for the pilot: `up/down` counts per age band.

    PUBLIC endpoint during Phase Zero — safe because the data has zero
    PII and we want the tester group to see the live tally as social
    proof for the next tester. We'll lock this behind admin-only after
    the proof completes.
    """
    pipeline = [
        {"$group": {
            "_id": {"age_band": "$age_band", "sentiment": "$sentiment"},
            "count": {"$sum": 1},
        }}
    ]
    rows = []
    async for r in db.kids_preview_feedback.aggregate(pipeline):
        rows.append({
            "age_band": r["_id"].get("age_band"),
            "sentiment": r["_id"].get("sentiment"),
            "count": r["count"],
        })
    total_up = sum(r["count"] for r in rows if r["sentiment"] == "up")
    total_down = sum(r["count"] for r in rows if r["sentiment"] == "down")
    total = total_up + total_down
    pct_clear = round(100 * total_up / total, 1) if total else 0.0
    return {
        "breakdown": rows,
        "totals": {"up": total_up, "down": total_down},
        "pct_clear": pct_clear,
        "target": 85.0,
        "target_met": pct_clear >= 85.0 and total >= 10,
    }
