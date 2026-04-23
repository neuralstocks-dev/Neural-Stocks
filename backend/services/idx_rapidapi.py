"""Indonesia Stock Exchange (IDX) data via RapidAPI.

Wraps three endpoints from the `indonesia-stock-exchange-idx` provider on
RapidAPI (yasimpratama88). We use the **BASIC free plan** (1,000 requests/
month, 1 req/sec). Because the BASIC plan charges $0.01 per overage request,
we maintain our own monthly counter in MongoDB and enforce a **soft budget**
≈5% below the hard quota (`RAPIDAPI_IDX_MONTHLY_BUDGET`, default 950) so we
can never accidentally incur overage fees.

Design:
  * All calls are aggressively cached (quote 10m, technical 30m, fundamentals 24h)
  * Any failure (missing key, exhausted budget, HTTP error, 429 rate limit)
    returns `None` — the caller must fall back to yfinance.
  * Monthly counter document: `db.rapidapi_usage.{month: "YYYY-MM"}`
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

import httpx

from core.db import db

logger = logging.getLogger(__name__)

_API_KEY = os.environ.get("RAPIDAPI_KEY", "").strip()
_HOST = os.environ.get("RAPIDAPI_IDX_HOST", "indonesia-stock-exchange-idx.p.rapidapi.com").strip()
_BUDGET = int(os.environ.get("RAPIDAPI_IDX_MONTHLY_BUDGET", "950"))
_BASE_URL = f"https://{_HOST}"

# TTL caches — in-process; reset on backend restart. Key = ticker root (no .JK).
_quote_cache: dict[str, tuple[float, dict]] = {}
_technical_cache: dict[str, tuple[float, dict]] = {}
_fundamentals_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_QUOTE = 10 * 60          # 10 min
_CACHE_TTL_TECHNICAL = 30 * 60      # 30 min
_CACHE_TTL_FUNDAMENTALS = 24 * 3600  # 24 h

# In-process rate limiter — BASIC is 1 req/sec.
_rate_lock = asyncio.Lock()
_last_call_ts = 0.0
_MIN_INTERVAL = 1.05  # 5% safety margin over 1 req/sec

# Shared httpx client — created lazily so the import doesn't open sockets.
_client: httpx.AsyncClient | None = None


def is_configured() -> bool:
    return bool(_API_KEY) and len(_API_KEY) > 10


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={
                "X-RapidAPI-Key": _API_KEY,
                "X-RapidAPI-Host": _HOST,
                "User-Agent": "neulab/1.0 (+https://neulab.xyz)",
            },
        )
    return _client


async def usage_snapshot() -> dict:
    """Return current month's usage vs budget. Used by admin UI."""
    doc = await db.rapidapi_usage.find_one({"month": _month_key()}, projection={"_id": 0}) or {}
    count = int(doc.get("count", 0))
    return {
        "configured": is_configured(),
        "month": _month_key(),
        "count": count,
        "budget": _BUDGET,
        "remaining": max(0, _BUDGET - count),
        "exhausted": count >= _BUDGET,
        "last_call_at": doc.get("last_call_at"),
        "last_error": doc.get("last_error"),
        "last_ticker": doc.get("last_ticker"),
    }


async def budget_remaining() -> int:
    snap = await usage_snapshot()
    return snap["remaining"] if snap["configured"] else 0


async def _increment_usage(ticker: str, error: str | None = None) -> None:
    """Atomic month-counter update."""
    update = {
        "$inc": {"count": 1},
        "$set": {
            "last_call_at": datetime.now(timezone.utc).isoformat(),
            "last_ticker": ticker,
            "last_error": error,
        },
    }
    await db.rapidapi_usage.update_one(
        {"month": _month_key()}, update, upsert=True,
    )


async def _budget_allows() -> bool:
    doc = await db.rapidapi_usage.find_one({"month": _month_key()}, projection={"count": 1})
    count = int((doc or {}).get("count", 0))
    return count < _BUDGET


async def _rate_limited_sleep():
    """Ensure ≥1s since last outbound call. Uses a shared asyncio Lock so
    concurrent requests serialise cleanly."""
    global _last_call_ts
    async with _rate_lock:
        now = time.monotonic()
        delta = now - _last_call_ts
        if delta < _MIN_INTERVAL:
            await asyncio.sleep(_MIN_INTERVAL - delta)
        _last_call_ts = time.monotonic()


def _strip_jk(ticker: str) -> str:
    """Normalise BBCA.JK → BBCA for RapidAPI symbol usage."""
    t = ticker.strip().upper()
    if t.endswith(".JK"):
        t = t[:-3]
    return t


