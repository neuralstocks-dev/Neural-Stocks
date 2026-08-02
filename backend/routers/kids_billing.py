"""KidStocks billing — Stripe Checkout for the "KidStocks Pro" plan.

Architecture: a paid plan is bought by a *parent*, not a kid — kids never
see a card form, matching COPPA (no minor should be handling payment
details) and the existing parent-portal auth model (routers/kids_parent.py):
the parent's magic-link session token is the only credential here, exactly
like the read-only dashboard.

One subscription per `parent_email`, propagated to every `kids_users` doc
under that parent (`db.kids_users.update_many({"parent_email": ...})`) —
mirrors how the parent dashboard already aggregates all of a parent's kids
under one email. Reuses services/stripe_service.py as-is (it's
provider-agnostic — `parent_email` is passed through as an opaque
`user_id` string for `client_reference_id`/metadata).

Stripe-only for v1 — no PayPal — since PayPal subscriptions need a
pre-created billing plan (services/paypal.py:get_plan_ids) that isn't worth
setting up for this smaller surface yet.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from core.config import KIDS_PLANS, STRIPE_MODE, STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY
from core.db import db
from core.security import iso, now_utc
from routers.kids_parent import _resolve_parent
from services.email import send_receipt_email
from services.stripe_service import (
    STRIPE_STATUS_MAP,
    StripeError,
    cancel_subscription_at_period_end,
    create_subscription_checkout_session,
    retrieve_session,
    retrieve_subscription,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kids/billing", tags=["kids-billing"])

_PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")


def _kids_frontend_origin(request: Request) -> str:
    """Mirrors services/email.py's fallback for kids links — kidstocks.net
    is the canonical kids domain even when PUBLIC_APP_URL is unset."""
    if _PUBLIC_APP_URL:
        return _PUBLIC_APP_URL
    origin = (request.headers.get("origin") or request.headers.get("referer") or "").rstrip("/")
    return origin or "https://kidstocks.net"


class KidsTokenReq(BaseModel):
    token: str = Field(..., max_length=64)


class KidsConfirmReq(BaseModel):
    token: str = Field(..., max_length=64)
    session_id: str


# =============================================================================
# Config + status — read-only, token-scoped
# =============================================================================

@router.get("/config")
async def kids_billing_config():
    """Public — plan catalog + Stripe publishable key, for the pricing
    teaser on /kids/about and /kids/for-parents (no parent login needed
    just to see prices)."""
    return {
        "plans": KIDS_PLANS,
        "stripe": {
            "publishable_key": STRIPE_PUBLISHABLE_KEY,
            "mode": STRIPE_MODE,
            "configured": bool(STRIPE_SECRET_KEY),
        },
    }


@router.get("/status")
async def kids_billing_status(token: Optional[str] = None):
    parent_email = await _resolve_parent(token)
    sub = await db.kids_subscriptions.find_one({"parent_email": parent_email}, {"_id": 0})
    plan = (sub or {}).get("plan") or "free"
    plan_def = KIDS_PLANS.get(plan, KIDS_PLANS["free"])
    return {
        "parent_email": parent_email,
        "plan": plan,
        "plan_name": plan_def["name"],
        "subscription_status": (sub or {}).get("status"),
        "cancels_at": (sub or {}).get("cancels_at"),
    }


# =============================================================================
# Stripe Checkout
# =============================================================================

@router.post("/stripe/checkout")
async def kids_stripe_checkout(req: KidsTokenReq, request: Request):
    parent_email = await _resolve_parent(req.token)
    plan_def = KIDS_PLANS["kids_pro"]

    base = _kids_frontend_origin(request)
    success_url = (
        f"{base}/kids/parent/dashboard?token={req.token}"
        f"&kids_stripe_session_id={{CHECKOUT_SESSION_ID}}&kids_stripe=success"
    )
    cancel_url = f"{base}/kids/parent/dashboard?token={req.token}&kids_stripe=cancelled"
    try:
        session = await create_subscription_checkout_session(
            user_id=parent_email,
            user_email=parent_email,
            plan="kids_pro",
            cycle="monthly",
            price_usd=float(plan_def["price_usd"]),
            promo_pct=0.0,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {e}")
    return {"checkout_url": session["url"], "session_id": session["id"]}


async def activate_kids_subscription_from_session(session: dict) -> dict | None:
    """Mirrors routers.billing._activate_subscription_from_session's
    hardening: a Checkout Session's payment_status freezes at "paid"
    forever, even after the subscription it created is later cancelled —
    so we always re-check the subscription's *live* status before granting
    anything, never trusting the session snapshot alone."""
    meta = session.get("metadata") or {}
    parent_email = meta.get("user_id") or session.get("client_reference_id")
    plan = meta.get("plan")
    cycle = meta.get("cycle", "monthly")
    subscription_id = session.get("subscription")
    if isinstance(subscription_id, dict):
        subscription_id = subscription_id.get("id")
    if not (parent_email and plan and subscription_id):
        logger.warning("Kids Stripe checkout.session.completed missing fields: session=%s", session.get("id"))
        return None

    has_active_kid = await db.kids_users.find_one(
        {"parent_email": parent_email, "status": "active"}, {"_id": 0, "id": 1}
    )
    if not has_active_kid:
        logger.warning("Kids Stripe checkout session for unknown parent_email=%s", parent_email)
        return None

    try:
        live_sub = await retrieve_subscription(subscription_id)
    except StripeError as e:
        logger.warning("Kids Stripe activation: could not verify live subscription %s: %s", subscription_id, e)
        return {"stale": True, "reason": "lookup_failed"}

    live_status = (live_sub.get("status") or "").upper()
    if live_status not in ("ACTIVE", "TRIALING"):
        mapped = STRIPE_STATUS_MAP.get(live_status, live_status or "CANCELLED")
        logger.info(
            "Kids Stripe activation skipped — subscription %s is no longer active (status=%s): parent=%s",
            subscription_id, live_status, parent_email,
        )
        existing = await db.kids_subscriptions.find_one({"parent_email": parent_email}, {"_id": 0})
        await db.kids_subscriptions.update_one(
            {"parent_email": parent_email},
            {"$set": {"status": mapped, "updated_at": iso(now_utc())},
             "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": iso(now_utc())}},
            upsert=True,
        )
        if mapped == "CANCELLED" and (existing or {}).get("subscription_id") == subscription_id:
            await db.kids_users.update_many(
                {"parent_email": parent_email},
                {"$set": {"plan": "free", "subscription_status": "CANCELLED"},
                 "$unset": {"stripe_subscription_id": "", "stripe_cycle": ""}},
            )
        return {"stale": True, "reason": "subscription_not_active", "status": live_status}

    amount_total = (session.get("amount_total") or 0) / 100.0
    customer_id = session.get("customer")
    if isinstance(customer_id, dict):
        customer_id = customer_id.get("id")

    await db.kids_users.update_many(
        {"parent_email": parent_email},
        {"$set": {
            "plan": plan,
            "payment_provider": "stripe",
            "stripe_subscription_id": subscription_id,
            "stripe_customer_id": customer_id,
            "stripe_cycle": cycle,
            "subscription_status": "ACTIVE",
            "subscription_activated_at": iso(now_utc()),
        }},
    )
    await db.kids_subscriptions.update_one(
        {"parent_email": parent_email},
        {"$set": {
            "subscription_id": subscription_id,
            "provider": "stripe",
            "parent_email": parent_email,
            "plan": plan,
            "cycle": cycle,
            "status": "ACTIVE",
            "amount": amount_total,
            "cancels_at": None,
            "updated_at": iso(now_utc()),
        }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": iso(now_utc())}},
        upsert=True,
    )
    plan_name = KIDS_PLANS.get(plan, {}).get("name", "KidStocks Pro") + (
        " · Yearly" if cycle == "yearly" else " · Monthly"
    )
    try:
        await send_receipt_email(
            to_email=parent_email,
            full_name="",
            plan_name=plan_name,
            amount=amount_total,
            subscription_id=subscription_id,
        )
    except Exception as e:
        logger.warning("Kids Stripe receipt email failed (activation still succeeded): %s", e)
    return {"plan": plan, "cycle": cycle, "plan_name": plan_name, "amount": amount_total}


@router.post("/stripe/confirm")
async def kids_stripe_confirm(req: KidsConfirmReq):
    """Client-triggered fast path right after the browser bounces back from
    Stripe Checkout — the webhook (routers/billing.py's /billing/stripe/webhook,
    branched by metadata.plan) remains the authoritative, retry-safe path if
    this call is missed."""
    parent_email = await _resolve_parent(req.token)
    try:
        session = await retrieve_session(req.session_id)
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe lookup failed: {e}")

    meta = session.get("metadata") or {}
    owner = session.get("client_reference_id") or meta.get("user_id")
    if owner != parent_email:
        raise HTTPException(status_code=403, detail="This checkout session does not belong to your account")
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        return {"ok": False, "status": session.get("payment_status"), "message": "Payment not completed yet."}

    result = await activate_kids_subscription_from_session(session)
    if not result:
        raise HTTPException(status_code=500, detail="Could not activate plan — contact support")
    if result.get("stale"):
        return {
            "ok": False,
            "status": "stale",
            "message": "This checkout link has already been used and the subscription is no longer active. "
                       "Refresh the dashboard to see your current plan, or subscribe again if you'd like to resume.",
        }
    return {
        "ok": True,
        **result,
        "message": f"{result.get('plan_name', result.get('plan'))} activated. Receipt sent to {parent_email}.",
    }


@router.post("/stripe/cancel")
async def kids_stripe_cancel(req: KidsTokenReq):
    parent_email = await _resolve_parent(req.token)
    sub = await db.kids_subscriptions.find_one({"parent_email": parent_email}, {"_id": 0})
    sid = (sub or {}).get("subscription_id")
    if not sid or (sub or {}).get("status") != "ACTIVE":
        raise HTTPException(status_code=400, detail="No active KidStocks Pro subscription")
    try:
        stripe_sub = await cancel_subscription_at_period_end(sid)
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe cancel failed: {e}")

    period_end_ts = stripe_sub.get("current_period_end")
    if period_end_ts:
        period_end = iso(datetime.fromtimestamp(period_end_ts, tz=timezone.utc))
    else:
        period_end = iso(now_utc() + timedelta(days=30))

    await db.kids_users.update_many(
        {"parent_email": parent_email},
        {"$set": {"subscription_status": "CANCELLED", "subscription_cancels_at": period_end}},
    )
    await db.kids_subscriptions.update_one(
        {"parent_email": parent_email},
        {"$set": {"status": "CANCELLED", "cancels_at": period_end, "updated_at": iso(now_utc())}},
    )
    return {
        "ok": True,
        "cancels_at": period_end,
        "message": f"Subscription cancelled. You keep KidStocks Pro access until {period_end[:10]}, then revert to Free. No further charges.",
    }


# =============================================================================
# Webhook fallback helpers — called from routers/billing.py's single
# /billing/stripe/webhook when the adult-side db.subscriptions lookup misses
# (i.e. the event belongs to a kids subscription instead).
# =============================================================================

async def kids_subscription_deleted(subscription_id: str) -> bool:
    sub_doc = await db.kids_subscriptions.find_one({"subscription_id": subscription_id}, {"_id": 0})
    if not sub_doc:
        return False
    parent_email = sub_doc["parent_email"]
    await db.kids_users.update_many(
        {"parent_email": parent_email},
        {"$set": {"plan": "free", "subscription_status": "CANCELLED"},
         "$unset": {"stripe_subscription_id": "", "stripe_cycle": ""}},
    )
    await db.kids_subscriptions.update_one(
        {"subscription_id": subscription_id},
        {"$set": {"status": "CANCELLED", "updated_at": iso(now_utc())}},
    )
    return True


async def kids_subscription_status_updated(subscription_id: str, mapped_status: str) -> bool:
    sub_doc = await db.kids_subscriptions.find_one({"subscription_id": subscription_id}, {"_id": 0})
    if not sub_doc:
        return False
    await db.kids_users.update_many(
        {"parent_email": sub_doc["parent_email"]},
        {"$set": {"subscription_status": mapped_status}},
    )
    await db.kids_subscriptions.update_one(
        {"subscription_id": subscription_id},
        {"$set": {"status": mapped_status, "updated_at": iso(now_utc())}},
    )
    return True
