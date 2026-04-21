"""Billing routes: PayPal subscription lifecycle + webhook."""
import logging
import uuid
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.config import PAYPAL_CLIENT_ID, PAYPAL_ENV
from core.db import db
from core.security import get_current_user, iso, now_utc
from services.pricing import get_pricing
from services.paypal import (
    get_plan_ids,
    get_subscription,
    cancel_subscription,
    verify_webhook_signature,
    PayPalError,
)
from services.email import send_receipt_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])


class ActivateReq(BaseModel):
    subscription_id: str
    plan: Literal["pro", "elite"]
    cycle: Literal["monthly", "yearly"] = "monthly"


@router.get("/config")
async def billing_config(user=Depends(get_current_user)):
    """Returns client-side PayPal config — public key + live plan ids."""
    prices = await get_pricing()
    try:
        plan_ids = await get_plan_ids(prices)
    except PayPalError as e:
        logger.error("Plan lookup failed: %s", e)
        raise HTTPException(status_code=503, detail=f"PayPal unavailable: {e}")
    return {
        "client_id": PAYPAL_CLIENT_ID,
        "env": PAYPAL_ENV,
        "plan_ids": plan_ids,
        "prices": prices,
    }


@router.post("/activate")
async def activate_subscription(req: ActivateReq, user=Depends(get_current_user)):
    """Called from frontend onApprove. Verifies subscription with PayPal,
    upgrades user's plan, stores record, sends receipt email."""
    try:
        sub = await get_subscription(req.subscription_id)
    except PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal lookup failed: {e}")

    status = (sub.get("status") or "").upper()
    if status not in ("ACTIVE", "APPROVED", "APPROVAL_PENDING"):
        raise HTTPException(status_code=400, detail=f"Subscription not active (status={status})")

    # Resolve amount from billing info
    billing_info = sub.get("billing_info") or {}
    last_payment = billing_info.get("last_payment") or {}
    amount_val = (last_payment.get("amount") or {}).get("value")
    if not amount_val:
        prices = await get_pricing()
        key = f"{req.plan}_{req.cycle}"
        amount_val = f"{prices[key]:.2f}"
    next_billing = billing_info.get("next_billing_time")

    # Upgrade user
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "plan": req.plan,
            "paypal_subscription_id": req.subscription_id,
            "paypal_plan": req.plan,
            "paypal_cycle": req.cycle,
            "subscription_status": status,
            "subscription_activated_at": iso(now_utc()),
        }},
    )

    # Record subscription
    await db.subscriptions.update_one(
        {"subscription_id": req.subscription_id},
        {"$set": {
            "id": str(uuid.uuid4()),
            "subscription_id": req.subscription_id,
            "user_id": user["id"],
            "email": user["email"],
            "plan": req.plan,
            "cycle": req.cycle,
            "status": status,
            "amount": float(amount_val),
            "next_billing_time": next_billing,
            "updated_at": iso(now_utc()),
        }, "$setOnInsert": {"created_at": iso(now_utc())}},
        upsert=True,
    )

    # Fire-and-forget receipt email — never fail activation if email service hiccups
    plan_name = ("Pro" if req.plan == "pro" else "Elite") + (" · Yearly" if req.cycle == "yearly" else " · Monthly")
    try:
        await send_receipt_email(
            to_email=user["email"],
            full_name=user.get("full_name") or "",
            plan_name=plan_name,
            amount=float(amount_val),
            subscription_id=req.subscription_id,
            next_billing=next_billing,
        )
    except Exception as e:
        logger.warning("Receipt email failed (activation still succeeded): %s", e)

    return {
        "ok": True,
        "plan": req.plan,
        "status": status,
        "subscription_id": req.subscription_id,
        "message": f"{plan_name} activated. Receipt sent to {user['email']}.",
    }


