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
