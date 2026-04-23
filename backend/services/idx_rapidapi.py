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


# ------------------ IDX catalog (local MongoDB index) ----------------------
# We seed a `idx_catalog` collection organically from every successful
# RapidAPI call plus via a one-click admin bootstrap. Search then reads
# from the local catalog first, falling back to the trending cache, then
# the static 20-blue-chip catalog — zero extra RapidAPI calls per search.
async def upsert_catalog_entry(
    symbol: str,
    name: str | None = None,
    sector: str | None = None,
    source: str = "rapidapi",
) -> None:
    """Upserts an IDX ticker into the local catalog. Called from every
    successful quote / bandarmology / trending fetch so the catalog grows
    organically with whatever tickers users actually touch."""
    if not symbol:
        return
    symbol = symbol.upper()
    if not symbol.endswith(".JK"):
        symbol = f"{symbol}.JK"
    update = {
        "$set": {"symbol": symbol, "last_seen_at": datetime.now(timezone.utc).isoformat()},
        "$setOnInsert": {"first_seen_at": datetime.now(timezone.utc).isoformat(), "source": source},
    }
    if name:
        update["$set"]["name"] = name
    if sector:
        update["$set"]["sector"] = sector
    try:
        await db.idx_catalog.update_one({"symbol": symbol}, update, upsert=True)
    except Exception:
        pass  # Never let catalog bookkeeping break the hot path


async def search_catalog(q: str = "", limit: int = 50) -> list[dict]:
    """Searches the local idx_catalog by symbol OR name (case-insensitive).
    When q is empty, returns the most-recently-seen tickers first."""
    import re
    query: dict = {}
    if q:
        pattern = re.escape(q)
        query = {"$or": [
            {"symbol": {"$regex": pattern, "$options": "i"}},
            {"name": {"$regex": pattern, "$options": "i"}},
        ]}
    cursor = (
        db.idx_catalog
        .find(query, {"_id": 0})
        .sort("last_seen_at", -1)
        .limit(limit)
    )
    return await cursor.to_list(length=limit)


async def catalog_stats() -> dict:
    """Return total count + distribution by source for the admin panel."""
    total = await db.idx_catalog.count_documents({})
    pipeline = [{"$group": {"_id": "$source", "n": {"$sum": 1}}}]
    cursor = db.idx_catalog.aggregate(pipeline)
    by_source = {doc["_id"] or "unknown": doc["n"] async for doc in cursor}
    return {"total": total, "by_source": by_source}


# Candidate PRO-plan endpoints for bulk seeding. The BASIC plan returns
# 404 on these — we iterate and surface which worked in the admin response.
# Each tuple: (path, response-parser). Parser takes the JSON and returns
# [{symbol, name, sector?}] or [] on shape mismatch.
def _parse_generic_list(payload) -> list[dict]:
    """Best-effort parser — hunts for a list of {symbol, name} regardless
    of nesting depth. Handles common wrappers like {data: {data: [...]}} or
    {results: [...]}. Returns a list (possibly empty)."""
    if not isinstance(payload, dict):
        return []

    def _extract_list(obj):
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            for k in ("data", "results", "items", "companies", "emiten", "list"):
                sub = obj.get(k)
                if isinstance(sub, list):
                    return sub
                if isinstance(sub, dict):
                    nested = _extract_list(sub)
                    if nested:
                        return nested
        return []

    rows = _extract_list(payload)
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = r.get("symbol") or r.get("code") or r.get("ticker")
        if not sym:
            continue
        out.append({
            "symbol": str(sym).upper(),
            "name": r.get("name") or r.get("company_name") or r.get("longName"),
            "sector": r.get("sector") or r.get("sector_name") or r.get("industry"),
        })
    return out


# PRO-plan bulk-seed candidate paths. We only try these on explicit admin
# trigger — never automatically — because a typo'd plan would waste budget
# hitting 404s. Each sector id from /api/sectors is plugged in where marked.
_BULK_SEED_PATHS = [
    # Direct list endpoints (some IDX APIs expose them on higher tiers)
    "/api/emiten",
    "/api/emiten/list",
    "/api/emiten/all",
    "/api/main/list",
    "/api/stocks/list",
    "/api/saham",
    # Sector-scoped enumerations (expanded at runtime per sector id)
    "/api/sectors/{sector_id}/companies",
    "/api/sectors/{sector_id}",
    "/api/sector/{sector_id}/emiten",
    "/api/sector/companies/{sector_alias}",
    "/api/emiten/sector/{sector_alias}",
]


