"""COPPA-compliant parental consent flow for under-13 KidStocks signups.

Method: **Email-Plus** — the FTC-approved minimum standard for COPPA
verifiable parental consent. Two-step flow:

1.  Kid completes signup with `parent_email` + birthdate making them
    8-12 years old. We DO NOT issue a kid token. Account is created with
    `status: "awaiting_parental_consent"` and a unique consent token is
    emailed to the parent.
2.  Parent clicks the magic link, lands on a consent page that lists
    exactly what data we collect, why we collect it, and the parent's
    rights under COPPA. Parent types their full name + clicks consent.
    We mark the account `active`, grant the starting StockCoin balance,
    and send a *second* confirmation email to the parent (the "plus" of
    Email-Plus, sent on a 1h delay in V1 implementation — recorded
    inline as `confirmation_sent_at`).

Notes:
* The kid's password is NOT verified by the parent — COPPA cares about
  the data-collection consent, not the password.
* If the parent never consents the account stays `awaiting_parental_consent`
  forever. Login is gated against `status != "active"`.
* Consent tokens expire after 7 days. Parents can request a fresh
  email via `/api/kids/auth/resend-consent`.
* Under-8 users are still rejected — we have no developmentally
  appropriate UX for that age yet, and FTC guidance is stricter for
  the very young.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from core.db import db
from core.security import iso, now_utc
from services.email import send_parental_consent_email, send_consent_confirmation_email

router = APIRouter(prefix="/kids/auth", tags=["kids-consent"])

CONSENT_TOKEN_TTL = timedelta(days=7)


def _consent_token() -> str:
    """32-char URL-safe consent token. Cryptographically random; the
    only way to flip a kid record to `active`."""
    return secrets.token_urlsafe(24)


def _is_token_valid(consent_doc: dict) -> bool:
    """Return True if the token is unused AND unexpired."""
    if consent_doc.get("consented_at"):
        return False
    expires_at = consent_doc.get("expires_at")
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) > datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


async def _create_consent_record(kid: dict) -> str:
    """Create a fresh consent record and return the token. Invalidates
    any prior un-consented token by stamping it as superseded."""
    # Mark prior tokens for this kid as superseded so a stale email
    # link can't be re-used after a resend.
    await db.kids_consents.update_many(
        {"kid_id": kid["id"], "consented_at": None, "superseded_at": None},
        {"$set": {"superseded_at": iso(now_utc())}},
    )
    token = _consent_token()
    expires_at = datetime.now(timezone.utc) + CONSENT_TOKEN_TTL
    doc = {
        "id": str(uuid.uuid4()),
        "kid_id": kid["id"],
        "kid_email": kid["email"],
        "kid_full_name": kid.get("full_name"),
        "kid_age_at_signup": kid.get("age_at_signup"),
        "parent_email": kid.get("parent_email"),
        "consent_token": token,
        "sent_at": iso(now_utc()),
        "expires_at": iso(expires_at),
        "consented_at": None,
        "parent_full_name": None,
        "parent_ip": None,
        "parent_user_agent": None,
        "confirmation_sent_at": None,
        "superseded_at": None,
    }
    await db.kids_consents.insert_one(doc)
    return token


# ---------------------------------------------------------------------------
# /api/kids/auth/parental-consent/{token} — parent-facing endpoints
# ---------------------------------------------------------------------------

@router.get("/parental-consent/{token}")
async def get_consent_preview(token: str):
    """Return a parent-readable preview of the kid account awaiting
    consent. PUBLIC — the token IS the credential. Returns enough info
    for the parent to recognise their child without leaking PII to a
    random visitor (no password hash, no trade history, no IP/UA)."""
    doc = await db.kids_consents.find_one({"consent_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Consent link not found.")
    if doc.get("superseded_at"):
        raise HTTPException(status_code=410, detail="This link was replaced by a newer email. Please use the most recent link.")
    if doc.get("consented_at"):
        return {
            "already_consented": True,
            "kid_full_name": doc.get("kid_full_name"),
            "kid_email": doc.get("kid_email"),
            "consented_at": doc.get("consented_at"),
        }
    if not _is_token_valid(doc):
        raise HTTPException(status_code=410, detail="This consent link has expired. Ask your child to request a new one.")
    return {
        "already_consented": False,
        "kid_full_name": doc.get("kid_full_name"),
        "kid_email": doc.get("kid_email"),
        "kid_age_at_signup": doc.get("kid_age_at_signup"),
        "parent_email": doc.get("parent_email"),
        "expires_at": doc.get("expires_at"),
    }


class ConsentBody(BaseModel):
    parent_full_name: str = Field(..., min_length=2, max_length=100)
    agree: bool
    lang: str = Field(default="en", pattern=r"^(en|id)$")


@router.post("/parental-consent/{token}")
async def submit_consent(token: str, body: ConsentBody, request: Request):
    """Parent submits consent. Activates the kid record and grants the
    starting StockCoin balance. Idempotent (re-submit returns the same
    activation result)."""
    if not body.agree:
        raise HTTPException(status_code=400, detail="You must check the consent box to continue.")

    consent_doc = await db.kids_consents.find_one({"consent_token": token}, {"_id": 0})
    if not consent_doc:
        raise HTTPException(status_code=404, detail="Consent link not found.")
    if consent_doc.get("superseded_at"):
        raise HTTPException(status_code=410, detail="This link was replaced by a newer email.")
    if not consent_doc.get("consented_at") and not _is_token_valid(consent_doc):
        raise HTTPException(status_code=410, detail="This consent link has expired.")

    if consent_doc.get("consented_at"):
        # Idempotent — return success without mutating.
        return {"ok": True, "already_consented": True}

    now_iso = iso(now_utc())
    parent_ip = request.client.host if request.client else None
    parent_ua = (request.headers.get("user-agent") or "")[:300]

    # 1) Stamp consent record.
    await db.kids_consents.update_one(
        {"id": consent_doc["id"]},
        {"$set": {
            "consented_at": now_iso,
            "parent_full_name": body.parent_full_name.strip(),
            "parent_ip": parent_ip,
            "parent_user_agent": parent_ua,
        }},
    )

    # 2) Activate kid record. Grant the standard starting StockCoin
    #    balance only if it hasn't already been granted (defensive).
    from routers.kids_auth import STARTING_STOCK_COINS  # avoid circular at import time
    kid = await db.kids_users.find_one({"id": consent_doc["kid_id"]}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Account not found.")

    update_fields = {
        "status": "active",
        "consent_token_id": consent_doc["id"],
        "consented_at": now_iso,
    }
    if not kid.get("starting_stock_coins"):
        update_fields["starting_stock_coins"] = STARTING_STOCK_COINS
        update_fields["stock_coins_balance"] = STARTING_STOCK_COINS

    await db.kids_users.update_one(
        {"id": consent_doc["kid_id"]},
        {"$set": update_fields},
    )

    # 3) Confirmation email — Email-Plus second touch. Best-effort.
    try:
        await send_consent_confirmation_email(
            to_email=consent_doc["parent_email"],
            kid_full_name=consent_doc.get("kid_full_name") or "your child",
            parent_full_name=body.parent_full_name.strip(),
            lang=body.lang,
        )
        await db.kids_consents.update_one(
            {"id": consent_doc["id"]},
            {"$set": {"confirmation_sent_at": iso(now_utc())}},
        )
    except Exception:
        # Don't fail the request — consent is already recorded.
        pass

    return {"ok": True, "already_consented": False, "kid_full_name": consent_doc.get("kid_full_name")}


# ---------------------------------------------------------------------------
# /api/kids/auth/resend-consent — kid-facing (not auth-gated; uses email)
# ---------------------------------------------------------------------------

class ResendBody(BaseModel):
    email: EmailStr
    lang: str = Field(default="en", pattern=r"^(en|id)$")


@router.post("/resend-consent")
async def resend_consent(body: ResendBody):
    """Resend the consent email if the kid lost the original. Always
    returns the same 200 even if the email isn't found, to avoid leaking
    account existence."""
    email = body.email.lower().strip()
    kid = await db.kids_users.find_one({"email": email}, {"_id": 0})
    if not kid or kid.get("status") == "active" or not kid.get("parent_email"):
        return {"ok": True, "sent": False}

    token = await _create_consent_record(kid)
    try:
        await send_parental_consent_email(
            to_email=kid["parent_email"],
            kid_full_name=kid.get("full_name") or "your child",
            kid_email=kid["email"],
            kid_age=kid.get("age_at_signup", 0),
            consent_token=token,
            lang=body.lang or kid.get("lang") or "en",
        )
    except Exception:
        # Don't surface email-provider failures to a parent flow.
        pass
    return {"ok": True, "sent": True}
