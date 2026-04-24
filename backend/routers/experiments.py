"""Generalised A/B experiments framework.

Every experiment is a dict in `EXPERIMENTS` with:
  - key:         stable id, used in URLs, storage, cookies
  - description: human-readable purpose (shown in admin)
  - surface:     free-text label (LoginPage, SignupPage, etc.)
  - variants:    list of {key, render: {...}} — render is opaque payload
                 the frontend knows how to consume
  - conversion_event: string event name (e.g. "signup", "try_submit")

All events are stored in a single `ab_events` MongoDB collection:
  {event, experiment_key, variant_key, user_id?, created_at}

Adding a new experiment = append to `EXPERIMENTS` + restart. Frontend
uses `useExperimentVariant(key)` to pull + pin the variant.
"""
from __future__ import annotations

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.db import db
from core.security import iso, now_utc
from routers.admin import admin_required

router = APIRouter(prefix="/experiments", tags=["experiments"])


EXPERIMENTS = [
    {
        "key": "login_tagline",
        "description": "Sign-in hero copy — tests the analyst-personification angle against outcome-focused messaging.",
        "surface": "LoginPage hero",
        "conversion_event": "signup",
        "variants": [
            {"key": "analyst_why",    "render": {"line1": "An analyst",   "line2": "who explains why.",    "color": "#F59E0B"}},
            {"key": "every_call",     "render": {"line1": "Every call.",  "line2": "Fully defended.",      "color": "#10B981"}},
            {"key": "shows_its_work", "render": {"line1": "Intelligence", "line2": "that shows its work.", "color": "#F59E0B"}},
        ],
    },
    {
        "key": "signup_tagline",
        "description": "Registration hero copy — tests value-prop framing for first-time visitors.",
        "surface": "SignupPage hero",
        "conversion_event": "signup",
        "variants": [
            {"key": "five_stocks_clarity", "render": {"line1": "Five stocks.",     "line2": "Infinite clarity.",     "color": "#10B981"}},
            {"key": "your_second_brain",   "render": {"line1": "Your second brain", "line2": "for the markets.",     "color": "#F59E0B"}},
            {"key": "stop_guessing",       "render": {"line1": "Stop guessing.",   "line2": "Start knowing why.",   "color": "#10B981"}},
        ],
    },
    {
        "key": "try_cta",
        "description": "TryNowBox call-to-action — tests imperative vs benefit-framed CTAs.",
        "surface": "TryNowBox (login/signup hero)",
        "conversion_event": "try_submit",
        "variants": [
            {"key": "analyze",   "render": {"label": "ANALYZE"}},
            {"key": "verdict",   "render": {"label": "GET MY VERDICT"}},
            {"key": "free_run",  "render": {"label": "RUN FREE ANALYSIS"}},
        ],
    },
    {
        "key": "trending_header",
        "description": "PublicTrendingTicker lead-in — tests stoic data framing against social-proof.",
        "surface": "PublicTrendingTicker strip",
        "conversion_event": "trending_cta_click",
        "variants": [
            {"key": "live_stats",     "render": {"prefix": "LIVE"}},
            {"key": "hot_right_now",  "render": {"prefix": "🔥 HOT RIGHT NOW"}},
            {"key": "what_watching",  "render": {"prefix": "WHAT NEULAB IS WATCHING"}},
        ],
    },
]

_EXP_BY_KEY = {e["key"]: e for e in EXPERIMENTS}


def _variant_keys(exp_key: str) -> set[str]:
    exp = _EXP_BY_KEY.get(exp_key)
    if not exp:
        return set()
    return {v["key"] for v in exp["variants"]}


class EventReq(BaseModel):
    variant_key: str


# ---------- Public endpoints ----------------------------------------------

@router.get("/list")
async def list_experiments():
    """Public list of every experiment + its variants. Used by the
    frontend hook to bootstrap any surface that runs an experiment."""
    return {"experiments": EXPERIMENTS}


@router.get("/{experiment_key}/variants")
async def get_variants(experiment_key: str):
    """Public — returns the variants for one experiment (lighter than /list
    when the caller only cares about a single surface)."""
    exp = _EXP_BY_KEY.get(experiment_key)
    if not exp:
        raise HTTPException(status_code=404, detail="Unknown experiment")
    return {
        "key": exp["key"],
        "description": exp["description"],
        "conversion_event": exp["conversion_event"],
        "variants": exp["variants"],
    }