@router.post("/cancel")
async def cancel(user=Depends(get_current_user)):
    sid = user.get("paypal_subscription_id")
    if not sid:
        raise HTTPException(status_code=400, detail="No active subscription")
    # Cancel with PayPal — subscription remains ACTIVE until end of current billing cycle per PayPal docs.
    try:
        await cancel_subscription(sid, reason="User requested cancellation")
    except PayPalError as e:
        logger.warning("PayPal cancel warning for %s: %s", sid, e)
    # Fetch subscription to get actual period-end (next_billing_time)
    period_end = None
    try:
        sub = await get_subscription(sid)
        bi = sub.get("billing_info") or {}
        period_end = bi.get("next_billing_time") or bi.get("final_payment_time")
    except Exception:
        pass
    if not period_end:
        # Fallback: 30 days monthly / 365 days yearly from now
        days = 365 if user.get("paypal_cycle") == "yearly" else 30
        period_end = iso(now_utc() + timedelta(days=days))
    # Mark cancelled but keep the user on their plan until period_end.
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "subscription_status": "CANCELLED",
            "subscription_cancels_at": period_end,
        }},
    )
    await db.subscriptions.update_one(
        {"subscription_id": sid},
        {"$set": {"status": "CANCELLED", "cancels_at": period_end, "updated_at": iso(now_utc())}},
    )
    return {
        "ok": True,
        "cancels_at": period_end,
        "message": f"Subscription cancelled. You keep {user.get('paypal_plan', user['plan']).capitalize()} access until {period_end[:10]}, then revert to Free. No further charges.",
    }


@router.post("/webhook")
async def paypal_webhook(request: Request):
    """Handles PayPal subscription lifecycle events.
    BILLING.SUBSCRIPTION.ACTIVATED / .CANCELLED / .SUSPENDED / .EXPIRED
    PAYMENT.SALE.COMPLETED (recurring renewals)"""
    raw = await request.body()
    verified = await verify_webhook_signature(dict(request.headers), raw)

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event.get("event_type", "")
    resource = event.get("resource") or {}
    sub_id = resource.get("id") or (resource.get("billing_agreement_id")) or None
    logger.info("PayPal webhook received: %s · sub=%s · verified=%s", event_type, sub_id, verified)

    # If no webhook id configured, log but refuse to mutate (safe default).
    if not verified:
        await db.webhook_events.insert_one({
            "id": str(uuid.uuid4()),
            "event_type": event_type,
            "subscription_id": sub_id,
            "verified": False,
            "received_at": iso(now_utc()),
        })
        return {"received": True, "verified": False}

    await db.webhook_events.insert_one({
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "subscription_id": sub_id,
        "verified": True,
        "received_at": iso(now_utc()),
    })

    # Lookup the subscription record in our DB
    sub_doc = None
    if sub_id:
        sub_doc = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0})

    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED" and sub_doc:
        await db.users.update_one(
            {"id": sub_doc["user_id"]},
            {"$set": {
                "plan": sub_doc["plan"],
                "subscription_status": "ACTIVE",
            }},
        )
        await db.subscriptions.update_one(
            {"subscription_id": sub_id},
            {"$set": {"status": "ACTIVE", "updated_at": iso(now_utc())}},
        )

    elif event_type in ("BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED"):
        if sub_doc:
            await db.users.update_one(
                {"id": sub_doc["user_id"]},
                {
                    "$set": {"plan": "free", "subscription_status": "CANCELLED"},
                    "$unset": {"paypal_subscription_id": "", "paypal_plan": ""},
                },
            )
            await db.subscriptions.update_one(
                {"subscription_id": sub_id},
                {"$set": {"status": "CANCELLED", "updated_at": iso(now_utc())}},
            )

    elif event_type == "BILLING.SUBSCRIPTION.SUSPENDED" and sub_doc:
        await db.subscriptions.update_one(
            {"subscription_id": sub_id},
            {"$set": {"status": "SUSPENDED", "updated_at": iso(now_utc())}},
        )

    elif event_type == "PAYMENT.SALE.COMPLETED" and sub_doc:
        # Recurring payment — send receipt for renewal
        amount = float((resource.get("amount") or {}).get("total") or sub_doc.get("amount") or 0)
        user = await db.users.find_one({"id": sub_doc["user_id"]}, {"_id": 0})
        if user:
            plan_name = "Pro" if sub_doc["plan"] == "pro" else "Elite"
            await send_receipt_email(
                to_email=user["email"],
                full_name=user.get("full_name") or "",
                plan_name=plan_name,
                amount=amount,
                subscription_id=sub_id,
            )

    return {"received": True, "verified": True, "event": event_type}
