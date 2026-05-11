"""Yahoo Finance unified ticker search.

Single source of truth for typeahead across ALL exchanges (US, IDX, ASX, LSE,
TSX, HKG, etc.) — instead of guessing locality from the symbol shape and
appending `.JK` aggressively as the old heuristic did.

We use yfinance's `Search` class because the public query2 endpoint rate-limits
shared cloud IPs aggressively (429). yfinance handles cookies + crumbs and is
the same library the rest of NeuTools / NSI uses, so we get free retry/backoff
and zero extra dependencies.

Per-query results cached for 5 min in-process. Cache miss runs in a worker
thread (yfinance is sync-only) with a 6s wall-clock budget.

Exchange code normalisation (Yahoo gives us 2-3 letter codes like NMS/NGM/JKT)
maps to a friendlier display string used by the AddStockModal.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import yfinance as yf

log = logging.getLogger(__name__)

# 5-min in-process cache keyed by lowercase query
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_TTL_S = 300

# Yahoo exchange codes → friendly display labels
_EXCHANGE_MAP = {
    # United States
    "NMS": "NASDAQ", "NGM": "NASDAQ", "NCM": "NASDAQ", "NAS": "NASDAQ",
    "NYQ": "NYSE", "NYE": "NYSE",
    "PCX": "NYSE Arca", "ASE": "NYSE American", "BTS": "BATS",
    "PNK": "OTC", "OQX": "OTC", "OEM": "OTC",
    # Indonesia
    "JKT": "IDX",
    # Australia
    "ASX": "ASX",
    # Canada
    "TOR": "TSX", "TSX": "TSX",
    # UK
    "LSE": "LSE",
    # Hong Kong
    "HKG": "HKEX",
    # Singapore
    "SES": "SGX",
    # Frankfurt / Xetra
    "GER": "XETRA", "FRA": "XETRA",
    # Mexico
    "MEX": "BMV",
    # Tokyo
    "JPX": "TSE",
}

_ACCEPT_QUOTE_TYPES = {"EQUITY", "ETF"}


def _normalise_exchange(code: Optional[str], disp: Optional[str] = None) -> str:
    if disp and isinstance(disp, str) and disp.strip():
        # Yahoo often already provides a clean human label via exchDisp
        return disp.strip()
    if not code:
        return "?"
    return _EXCHANGE_MAP.get(code, code)


def _search_sync(query: str) -> list[dict]:
    """Blocking yfinance.Search call — invoke via asyncio.to_thread."""
    try:
        s = yf.Search(query, max_results=15, news_count=0)
        return s.quotes or []
    except Exception as e:
        log.warning("yahoo_search.Search failed for %r: %s", query, e)
        return []


async def search(query: str, limit: int = 12) -> list[dict]:
    """Live search across all exchanges via yfinance's Search facade.

    Args:
        query: typeahead string (≥ 1 char, callers should gate on ≥ 2).
        limit: max items to return (1-25).

    Returns rows shaped like our existing /api/stocks/search rows:
        {ticker, name, exchange, category, source}
    """
    q = (query or "").strip()
    if not q:
        return []
    limit = max(1, min(limit, 25))

    cache_key = q.lower()
    now = time.time()
    hit = _CACHE.get(cache_key)
    if hit and (now - hit[0]) < _TTL_S:
        return hit[1][:limit]

    try:
        raw = await asyncio.wait_for(asyncio.to_thread(_search_sync, q), timeout=6.0)
    except (asyncio.TimeoutError, Exception) as e:
        log.warning("yahoo_search: %r timed out/failed: %s", q, e)
        return []

    out: list[dict] = []
    for it in raw:
        qt = it.get("quoteType")
        if qt not in _ACCEPT_QUOTE_TYPES:
            continue
        sym = (it.get("symbol") or "").strip()
        if not sym:
            continue
        name = (it.get("shortname") or it.get("longname") or sym).strip()
        out.append({
            "ticker": sym,
            "name": name,
            "exchange": _normalise_exchange(it.get("exchange"), it.get("exchDisp")),
            "category": "etf" if qt == "ETF" else "other",
            "source": "yahoo",
        })

    # Rank: exact prefix matches first (case-insensitive), then Yahoo's order
    qu = q.upper()
    out.sort(key=lambda r: (0 if r["ticker"].upper().startswith(qu) else 1))

    _CACHE[cache_key] = (now, out)
    return out[:limit]


def clear_cache():  # exposed for tests
    _CACHE.clear()
