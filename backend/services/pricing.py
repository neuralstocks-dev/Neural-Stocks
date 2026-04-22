"""Dynamic pricing + tier limits: reads overrides from db.settings, falls back to config defaults.

Admins set:
  * Monthly USD prices (Pro / Elite) + annual discount
  * Promo discount % for Pro / Elite monthly (with optional label)
  * Day Pass price + duration (days) + its own quotas
  * Per-tier daily/weekly analysis limits + share/day
"""
from datetime import datetime, timezone
from core.config import (
    DEFAULT_PRO_PRICE,
    DEFAULT_ELITE_PRICE,
    DEFAULT_ANNUAL_DISCOUNT_PCT,
    DEFAULT_DAYPASS_PRICE,
    DEFAULT_DAYPASS_DURATION_DAYS,
    PLANS,
)
from core.db import db

PRICING_SETTINGS_ID = "pricing"
LIMITS_SETTINGS_ID = "tier_limits"

# Recurring-plan quota keys (Free / Pro / Elite). Day Pass adds watchlist_limit.
LIMIT_KEYS = ("analyses_per_day", "analyses_per_week", "share_per_day")
DAYPASS_LIMIT_KEYS = ("analyses_per_day", "analyses_per_week", "share_per_day", "watchlist_limit")


def _yearly_from_monthly(monthly: float, discount_pct: float) -> float:
    return round(monthly * 12 * (1 - discount_pct / 100.0), 2)


def _apply_promo(price: float, pct: float) -> float:
    return round(price * (1 - max(0.0, min(pct, 90.0)) / 100.0), 2)


