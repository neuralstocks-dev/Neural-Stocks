"""Telegram linking + alert preferences for users."""
from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user
from services import telegram as tg

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.get("/status")
async def status(user=Depends(get_current_user)):
    return await tg.link_status(user["id"])


@router.post("/link")
async def begin_link(user=Depends(get_current_user)):
    """Generate a 6-digit link code. User sends it to the bot to finalize."""
    if not tg.is_configured():
        raise HTTPException(status_code=503, detail="Telegram bot not configured yet. Contact the administrator.")
    return await tg.generate_link_code(user["id"])


@router.post("/poll")
async def poll(user=Depends(get_current_user)):
    """Called by the frontend after the user has sent their code to the bot.
    Runs a one-shot getUpdates pass and links any pending code."""
    if not tg.is_configured():
        return await tg.link_status(user["id"])
    await tg.poll_and_link()
    return await tg.link_status(user["id"])


@router.post("/unlink")
async def unlink(user=Depends(get_current_user)):
    ok = await tg.unlink_user(user["id"])
    return {"unlinked": ok}


@router.post("/test")
async def send_test(user=Depends(get_current_user)):
    """Send a test alert to the linked chat."""
    ok = await tg.send_alert_to_user(
        user["id"],
        "Neural Stock Intelligence™ · test notification",
        (
            "If you're reading this, Telegram alerts are working.\n\n"
            "You'll receive research-summary notifications here when patterns are detected, "
            "AI analyses complete, or RF watchlist scans flag a shift in analytical bias.\n\n"
            "<i>All Neural Stock Intelligence™ notifications are educational research output. Confidence and "
            "model probability values describe the strength of the model's classification "
            "based on the inputs — they are not forecasts of price movement and not "
            "personalized financial advice.</i>"
        ),
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Not linked to Telegram yet, or send failed.")
    return {"sent": True}



# ─── Alert preferences ──────────────────────────────────────────────────
ALERT_TYPES = ["signal", "pattern", "rf_watchlist_scan"]
ALERT_MODES = ["standard", "candlestick", "hybrid"]
ALERT_SCHEDULES = ["realtime", "digest_daily", "digest_weekly"]
DEFAULT_SCHEDULE = {t: "realtime" for t in ALERT_TYPES}

# Quiet hours config — defaults are OFF (i.e. enabled=false). When
# enabled, realtime pushes that fire inside [start_hour, end_hour) in
# the user's IANA timezone are auto-deferred into the next daily digest.
DEFAULT_QUIET_HOURS = {
    "enabled": False,
    "start_hour": 22,
    "end_hour": 7,
    "tz": "UTC",
}


def _hydrate_quiet_hours(stored):
    """Merge a stored quiet-hours dict over the defaults so every user gets
    a complete shape back, regardless of which fields they've set."""
    out = dict(DEFAULT_QUIET_HOURS)
    if isinstance(stored, dict):
        if isinstance(stored.get("enabled"), bool):
            out["enabled"] = stored["enabled"]
        for h_key in ("start_hour", "end_hour"):
            v = stored.get(h_key)
            if isinstance(v, int) and 0 <= v <= 23:
                out[h_key] = v
        if isinstance(stored.get("tz"), str) and stored["tz"]:
            out["tz"] = stored["tz"]
    return out


def is_in_quiet_hours(qh: dict) -> bool:
    """True if the user's current local time falls inside their quiet
    window. Tolerant to malformed timezone strings — falls back to UTC."""
    if not qh or not qh.get("enabled"):
        return False
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(qh.get("tz") or "UTC")
    except Exception:
        from datetime import timezone as _tz
        tz = _tz.utc
    from datetime import datetime as _dt
    now = _dt.now(tz)
    start = qh.get("start_hour", 22)
    end = qh.get("end_hour", 7)
    h = now.hour
    if start == end:
        return False  # zero-width window → never quiet
    if start < end:
        return start <= h < end
    # Window crosses midnight (e.g. 22 → 7): inside if h ≥ start OR h < end
    return h >= start or h < end


def _hydrate_schedule(stored):
    """Merge a stored schedule dict (possibly partial / missing) over the
    full default so the response always carries every known channel and
    legacy users without the field still get sensible defaults."""
    out = dict(DEFAULT_SCHEDULE)
    if isinstance(stored, dict):
        for k, v in stored.items():
            if k in ALERT_TYPES and v in ALERT_SCHEDULES:
                out[k] = v
    return out


@router.get("/preferences")
async def get_preferences(user=Depends(get_current_user)):
    """Return the user's Telegram alert filter + delivery preferences. All
    fields default to "all enabled, all realtime" so legacy users keep
    their current behavior until they explicitly change something."""
    from core.db import db
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "telegram_alert_types": 1, "telegram_alert_modes": 1,
         "telegram_alert_schedule": 1, "telegram_quiet_hours": 1},
    ) or {}
    return {
        "alert_types": u.get("telegram_alert_types") if u.get("telegram_alert_types") is not None else list(ALERT_TYPES),
        "alert_modes": u.get("telegram_alert_modes") if u.get("telegram_alert_modes") is not None else list(ALERT_MODES),
        "alert_schedule": _hydrate_schedule(u.get("telegram_alert_schedule")),
        "quiet_hours": _hydrate_quiet_hours(u.get("telegram_quiet_hours")),
        "all_alert_types": list(ALERT_TYPES),
        "all_alert_modes": list(ALERT_MODES),
        "all_alert_schedules": list(ALERT_SCHEDULES),
    }


