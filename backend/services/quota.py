"""Plan, quota, and test-unlock resolution."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from core.config import PLANS
from core.security import iso, now_utc
from core.db import db


async def _plan_overrides() -> dict:
    """Load saved tier-limit overrides from db.settings. Returns {tier: {key: value|None}}."""
    doc = await db.settings.find_one({"id": "tier_limits"}, {"_id": 0}) or {}
    return doc.get("tiers") or {}


def _parse_unlock(expires_at):
    if not expires_at:
        return None
    if expires_at == "forever":
        return "forever"
    try:
        dt = datetime.fromisoformat(expires_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def test_unlock_active(user: dict) -> bool:
    """Is this user currently on an admin-granted test-unlock?"""
    parsed = _parse_unlock(user.get("test_unlock_expires_at"))
    if parsed == "forever":
        return True
    if isinstance(parsed, datetime) and parsed > now_utc():
        return True
    return False


def daypass_active(user: dict) -> bool:
    """Is user currently in the paid Day Pass window?"""
    if (user.get("plan") or "") != "daypass":
        return False
    parsed = _parse_unlock(user.get("daypass_expires_at"))
    if isinstance(parsed, datetime) and parsed > now_utc():
        return True
    return False


def effective_plan_key(user: dict) -> str:
    if test_unlock_active(user) or user.get("is_admin"):
        return "elite"
    if daypass_active(user):
        return "daypass"
    # Auto-revert expired daypass to free for display (DB clean-up is lazy)
    if (user.get("plan") or "") == "daypass" and not daypass_active(user):
        return "free"
    return user.get("plan") or "free"


def plan_for(user: dict) -> dict:
    """Return plan definition (static — doesn't include live overrides).
    Use resolved_plan_for() for enforcement to pick up admin-set overrides."""
    return PLANS.get(effective_plan_key(user), PLANS["free"])


async def resolved_plan_for(user: dict) -> dict:
    """Same as plan_for but with db.settings overrides for analyses/day, analyses/week, share/day."""
    base = dict(plan_for(user))
    eff = effective_plan_key(user)
    overrides = await _plan_overrides()
    tier_over = overrides.get(eff) or {}
    for k in ("analyses_per_day", "analyses_per_week", "share_per_day"):
        if k in tier_over:
            base[k] = tier_over[k]
    return base


async def count_analyses(user_id: str, since: datetime) -> int:
    return await db.analyses.count_documents(
        {"user_id": user_id, "created_at": {"$gte": iso(since)}}
    )


async def quota_snapshot(user: dict) -> dict:
    p = await resolved_plan_for(user)
    eff = effective_plan_key(user)
    now = now_utc()
    used_day = await count_analyses(user["id"], now - timedelta(days=1))
    used_week = await count_analyses(user["id"], now - timedelta(days=7))
    watchlist_used = await db.watchlist.count_documents({"user_id": user["id"]})
    return {
        "plan": eff,
        "plan_name": p["name"],
        "base_plan": user.get("plan") or "free",
        "is_admin": bool(user.get("is_admin")),
        "test_unlock_active": test_unlock_active(user),
        "test_unlock_expires_at": user.get("test_unlock_expires_at"),
        "daypass_active": daypass_active(user),
        "daypass_expires_at": user.get("daypass_expires_at"),
        "subscription_status": user.get("subscription_status"),
        "subscription_cancels_at": user.get("subscription_cancels_at"),
        "paypal_cycle": user.get("paypal_cycle"),
        "has_paypal_subscription": bool(user.get("paypal_subscription_id")),
        "watchlist_used": watchlist_used,
        "watchlist_limit": p["watchlist_limit"],
        "analyses_today": used_day,
        "analyses_day_limit": p["analyses_per_day"],
        "analyses_this_week": used_week,
        "analyses_week_limit": p["analyses_per_week"],
        "quick_actions": p["quick_actions"],
        "share_verdicts": p["share_verdicts"],
    }


async def enforce_analysis_quota(user: dict):
    p = await resolved_plan_for(user)
    now = now_utc()
    if p["analyses_per_day"] is not None:
        used_day = await count_analyses(user["id"], now - timedelta(days=1))
        if used_day >= p["analyses_per_day"]:
            raise HTTPException(
                status_code=402,
                detail=f"Daily analysis limit reached ({p['analyses_per_day']}/day on {p['name']} plan). Upgrade to unlock more.",
            )
    if p["analyses_per_week"] is not None:
        used_week = await count_analyses(user["id"], now - timedelta(days=7))
        if used_week >= p["analyses_per_week"]:
            raise HTTPException(
                status_code=402,
                detail=f"Weekly analysis limit reached ({p['analyses_per_week']}/week on {p['name']} plan). Upgrade to unlock more.",
            )
