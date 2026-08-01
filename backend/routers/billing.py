"""Billing routes: PayPal subscription lifecycle + webhook, Stripe Checkout + webhook."""
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.config import PAYPAL_CLIENT_ID, PAYPAL_ENV, ADMIN_EMAILS, STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_MODE
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
from services.stripe_service import (
    create_subscription_checkout_session,
    create_daypass_checkout_session,
    retrieve_session,
    retrieve_subscription,
    cancel_subscription_at_period_end,
    construct_webhook_event,
    StripeError,
)
from services.email import send_receipt_email

_PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")

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


class StripeCheckoutReq(BaseModel):
    plan: Literal["pro", "elite"]
    cycle: Literal["monthly", "yearly"] = "monthly"


class StripeConfirmReq(BaseModel):
    session_id: str


def _resolve_frontend_origin(request: Request) -> str:
    """Best-effort frontend origin for Stripe success/cancel redirects.
    PUBLIC_APP_URL (already used by email/telegram links) is authoritative;
    Origin/Referer headers are only a fallback for envs where it's unset."""
    if _PUBLIC_APP_URL:
        return _PUBLIC_APP_URL
    origin = (request.headers.get("origin") or request.headers.get("referer") or "").rstrip("/")
    if origin.endswith("/pricing"):
        origin = origin[: -len("/pricing")]
    return origin or str(request.base_url).rstrip("/")


@router.get("/config")
async def billing_config(user=Depends(get_current_user)):
    """Returns client-side PayPal config — public key + live plan ids.
    plan_ids lookup is best-effort: if PayPal is slow/down, we still return
    client_id so the daypass (Orders v2) can render. Subscription buttons
    will be absent but the one-time pass remains purchasable."""
    prices = await get_pricing()
    plan_ids = {}
    try:
        plan_ids = await get_plan_ids(prices)
    except PayPalError as e:
        logger.warning("Plan ID lookup failed (non-fatal for daypass): %s", e)
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
            description=f"Neural Stock Intelligence™ Day Pass — {days}-day access",
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


# =============================================================================
# Stripe — Checkout Sessions (subscriptions + Day Pass) + webhook.
# Runs alongside PayPal, not instead of it: users pick either provider on the
# pricing page. Card data never touches our server (hosted Checkout redirect).
# =============================================================================

@router.get("/stripe/config")
async def stripe_billing_config(user=Depends(get_current_user)):
    return {
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "mode": STRIPE_MODE,
        "configured": bool(STRIPE_SECRET_KEY),
    }


# Shared with the customer.subscription.updated webhook handler below —
# one mapping from Stripe's subscription status vocabulary to ours.
_STRIPE_STATUS_MAP = {
    "ACTIVE": "ACTIVE", "TRIALING": "ACTIVE",
    "PAST_DUE": "PAYMENT_FAILED", "UNPAID": "PAYMENT_FAILED",
    "CANCELED": "CANCELLED", "INCOMPLETE_EXPIRED": "CANCELLED",
}


