"""PayPal REST API wrapper — Subscriptions (v1/billing) + Orders + webhook verify.

Uses httpx directly (no official SDK required for billing endpoints).
"""
import base64
import logging
import time
from typing import Optional
import httpx

from core.config import (
    PAYPAL_API_BASE,
    PAYPAL_CLIENT_ID,
    PAYPAL_SECRET,
    PAYPAL_WEBHOOK_ID,
    PAYPAL_ENV,
)
from core.db import db

logger = logging.getLogger(__name__)

# Simple in-memory OAuth token cache
_token_cache = {"access_token": None, "expires_at": 0}

PRODUCT_SETTINGS_ID = "paypal_product"
PLAN_IDS_SETTINGS_ID = "paypal_plan_ids"


class PayPalError(Exception):
    pass


def _auth_header() -> dict:
    if not PAYPAL_CLIENT_ID or not PAYPAL_SECRET:
        raise PayPalError("PayPal credentials not configured")
    raw = f"{PAYPAL_CLIENT_ID}:{PAYPAL_SECRET}".encode("utf-8")
    return {"Authorization": "Basic " + base64.b64encode(raw).decode("utf-8")}


async def get_access_token() -> str:
    now = int(time.time())
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 30:
        return _token_cache["access_token"]
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            headers={**_auth_header(), "Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        raise PayPalError(f"PayPal auth failed: {r.status_code} {r.text}")
    data = r.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + int(data.get("expires_in", 32400))
    return _token_cache["access_token"]


async def _auth_headers() -> dict:
    token = await get_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def _ensure_product() -> str:
    """Create (once) a PayPal Product and cache its id in db.settings."""
    doc = await db.settings.find_one({"id": PRODUCT_SETTINGS_ID}, {"_id": 0})
    key = f"product_id_{PAYPAL_ENV}"
    if doc and doc.get(key):
        return doc[key]
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v1/catalogs/products",
            headers=await _auth_headers(),
            json={
                "name": "Neural AI Stock Analysis",
                "description": "AI-powered stock analysis platform subscription",
                "type": "SERVICE",
                "category": "SOFTWARE",
            },
        )
    if r.status_code not in (200, 201):
        raise PayPalError(f"Create product failed: {r.status_code} {r.text}")
    product_id = r.json()["id"]
    await db.settings.update_one(
        {"id": PRODUCT_SETTINGS_ID},
        {"$set": {"id": PRODUCT_SETTINGS_ID, key: product_id}},
        upsert=True,
    )
    return product_id


async def _create_plan(product_id: str, name: str, price_usd: float,
                       interval_unit: str = "MONTH", interval_count: int = 1,
                       trial_price_usd: float | None = None,
                       trial_cycles: int = 0) -> str:
    """Create a PayPal billing plan. If trial_price_usd is provided and
    trial_cycles > 0, the plan has a TRIAL cycle (discounted) followed by the
    REGULAR cycle (full price) — used for first-month promo pricing."""
    billing_cycles = []
    if trial_price_usd is not None and trial_cycles > 0:
        billing_cycles.append({
            "frequency": {"interval_unit": interval_unit, "interval_count": interval_count},
            "tenure_type": "TRIAL",
            "sequence": 1,
            "total_cycles": int(trial_cycles),
            "pricing_scheme": {
                "fixed_price": {"value": f"{trial_price_usd:.2f}", "currency_code": "USD"},
            },
        })
    billing_cycles.append({
        "frequency": {"interval_unit": interval_unit, "interval_count": interval_count},
        "tenure_type": "REGULAR",
        "sequence": len(billing_cycles) + 1,
        "total_cycles": 0,  # infinite
        "pricing_scheme": {
            "fixed_price": {"value": f"{price_usd:.2f}", "currency_code": "USD"},
        },
    })
    body = {
        "product_id": product_id,
        "name": name,
        "description": name,
        "status": "ACTIVE",
        "billing_cycles": billing_cycles,
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "setup_fee": {"value": "0", "currency_code": "USD"},
            "setup_fee_failure_action": "CONTINUE",
            "payment_failure_threshold": 3,
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v1/billing/plans",
            headers=await _auth_headers(),
            json=body,
        )
    if r.status_code not in (200, 201):
        raise PayPalError(f"Create plan failed: {r.status_code} {r.text}")
    return r.json()["id"]


async def _deactivate_plan(plan_id: str):
    try:
        async with httpx.AsyncClient(timeout=20.0) as hc:
            await hc.post(
                f"{PAYPAL_API_BASE}/v1/billing/plans/{plan_id}/deactivate",
                headers=await _auth_headers(),
            )
    except Exception as e:
        logger.warning("Failed to deactivate plan %s: %s", plan_id, e)