@router.post("/preferences")
async def set_preferences(payload: dict, user=Depends(get_current_user)):
    """Persist the user's Telegram alert filter preferences. Each list
    must be a subset of the canonical ALERT_TYPES / ALERT_MODES — anything
    else is rejected so the DB never holds invalid filter values.

    `alert_schedule` accepts a partial dict; existing channel schedules
    are preserved and only the supplied keys are updated. Each value
    must be in ALERT_SCHEDULES.

    `quiet_hours` accepts a partial dict {enabled, start_hour, end_hour,
    tz}. Validation: hours are 0-23 ints; tz is any non-empty IANA
    string (we don't validate the IANA name here — invalid ones fall
    back to UTC at evaluation time)."""
    types_in = payload.get("alert_types")
    modes_in = payload.get("alert_modes")
    sched_in = payload.get("alert_schedule")
    qh_in = payload.get("quiet_hours")
    update: dict = {}
    if types_in is not None:
        if not isinstance(types_in, list) or any(t not in ALERT_TYPES for t in types_in):
            raise HTTPException(
                status_code=400,
                detail=f"alert_types must be a subset of {ALERT_TYPES}",
            )
        update["telegram_alert_types"] = list(types_in)
    if modes_in is not None:
        if not isinstance(modes_in, list) or any(m not in ALERT_MODES for m in modes_in):
            raise HTTPException(
                status_code=400,
                detail=f"alert_modes must be a subset of {ALERT_MODES}",
            )
        update["telegram_alert_modes"] = list(modes_in)
    if sched_in is not None:
        if not isinstance(sched_in, dict):
            raise HTTPException(status_code=400, detail="alert_schedule must be an object")
        for k, v in sched_in.items():
            if k not in ALERT_TYPES:
                raise HTTPException(status_code=400, detail=f"unknown channel {k}")
            if v not in ALERT_SCHEDULES:
                raise HTTPException(status_code=400, detail=f"schedule must be one of {ALERT_SCHEDULES}")
        # Merge over existing — partial updates only touch supplied keys.
        from core.db import db
        existing = await db.users.find_one(
            {"id": user["id"]},
            {"_id": 0, "telegram_alert_schedule": 1},
        ) or {}
        merged = _hydrate_schedule(existing.get("telegram_alert_schedule"))
        merged.update(sched_in)
        update["telegram_alert_schedule"] = merged
    if qh_in is not None:
        if not isinstance(qh_in, dict):
            raise HTTPException(status_code=400, detail="quiet_hours must be an object")
        if "enabled" in qh_in and not isinstance(qh_in["enabled"], bool):
            raise HTTPException(status_code=400, detail="quiet_hours.enabled must be a bool")
        for h_key in ("start_hour", "end_hour"):
            if h_key in qh_in:
                v = qh_in[h_key]
                if not isinstance(v, int) or isinstance(v, bool) or v < 0 or v > 23:
                    raise HTTPException(status_code=400, detail=f"quiet_hours.{h_key} must be int 0–23")
        if "tz" in qh_in and (not isinstance(qh_in["tz"], str) or not qh_in["tz"]):
            raise HTTPException(status_code=400, detail="quiet_hours.tz must be a non-empty string")
        from core.db import db
        existing = await db.users.find_one(
            {"id": user["id"]},
            {"_id": 0, "telegram_quiet_hours": 1},
        ) or {}
        merged = _hydrate_quiet_hours(existing.get("telegram_quiet_hours"))
        merged.update({k: v for k, v in qh_in.items() if k in ("enabled", "start_hour", "end_hour", "tz")})
        update["telegram_quiet_hours"] = merged
    if update:
        from core.db import db
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True, **update}
