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
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "jolor69@gmail.com").split(",")
    if e.strip()
}

PLANS = {
    "free": {
        "name": "Free",
        "price_usd": 0,
        "watchlist_limit": 3,
        "analyses_per_day": 1,
        "analyses_per_week": 2,
        "quick_actions": False,
        "share_verdicts": False,
        "analysis_history_days": 30,
        "tag": "Starter",
    },
    "pro": {
        "name": "Pro",
        "price_usd": 9.99,
        "watchlist_limit": 10,
        "analyses_per_day": 15,
        "analyses_per_week": 60,
        "quick_actions": True,
        "share_verdicts": True,
        "analysis_history_days": 365,
        "tag": "Most popular",
    },
    "elite": {
        "name": "Elite",
        "price_usd": 29.99,
        "watchlist_limit": 25,
        "analyses_per_day": None,
        "analyses_per_week": None,
        "quick_actions": True,
        "share_verdicts": True,
        "analysis_history_days": 3650,
        "tag": "Institutional",
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