async def _activate_subscription_from_session(session: dict) -> dict | None:
    meta = session.get("metadata") or {}
    user_id = meta.get("user_id") or session.get("client_reference_id")
    plan = meta.get("plan")
    cycle = meta.get("cycle", "monthly")
    subscription_id = session.get("subscription")
    if isinstance(subscription_id, dict):
        subscription_id = subscription_id.get("id")
    if not (user_id and plan and subscription_id):
        logger.warning("Stripe checkout.session.completed missing fields: session=%s", session.get("id"))
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        logger.warning("Stripe checkout session for unknown user_id=%s", user_id)
        return None

    # A Checkout Session's payment_status is frozen at completion time and
    # stays "paid" forever — even after the subscription it created is later
    # cancelled or lapses. Re-confirming an old success URL (stale tab, bookmark,
    # browser back button) must not resurrect a plan that isn't actually active
    # anymore, so we trust the subscription's *live* status, not the session
    # snapshot, before granting anything.
    try:
        live_sub = await retrieve_subscription(subscription_id)
    except StripeError as e:
        logger.warning("Stripe activation: could not verify live subscription %s: %s", subscription_id, e)
        return {"stale": True, "reason": "lookup_failed"}

    live_status = (live_sub.get("status") or "").upper()
    if live_status not in ("ACTIVE", "TRIALING"):
        mapped = _STRIPE_STATUS_MAP.get(live_status, live_status or "CANCELLED")
        logger.info(
            "Stripe activation skipped — subscription %s is no longer active (status=%s): user=%s",
            subscription_id, live_status, user_id,
        )
        user_update = {"subscription_status": mapped}
        unset = {}
        if mapped == "CANCELLED" and user.get("stripe_subscription_id") == subscription_id:
            user_update["plan"] = "free"
            unset = {"stripe_subscription_id": "", "stripe_cycle": ""}
        update_doc = {"$set": user_update}
        if unset:
            update_doc["$unset"] = unset
        await db.users.update_one({"id": user_id}, update_doc)
        await db.subscriptions.update_one(
            {"subscription_id": subscription_id},
            {"$set": {"status": mapped, "updated_at": iso(now_utc())}},
        )
        return {"stale": True, "reason": "subscription_not_active", "status": live_status}

    amount_total = (session.get("amount_total") or 0) / 100.0
    customer_id = session.get("customer")
    if isinstance(customer_id, dict):
        customer_id = customer_id.get("id")

    await db.users.update_one(
        {"id": user_id},
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
    await db.subscriptions.update_one(
        {"subscription_id": subscription_id},
        {"$set": {
            "id": str(uuid.uuid4()),
            "subscription_id": subscription_id,
            "provider": "stripe",
            "user_id": user_id,
            "email": user.get("email"),
            "plan": plan,
            "cycle": cycle,
            "status": "ACTIVE",
            "amount": amount_total,
            "updated_at": iso(now_utc()),
        }, "$setOnInsert": {"created_at": iso(now_utc())}},
        upsert=True,
    )
    plan_name = ("Pro" if plan == "pro" else "Elite") + (" · Yearly" if cycle == "yearly" else " · Monthly")
    try:
        await send_receipt_email(
            to_email=user.get("email") or "",
            full_name=user.get("full_name") or "",
            plan_name=plan_name,
            amount=amount_total,
            subscription_id=subscription_id,
        )
    except Exception as e:
        logger.warning("Stripe receipt email failed (activation still succeeded): %s", e)
    return {"plan": plan, "cycle": cycle, "plan_name": plan_name, "amount": amount_total}


async def _activate_daypass_from_session(session: dict) -> dict | None:
    meta = session.get("metadata") or {}
    user_id = meta.get("user_id") or session.get("client_reference_id")
    days = int(meta.get("days") or 7)
    if not user_id:
        logger.warning("Stripe daypass session missing user_id: session=%s", session.get("id"))
        return None
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return None

    session_id = session.get("id")
    existing = await db.daypass_orders.find_one({"order_id": session_id}, {"_id": 0})
    if existing:
        return {"plan": "daypass", "plan_name": "Day Pass", "expires_at": existing.get("expires_at")}

    amount_total = (session.get("amount_total") or 0) / 100.0
    payment_intent = session.get("payment_intent")
    if isinstance(payment_intent, dict):
        payment_intent = payment_intent.get("id")

    now = now_utc()
    expires_at = now + timedelta(days=days)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "plan": "daypass",
            "daypass_expires_at": iso(expires_at),
            "daypass_granted_at": iso(now),
            "daypass_order_id": session_id,
            "payment_provider": "stripe",
        }},
    )
    await db.daypass_orders.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_email": user.get("email"),
        "order_id": session_id,
        "provider": "stripe",
        "capture_id": payment_intent,
        "amount": amount_total,
        "duration_days": days,
        "granted_at": iso(now),
        "expires_at": iso(expires_at),
    })
    try:
        await send_receipt_email(
            to_email=user.get("email") or "",
            full_name=user.get("full_name") or "",
            plan_name=f"Day Pass · {days}-day access",
            amount=amount_total,
            subscription_id=session_id,
        )
    except Exception as e:
        logger.warning("Stripe Day Pass receipt email failed: %s", e)
    return {"plan": "daypass", "plan_name": f"Day Pass · {days}-day access", "expires_at": iso(expires_at)}


async def _handle_stripe_checkout_completed(session: dict) -> dict | None:
    meta = session.get("metadata") or {}
    if meta.get("kind") == "daypass" or session.get("mode") == "payment":
        return await _activate_daypass_from_session(session)
    return await _activate_subscription_from_session(session)


