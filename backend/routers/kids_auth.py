"""StockKids auth router — signup, login, /me.

Strict V1-α scope:
  * Age floor 13+ at signup (no COPPA parental-consent flow yet — that's V2).
  * Birthdate-based check, not just self-attest, so we have a hard
    audit trail. The frontend never lets <13 reach this endpoint, but
    the backend re-validates as a defence-in-depth measure.
  * Starting StockCoins balance 10,000 SC, granted atomically with the
    signup insert so a kid can never end up "registered but broke".
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core.db import db
from core.kids_security import create_kid_jwt, get_current_kid
from core.security import hash_password, iso, now_utc, verify_password

router = APIRouter(prefix="/kids/auth", tags=["kids-auth"])

# Starting balance — same value the user locked in the planning step.
STARTING_STOCK_COINS = 10_000

# COPPA floor for V1. Lift to 8+ in V2 when the parent-verification
# workflow is built. The hardcoded floor here is intentional — making
# this configurable invites accidental loosening.
MIN_AGE_YEARS = 13


def _age_years(birthdate_iso: str) -> int:
    """Return whole years between birthdate and today in UTC."""
    birth = date.fromisoformat(birthdate_iso)
    today = datetime.now(timezone.utc).date()
    return today.year - birth.year - (
        (today.month, today.day) < (birth.month, birth.day)
    )


def _age_band(age: int) -> str:
    """Map exact age to the 3 GAL bands. Reused by every kid-side feature."""
    # V1-α floor is 13 so the 8-10 band is unreachable via signup, but
    # we keep it in the mapping for forward-compat with V2 parent-flow.
    if age <= 10:
        return "8-10"
    if age <= 13:
        return "11-13"
    return "14-18"


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=80)
    birthdate: str = Field(..., description="YYYY-MM-DD")
    parent_email: Optional[EmailStr] = None  # contact only, no consent flow yet


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


def _public_kid(doc: dict) -> dict:
    """Strip private fields before returning a kid record to the client."""
    return {
        "id": doc["id"],
        "email": doc["email"],
        "full_name": doc.get("full_name"),
        "birthdate": doc.get("birthdate"),
        "age_band": doc.get("age_band"),
        "parent_email": doc.get("parent_email"),
        "stock_coins_balance": doc.get("stock_coins_balance", 0),
        "created_at": doc.get("created_at"),
    }


@router.post("/signup")
async def signup(body: SignupBody):
    email = body.email.lower().strip()
    # Birthdate must parse + meet the age floor.
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.birthdate):
        raise HTTPException(status_code=400, detail="Birthdate must be YYYY-MM-DD")
    try:
        age = _age_years(body.birthdate)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid birthdate")
    if age < MIN_AGE_YEARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"StockKids is currently for ages {MIN_AGE_YEARS}+. "
                "Younger kids can join when our parent-verified flow ships in V2."
            ),
        )
    if age > 100:
        raise HTTPException(status_code=400, detail="Birthdate looks wrong — please check.")

    # Email uniqueness (case-insensitive). The kids_users.email index is
    # created at startup; this find_one is a friendlier-error pre-check.
    if await db.kids_users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    student_id = str(uuid.uuid4())
    band = _age_band(age)
    doc = {
        "id": student_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name.strip(),
        "birthdate": body.birthdate,
        "age_at_signup": age,
        "age_band": band,
        "parent_email": (body.parent_email or "").lower().strip() or None,
        "stock_coins_balance": STARTING_STOCK_COINS,
        "starting_stock_coins": STARTING_STOCK_COINS,
        "created_at": iso(now_utc()),
    }
    await db.kids_users.insert_one(doc)
    token = create_kid_jwt(student_id)
    return {"token": token, "student": _public_kid(doc)}


@router.post("/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.kids_users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash") or ""):
        # Deliberate single error message — don't leak whether the email exists.
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_kid_jwt(user["id"])
    return {"token": token, "student": _public_kid(user)}


@router.get("/me")
async def me(student=Depends(get_current_kid)):
    return _public_kid(student)
