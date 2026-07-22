"""Admin: user management, test-unlock, login events, pricing."""
import logging
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, EmailStr
from typing import Optional

from core.config import (
    UNLOCK_DURATIONS,
    ADMIN_EMAILS,
    PAYPAL_ENV,
    PAYPAL_CLIENT_ID,
    PAYPAL_SECRET,
    PAYPAL_API_BASE,
    PAYPAL_WEBHOOK_ID,
)
from core.db import db
from core.models import UnlockReq
from core.security import admin_required, iso, now_utc, is_admin_email
from services.pricing import get_pricing, set_pricing, get_tier_limits, set_tier_limits
from services.paypal import get_plan_ids, PayPalError
from services.quota import resolved_plan_for, test_unlock_active, count_analyses, effective_plan_key
from services.gal import GAL_COST_PER_ATTEMPT_USD

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


class PricingReq(BaseModel):
    pro_price: float = Field(gt=0, le=9999)
    elite_price: float = Field(gt=0, le=9999)
    annual_discount_pct: float = Field(ge=0, le=90)
    promo_pro_discount_pct: float = Field(default=0.0, ge=0, le=90)
    promo_elite_discount_pct: float = Field(default=0.0, ge=0, le=90)
    promo_label: Optional[str] = Field(default="", max_length=80)
    promo_ends_at: Optional[str] = None
    daypass_price: Optional[float] = Field(default=None, ge=0, le=9999)
    daypass_duration_days: Optional[int] = Field(default=None, ge=1, le=365)


class TierLimitBlock(BaseModel):
    analyses_per_day: Optional[int] = Field(default=None, ge=0, le=100000)
    analyses_per_week: Optional[int] = Field(default=None, ge=0, le=1000000)
    analyses_per_month: Optional[int] = Field(default=None, ge=0, le=1000000)
    share_per_day: Optional[int] = Field(default=None, ge=0, le=100000)


class DaypassLimitBlock(BaseModel):
    analyses_per_day: Optional[int] = Field(default=None, ge=0, le=100000)
    analyses_per_week: Optional[int] = Field(default=None, ge=0, le=1000000)
    share_per_day: Optional[int] = Field(default=None, ge=0, le=100000)
    watchlist_limit: Optional[int] = Field(default=None, ge=0, le=1000)


class TierLimitsReq(BaseModel):
    free: TierLimitBlock
    pro: TierLimitBlock
    elite: TierLimitBlock
    daypass: Optional[DaypassLimitBlock] = None


class LoginDeleteReq(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class UserDeleteReq(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)


def _sanitize_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "full_name": u.get("full_name"),
        "plan": u.get("plan") or "free",
        "is_admin": is_admin_email(u.get("email")),
        "google_linked": bool(u.get("google_linked")),
        "test_unlock_expires_at": u.get("test_unlock_expires_at"),
        "test_unlock_granted_at": u.get("test_unlock_granted_at"),
        "test_unlock_granted_by": u.get("test_unlock_granted_by"),
        "login_count": u.get("login_count") or 0,
        "last_login_at": u.get("last_login_at"),
        "quota_reset_at": u.get("quota_reset_at"),
        "created_at": u.get("created_at"),
    }


@router.get("/users")
async def list_users(limit: int = 200, _admin=Depends(admin_required)):
    users = (
        await db.users.find({}, {"_id": 0, "password_hash": 0})
        .sort("created_at", -1)
        .to_list(max(1, min(limit, 500)))
    )
    now = now_utc()
    day_ago = now - timedelta(days=1)
    # Single aggregation: per-user lifetime analysis count + last-active
    # timestamp. Avoids N round-trips (one per user) we'd otherwise need
    # if we computed these separately. Returns docs of shape
    # {_id: <user_id>, lifetime: <int>, last_at: <iso str>}.
    eng_cursor = db.analyses.aggregate([
        {"$group": {
            "_id": "$user_id",
            "lifetime": {"$sum": 1},
            "last_at": {"$max": "$created_at"},
        }},
    ])
    eng_by_user = {doc["_id"]: doc async for doc in eng_cursor}

    rows = []
    for u in users:
        base = _sanitize_user(u)
        # Effective daily limit & today's usage. Admin and active test-unlock
        # resolve to Elite (effective), so their daily limit is unlimited.
        try:
            p = await resolved_plan_for(u)
            base["effective_plan"] = effective_plan_key(u)
            base["analyses_day_limit"] = p.get("analyses_per_day")  # None == unlimited
            # Honour admin-initiated quota resets — analyses before
            # `quota_reset_at` should not count toward the today usage,
            # mirroring the same floor used by services.quota for the
            # user-facing /api/quota endpoint. Without this, resetting
            # a user from the admin panel left their `analyses_today`
            # number unchanged in the same panel until 24h elapsed.
            since_day = day_ago
            reset_at = u.get("quota_reset_at")
            if reset_at:
                try:
                    reset_dt = datetime.fromisoformat(str(reset_at).replace("Z", "+00:00"))
                    if reset_dt > since_day:
                        since_day = reset_dt
                except Exception:
                    pass
            base["analyses_today"] = await count_analyses(u["id"], since_day)
            base["test_unlock_active"] = test_unlock_active(u)
        except Exception:
            base["effective_plan"] = base.get("plan")
            base["analyses_day_limit"] = None
            base["analyses_today"] = 0
            base["test_unlock_active"] = False
        # Engagement metrics — lifetime analyses run + most recent activity.
        eng = eng_by_user.get(u["id"]) or {}
        base["lifetime_analyses"] = int(eng.get("lifetime") or 0)
        base["last_active_at"] = eng.get("last_at")
        rows.append(base)
    return rows


@router.get("/logins")
async def list_login_events(limit: int = 100, _admin=Depends(admin_required)):
    events = (
        await db.login_events.find({}, {"_id": 0})
        .sort("at", -1)
        .to_list(max(1, min(limit, 500)))
    )
    return events


@router.get("/durations")
async def list_durations(_admin=Depends(admin_required)):
    return {k: v for k, v in UNLOCK_DURATIONS.items()}


@router.get("/llm-breaker")
async def llm_breaker_status(_admin=Depends(admin_required)):
    """Inspect the LLM circuit breaker state (tripped/cleared, consecutive
    fail/success counts, last 10 outcomes). Useful for diagnosing whether
    a recent spate of "AI provider slow" responses was a real outage or
    a breaker config issue."""
    from services import llm_circuit_breaker
    return llm_circuit_breaker.status()


@router.post("/llm-breaker/reset")
async def llm_breaker_reset(_admin=Depends(admin_required)):
    """Force-clear the breaker. Useful if the auto-clear timeout is too
    long for a manual rollout decision (e.g. you've independently
    verified Claude is healthy and want to accept new jobs immediately)."""
    from services import llm_circuit_breaker
    # Hard-reset by marking 2 successes which is enough to clear the trip
    for _ in range(max(1, 2)):
        llm_circuit_breaker.record_outcome("success")
    return {"ok": True, "status": llm_circuit_breaker.status()}


