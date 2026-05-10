"""NeuTools — real-data endpoints for StockHoroscope + StockTimeMachine.

Public, no-auth endpoints (mirrors anon_try.py philosophy). Both endpoints
are server-cached so we never hammer Yahoo:
  • /api/neutools/market-pulse        5-min in-process cache
  • /api/neutools/historical-return   30-min in-process cache, keyed by
                                       (ticker, from_date)
"""
from __future__ import annotations

import asyncio
import logging
import math
import time
from datetime import date, datetime, timezone
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

log = logging.getLogger(__name__)

router = APIRouter(prefix="/neutools", tags=["neutools"])

# ── 5-min cache for the market pulse ─────────────────────────────────
_PULSE_CACHE: dict = {"ts": 0.0, "data": None}
_PULSE_TTL_S = 300

# ── 30-min cache for historical returns ──────────────────────────────
_HIST_CACHE: dict = {}  # (ticker, from_date) -> (ts, payload)
_HIST_TTL_S = 1800

# Map the StockTimeMachine selector → real yfinance ticker
_TM_TICKER_MAP = {
    "bbca": "BBCA.JK",
    "ihsg": "^JKSE",
    "sp500": "^GSPC",
    "nvda": "NVDA",
    "apple": "AAPL",
}


def _nan_to_none(x):
    try:
        f = float(x)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────────────
