"""Auth: email/password JWT + Emergent Google OAuth + login tracking."""
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Depends, Request

from core.config import EMERGENT_AUTH_SESSION_URL
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
    return {"token": create_jwt(user_id), "user": _public_user(doc)}


@router.post("/login", response_model=AuthResp)
async def login(req: LoginReq, request: Request):
    user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if not user or not verify_password(req.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    await _record_login(user["id"], user["email"], "email", request)
    return {"token": create_jwt(user["id"]), "user": _public_user(user)}


# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
@router.post("/google/session", response_model=AuthResp)
async def google_session(req: GoogleSessionReq, request: Request):
    if not req.session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.get(
                EMERGENT_AUTH_SESSION_URL,
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
    await _record_login(user_id, email, "google", request)
    return {"token": create_jwt(user_id), "user": _public_user(user_doc)}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user
