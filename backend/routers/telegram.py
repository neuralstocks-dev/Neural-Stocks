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


@router.get("/preferences")
async def get_preferences(user=Depends(get_current_user)):
    """Return the user's Telegram alert filter preferences. Both fields
    default to "all enabled" for backward compatibility — existing users
    keep receiving everything until they explicitly opt out."""
    from core.db import db
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "telegram_alert_types": 1, "telegram_alert_modes": 1},
    ) or {}
    return {
        "alert_types": u.get("telegram_alert_types") if u.get("telegram_alert_types") is not None else list(ALERT_TYPES),
        "alert_modes": u.get("telegram_alert_modes") if u.get("telegram_alert_modes") is not None else list(ALERT_MODES),
        "all_alert_types": list(ALERT_TYPES),
        "all_alert_modes": list(ALERT_MODES),
    }


@router.post("/preferences")
async def set_preferences(payload: dict, user=Depends(get_current_user)):
    """Persist the user's Telegram alert filter preferences. Each list
    must be a subset of the canonical ALERT_TYPES / ALERT_MODES — anything
    else is rejected so the DB never holds invalid filter values."""
    types_in = payload.get("alert_types")
    modes_in = payload.get("alert_modes")
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
    if update:
        from core.db import db
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True, **update}
