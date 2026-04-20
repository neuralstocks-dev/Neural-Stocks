"""Dynamic pricing: reads overrides from db.settings, falls back to config defaults.

Admins set monthly USD prices + a single annual discount %. Yearly prices are
derived as: monthly × 12 × (1 - discount/100). Changes rotate PayPal billing plans.
"""
from core.config import DEFAULT_PRO_PRICE, DEFAULT_ELITE_PRICE, DEFAULT_ANNUAL_DISCOUNT_PCT, PLANS
from core.db import db

PRICING_SETTINGS_ID = "pricing"


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


async def plans_with_live_pricing() -> dict:
    """Return PLANS dict with live price_usd + yearly breakdown."""
    p = await get_pricing()
    plans = {k: {**v} for k, v in PLANS.items()}
    plans["pro"]["price_usd"] = p["pro_monthly"]
    plans["pro"]["price_yearly"] = p["pro_yearly"]
    plans["elite"]["price_usd"] = p["elite_monthly"]
    plans["elite"]["price_yearly"] = p["elite_yearly"]
    plans["free"]["price_yearly"] = 0
    for k in plans:
        plans[k]["annual_discount_pct"] = p["annual_discount_pct"]
    return plans
