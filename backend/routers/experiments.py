"""Tagline A/B framework — zero-cost variant testing for the /login hero.

Collects two event types:
  - impression: visitor landed on /login and saw variant X (cookie-pinned)
  - conversion: a new user signed up within 48h of last seeing variant X

Exposes admin aggregation endpoint that shows impressions / conversions /
rate per variant over a window so the user can kill losing variants.
"""
from __future__ import annotations

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.db import db
from core.security import iso, now_utc
from routers.admin import admin_required

router = APIRouter(prefix="/experiments", tags=["experiments"])


# Registry of active tagline variants. The "key" is what gets stored in
# MongoDB + the visitor's cookie; the "line1"/"line2"/"color" drive the
# frontend render. Add/remove entries here to change what's being tested.
TAGLINE_VARIANTS = [
    {"key": "analyst_why",       "line1": "An analyst",          "line2": "who explains why.",      "color": "#F59E0B"},
    {"key": "every_call",        "line1": "Every call.",         "line2": "Fully defended.",        "color": "#10B981"},
    {"key": "shows_its_work",    "line1": "Intelligence",        "line2": "that shows its work.",   "color": "#F59E0B"},
]
VARIANT_KEYS = {v["key"] for v in TAGLINE_VARIANTS}


class ImpressionEvent(BaseModel):
    variant_key: str


@router.get("/tagline/variants")
async def list_tagline_variants():
    """Public endpoint — returns the registry so the frontend can pick one.
    No auth: variants aren't sensitive, they're marketing copy."""
    return {"variants": TAGLINE_VARIANTS}


@router.post("/tagline/impression")
async def track_impression(ev: ImpressionEvent):
    """Log one impression. Client-side fire-and-forget — no response body
    matters, just that we count. Variant key must be in the registry
    (prevents clients from polluting stats with arbitrary strings)."""
    if ev.variant_key not in VARIANT_KEYS:
        raise HTTPException(status_code=400, detail="Unknown variant_key")
    await db.tagline_experiments.insert_one({
        "event": "impression",
        "variant_key": ev.variant_key,
        "created_at": iso(now_utc()),
    })
    return {"ok": True}


async def attribute_signup_if_any(user_id: str, variant_key: str | None):
    """Called from the /auth/signup flow when a cookie indicates the new
    user was pinned to a variant. Idempotent — each user can only be
    attributed to one variant (first conversion wins)."""
    if not variant_key or variant_key not in VARIANT_KEYS:
        return
    # Don't double-count if this user_id has already been attributed
    existing = await db.tagline_experiments.find_one({
        "event": "conversion",
        "user_id": user_id,
    })
    if existing:
        return
    await db.tagline_experiments.insert_one({
        "event": "conversion",
        "variant_key": variant_key,
        "user_id": user_id,
        "created_at": iso(now_utc()),
    })


@router.get("/tagline/stats")
async def tagline_stats(window_days: int = 30, _admin=Depends(admin_required)):
    """Admin-only aggregation. Returns per-variant impressions, conversions,
    and rate over the window. Zero conversions yields rate=0.0."""
    cutoff = iso(now_utc() - timedelta(days=window_days))
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"variant_key": "$variant_key", "event": "$event"},
            "count": {"$sum": 1},
        }},
    ]
    raw = await db.tagline_experiments.aggregate(pipeline).to_list(length=200)

    # Collapse into per-variant rows
    stats: dict[str, dict] = {v["key"]: {"variant_key": v["key"], "impressions": 0, "conversions": 0} for v in TAGLINE_VARIANTS}
    for row in raw:
        key = row["_id"].get("variant_key")
        if key not in stats:
            continue
        if row["_id"]["event"] == "impression":
            stats[key]["impressions"] = row["count"]
        elif row["_id"]["event"] == "conversion":
            stats[key]["conversions"] = row["count"]

    items = []
    for v in TAGLINE_VARIANTS:
        s = stats[v["key"]]
        imp = s["impressions"]
        conv = s["conversions"]
        s["conversion_rate"] = round(conv / imp, 4) if imp > 0 else 0.0
        s["line1"] = v["line1"]
        s["line2"] = v["line2"]
        items.append(s)

    totals = {
        "impressions": sum(x["impressions"] for x in items),
        "conversions": sum(x["conversions"] for x in items),
    }
    return {
        "window_days": window_days,
        "generated_at": iso(now_utc()),
        "totals": totals,
        "items": items,
    }