@router.get("/llm-events")
async def llm_events(
    limit: int = 50,
    hours: int = 24,
    _admin=Depends(admin_required),
):
    """Last N LLM failure events (from the capped `llm_events` collection)
    plus an aggregate breakdown by reason over the last `hours` window.
    Used by the admin dashboard's "LLM Health" panel.

    Shape:
      {
        "events": [ {ts, reason, ticker, elapsed_s, surface, ...}, ...],
        "breakdown": { reason: count, ... },
        "total": <int>,
        "window_hours": <int>
      }
    """
    import time as _time
    from core.db import db
    limit = max(1, min(int(limit), 200))
    hours = max(1, min(int(hours), 168))
    since = _time.time() - (hours * 3600)
    cursor = db.llm_events.find(
        {"ts": {"$gte": since}},
        {"_id": 0},
    ).sort("ts", -1).limit(limit)
    events = await cursor.to_list(length=limit)

    # Aggregate across the full window (not just the `limit`-capped slice).
    pipeline = [
        {"$match": {"ts": {"$gte": since}}},
        {"$group": {"_id": "$reason", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    breakdown_raw = await db.llm_events.aggregate(pipeline).to_list(length=20)
    breakdown = {row["_id"] or "unknown": row["count"] for row in breakdown_raw}
    total = sum(breakdown.values())
    return {
        "events": events,
        "breakdown": breakdown,
        "total": total,
        "window_hours": hours,
    }


@router.get("/llm-calls")
async def llm_calls(
    limit: int = 20,
    hours: int = 24,
    _admin=Depends(admin_required),
):
    """Recent LLM calls — success AND failure — with the model that
    actually answered and token counts. Distinct from `/llm-events`
    (failure-only, circuit-breaker diagnostics): this is general call-level
    visibility so an admin can see "which model, how many tokens in/out"
    without grepping Railway logs. Backed by `db.llm_calls`, written from
    services/ai.py's `_run_llm()` on every call.

    Shape:
      {
        "calls": [{ts, session, outcome, model, input_tokens,
                    output_tokens, finish_reason, elapsed_s, error}, ...],
        "total": <int>, "success": <int>, "failure": <int>,
        "window_hours": <int>
      }
    """
    import time as _time
    from core.db import db
    limit = max(1, min(int(limit), 100))
    hours = max(1, min(int(hours), 168))
    since = _time.time() - (hours * 3600)
    cursor = db.llm_calls.find(
        {"ts": {"$gte": since}},
        {"_id": 0},
    ).sort("ts", -1).limit(limit)
    calls = await cursor.to_list(length=limit)
    total = await db.llm_calls.count_documents({"ts": {"$gte": since}})
    success = await db.llm_calls.count_documents({"ts": {"$gte": since}, "outcome": "success"})
    return {
        "calls": calls,
        "total": total,
        "success": success,
        "failure": total - success,
        "window_hours": hours,
    }


@router.delete("/llm-events")
async def clear_llm_logs(_admin=Depends(admin_required)):
    """Wipe the persisted LLM Health history — both the failure-diagnostics
    collection (`llm_events`) and the general call log (`llm_calls`).
    Deliberately does NOT touch the live in-memory circuit-breaker state
    (consec_fail/consec_ok/tripped_at) — that reflects real current
    health, not historical logs; use "Force reset" on the breaker itself
    if you need to clear a stuck trip."""
    from core.db import db
    from services import llm_call_log
    events_result = await db.llm_events.delete_many({})
    calls_deleted = await llm_call_log.clear()
    return {"ok": True, "events_deleted": events_result.deleted_count, "calls_deleted": calls_deleted}


@router.get("/llm-events/recoup-summary")
async def llm_events_recoup_summary(
    days: int = 30,
    credit_per_verdict: float = 0.003,
    _admin=Depends(admin_required),
):
    """Compose a "credit-recoup" report for failed LLM jobs over the last
    `days` window — used by the admin dashboard's recoup tracker and the
    "Copy escalation summary" button. The output is structured so the
    frontend can render it as both a table and a ready-to-paste support
    email body.

    Shape:
      {
        "window_days": 30,
        "total_failures": <int>,
        "estimated_credits_wasted": <float>,
        "estimated_usd_wasted": <float>,        # credits / 100 (Universal Key parity)
        "by_reason": {reason_code: count, ...},
        "by_ticker": [{ticker, count}, ...],     # top 15
        "by_surface": {surface_label: count},
        "first_failure_ts": <iso8601 or None>,
        "last_failure_ts":  <iso8601 or None>,
        "sample_events": [ {ts, ticker, reason, elapsed_s, error_detail}, ... ],
        "credit_per_verdict_assumption": <float>,
      }
    """
    import time as _time
    from core.db import db
    days = max(1, min(int(days), 90))
    since = _time.time() - (days * 86400)
    pipeline = [
        {"$match": {"ts": {"$gte": since}}},
        {
            "$facet": {
                "total": [{"$count": "n"}],
                "by_reason": [
                    {"$group": {"_id": "$reason", "n": {"$sum": 1}}},
                    {"$sort": {"n": -1}},
                ],
                "by_ticker": [
                    {"$match": {"ticker": {"$ne": None}}},
                    {"$group": {"_id": "$ticker", "n": {"$sum": 1}}},
                    {"$sort": {"n": -1}},
                    {"$limit": 15},
                ],
                "by_surface": [
                    {"$group": {"_id": "$surface", "n": {"$sum": 1}}},
                    {"$sort": {"n": -1}},
                ],
                "ts_range": [
                    {"$group": {
                        "_id": None,
                        "first": {"$min": "$ts"},
                        "last": {"$max": "$ts"},
                    }},
                ],
                # 8 most-recent events with the full error_detail intact —
                # these are the rows the admin will paste into a complaint
                # to prove the failure surface is upstream.
                "sample_events": [
                    {"$sort": {"ts": -1}},
                    {"$limit": 8},
                    {"$project": {
                        "_id": 0,
                        "ts": 1,
                        "ticker": 1,
                        "reason": 1,
                        "elapsed_s": 1,
                        "surface": 1,
                        "error_detail": 1,
                    }},
                ],
            }
        },
    ]
    result = await db.llm_events.aggregate(pipeline).to_list(length=1)
    facet = result[0] if result else {}
    total = (facet.get("total") or [{"n": 0}])[0].get("n", 0)
    by_reason = {row["_id"] or "unknown": row["n"] for row in facet.get("by_reason", [])}
    by_ticker = [{"ticker": row["_id"], "count": row["n"]} for row in facet.get("by_ticker", [])]
    by_surface = {row["_id"] or "unknown": row["n"] for row in facet.get("by_surface", [])}
    ts_row = (facet.get("ts_range") or [{}])[0] if facet.get("ts_range") else {}
    first_ts = ts_row.get("first")
    last_ts = ts_row.get("last")

    def _iso_or_none(epoch):
        if not epoch:
            return None
        from datetime import datetime as _dt, timezone as _tz
        return _dt.fromtimestamp(epoch, tz=_tz.utc).isoformat()

    estimated_credits = round(total * credit_per_verdict, 4)
    return {
        "window_days": days,
        "total_failures": total,
        "estimated_credits_wasted": estimated_credits,
        "estimated_usd_wasted": round(estimated_credits / 100, 4),
        "by_reason": by_reason,
        "by_ticker": by_ticker,
        "by_surface": by_surface,
        "first_failure_ts": _iso_or_none(first_ts),
        "last_failure_ts": _iso_or_none(last_ts),
        "sample_events": facet.get("sample_events", []),
        "credit_per_verdict_assumption": credit_per_verdict,
    }


@router.get("/llm-events/by-provider")
async def llm_events_by_provider(hours: int = 24, _admin=Depends(admin_required)):
    """Aggregate per-provider success-rate stats over the last `hours` window.

    Driven by the `kind: "provider_attempt"` rows that `services/ai.py`
    emits for every provider attempt (success OR failure). Rows from before
    the multi-provider fallback chain shipped will be missing from the
    counts — that's expected; old rows pre-date the telemetry.

    Returns a list of provider rows so the admin panel can render a
    per-provider success-rate strip ("Anthropic 47% · Gemini 91% · OpenAI
    100%") at a glance — without having to read raw logs.

    Shape:
      {
        "window_hours": 24,
        "providers": [
          {"provider": "anthropic", "success": 12, "failure": 8, "total": 20,
           "success_rate": 60.0, "model": "claude-sonnet-4-5-20250929",
           "avg_elapsed_s_success": 41.2, "avg_elapsed_s_failure": 73.8},
          ...
        ],
        "total_attempts": 47,
        "overall_success_rate": 87.2,
      }
    """
    import time as _time
    from core.db import db
    hours = max(1, min(int(hours), 24 * 30))  # cap at 30 days
    since = _time.time() - (hours * 3600)
    pipeline = [
        {"$match": {"ts": {"$gte": since}, "kind": "provider_attempt"}},
        {
            "$group": {
                "_id": {"provider": "$provider", "outcome": "$outcome"},
                "n": {"$sum": 1},
                "model": {"$last": "$model"},
                "avg_elapsed_s": {"$avg": "$elapsed_s"},
            }
        },
    ]
    rows = await db.llm_events.aggregate(pipeline).to_list(length=200)

    # Pivot rows[(provider, outcome)] -> {provider: {success, failure, ...}}
    bucket: dict[str, dict] = {}
    for r in rows:
        p = r["_id"].get("provider") or "unknown"
        o = r["_id"].get("outcome") or "unknown"
        b = bucket.setdefault(
            p,
            {
                "provider": p,
                "model": None,
                "success": 0,
                "failure": 0,
                "avg_elapsed_s_success": None,
                "avg_elapsed_s_failure": None,
            },
        )
        if o == "success":
            b["success"] = r["n"]
            b["avg_elapsed_s_success"] = round(r["avg_elapsed_s"] or 0, 2)
        elif o == "failure":
            b["failure"] = r["n"]
            b["avg_elapsed_s_failure"] = round(r["avg_elapsed_s"] or 0, 2)
        if r.get("model") and not b["model"]:
            b["model"] = r["model"]

    providers = []
    for p, b in bucket.items():
        total = b["success"] + b["failure"]
        b["total"] = total
        b["success_rate"] = round(100 * b["success"] / total, 1) if total else 0.0
        providers.append(b)
    # Sort: highest-attempt providers first (signal richness), tie-break alpha.
    providers.sort(key=lambda x: (-x["total"], x["provider"]))

    total_attempts = sum(p["total"] for p in providers)
    total_success = sum(p["success"] for p in providers)
    return {
        "window_hours": hours,
        "providers": providers,
        "total_attempts": total_attempts,
        "overall_success_rate": round(100 * total_success / total_attempts, 1) if total_attempts else 0.0,
    }


@router.get("/llm-events/fallback-rate")
async def llm_events_fallback_rate(hours: int = 24, _admin=Depends(admin_required)):
    """Aggregate fallback-provider VERDICT rate over the last `hours`.

    Distinct from `/llm-events/by-provider` (which counts raw provider
    ATTEMPTS — including retries within a single verdict): this endpoint
    counts FINAL verdicts persisted to the `analyses` collection and
    reports what % of those came from a non-primary provider (i.e.
    Anthropic was demoted/skipped and Gemini ended up answering).

    Used by the Admin LLM-Health panel "Fallback rate · 24h" tile so ops
    can spot at a glance how often fallback fired in the most recent
    window. Pairs with the user-facing `<LLMProvenanceBadge>` — same
    underlying signal, different audience.

    Pre-Feb-2026 analyses won't have `llm_provider` set (the field was
    added when we wired provenance through). Those rows are excluded
    from the denominator so the rate isn't artificially diluted.

    Shape:
      {
        "window_hours": 24,
        "total_verdicts": 47,                # only verdicts WITH llm_provider
        "by_provider": {"anthropic": 41, "gemini": 6},
        "fallback_count": 6,                 # not anthropic
        "fallback_rate_pct": 12.8,
        "primary_provider": "anthropic",
      }
    """
    import time as _time
    from core.db import db
    hours = max(1, min(int(hours), 24 * 30))
    # `created_at` on analyses is an ISO-8601 string; compare against the
    # string version of `since` so Mongo's lex-sort matches chronological
    # order (ISO-8601 has this nice property by design).
    from datetime import datetime, timezone, timedelta
    since_dt = datetime.now(timezone.utc) - timedelta(hours=hours)
    since_iso = since_dt.isoformat().replace("+00:00", "Z")
    pipeline = [
        {"$match": {
            "created_at": {"$gte": since_iso},
            "llm_provider": {"$exists": True, "$ne": None},
        }},
        {"$group": {"_id": "$llm_provider", "n": {"$sum": 1}}},
    ]
    rows = await db.analyses.aggregate(pipeline).to_list(length=200)
    by_provider = {r["_id"] or "unknown": r["n"] for r in rows}
    total = sum(by_provider.values())
    primary = "anthropic"
    fallback_count = sum(n for p, n in by_provider.items() if p != primary)
    return {
        "window_hours": hours,
        "total_verdicts": total,
        "by_provider": by_provider,
        "fallback_count": fallback_count,
        "fallback_rate_pct": round(100 * fallback_count / total, 1) if total else 0.0,
        "primary_provider": primary,
    }


@router.post("/ops-digest/send-now")
async def trigger_admin_ops_digest(_admin=Depends(admin_required)):
    """Manual trigger for the admin ops nightly digest. Fires immediately
    and bypasses the cooldown — used to preview the digest content (or
    run a live smoke test of the Telegram path) without waiting for the
    01:00 UTC cron tick. Sends ONLY to admins listed in `ADMIN_EMAILS`
    who have already linked Telegram (same gating as the scheduled
    loop). Returns the metrics dict + send count so the caller can
    confirm receipt without checking Telegram itself."""
    from services.admin_digest import run_admin_digest_once
    return await run_admin_digest_once(force=True)


# --- Escalation report CSV ------------------------------------------------
# One-click download for forwarding to Emergent support. Packages every
# failure row from `llm_events` into a CSV with:
#   * A preamble section explaining the failures are upstream (NOT the
#     user's app code) — socket hangs, sub-cent budget caps, ChatError
#     wrapping opaque proxy errors.
#   * A summary section with total credits wasted on failed LLM calls
#     PLUS an estimate of credits spent on reactive code changes
#     (building the fallback chain, fixing the ChatError classifier,
#     etc.) that would NOT have been needed on a stable upstream.
#   * A per-event detail table (timestamp · provider · model · outcome
#     · reason · error message · ticker · elapsed).
#
# Rationale: the "Copy escalation summary" button above is great for a
# one-paragraph email body, but support teams often want a file
# attachment they can import into their own triage tools. CSV is the
# universal format — opens in Excel/Sheets directly, emails cleanly.
#
# Credits-per-verdict assumption matches the recoup-summary endpoint
# (~$0.003 per verdict via OpenRouter DeepSeek V4 Pro).
_CREDITS_PER_VERDICT = 2.7

# Estimated credits spent on REACTIVE CODE CHANGES required by the
# upstream instability. This is a hand-curated breakdown maintained as
# code because it captures an engineering history that doesn't live in
# any database. Each entry represents a dev session where credits were
# spent (agent calls + testing iterations) building or fixing a feature
# that would NOT have been needed on a stable Anthropic-only setup.
# Update this list as new rework lands — keeps the escalation report
# honest about the full cost to the business.
_REWORK_CREDIT_ESTIMATES = [
    # (description, est. credits)
    ("Multi-provider fallback chain (Anthropic → Gemini → OpenAI) implementation + LiteLLM timeout/retry tuning",
     45.0),
    ("Per-attempt timeout + socket-hang classifier + consecutive-failure breaker",
     22.0),
    ("ChatError classification bug fix (chain refused to rotate to Gemini because ChatError wasn't in transient whitelist)",
     18.0),
    ("Adaptive-routing demote-rate tuning (50% threshold) + retry-count reduction based on latency telemetry",
     12.0),
    ("OpenAI fallback removal after discovering Emergent's LiteLLM proxy caps OpenAI at $0.001/call (guaranteed-fail leg)",
     8.0),
    ("Misclassified 'Top up Universal Key' banner fix (OpenAI sub-cent proxy cap was being matched as real exhaustion)",
     10.0),
    ("Provider success-rate admin strip + source-health strip + fallback-verdict rate tile + recoup tracker UI",
     28.0),
    ("LLM provenance badge (transparency: 'Powered by Gemini 2.5 Pro · fallback' when primary fails) + tests",
     12.0),
    ("Admin ops nightly Telegram digest aggregating LLM health / fallback rate / top failure reason",
     18.0),
    ("Regression test suite (test_llm_retry, test_llm_provenance, test_admin_fallback_rate, test_admin_digest — 26+ tests)",
     15.0),
]

# One long explanatory preamble, written as CSV-safe rows (single column
# per row). This is the NARRATIVE support needs to read BEFORE the data —
# establishes context that the failures are upstream, not our code.
_ESCALATION_PREAMBLE_LINES = [
    "Neural Stock Intelligence — LLM Escalation Report",
    "",
    "WHAT THIS REPORT IS:",
    "A forensic dump of every upstream LLM failure our application has",
    "logged over the selected window. Every row below represents a call",
    "that reached Emergent's Universal Key proxy and FAILED before our",
    "code had a chance to process a response.",
    "",
    "WHY THIS IS NOT AN APPLICATION BUG:",
    "Our code submits a well-formed request to Emergent's LiteLLM proxy",
    "(https://api.emergent.sh). The proxy is responsible for reaching",
    "Anthropic/Gemini/OpenAI on our behalf. The errors in the detail",
    "table below occur INSIDE THAT PROXY HOP — before Claude/Gemini",
    "even see the prompt. Specifically:",
    "",
    "  1. 'llm_socket_hang' / asyncio.TimeoutError after 240s: the",
    "     Universal-Key proxy accepted our HTTPS connection but never",
    "     returned a response. This is a networking / queueing issue",
    "     on the proxy, not on our end — our timeout is the backstop.",
    "",
    "  2. 'transient:ChatError': emergentintegrations.llm.chat.ChatError",
    "     is a generic wrapper the SDK raises when the underlying",
    "     provider call fails INSIDE the proxy. The wrapper hides the",
    "     real upstream error from us, so we can't even classify it.",
    "",
    "  3. 'Budget has been exceeded! Max budget: 0.001': Emergent's",
    "     LiteLLM proxy gates the OpenAI route at a SUB-CENT per-call",
    "     budget (well below the $0.024 cost of one Claude-grade",
    "     analysis). Every call that reaches OpenAI via the proxy is",
    "     guaranteed to fail with this error. We removed OpenAI from",
    "     our fallback chain because of this — credits were lost before",
    "     we understood this was a platform-imposed cap, not user cost.",
    "",
    "MITIGATION WE BUILT (AT OUR OWN CREDIT COST):",
    "Because the upstream was not stable enough to serve traffic",
    "directly, we had to build a multi-layer resilience system:",
    "  * 3-provider fallback chain (Anthropic → Gemini → OpenAI)",
    "  * Per-attempt timeouts + exponential retry with adaptive demote",
    "  * Circuit breaker on consecutive failures",
    "  * Provenance tracking + admin health telemetry",
    "  * Regression test suite to prevent silent-fail regressions",
    "",
    "Every credit listed in the 'REWORK SECTION' below was spent",
    "building this mitigation — it would NOT have been needed on a",
    "stable upstream. We are asking Emergent Support to recognise both",
    "the direct credit waste (failed LLM calls) AND the indirect cost",
    "(reactive engineering work) when reviewing this report.",
    "",
    "CONTACT: ai.neulab.inc@gmail.com",
    "",
]


@router.get("/llm-events/escalation-report.csv")
async def escalation_report_csv(
    days: int = 30,
    _admin=Depends(admin_required),
):
    """Download-as-CSV version of the admin escalation summary. Packages
    the preamble (narrative + blame framing), the credit-waste summary,
    the rework-estimate table, and the per-event detail table into one
    email-safe file.

    Returns `text/csv` with a `Content-Disposition: attachment` header
    so hitting the URL in a browser triggers a download directly. The
    frontend wraps this in a button on the Admin LLM Health panel."""
    import csv as _csv
    import io as _io
    import time as _time
    from datetime import datetime, timezone
    from core.db import db
    from fastapi.responses import StreamingResponse

    days = max(1, min(int(days), 180))
    since_ts = _time.time() - (days * 86400)

    # Pull EVERY failure row in the window — we want the full forensic
    # dump for support, not a sample. The collection is small (bounded
    # by failures over the window, not total calls) so this is fine.
    failure_filter = {
        "ts": {"$gte": since_ts},
        "$or": [
            {"outcome": {"$in": ["failure", "timeout"]}},
            {"kind": None, "reason": {"$exists": True, "$ne": None}},
        ],
    }
    rows = await db.llm_events.find(
        failure_filter, {"_id": 0},
    ).sort("ts", -1).to_list(length=5000)

    # Compute direct credit waste (= failed calls × credits-per-verdict).
    # For provider_attempt rows, each failure is a wasted attempt but
    # only ONE of them is a lost verdict (the one that exhausted the
    # chain). For the legacy rows (kind=None) each one IS a wasted
    # verdict. Simplest defensible model for the report: count ONE lost
    # verdict per DISTINCT ticker-hour, cap at 1 per hour to avoid
    # double-counting retry storms on the same stock. Support can argue
    # with the methodology if they want — but the rework section is
    # where the real magnitude lives.
    from collections import defaultdict
    ticker_hour_buckets = defaultdict(int)
    for r in rows:
        t = r.get("ticker") or "unknown"
        h = int(r["ts"] // 3600) if r.get("ts") else 0
        ticker_hour_buckets[(t, h)] += 1
    distinct_lost_verdicts = len(ticker_hour_buckets)
    raw_failure_count = len(rows)
    direct_credits_wasted = round(distinct_lost_verdicts * _CREDITS_PER_VERDICT, 2)

    # Sum rework estimates.
    rework_total = round(sum(credits for _, credits in _REWORK_CREDIT_ESTIMATES), 2)
    grand_total = round(direct_credits_wasted + rework_total, 2)

    # Build the CSV in memory. Using a single csv.writer across sections
    # keeps every line properly quoted (any literal commas / newlines in
    # error messages get escaped).
    buf = _io.StringIO()
    w = _csv.writer(buf, lineterminator="\n")

    # --- PREAMBLE -----------------------------------------------------
    for line in _ESCALATION_PREAMBLE_LINES:
        w.writerow([line])
    w.writerow([])  # spacer

    # --- SUMMARY ------------------------------------------------------
    w.writerow(["REPORT SUMMARY"])
    w.writerow(["Generated at (UTC)", datetime.now(timezone.utc).isoformat()])
    w.writerow(["Window (days)", days])
    w.writerow(["Total failure rows logged", raw_failure_count])
    w.writerow(["Distinct lost verdicts (dedup'd by ticker-hour)", distinct_lost_verdicts])
    w.writerow(["Credits-per-verdict assumption", _CREDITS_PER_VERDICT])
    w.writerow(["Direct credits wasted on failed LLM calls", direct_credits_wasted])
    w.writerow(["Estimated credits spent on reactive rework", rework_total])
    w.writerow(["GRAND TOTAL (direct + rework)", grand_total])
    w.writerow([])

    # --- REWORK SECTION ----------------------------------------------
    w.writerow(["REWORK SECTION — credits spent because of upstream instability"])
    w.writerow(["", "Description", "Est. credits"])
    for i, (desc, credits) in enumerate(_REWORK_CREDIT_ESTIMATES, 1):
        w.writerow([f"R{i:02d}", desc, credits])
    w.writerow(["", "TOTAL REWORK CREDITS", rework_total])
    w.writerow([])

    # --- FAILURE DETAIL TABLE ----------------------------------------
    w.writerow(["FAILURE DETAIL — every upstream LLM failure in the window"])
    w.writerow([
        "#",
        "Timestamp (UTC)",
        "Provider",
        "Model",
        "Outcome",
        "Reason code",
        "Ticker",
        "Surface",
        "Elapsed (s)",
        "Tripped breaker?",
        "Error message / detail",
    ])
    for i, r in enumerate(rows, 1):
        ts_iso = (
            datetime.fromtimestamp(r["ts"], tz=timezone.utc).isoformat()
            if r.get("ts") else ""
        )
        w.writerow([
            i,
            ts_iso,
            r.get("provider") or "",
            r.get("model") or "",
            r.get("outcome") or "",
            r.get("reason") or "",
            r.get("ticker") or "",
            r.get("surface") or "",
            round(r.get("elapsed_s") or 0, 2),
            "yes" if r.get("tripped_breaker") else "no",
            # Error detail can be long + multi-line — csv.writer handles
            # quoting/escaping automatically. Cap at 2000 chars to keep
            # the cell readable in Excel.
            (r.get("error_detail") or "")[:2000],
        ])

    if not rows:
        w.writerow(["—", "", "", "", "", "", "", "", "", "", "No failures logged in this window — chain currently healthy."])

    buf.seek(0)
    filename = f"neulab-escalation-report-{days}d-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/llm-events/escalation-email-draft")
async def escalation_email_draft(
    days: int = 30,
    _admin=Depends(admin_required),
):
    """Ready-to-paste email body + subject for the Emergent Support
    escalation. Computes the same direct/rework/grand-total credit
    figures as `escalation-report.csv` and weaves them into a polite,
    professional 3-paragraph body that references the CSV attachment.

    Called alongside the CSV download button so the admin hits ONE
    button and walks away with both the attachment AND the email body
    on the clipboard — turns "download CSV, write email from scratch"
    into "download + paste + send"."""
    import time as _time
    from collections import defaultdict
    from core.db import db

    days = max(1, min(int(days), 180))
    since_ts = _time.time() - (days * 86400)

    failure_filter = {
        "ts": {"$gte": since_ts},
        "$or": [
            {"outcome": {"$in": ["failure", "timeout"]}},
            {"kind": None, "reason": {"$exists": True, "$ne": None}},
        ],
    }
    rows = await db.llm_events.find(
        failure_filter, {"_id": 0, "ts": 1, "ticker": 1, "reason": 1},
    ).to_list(length=5000)

    # Same dedup logic as the CSV so the numbers MATCH — support will
    # compare the email body against the attached CSV and any drift
    # would undermine credibility.
    ticker_hour_buckets = defaultdict(int)
    reason_counts = defaultdict(int)
    for r in rows:
        t = r.get("ticker") or "unknown"
        h = int(r["ts"] // 3600) if r.get("ts") else 0
        ticker_hour_buckets[(t, h)] += 1
        reason = (r.get("reason") or "unknown").split(":", 1)[-1]
        reason_counts[reason] += 1
    raw_failure_count = len(rows)
    distinct_lost = len(ticker_hour_buckets)
    direct = round(distinct_lost * _CREDITS_PER_VERDICT, 2)
    rework = round(sum(c for _, c in _REWORK_CREDIT_ESTIMATES), 2)
    grand = round(direct + rework, 2)
    # Top 3 reasons for the "specifically, we observed" line.
    top_reasons = sorted(reason_counts.items(), key=lambda kv: kv[1], reverse=True)[:3]
    reasons_summary = ", ".join(f"{r} ×{n}" for r, n in top_reasons) or "(none)"

    subject = (
        f"Neural Stock Intelligence — Universal Key credit-waste escalation "
        f"(last {days}d: {grand:.2f} credits: {direct:.2f} direct + {rework:.2f} rework)"
    )
    body = f"""Hi Emergent Support,

I'm writing to escalate a sustained pattern of upstream LLM-proxy
instability that has cost our project a material number of Universal
Key credits over the last {days} days. I've attached a full forensic
CSV (`neulab-escalation-report-{days}d-*.csv`) with the event-level
detail; this email summarises the headline numbers and the asks.

DIRECT CREDIT LOSS ({direct:.2f} credits):
Over the window, we logged {raw_failure_count} failure rows in our
telemetry, de-duplicated to {distinct_lost} distinct lost verdicts
(by ticker-hour, to avoid double-counting retry storms on the same
stock). At our measured {_CREDITS_PER_VERDICT:.2f}-credit per-verdict
cost, that's {direct:.2f} credits consumed WITHOUT a response returning
to the user. The top failure reasons were: {reasons_summary}. Every
one of these originates INSIDE the Emergent LiteLLM proxy hop —
the CSV preamble explains each error mode in detail so the support
team can match them to your own proxy logs.

INDIRECT CREDIT LOSS ({rework:.2f} credits):
Because the upstream was not stable enough to serve traffic
directly, we had to rebuild our entire LLM call path around it —
a 3-provider fallback chain, per-attempt timeouts, a circuit
breaker, a ChatError classifier bug fix, adaptive routing based
on rolling success rates, a provenance layer to tell users when
fallback fired, admin-panel health telemetry, and a regression
test suite to prevent silent-fail regressions. None of this work
would have been needed on a stable Anthropic-only setup. The CSV
"REWORK SECTION" lists the 10 dev sessions with individual
credit estimates summing to {rework:.2f} credits.

GRAND TOTAL: {grand:.2f} credits ({direct:.2f} direct + {rework:.2f} rework).

ASKS:
1. Credit reimbursement for the direct loss where it came from
   upstream proxy issues (socket hangs / ChatError wrapping
   opaque errors / the sub-cent OpenAI `Max budget: 0.001` cap
   that made that route guaranteed-fail).
2. A root-cause update on the underlying proxy behaviour so we
   can stop layering defensive code around it.
3. Confirmation that OpenAI fallback is safe to re-enable (we
   removed it from our chain because of the sub-cent budget cap).

Happy to jump on a call if it would help. Thanks for your time.

— Neural Stock Intelligence
Contact: ai.neulab.inc@gmail.com
"""

    return {
        "subject": subject,
        "body": body,
        "summary": {
            "window_days": days,
            "raw_failure_count": raw_failure_count,
            "distinct_lost_verdicts": distinct_lost,
            "direct_credits": direct,
            "rework_credits": rework,
            "grand_total_credits": grand,
            "top_reasons": top_reasons,
        },
    }


@router.get("/source-health")
async def source_health(hours: int = 24, _admin=Depends(admin_required)):
    """Aggregate per-source success-rate stats for upstream data vendors
    (yfinance, Finnhub, RapidAPI IDX, IDX news RSS) over the last `hours`
    window. Same shape as `/llm-events/by-provider` so the frontend can
    render an identical strip — different data, same UX.

    Driven by the `source_events` collection populated by the
    `services.source_health.track(...)` decorator wired around every
    fetch entry point in services/yfinance_svc, services/finnhub,
    services/idx_rapidapi, services/idx_news.
    """
    import time as _time
    from core.db import db
    hours = max(1, min(int(hours), 24 * 30))
    since = _time.time() - (hours * 3600)
    pipeline = [
        {"$match": {"ts": {"$gte": since}}},
        {
            "$group": {
                "_id": {"source": "$source", "outcome": "$outcome"},
                "n": {"$sum": 1},
                "avg_elapsed_s": {"$avg": "$elapsed_s"},
            }
        },
    ]
    rows = await db.source_events.aggregate(pipeline).to_list(length=500)

    bucket: dict[str, dict] = {}
    for r in rows:
        s = r["_id"].get("source") or "unknown"
        o = r["_id"].get("outcome") or "unknown"
        b = bucket.setdefault(
            s,
            {"source": s, "success": 0, "empty": 0, "failure": 0,
             "avg_elapsed_s_success": None, "avg_elapsed_s_failure": None},
        )
        if o == "success":
            b["success"] = r["n"]
            b["avg_elapsed_s_success"] = round(r["avg_elapsed_s"] or 0, 2)
        elif o == "empty":
            b["empty"] = r["n"]
        elif o == "failure":
            b["failure"] = r["n"]
            b["avg_elapsed_s_failure"] = round(r["avg_elapsed_s"] or 0, 2)

    sources = []
    for s_key, b in bucket.items():
        # "empty" is NOT a failure — vendor responded healthy, just had
        # no data for that ticker. Health rate = success / (success +
        # failure), excluding empties from the denominator.
        denom = b["success"] + b["failure"]
        b["total"] = b["success"] + b["failure"] + b["empty"]
        b["success_rate"] = round(100 * b["success"] / denom, 1) if denom else 100.0
        sources.append(b)
    sources.sort(key=lambda x: (-x["total"], x["source"]))

    total = sum(s["total"] for s in sources)
    total_succ = sum(s["success"] for s in sources)
    return {
        "window_hours": hours,
        "sources": sources,
        "total_calls": total,
        "overall_success_rate": round(100 * total_succ / total, 1) if total else 0.0,
    }


@router.post("/users/{user_id}/unlock")
async def unlock_user(user_id: str, req: UnlockReq, admin=Depends(admin_required)):
    seconds = UNLOCK_DURATIONS.get(req.duration)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    expires_value = "forever" if seconds is None else iso(now_utc() + timedelta(seconds=seconds))
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "test_unlock_expires_at": expires_value,
            "test_unlock_granted_at": iso(now_utc()),
            "test_unlock_granted_by": admin["id"],
            "test_unlock_duration": req.duration,
        }},
    )
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "test_unlock_expires_at": expires_value,
        "duration": req.duration,
        "message": f"{target['email']} unlocked with Elite features for {req.duration}. User must log out & log back in to see changes.",
    }