# StockHoroscope — market pulse (VIX + S&P 5D + IHSG 5D)
# ─────────────────────────────────────────────────────────────────────
def _fetch_market_pulse_sync() -> dict:
    """Pull the three indices yfinance gives us essentially for free.
    Returns floats — VIX last close, S&P 5-day % change, IHSG 5-day % change.
    Any individual failure degrades gracefully to None for that field.
    """

    def _five_day_pct(symbol: str) -> Optional[float]:
        """5-day return = (latest close / close 5 trading days back - 1) * 100."""
        try:
            hist = yf.Ticker(symbol).history(period="10d", interval="1d", auto_adjust=False)
            if hist.empty or len(hist) < 6:
                return None
            latest = float(hist["Close"].iloc[-1])
            five_back = float(hist["Close"].iloc[-6])  # 5 trading days earlier
            if not five_back:
                return None
            return round((latest / five_back - 1) * 100, 2)
        except Exception as e:
            log.warning("market_pulse: %s 5d failed: %s", symbol, e)
            return None

    def _vix_last() -> Optional[float]:
        try:
            hist = yf.Ticker("^VIX").history(period="5d", interval="1d", auto_adjust=False)
            if hist.empty:
                return None
            return round(float(hist["Close"].iloc[-1]), 2)
        except Exception as e:
            log.warning("market_pulse: ^VIX last failed: %s", e)
            return None

    return {
        "vix": _vix_last(),
        "sp500_5d_pct": _five_day_pct("^GSPC"),
        "ihsg_5d_pct": _five_day_pct("^JKSE"),
        "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


class MarketPulse(BaseModel):
    vix: Optional[float]
    sp500_5d_pct: Optional[float]
    ihsg_5d_pct: Optional[float]
    as_of: str
    cached: bool


@router.get("/market-pulse", response_model=MarketPulse)
async def market_pulse():
    """Real VIX + S&P 500 + IHSG 5-day performance, server-cached for 5 min.
    Powers the StockHoroscope reading. No auth required.
    """
    now = time.time()
    if _PULSE_CACHE["data"] and (now - _PULSE_CACHE["ts"]) < _PULSE_TTL_S:
        return {**_PULSE_CACHE["data"], "cached": True}

    try:
        # Run the (blocking) yfinance calls off the event loop with a hard ceiling.
        data = await asyncio.wait_for(asyncio.to_thread(_fetch_market_pulse_sync), timeout=12)
    except asyncio.TimeoutError:
        log.warning("market_pulse: yfinance timed out after 12s")
        # Serve stale cache if we have any — otherwise 503.
        if _PULSE_CACHE["data"]:
            return {**_PULSE_CACHE["data"], "cached": True}
        raise HTTPException(status_code=503, detail="Market data is slow right now. Please try again in a minute.")
    except Exception as e:
        log.exception("market_pulse: unexpected failure")
        if _PULSE_CACHE["data"]:
            return {**_PULSE_CACHE["data"], "cached": True}
        raise HTTPException(status_code=503, detail="Market data unavailable.") from e

    # Only cache if AT LEAST ONE field came back — otherwise this is a network outage,
    # not a real reading, and we'd rather retry on the next request.
    if any(v is not None for v in (data["vix"], data["sp500_5d_pct"], data["ihsg_5d_pct"])):
        _PULSE_CACHE["data"] = data
        _PULSE_CACHE["ts"] = now
    return {**data, "cached": False}


# ─────────────────────────────────────────────────────────────────────
# StockTimeMachine — real historical return
# ─────────────────────────────────────────────────────────────────────
def _fetch_historical_return_sync(yf_ticker: str, from_date: date) -> dict:
    """Pull adj-close at from_date and today, return % change + years."""
    # Pad the start by a few days to handle weekends/holidays.
    hist = yf.Ticker(yf_ticker).history(
        start=from_date.isoformat(),
        interval="1d",
        auto_adjust=True,  # use total-return-equivalent close
    )
    if hist.empty:
        raise ValueError(f"no price data for {yf_ticker} from {from_date}")
    start_close = float(hist["Close"].iloc[0])
    end_close = float(hist["Close"].iloc[-1])
    start_idx_date = hist.index[0].date()
    end_idx_date = hist.index[-1].date()
    years = max(0.001, (end_idx_date - start_idx_date).days / 365.25)
    total_pct = (end_close / start_close - 1) * 100
    annualised_pct = (math.pow(end_close / start_close, 1 / years) - 1) * 100
    return {
        "yf_ticker": yf_ticker,
        "start_date": start_idx_date.isoformat(),
        "start_close": _nan_to_none(start_close),
        "end_date": end_idx_date.isoformat(),
        "end_close": _nan_to_none(end_close),
        "total_return_pct": round(total_pct, 2),
        "annualised_return_pct": round(annualised_pct, 2),
        "years": round(years, 2),
    }


class HistoricalReturn(BaseModel):
    yf_ticker: str
    start_date: str
    start_close: Optional[float]
    end_date: str
    end_close: Optional[float]
    total_return_pct: float
    annualised_return_pct: float
    years: float
    cached: bool


@router.get("/historical-return", response_model=HistoricalReturn)
async def historical_return(
    ticker: str = Query(..., description="One of: bbca, ihsg, sp500, nvda, apple"),
    from_date: str = Query(..., alias="from", description="YYYY-MM-DD"),
):
    """Real historical return from `from_date` to today's close.
    Used by StockTimeMachine to replace hardcoded annual-rate approximations.
    """
    tk = (ticker or "").lower().strip()
    yf_ticker = _TM_TICKER_MAP.get(tk)
    if not yf_ticker:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown ticker '{ticker}'. Use one of: {sorted(_TM_TICKER_MAP)}",
        )

    try:
        from_dt = date.fromisoformat(from_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="from must be YYYY-MM-DD")

    today = date.today()
    if from_dt >= today:
        raise HTTPException(status_code=400, detail="from must be in the past")
    if from_dt.year < 1990:
        raise HTTPException(status_code=400, detail="Date too far in the past (min 1990).")

    cache_key = (yf_ticker, from_dt.isoformat())
    now = time.time()
    hit = _HIST_CACHE.get(cache_key)
    if hit and (now - hit[0]) < _HIST_TTL_S:
        return {**hit[1], "cached": True}

    try:
        payload = await asyncio.wait_for(
            asyncio.to_thread(_fetch_historical_return_sync, yf_ticker, from_dt),
            timeout=15,
        )
    except asyncio.TimeoutError:
        if hit:
            return {**hit[1], "cached": True}
        raise HTTPException(status_code=503, detail="Historical data is slow right now. Try again in a minute.")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.exception("historical_return: unexpected failure")
        if hit:
            return {**hit[1], "cached": True}
        raise HTTPException(status_code=503, detail="Historical data unavailable.") from e

    _HIST_CACHE[cache_key] = (now, payload)
    return {**payload, "cached": False}
