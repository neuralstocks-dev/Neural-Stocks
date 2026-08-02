"""Stripe wrapper — Checkout Sessions (subscriptions + Day Pass one-time) + webhook verify.

Uses the official `stripe` SDK. Its calls are synchronous (blocking) HTTP under
the hood, so every call is offloaded via asyncio.to_thread to keep the event
loop unblocked — the same pattern already used for the Resend SDK in
services/email.py.

Mirrors services/paypal.py's shape (create checkout / retrieve / cancel /
verify webhook) so billing.py can treat both providers symmetrically.
"""
import asyncio
import logging
import stripe as _stripe

from core.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
from core.db import db

logger = logging.getLogger(__name__)

_stripe.api_key = STRIPE_SECRET_KEY

COUPON_SETTINGS_ID = "stripe_promo_coupons"

# Shared between routers/billing.py's customer.subscription.updated webhook
# handler and routers/kids_billing.py's — one mapping from Stripe's
# subscription status vocabulary to ours (ACTIVE/PAYMENT_FAILED/CANCELLED),
# used identically by both the adult and kids billing flows.
STRIPE_STATUS_MAP = {
    "ACTIVE": "ACTIVE", "TRIALING": "ACTIVE",
    "PAST_DUE": "PAYMENT_FAILED", "UNPAID": "PAYMENT_FAILED",
    "CANCELED": "CANCELLED", "INCOMPLETE_EXPIRED": "CANCELLED",
}


class StripeError(Exception):
    pass


def _check_configured():
    if not STRIPE_SECRET_KEY:
        raise StripeError("Stripe not configured (STRIPE_SECRET_KEY unset)")


async def _get_or_create_promo_coupon(pct: float) -> str:
    """Percent-off coupon applied to the first invoice only (duration=once) —
    mirrors PayPal's TRIAL-then-REGULAR billing cycle for first-month promos.
    Cached per-percentage in db.settings so repeated checkouts reuse the same
    coupon instead of minting a new one on every click."""
    pct_key = str(round(pct, 2))
    doc = await db.settings.find_one({"id": COUPON_SETTINGS_ID}, {"_id": 0}) or {}
    coupons = doc.get("coupons") or {}
    if pct_key in coupons:
        return coupons[pct_key]

    def _create():
        return _stripe.Coupon.create(
            percent_off=pct, duration="once", name=f"Neural first-month {pct:g}% off"
        )

    try:
        coupon = await asyncio.to_thread(_create)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Create coupon failed: {e}")

    coupons[pct_key] = coupon["id"]
    await db.settings.update_one(
        {"id": COUPON_SETTINGS_ID},
        {"$set": {"id": COUPON_SETTINGS_ID, "coupons": coupons}},
        upsert=True,
    )
    return coupon["id"]


# =============================================================================
# Checkout Sessions
# =============================================================================

async def create_subscription_checkout_session(
    *, user_id: str, user_email: str, plan: str, cycle: str,
    price_usd: float, promo_pct: float, success_url: str, cancel_url: str,
) -> dict:
    """Dynamic (inline) pricing — no pre-created Stripe Price catalog to keep
    in sync with admin-editable pricing (see services/pricing.py)."""
    _check_configured()
    interval = "year" if cycle == "yearly" else "month"
    line_item = {
        "price_data": {
            "currency": "usd",
            "unit_amount": round(price_usd * 100),
            "recurring": {"interval": interval},
            "product_data": {"name": f"Neural {plan.capitalize()} · {cycle.capitalize()}"},
        },
        "quantity": 1,
    }
    extra = {}
    if promo_pct and promo_pct > 0:
        coupon_id = await _get_or_create_promo_coupon(promo_pct)
        extra["discounts"] = [{"coupon": coupon_id}]
    else:
        extra["allow_promotion_codes"] = True

    def _create():
        return _stripe.checkout.Session.create(
            mode="subscription",
            line_items=[line_item],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user_id,
            customer_email=user_email,
            metadata={"user_id": user_id, "plan": plan, "cycle": cycle, "kind": "subscription"},
            subscription_data={"metadata": {"user_id": user_id, "plan": plan, "cycle": cycle}},
            **extra,
        )

    try:
        session = await asyncio.to_thread(_create)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Create checkout session failed: {e}")
    return session.to_dict()


async def create_daypass_checkout_session(
    *, user_id: str, user_email: str, price_usd: float, days: int,
    success_url: str, cancel_url: str,
) -> dict:
    _check_configured()
    line_item = {
        "price_data": {
            "currency": "usd",
            "unit_amount": round(price_usd * 100),
            "product_data": {"name": f"Neural Stock Intelligence™ Day Pass — {days}-day access"},
        },
        "quantity": 1,
    }

    def _create():
        return _stripe.checkout.Session.create(
            mode="payment",
            line_items=[line_item],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=user_id,
            customer_email=user_email,
            metadata={"user_id": user_id, "kind": "daypass", "days": str(days)},
        )

    try:
        session = await asyncio.to_thread(_create)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Create checkout session failed: {e}")
    return session.to_dict()


async def retrieve_session(session_id: str) -> dict:
    _check_configured()

    def _get():
        return _stripe.checkout.Session.retrieve(session_id, expand=["subscription", "payment_intent"])

    try:
        session = await asyncio.to_thread(_get)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Retrieve session failed: {e}")
    return session.to_dict()


async def retrieve_subscription(subscription_id: str) -> dict:
    _check_configured()

    def _get():
        return _stripe.Subscription.retrieve(subscription_id)

    try:
        sub = await asyncio.to_thread(_get)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Retrieve subscription failed: {e}")
    return sub.to_dict()


async def cancel_subscription_at_period_end(subscription_id: str) -> dict:
    """Mirrors PayPal cancel semantics: subscription stays active until the
    end of the current billing period, then stops (no further charges)."""
    _check_configured()

    def _cancel():
        return _stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)

    try:
        sub = await asyncio.to_thread(_cancel)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Cancel subscription failed: {e}")
    return sub.to_dict()


async def cancel_subscription_immediately(subscription_id: str) -> dict:
    """Hard-cancels right away — used for admin account deletion, where there's
    no "keep access until period end" to honour."""
    _check_configured()

    def _cancel():
        return _stripe.Subscription.cancel(subscription_id)

    try:
        sub = await asyncio.to_thread(_cancel)
    except _stripe.error.StripeError as e:
        raise StripeError(f"Cancel subscription failed: {e}")
    return sub.to_dict()


def construct_webhook_event(payload: bytes, sig_header: str) -> dict:
    """Verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET and
    returns the parsed event as a plain dict. Raises StripeError on any
    failure — callers should refuse to mutate state when this raises (same
    soft-fail-safe posture as paypal.verify_webhook_signature)."""
    if not STRIPE_WEBHOOK_SECRET:
        raise StripeError("STRIPE_WEBHOOK_SECRET not configured")
    try:
        event = _stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (_stripe.error.SignatureVerificationError, ValueError) as e:
        raise StripeError(f"Webhook signature verification failed: {e}")
    return event.to_dict()
