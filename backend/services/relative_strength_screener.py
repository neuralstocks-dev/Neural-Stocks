"""Relative-strength screener — the first (and currently only) scheduled-
agent screener type. See HANDOFF.md for the full product spec this
implements.

A ticker is a "hit" when ALL of the following hold:
  1. Some daily CLOSE in the trailing 10 trading days sits within 1% of the
     ticker's true all-time-high close.
  2. On that SAME trading day, SPY closed down >= 0.5% (same-day divergence
     — the stock held up while the market fell that specific day, not two
     unrelated events in a loose window).
  3. At least 2 of the last 4 reported quarters both beat consensus EPS AND
     saw analysts raise their next-quarter EPS estimate in the days after
     the print (the guidance-beat proxy). When that revision data is
     entirely unavailable for a ticker (Finnhub's free tier can't reach
     /stock/eps-estimate, or we simply haven't accumulated enough of our
     own snapshot history yet — see finnhub.get_estimate_revision_beat),
     this degrades to an EPS-beat-only threshold. `guidance_checked` on
     each hit and `guidance_proxy_available` on the overall result make
     this visible rather than silently treating "unknown" as "no beat" or
     silently dropping the requirement.
  4. Market cap > $10B.
"""
from __future__ import annotations

import asyncio
import logging

import yfinance as yf

from core.security import iso, now_utc
from services import finnhub, ticker_universe
from services.yfinance_svc import _yf_fundamentals_sync

logger = logging.getLogger(__name__)

ATH_PROXIMITY_PCT = 0.01       # within 1% of the all-time-high close
TRAILING_DAYS = 10             # trading days to scan for a near-ATH close
MARKET_DOWN_PCT = 0.005        # SPY close-to-close down >= 0.5%
MIN_MCAP = 10_000_000_000      # $10B
MIN_QUARTERS_BEAT = 2
QUARTERS_LOOKBACK = 4
MAX_CONCURRENCY = 8            # bounded so a full-universe run doesn't hammer yfinance


async def _fetch_history_df(ticker: str, period: str = "max"):
    """Retry-wrapped yfinance history fetch. Deliberately does NOT reuse
    yfinance_svc._with_retry — that helper does `if last_result:` on the
    return value, which raises on a multi-row DataFrame (pandas disallows
    bool() on a DataFrame). Returns None on failure/empty rather than
    raising, so a single bad ticker never aborts the whole screen."""
    def _fetch():
        return yf.Ticker(ticker).history(period=period, interval="1d", auto_adjust=True)

    last_exc = None
    for attempt in range(3):
        try:
            df = await asyncio.to_thread(_fetch)
            if df is not None and not df.empty:
                if df.index.tz is not None:
                    df.index = df.index.tz_localize(None)
                return df
            last_exc = None
        except Exception as e:
            last_exc = e
        if attempt < 2:
            await asyncio.sleep(0.6 * (2 ** attempt))
    if last_exc:
        logger.info("screener: history fetch failed for %s: %s", ticker, last_exc)
    return None


async def _fetch_spy_context() -> dict:
    """{date_str: close_to_close_pct_change} for SPY over the trailing ~3mo,
    enough to cover TRAILING_DAYS of trading days with margin."""
    df = await _fetch_history_df("SPY", period="3mo")
    if df is None or df.empty:
        return {}
    closes = df["Close"]
    out = {}
    for i in range(1, len(closes)):
        prev = closes.iloc[i - 1]
        if not prev:
            continue
        date_str = closes.index[i].strftime("%Y-%m-%d")
        out[date_str] = float((closes.iloc[i] - prev) / prev)
    return out


def _find_divergence_hit(hist_df, spy_pct_by_date: dict) -> dict | None:
    """Scans the trailing TRAILING_DAYS closes, most-recent-first, for the
    first day that is both near-ATH and a same-day SPY divergence day."""
    closes = hist_df["Close"]
    if closes.empty:
        return None
    ath = float(closes.max())
    if ath <= 0:
        return None
    trailing = closes.iloc[-TRAILING_DAYS:]
    for ts in reversed(trailing.index):
        price = float(trailing.loc[ts])
        pct_from_ath = (price - ath) / ath  # always <= 0
        if pct_from_ath < -ATH_PROXIMITY_PCT:
            continue
        date_str = ts.strftime("%Y-%m-%d")
        spy_pct = spy_pct_by_date.get(date_str)
        if spy_pct is not None and spy_pct <= -MARKET_DOWN_PCT:
            return {
                "ath_price": round(ath, 4),
                "pct_from_ath": round(pct_from_ath * 100, 2),
                "divergence_date": date_str,
            }
    return None


