"""Auth: email/password JWT + Emergent Google OAuth + login tracking."""
import uuid
import secrets
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel as _BaseModel

from core.db import db
from core.models import SignupReq, LoginReq, AuthResp, GoogleSessionReq
from core.security import (
    hash_password,
    verify_password,
    create_jwt,
    get_current_user,
    is_admin_email,
    iso,
    now_utc,
)

router = APIRouter(prefix="/auth", tags=["auth"])


async def _record_login(user_id: str, email: str, method: str, request: Request):
    await db.login_events.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "email": email,
            "method": method,
            "at": iso(now_utc()),
            "ip": request.client.host if request and request.client else None,
            "user_agent": request.headers.get("user-agent") if request else None,
        }
    )
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"last_login_at": iso(now_utc())}, "$inc": {"login_count": 1}},
    )


def _public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "full_name": u.get("full_name") or u["email"].split("@")[0],
        "plan": u.get("plan") or "free",
        "is_admin": is_admin_email(u.get("email")),
        "test_unlock_expires_at": u.get("test_unlock_expires_at"),
    }


@router.post("/register", response_model=AuthResp)
async def register(req: SignupReq, request: Request):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": req.email.lower(),
        "full_name": req.full_name,
        "password_hash": hash_password(req.password),
        "plan": "free",
        "google_linked": False,
        "login_count": 0,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    await _record_login(user_id, doc["email"], "email", request)
    try:
        from routers.experiments import attribute_signup_from_headers
        await attribute_signup_from_headers(user_id, request.headers)
    except Exception:
        pass
    return {"token": create_jwt(user_id), "user": _public_user(doc)}


@router.post("/login", response_model=AuthResp)
async def login(req: LoginReq, request: Request):
    user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if not user or not verify_password(req.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    await _record_login(user["id"], user["email"], "email", request)
    return {"token": create_jwt(user["id"]), "user": _public_user(user)}


@router.post("/magic", response_model=AuthResp)
async def magic_login(payload: dict, request: Request):
    """Redeem a one-time magic token (issued at Telegram-push time) for
    a regular JWT. Used by the frontend's auto-login flow when a user
    opens an alert deep link from Telegram — they should never see a
    login screen.

    Returns the same shape as /login so the frontend can store it in
    `localStorage.sai_token` and `sai_user` without branching."""
    from services.magic_link import redeem_magic_token

    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token required")

    user_id = await redeem_magic_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired link")

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired link")

    await _record_login(user["id"], user["email"], "magic_link", request)
    return {"token": create_jwt(user["id"]), "user": _public_user(user)}


# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
@router.post("/google/session", response_model=AuthResp)
async def google_session(req: GoogleSessionReq, request: Request):
    if not req.session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.get(
                "https://disabled.invalid/emergent-auth-not-available",
                headers={"X-Session-ID": req.session_id},
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Emergent auth unreachable: {e}")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or (email.split("@")[0] if email else "")
    if not email:
        raise HTTPException(status_code=400, detail="Google profile missing email")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["id"]
        updates = {}
        if not existing.get("plan"):
            updates["plan"] = "free"
        if not existing.get("google_linked"):
            updates["google_linked"] = True
        if updates:
            await db.users.update_one({"id": user_id}, {"$set": updates})
        user_doc = {**existing, **updates}
    else:
        user_id = str(uuid.uuid4())
        user_doc = {
            "id": user_id,
            "email": email,
            "full_name": name,
            "plan": "free",
            "google_linked": True,
            "password_hash": None,
            "login_count": 0,
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(user_doc)
        try:
            from routers.experiments import attribute_signup_from_headers
            await attribute_signup_from_headers(user_id, request.headers)
        except Exception:
            pass
    await _record_login(user_id, email, "google", request)
    return {"token": create_jwt(user_id), "user": _public_user(user_doc)}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user


@router.get("/me/auto-scan")
async def get_auto_scan_prefs(user=Depends(get_current_user)):
    """Current state of the user's Watchlist Auto-Scan preference + last run stats."""
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "auto_scan_enabled": 1, "auto_scan_last_run_at": 1,
         "auto_scan_last_alerts_sent": 1, "telegram_chat_id": 1, "plan": 1},
    ) or {}
    eligible_plan = (
        bool(user.get("is_admin"))
        or u.get("plan") in ("pro", "elite", "daypass")
    )
    return {
        "enabled": bool(u.get("auto_scan_enabled")),
        "telegram_linked": bool(u.get("telegram_chat_id")),
        "plan_eligible": eligible_plan,
        "last_run_at": u.get("auto_scan_last_run_at"),
        "last_alerts_sent": u.get("auto_scan_last_alerts_sent"),
    }


@router.post("/me/auto-scan")
async def set_auto_scan_prefs(payload: dict, user=Depends(get_current_user)):
    """Toggle Watchlist Auto-Scan. Requires Pro/Elite/Day-Pass/Admin plus a
    linked Telegram chat — otherwise we won't have anywhere to push alerts."""
    want_enabled = bool(payload.get("enabled"))
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "plan": 1, "telegram_chat_id": 1},
    ) or {}
    eligible_plan = (
        bool(user.get("is_admin"))
        or u.get("plan") in ("pro", "elite", "daypass")
    )
    if want_enabled and not eligible_plan:
        raise HTTPException(
            status_code=402,
            detail="Watchlist Auto-Scan is a Pro/Elite/Day-Pass feature. Upgrade to enable it.",
        )
    if want_enabled and not u.get("telegram_chat_id"):
        raise HTTPException(
            status_code=400,
            detail="Link your Telegram bot first — Auto-Scan pushes alerts over Telegram.",
        )
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"auto_scan_enabled": want_enabled}},
    )
    return {"ok": True, "enabled": want_enabled}


