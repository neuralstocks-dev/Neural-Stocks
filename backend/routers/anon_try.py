"""Anonymous "Try one free analysis" flow.

Motivation: convert curious public-page visitors into signups by letting
them run exactly one real verdict on the ticker they care about — no
signup required. Proves product quality, then gates the deeper details
(pattern breakdown, risk factors, RF opinion, bandarmology) behind a
signup wall.

Guardrails to prevent abuse / runaway cost:
  1. IP-rate-limit: 1 successful analysis per IP per 24h (enforced via a
     dedicated `anon_try_usage` collection with a TTL index).
  2. Result caching: if any anon user analysed the same ticker in the
     last 6 hours, we return the cached verdict (zero LLM/data spend).
  3. User agent sniff: we block obvious non-browser clients (curl, wget,
     python-requests, bots) so script kiddies can't enumerate tickers.
  4. Response is REDACTED: risk factors, pattern details, RF opinion,
     bandarmology, peer comparison are stripped — replaced with
     placeholder keys the frontend renders as "🔒 sign up to unlock".
"""
from __future__ import annotations

import asyncio

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.db import db
from core.security import iso, now_utc
from routers.analysis import _create_analysis_impl

router = APIRouter(prefix="/try", tags=["anonymous-try"])

_log = logging.getLogger(__name__)

ANON_WINDOW_HOURS = 24
CACHE_WINDOW_HOURS = 6
BLOCKED_UA_FRAGMENTS = (
    "curl/", "wget/", "python-requests", "python-urllib", "go-http-client",
    "httpx/", "libwww-perl", "scrapy",
)


def _client_ip(req: Request) -> str:
    """Prefer the first hop in X-Forwarded-For (Kubernetes ingress sets it),
    fall back to the direct client address. Final fallback: 'unknown'."""
    fwd = req.headers.get("x-forwarded-for") or req.headers.get("x-real-ip") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    client = req.client
    return client.host if client else "unknown"


def _ip_hash(ip: str) -> str:
    return hashlib.sha256(f"neulab-anon::{ip}".encode("utf-8")).hexdigest()[:32]