async def _check_earnings_and_guidance(ticker: str) -> dict:
    surprises = await finnhub.get_earnings_surprises(ticker, limit=QUARTERS_LOOKBACK)
    if not surprises:
        return {"passes": False, "guidance_checked": False, "quarters_beat": 0}

    eps_only_beat = 0
    full_beat = 0
    any_guidance_checked = False
    for q in surprises:
        if not q.get("beat"):
            continue
        eps_only_beat += 1
        guidance = await finnhub.get_estimate_revision_beat(
            ticker, q.get("period"), q.get("quarter"), q.get("year"),
        )
        if guidance is not None:
            any_guidance_checked = True
            if guidance:
                full_beat += 1

    if any_guidance_checked:
        quarters_beat = full_beat
    else:
        quarters_beat = eps_only_beat  # degraded fallback -- EPS-beat-only

    return {
        "passes": quarters_beat >= MIN_QUARTERS_BEAT,
        "guidance_checked": any_guidance_checked,
        "quarters_beat": quarters_beat,
    }


async def _get_market_cap(ticker: str) -> float | None:
    fundamentals = await asyncio.to_thread(_yf_fundamentals_sync, ticker)
    mcap = (fundamentals or {}).get("marketCap")
    return float(mcap) if mcap else None


async def _screen_ticker(ticker: str, spy_pct_by_date: dict, sem: asyncio.Semaphore) -> dict | None:
    async with sem:
        # Cheapest, most-selective checks first so we don't burn Finnhub
        # calls on tickers that fail on price action alone.
        hist = await _fetch_history_df(ticker, period="max")
        if hist is None:
            return None
        divergence = _find_divergence_hit(hist, spy_pct_by_date)
        if divergence is None:
            return None
        mcap = await _get_market_cap(ticker)
        if not mcap or mcap <= MIN_MCAP:
            return None
        earnings = await _check_earnings_and_guidance(ticker)
        if not earnings["passes"]:
            return None
        # Opportunistic: only reached for tickers that already cleared the
        # price+mcap gates (a small slice of the universe), so this doesn't
        # meaningfully add to the run's Finnhub call volume, and it's what
        # lets get_estimate_revision_beat resolve real answers over time.
        try:
            await finnhub.snapshot_eps_estimate(ticker)
        except Exception:
            pass
        return {
            "ticker": ticker,
            "ath_price": divergence["ath_price"],
            "pct_from_ath": divergence["pct_from_ath"],
            "divergence_date": divergence["divergence_date"],
            "quarters_beat": earnings["quarters_beat"],
            "guidance_checked": earnings["guidance_checked"],
            "mcap": mcap,
        }


async def run_screen() -> dict:
    universe = await ticker_universe.get_universe()
    spy_pct_by_date = await _fetch_spy_context()
    if not spy_pct_by_date:
        logger.warning("screener: SPY context unavailable -- aborting run")
        return {
            "hits": [],
            "universe_size": len(universe),
            "guidance_proxy_available": False,
            "checked_at": iso(now_utc()),
            "error": "spy_context_unavailable",
        }

    sem = asyncio.Semaphore(MAX_CONCURRENCY)
    results = await asyncio.gather(
        *[_screen_ticker(t, spy_pct_by_date, sem) for t in universe],
        return_exceptions=True,
    )

    hits = []
    any_guidance_checked = False
    for r in results:
        if isinstance(r, Exception) or r is None:
            continue
        hits.append(r)
        if r.get("guidance_checked"):
            any_guidance_checked = True
    hits.sort(key=lambda h: h["pct_from_ath"], reverse=True)

    return {
        "hits": hits,
        "universe_size": len(universe),
        # Whether at least one hit's quarters_beat reflects a real guidance
        # check rather than the EPS-beat-only fallback. Per-hit detail
        # lives in hit["guidance_checked"].
        "guidance_proxy_available": any_guidance_checked,
        "checked_at": iso(now_utc()),
    }