# Variants: 4 billing plans total (pro_monthly, pro_yearly, elite_monthly, elite_yearly)
_PLAN_VARIANTS = [
    # (key, tier, cycle, price_field, name_suffix, interval_unit)
    ("pro_monthly", "pro", "monthly", "pro_monthly", "Pro Monthly", "MONTH"),
    ("pro_yearly", "pro", "yearly", "pro_yearly", "Pro Yearly", "YEAR"),
    ("elite_monthly", "elite", "monthly", "elite_monthly", "Elite Monthly", "MONTH"),
    ("elite_yearly", "elite", "yearly", "elite_yearly", "Elite Yearly", "YEAR"),
]


async def get_plan_ids(prices: dict) -> dict:
    """Ensure PayPal plans exist for current prices (monthly + yearly for both tiers).
    Monthly plans may include a TRIAL cycle (first-month promo) followed by the
    REGULAR cycle at the original monthly price. Creates / rotates as needed.
    Returns {pro_monthly, pro_yearly, elite_monthly, elite_yearly}."""
    doc = await db.settings.find_one({"id": PLAN_IDS_SETTINGS_ID}, {"_id": 0}) or {
        "id": PLAN_IDS_SETTINGS_ID
    }
    env_key = PAYPAL_ENV
    bucket = doc.get(env_key) or {}
    product_id = await _ensure_product()
    changed = False

    # Derive trial vs regular price per monthly variant
    promo_active = bool(prices.get("promo_active"))
    monthly_specs = {
        "pro_monthly": {
            "regular": float(prices["pro_monthly_original"]),
            "trial": float(prices["pro_monthly"]) if promo_active and prices.get("promo_pro_discount_pct", 0) > 0 else None,
        },
        "elite_monthly": {
            "regular": float(prices["elite_monthly_original"]),
            "trial": float(prices["elite_monthly"]) if promo_active and prices.get("promo_elite_discount_pct", 0) > 0 else None,
        },
    }

    for key, tier, cycle, price_field, name_suffix, interval_unit in _PLAN_VARIANTS:
        if cycle == "monthly":
            spec = monthly_specs[key]
            want_regular = spec["regular"]
            want_trial = spec["trial"]  # None when no promo, else discounted first-month price
        else:
            want_regular = float(prices[price_field])
            want_trial = None

        # Only tier up when any of (regular_price, trial_price) changed. Trial
        # is considered None when equal to regular (no promo).
        current = bucket.get(key) or {}
        if (
            current.get("price") == want_regular
            and current.get("trial_price") == want_trial
            and current.get("plan_id")
        ):
            continue

        new_plan_id = await _create_plan(
            product_id,
            f"Neural {name_suffix}",
            want_regular,
            interval_unit=interval_unit,
            interval_count=1,
            trial_price_usd=want_trial,
            trial_cycles=1 if want_trial is not None else 0,
        )
        if current.get("plan_id"):
            await _deactivate_plan(current["plan_id"])
        bucket[key] = {
            "plan_id": new_plan_id,
            "price": want_regular,
            "trial_price": want_trial,
            "cycle": cycle,
            "tier": tier,
        }
        changed = True

    if changed:
        doc[env_key] = bucket
        await db.settings.update_one(
            {"id": PLAN_IDS_SETTINGS_ID}, {"$set": doc}, upsert=True
        )
    return {key: bucket[key]["plan_id"] for key, *_ in _PLAN_VARIANTS}


async def get_subscription(subscription_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.get(
            f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{subscription_id}",
            headers=await _auth_headers(),
        )
    if r.status_code != 200:
        raise PayPalError(f"Get subscription failed: {r.status_code} {r.text}")
    return r.json()


async def cancel_subscription(subscription_id: str, reason: str = "User requested"):
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{subscription_id}/cancel",
            headers=await _auth_headers(),
            json={"reason": reason[:127]},
        )
    # 204 = success. Some already-cancelled states return 422.
    if r.status_code not in (204, 200):
        raise PayPalError(f"Cancel failed: {r.status_code} {r.text}")


