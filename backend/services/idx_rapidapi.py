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
_MIN_INTERVAL = 1.3  # 30% safety margin — provider counter is strict per-second

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
    non-2xx / network / quota-exhausted condition. One retry on 429."""
    if not is_configured():
        return None
    if not await _budget_allows():
        logger.info("RapidAPI IDX budget exhausted for %s", _month_key())
        return None
    for attempt in (1, 2):
        await _rate_limited_sleep()
        try:
            client = await _get_client()
            r = await client.get(f"{_BASE_URL}{path}")
        except Exception as e:
            logger.warning("RapidAPI IDX %s failed: %s", path, e)
            await _increment_usage(ticker, error=str(e)[:200])
            return None
        await _increment_usage(
            ticker, error=None if r.status_code == 200 else f"HTTP {r.status_code}"
        )
        if r.status_code == 200:
            return r.json()
        # Retry once on 429 with a longer sleep; bail on any other non-2xx
        if r.status_code == 429 and attempt == 1:
            logger.info("RapidAPI IDX %s 429 — backing off 2s then retrying", path)
            await asyncio.sleep(2.0)
            continue
        logger.warning("RapidAPI IDX %s → %d: %s", path, r.status_code, (r.text or "")[:200])
        return None
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
    if not raw or not raw.get("success"):
        return None
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None

    def _f(x):
        """Safe float parse — API returns numerics as strings like '6425.00'."""
        try:
            if x is None or x == "" or x == "NA":
                return None
            return float(x)
        except (TypeError, ValueError):
            return None

    normalised = {
        "symbol": f"{symbol}.JK",
        "price": _f(data.get("price")),
        "change": _f(data.get("change")),
        "change_pct": _f(data.get("percentage")),
        "prev_close": _f(data.get("previous")),
        "volume": _f(data.get("volume")),
        "average_volume": _f(data.get("average")),
        "market_cap": None,  # not in /info; populated by key-stats if available
        "sector": data.get("sector"),
        "sub_sector": data.get("sub_sector"),
        "company_name": data.get("name"),
        "exchange": data.get("exchange"),
        "country": data.get("country"),
        "sentiment": data.get("sentiment"),
        "time": data.get("time"),
        "updated": data.get("updated"),
        # orderbook bid/offer are handy for the verdict page even if we
        # don't surface them today
        "bid": _f((data.get("orderbook") or {}).get("bid", {}).get("price")) if isinstance(data.get("orderbook"), dict) else None,
        "offer": _f((data.get("orderbook") or {}).get("offer", {}).get("price")) if isinstance(data.get("orderbook"), dict) else None,
        "source": "rapidapi.idx",
    }
    _quote_cache[symbol] = (time.time(), normalised)
    return normalised


async def get_key_stats(ticker: str) -> dict | None:
    """Valuation + profitability ratios via `/api/emiten/{symbol}/keystats`.

    The upstream shape is deeply nested:
        data.closure_fin_items_results[].fin_name_results[].fitem = {id, name, value}
    We flatten it into a {name: value} dict and extract the most-useful
    ratios by name heuristic."""
    symbol = _strip_jk(ticker)
    cached = _fundamentals_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_FUNDAMENTALS):
        return cached[1]
    raw = await _call(f"/api/emiten/{symbol}/keystats", ticker=symbol)
    if not raw or not raw.get("success"):
        return None
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None
    # Walk the nested structure and flatten to {name_lowercase: value}
    flat: dict[str, str] = {}
    for block in (data.get("closure_fin_items_results") or []):
        for row in (block.get("fin_name_results") or []):
            item = row.get("fitem") or {}
            name = (item.get("name") or "").strip()
            value = item.get("value")
            if name and value not in (None, "", "NA"):
                flat[name.lower()] = value

    def pick(*needles) -> float | None:
        """Return first match (case-insensitive substring) as float."""
        for needle in needles:
            n = needle.lower()
            for k, v in flat.items():
                if n in k:
                    try:
                        return float(str(v).replace(",", ""))
                    except (TypeError, ValueError):
                        continue
        return None

    normalised = {
        "symbol": f"{symbol}.JK",
        "pe_ratio": pick("current pe ratio (ttm)", "current pe ratio", "pe ratio"),
        "forward_pe": pick("forward pe"),
        "pb_ratio": pick("price to book", "pb ratio", "p/b"),
        "ps_ratio": pick("price to sales", "ps ratio", "p/s"),
        "dividend_yield": pick("dividend yield"),
        "roe": pick("return on equity", "roe"),
        "roa": pick("return on assets", "roa"),
        "eps": pick("earnings per share (ttm)", "eps (ttm)", "current eps"),
        "book_value": pick("book value per share"),
        "debt_equity": pick("debt to equity", "debt/equity"),
        "revenue_growth": pick("revenue growth"),
        "profit_margin": pick("net profit margin", "profit margin"),
        "market_cap": pick("market cap", "market capitalization"),
        "source": "rapidapi.idx",
        "raw_count": len(flat),
    }
    _fundamentals_cache[symbol] = (time.time(), normalised)
    return normalised


async def get_technical(ticker: str) -> dict | None:
    """Returns RSI/MACD/SMA signals from `/api/analysis/technical/{symbol}`.

    Response shape:
        data = {
            symbol, timeframe, lastPrice, lastUpdate, dataPoints,
            indicators: { rsi: {value, signal, period}, macd: {...}, ... }
        }
    We pass through the indicators dict since each has its own signal string
    (BULLISH / BEARISH / NEUTRAL) that the UI can display directly."""
    symbol = _strip_jk(ticker)
    cached = _technical_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_TECHNICAL):
        return cached[1]
    raw = await _call(
        f"/api/analysis/technical/{symbol}?indicators=rsi,macd,sma,ema",
        ticker=symbol,
    )
    if not raw or not raw.get("success"):
        return None
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return None
    normalised = {
        "symbol": f"{symbol}.JK",
        "timeframe": data.get("timeframe"),
        "last_price": data.get("lastPrice"),
        "last_update": data.get("lastUpdate"),
        "indicators": data.get("indicators") or {},
        "source": "rapidapi.idx",
    }
    _technical_cache[symbol] = (time.time(), normalised)
    return normalised


# ---- Bandarmology (computed from insider-flow endpoint) ------------------
# The provider's `/api/emiten/{sym}/insider` endpoint returns a list of
# shareholder movements with action_type BUY/SELL, change in shares, and
# badges identifying directors / commissioners ("smart money"). We compute
# an accumulation score locally rather than calling a separate endpoint,
# which (a) saves budget — no extra req/analysis, (b) makes the signal
# math transparent and auditable, (c) survives provider endpoint changes.

_bandarmology_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_BANDARMOLOGY = 60 * 60  # 1h — insider filings don't move fast
_trending_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL_TRENDING = 30 * 60  # 30 min


async def get_insider_flow(ticker: str) -> list[dict] | None:
    """Raw insider-movement list from `/api/emiten/{sym}/insider`."""
    symbol = _strip_jk(ticker)
    raw = await _call(f"/api/emiten/{symbol}/insider", ticker=symbol)
    if not raw or not raw.get("success"):
        return None
    data = raw.get("data") or {}
    movements = data.get("movement") or []
    return movements if isinstance(movements, list) else None


def _parse_shares(s) -> float:
    """'+147,933' → 147933.0; robust against commas and signs."""
    if s is None:
        return 0.0
    try:
        return float(str(s).replace(",", "").replace("+", ""))
    except (TypeError, ValueError):
        return 0.0


async def get_bandarmology(ticker: str) -> dict | None:
    """Compute Accumulation / Distribution / Smart-Money signals from the
    insider-flow feed. Single upstream call, computed locally."""
    symbol = _strip_jk(ticker)
    cached = _bandarmology_cache.get(symbol)
    if cached and (time.time() - cached[0] < _CACHE_TTL_BANDARMOLOGY):
        return cached[1]
    movements = await get_insider_flow(ticker)
    if movements is None:
        return None

    buy_shares = 0.0
    sell_shares = 0.0
    buy_count = 0
    sell_count = 0
    smart_money_buy = 0.0
    smart_money_sell = 0.0
    foreign_net = 0.0
    recent_samples = []

    SMART_BADGES = {
        "SHAREHOLDER_BADGE_DIREKTUR",
        "SHAREHOLDER_BADGE_KOMISARIS",
        "SHAREHOLDER_BADGE_PRESIDENT_DIRECTOR",
        "SHAREHOLDER_BADGE_MAJOR_SHAREHOLDER",
    }

    for m in movements:
        action = (m.get("action_type") or "").upper()
        change_shares = _parse_shares((m.get("changes") or {}).get("value"))
        abs_shares = abs(change_shares)
        is_smart = bool(set(m.get("badges") or []) & SMART_BADGES)
        is_foreign = (m.get("nationality") or "") == "NATIONALITY_TYPE_FOREIGN"

        if "BUY" in action:
            buy_shares += abs_shares
            buy_count += 1
            if is_smart:
                smart_money_buy += abs_shares
            if is_foreign:
                foreign_net += abs_shares
        elif "SELL" in action:
            sell_shares += abs_shares
            sell_count += 1
            if is_smart:
                smart_money_sell += abs_shares
            if is_foreign:
                foreign_net -= abs_shares

        if len(recent_samples) < 5:
            recent_samples.append({
                "name": m.get("name"),
                "action": "BUY" if "BUY" in action else ("SELL" if "SELL" in action else "—"),
                "shares": abs_shares,
                "date": m.get("date"),
                "price": m.get("price_formatted"),
                "is_smart_money": is_smart,
                "is_foreign": is_foreign,
                "badges": m.get("badges") or [],
            })

    total = buy_shares + sell_shares
    accumulation_ratio = (buy_shares / total) if total > 0 else 0.5
    smart_total = smart_money_buy + smart_money_sell
    smart_accumulation = (smart_money_buy / smart_total) if smart_total > 0 else None

    if total == 0:
        regime = "no_signal"
        label = "No recent insider activity"
    elif accumulation_ratio >= 0.7:
        regime = "strong_accumulation"
        label = "Strong accumulation"
    elif accumulation_ratio >= 0.55:
        regime = "mild_accumulation"
        label = "Mild accumulation"
    elif accumulation_ratio <= 0.3:
        regime = "strong_distribution"
        label = "Strong distribution"
    elif accumulation_ratio <= 0.45:
        regime = "mild_distribution"
        label = "Mild distribution"
    else:
        regime = "balanced"
        label = "Balanced flow"

    result = {
        "symbol": f"{symbol}.JK",
        "regime": regime,
        "label": label,
        "accumulation_ratio": round(accumulation_ratio, 4),
        "smart_money_accumulation": round(smart_accumulation, 4) if smart_accumulation is not None else None,
        "buy_shares": int(buy_shares),
        "sell_shares": int(sell_shares),
        "buy_count": buy_count,
        "sell_count": sell_count,
        "smart_money_buy_shares": int(smart_money_buy),
        "smart_money_sell_shares": int(smart_money_sell),
        "foreign_net_shares": int(foreign_net),
        "total_movements": len(movements),
        "recent": recent_samples,
        "source": "rapidapi.idx",
    }
    _bandarmology_cache[symbol] = (time.time(), result)
    return result


# ---- Multibagger — built from /api/main/trending -----------------------
async def get_trending() -> list[dict] | None:
    """Raw trending list from `/api/main/trending`. 1 call per ~30 min window."""
    cached = _trending_cache.get("trending")
    if cached and (time.time() - cached[0] < _CACHE_TTL_TRENDING):
        return cached[1]
    raw = await _call("/api/main/trending", ticker="TRENDING")
    if not raw or not raw.get("success"):
        return None
    nested = raw.get("data") or {}
    items = nested.get("data") if isinstance(nested, dict) else None
    if not isinstance(items, list):
        return None
    _trending_cache["trending"] = (time.time(), items)
    return items


async def get_top_picks(limit: int = 10) -> list[dict] | None:
    """Top N IDX picks ranked by a simple multi-factor score.

    Score = 60% one-day percent-change (capped at ±10%) + 40% price
    quality heuristic (penalise sub-100 Rp "penny stocks"). Returns a
    clean UI-ready list with symbol, name, price, change_pct, score."""
    items = await get_trending()
    if not items:
        return None

    def _safe_float(x):
        try:
            return float(str(x).replace(",", ""))
        except (TypeError, ValueError):
            return 0.0

    scored = []
    for it in items:
        if (it.get("type") or "").lower() != "saham":
            continue
        symbol = it.get("symbol")
        if not symbol:
            continue
        change_pct = _safe_float(it.get("percent"))
        price = _safe_float(it.get("last"))
        if price >= 1000:
            price_quality = 1.0
        elif price >= 200:
            price_quality = 0.8
        elif price >= 50:
            price_quality = 0.4
        else:
            price_quality = 0.1
        change_component = max(-10.0, min(10.0, change_pct)) / 10.0
        score = 0.6 * change_component + 0.4 * price_quality
        scored.append({
            "symbol": f"{symbol}.JK",
            "name": it.get("name"),
            "price": price,
            "change": _safe_float(it.get("change")),
            "change_pct": change_pct,
            "score": round(score, 4),
            "tradeable": bool(it.get("tradeable")),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]



# ---- Lightweight IDX directory for search ----------------------------
# The free RapidAPI plan doesn't expose a master "list all emiten" endpoint,
# but the trending feed already gives us 25 live names with company names.
# We reuse its existing 30-min cache (no extra API calls) and expose a
# simplified directory view for `/api/stocks/search` to merge into its
# IDX results. This guarantees the user sees LIVE IDX tickers beyond the
# 20 hard-coded blue-chips when they filter by IDX.
async def get_directory_tickers() -> list[dict]:
    """Returns [{symbol: 'KOTA.JK', name: 'DMS Propertindo Tbk.', source: 'rapidapi'}].
    Uses the cached trending list. Safe to call on every search — at most
    1 RapidAPI call per 30-min window (same cache the Top Picks dialog uses)."""
    items = await get_trending()
    if not items:
        return []
    out = []
    for it in items:
        if (it.get("type") or "").lower() != "saham":
            continue
        sym = it.get("symbol")
        if not sym:
            continue
        out.append({
            "symbol": f"{sym}.JK",
            "name": it.get("name") or sym,
            "source": "rapidapi",
        })
    return out


async def verify_ticker(ticker: str) -> dict | None:
    """Confirm that an arbitrary .JK ticker exists on the IDX by pulling its
    quote snapshot. Used on-demand from the AddStockModal when a user types
    a ticker we don't know about. Costs 1 RapidAPI call. Returns None if the
    ticker isn't found or budget is exhausted."""
    q = await get_quote(ticker)
    if not q or q.get("price") is None:
        return None
    return {
        "symbol": ticker.upper() if ticker.upper().endswith(".JK") else f"{_strip_jk(ticker).upper()}.JK",
        "name": q.get("name") or ticker.upper(),
        "price": q.get("price"),
        "currency": q.get("currency") or "IDR",
        "source": "rapidapi",
    }
