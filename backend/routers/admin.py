"""Admin: user management, test-unlock, login events, pricing."""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.config import UNLOCK_DURATIONS, ADMIN_EMAILS
from core.db import db
from core.models import UnlockReq
from core.security import admin_required, iso, now_utc, is_admin_email
from services.pricing import get_pricing, set_pricing
from services.paypal import get_plan_ids, PayPalError

router = APIRouter(prefix="/admin", tags=["admin"])


class PricingReq(BaseModel):
    pro_price: float = Field(gt=0, le=9999)
    elite_price: float = Field(gt=0, le=9999)


def _sanitize_user(u: dict) -> dict:
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "full_name": u.get("full_name"),
        "plan": u.get("plan") or "free",
        "is_admin": is_admin_email(u.get("email")),
        "google_linked": bool(u.get("google_linked")),
        "test_unlock_expires_at": u.get("test_unlock_expires_at"),
        "test_unlock_granted_at": u.get("test_unlock_granted_at"),
        "test_unlock_granted_by": u.get("test_unlock_granted_by"),
        "login_count": u.get("login_count") or 0,
        "last_login_at": u.get("last_login_at"),
        "created_at": u.get("created_at"),
    }


@router.get("/users")
async def list_users(limit: int = 200, _admin=Depends(admin_required)):
    users = (
        await db.users.find({}, {"_id": 0, "password_hash": 0})
        .sort("created_at", -1)
        .to_list(max(1, min(limit, 500)))
    )
    return [_sanitize_user(u) for u in users]


@router.get("/logins")
async def list_login_events(limit: int = 100, _admin=Depends(admin_required)):
    events = (
        await db.login_events.find({}, {"_id": 0})
        .sort("at", -1)
        .to_list(max(1, min(limit, 500)))
    )
    return events


@router.get("/durations")
async def list_durations(_admin=Depends(admin_required)):
    return {k: v for k, v in UNLOCK_DURATIONS.items()}


@router.post("/users/{user_id}/unlock")
async def unlock_user(user_id: str, req: UnlockReq, admin=Depends(admin_required)):
    seconds = UNLOCK_DURATIONS.get(req.duration)
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    expires_value = "forever" if seconds is None else iso(now_utc() + timedelta(seconds=seconds))
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "test_unlock_expires_at": expires_value,
            "test_unlock_granted_at": iso(now_utc()),
            "test_unlock_granted_by": admin["id"],
            "test_unlock_duration": req.duration,
        }},
    )
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "test_unlock_expires_at": expires_value,
        "duration": req.duration,
        "message": f"{target['email']} unlocked with Elite features for {req.duration}. User must log out & log back in to see changes.",
    }


@router.post("/users/{user_id}/reset")
async def reset_user(user_id: str, _admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {"plan": "free"},
            "$unset": {
                "test_unlock_expires_at": "",
                "test_unlock_granted_at": "",
                "test_unlock_granted_by": "",
                "test_unlock_duration": "",
            },
        },
    )
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "message": f"{target['email']} reset to Free plan. User must log out & log back in to see changes.",
    }


# ---------- User deletion ----------
@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if is_admin_email(target.get("email")):
        raise HTTPException(status_code=403, detail="Cannot delete an admin account")
    if target["id"] == admin["id"]:
        raise HTTPException(status_code=403, detail="Cannot delete yourself")
    # Cancel any active PayPal subscription so we don't leave orphans billing
    sid = target.get("paypal_subscription_id")
    if sid:
        try:
            from services.paypal import cancel_subscription, PayPalError
            await cancel_subscription(sid, reason="User account deleted by admin")
        except Exception:
            pass  # best-effort — proceed with local delete regardless
    # Cascade delete owned data
    await db.watchlist.delete_many({"user_id": user_id})
    await db.analyses.delete_many({"user_id": user_id})
    await db.alerts.delete_many({"user_id": user_id})
    await db.shared_verdicts.delete_many({"owner_id": user_id})
    await db.quick_jobs.delete_many({"user_id": user_id})
    await db.disclaimers.delete_many({"user_id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    await db.users.delete_one({"id": user_id})
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "message": f"{target['email']} and all associated data deleted.",
    }


# ---------- Alert list removal ----------
@router.delete("/users/{user_id}/alerts")
async def delete_user_alerts(user_id: str, _admin=Depends(admin_required)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    res = await db.alerts.delete_many({"user_id": user_id})
    return {
        "ok": True,
        "user_id": user_id,
        "email": target["email"],
        "removed": res.deleted_count,
        "message": f"Cleared {res.deleted_count} alerts for {target['email']}.",
    }


# ---------- Pricing management ----------
@router.get("/pricing")
async def get_admin_pricing(_admin=Depends(admin_required)):
    return await get_pricing()


@router.put("/pricing")
async def update_admin_pricing(req: PricingReq, _admin=Depends(admin_required)):
    prices = await set_pricing(req.pro_price, req.elite_price)
    # Rotate PayPal plans so new checkouts charge the new price
    try:
        plan_ids = await get_plan_ids(prices)
    except PayPalError as e:
        raise HTTPException(status_code=502, detail=f"Price saved but PayPal plan rotation failed: {e}")
    return {
        "ok": True,
        "prices": prices,
        "plan_ids": plan_ids,
        "message": f"Updated pricing: Pro ${prices['pro']:.2f}/mo · Elite ${prices['elite']:.2f}/mo. New checkouts will use the updated prices; existing subscribers continue at their current rate until they resubscribe.",
    }