async def fetch_sectors() -> list[dict]:
    """Returns the 22 IDX sectors from /api/sectors (free on BASIC). Used to
    expand {sector_id}/{sector_alias} path templates in bulk-seed."""
    raw = await _call("/api/sectors", ticker="SECTORS")
    if not raw:
        return []
    data = raw.get("data") or {}
    secs = data.get("data") if isinstance(data, dict) else None
    return secs if isinstance(secs, list) else []


async def bootstrap_catalog(
    include_trending: bool = True,
    try_bulk_endpoints: bool = True,
) -> dict:
    """Admin-triggered one-shot seed. Returns a clear report of which paths
    worked, which failed, and the catalog delta. Safe to re-run (idempotent
    via upsert). Always seeds trending first since that's free on BASIC."""
    import httpx as _httpx  # local alias — service already imports httpx
    report: dict = {
        "seeded_from_trending": 0,
        "attempts": [],
        "sectors_seen": 0,
        "count_before": 0,
        "count_after": 0,
        "requires_pro_plan": True,
    }
    report["count_before"] = await db.idx_catalog.count_documents({})

    # Always seed from trending first (BASIC plan, reuses cache)
    if include_trending:
        try:
            items = await get_trending() or []
            seeded = 0
            for it in items:
                if (it.get("type") or "").lower() != "saham":
                    continue
                sym = it.get("symbol")
                if not sym:
                    continue
                await upsert_catalog_entry(
                    symbol=sym,
                    name=it.get("name"),
                    source="trending",
                )
                seeded += 1
            report["seeded_from_trending"] = seeded
        except Exception as e:
            report["trending_error"] = str(e)

    if try_bulk_endpoints:
        # Get sectors first so we can expand templated paths
        sectors = await fetch_sectors()
        report["sectors_seen"] = len(sectors)

        # Flatten candidate paths — expand templates per sector
        paths_to_try: list[str] = []
        for p in _BULK_SEED_PATHS:
            if "{sector_id}" in p or "{sector_alias}" in p:
                for s in sectors:
                    sid = str(s.get("id") or "")
                    alias = s.get("alias1") or s.get("name") or ""
                    paths_to_try.append(
                        p.replace("{sector_id}", sid).replace("{sector_alias}", alias)
                    )
            else:
                paths_to_try.append(p)

        client = await _get_client()
        for path in paths_to_try:
            # Guard: don't probe if budget is tight (keep 20-req safety margin)
            if not await _budget_allows():
                report["attempts"].append({"path": path, "status": "skipped", "reason": "budget"})
                break
            await _rate_limited_sleep()
            try:
                r = await client.get(f"https://{_HOST}{path}")
                if r.status_code == 200:
                    parsed = _parse_generic_list(r.json())
                    if parsed:
                        upserted = 0
                        for row in parsed:
                            await upsert_catalog_entry(
                                symbol=row["symbol"],
                                name=row.get("name"),
                                sector=row.get("sector"),
                                source="bulk_seed",
                            )
                            upserted += 1
                        report["attempts"].append({
                            "path": path, "status": "ok", "rows": upserted,
                        })
                        report["requires_pro_plan"] = False
                    else:
                        report["attempts"].append({
                            "path": path, "status": "ok_but_empty", "preview": str(r.text)[:120],
                        })
                else:
                    report["attempts"].append({
                        "path": path, "status": f"http_{r.status_code}",
                    })
                await _increment_usage(ticker=path)
            except Exception as e:
                report["attempts"].append({"path": path, "status": "error", "error": str(e)[:120]})

    report["count_after"] = await db.idx_catalog.count_documents({})
    report["delta"] = report["count_after"] - report["count_before"]
    return report




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
    # Organic catalog growth — remembers this ticker for future searches.
    await upsert_catalog_entry(
        symbol=symbol,
        name=data.get("name"),
        sector=data.get("sector"),
        source="quote",
    )
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
    # Organic catalog growth — capture every saham we see trending.
    for it in items:
        if (it.get("type") or "").lower() != "saham":
            continue
        sym = it.get("symbol")
        if sym:
            await upsert_catalog_entry(symbol=sym, name=it.get("name"), source="trending")
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
    Prefers the local `idx_catalog` collection (grows organically from every
    successful RapidAPI call + bulk-seed bootstrap). Falls back to the cached
    trending feed when the local catalog is empty. Zero RapidAPI calls in
    steady state — pure MongoDB read."""
    local = await search_catalog(q="", limit=200)
    if local:
        return [{
            "symbol": row["symbol"],
            "name": row.get("name") or row["symbol"],
            "source": "rapidapi",
        } for row in local]
    # First-run fallback — trending feed seeds the catalog on first call
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
