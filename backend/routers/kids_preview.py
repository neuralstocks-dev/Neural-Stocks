"""KidStocks router — public GAL-translated kid view of NSI verdicts.

Endpoints:
  * GET  /api/kids/preview/{ticker}?age=8-10|11-13|14-18&lang=en|id
        → If a recent adult NSI analysis (<14 days) exists, run it
          through the GAL and return the kid view immediately.
        → Otherwise, spawn an on-demand background analysis job
          (mirrors the proven `anon_try.py` pattern: server-side
          synthetic user, 180s budget, circuit-breaker gated) and
          return HTTP 202 with `{job_id, status: "pending"}`.
  * GET  /api/kids/preview/job/{job_id}?age=&lang=
        → Poll endpoint. Returns pending / done / error. On done
          returns the same payload shape as the cache-hit GET.
  * POST /api/kids/preview/feedback
        → Captures 👍/👎 + optional 1-line comment.
  * GET  /api/kids/preview/feedback/stats
        → Public live aggregate (Phase Zero pilot).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from core.db import db
from core.security import iso, now_utc
from services import llm_circuit_breaker
from services.gal import VALID_BANDS, translate_for_age

log = logging.getLogger(__name__)

router = APIRouter(prefix="/kids", tags=["kids"])

# Phase Zero demo set — used ONLY by the feedback endpoint to keep
# pilot telemetry clean. The preview endpoint itself accepts any
# valid-shape ticker.
DEMO_TICKERS = frozenset({"AAPL", "MSFT", "NVDA", "TSLA", "BBCA.JK"})

# How fresh must a cached analysis be to reuse it for the kid preview?
# 14 days for Phase Zero — pilot is about proving the GAL explains
# things clearly, not about real-time market signals.
_MAX_CACHE_AGE = timedelta(days=14)

# In-process memo of GAL outputs — same ticker+age+analysis_id+lang
# returns the exact same translation, so we skip the LLM call for
# feedback-session replays.
_GAL_MEMO: dict[tuple[str, str, str, str], tuple[float, dict]] = {}
_GAL_MEMO_TTL_S = 60 * 60 * 24  # 24h

# On-demand fresh analysis budgets — mirror anon_try.py
KID_JOB_TIMEOUT_S = float(os.environ.get("KID_PREVIEW_JOB_TIMEOUT_S", "180"))
KID_RATE_WINDOW_S = 60 * 60  # 1h
KID_RATE_LIMIT = int(os.environ.get("KID_PREVIEW_RATE_PER_HOUR", "3"))


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for") or req.headers.get("x-real-ip") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    client = req.client
    return client.host if client else "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"kidstocks-anon::{ip}".encode("utf-8")).hexdigest()[:32]


async def _ensure_indexes():
    """TTL-cleans the per-IP rate counter + job docs. Idempotent."""
    try:
        await db.kids_preview_rate.create_index(
            "created_at_ts", expireAfterSeconds=KID_RATE_WINDOW_S * 2
        )
    except Exception:
        pass
    try:
        await db.kids_preview_jobs.create_index(
            "created_at_ts", expireAfterSeconds=3600
        )
    except Exception:
        pass


def _adult_to_gal_input(doc: dict) -> dict:
    """Project a raw `analyses` Mongo doc into the shape the GAL expects."""
    def _safe_dict(v) -> dict:
        return v if isinstance(v, dict) else {}

    quote = _safe_dict(doc.get("quote_snapshot"))
    technicals = _safe_dict(doc.get("technical_analysis"))
    change_view = _safe_dict(doc.get("what_could_change_view"))

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


async def _build_kid_response(doc: dict, age: str, lang: str, ticker: str) -> dict:
    """Run the GAL over an `analyses` doc and shape the public response.
    Memoised by (ticker, age, analysis_id, lang) so identical hits skip the
    ~$0.0007 GAL LLM call (DeepSeek V4 Pro via OpenRouter — ~1.1k input +
    ~325 output tokens). Note this is the translation call ONLY; if the
    caller had to generate a brand-new adult analysis first (see
    _run_kid_analysis_job below), add the adult pipeline's own ~$0.003 —
    same cost as a regular Neural Stock Intelligence verdict, since it's
    the identical _create_analysis_impl pipeline under the hood.
    """
    analysis_id = doc.get("id", "")
    memo_key = (ticker, age, analysis_id, lang)
    now_s = time.time()
    cached = _GAL_MEMO.get(memo_key)
    if cached and (now_s - cached[0]) < _GAL_MEMO_TTL_S:
        kid_view = cached[1]
    else:
        kid_view = await translate_for_age(_adult_to_gal_input(doc), age, ticker, lang)
        _GAL_MEMO[memo_key] = (now_s, kid_view)

    quote = doc.get("quote_snapshot") if isinstance(doc.get("quote_snapshot"), dict) else {}
    return {
        "ticker": ticker,
        "name": quote.get("name") or ticker,
        "age_band": age,
        "lang": lang,
        "analysis_id": analysis_id,
        "generated_at": doc.get("created_at"),
        "kid_view": {k: v for k, v in kid_view.items() if not k.startswith("_")},
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
        "provider": kid_view.get("_provider"),
    }


def _validate_ticker_shape(ticker: str) -> str:
    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 12 or not all(c.isalnum() or c in ".-^" for c in ticker):
        raise HTTPException(
            status_code=400,
            detail="That doesn't look like a valid ticker. Try something like AAPL, KO, NVDA, or BBCA.JK.",
        )
    return ticker


def _coerce_lang(lang: str) -> str:
    return lang if lang in ("en", "id") else "en"


def _coerce_age(age: str) -> str:
    if age not in VALID_BANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid age band '{age}'. Use one of {list(VALID_BANDS)}.",
        )
    return age


@router.get("/preview/{ticker}")
async def preview_kids(
    ticker: str,
    request: Request,
    age: str = Query(default="11-13", description="Age band: 8-10, 11-13, or 14-18"),
    lang: str = Query(default="en", description="Output language: en or id"),
):
    """Public kid-friendly translation. Cache hit: returns kid_view inline.
    Cache miss: spawns a background fresh-analysis job and returns 202.
    """
    ticker = _validate_ticker_shape(ticker)
    age = _coerce_age(age)
    lang = _coerce_lang(lang)

    # 1) Cache hit — most-recent adult analysis from any user, <14d old.
    cutoff = (datetime.now(timezone.utc) - _MAX_CACHE_AGE).isoformat()
    doc = await db.analyses.find_one(
        {"ticker": ticker, "created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if doc:
        return await _build_kid_response(doc, age, lang, ticker)

    # 2) Cache miss → live analysis on demand.
    await _ensure_indexes()

    # Circuit breaker — if the LLM chain is wedged, fail fast with a
    # kid-friendly message rather than spawning a doomed 180s job.
    if llm_circuit_breaker.is_tripped():
        raise HTTPException(
            status_code=503,
            detail=(
                "Our AI is taking a quick break. Please try again in a minute, "
                "or pick a popular ticker like AAPL, MSFT, NVDA, KO, or TSLA."
            ),
        )

    # Per-IP soft rate limit (default 3 fresh analyses per hour) — kids
    # rerolling a curiosity ticker is fine, scripted enumeration isn't.
    ip = _client_ip(request)
    ip_h = _ip_hash(ip)
    window_floor = now_utc() - timedelta(seconds=KID_RATE_WINDOW_S)
    used = await db.kids_preview_rate.count_documents(
        {"ip_hash": ip_h, "created_at_ts": {"$gte": window_floor}}
    )
    if used >= KID_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=(
                f"You've already asked the AI to analyse {KID_RATE_LIMIT} brand-new "
                f"stocks this hour. Please come back in a bit, or pick one of the "
                f"famous ones above."
            ),
        )

    # Mint job + spawn worker.
    job_id = uuid.uuid4().hex[:16]
    await db.kids_preview_jobs.insert_one({
        "job_id": job_id,
        "ticker": ticker,
        "age": age,
        "lang": lang,
        "ip_hash": ip_h,
        "status": "pending",
        "stage_label": "Looking up the company…",
        "created_at": iso(now_utc()),
        "created_at_ts": now_utc(),
    })
    await db.kids_preview_rate.insert_one({
        "ip_hash": ip_h,
        "ticker": ticker,
        "created_at_ts": now_utc(),
    })
    asyncio.create_task(_run_kid_analysis_job(job_id, ticker, age, lang))
    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "status": "pending",
            "ticker": ticker,
            "age_band": age,
            "lang": lang,
            "poll_url": f"/api/kids/preview/job/{job_id}",
            "estimated_seconds": 35,
        },
    )


async def _stage_ticker_kid(job_id: str):
    """Kid-friendly progress labels streamed into the job doc."""
    stages = [
        (0, "Looking up the company…"),
        (5, "Reading today's price and chart…"),
        (12, "Studying the fundamentals…"),
        (20, "Asking the AI brain to think it over…"),
        (35, "Translating into kid-friendly words…"),
        (55, "Finishing up…"),
    ]
    start = 0
    try:
        for offset, label in stages:
            wait_for = max(0, offset - start)
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            start = offset
            await db.kids_preview_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"stage_label": label, "stage_offset_s": offset}},
            )
    except asyncio.CancelledError:
        return


def _kid_safe_error(e: HTTPException, ticker: str) -> str:
    """Translate an HTTPException raised inside the adult analysis pipeline
    into a message safe to show a child.

    The adult pipeline (services/ai.py, routers/analysis.py) raises a mix
    of HTTPException shapes depending on what failed — clean 404 "no data"
    errors, raw 502 "AI did not return valid JSON" / "AI JSON parse error"
    strings straight from a malformed LLM response, 503 budget/upstream
    errors (sometimes a dict with error_code+message, sometimes a plain
    string), and a last-resort "AI provider error: {raw exception text
    truncated to 200 chars}" that can contain near-arbitrary internal
    detail. Before this fix, `e.detail` was used verbatim as the kid-facing
    error whenever it happened to be a string — only non-string (dict)
    details got a generic fallback — so the more common string-shaped
    failures (JSON parse errors especially) leaked raw backend internals
    straight to a child's screen. Every branch here is deliberately a
    fixed, friendly string — nothing from `e.detail` is ever echoed back.
    """
    detail = e.detail
    text = detail if isinstance(detail, str) else (detail or {}).get("message", "") if isinstance(detail, dict) else ""
    low = text.lower()
    if "no data for ticker" in low or e.status_code == 404:
        return f"We couldn't find {ticker} — try a different ticker from the list."
    if "json" in low or e.status_code == 502:
        return "The AI had trouble with this one — try again in a minute."
    if "budget" in low or "credits" in low or e.status_code == 503:
        return "The AI is taking a quick break — try again in a minute."
    return "Couldn't analyse that ticker. Please try a different one or try again later."


async def _run_kid_analysis_job(job_id: str, ticker: str, age: str, lang: str):
    """Background worker — runs the full NSI pipeline using a synthetic
    'kid-anon' user (bypasses disclaimer + per-user quotas), then runs the
    fresh result through the GAL and stores the final kid view in the
    job doc.
    """
    # Lazy import to avoid circular dependency at module load time.
    from routers.analysis import _create_analysis_impl

    synthetic = {
        "id": f"anon:kid:{job_id}",
        "email": f"anon+kid+{job_id[:8]}@neulab.local",
        "plan": "free",
        "disclaimer_accepted": True,
        "__anon__": True,
    }
    stage_task = asyncio.create_task(_stage_ticker_kid(job_id))
    started = time.monotonic()
    try:
        # Run the full pipeline. Mode "standard" — kid pilot doesn't need
        # candlestick or hybrid (GAL strips it anyway).
        await asyncio.wait_for(
            _create_analysis_impl(ticker, "standard", synthetic),
            timeout=KID_JOB_TIMEOUT_S,
        )
        # Re-fetch the freshly-persisted analysis (it's now in `analyses`)
        doc = await db.analyses.find_one(
            {"ticker": ticker},
            sort=[("created_at", -1)],
            projection={"_id": 0},
        )
        if not doc:
            raise RuntimeError("analysis pipeline returned but no doc was persisted")

        kid_payload = await _build_kid_response(doc, age, lang, ticker)
        llm_circuit_breaker.record_outcome(
            "success", ticker=ticker, elapsed_s=time.monotonic() - started, surface="kids",
        )
        await db.kids_preview_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "done",
                "payload": kid_payload,
                "stage_label": "Ready",
                "finished_at": iso(now_utc()),
            }},
        )
    except asyncio.TimeoutError:
        elapsed = time.monotonic() - started
        reason = llm_circuit_breaker.classify_timeout_reason(elapsed, KID_JOB_TIMEOUT_S)
        llm_circuit_breaker.record_outcome(
            "timeout", ticker=ticker, reason=reason, elapsed_s=elapsed, surface="kids",
            error_detail=f"asyncio.TimeoutError after {elapsed:.1f}s (budget={KID_JOB_TIMEOUT_S:.0f}s)",
        )
        log.warning("Kid preview job timed out for %s after %.0fs", ticker, elapsed)
        await db.kids_preview_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "error",
                "error": "The AI is being slow right now. Please try again in a minute.",
                "finished_at": iso(now_utc()),
            }},
        )
    except HTTPException as e:
        # Raised by the adult pipeline (404 no-data, 502 malformed-LLM-JSON,
        # 503 budget/upstream, etc.) — sanitize before persisting since this
        # ends up directly on a child's screen. The RAW detail still goes to
        # the log line for debugging; only the persisted `error` field (what
        # KidsPreviewPage.jsx actually renders) is the kid-safe version.
        kid_msg = _kid_safe_error(e, ticker)
        log.info("Kid preview job %s rejected (status=%s): %s", job_id, e.status_code, e.detail)
        await db.kids_preview_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "error",
                "error": kid_msg,
                "finished_at": iso(now_utc()),
            }},
        )
    except Exception as e:
        llm_circuit_breaker.record_outcome(
            "timeout", ticker=ticker,
            reason=llm_circuit_breaker.REASON_OTHER_EXCEPTION,
            elapsed_s=time.monotonic() - started, surface="kids",
            error_detail=llm_circuit_breaker._format_error_detail(e),
        )
        log.exception("Kid preview job failed for %s", ticker)
        await db.kids_preview_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "error",
                "error": "Something went wrong. Please try a different ticker or try again later.",
                "finished_at": iso(now_utc()),
            }},
        )
    finally:
        stage_task.cancel()
        try:
            await stage_task
        except (asyncio.CancelledError, Exception):
            pass


@router.get("/preview/job/{job_id}")
async def poll_kid_job(job_id: str):
    """Poll a fresh-analysis job. Returns pending / done / error.
    On done, returns the same shape as a direct cache-hit GET.
    """
    job = await db.kids_preview_jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    status = job.get("status", "pending")
    if status == "done":
        payload = dict(job.get("payload") or {})
        payload["_job"] = {"status": "done", "job_id": job_id}
        return payload
    if status == "error":
        return {"_job": {
            "status": "error",
            "job_id": job_id,
            "error": job.get("error") or "Analysis failed",
        }}
    return {"_job": {
        "status": "pending",
        "job_id": job_id,
        "ticker": job.get("ticker"),
        "stage_label": job.get("stage_label"),
        "stage_offset_s": job.get("stage_offset_s"),
    }}


# ---------------------------------------------------------------------------
# Feedback capture — Phase Zero pilot telemetry. Restricted to DEMO_TICKERS
# so on-demand random tickers don't pollute the success metric.
# ---------------------------------------------------------------------------

class PreviewFeedback(BaseModel):
    ticker: str = Field(..., max_length=16)
    age_band: str = Field(..., max_length=8)
    analysis_id: Optional[str] = Field(default=None, max_length=64)
    sentiment: str = Field(..., pattern=r"^(up|down)$")
    comment: Optional[str] = Field(default=None, max_length=500)


@router.post("/preview/feedback")
async def submit_preview_feedback(body: PreviewFeedback, request: Request):
    if body.age_band not in VALID_BANDS:
        raise HTTPException(status_code=400, detail="Invalid age band")
    if body.ticker.upper() not in DEMO_TICKERS:
        raise HTTPException(status_code=400, detail="Unknown demo ticker")

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
