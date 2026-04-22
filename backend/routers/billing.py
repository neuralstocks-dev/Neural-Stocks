"""Billing routes: PayPal subscription lifecycle + webhook."""
import logging
import uuid
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.config import PAYPAL_CLIENT_ID, PAYPAL_ENV, ADMIN_EMAILS
from core.db import db
from core.security import get_current_user, iso, now_utc
from services.pricing import get_pricing
from services.paypal import (
    get_plan_ids,
    get_subscription,
    cancel_subscription,
    verify_webhook_signature,
    _ensure_product,
    _create_plan,
    create_order,
    capture_order,
    PayPalError,
)
from services.email import send_receipt_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])

SMOKE_TEST_SETTINGS_ID = "paypal_smoke_test_plan"


def _require_admin(user: dict):
    if (user.get("email") or "").lower() not in ADMIN_EMAILS and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")


class SmokeActivateReq(BaseModel):
    subscription_id: str


class DaypassCaptureReq(BaseModel):
    order_id: str


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


# =============================================================================
# Day Pass — one-time payment (PayPal Orders v2 CAPTURE intent)
# =============================================================================

@router.post("/daypass/order")
async def daypass_create_order(user=Depends(get_current_user)):
    """Creates a PayPal Order for the current Day Pass price. Returns the
    order_id so the frontend PayPalButtons widget can approve it."""
    prices = await get_pricing()
    price = float(prices["daypass_price"])
    days = int(prices["daypass_duration_days"])
    try:
        order = await create_order(
            amount=price,
            description=f"Neulab Day Pass — {days}-day access",
            custom_id=f"neulab:daypass:{user['id']}",
        )
    except PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal create order failed: {e}")
    return {"order_id": order["id"], "price": price, "duration_days": days}