@router.post("/stripe/checkout")
async def stripe_create_checkout(req: StripeCheckoutReq, request: Request, user=Depends(get_current_user)):
    """Creates a Stripe Checkout Session (mode=subscription) for Pro/Elite and
    returns its hosted URL. Frontend redirects the browser there directly —
    no card data ever reaches our server."""
    prices = await get_pricing()
    if req.cycle == "monthly":
        price_usd = float(prices[f"{req.plan}_monthly_original"])
        promo_key = f"promo_{req.plan}_discount_pct"
        promo_pct = float(prices.get(promo_key) or 0) if prices.get("promo_active") else 0.0
    else:
        price_usd = float(prices[f"{req.plan}_yearly"])
        promo_pct = 0.0

    base = _resolve_frontend_origin(request)
    success_url = f"{base}/pricing?stripe_session_id={{CHECKOUT_SESSION_ID}}&stripe=success"
    cancel_url = f"{base}/pricing?stripe=cancelled"
    try:
        session = await create_subscription_checkout_session(
            user_id=user["id"],
            user_email=user["email"],
            plan=req.plan,
            cycle=req.cycle,
            price_usd=price_usd,
            promo_pct=promo_pct,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {e}")
    return {"checkout_url": session["url"], "session_id": session["id"]}


@router.post("/stripe/daypass/checkout")
async def stripe_daypass_checkout(request: Request, user=Depends(get_current_user)):
    prices = await get_pricing()
    price = float(prices["daypass_price"])
    days = int(prices["daypass_duration_days"])
    base = _resolve_frontend_origin(request)
    success_url = f"{base}/pricing?stripe_session_id={{CHECKOUT_SESSION_ID}}&stripe=success"
    cancel_url = f"{base}/pricing?stripe=cancelled"
    try:
        session = await create_daypass_checkout_session(
            user_id=user["id"],
            user_email=user["email"],
            price_usd=price,
            days=days,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {e}")
    return {"checkout_url": session["url"], "session_id": session["id"]}


@router.post("/stripe/confirm")
async def stripe_confirm(req: StripeConfirmReq, user=Depends(get_current_user)):
    """Called from the frontend right after the browser bounces back from
    Stripe Checkout. Fetches the session server-side (never trusts the client
    beyond the session_id) and activates immediately for fast UX; the webhook
    remains the authoritative, retry-safe path if this call is missed."""
    try:
        session = await retrieve_session(req.session_id)
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe lookup failed: {e}")

    meta = session.get("metadata") or {}
    owner = session.get("client_reference_id") or meta.get("user_id")
    if owner != user["id"]:
        raise HTTPException(status_code=403, detail="This checkout session does not belong to your account")
    if session.get("payment_status") not in ("paid", "no_payment_required"):
        return {"ok": False, "status": session.get("payment_status"), "message": "Payment not completed yet."}

    result = await _handle_stripe_checkout_completed(session)
    if not result:
        raise HTTPException(status_code=500, detail="Could not activate plan — contact support")
    if result.get("stale"):
        # Session was legitimately paid at some point, but the subscription it
        # created is no longer live (cancelled/expired since) — don't report
        # success for a plan that isn't actually active.
        return {
            "ok": False,
            "status": "stale",
            "message": "This checkout link has already been used and the subscription is no longer active. "
                       "Refresh the pricing page to see your current plan, or subscribe again if you'd like to resume.",
        }
    return {
        "ok": True,
        **result,
        "message": f"{result.get('plan_name', result.get('plan'))} activated. Receipt sent to {user['email']}.",
    }


@router.post("/stripe/cancel")
async def stripe_cancel(user=Depends(get_current_user)):
    sid = user.get("stripe_subscription_id")
    if not sid:
        raise HTTPException(status_code=400, detail="No active Stripe subscription")
    try:
        sub = await cancel_subscription_at_period_end(sid)
    except StripeError as e:
        raise HTTPException(status_code=502, detail=f"Stripe cancel failed: {e}")

    period_end_ts = sub.get("current_period_end")
    if period_end_ts:
        period_end = iso(datetime.fromtimestamp(period_end_ts, tz=timezone.utc))
    else:
        days = 365 if user.get("stripe_cycle") == "yearly" else 30
        period_end = iso(now_utc() + timedelta(days=days))

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"subscription_status": "CANCELLED", "subscription_cancels_at": period_end}},
    )
    await db.subscriptions.update_one(
        {"subscription_id": sid},
        {"$set": {"status": "CANCELLED", "cancels_at": period_end, "updated_at": iso(now_utc())}},
    )
    return {
        "ok": True,
        "cancels_at": period_end,
        "message": f"Subscription cancelled. You keep {user.get('plan', 'pro').capitalize()} access until {period_end[:10]}, then revert to Free. No further charges.",
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """Handles Stripe lifecycle events. checkout.session.completed is the
    primary activation trigger (subscriptions + Day Pass); the rest keep
    subscription_status in sync for renewals/failures/cancellations."""
    raw = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = construct_webhook_event(raw, sig_header)
    except StripeError as e:
        logger.warning("Stripe webhook signature check failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))

    event_type = event.get("type", "")
    data_obj = (event.get("data") or {}).get("object") or {}
    logger.info("Stripe webhook received: %s · id=%s", event_type, data_obj.get("id"))

    await db.webhook_events.insert_one({
        "id": str(uuid.uuid4()),
        "provider": "stripe",
        "event_type": event_type,
        "object_id": data_obj.get("id"),
        "verified": True,
        "received_at": iso(now_utc()),
    })

    if event_type == "checkout.session.completed":
        # The event payload's session isn't expanded (subscription/payment_intent
        # come back as bare IDs) — re-fetch so activation gets full detail.
        try:
            session = await retrieve_session(data_obj.get("id"))
        except StripeError as e:
            logger.warning("Stripe webhook: re-fetch session failed for %s: %s", data_obj.get("id"), e)
            return {"received": True, "event": event_type}
        await _handle_stripe_checkout_completed(session)

    elif event_type == "customer.subscription.deleted":
        sub_id = data_obj.get("id")
        sub_doc = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0})
        if sub_doc:
            await db.users.update_one(
                {"id": sub_doc["user_id"]},
                {
                    "$set": {"plan": "free", "subscription_status": "CANCELLED"},
                    "$unset": {"stripe_subscription_id": "", "stripe_cycle": ""},
                },
            )
            await db.subscriptions.update_one(
                {"subscription_id": sub_id},
                {"$set": {"status": "CANCELLED", "updated_at": iso(now_utc())}},
            )

    elif event_type == "customer.subscription.updated":
        sub_id = data_obj.get("id")
        status = (data_obj.get("status") or "").upper()
        sub_doc = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0})
        if sub_doc and status:
            mapped = _STRIPE_STATUS_MAP.get(status, status)
            await db.users.update_one({"id": sub_doc["user_id"]}, {"$set": {"subscription_status": mapped}})
            await db.subscriptions.update_one(
                {"subscription_id": sub_id}, {"$set": {"status": mapped, "updated_at": iso(now_utc())}}
            )

    elif event_type == "invoice.paid":
        sub_id = data_obj.get("subscription")
        # First invoice's receipt is already sent by checkout.session.completed.
        if sub_id and data_obj.get("billing_reason") != "subscription_create":
            sub_doc = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0})
            if sub_doc:
                sub_user = await db.users.find_one({"id": sub_doc["user_id"]}, {"_id": 0})
                if sub_user:
                    amount = (data_obj.get("amount_paid") or 0) / 100.0
                    plan_name = "Pro" if sub_doc["plan"] == "pro" else "Elite"
                    try:
                        await send_receipt_email(
                            to_email=sub_user["email"],
                            full_name=sub_user.get("full_name") or "",
                            plan_name=plan_name,
                            amount=amount,
                            subscription_id=sub_id,
                        )
                    except Exception as e:
                        logger.warning("Stripe renewal receipt email failed: %s", e)

    elif event_type == "invoice.payment_failed":
        sub_id = data_obj.get("subscription")
        sub_doc = await db.subscriptions.find_one({"subscription_id": sub_id}, {"_id": 0}) if sub_id else None
        if sub_doc:
            await db.users.update_one(
                {"id": sub_doc["user_id"]},
                {"$set": {"subscription_status": "PAYMENT_FAILED", "last_payment_failed_at": iso(now_utc())}},
            )
            await db.subscriptions.update_one(
                {"subscription_id": sub_id},
                {"$set": {"status": "PAYMENT_FAILED", "last_payment_failed_at": iso(now_utc()), "updated_at": iso(now_utc())}},
            )

    return {"received": True, "event": event_type}


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
        # Payment failed -> subscription suspended. Restrict access immediately.
        # effective_plan_key() returns "free" for SUSPENDED users. Plan is NOT
        # wiped yet — if user resolves payment, ACTIVATED fires and restores it.
        await db.users.update_one(
            {"id": sub_doc["user_id"]},
            {"$set": {"subscription_status": "SUSPENDED"}},
        )
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

    elif event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED" and sub_doc:
        logger.warning("PayPal payment failed for subscription %s", sub_id)
        await db.users.update_one(
            {"id": sub_doc["user_id"]},
            {"$set": {"subscription_status": "PAYMENT_FAILED", "last_payment_failed_at": iso(now_utc())}},
        )
        await db.subscriptions.update_one(
            {"subscription_id": sub_id},
            {"$set": {"status": "PAYMENT_FAILED", "last_payment_failed_at": iso(now_utc()), "updated_at": iso(now_utc())}},
        )

    elif event_type in ("PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.APPROVED"):
        logger.info("PayPal order event %s: %s", event_type, resource.get("id"))

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
        "note": "This was a diagnostic only. Your Neural Stock Intelligence™ plan was NOT changed. "
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
