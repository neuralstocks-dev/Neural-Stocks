"""Dynamic pricing: reads overrides from db.settings, falls back to config defaults.

Admins can change monthly USD prices at runtime. Each price change creates a new
PayPal Billing Plan and retires the old one.
"""
from core.config import PLANS, DEFAULT_PRO_PRICE, DEFAULT_ELITE_PRICE
from core.db import db

PRICING_SETTINGS_ID = "pricing"


async def get_pricing() -> dict:
    doc = await db.settings.find_one({"id": PRICING_SETTINGS_ID}, {"_id": 0}) or {}
    return {
        "pro": float(doc.get("pro_price", DEFAULT_PRO_PRICE)),
        "elite": float(doc.get("elite_price", DEFAULT_ELITE_PRICE)),
    }


async def set_pricing(pro_price: float, elite_price: float) -> dict:
    await db.settings.update_one(
        {"id": PRICING_SETTINGS_ID},
        {"$set": {
            "id": PRICING_SETTINGS_ID,
            "pro_price": float(pro_price),
            "elite_price": float(elite_price),
        }},
        upsert=True,
    )
    return await get_pricing()


async def plans_with_live_pricing() -> dict:
    """Return PLANS dict with live price_usd values from db.settings."""
    prices = await get_pricing()
    plans = {k: {**v} for k, v in PLANS.items()}
    plans["pro"]["price_usd"] = prices["pro"]
    plans["elite"]["price_usd"] = prices["elite"]
    return plans