@router.post("/daypass/capture")
async def daypass_capture_order(req: DaypassCaptureReq, user=Depends(get_current_user)):
    """Captures an approved Day Pass order and grants the access window on the
    user record. Idempotent: re-capturing an already-captured order is a no-op
    beyond returning the existing expiry."""
    prices = await get_pricing()
    days = int(prices["daypass_duration_days"])

    try:
        capture = await capture_order(req.order_id)
    except PayPalError as e:
        if "ORDER_ALREADY_CAPTURED" in str(e):
            logger.info("Day Pass order %s already captured — reading state", req.order_id)
            capture = None
        else:
            raise HTTPException(status_code=502, detail=f"PayPal capture failed: {e}")

    # Extract amount + capture_id (if we actually captured just now)
    capture_id = None
    amount_captured = None
    if capture:
        try:
            cap0 = capture["purchase_units"][0]["payments"]["captures"][0]
            capture_id = cap0.get("id")
            amount_captured = float(cap0.get("amount", {}).get("value", 0))
        except Exception:
            pass

    now = now_utc()
    expires_at = now + timedelta(days=days)
    update = {
        "plan": "daypass",
        "daypass_expires_at": iso(expires_at),
        "daypass_granted_at": iso(now),
        "daypass_order_id": req.order_id,
    }
    if capture_id:
        update["daypass_capture_id"] = capture_id

    await db.users.update_one({"id": user["id"]}, {"$set": update})

    await db.daypass_orders.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user.get("email"),
        "order_id": req.order_id,
        "capture_id": capture_id,
        "amount": amount_captured,
        "duration_days": days,
        "granted_at": iso(now),
        "expires_at": iso(expires_at),
    })

    try:
        await send_receipt_email(
            to_email=user.get("email") or "",
            full_name=user.get("full_name") or "",
            plan_name=f"Day Pass · {days}-day access",
            amount=amount_captured or float(prices["daypass_price"]),
            subscription_id=req.order_id,
            next_billing=None,
        )
    except Exception as e:
        logger.warning("Day Pass receipt email failed: %s", e)

    logger.info(
        "Day Pass granted: user=%s order=%s expires=%s",
        user.get("email"), req.order_id, iso(expires_at),
    )
    return {
        "ok": True,
        "plan": "daypass",
        "expires_at": iso(expires_at),
        "duration_days": days,
        "message": f"Day Pass activated · {days}-day access until {expires_at.strftime('%b %d, %Y')}",
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



# =============================================================================
# Smoke test — admin-only PayPal end-to-end diagnostic ($1/mo plan)
# =============================================================================
# Purpose: prove the full PayPal Live round-trip (button → approve → server-side
# subscription lookup → receipt) with a real card + real cheap price. Does NOT
# touch the caller's plan — the user stays on their original tier. Intended for
# admin diagnostics only. The $1 subscription should be cancelled from the
# buyer's PayPal account after the test to avoid recurring billing.

@router.get("/smoke-test/plan")
async def smoke_test_plan(user=Depends(get_current_user)):
    """Returns ($1/mo PayPal Live) plan_id + client_id. Creates the plan once
    and caches in db.settings. Admin-only."""
    _require_admin(user)
    doc = await db.settings.find_one({"id": SMOKE_TEST_SETTINGS_ID}, {"_id": 0}) or {}
    env_key = f"plan_id_{PAYPAL_ENV}"
    if doc.get(env_key):
        return {
            "client_id": PAYPAL_CLIENT_ID,
            "env": PAYPAL_ENV,
            "plan_id": doc[env_key],
            "price": 1.0,
            "cached": True,
        }
    # Create the $1/mo plan under the shared Neural product
    try:
        product_id = await _ensure_product()
        plan_id = await _create_plan(
            product_id,
            "Neural Smoke Test $1/mo",
            1.0,
            interval_unit="MONTH",
            interval_count=1,
        )
    except PayPalError as e:
        raise HTTPException(status_code=502, detail=f"PayPal plan create failed: {e}")
    await db.settings.update_one(
        {"id": SMOKE_TEST_SETTINGS_ID},
        {"$set": {"id": SMOKE_TEST_SETTINGS_ID, env_key: plan_id, "created_at": iso(now_utc())}},
        upsert=True,
    )
    logger.info("Smoke-test plan created: %s (env=%s)", plan_id, PAYPAL_ENV)
    return {
        "client_id": PAYPAL_CLIENT_ID,
        "env": PAYPAL_ENV,
        "plan_id": plan_id,
        "price": 1.0,
        "cached": False,
    }


@router.post("/smoke-test/activate")
async def smoke_test_activate(req: SmokeActivateReq, user=Depends(get_current_user)):
    """Looks up the subscription with our PayPal Live creds and returns the
    full PayPal response. Intentionally does NOT mutate user.plan — this is a
    diagnostic, not an upgrade. Admin-only."""
    _require_admin(user)
    try:
        sub = await get_subscription(req.subscription_id)
    except PayPalError as e:
        logger.warning("Smoke-test lookup FAILED for %s: %s", req.subscription_id, e)
        raise HTTPException(status_code=502, detail=f"PayPal lookup failed: {e}")

    # Record the diagnostic so we can inspect later
    diagnostic = {
        "id": str(uuid.uuid4()),
        "subscription_id": req.subscription_id,
        "admin_user_id": user["id"],
        "admin_email": user.get("email"),
        "paypal_status": (sub.get("status") or "").upper(),
        "plan_id": sub.get("plan_id"),
        "start_time": sub.get("start_time"),
        "raw": sub,
        "created_at": iso(now_utc()),
    }
    await db.smoke_test_results.insert_one(diagnostic)
    diagnostic.pop("_id", None)
    logger.info(
        "Smoke-test activation OK: sub=%s status=%s plan=%s",
        req.subscription_id, diagnostic["paypal_status"], diagnostic["plan_id"],
    )
    return {
        "ok": True,
        "subscription_id": req.subscription_id,
        "paypal_status": diagnostic["paypal_status"],
        "plan_id": diagnostic["plan_id"],
        "start_time": diagnostic["start_time"],
        "raw": sub,  # full PayPal response surfaced to the UI for inspection
        "note": "This was a diagnostic only. Your Neulab plan was NOT changed. "
                "Cancel the $1 recurring subscription in your PayPal account "
                "(Activity → Manage Subscriptions → Cancel) to avoid next month's charge.",
    }


@router.get("/smoke-test/history")
async def smoke_test_history(user=Depends(get_current_user)):
    """Recent smoke-test diagnostics for this admin."""
    _require_admin(user)
    items = (
        await db.smoke_test_results.find({}, {"_id": 0, "raw": 0})
        .sort("created_at", -1)
        .to_list(20)
    )
    return {"count": len(items), "results": items}


@router.post("/smoke-test/cancel/{subscription_id}")
async def smoke_test_cancel(subscription_id: str, user=Depends(get_current_user)):
    """Cancel a smoke-test subscription via PayPal. Admin-only. Does NOT touch
    user plans — smoke tests never upgraded anyone to begin with."""
    _require_admin(user)
    try:
        await cancel_subscription(subscription_id, reason="Neulab smoke-test cancel")
    except PayPalError as e:
        # Confirm current status from PayPal so we can report an accurate outcome
        try:
            sub = await get_subscription(subscription_id)
            current = (sub.get("status") or "").upper()
        except PayPalError:
            current = "UNKNOWN"
        logger.warning("Smoke-test cancel failed for %s: %s (current=%s)", subscription_id, e, current)
        if current == "CANCELLED":
            await db.smoke_test_results.update_many(
                {"subscription_id": subscription_id},
                {"$set": {"paypal_status": "CANCELLED", "cancelled_at": iso(now_utc())}},
            )
            return {"ok": True, "already_cancelled": True, "status": current}
        raise HTTPException(status_code=502, detail=f"PayPal cancel failed: {e}")
    await db.smoke_test_results.update_many(
        {"subscription_id": subscription_id},
        {"$set": {"paypal_status": "CANCELLED", "cancelled_at": iso(now_utc())}},
    )
    logger.info("Smoke-test subscription cancelled: %s by %s", subscription_id, user.get("email"))
    return {"ok": True, "status": "CANCELLED", "subscription_id": subscription_id}
