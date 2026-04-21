"""Dynamic pricing + tier limits: reads overrides from db.settings, falls back to config defaults.

Admins set monthly USD prices + annual discount + per-tier daily/weekly analysis limits
and share-verdicts/day limits. All changes stored in db.settings.
"""
from core.config import (
    DEFAULT_PRO_PRICE,
    DEFAULT_ELITE_PRICE,
    DEFAULT_ANNUAL_DISCOUNT_PCT,
    PLANS,
)
from core.db import db

PRICING_SETTINGS_ID = "pricing"
LIMITS_SETTINGS_ID = "tier_limits"

# Keys that are user-configurable per tier. None means "unlimited" in PLANS.
LIMIT_KEYS = ("analyses_per_day", "analyses_per_week", "share_per_day")


def _yearly_from_monthly(monthly: float, discount_pct: float) -> float:
    return round(monthly * 12 * (1 - discount_pct / 100.0), 2)


async def get_pricing() -> dict:
    doc = await db.settings.find_one({"id": PRICING_SETTINGS_ID}, {"_id": 0}) or {}
    pro = float(doc.get("pro_price", DEFAULT_PRO_PRICE))
    elite = float(doc.get("elite_price", DEFAULT_ELITE_PRICE))
    discount = float(doc.get("annual_discount_pct", DEFAULT_ANNUAL_DISCOUNT_PCT))
    return {
        "pro_monthly": pro,
        "elite_monthly": elite,
        "annual_discount_pct": discount,
        "pro_yearly": _yearly_from_monthly(pro, discount),
        "elite_yearly": _yearly_from_monthly(elite, discount),
    }


async def set_pricing(pro_price: float, elite_price: float, annual_discount_pct: float) -> dict:
    await db.settings.update_one(
        {"id": PRICING_SETTINGS_ID},
        {"$set": {
            "id": PRICING_SETTINGS_ID,
            "pro_price": float(pro_price),
            "elite_price": float(elite_price),
            "annual_discount_pct": float(annual_discount_pct),
        }},
        upsert=True,
    )
    return await get_pricing()


# ---------- Tier limits ----------
async def get_tier_limits() -> dict:
    """Return per-tier limits, merging saved overrides with PLANS defaults.
    Shape: {tier: {analyses_per_day, analyses_per_week, share_per_day}} where
    None means unlimited."""
    doc = await db.settings.find_one({"id": LIMITS_SETTINGS_ID}, {"_id": 0}) or {}
    overrides = doc.get("tiers") or {}
    out = {}
    for tier in ("free", "pro", "elite"):
        tier_def = PLANS[tier]
        tier_override = overrides.get(tier) or {}
        out[tier] = {k: tier_override[k] if k in tier_override else tier_def.get(k) for k in LIMIT_KEYS}
    return out


async def set_tier_limits(tiers: dict) -> dict:
    """tiers: {free: {...}, pro: {...}, elite: {...}} — any of the LIMIT_KEYS,
    integer or None for unlimited."""
    clean = {}
    for tier in ("free", "pro", "elite"):
        if tier not in tiers:
            continue
        block = {}
        for k in LIMIT_KEYS:
            if k in tiers[tier]:
                v = tiers[tier][k]
                if v is None or v == "":
                    block[k] = None
                else:
                    iv = int(v)
                    if iv < 0:
                        raise ValueError(f"{tier}.{k} must be >= 0 or null for unlimited")
                    block[k] = iv
        if block:
            clean[tier] = block
    await db.settings.update_one(
        {"id": LIMITS_SETTINGS_ID},
        {"$set": {"id": LIMITS_SETTINGS_ID, "tiers": clean}},
        upsert=True,
    )
    return await get_tier_limits()


async def plans_with_live_pricing() -> dict:
    """Return PLANS dict with live price_usd + yearly breakdown + live limits."""
    p = await get_pricing()
    limits = await get_tier_limits()
    plans = {k: {**v} for k, v in PLANS.items()}
    plans["pro"]["price_usd"] = p["pro_monthly"]
    plans["pro"]["price_yearly"] = p["pro_yearly"]
    plans["elite"]["price_usd"] = p["elite_monthly"]
    plans["elite"]["price_yearly"] = p["elite_yearly"]
    plans["free"]["price_yearly"] = 0
    for k in plans:
        plans[k]["annual_discount_pct"] = p["annual_discount_pct"]
        # Apply live limits
        for lk in LIMIT_KEYS:
            plans[k][lk] = limits[k][lk]
    return plans