@router.get("/me/weekly-digest")
async def get_weekly_digest_prefs(user=Depends(get_current_user)):
    """Current state of the user's Weekly RF Digest email preference."""
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "weekly_digest_enabled": 1, "weekly_digest_last_run_at": 1,
         "weekly_digest_last_signal_count": 1, "plan": 1},
    ) or {}
    is_paid = (
        bool(user.get("is_admin"))
        or u.get("plan") in ("pro", "elite", "daypass")
    )
    return {
        "enabled": bool(u.get("weekly_digest_enabled")),
        "is_paid": is_paid,
        "last_run_at": u.get("weekly_digest_last_run_at"),
        "last_signal_count": u.get("weekly_digest_last_signal_count"),
    }


@router.post("/me/weekly-digest")
async def set_weekly_digest_prefs(payload: dict, user=Depends(get_current_user)):
    """Opt in or out of the Sunday-evening Weekly RF Digest email. Open
    to all plans (Free gets top 3, Pro/Elite get top 5)."""
    want_enabled = bool(payload.get("enabled"))
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"weekly_digest_enabled": want_enabled}},
    )
    return {"ok": True, "enabled": want_enabled}


class ForgotPasswordReq(_BaseModel):
    email: str


class ResetPasswordReq(_BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordReq):
    """Send password reset email. Always returns 200 to avoid email enumeration."""
    from services.email import send_password_reset_email as _send_reset_email
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=1)
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_reset_token": token, "password_reset_expires": expires}}
        )
        await _send_reset_email(email, user.get("full_name", ""), token)
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordReq):
    """Verify token and set new password."""
    user = await db.users.find_one({"password_reset_token": req.token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    expires = user.get("password_reset_expires")
    if not expires or datetime.utcnow() > expires.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="Reset token has expired. Please request a new one.")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    hashed = hash_password(req.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hashed}, "$unset": {"password_reset_token": "", "password_reset_expires": ""}}
    )
    return {"message": "Password reset successfully. You can now log in."}
