"""Configuration constants & env vars for the Neural backend."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]

# OpenRouter replaces EMERGENT_LLM_KEY entirely.
# Set OPENROUTER_API_KEY in Railway environment variables.
OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]

# Backwards-compatibility shim: any code that still imports EMERGENT_LLM_KEY
# from this module will get the OpenRouter key instead of a hard crash.
# Remove once all references are cleaned up.
EMERGENT_LLM_KEY = OPENROUTER_API_KEY

JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "neuralstocks.dev@gmail.com").split(",")
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

# ---------- Stripe ----------
# Test vs live is determined by which key you paste in (sk_test_... / sk_live_...) —
# unlike PayPal there's no separate sandbox API host.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_MODE = "live" if STRIPE_SECRET_KEY.startswith("sk_live_") else "test"

# ---------- Resend ----------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# ---------- Telegram ----------
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "")

# ---------- Finnhub ----------
FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY", "")

# ---------- Plans ----------
DEFAULT_PRO_PRICE = 9.0
DEFAULT_ELITE_PRICE = 24.0
DEFAULT_ANNUAL_DISCOUNT_PCT = 20.0
DEFAULT_DAYPASS_PRICE = 4.99
DEFAULT_DAYPASS_DURATION_DAYS = 7

ELITE_FAIR_USE_DAILY = 50

PLANS = {
    "free": {
        "name": "Free",
        "price_usd": 0,
        "watchlist_limit": 5,
        # Switched from 3/day + 12/week to a flat 3/month (2026-07-22).
        # Free users can now use their 3 analyses whenever they like within
        # the calendar month instead of being throttled by day/week --
        # enforce_analysis_quota() only checks analyses_per_month for this
        # tier. Keep analyses_per_day/analyses_per_week present (as None)
        # since other code paths key off these fields unconditionally.
        "analyses_per_day": None,
        "analyses_per_week": None,
        "analyses_per_month": 3,
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
        "analyses_per_month": None,
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
        "watchlist_limit": 500,
        "watchlist_display": "Unlimited",
        "analyses_per_day": ELITE_FAIR_USE_DAILY,
        "analyses_per_week": None,
        "analyses_per_month": None,
        "quick_actions": True,
        "share_verdicts": True,
        "personal_backtest": True,
        "analysis_history_days": 3650,
        "tag": "Institutional",
        "share_per_day": None,
    },
    "daypass": {
        "name": "Week Pass",
        "price_usd": DEFAULT_DAYPASS_PRICE,
        "watchlist_limit": 10,
        "analyses_per_day": 10,
        "analyses_per_week": 50,
        "analyses_per_month": None,
        "quick_actions": False,
        "share_verdicts": True,
        "personal_backtest": True,
        "analysis_history_days": 30,
        "tag": "One-time trial",
        "share_per_day": 20,
        "duration_days": DEFAULT_DAYPASS_DURATION_DAYS,
    },
}

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