async def verify_webhook_signature(headers: dict, raw_body: bytes) -> bool:
    """Verify webhook authenticity via /v1/notifications/verify-webhook-signature.
    Returns True when verified. If PAYPAL_WEBHOOK_ID is unset, returns False so
    caller can fall back to soft-trust mode (still parses event but won't mutate)."""
    if not PAYPAL_WEBHOOK_ID:
        return False
    try:
        import json as _json
        body_obj = _json.loads(raw_body.decode("utf-8") or "{}")
    except Exception:
        return False
    payload = {
        "auth_algo": headers.get("paypal-auth-algo") or headers.get("Paypal-Auth-Algo"),
        "cert_url": headers.get("paypal-cert-url") or headers.get("Paypal-Cert-Url"),
        "transmission_id": headers.get("paypal-transmission-id") or headers.get("Paypal-Transmission-Id"),
        "transmission_sig": headers.get("paypal-transmission-sig") or headers.get("Paypal-Transmission-Sig"),
        "transmission_time": headers.get("paypal-transmission-time") or headers.get("Paypal-Transmission-Time"),
        "webhook_id": PAYPAL_WEBHOOK_ID,
        "webhook_event": body_obj,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as hc:
            r = await hc.post(
                f"{PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature",
                headers=await _auth_headers(),
                json=payload,
            )
        if r.status_code == 200 and r.json().get("verification_status") == "SUCCESS":
            return True
        # Log non-success so we can diagnose real-event failures later
        logger.warning("PayPal verify non-success: status=%s body=%s", r.status_code, r.text[:300])
    except Exception as e:
        logger.warning("Webhook verify failed: %s", e)
    return False



# =============================================================================
# Orders (one-time payments) — used for Day Pass
# =============================================================================

async def create_order(amount: float, description: str, custom_id: str = "") -> dict:
    """Creates a PayPal Order with intent=CAPTURE (one-time charge). Returns
    the parsed order response. Raises PayPalError on non-2xx."""
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "amount": {"currency_code": "USD", "value": f"{float(amount):.2f}"},
                "description": description[:127],
                "custom_id": (custom_id or "")[:127],
            }
        ],
        "application_context": {
            "brand_name": "Neulab",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders",
            headers=await _auth_headers(),
            json=payload,
        )
    if r.status_code not in (200, 201):
        raise PayPalError(f"Create order failed: {r.status_code} {r.text}")
    return r.json()


async def capture_order(order_id: str) -> dict:
    """Captures an approved order. Returns the parsed response. Raises on
    non-2xx or when capture status != COMPLETED."""
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}/capture",
            headers=await _auth_headers(),
        )
    if r.status_code not in (200, 201):
        raise PayPalError(f"Capture failed: {r.status_code} {r.text}")
    data = r.json()
    if data.get("status") != "COMPLETED":
        raise PayPalError(f"Capture not completed: status={data.get('status')}")
    return data


async def get_order(order_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}",
            headers=await _auth_headers(),
        )
    if r.status_code != 200:
        raise PayPalError(f"Get order failed: {r.status_code} {r.text}")
    return r.json()



# =============================================================================
# Webhook registry inspection — used by the admin diagnostics panel to answer
# "is my webhook ID actually registered?", "what URL is it pointed at?",
# "which events is it subscribed to?". All read-only (GET-only PayPal calls).
# =============================================================================

async def get_webhook_details(webhook_id: Optional[str] = None) -> dict:
    """Fetches the webhook configuration from PayPal (/v1/notifications/webhooks/{id}).
    Returns the raw response plus a normalised shape. Raises PayPalError on
    any non-2xx (typically 404 = wrong ID, 401 = env mismatch)."""
    wid = webhook_id or PAYPAL_WEBHOOK_ID
    if not wid:
        raise PayPalError("PAYPAL_WEBHOOK_ID not configured")
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(
            f"{PAYPAL_API_BASE}/v1/notifications/webhooks/{wid}",
            headers=await _auth_headers(),
        )
    if r.status_code != 200:
        raise PayPalError(f"Webhook lookup failed: {r.status_code} {r.text[:300]}")
    data = r.json()
    return {
        "id": data.get("id"),
        "url": data.get("url"),
        "event_types": [e.get("name") for e in (data.get("event_types") or [])],
        "raw": data,
    }


async def list_available_event_types() -> list[dict]:
    """Lists every event type PayPal can publish for the current app. Used
    to cross-check which events are missing from the configured webhook."""
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(
            f"{PAYPAL_API_BASE}/v1/notifications/webhooks-event-types",
            headers=await _auth_headers(),
        )
    if r.status_code != 200:
        raise PayPalError(f"Event-types lookup failed: {r.status_code} {r.text[:300]}")
    return r.json().get("event_types") or []


async def update_webhook_events(webhook_id: str, event_types: list[str]) -> dict:
    """PATCHes the webhook's event_types list to the provided set. Used by the
    admin 'Subscribe to all events' button. Returns the updated webhook."""
    if not webhook_id:
        raise PayPalError("webhook_id required")
    if not event_types:
        raise PayPalError("event_types must be non-empty")
    payload = [{
        "op": "replace",
        "path": "/event_types",
        "value": [{"name": n} for n in event_types],
    }]
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.patch(
            f"{PAYPAL_API_BASE}/v1/notifications/webhooks/{webhook_id}",
            headers=await _auth_headers(),
            json=payload,
        )
    if r.status_code not in (200, 204):
        raise PayPalError(f"Webhook update failed: {r.status_code} {r.text[:300]}")
    return r.json() if r.status_code == 200 else {"updated": True}