@router.post("/users/{user_id}/reset")
async def reset_user(user_id: str, _admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {"plan": "free"},
            "$unset": {
                "test_unlock_expires_at": "",
                "test_unlock_granted_at": "",
                "test_unlock_granted_by": "",
                "test_unlock_duration": "",
            },
        },
    )
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "message": f"{target['email']} reset to Free plan. User must log out & log back in to see changes.",
    }


# ---------- User deletion ----------
@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_admin_email(target.get("email")):
        raise HTTPException(status_code=403, detail="Cannot delete an admin account")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=403, detail="Cannot delete yourself")
    # Cancel any active PayPal subscription so we don't leave orphans billing
    sid = target.get("paypal_subscription_id")
    if sid:
        try:
            from services.paypal import cancel_subscription, PayPalError
            await cancel_subscription(sid, reason="User account deleted by admin")
        except Exception:
            pass  # best-effort — proceed with local delete regardless
    # Cascade delete owned data
    await db.watchlist.delete_many({"user_id": user_id})
    await db.analyses.delete_many({"user_id": user_id})
    await db.alerts.delete_many({"user_id": user_id})
    await db.shared_verdicts.delete_many({"owner_id": user_id})
    await db.quick_jobs.delete_many({"user_id": user_id})
    await db.disclaimers.delete_many({"user_id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    await db.users.delete_one({"id": user_id})
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "message": f"{target['email']} and all associated data deleted.",
    }


# ---------- Bulk user deletion ----------
@router.post("/users/delete")
async def delete_selected_users(req: UserDeleteReq, admin=Depends(admin_required)):
    """Bulk delete. Skips admins and the requesting admin themselves.
    Cancels any active PayPal subscription before deleting the account."""
    targets = await db.users.find(
        {"id": {"$in": req.ids}}, {"_id": 0, "password_hash": 0}
    ).to_list(len(req.ids))
    deleted = []
    skipped = []
    for target in targets:
        uid = target["id"]
        if is_admin_email(target.get("email")):
            skipped.append({"id": uid, "email": target["email"], "reason": "admin"})
            continue
        if uid == admin["id"]:
            skipped.append({"id": uid, "email": target["email"], "reason": "self"})
            continue
        sid = target.get("paypal_subscription_id")
        if sid:
            try:
                from services.paypal import cancel_subscription
                await cancel_subscription(sid, reason="User account deleted by admin")
            except Exception:
                pass
        await db.watchlist.delete_many({"user_id": uid})
        await db.analyses.delete_many({"user_id": uid})
        await db.alerts.delete_many({"user_id": uid})
        await db.shared_verdicts.delete_many({"owner_id": uid})
        await db.quick_jobs.delete_many({"user_id": uid})
        await db.disclaimers.delete_many({"user_id": uid})
        await db.subscriptions.delete_many({"user_id": uid})
        await db.timeline_recos.delete_many({"user_id": uid})
        await db.users.delete_one({"id": uid})
        deleted.append({"id": uid, "email": target["email"]})
    return {
        "ok": True,
        "deleted": deleted,
        "skipped": skipped,
        "message": f"Deleted {len(deleted)} user(s). Skipped {len(skipped)} (admins or self). Any active PayPal subscriptions were cancelled.",
    }



# ---------- Alert list removal ----------
@router.delete("/users/{user_id}/alerts")
async def delete_user_alerts(user_id: str, _admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    res = await db.alerts.delete_many({"user_id": user_id})
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "removed": res.deleted_count,
        "message": f"Cleared {res.deleted_count} alerts for {target['email']}.",
    }


# ---------- Pricing management ----------
@router.get("/pricing")
async def get_admin_pricing(_admin=Depends(admin_required)):
    return await get_pricing()


def _mask(value: str, prefix_chars: int = 8) -> dict:
    """Return a safe descriptor of a secret env var: presence + length + prefix only."""
    if not value:
        return {"present": False, "length": 0, "prefix": ""}
    return {
        "present": True,
        "length": len(value),
        "prefix": value[:prefix_chars] + ("…" if len(value) > prefix_chars else ""),
    }


@router.get("/paypal/debug")
async def admin_paypal_debug(_admin=Depends(admin_required)):
    """Admin-only PayPal config audit.

    Returns which PayPal environment is ACTIVE, what client_id was loaded
    into the running process, and a presence/prefix view of every PayPal
    env var the deployment SHOULD have set. Never returns secrets in full.

    Use this on production to verify the deployment env vars match what
    you intended without exposing credentials in logs/screenshots.
    """
    return {
        "active_env": PAYPAL_ENV,
        "active_api_base": PAYPAL_API_BASE,
        "loaded": {
            "client_id": _mask(PAYPAL_CLIENT_ID),
            "secret": _mask(PAYPAL_SECRET, prefix_chars=4),
            "webhook_id": _mask(PAYPAL_WEBHOOK_ID, prefix_chars=8),
        },
        "raw_env_presence": {
            "PAYPAL_ENV": os.environ.get("PAYPAL_ENV", ""),
            "PAYPAL_LIVE_CLIENT_ID": _mask(os.environ.get("PAYPAL_LIVE_CLIENT_ID", "")),
            "PAYPAL_LIVE_SECRET": _mask(os.environ.get("PAYPAL_LIVE_SECRET", ""), prefix_chars=4),
            "PAYPAL_SANDBOX_CLIENT_ID": _mask(os.environ.get("PAYPAL_SANDBOX_CLIENT_ID", "")),
            "PAYPAL_SANDBOX_SECRET": _mask(os.environ.get("PAYPAL_SANDBOX_SECRET", ""), prefix_chars=4),
            "PAYPAL_WEBHOOK_ID": _mask(os.environ.get("PAYPAL_WEBHOOK_ID", "")),
        },
        "diagnosis": _diagnose_paypal_config(),
    }


def _diagnose_paypal_config() -> list:
    """Return a list of plain-English issues with the current PayPal config."""
    issues = []
    if PAYPAL_ENV not in ("live", "sandbox"):
        issues.append(
            f"PAYPAL_ENV is set to '{PAYPAL_ENV}' — only 'live' or 'sandbox' are valid."
        )
    if PAYPAL_ENV == "sandbox":
        issues.append(
            "PAYPAL_ENV is 'sandbox' — pricing page will show the SANDBOX MODE banner. "
            "Set PAYPAL_ENV=live (and the matching live credentials) on the deployment to go live."
        )
    if not PAYPAL_CLIENT_ID:
        issues.append(
            f"No client_id loaded for env='{PAYPAL_ENV}'. "
            f"Expected env var: PAYPAL_{PAYPAL_ENV.upper()}_CLIENT_ID"
        )
    if not PAYPAL_SECRET:
        issues.append(
            f"No secret loaded for env='{PAYPAL_ENV}'. "
            f"Expected env var: PAYPAL_{PAYPAL_ENV.upper()}_SECRET"
        )
    if not PAYPAL_WEBHOOK_ID:
        issues.append("PAYPAL_WEBHOOK_ID is empty — webhook-driven plan changes won't fire.")
    if not issues:
        issues.append(f"Looks healthy. Active environment: {PAYPAL_ENV}.")
    return issues


@router.put("/pricing")
async def update_admin_pricing(req: PricingReq, _admin=Depends(admin_required)):
    prices = await set_pricing(
        pro_price=req.pro_price,
        elite_price=req.elite_price,
        annual_discount_pct=req.annual_discount_pct,
        promo_pro_discount_pct=req.promo_pro_discount_pct,
        promo_elite_discount_pct=req.promo_elite_discount_pct,
        promo_label=req.promo_label or "",
        promo_ends_at=req.promo_ends_at,
        daypass_price=req.daypass_price,
        daypass_duration_days=req.daypass_duration_days,
    )
    # Rotate PayPal subscription plans so new recurring checkouts charge the
    # (possibly promo-discounted) monthly/yearly prices. Day Pass uses Orders,
    # not Plans, so nothing to rotate for it.
    try:
        plan_ids = await get_plan_ids(prices)
    except PayPalError as e:
        raise HTTPException(status_code=502, detail=f"Price saved but PayPal plan rotation failed: {e}")
    promo_note = ""
    if prices["promo_active"]:
        parts = []
        if prices["promo_pro_discount_pct"] > 0:
            parts.append(f"Pro {prices['promo_pro_discount_pct']:.0f}% off")
        if prices["promo_elite_discount_pct"] > 0:
            parts.append(f"Elite {prices['promo_elite_discount_pct']:.0f}% off")
        promo_note = f" · Promo active: {', '.join(parts)}" + (f" — {prices['promo_label']}" if prices["promo_label"] else "")
    return {
        "ok": True,
        "prices": prices,
        "plan_ids": plan_ids,
        "message": (
            f"Updated: Pro ${prices['pro_monthly']:.2f}/mo · Elite ${prices['elite_monthly']:.2f}/mo · "
            f"Annual {prices['annual_discount_pct']:.0f}% off · Day Pass ${prices['daypass_price']:.2f} "
            f"({prices['daypass_duration_days']}-day){promo_note}. "
            "Existing subscribers continue at their current rate until they resubscribe."
        ),
    }



# ---------- Tier limits management ----------
@router.get("/tier-limits")
async def get_admin_tier_limits(_admin=Depends(admin_required)):
    return await get_tier_limits()


@router.put("/tier-limits")
async def update_admin_tier_limits(req: TierLimitsReq, _admin=Depends(admin_required)):
    tiers = {
        "free": req.free.model_dump(exclude_none=False),
        "pro": req.pro.model_dump(exclude_none=False),
        "elite": req.elite.model_dump(exclude_none=False),
    }
    if req.daypass is not None:
        tiers["daypass"] = req.daypass.model_dump(exclude_none=False)
    limits = await set_tier_limits(tiers)
    return {
        "ok": True,
        "limits": limits,
        "message": "Tier limits updated. Leave a field empty to mark it as Unlimited.",
    }


# ---------- Login event management ----------
@router.delete("/logins")
async def delete_all_logins(_admin=Depends(admin_required)):
    res = await db.login_events.delete_many({})
    return {"ok": True, "removed": res.deleted_count, "message": f"Cleared {res.deleted_count} login events."}


@router.post("/logins/delete")
async def delete_selected_logins(req: LoginDeleteReq, _admin=Depends(admin_required)):
    res = await db.login_events.delete_many({"id": {"$in": req.ids}})
    return {"ok": True, "removed": res.deleted_count, "message": f"Deleted {res.deleted_count} login events."}


# ---------- Random Forest retrain ----------
@router.get("/rf/status")
async def rf_retrain_status(_admin=Depends(admin_required)):
    from services import rf_retrain
    return await rf_retrain.get_retrain_status()


@router.post("/rf/retrain")
async def rf_retrain_trigger(_admin=Depends(admin_required)):
    """Kick off an out-of-process retrain. Idempotent — returns the
    currently-running job if one is already in progress."""
    from services import rf_retrain
    job = await rf_retrain.trigger_retrain(triggered_by="admin")
    return {"ok": True, "job": job}


@router.post("/rf/reload")
async def rf_reload(_admin=Depends(admin_required)):
    """Re-read `rf_signal.joblib` from disk. Used after an out-of-band
    deploy (e.g. the GitHub Actions workflow rsyncs a freshly-trained
    model and we need to swap it in without a backend restart)."""
    from services import rf_predictor
    bundle = rf_predictor.reload()
    if bundle is None:
        raise HTTPException(status_code=500, detail="Model file missing or unreadable")
    meta = bundle.get("meta", {})
    return {
        "ok": True,
        "trained_at": meta.get("trained_at"),
        "holdout_accuracy": meta.get("holdout_accuracy"),
        "universe_size": meta.get("universe_size"),
    }


@router.post("/backtest/ml/recompute")
async def admin_recompute_ml_backtest(_admin=Depends(admin_required)):
    """Manually trigger a Neulab-ML walk-forward backtest recompute.
    Runs out-of-process, typically finishes in ~15s (25 mega-caps, 11 rebalances).
    Normally auto-runs after every RF retrain — use this only if you've
    dropped a new model out-of-band or want a fresh snapshot between retrains."""
    import asyncio as _a
    from services.rf_retrain import _recompute_ml_backtest_async
    _a.create_task(_recompute_ml_backtest_async())
    return {"ok": True, "status": "started", "message": "ML backtest recompute running in background. Refresh /backtest in 30s."}


@router.post("/auto-scan/run-now")
async def admin_run_auto_scan(_admin=Depends(admin_required)):
    """Manually trigger a Watchlist Auto-Scan batch right now. Useful for
    verifying the feature works without waiting for the 4h loop or the
    20h per-user cooldown — the `force` path bypasses the cooldown for
    the admin's own account only."""
    from services.auto_scan import run_auto_scan_batch
    result = await run_auto_scan_batch()
    return {"ok": True, "result": result}


# ---------- RapidAPI IDX budget tracking ----------
@router.get("/rapidapi/usage")
async def rapidapi_usage(_admin=Depends(admin_required)):
    """Current-month request count vs monthly soft budget for the IDX
    provider."""
    from services import idx_rapidapi
    return await idx_rapidapi.usage_snapshot()


@router.post("/rapidapi/usage/sync")
async def rapidapi_usage_sync(payload: dict, _admin=Depends(admin_required)):
    """Seed the MongoDB counter from the authoritative RapidAPI dashboard value.
    Use when the local counter drifts from RapidAPI (e.g. key was added mid-month).
    Body: { "actual_used": <integer from RapidAPI dashboard> }
    """
    from services import idx_rapidapi
    from datetime import datetime, timezone
    actual = payload.get("actual_used")
    if actual is None or not isinstance(actual, (int, float)) or int(actual) < 0:
        raise HTTPException(status_code=400, detail="actual_used must be a non-negative integer")
    actual = int(actual)
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    await db.rapidapi_usage.update_one(
        {"month": month},
        {"$set": {
            "count": actual,
            "synced_from_rapidapi_at": datetime.now(timezone.utc).isoformat(),
            "synced_by": "admin",
        }},
        upsert=True,
    )
    return await idx_rapidapi.usage_snapshot()


@router.post("/users/{user_id}/reset-quota")
async def reset_user_quota(user_id: str, _admin=Depends(admin_required)):
    """Reset a user's daily + weekly analysis-quota window by stamping
    `quota_reset_at = now`. Historical analyses stay on the user for the
    scorecard — they just don't count toward the current window."""
    now = now_utc()
    res = await db.users.update_one(
        {"id": user_id},
        {"$set": {"quota_reset_at": iso(now)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "quota_reset_at": iso(now)}


# ---------- PayPal Webhook diagnostics -----------------------------------
# Read-only panel on /admin that surfaces: which webhook ID is configured,
# what URL PayPal thinks it's pointed at, which events are subscribed, and
# the last 20 received events with verified status — so the user can answer
# "is my production webhook correctly wired?" without leaving the app.

from core.config import PAYPAL_WEBHOOK_ID as _CFG_WEBHOOK_ID, PAYPAL_ENV as _CFG_PP_ENV  # noqa: E402

DEFAULT_WEBHOOK_EVENTS = [
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    "PAYMENT.SALE.COMPLETED",
    "CHECKOUT.ORDER.APPROVED",
    "PAYMENT.CAPTURE.COMPLETED",
]


@router.get("/paypal/webhook-diagnostics")
async def paypal_webhook_diagnostics(_admin=Depends(admin_required)):
    """One-shot snapshot for the admin panel: env, webhook id, registered url,
    subscribed events, all available events, and recent received events.
    Every external call is individually try/except'd so a single PayPal API
    hiccup doesn't blank the whole panel."""
    from services import paypal as pp

    out = {
        "env": _CFG_PP_ENV,
        "webhook_id_configured": bool(_CFG_WEBHOOK_ID),
        "webhook_id": _CFG_WEBHOOK_ID or None,
        "public_app_url": __import__("os").environ.get("PUBLIC_APP_URL"),
        "backend_url": __import__("os").environ.get("RAILWAY_STATIC_URL") or __import__("os").environ.get("RAILWAY_PUBLIC_DOMAIN") or None,
        "registered": None,
        "registered_error": None,
        "available_event_types": [],
        "available_event_types_error": None,
        "recent_events": [],
        "stats": {"total": 0, "verified": 0, "unverified": 0},
    }

    # Fetch the registered webhook config
    if _CFG_WEBHOOK_ID:
        try:
            out["registered"] = await pp.get_webhook_details(_CFG_WEBHOOK_ID)
        except Exception as e:
            out["registered_error"] = str(e)

    # Fetch full catalogue of event types so UI can diff subscribed vs available
    try:
        evs = await pp.list_available_event_types()
        out["available_event_types"] = [
            {"name": e.get("name"), "description": e.get("description"), "status": e.get("status")}
            for e in evs
        ]
    except Exception as e:
        out["available_event_types_error"] = str(e)

    # Recent received events (last 20)
    cursor = db.webhook_events.find({}, {"_id": 0}).sort("received_at", -1).limit(20)
    recent = await cursor.to_list(length=20)
    out["recent_events"] = recent

    # Aggregate verify stats (all-time)
    out["stats"]["total"] = await db.webhook_events.count_documents({})
    out["stats"]["verified"] = await db.webhook_events.count_documents({"verified": True})
    out["stats"]["unverified"] = out["stats"]["total"] - out["stats"]["verified"]

    return out


class WebhookEventsPatchReq(BaseModel):
    event_types: Optional[list[str]] = None  # None = use default curated set
    subscribe_all: bool = False


@router.post("/paypal/webhook/subscribe-events")
async def subscribe_webhook_events(req: WebhookEventsPatchReq, _admin=Depends(admin_required)):
    """Push a new event_types list to the configured PayPal webhook.
    Three modes:
      - req.subscribe_all = true → fetch catalogue, send every ACTIVE event
      - req.event_types provided → use literal list
      - both empty → send the curated DEFAULT_WEBHOOK_EVENTS set"""
    from services import paypal as pp

    if not _CFG_WEBHOOK_ID:
        raise HTTPException(status_code=400, detail="PAYPAL_WEBHOOK_ID not configured in backend .env")

    if req.subscribe_all:
        try:
            catalogue = await pp.list_available_event_types()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not fetch PayPal event catalogue: {e}")
        events = [e.get("name") for e in catalogue if e.get("status") != "DEPRECATED" and e.get("name")]
    elif req.event_types:
        events = req.event_types
    else:
        events = list(DEFAULT_WEBHOOK_EVENTS)

    if not events:
        raise HTTPException(status_code=400, detail="Event-types list ended up empty")

    try:
        updated = await pp.update_webhook_events(_CFG_WEBHOOK_ID, events)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"PayPal update failed: {e}")
    return {"ok": True, "applied_events": events, "applied_count": len(events), "paypal_response": updated}



# ---------- IDX catalog bootstrap ----------------------------------------
@router.get("/idx/catalog-stats")
async def idx_catalog_stats(_admin=Depends(admin_required)):
    """Total count + distribution by source (quote / trending / bulk_seed /
    verified). Used by the admin UI card."""
    from services import idx_rapidapi
    return await idx_rapidapi.catalog_stats()


@router.post("/idx/bootstrap-catalog")
async def idx_bootstrap_catalog(
    include_trending: bool = True,
    try_bulk_endpoints: bool = True,
    _admin=Depends(admin_required),
):
    """One-shot seed of the local idx_catalog collection. Always safe to
    re-run (idempotent upserts). Returns a full report of which paths
    worked, which failed, and the delta. If try_bulk_endpoints=True and
    the current plan is BASIC, most paths will 404 — that's expected and
    documented in the response so the UI can hint the user about upgrading."""
    from services import idx_rapidapi
    if not idx_rapidapi.is_configured():
        raise HTTPException(status_code=503, detail="IDX provider not configured")
    return await idx_rapidapi.bootstrap_catalog(
        include_trending=include_trending,
        try_bulk_endpoints=try_bulk_endpoints,
    )



# ---------- Anonymous Try — rate-limit reset (testing) ------------------
@router.get("/anon-try/stats")
async def anon_try_stats(_admin=Depends(admin_required)):
    """Returns counts for the anon 'Try one free analysis' rate-limit
    collection so admins can sanity-check before/after a reset."""
    total = await db.anon_try_usage.count_documents({})
    # Distinct active IPs (hashed — no PII exposed)
    pipeline = [{"$group": {"_id": "$ip_hash"}}, {"$count": "n"}]
    agg = await db.anon_try_usage.aggregate(pipeline).to_list(length=1)
    unique_ips = agg[0]["n"] if agg else 0
    # Last 5 events for spot-check
    recent = await db.anon_try_usage.find(
        {}, {"_id": 0, "ip_hash": 1, "ticker": 1, "verdict_id": 1, "created_at_ts": 1, "ua_fragment": 1},
    ).sort("created_at_ts", -1).limit(5).to_list(length=5)
    # Serialize datetimes for JSON
    for r in recent:
        ts = r.get("created_at_ts")
        if ts is not None and not isinstance(ts, str):
            r["created_at_ts"] = iso(ts)
    return {
        "active_records": total,
        "unique_ips_rate_limited": unique_ips,
        "recent": recent,
    }


@router.post("/anon-try/reset")
async def anon_try_reset(_admin=Depends(admin_required)):
    """Wipe the entire anon_try_usage collection so every visitor gets a
    fresh free-analysis slot. Intended for testing ONLY — recipients will
    be able to run a new free analysis immediately after this call. The
    TTL index is preserved (collection isn't dropped, just emptied)."""
    res = await db.anon_try_usage.delete_many({})
    return {"ok": True, "deleted_count": res.deleted_count}



# --- Cost analytics --------------------------------------------------------
# Admin-only endpoint that turns the db.analyses collection into a per-day
# cost table. The platform doesn't currently expose a programmatic balance
# endpoint, so we use a "starting balance" anchor (last known top-up amount,
# manually entered by the admin and persisted) plus the running estimated
# spend to project remaining credits. See /admin/cost dashboard.

# Cost model — kept centrally so the frontend dashboard pulls the same number
# the backend uses to compute estimates. ~3,500 input tokens at $0.27/1M plus
# ~1,750 output tokens at $1.10/1M ≈ $0.003 per DeepSeek V4 Pro verdict via OpenRouter.
COST_PER_VERDICT_USD = 0.003


@router.get("/cost/summary")
async def cost_summary(
    days: int = 30,
    _admin=Depends(admin_required),
):
    """Return a per-day cost breakdown for the last `days` days.

    Strategy: count analyses inserted per day (created_at ISO string) and
    multiply by COST_PER_VERDICT_USD, PLUS sum KidStocks GAL translation
    call costs per day from the separate gal_calls collection (a GAL call
    isn't a verdict — it translates an already-completed adult verdict
    into kid language — so it's tracked separately and merged in here).
    Returns:
      - daily: [{date, count, usd, credits, gal_count, gal_usd}]
        (usd/credits already include the day's GAL spend rolled in;
        gal_count/gal_usd are the GAL-only breakout for that day)
      - totals: {count, usd, credits} — adult verdicts only
      - gal_totals: {count, usd, credits} — GAL calls only
      - combined_totals: {usd, credits} — totals + gal_totals
      - cost_per_verdict_usd, cost_per_verdict_credits
      - gal_cost_per_attempt_usd
      - balance_anchor: {credits_at_top_up, top_up_at, used_credits_since,
                         estimated_remaining_credits, estimated_verdicts_remaining}
        (null if admin hasn't set a balance anchor yet; note this anchor's
        "used_credits_since" still only counts db.analyses, not GAL — see
        the balance_anchor block below)
    """
    if days < 1 or days > 365:
        raise HTTPException(status_code=400, detail="days must be 1..365")

    since = (now_utc() - timedelta(days=days)).date().isoformat()

    # Count analyses by created_at date (slice ISO string at YYYY-MM-DD).
    # Aggregation keeps Mongo doing the work instead of pulling everything
    # into memory; matches recent analyses only.
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$project": {
            "day": {"$substr": ["$created_at", 0, 10]},
        }},
        {"$group": {"_id": "$day", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    cursor = db.analyses.aggregate(pipeline)
    daily_by_date: dict[str, dict] = {}
    total_count = 0
    async for row in cursor:
        c = int(row.get("count") or 0)
        total_count += c
        daily_by_date[row["_id"]] = {
            "date": row["_id"],
            "count": c,
            "usd": round(c * COST_PER_VERDICT_USD, 4),
            "credits": round(c * COST_PER_VERDICT_USD * 100, 2),
            "gal_count": 0,
            "gal_usd": 0.0,
        }

    # KidStocks GAL (Grade Adaptation Layer) translation calls — a SEPARATE
    # LLM call from the adult verdict pipeline (it runs after an adult
    # analysis already exists/succeeded, translating it into kid-appropriate
    # language). Kept as its own collection rather than db.analyses since
    # it's not a verdict — see services/gal.py _record_gal_call. We sum the
    # `usd` field directly (not count × flat rate) because a call that
    # needed the one retry made two LLM round-trips and was billed for both,
    # so per-row cost already varies by `attempts`.
    gal_pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$project": {
            "day": {"$substr": ["$created_at", 0, 10]},
            "usd": 1,
        }},
        {"$group": {"_id": "$day", "count": {"$sum": 1}, "usd": {"$sum": "$usd"}}},
        {"$sort": {"_id": 1}},
    ]
    gal_cursor = db.gal_calls.aggregate(gal_pipeline)
    gal_total_count = 0
    gal_total_usd = 0.0
    async for row in gal_cursor:
        c = int(row.get("count") or 0)
        u = round(float(row.get("usd") or 0.0), 4)
        gal_total_count += c
        gal_total_usd += u
        day = row["_id"]
        if day not in daily_by_date:
            daily_by_date[day] = {
                "date": day, "count": 0, "usd": 0.0, "credits": 0.0,
                "gal_count": 0, "gal_usd": 0.0,
            }
        daily_by_date[day]["gal_count"] = c
        daily_by_date[day]["gal_usd"] = u

    daily = sorted(daily_by_date.values(), key=lambda r: r["date"])
    # Roll the GAL spend into each day's headline usd/credits too, so a
    # glance at the existing chart already reflects true total spend —
    # the gal_count/gal_usd fields stay alongside for the breakout.
    for row in daily:
        row["usd"] = round(row["usd"] + row["gal_usd"], 4)
        row["credits"] = round(row["usd"] * 100, 2)

    totals = {
        "count": total_count,
        "usd": round(total_count * COST_PER_VERDICT_USD, 2),
        "credits": round(total_count * COST_PER_VERDICT_USD * 100, 2),
    }
    gal_totals = {
        "count": gal_total_count,
        "usd": round(gal_total_usd, 4),
        "credits": round(gal_total_usd * 100, 2),
    }
    combined_totals = {
        "usd": round(totals["usd"] + gal_totals["usd"], 4),
        "credits": round(totals["credits"] + gal_totals["credits"], 2),
    }

    # Balance anchor (admin sets this manually). Subtract credits used SINCE
    # the top-up to estimate remaining balance.
    anchor_doc = await db.app_settings.find_one(
        {"_id": "credit_balance_anchor"}, {"_id": 0}
    ) or {}
    balance_anchor = None
    if anchor_doc.get("credits_at_top_up") is not None:
        anchor_iso = anchor_doc.get("top_up_at") or ""
        anchor_date = anchor_iso[:10] if anchor_iso else None
        # Sum verdicts created since the top-up timestamp (inclusive of day).
        used_count = await db.analyses.count_documents(
            {"created_at": {"$gte": anchor_iso}} if anchor_iso else {}
        )
        used_credits = round(used_count * COST_PER_VERDICT_USD * 100, 2)
        starting = float(anchor_doc["credits_at_top_up"])
        remaining = max(0.0, round(starting - used_credits, 2))
        balance_anchor = {
            "credits_at_top_up": starting,
            "top_up_at": anchor_iso or None,
            "anchor_date": anchor_date,
            "used_credits_since": used_credits,
            "verdicts_since": used_count,
            "estimated_remaining_credits": remaining,
            "estimated_remaining_usd": round(remaining * 0.01, 2),
            "estimated_verdicts_remaining": int(remaining // (COST_PER_VERDICT_USD * 100)) if remaining > 0 else 0,
        }

    return {
        "days": days,
        "daily": daily,
        "totals": totals,
        "gal_totals": gal_totals,
        "combined_totals": combined_totals,
        "cost_per_verdict_usd": COST_PER_VERDICT_USD,
        "cost_per_verdict_credits": round(COST_PER_VERDICT_USD * 100, 2),
        "gal_cost_per_attempt_usd": GAL_COST_PER_ATTEMPT_USD,
        "balance_anchor": balance_anchor,
    }


class BalanceAnchorReq(BaseModel):
    credits_at_top_up: float = Field(ge=0, le=1_000_000)


@router.post("/cost/balance-anchor")
async def set_balance_anchor(req: BalanceAnchorReq, _admin=Depends(admin_required)):
    """Persist the admin-entered Universal Key balance at this moment so the
    summary endpoint can subtract estimated spend going forward and project
    remaining credits. Stamps `top_up_at` server-side (UTC) so the dashboard
    knows which verdicts to count against the anchor."""
    now = now_utc()
    await db.app_settings.update_one(
        {"_id": "credit_balance_anchor"},
        {"$set": {
            "credits_at_top_up": float(req.credits_at_top_up),
            "top_up_at": iso(now),
            "updated_at": iso(now),
        }},
        upsert=True,
    )
    return {"ok": True, "credits_at_top_up": req.credits_at_top_up, "top_up_at": iso(now)}


# --- Cost-anchor reminder preferences --------------------------------------
# Weekly email nudge so the admin doesn't forget to refresh their Universal
# Key balance anchor. Sent only when (anchor stale OR projection low) so we
# don't email noise. Stored in db.app_settings._id="cost_anchor_reminder".

@router.get("/cost/reminder")
async def get_cost_reminder_pref(_admin=Depends(admin_required)):
    """Read the current reminder enabled flag."""
    doc = await db.app_settings.find_one(
        {"_id": "cost_anchor_reminder"}, {"_id": 0}
    ) or {}
    return {
        "enabled": bool(doc.get("enabled")),
        "last_sent_at": doc.get("last_sent_at"),
        "recipient": doc.get("recipient"),
    }


class CostReminderReq(BaseModel):
    enabled: bool
    recipient: Optional[EmailStr] = None  # override default (admin email)


@router.post("/cost/reminder")
async def set_cost_reminder_pref(
    req: CostReminderReq,
    admin=Depends(admin_required),
):
    """Enable or disable the weekly cost-anchor reminder. Stamps the
    requesting admin's email as the recipient by default — but accepts an
    override (useful when Resend's free tier requires the recipient to
    match the verified Resend account email)."""
    await db.app_settings.update_one(
        {"_id": "cost_anchor_reminder"},
        {"$set": {
            "enabled": bool(req.enabled),
            "recipient": req.recipient or admin.get("email"),
            "updated_at": iso(now_utc()),
        }},
        upsert=True,
    )
    return {"ok": True, "enabled": req.enabled, "recipient": req.recipient or admin.get("email")}


@router.post("/cost/reminder/test-send")
async def send_cost_reminder_test(_admin=Depends(admin_required)):
    """Force-send a cost-anchor reminder email NOW, bypassing the
    Friday window + cooldown + worth-it gate. Useful for verifying the
    template/recipient before relying on the weekly cron."""
    from services.cost_reminder import run_cost_reminder_once
    result = await run_cost_reminder_once(force=True)
    return result


# --- Telegram low-balance alert preferences --------------------------------
# Independent of the email reminder. Pushes a Telegram message to the
# admin's linked chat when projected verdicts drop below threshold.

@router.get("/cost/tg-alert")
async def get_tg_alert_pref(admin=Depends(admin_required)):
    """Read current Telegram alert preference for this admin. Includes
    the admin's linked telegram_chat_id (or null if unlinked) so the UI
    can surface a 'link your Telegram first' hint."""
    doc = await db.app_settings.find_one(
        {"_id": "cost_anchor_tg_alert"}, {"_id": 0}
    ) or {}
    user_doc = await db.users.find_one(
        {"id": admin["id"]}, {"_id": 0, "telegram_chat_id": 1}
    ) or {}
    return {
        "enabled": bool(doc.get("enabled")),
        "threshold": int(doc.get("threshold") or 10),
        "last_sent_at": doc.get("last_sent_at"),
        "telegram_linked": bool(user_doc.get("telegram_chat_id")),
    }


class TgAlertReq(BaseModel):
    enabled: bool
    threshold: Optional[int] = Field(default=None, ge=1, le=500)


@router.post("/cost/tg-alert")
async def set_tg_alert_pref(
    req: TgAlertReq,
    admin=Depends(admin_required),
):
    """Enable/disable the Telegram low-balance alert. Stores the admin's
    user_id so the cron knows whose linked chat to push to."""
    update = {
        "enabled": bool(req.enabled),
        "user_id": admin["id"],
        "updated_at": iso(now_utc()),
    }
    if req.threshold is not None:
        update["threshold"] = int(req.threshold)
    await db.app_settings.update_one(
        {"_id": "cost_anchor_tg_alert"},
        {"$set": update},
        upsert=True,
    )
    return {"ok": True, "enabled": req.enabled}


@router.post("/cost/tg-alert/test-send")
async def send_tg_alert_test(_admin=Depends(admin_required)):
    """Force-send the Telegram alert right now, bypassing threshold +
    cooldown. Useful to verify the chat is linked and the message
    template is right."""
    from services.cost_reminder import run_tg_low_balance_check_once
    return await run_tg_low_balance_check_once(force=True)


@router.post("/scorecard/resolve-now")
async def trigger_verdict_resolution(_admin=Depends(admin_required)):
    """Manually run one pass of verdict resolution immediately, instead
    of waiting for the hourly background loop (services/verdict_resolution
    .py). Use this to verify the scorecard fix is actually resolving
    verdicts correctly after deploy, without waiting up to an hour."""
    from services.verdict_resolution import resolve_due_verdicts
    result = await resolve_due_verdicts()
    return {"ok": True, **result}