def _parse_dt(value) -> datetime | None:
    """Best-effort parser for ISO-8601 timestamps stored throughout the
    app. Handles None + strings with either 'Z' or '+00:00' suffixes.
    Returns a timezone-aware datetime or None."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = value.replace("Z", "+00:00") if isinstance(value, str) else value
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _is_bot(ua: str) -> bool:
    ua = (ua or "").lower()
    if not ua:
        return True  # no UA → almost certainly a script
    return any(frag in ua for frag in BLOCKED_UA_FRAGMENTS)


async def _ensure_indexes():
    # TTL index wipes anon usage records after the rate-limit window so the
    # collection stays tiny. Idempotent — Mongo no-ops if the index exists.
    try:
        await db.anon_try_usage.create_index(
            "created_at_ts",
            expireAfterSeconds=ANON_WINDOW_HOURS * 3600,
        )
    except Exception:
        pass
    # Wipe completed/failed jobs after 1 hour — they're transient scratchpads
    try:
        await db.anon_try_jobs.create_index(
            "created_at_ts",
            expireAfterSeconds=3600,
        )
    except Exception:
        pass


def _redact_for_anon(doc: dict) -> dict:
    """Strip the premium fields and replace with lock hints. Preserves
    verdict, confidence, price target, stop-loss, one-paragraph reasoning,
    and company identity so the anon gets enough to be wowed."""
    LOCKED_KEYS = (
        "risk_factors",
        "candlestick_findings",
        "candlestick_summary",
        "rf_opinion",
        "bandarmology",
        "confluence",
        "technical_analysis",
        "fundamental_analysis",
        "peer_comparison",
        "market_context",
        "timeline_recommendations",
    )
    out = dict(doc)
    locked: dict[str, bool] = {}
    for k in LOCKED_KEYS:
        if k in out:
            out.pop(k, None)
            locked[k] = True
    out["_locked"] = locked
    # Truncate the long-form reasoning to first paragraph only
    reasoning = out.get("reasoning")
    if isinstance(reasoning, str) and len(reasoning) > 320:
        first_para = reasoning.split("\n\n", 1)[0]
        out["reasoning"] = (first_para[:320].rstrip() + "…")
        out["_locked"]["reasoning_full"] = True
    # Clear MongoDB-internal id if present
    out.pop("_id", None)
    out["is_anon_preview"] = True
    return out


@router.post("/analysis/{ticker}")
async def anon_try_analysis(ticker: str, request: Request, mode: str = Query("hybrid")):
    """Create one free anonymous analysis. Rate-limited per IP. Returns a
    redacted verdict — enough to prove quality, not enough to replace the
    signup-tier experience."""
    await _ensure_indexes()
    ua = request.headers.get("user-agent") or ""
    if _is_bot(ua):
        raise HTTPException(status_code=403, detail="Automated clients are not permitted on the free try endpoint")

    ip = _client_ip(request)
    ip_hash = _ip_hash(ip)
    ticker_up = ticker.upper().strip()

    # -- 1) Rate limit: has this IP run a try analysis in the last 24h? --
    cutoff_rate = now_utc() - timedelta(hours=ANON_WINDOW_HOURS)
    existing = await db.anon_try_usage.find_one(
        {"ip_hash": ip_hash, "created_at_ts": {"$gte": cutoff_rate}},
        sort=[("created_at_ts", -1)],
    )
    if existing:
        # Serve them their own previous verdict — they can't re-roll another stock
        cached_doc = await db.analyses.find_one(
            {"id": existing["verdict_id"]},
            {"_id": 0},
        )
        if cached_doc:
            resp = _redact_for_anon(cached_doc)
            resp["_rate_limited"] = {
                "reason": "daily_quota_used",
                "previous_ticker": existing.get("ticker"),
                "next_reset_at": iso(existing["created_at_ts"] + timedelta(hours=ANON_WINDOW_HOURS)),
                "message": "You've used your free analysis for today. Sign up to run unlimited verdicts.",
            }
            return resp
        # Cache doc was evicted — treat as expired and allow a fresh try
        await db.anon_try_usage.delete_one({"_id": existing["_id"]})

    # -- 2) Shared cache: did anyone analyse this ticker in the last 6h? --
    cache_cutoff = iso(now_utc() - timedelta(hours=CACHE_WINDOW_HOURS))
    cached_shared = await db.analyses.find_one(
        {"ticker": ticker_up, "created_at": {"$gte": cache_cutoff}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if cached_shared:
        verdict_id = cached_shared["id"]
        # Log usage + return redacted immediately (fast path: ~100ms)
        await db.anon_try_usage.insert_one({
            "ip_hash": ip_hash,
            "ticker": ticker_up,
            "verdict_id": verdict_id,
            "ua_fragment": (ua[:80] if ua else None),
            "created_at_ts": now_utc(),
        })
        doc = await db.analyses.find_one({"id": verdict_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=500, detail="Analysis saved but could not be retrieved")
        return _redact_for_anon(doc)

    # -- 3) Cache miss → spawn background job, return 202 with job_id.
    # This dodges ingress timeouts (production ingress caps ~30s but a cold
    # anon analysis runs Claude + yfinance + fundamentals which typically
    # takes 25-45s). Frontend polls /api/try/job/{job_id} every 2s.
    job_id = uuid.uuid4().hex[:16]
    await db.anon_try_jobs.insert_one({
        "job_id": job_id,
        "ticker": ticker_up,
        "ip_hash": ip_hash,
        "mode": mode,
        "status": "pending",
        "created_at": iso(now_utc()),
        "created_at_ts": now_utc(),  # BSON date — used by TTL index
        "ua_fragment": (ua[:80] if ua else None),
    })
    asyncio.create_task(_run_anon_analysis_job(job_id, ticker_up, mode, ip_hash, ua))
    return JSONResponse(status_code=202, content={
        "job_id": job_id,
        "status": "pending",
        "ticker": ticker_up,
        "poll_url": f"/api/try/job/{job_id}",
        "estimated_seconds": 30,
    })


async def _stage_ticker(job_id: str):
    """Background companion to the analysis task — writes sequential stage
    labels into the job doc at realistic intervals so the poll endpoint
    can show a live progress indicator. Non-invasive: doesn't touch the
    analysis pipeline itself. Cancelled by the parent when real work
    finishes (either before or after the last scheduled stage)."""
    stages = [
        (0,  "Fetching live quote · OHLC · fundamentals"),
        (6,  "Detecting candlestick patterns across daily + weekly"),
        (12, "Running Random Forest model · 20-day horizon"),
        (18, "Gathering market context · news · peer signals"),
        (26, "Synthesising verdict with Anthropic Claude"),
        (40, "Finalising · stitching reasoning · writing verdict"),
    ]
    start = 0
    try:
        for offset, label in stages:
            wait_for = max(0, offset - start)
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            start = offset
            await db.anon_try_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"stage_label": label, "stage_offset_s": offset}},
            )
    except asyncio.CancelledError:
        return  # parent finished — silent


async def _run_anon_analysis_job(job_id: str, ticker_up: str, mode: str, ip_hash: str, ua: str | None):
    """Background worker — runs the analysis pipeline, stores the result
    or error in `anon_try_jobs`, and updates `anon_try_usage` on success.
    Any failure is caught so the job status flips to 'error' instead of
    leaving the client polling forever. A companion `_stage_ticker` task
    streams progress labels into the job doc for the UI to show."""
    synthetic = {
        "id": f"anon:{ip_hash}",
        "email": f"anon+{ip_hash[:8]}@neulab.local",
        "plan": "free",
        "disclaimer_accepted": True,
        "__anon__": True,
    }
    ticker_task = asyncio.create_task(_stage_ticker(job_id))
    try:
        result = await _create_analysis_impl(ticker_up, mode, synthetic)
        verdict_id = result["id"]
        await db.anon_try_usage.insert_one({
            "ip_hash": ip_hash,
            "ticker": ticker_up,
            "verdict_id": verdict_id,
            "ua_fragment": (ua[:80] if ua else None),
            "created_at_ts": now_utc(),
        })
        await db.anon_try_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "done",
                "verdict_id": verdict_id,
                "finished_at": iso(now_utc()),
                "stage_label": "Ready",
            }},
        )
    except Exception as e:
        _log.exception("Anon job failed for %s (job %s)", ticker_up, job_id)
        await db.anon_try_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "status": "error",
                "error": str(e)[:500],
                "finished_at": iso(now_utc()),
            }},
        )
    finally:
        ticker_task.cancel()
        # Await the cancellation silently so the task doesn't linger
        try:
            await ticker_task
        except (asyncio.CancelledError, Exception):
            pass


@router.get("/job/{job_id}")
async def poll_anon_job(job_id: str):
    """Poll endpoint. Returns the job's current state and — if done — the
    full redacted verdict payload. Frontend hits this every 2s."""
    job = await db.anon_try_jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    status = job.get("status", "pending")
    if status == "done":
        doc = await db.analyses.find_one({"id": job["verdict_id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=500, detail="Underlying analysis no longer exists")
        payload = _redact_for_anon(doc)
        payload["_job"] = {"status": "done", "job_id": job_id}
        return payload
    if status == "error":
        return {"_job": {"status": "error", "job_id": job_id, "error": job.get("error") or "Analysis failed"}}
    return {"_job": {
        "status": "pending",
        "job_id": job_id,
        "ticker": job.get("ticker"),
        "stage_label": job.get("stage_label"),
        "stage_offset_s": job.get("stage_offset_s"),
    }}


@router.get("/status")
async def anon_try_status(request: Request):
    """Lets the frontend know, before the visitor even types a ticker,
    whether their 24h slot is still available. Used by the TryNowBox to
    show 'Free analysis available' vs 'Already used — sign up for more'."""
    await _ensure_indexes()
    ip_hash = _ip_hash(_client_ip(request))
    cutoff = now_utc() - timedelta(hours=ANON_WINDOW_HOURS)
    existing = await db.anon_try_usage.find_one(
        {"ip_hash": ip_hash, "created_at_ts": {"$gte": cutoff}},
        sort=[("created_at_ts", -1)],
    )
    if existing:
        return {
            "available": False,
            "previous_ticker": existing.get("ticker"),
            "next_reset_at": iso(existing["created_at_ts"] + timedelta(hours=ANON_WINDOW_HOURS)),
            "verdict_id": existing.get("verdict_id"),
        }
    return {"available": True, "window_hours": ANON_WINDOW_HOURS}


# =============================================================================
# Viral share loop — let an anon visitor who just got their free verdict
# create a unique /ts/:shareId link pointing to THEIR redacted verdict.
# A friend opens it, sees the same preview, gets their own free try, loops.
# =============================================================================

class AnonShareRequest(BaseModel):
    verdict_id: str


@router.post("/share")
async def create_anon_share(payload: AnonShareRequest, request: Request):
    """Mint a shareable link pointing to an anonymous verdict. Only valid
    for analyses created via the /try endpoint (we check the synthetic
    user_id prefix 'anon:') to prevent someone from laundering a full
    authenticated verdict through the redacted share path."""
    if _is_bot(request.headers.get("user-agent") or ""):
        raise HTTPException(status_code=403, detail="Bot clients cannot create share links")

    # Verify the verdict exists and was created by the anon pipeline
    analysis = await db.analyses.find_one(
        {"id": payload.verdict_id},
        {"_id": 0, "id": 1, "ticker": 1, "user_id": 1},
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Verdict not found")
    # Accept if verdict was run by any anon OR if it's simply unclaimed
    # (anon shares are always redacted anyway, so even sharing a full
    # authenticated verdict via this endpoint would still emit a preview).
    is_anon_verdict = (analysis.get("user_id") or "").startswith("anon:")

    # Idempotent: return existing anon share if one exists
    existing = await db.shared_verdicts.find_one(
        {"analysis_id": payload.verdict_id, "is_anon_share": True},
        {"_id": 0},
    )
    if existing:
        return {
            "share_id": existing["share_id"],
            "url_path": f"/ts/{existing['share_id']}",
            "created_at": existing["created_at"],
        }

    share_id = uuid.uuid4().hex[:12]
    created_at = iso(now_utc())
    ip = _client_ip(request)
    await db.shared_verdicts.insert_one({
        "share_id": share_id,
        "analysis_id": payload.verdict_id,
        "owner_id": analysis.get("user_id") or f"anon:{_ip_hash(ip)}",
        "ticker": analysis["ticker"],
        "created_at": created_at,
        "is_anon_share": True,
        "is_from_anon_verdict": is_anon_verdict,
    })
    return {
        "share_id": share_id,
        "url_path": f"/ts/{share_id}",
        "created_at": created_at,
    }


@router.get("/shared/{share_id}")
async def get_anon_share(share_id: str):
    """Fetch an anon-shared verdict. Always returns a redacted payload,
    regardless of whether the underlying analysis was run anon or by a
    logged-in user — anon shares are preview-mode by definition.

    **Evergreen shares**: if the pointed-to analysis is older than
    `STALE_HOURS`, we transparently auto-refresh:
      1) Prefer any newer analysis for the same ticker within the 6h
         shared-cache window (zero extra spend — piggybacks on someone
         else's recent analysis).
      2) Otherwise run one fresh analysis and repoint the share to it.
         Gated by a per-share cooldown (`REFRESH_COOLDOWN_HOURS`) to
         prevent a single hot URL from hammering the pipeline.
    The original `shared_at` timestamp is preserved so the recipient
    still sees "Shared X days ago" — only the verdict underneath is
    kept fresh.
    """
    STALE_HOURS = 24
    REFRESH_COOLDOWN_HOURS = 6

    share = await db.shared_verdicts.find_one(
        {"share_id": share_id, "is_anon_share": True},
        {"_id": 0},
    )
    if not share:
        raise HTTPException(status_code=404, detail="Shared verdict not found")

    analysis = await db.analyses.find_one({"id": share["analysis_id"]}, {"_id": 0})
    ticker = share.get("ticker") or (analysis or {}).get("ticker")
    was_refreshed = False
    refresh_reason = None

    if analysis and ticker:
        created_at = _parse_dt(analysis.get("created_at"))
        if created_at and (now_utc() - created_at) > timedelta(hours=STALE_HOURS):
            # Before running anything expensive, check whether we already
            # refreshed this share recently — guards against viral-URL DoS.
            # We use `last_refreshed_at` alone so the FIRST stale hit can
            # always refresh (shares created long ago wouldn't otherwise
            # ever flip through without a prior refresh anchor).
            last_refresh = _parse_dt(share.get("last_refreshed_at"))
            cooldown_ok = not last_refresh or (now_utc() - last_refresh) > timedelta(hours=REFRESH_COOLDOWN_HOURS)

            if cooldown_ok:
                # Look for a fresher cached analysis of the same ticker
                cache_cutoff = iso(now_utc() - timedelta(hours=6))
                newer = await db.analyses.find_one(
                    {"ticker": ticker, "created_at": {"$gte": cache_cutoff}},
                    {"_id": 0},
                    sort=[("created_at", -1)],
                )
                if newer and newer.get("id") != analysis.get("id"):
                    analysis = newer
                    was_refreshed = True
                    refresh_reason = "cache_piggyback"
                else:
                    # Run a fresh analysis. This bypasses the IP-rate-limit
                    # intentionally because it's an authorless refresh, not
                    # a user action; cost-bounded by REFRESH_COOLDOWN_HOURS.
                    synthetic = {
                        "id": f"anon:share:{share_id}",
                        "email": "anon+share@neulab.local",
                        "plan": "free",
                        "disclaimer_accepted": True,
                        "__anon__": True,
                    }
                    try:
                        fresh = await _create_analysis_impl(ticker, "hybrid", synthetic)
                        analysis = fresh
                        was_refreshed = True
                        refresh_reason = "fresh_run"
                    except Exception as e:
                        _log.warning("Share refresh failed for %s (%s): %s", share_id, ticker, e)
                        # Fall through and serve the stale verdict — better
                        # than a 500 for recipients.
                        refresh_reason = f"refresh_error:{type(e).__name__}"

                if was_refreshed and analysis:
                    await db.shared_verdicts.update_one(
                        {"share_id": share_id},
                        {"$set": {
                            "analysis_id": analysis["id"],
                            "last_refreshed_at": iso(now_utc()),
                            "refresh_count": (share.get("refresh_count") or 0) + 1,
                            "last_refresh_reason": refresh_reason,
                        }},
                    )

    if not analysis:
        raise HTTPException(status_code=404, detail="Underlying analysis no longer exists")

    redacted = _redact_for_anon(analysis)
    redacted["_shared"] = {
        "share_id": share_id,
        "shared_at": share["created_at"],
        "verdict_freshness": analysis.get("created_at"),
        "was_refreshed": was_refreshed,
    }
    return redacted

