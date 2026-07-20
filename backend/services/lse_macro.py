"""
London Strategic Edge macro series integration.

Fetches 4 macro series per analysis from LSE's free REST API:
  US tickers : Fed Funds Rate, CPI YoY, US 10Y yield, USD index
  IDX tickers: Bank Indonesia rate, Indonesia CPI YoY

Results are cached in-process for 12 hours (macro series update weekly
or less frequently -- hitting the API on every analysis is wasteful and
unnecessary). The cache is a simple dict keyed by (series, date_str)
so it survives across requests in the same process but resets on restart.

Environment variable:
  LSE_API_KEY -- free key from londonstrategicedge.com/data
                 If not set, macro context returns None and is omitted
                 from the analysis gracefully.
"""

import os
import logging
import httpx
from datetime import datetime, timezone, timedelta
from functools import lru_cache

logger = logging.getLogger(__name__)

# Confirmed live against a real key on 2026-07-20 -- the base path is
# /vault/, NOT /v1/ (the old value here 404'd on every request; this
# integration had apparently never been exercised against a real key
# before, since LSE_API_KEY was also unset in Railway until the same day).
LSE_BASE = "https://api.londonstrategicedge.com/vault"
_CACHE: dict = {}
_CACHE_TTL_HOURS = 12


def _cache_key(series: str) -> str:
    # Bucket by date so cache refreshes daily at minimum
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{series}:{day}"


def _get_cached(series: str):
    key = _cache_key(series)
    entry = _CACHE.get(key)
    if entry is None:
        return None
    value, ts = entry
    if (datetime.now(timezone.utc) - ts).total_seconds() > _CACHE_TTL_HOURS * 3600:
        del _CACHE[key]
        return None
    return value


def _set_cached(series: str, value):
    _CACHE[_cache_key(series)] = (value, datetime.now(timezone.utc))


def _fetch_series_latest(api_key: str, series: str) -> float | None:
    """Fetch the most recent value for a macro series from LSE REST API."""
    cached = _get_cached(series)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                f"{LSE_BASE}/series",
                params={"symbol": series, "limit": 3, "order": "desc"},
                headers={"x-api-key": api_key},
            )
            if resp.status_code != 200:
                logger.warning(f"LSE macro: {series} returned {resp.status_code}")
                return None
            # The endpoint returns a bare JSON array of {symbol, date, value}
            # rows -- NOT {"data": [...]}. .get("data", []) on a list would
            # AttributeError (silently caught below), which is why this
            # always returned None even with a valid key and the right URL.
            rows = resp.json()
            if not rows:
                return None
            latest = float(rows[0]["value"])
            _set_cached(series, latest)
            return latest
    except Exception as e:
        logger.warning(f"LSE macro fetch failed for {series}: {e}")
        return None


def _derive_rate_cycle(series_id: str, api_key: str) -> str:
    """
    Derive rate cycle from the last 3 data points.
    Returns: "hiking" | "cutting" | "holding"
    """
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                f"{LSE_BASE}/series",
                params={"symbol": series_id, "limit": 3, "order": "desc"},
                headers={"x-api-key": api_key},
            )
            if resp.status_code != 200:
                return "unknown"
            rows = resp.json()
            if len(rows) < 2:
                return "unknown"
            values = [float(r["value"]) for r in rows]
            # values[0] = most recent, values[1] = previous, values[2] = older
            delta_recent = values[0] - values[1]
            if len(values) > 2:
                delta_prior = values[1] - values[2]
            else:
                delta_prior = delta_recent
            if delta_recent > 0.1 or delta_prior > 0.1:
                return "hiking"
            elif delta_recent < -0.1 or delta_prior < -0.1:
                return "cutting"
            else:
                return "holding"
    except Exception as e:
        logger.warning(f"LSE rate cycle derivation failed: {e}")
        return "unknown"


def fetch_macro_context(is_idx: bool = False) -> dict | None:
    """
    Fetch macro regime context for the current analysis.

    Returns a dict suitable for inclusion in the AI prompt payload, or
    None if LSE_API_KEY is not configured (feature silently disabled).

    Fields:
        rate_cycle          "hiking" | "cutting" | "holding" | "unknown"
        policy_rate         current Fed Funds Rate (or BI rate for IDX)
        cpi_yoy             latest CPI year-on-year %
        yield_10y           current 10Y government bond yield %
        rate_sensitive_note human-readable regime note for the LLM
        market              "us" | "id"
        source              "London Strategic Edge"
        fetched_at          ISO timestamp
    """
    api_key = os.environ.get("LSE_API_KEY")
    if not api_key:
        return None

    # Symbols confirmed against the real /vault/catalog on 2026-07-20 --
    # the previous idx symbols here (id_bi_rate/id_cpi_yoy/id_10y) never
    # matched anything real; the catalog uses idbirate/idcpiy/ID10Y with no
    # underscores. fdtr and cpi_yoy (US) were already correct.
    if is_idx:
        rate_series = "idbirate"
        cpi_series = "idcpiy"
        yield_series = "ID10Y"
        market = "id"
    else:
        rate_series = "fdtr"
        cpi_series = "cpi_yoy"
        yield_series = "US10Y"
        market = "us"

    policy_rate = _fetch_series_latest(api_key, rate_series)
    cpi_yoy = _fetch_series_latest(api_key, cpi_series)
    yield_10y = _fetch_series_latest(api_key, yield_series)
    rate_cycle = _derive_rate_cycle(rate_series, api_key)

    # Build a plain-English regime note for the LLM
    if rate_cycle == "hiking":
        note = "Central bank is in a rate-HIKING cycle. Rate-sensitive sectors (Utilities, REITs, long-duration assets) face valuation headwinds. Growth stocks with high P/E multiples are typically pressured."
    elif rate_cycle == "cutting":
        note = "Central bank is in a rate-CUTTING cycle. Rate-sensitive sectors (Utilities, REITs, homebuilders, consumer discretionary) typically benefit. Bond-proxy stocks may re-rate upward."
    else:
        note = "Central bank is on HOLD. Macro tailwind/headwind from rates is neutral. Focus on company-specific fundamentals and earnings trajectory."

    if cpi_yoy is not None:
        if cpi_yoy > 4.0:
            note += f" CPI remains elevated at {cpi_yoy:.1f}% YoY, limiting near-term rate-cut room and compressing consumer purchasing power."
        elif cpi_yoy < 2.0:
            note += f" CPI is below target at {cpi_yoy:.1f}% YoY, supporting a dovish policy bias."

    return {
        "rate_cycle": rate_cycle,
        "policy_rate": policy_rate,
        "cpi_yoy": cpi_yoy,
        "yield_10y": yield_10y,
        "rate_sensitive_note": note,
        "market": market,
        "source": "London Strategic Edge",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
