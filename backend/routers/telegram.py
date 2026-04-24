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
        "Neulab · test notification",
        "If you're reading this, Telegram alerts are working. You'll get pattern and verdict alerts here.",
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Not linked to Telegram yet, or send failed.")
    return {"sent": True}



# ─── Alert preferences ──────────────────────────────────────────────────
ALERT_TYPES = ["signal", "pattern", "rf_watchlist_scan"]
ALERT_MODES = ["standard", "candlestick", "hybrid"]
ALERT_SCHEDULES = ["realtime", "digest_daily", "digest_weekly"]
DEFAULT_SCHEDULE = {t: "realtime" for t in ALERT_TYPES}


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
        {"_id": 0, "telegram_alert_types": 1, "telegram_alert_modes": 1, "telegram_alert_schedule": 1},
    ) or {}
    return {
        "alert_types": u.get("telegram_alert_types") if u.get("telegram_alert_types") is not None else list(ALERT_TYPES),
        "alert_modes": u.get("telegram_alert_modes") if u.get("telegram_alert_modes") is not None else list(ALERT_MODES),
        "alert_schedule": _hydrate_schedule(u.get("telegram_alert_schedule")),
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
    must be in ALERT_SCHEDULES."""
    types_in = payload.get("alert_types")
    modes_in = payload.get("alert_modes")
    sched_in = payload.get("alert_schedule")
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
    if update:
        from core.db import db
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True, **update}