async def _call(path: str, ticker: str) -> dict | None:
    """Core GET with budget + rate limit + error handling. Returns None on any
    non-2xx / network / quota-exhausted condition."""
    if not is_configured():
        return None
    if not await _budget_allows():
        logger.info("RapidAPI IDX budget exhausted for %s", _month_key())
        return None
    await _rate_limited_sleep()
    try:
        client = await _get_client()
        r = await client.get(f"{_BASE_URL}{path}")
        await _increment_usage(ticker, error=None if r.status_code == 200 else f"HTTP {r.status_code}")
        if r.status_code != 200:
            logger.warning("RapidAPI IDX %s → %d: %s", path, r.status_code, (r.text or "")[:200])
            return None
        return r.json()
    except Exception as e:
        logger.warning("RapidAPI IDX %s failed: %s", path, e)
        await _increment_usage(ticker, error=str(e)[:200])
        return None


# ------------------------------- Public API -------------------------------

async def get_quote(ticker: str) -> dict | None:
    """Return current quote snapshot (price, volume, market cap, change %).
    Uses `/api/emiten/{symbol}/info`. None on any failure."""
    symbol = _strip_jk(ticker)
    cached = _quote_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_QUOTE):
        return cached[1]
    raw = await _call(f"/api/emiten/{symbol}/info", ticker=symbol)
    if not raw:
        return None
    # Normalise the most-used fields into a flat dict the rest of the app
    # can consume alongside yfinance's quote shape.
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None
    normalised = {
        "symbol": f"{symbol}.JK",
        "price": data.get("lastPrice") or data.get("last_price") or data.get("price"),
        "change": data.get("change"),
        "change_pct": data.get("changePercent") or data.get("change_percent"),
        "open": data.get("openPrice") or data.get("open"),
        "high": data.get("highPrice") or data.get("high"),
        "low": data.get("lowPrice") or data.get("low"),
        "prev_close": data.get("previousClose") or data.get("prev_close"),
        "volume": data.get("volume"),
        "value": data.get("value") or data.get("turnover"),
        "market_cap": data.get("marketCap") or data.get("market_cap"),
        "sector": data.get("sector") or data.get("subSector"),
        "company_name": data.get("companyName") or data.get("name"),
        "source": "rapidapi.idx",
        "raw": data,
    }
    _quote_cache[symbol] = (time.time(), normalised)
    return normalised


async def get_key_stats(ticker: str) -> dict | None:
    """Valuation + profitability ratios. Uses `/api/emiten/{symbol}/key-stats`."""
    symbol = _strip_jk(ticker)
    cached = _fundamentals_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_FUNDAMENTALS):
        return cached[1]
    raw = await _call(f"/api/emiten/{symbol}/key-stats", ticker=symbol)
    if not raw:
        return None
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None
    normalised = {
        "symbol": f"{symbol}.JK",
        "pe_ratio": data.get("peRatio") or data.get("pe_ratio"),
        "pb_ratio": data.get("pbRatio") or data.get("pb_ratio"),
        "dividend_yield": data.get("dividendYield") or data.get("dividend_yield"),
        "roe": data.get("roe"),
        "roa": data.get("roa"),
        "eps": data.get("eps"),
        "book_value": data.get("bookValue") or data.get("book_value"),
        "debt_equity": data.get("debtToEquity") or data.get("debt_equity"),
        "revenue_growth": data.get("revenueGrowth") or data.get("revenue_growth"),
        "profit_margin": data.get("profitMargin") or data.get("profit_margin"),
        "source": "rapidapi.idx",
        "raw": data,
    }
    _fundamentals_cache[symbol] = (time.time(), normalised)
    return normalised


async def get_technical(ticker: str) -> dict | None:
    """Returns SMA/EMA/RSI/MACD/Stochastic/Bollinger signals from the
    provider's `/api/analysis/technical/{symbol}` endpoint.

    We keep the full payload since the UI can render the provider's
    ready-made bullish/bearish signal strings alongside our own technicals."""
    symbol = _strip_jk(ticker)
    cached = _technical_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_TECHNICAL):
        return cached[1]
    raw = await _call(
        f"/api/analysis/technical/{symbol}?indicators=sma,ema,rsi,macd,bollinger,stochastic",
        ticker=symbol,
    )
    if not raw:
        return None
    data = raw.get("data") if isinstance(raw, dict) else raw
    if not isinstance(data, dict):
        return None
    normalised = {"symbol": f"{symbol}.JK", "source": "rapidapi.idx", "indicators": data}
    _technical_cache[symbol] = (time.time(), normalised)
    return normalised
