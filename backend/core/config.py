"""Configuration constants & env vars for the Neural backend."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
EMERGENT_AUTH_SESSION_URL = os.environ.get(
    "EMERGENT_AUTH_SESSION_URL",
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
)

JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "jolor69@gmail.com").split(",")
    if e.strip()
}

# ---------- PayPal ----------
PAYPAL_ENV = os.environ.get("PAYPAL_ENV", "sandbox").lower()
if PAYPAL_ENV == "live":
    PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_LIVE_CLIENT_ID", "")
    PAYPAL_SECRET = os.environ.get("PAYPAL_LIVE_SECRET", "")
    PAYPAL_API_BASE = "https://api-m.paypal.com"
else:
    PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_SANDBOX_CLIENT_ID", "")
    PAYPAL_SECRET = os.environ.get("PAYPAL_SANDBOX_SECRET", "")
    PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")

# ---------- Resend ----------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# ---------- Telegram ----------
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "")

# ---------- Finnhub ----------
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")

# ---------- Plans ----------
# Default monthly prices — overridable dynamically via db.settings by admin.
DEFAULT_PRO_PRICE = 9.0
DEFAULT_ELITE_PRICE = 24.0
DEFAULT_ANNUAL_DISCOUNT_PCT = 20.0  # yearly price = monthly * 12 * (1 - pct/100)
DEFAULT_DAYPASS_PRICE = 4.99
DEFAULT_DAYPASS_DURATION_DAYS = 7

# Fair-use soft cap for Elite — displayed to the user as "Unlimited" but
# backend enforces this ceiling to protect LLM spend from runaway usage.
# Set to None to re-enable truly-unlimited.
ELITE_FAIR_USE_DAILY = 50

PLANS = {
    "free": {
        "name": "Free",
        "price_usd": 0,
        "watchlist_limit": 5,
        "analyses_per_day": 3,
        "analyses_per_week": 12,
        "quick_actions": False,
        "share_verdicts": True,
        "personal_backtest": False,
        "analysis_history_days": 30,
        "tag": "Starter",
        "share_per_day": 5,
    },
    "pro": {
        "name": "Pro",
        "price_usd": DEFAULT_PRO_PRICE,
        "watchlist_limit": 25,
        "analyses_per_day": 15,
        "analyses_per_week": 60,
        "quick_actions": True,
        "share_verdicts": True,
        "personal_backtest": True,
        "analysis_history_days": 365,
        "tag": "Most popular",
        "share_per_day": 50,
    },
    "elite": {
        "name": "Elite",
        "price_usd": DEFAULT_ELITE_PRICE,
        "watchlist_limit": 500,  # "Unlimited" UX with a sanity ceiling to prevent DB bloat
        "watchlist_display": "Unlimited",
        "analyses_per_day": ELITE_FAIR_USE_DAILY,  # displayed as "Unlimited" — see pricing service
        "analyses_per_day_display": "Unlimited",
        "analyses_per_week": None,
        "quick_actions": True,
        "share_verdicts": True,
        "personal_backtest": True,
        "analysis_history_days": 3650,
        "tag": "Institutional",
        "share_per_day": None,
    },
    # One-time "Week Pass" — admin-configurable duration + quotas. NOT a
    # recurring subscription. Paid via PayPal Orders (capture), not Billing.
    # When user pays, backend sets user.plan="daypass" + daypass_expires_at.
    # Auto-reverts to free when the window closes. Renamed from "Day Pass"
    # since the effective duration is 7 days — "Week Pass" is truth-in-naming.
    "daypass": {
        "name": "Week Pass",
        "price_usd": DEFAULT_DAYPASS_PRICE,
        "watchlist_limit": 10,
        "analyses_per_day": 10,
        "analyses_per_week": 50,
        "quick_actions": False,
        "share_verdicts": True,
        "personal_backtest": True,
        "analysis_history_days": 30,
        "tag": "One-time trial",
        "share_per_day": 20,
        "duration_days": DEFAULT_DAYPASS_DURATION_DAYS,
    },
}

# Admin-assignable test-unlock durations (seconds). None = forever.
UNLOCK_DURATIONS = {
    "1h": 60 * 60,
    "2h": 2 * 60 * 60,
    "4h": 4 * 60 * 60,
    "12h": 12 * 60 * 60,
    "1d": 24 * 60 * 60,
    "3d": 3 * 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "2w": 14 * 24 * 60 * 60,
    "3w": 21 * 24 * 60 * 60,
    "4w": 28 * 24 * 60 * 60,
    "forever": None,
}
