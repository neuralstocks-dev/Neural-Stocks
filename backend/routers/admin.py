"""Admin: user management, test-unlock, login events, pricing."""
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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
    rows = []
    for u in users:
        base = _sanitize_user(u)
        # Effective daily limit & today's usage. Admin and active test-unlock
        # resolve to Elite (effective), so their daily limit is unlimited.
        try:
            p = await resolved_plan_for(u)
            base["effective_plan"] = effective_plan_key(u)
            base["analyses_day_limit"] = p.get("analyses_per_day")  # None == unlimited
            base["analyses_today"] = await count_analyses(u["id"], day_ago)
            base["test_unlock_active"] = test_unlock_active(u)
        except Exception:
            base["effective_plan"] = base.get("plan")
            base["analyses_day_limit"] = None
            base["analyses_today"] = 0
            base["test_unlock_active"] = False
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