def _promo_is_active(doc: dict) -> bool:
    """Promo ends_at is optional; when set, must still be in the future."""
    ends_at = doc.get("promo_ends_at")
    if not ends_at:
        return True  # no end → always active while discount > 0
    try:
        dt = datetime.fromisoformat(ends_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt > datetime.now(timezone.utc)
    except Exception:
        return False


async def get_pricing() -> dict:
    doc = await db.settings.find_one({"id": PRICING_SETTINGS_ID}, {"_id": 0}) or {}
    pro = float(doc.get("pro_price", DEFAULT_PRO_PRICE))
    elite = float(doc.get("elite_price", DEFAULT_ELITE_PRICE))
    discount = float(doc.get("annual_discount_pct", DEFAULT_ANNUAL_DISCOUNT_PCT))
    promo_pro = float(doc.get("promo_pro_discount_pct") or 0)
    promo_elite = float(doc.get("promo_elite_discount_pct") or 0)
    promo_label = (doc.get("promo_label") or "").strip()
    promo_ends_at = doc.get("promo_ends_at") or None
    daypass_price = float(doc.get("daypass_price", DEFAULT_DAYPASS_PRICE))
    daypass_duration = int(doc.get("daypass_duration_days", DEFAULT_DAYPASS_DURATION_DAYS))

    promo_active = _promo_is_active(doc) and (promo_pro > 0 or promo_elite > 0)
    pro_effective = _apply_promo(pro, promo_pro) if promo_active and promo_pro > 0 else pro
    elite_effective = _apply_promo(elite, promo_elite) if promo_active and promo_elite > 0 else elite

    return {
        # Display prices. For monthly with promo, pro_monthly is the FIRST-MONTH price.
        # Subsequent months charge pro_monthly_original (handled by PayPal trial/regular cycles).
        "pro_monthly": pro_effective,
        "elite_monthly": elite_effective,
        # Yearly is unaffected by the monthly promo — promo applies only to the first month.
        "pro_yearly": _yearly_from_monthly(pro, discount),
        "elite_yearly": _yearly_from_monthly(elite, discount),
        # Originals for strikethrough UI + PayPal regular-cycle price
        "pro_monthly_original": pro,
        "elite_monthly_original": elite,
        # Promo metadata
        "promo_active": promo_active,
        "promo_pro_discount_pct": promo_pro,
        "promo_elite_discount_pct": promo_elite,
        "promo_label": promo_label,
        "promo_ends_at": promo_ends_at,
        # Recurring discount (month → year)
        "annual_discount_pct": discount,
        # Day pass
        "daypass_price": daypass_price,
        "daypass_duration_days": daypass_duration,
    }


async def set_pricing(
    pro_price: float,
    elite_price: float,
    annual_discount_pct: float,
    promo_pro_discount_pct: float = 0.0,
    promo_elite_discount_pct: float = 0.0,
    promo_label: str = "",
    promo_ends_at: str | None = None,
    daypass_price: float | None = None,
    daypass_duration_days: int | None = None,
) -> dict:
    update = {
        "id": PRICING_SETTINGS_ID,
        "pro_price": float(pro_price),
        "elite_price": float(elite_price),
        "annual_discount_pct": float(annual_discount_pct),
        "promo_pro_discount_pct": float(promo_pro_discount_pct or 0),
        "promo_elite_discount_pct": float(promo_elite_discount_pct or 0),
        "promo_label": (promo_label or "").strip()[:80],
        "promo_ends_at": promo_ends_at,
    }
    if daypass_price is not None:
        update["daypass_price"] = float(daypass_price)
    if daypass_duration_days is not None:
        update["daypass_duration_days"] = int(daypass_duration_days)
    await db.settings.update_one(
        {"id": PRICING_SETTINGS_ID},
        {"$set": update},
        upsert=True,
    )
    return await get_pricing()


# ---------- Tier limits ----------
async def get_tier_limits() -> dict:
    """Return per-tier limits, merging saved overrides with PLANS defaults.
    Shape: {tier: {analyses_per_day, analyses_per_week, share_per_day[, watchlist_limit]}}
    where None means unlimited."""
    doc = await db.settings.find_one({"id": LIMITS_SETTINGS_ID}, {"_id": 0}) or {}
    overrides = doc.get("tiers") or {}
    out = {}
    for tier in ("free", "pro", "elite"):
        tier_def = PLANS[tier]
        tier_override = overrides.get(tier) or {}
        out[tier] = {k: tier_override[k] if k in tier_override else tier_def.get(k) for k in LIMIT_KEYS}
    # Day Pass also exposes watchlist_limit as admin-editable
    dp_def = PLANS["daypass"]
    dp_over = overrides.get("daypass") or {}
    out["daypass"] = {k: dp_over[k] if k in dp_over else dp_def.get(k) for k in DAYPASS_LIMIT_KEYS}
    return out


async def set_tier_limits(tiers: dict) -> dict:
    """tiers: {free: {...}, pro: {...}, elite: {...}, daypass: {...}} — any of
    the LIMIT_KEYS (+ watchlist_limit for daypass), integer or None for unlimited."""
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
    # Day Pass: watchlist_limit allowed in addition to LIMIT_KEYS
    if "daypass" in tiers:
        block = {}
        for k in DAYPASS_LIMIT_KEYS:
            if k in tiers["daypass"]:
                v = tiers["daypass"][k]
                if v is None or v == "":
                    block[k] = None
                else:
                    iv = int(v)
                    if iv < 0:
                        raise ValueError(f"daypass.{k} must be >= 0 or null for unlimited")
                    block[k] = iv
        if block:
            clean["daypass"] = block

    await db.settings.update_one(
        {"id": LIMITS_SETTINGS_ID},
        {"$set": {"id": LIMITS_SETTINGS_ID, "tiers": clean}},
        upsert=True,
    )
    return await get_tier_limits()


async def plans_with_live_pricing() -> dict:
    """Return PLANS dict with live price_usd + yearly breakdown + live limits +
    promo metadata. Day Pass is always included."""
    p = await get_pricing()
    limits = await get_tier_limits()
    plans = {k: {**v} for k, v in PLANS.items()}
    plans["pro"]["price_usd"] = p["pro_monthly"]
    plans["pro"]["price_yearly"] = p["pro_yearly"]
    plans["pro"]["price_usd_original"] = p["pro_monthly_original"]
    plans["pro"]["promo_discount_pct"] = p["promo_pro_discount_pct"] if p["promo_active"] else 0
    plans["elite"]["price_usd"] = p["elite_monthly"]
    plans["elite"]["price_yearly"] = p["elite_yearly"]
    plans["elite"]["price_usd_original"] = p["elite_monthly_original"]
    plans["elite"]["promo_discount_pct"] = p["promo_elite_discount_pct"] if p["promo_active"] else 0
    plans["free"]["price_yearly"] = 0
    plans["daypass"]["price_usd"] = p["daypass_price"]
    plans["daypass"]["duration_days"] = p["daypass_duration_days"]
    for k in plans:
        plans[k]["annual_discount_pct"] = p["annual_discount_pct"]
    # Apply live limits (plus watchlist_limit override for daypass)
    for k in ("free", "pro", "elite"):
        for lk in LIMIT_KEYS:
            plans[k][lk] = limits[k][lk]
    for lk in DAYPASS_LIMIT_KEYS:
        plans["daypass"][lk] = limits["daypass"][lk]
    # Shared promo metadata for UI
    for k in plans:
        plans[k]["promo_active"] = p["promo_active"]
        plans[k]["promo_label"] = p["promo_label"]
        plans[k]["promo_ends_at"] = p["promo_ends_at"]
    return plans
