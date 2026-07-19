"""Stock universe for the relative-strength screener.

v1 sources S&P 500 constituents only (Russell 1000 is a documented fast-follow
— see HANDOFF.md decision #4). No paid index-constituents API is configured
in this deployment, so the list is sourced from Wikipedia's "List of S&P 500
companies" article via Wikipedia's own action API (NOT by scraping the
rendered HTML page — confirmed live that Wikipedia's bot-detection 403s
plain HTML GETs even with a browser-like User-Agent, regardless of headers.
The action API + a descriptive, contactable User-Agent is what Wikipedia's
robot policy actually sanctions: https://w.wiki/4wJS).

Cached in db.settings so every screener run doesn't re-fetch, and refreshed
lazily (on read) once the cache is stale — this satisfies the "refresh
monthly" requirement without needing a dedicated cron loop.
"""
import logging
import re
from datetime import timedelta

import httpx

from core.db import db
from core.security import iso, now_utc

logger = logging.getLogger(__name__)

_WIKI_API_URL = "https://en.wikipedia.org/w/api.php"
_WIKI_PAGE = "List of S&P 500 companies"
# Wikipedia's robot policy requires a descriptive UA that identifies the
# operator and a contact point — an anonymous/browser-spoofed UA gets 403'd.
_WIKI_USER_AGENT = "NeuralStocksScreener/1.0 (https://neulab.xyz; ai.neulab.inc@gmail.com)"
_SYMBOL_TEMPLATE_RE = re.compile(r"\{\{\w+Symbol\|([A-Za-z.\-]+)\}\}")
_SETTINGS_ID = "ticker_universe_sp500"
_DEFAULT_MAX_AGE_DAYS = 30


def _normalize_ticker(raw: str) -> str:
    """Wikipedia lists share classes with a dot (e.g. "BRK.B"); yfinance
    and most US market data providers expect a hyphen ("BRK-B")."""
    return raw.strip().upper().replace(".", "-")


async def _scrape_sp500() -> list[str]:
    async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": _WIKI_USER_AGENT}) as hc:
        r = await hc.get(_WIKI_API_URL, params={
            "action": "parse",
            "page": _WIKI_PAGE,
            "format": "json",
            "prop": "wikitext",
        })
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise ValueError(f"Wikipedia API error: {data['error']}")
    wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
    start = wikitext.find('{| class="wikitable')
    end = wikitext.find("\n|}", start)
    if start == -1 or end == -1:
        raise ValueError("constituents wikitable not found in Wikipedia response")
    table = wikitext[start:end]
    tickers = [_normalize_ticker(sym) for sym in _SYMBOL_TEMPLATE_RE.findall(table)]
    if len(tickers) < 400:  # sanity floor — S&P 500 should never be this short
        raise ValueError(f"fetch returned suspiciously few tickers ({len(tickers)})")
    return sorted(set(tickers))


async def refresh_universe() -> dict:
    """Force a re-scrape and re-cache. Returns the stored doc."""
    tickers = await _scrape_sp500()
    doc = {
        "id": _SETTINGS_ID,
        "tickers": tickers,
        "source": "wikipedia_sp500",
        "updated_at": iso(now_utc()),
    }
    await db.settings.update_one({"id": _SETTINGS_ID}, {"$set": doc}, upsert=True)
    logger.info("ticker_universe: refreshed S&P 500 list — %d tickers", len(tickers))
    return doc


async def get_universe(max_age_days: int = _DEFAULT_MAX_AGE_DAYS) -> list[str]:
    """Returns the cached ticker list, transparently refreshing it if missing
    or stale. Falls back to a stale cached list (rather than failing the
    caller) if a refresh attempt errors — a screener run with a slightly
    outdated universe is far better than one that can't run at all."""
    doc = await db.settings.find_one({"id": _SETTINGS_ID}, {"_id": 0}) or {}
    tickers = doc.get("tickers") or []
    updated_at = doc.get("updated_at")
    is_stale = True
    if updated_at:
        try:
            from datetime import datetime
            age = now_utc() - datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            is_stale = age > timedelta(days=max_age_days)
        except Exception:
            is_stale = True

    if not tickers or is_stale:
        try:
            fresh = await refresh_universe()
            return fresh["tickers"]
        except Exception as e:
            logger.warning("ticker_universe: refresh failed, falling back to cache: %s", e)
            if tickers:
                return tickers
            raise

    return tickers