@router.post("/{experiment_key}/impression")
async def track_impression(experiment_key: str, ev: EventReq):
    """Log one impression. Client-side fire-and-forget."""
    if experiment_key not in _EXP_BY_KEY:
        raise HTTPException(status_code=404, detail="Unknown experiment")
    if ev.variant_key not in _variant_keys(experiment_key):
        raise HTTPException(status_code=400, detail="Unknown variant_key")
    await db.ab_events.insert_one({
        "event": "impression",
        "experiment_key": experiment_key,
        "variant_key": ev.variant_key,
        "created_at": iso(now_utc()),
    })
    return {"ok": True}


@router.post("/{experiment_key}/conversion")
async def track_conversion(experiment_key: str, ev: EventReq):
    """Log a non-signup conversion (e.g., 'user clicked the CTA'). Signup
    conversions are attributed server-side from the auth flow — don't use
    this endpoint for those."""
    if experiment_key not in _EXP_BY_KEY:
        raise HTTPException(status_code=404, detail="Unknown experiment")
    if ev.variant_key not in _variant_keys(experiment_key):
        raise HTTPException(status_code=400, detail="Unknown variant_key")
    await db.ab_events.insert_one({
        "event": "conversion",
        "experiment_key": experiment_key,
        "variant_key": ev.variant_key,
        "created_at": iso(now_utc()),
    })
    return {"ok": True}


# ---------- Server-side signup attribution -------------------------------

async def attribute_signup_from_headers(user_id: str, headers) -> None:
    """Called from /auth/register + /auth/google/session. Reads every
    `X-Exp-{experiment_key}: {variant_key}` header the frontend auto-sends
    and credits the user's signup to each one that maps to a signup-type
    experiment. Idempotent — each (user_id, experiment_key) tuple is
    stored at most once."""
    for exp in EXPERIMENTS:
        if exp["conversion_event"] != "signup":
            continue
        exp_key = exp["key"]
        header_name = f"x-exp-{exp_key.replace('_', '-')}"
        variant_key = headers.get(header_name) or headers.get(f"X-Exp-{exp_key.replace('_','-')}")
        if not variant_key or variant_key not in _variant_keys(exp_key):
            continue
        already = await db.ab_events.find_one({
            "event": "conversion",
            "experiment_key": exp_key,
            "user_id": user_id,
        })
        if already:
            continue
        await db.ab_events.insert_one({
            "event": "conversion",
            "experiment_key": exp_key,
            "variant_key": variant_key,
            "user_id": user_id,
            "created_at": iso(now_utc()),
        })


# ---------- Admin aggregation --------------------------------------------

@router.get("/stats")
async def all_stats(window_days: int = 30, _admin=Depends(admin_required)):
    """Admin-only — returns impressions/conversions/rate per variant for
    every registered experiment in one response so the UI can render a
    single card per experiment."""
    cutoff = iso(now_utc() - timedelta(days=window_days))
    pipeline = [
        {"$match": {"created_at": {"$gte": cutoff}}},
        {"$group": {
            "_id": {
                "experiment_key": "$experiment_key",
                "variant_key": "$variant_key",
                "event": "$event",
            },
            "count": {"$sum": 1},
        }},
    ]
    raw = await db.ab_events.aggregate(pipeline).to_list(length=1000)

    # Organise counts: exp → variant → {impressions, conversions}
    counts: dict = {e["key"]: {v["key"]: {"impressions": 0, "conversions": 0} for v in e["variants"]} for e in EXPERIMENTS}
    for row in raw:
        ek = row["_id"].get("experiment_key")
        vk = row["_id"].get("variant_key")
        if ek not in counts or vk not in counts[ek]:
            continue
        if row["_id"]["event"] == "impression":
            counts[ek][vk]["impressions"] = row["count"]
        elif row["_id"]["event"] == "conversion":
            counts[ek][vk]["conversions"] = row["count"]

    experiments_out = []
    for exp in EXPERIMENTS:
        rows = []
        total_imp = 0
        total_conv = 0
        for v in exp["variants"]:
            c = counts[exp["key"]][v["key"]]
            imp = c["impressions"]
            conv = c["conversions"]
            rows.append({
                "variant_key": v["key"],
                "render": v["render"],
                "impressions": imp,
                "conversions": conv,
                "conversion_rate": round(conv / imp, 4) if imp > 0 else 0.0,
            })
            total_imp += imp
            total_conv += conv
        experiments_out.append({
            "key": exp["key"],
            "description": exp["description"],
            "surface": exp["surface"],
            "conversion_event": exp["conversion_event"],
            "totals": {"impressions": total_imp, "conversions": total_conv},
            "rows": rows,
        })

    return {
        "window_days": window_days,
        "generated_at": iso(now_utc()),
        "experiments": experiments_out,
    }
