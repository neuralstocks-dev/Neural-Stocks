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
    # Admins get truly unlimited quotas regardless of tier_limits overrides —
    # present the UI as "unlimited / unlimited" so the dashboard doesn't show
    # a misleading 15/day cap on their own account.
    if user.get("is_admin"):
        p = dict(p)
        p["analyses_per_day"] = None
        p["analyses_per_week"] = None
        p["watchlist_limit"] = 9999
        p["share_per_day"] = None
    since_day = now - timedelta(days=1)
    since_week = now - timedelta(days=7)
    # Honour admin-initiated quota resets — analyses before quota_reset_at
    # don't count toward current window limits.
    reset_at = user.get("quota_reset_at")
    if reset_at:
        try:
            from datetime import datetime as _dt
            reset_dt = _dt.fromisoformat(str(reset_at).replace("Z", "+00:00"))
            if reset_dt > since_day:
                since_day = reset_dt
            if reset_dt > since_week:
                since_week = reset_dt
        except Exception:
            pass
    used_day = await count_analyses(user["id"], since_day)
    used_week = await count_analyses(user["id"], since_week)
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
        "watchlist_display": p.get("watchlist_display"),
        "quick_actions": p["quick_actions"],
        "share_verdicts": p["share_verdicts"],
    }


async def enforce_analysis_quota(user: dict):
    # Admins always have unlimited analysis. The `is_admin` flag is the
    # ultimate unlock — distinct from `test_unlock_active` which is meant to
    # simulate an Elite user so admins can *test* paid-tier behaviour under
    # real quota ceilings.
    if user.get("is_admin"):
        return
    p = await resolved_plan_for(user)
    now = now_utc()
    # Honour `quota_reset_at` floor if an admin recently reset this user
    reset_at = user.get("quota_reset_at")
    reset_dt = None
    if reset_at:
        try:
            from datetime import datetime as _dt
            reset_dt = _dt.fromisoformat(str(reset_at).replace("Z", "+00:00"))
        except Exception:
            reset_dt = None
    if p["analyses_per_day"] is not None:
        since_day = now - timedelta(days=1)
        if reset_dt and reset_dt > since_day:
            since_day = reset_dt
        used_day = await count_analyses(user["id"], since_day)
        if used_day >= p["analyses_per_day"]:
            # Elite is the top plan — frame as fair-use ceiling, not upgrade prompt.
            is_top_plan = p.get("name", "").lower() == "elite"
            if is_top_plan:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"You've hit the fair-use ceiling of {p['analyses_per_day']} "
                        f"analyses in 24 hours. Try again tomorrow — or reach out to "
                        f"support@neulab.xyz if you need a higher volume allocation."
                    ),
                )
            raise HTTPException(
                status_code=402,
                detail=f"Daily analysis limit reached ({p['analyses_per_day']}/day on {p['name']} plan). Upgrade to unlock more.",
            )
    if p["analyses_per_week"] is not None:
        since_week = now - timedelta(days=7)
        if reset_dt and reset_dt > since_week:
            since_week = reset_dt
        used_week = await count_analyses(user["id"], since_week)
        if used_week >= p["analyses_per_week"]:
            raise HTTPException(
                status_code=402,
                detail=f"Weekly analysis limit reached ({p['analyses_per_week']}/week on {p['name']} plan). Upgrade to unlock more.",
            )


# Per-tier daily cap specifically for IDX (.JK) analyses. Rationale: the
# RapidAPI IDX data source is on a 1,000 req/month BASIC free plan and each
# IDX analysis consumes ~3 API calls. Tight per-user caps here protect the
# shared monthly budget so one power user can't drain it.
# Budget math: 1,000 req/month ÷ 3 calls/analysis = ~333 IDX analyses/month
# shared across all users. Elite cap of 20/day × 30 days = 600 calls max
# for one Elite user, leaving 400 calls for Free/Pro/Daypass users combined.
IDX_DAILY_LIMITS = {
    "free": 3,
    "pro": 10,
    "elite": 20,
    "daypass": 10,
}


async def enforce_idx_analysis_quota(user: dict):
    """Called only when the requested ticker is an IDX (.JK) symbol. Applies
    per-tier daily caps on top of the generic analysis quota."""
    if user.get("is_admin"):
        return  # admin bypass — consistent with enforce_analysis_quota
    plan_key = effective_plan_key(user)
    limit = IDX_DAILY_LIMITS.get(plan_key)
    if limit is None:
        return  # admin / test-unlock accounts — no IDX-specific cap
    # Count this user's IDX (.JK) analyses in the last 24h
    since = now_utc() - timedelta(days=1)
    reset_at = user.get("quota_reset_at")
    if reset_at:
        try:
            from datetime import datetime as _dt
            reset_dt = _dt.fromisoformat(str(reset_at).replace("Z", "+00:00"))
            if reset_dt > since:
                since = reset_dt
        except Exception:
            pass
    from core.security import iso as _iso
    used = await db.analyses.count_documents({
        "user_id": user["id"],
        "ticker": {"$regex": r"\.JK$", "$options": "i"},
        "created_at": {"$gte": _iso(since)},
    })
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Daily IDX analysis limit reached ({limit}/day on the {plan_key} plan). "
                "IDX data is on a shared monthly budget — upgrade to unlock more."
            ),
        )
