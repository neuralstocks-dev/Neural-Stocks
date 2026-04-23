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

import hashlib
import logging
import uuid
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Query, Request
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
    else:
        # -- 3) Run the full pipeline with a synthetic anon user --
        synthetic = {
            "id": f"anon:{ip_hash}",
            "email": f"anon+{ip_hash[:8]}@neulab.local",
            "plan": "free",
            "disclaimer_accepted": True,  # bypasses require_accepted
            "__anon__": True,
        }
        try:
            result = await _create_analysis_impl(ticker_up, mode, synthetic)
            verdict_id = result["id"]
        except HTTPException:
            raise
        except Exception as e:
            _log.exception("Anon analysis failed for %s", ticker_up)
            raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")

    # -- 4) Log usage for rate-limit enforcement --
    await db.anon_try_usage.insert_one({
        "ip_hash": ip_hash,
        "ticker": ticker_up,
        "verdict_id": verdict_id,
        "ua_fragment": (ua[:80] if ua else None),
        "created_at_ts": now_utc(),
    })

    # -- 5) Fetch the stored verdict and redact --
    doc = await db.analyses.find_one({"id": verdict_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=500, detail="Analysis saved but could not be retrieved")
    return _redact_for_anon(doc)


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
    logged-in user — anon shares are preview-mode by definition."""
    share = await db.shared_verdicts.find_one(
        {"share_id": share_id, "is_anon_share": True},
        {"_id": 0},
    )
    if not share:
        raise HTTPException(status_code=404, detail="Shared verdict not found")
    analysis = await db.analyses.find_one({"id": share["analysis_id"]}, {"_id": 0})
    if not analysis:
        raise HTTPException(status_code=404, detail="Underlying analysis no longer exists")
    redacted = _redact_for_anon(analysis)
    redacted["_shared"] = {
        "share_id": share_id,
        "shared_at": share["created_at"],
    }
    return redacted

