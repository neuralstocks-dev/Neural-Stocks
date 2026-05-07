"""StockKids auth router — signup, login, /me.

V1-β scope (as of Feb 2026):
  * Ages 13-18: instant signup, no parental consent required (matches
    common practice for teen accounts; kids self-attest via birthdate).
  * Ages 8-12: signup creates an account in `awaiting_parental_consent`
    state, sends a verifiable parental-consent email (COPPA Email-Plus
    method). Login is gated until the parent consents.
  * Ages <8: rejected (no developmentally appropriate UX yet).

Defence-in-depth: backend re-validates birthdate, never trusts the
frontend to filter age.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core.db import db
from core.kids_security import create_kid_jwt, get_current_kid
from core.security import hash_password, iso, now_utc, verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kids/auth", tags=["kids-auth"])

# Starting balance for activated kids. Granted at signup for 13+, on
# parental consent for 8-12.
STARTING_STOCK_COINS = 10_000

# COPPA-driven age tiers.
MIN_AGE_NO_CONSENT = 13   # 13+ skips the consent flow.
MIN_AGE_WITH_CONSENT = 8  # 8-12 requires parental consent.


def _age_years(birthdate_iso: str) -> int:
    """Return whole years between birthdate and today in UTC.

    Raises ValueError on parse failure.
    """
    birth = date.fromisoformat(birthdate_iso)
    today = datetime.now(timezone.utc).date()
    return today.year - birth.year - (
        (today.month, today.day) < (birth.month, birth.day)
    )


def _age_band(age: int) -> str:
    """Map exact age to the 3 GAL bands."""
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
    parent_email: Optional[EmailStr] = None  # required only for ages 8-12
    lang: str = Field(default="en", pattern=r"^(en|id)$")


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


def _public_kid(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "full_name": doc.get("full_name"),
        "birthdate": doc.get("birthdate"),
        "age_band": doc.get("age_band"),
        "parent_email": doc.get("parent_email"),
        "lang": doc.get("lang", "en"),
        "stock_coins_balance": doc.get("stock_coins_balance", 0),
        "starting_stock_coins": doc.get("starting_stock_coins", 0),
        "status": doc.get("status", "active"),
        "created_at": doc.get("created_at"),
    }


@router.post("/signup")
async def signup(body: SignupBody):
    email = body.email.lower().strip()
    try:
        age = _age_years(body.birthdate)
    except ValueError:
        raise HTTPException(status_code=400, detail="Birthdate must be YYYY-MM-DD")

    # Hard floors. Under 8 is out of scope.
    if age < MIN_AGE_WITH_CONSENT:
        raise HTTPException(
            status_code=400,
            detail=f"StockKids is for ages {MIN_AGE_WITH_CONSENT} and up.",
        )
    if age > 100:
        raise HTTPException(status_code=400, detail="Birthdate looks wrong — please check.")

    needs_consent = age < MIN_AGE_NO_CONSENT  # ages 8-12

    if needs_consent and not body.parent_email:
        raise HTTPException(
            status_code=400,
            detail="A parent's email is required for ages 8–12 so we can ask their permission.",
        )

    if await db.kids_users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    student_id = str(uuid.uuid4())
    band = _age_band(age)
    parent_email = (body.parent_email or "").lower().strip() or None

    # 13+ → active immediately, balance granted now.
    # 8-12 → awaiting consent, balance granted ONLY after parent consents
    #         (so an unactivated account can't trade).
    if needs_consent:
        status = "awaiting_parental_consent"
        starting = 0
        balance = 0
    else:
        status = "active"
        starting = STARTING_STOCK_COINS
        balance = STARTING_STOCK_COINS

    doc = {
        "id": student_id,
        "email": email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name.strip(),
        "birthdate": body.birthdate,
        "age_at_signup": age,
        "age_band": band,
        "parent_email": parent_email,
        "lang": body.lang,
        "stock_coins_balance": balance,
        "starting_stock_coins": starting,
        "status": status,
        "created_at": iso(now_utc()),
    }
    await db.kids_users.insert_one(doc)

    if needs_consent:
        # Mint a consent token + send the parent email. Best-effort; if
        # email send fails, the account is still in the DB and the
        # parent can request a resend.
        from routers.kids_consent import _create_consent_record  # circular guard
        from services.email import send_parental_consent_email
        try:
            token = await _create_consent_record(doc)
            await send_parental_consent_email(
                to_email=parent_email,
                kid_full_name=doc["full_name"],
                kid_email=doc["email"],
                kid_age=age,
                consent_token=token,
                lang=body.lang,
            )
        except Exception as e:
            logger.error("Failed to send parental consent email: %s", e)
        return {
            "status": "awaiting_parental_consent",
            "parent_email": parent_email,
            "student": _public_kid(doc),
        }

    # Active path: issue token immediately.
    token = create_kid_jwt(student_id)
    return {"status": "active", "token": token, "student": _public_kid(doc)}


@router.post("/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.kids_users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash") or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("status") and user.get("status") != "active":
        # 403 Forbidden — credentials are correct but the account is not
        # yet activated. Tell the kid to ask their parent to check email.
        raise HTTPException(
            status_code=403,
            detail="Your account is waiting for a parent's approval. Ask them to check their email for the consent link.",
        )
    token = create_kid_jwt(user["id"])
    return {"status": "active", "token": token, "student": _public_kid(user)}


@router.get("/me")
async def me(student=Depends(get_current_kid)):
    return _public_kid(student)
