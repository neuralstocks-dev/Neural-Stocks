"""Admin: user management, test-unlock, login events, pricing."""
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, EmailStr
from typing import Optional

from core.config import UNLOCK_DURATIONS, ADMIN_EMAILS
from core.db import db
from core.models import UnlockReq
from core.security import admin_required, iso, now_utc, is_admin_email
from services.pricing import get_pricing, set_pricing, get_tier_limits, set_tier_limits
from services.paypal import get_plan_ids, PayPalError
from services.quota import resolved_plan_for, test_unlock_active, count_analyses, effective_plan_key

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
# the backend uses to compute estimates. ~3,500 input tokens at $3/1M plus
# ~1,750 output tokens at $15/1M ≈ $0.027 per Claude Sonnet 4.5 verdict.
# Universal Key bills 1 credit = $0.01, so cost-in-credits = USD × 100.
COST_PER_VERDICT_USD = 0.027


@router.get("/cost/summary")
async def cost_summary(
    days: int = 30,
    _admin=Depends(admin_required),
):
    """Return a per-day cost breakdown for the last `days` days.

    Strategy: count analyses inserted per day (created_at ISO string) and
    multiply by COST_PER_VERDICT_USD. Returns:
      - daily: [{date, count, usd, credits}]
      - totals: {count, usd, credits}
      - cost_per_verdict_usd, cost_per_verdict_credits
      - balance_anchor: {credits_at_top_up, top_up_at, used_credits_since,
                         estimated_remaining_credits, estimated_verdicts_remaining}
        (null if admin hasn't set a balance anchor yet)
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
    daily = []
    total_count = 0
    async for row in cursor:
        c = int(row.get("count") or 0)
        total_count += c
        daily.append({
            "date": row["_id"],
            "count": c,
            "usd": round(c * COST_PER_VERDICT_USD, 4),
            "credits": round(c * COST_PER_VERDICT_USD * 100, 2),
        })

    totals = {
        "count": total_count,
        "usd": round(total_count * COST_PER_VERDICT_USD, 2),
        "credits": round(total_count * COST_PER_VERDICT_USD * 100, 2),
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
        "cost_per_verdict_usd": COST_PER_VERDICT_USD,
        "cost_per_verdict_credits": round(COST_PER_VERDICT_USD * 100, 2),
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
