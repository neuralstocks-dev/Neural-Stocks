"""Live Neulab backtest engine.

Option D of the backtest suite: walks a single user's verdict history and
simulates an equal-weight, long-only, 30-day-timeout portfolio that would have
resulted from following every BUY/SELL verdict as they arrived.

Design notes:
  * Pure-Python walk — no pandas-heavy operations on the hot path.
  * Uses daily-close prices from yfinance as the "fillable" trade price.
  * Entries: first trading day close AT OR AFTER the verdict timestamp.
  * Exits: SELL verdict arrives OR 30 calendar days elapse, whichever first.
  * Position sizing: when a BUY arrives, the open cash is split equally
    across all positions that will be open at that moment (conservative —
    avoids look-ahead on how many positions you'll end up holding).
  * Benchmarks: SPY for US-majority portfolios, ^JKSE when >50% of trades
    are IDX (.JK) tickers.
  * v1 ignores dividends, fees, and slippage — disclosed in the UI disclaimer.

Results are cached in `db.backtest_runs` keyed on user_id+"live" with a
6-hour TTL-style freshness check. A new verdict by the same user invalidates
the cache so the chart refreshes next fetch.
"""
from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from core.db import db
from core.security import iso, now_utc
from services.yfinance_svc import _yf_history_sync

logger = logging.getLogger(__name__)

# ─── Strategy parameters (v1 fixed) ──────────────────────────────────────
INITIAL_CASH = 10_000.0              # notional dollars
MAX_HOLD_DAYS = 30                   # force-close after this many calendar days
CACHE_MAX_AGE_SECONDS = 6 * 3600     # 6 hours
MIN_VERDICTS_REQUIRED = 3            # below this, show empty-state
HISTORY_BUFFER_DAYS = 60             # fetch N extra days beyond last verdict for exit prices

# ─── Helper fns ──────────────────────────────────────────────────────────

def _parse_iso(x: Any) -> datetime | None:
    if not x:
        return None
    try:
        d = datetime.fromisoformat(str(x).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        return None


def _is_idx(ticker: str) -> bool:
    return (ticker or "").upper().endswith(".JK")


def _choose_benchmark(verdicts: list[dict]) -> str:
    if not verdicts:
        return "SPY"
    idx_count = sum(1 for v in verdicts if _is_idx(v.get("ticker", "")))
    return "^JKSE" if idx_count * 2 > len(verdicts) else "SPY"


def _date_key(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _price_on_or_after(history: dict[str, float], target: datetime, look_ahead_days: int = 7) -> tuple[str, float] | None:
    """Given a date→close map, return the (first key, close) at or after target.
    Returns None if no price available within `look_ahead_days`."""
    target_date = target.date()
    for i in range(look_ahead_days + 1):
        key = (target_date + timedelta(days=i)).isoformat()
        if key in history:
            return key, history[key]
    return None


def _price_on_or_before(history: dict[str, float], target: datetime, look_back_days: int = 7) -> tuple[str, float] | None:
    target_date = target.date()
    for i in range(look_back_days + 1):
        key = (target_date - timedelta(days=i)).isoformat()
        if key in history:
            return key, history[key]
    return None


def _fetch_history_window(ticker: str, period: str = "2y") -> dict[str, float]:
    """Blocking yfinance call — must be offloaded to a thread by callers."""
    raw = _yf_history_sync(ticker, period=period, interval="1d")
    out: dict[str, float] = {}
    for row in raw:
        # date is ISO timestamp; normalize to YYYY-MM-DD
        d = row.get("date", "")[:10]
        close = row.get("close")
        if d and close is not None:
            out[d] = float(close)
    return out


async def _gather_histories(tickers: set[str], period: str = "2y") -> dict[str, dict[str, float]]:
    """Fetch daily close maps for a set of tickers concurrently via thread pool."""
    unique = sorted(tickers)
    tasks = [asyncio.to_thread(_fetch_history_window, t, period) for t in unique]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: dict[str, dict[str, float]] = {}
    for t, r in zip(unique, results):
        if isinstance(r, dict) and r:
            out[t] = r
        else:
            logger.warning(f"backtest: failed to fetch history for {t}: {r if isinstance(r, Exception) else 'empty'}")
            out[t] = {}
    return out


# ─── Core simulation ─────────────────────────────────────────────────────

def _simulate(verdicts: list[dict], histories: dict[str, dict[str, float]]) -> dict:
    """Walk verdicts chronologically, maintain open positions, produce trade
    log + equity curve.

    Returns a dict with: trades[], equity_curve[{date, portfolio_value}],
    metrics{…}, strategy_note.
    """
    cash = INITIAL_CASH
    # ticker -> {entry_date, entry_price, shares, entry_verdict_id}
    open_positions: dict[str, dict] = {}
    trades: list[dict] = []

    # Build a per-day timeline of actions. We iterate calendar days across
    # the window so we can (a) process verdict events and (b) apply the
    # 30-day force-close rule on non-verdict days.
    if not verdicts:
        return {"trades": [], "equity_curve": [], "metrics": {}, "strategy_note": ""}

    first_date = _parse_iso(verdicts[0]["created_at"]).date()
    # End the simulation today (or the max exit day + buffer)
    end_date = datetime.now(timezone.utc).date()

    # Group verdicts by date
    events_by_day: dict[str, list[dict]] = {}
    for v in verdicts:
        d = _parse_iso(v["created_at"])
        if not d:
            continue
        events_by_day.setdefault(d.date().isoformat(), []).append(v)

    # Equity curve: for each day with >=1 open position, mark-to-market.
    # Start the curve on the first verdict day.
    cursor = first_date
    equity_curve: list[dict] = []

    def _mark_to_market(day_iso: str) -> float:
        """Return total portfolio value on this date = cash + Σ(shares × close)."""
        total = cash
        for tkr, pos in open_positions.items():
            hist = histories.get(tkr, {})
            # Walk backward up to 7 days to find a close (handle weekends/holidays)
            close = None
            for i in range(8):
                ymd = (datetime.fromisoformat(day_iso).date() - timedelta(days=i)).isoformat()
                if ymd in hist:
                    close = hist[ymd]
                    break
            if close is None:
                close = pos["entry_price"]  # fallback — no data yet
            total += pos["shares"] * close
        return total

    while cursor <= end_date:
        cursor_iso = cursor.isoformat()
        cursor_dt = datetime.combine(cursor, datetime.min.time(), tzinfo=timezone.utc)

        # ─ 1. Force-close positions that have hit the 30-day timeout
        force_exits = []
        for tkr, pos in list(open_positions.items()):
            entry_dt = pos["entry_date"]
            age_days = (cursor - entry_dt).days
            if age_days >= MAX_HOLD_DAYS:
                force_exits.append(tkr)
        for tkr in force_exits:
            pos = open_positions.pop(tkr)
            hist = histories.get(tkr, {})
            exit_info = _price_on_or_after(hist, cursor_dt, look_ahead_days=5)
            if not exit_info:
                exit_info = _price_on_or_before(hist, cursor_dt, look_back_days=5)
            if not exit_info:
                exit_price = pos["entry_price"]
                exit_date = cursor_iso
            else:
                exit_date, exit_price = exit_info
            pnl_abs = (exit_price - pos["entry_price"]) * pos["shares"]
            cash += pos["shares"] * exit_price
            trades.append({
                "ticker": tkr,
                "entry_at": pos["entry_date"].isoformat(),
                "entry_price": round(pos["entry_price"], 4),
                "entry_verdict_id": pos["entry_verdict_id"],
                "exit_at": exit_date,
                "exit_price": round(exit_price, 4),
                "exit_reason": "timeout_30d",
                "shares": round(pos["shares"], 6),
                "pnl_abs": round(pnl_abs, 4),
                "pnl_pct": round(((exit_price - pos["entry_price"]) / pos["entry_price"]) * 100, 3) if pos["entry_price"] else 0,
                "hold_days": age_days,
            })

        # ─ 2. Process verdict events on this day
        for v in events_by_day.get(cursor_iso, []):
            ticker = (v.get("ticker") or "").upper()
            rec = (v.get("recommendation") or "").upper()
            verdict_id = v.get("id")
            verdict_dt = _parse_iso(v["created_at"]) or cursor_dt
            hist = histories.get(ticker, {})

            if rec == "BUY":
                if ticker in open_positions:
                    continue  # already long, no pyramiding
                price_info = _price_on_or_after(hist, verdict_dt)
                if not price_info:
                    continue  # no tradable price — skip
                entry_date_iso, entry_price = price_info
                if entry_price <= 0:
                    continue
                # Equal-weight across {current open + new} to avoid over-allocating
                open_count = len(open_positions) + 1
                alloc_cash = cash / open_count if open_count else cash
                if alloc_cash < 10:
                    continue  # not enough capital
                shares = alloc_cash / entry_price
                cash -= alloc_cash
                open_positions[ticker] = {
                    "entry_date": datetime.fromisoformat(entry_date_iso).date(),
                    "entry_price": entry_price,
                    "shares": shares,
                    "entry_verdict_id": verdict_id,
                }

            elif rec == "SELL":
                if ticker not in open_positions:
                    continue  # no short-selling in v1
                pos = open_positions.pop(ticker)
                price_info = _price_on_or_after(hist, verdict_dt)
                if not price_info:
                    price_info = _price_on_or_before(hist, verdict_dt, look_back_days=5)
                if not price_info:
                    exit_price = pos["entry_price"]
                    exit_date_iso = cursor_iso
                else:
                    exit_date_iso, exit_price = price_info
                pnl_abs = (exit_price - pos["entry_price"]) * pos["shares"]
                cash += pos["shares"] * exit_price
                entry_d = pos["entry_date"]
                exit_d = datetime.fromisoformat(exit_date_iso).date()
                trades.append({
                    "ticker": ticker,
                    "entry_at": entry_d.isoformat(),
                    "entry_price": round(pos["entry_price"], 4),
                    "entry_verdict_id": pos["entry_verdict_id"],
                    "exit_at": exit_date_iso,
                    "exit_price": round(exit_price, 4),
                    "exit_reason": "sell_verdict",
                    "shares": round(pos["shares"], 6),
                    "pnl_abs": round(pnl_abs, 4),
                    "pnl_pct": round(((exit_price - pos["entry_price"]) / pos["entry_price"]) * 100, 3) if pos["entry_price"] else 0,
                    "hold_days": (exit_d - entry_d).days,
                })
            # HOLD or unknown → no action

        # ─ 3. Mark to market (only record a curve point if we have any history yet)
        equity_curve.append({
            "date": cursor_iso,
            "portfolio_value": round(_mark_to_market(cursor_iso), 4),
        })
        cursor += timedelta(days=1)

    # ─ 4. Force-close any still-open positions at end-of-window
    for tkr, pos in list(open_positions.items()):
        hist = histories.get(tkr, {})
        info = _price_on_or_before(hist, datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc), look_back_days=10)
        if not info:
            exit_price, exit_date_iso = pos["entry_price"], end_date.isoformat()
        else:
            exit_date_iso, exit_price = info
        pnl_abs = (exit_price - pos["entry_price"]) * pos["shares"]
        cash += pos["shares"] * exit_price
        trades.append({
            "ticker": tkr,
            "entry_at": pos["entry_date"].isoformat(),
            "entry_price": round(pos["entry_price"], 4),
            "entry_verdict_id": pos["entry_verdict_id"],
            "exit_at": exit_date_iso,
            "exit_price": round(exit_price, 4),
            "exit_reason": "window_end",
            "shares": round(pos["shares"], 6),
            "pnl_abs": round(pnl_abs, 4),
            "pnl_pct": round(((exit_price - pos["entry_price"]) / pos["entry_price"]) * 100, 3) if pos["entry_price"] else 0,
            "hold_days": (end_date - pos["entry_date"]).days,
            "open_at_window_end": True,
        })

    # ─ 5. Metrics
    trades.sort(key=lambda t: t["exit_at"])
    closed_trades = [t for t in trades if not t.get("open_at_window_end")]
    wins = [t for t in trades if t["pnl_pct"] > 0]

    portfolio_end = equity_curve[-1]["portfolio_value"] if equity_curve else INITIAL_CASH
    total_return_pct = ((portfolio_end - INITIAL_CASH) / INITIAL_CASH) * 100 if INITIAL_CASH else 0.0

    # Max drawdown
    peak = INITIAL_CASH
    max_dd = 0.0
    for pt in equity_curve:
        pv = pt["portfolio_value"]
        if pv > peak:
            peak = pv
        dd = (pv - peak) / peak * 100 if peak else 0
        if dd < max_dd:
            max_dd = dd

    metrics = {
        "initial_cash": INITIAL_CASH,
        "final_value": round(portfolio_end, 2),
        "total_return_pct": round(total_return_pct, 2),
        "trade_count": len(trades),
        "closed_trade_count": len(closed_trades),
        "win_count": len(wins),
        "win_rate_pct": round((len(wins) / len(trades)) * 100, 1) if trades else None,
        "avg_hold_days": round(sum(t["hold_days"] for t in trades) / len(trades), 1) if trades else None,
        "best_trade_pct": round(max((t["pnl_pct"] for t in trades), default=0), 2),
        "worst_trade_pct": round(min((t["pnl_pct"] for t in trades), default=0), 2),
        "max_drawdown_pct": round(max_dd, 2),
    }

    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "metrics": metrics,
        "strategy_note": (
            f"Long-only, equal-weight across open positions. Entries taken at the "
            f"next available daily close after each BUY verdict. Exits on matching "
            f"SELL or after {MAX_HOLD_DAYS} calendar days, whichever first. "
            f"No fees, slippage, or dividends. Starting capital ${INITIAL_CASH:,.0f}."
        ),
    }


def _compute_benchmark_curve(
    history: dict[str, float],
    equity_dates: list[str],
    first_date: str,
) -> list[dict]:
    """Return a time-aligned benchmark curve normalized to INITIAL_CASH on
    the first equity-curve date. Forward-fills through weekends."""
    if not history or not equity_dates:
        return []
    # Find seed price on or after first_date
    seed_price = None
    first_d = datetime.fromisoformat(first_date).date()
    for i in range(10):
        ymd = (first_d + timedelta(days=i)).isoformat()
        if ymd in history:
            seed_price = history[ymd]
            break
    if not seed_price or seed_price <= 0:
        return []
    out = []
    last_close = seed_price
    for d in equity_dates:
        ymd = d
        if ymd in history:
            last_close = history[ymd]
        # Otherwise forward-fill with last_close (weekends/holidays)
        out.append({
            "date": ymd,
            "benchmark_value": round(INITIAL_CASH * (last_close / seed_price), 4),
        })
    return out


# ─── Public API: entry point ─────────────────────────────────────────────

async def build_live_backtest(user_id: str, *, force: bool = False) -> dict:
    """Return the cached backtest if fresh, else recompute and save."""
    existing = await db.backtest_runs.find_one(
        {"user_id": user_id, "kind": "live"}, {"_id": 0}
    )
    if existing and not force:
        gen_at = _parse_iso(existing.get("generated_at"))
        if gen_at:
            age = (datetime.now(timezone.utc) - gen_at).total_seconds()
            # Also invalidate if a new analysis has been created since
            last_analysis = await db.analyses.find_one(
                {"user_id": user_id}, sort=[("created_at", -1)], projection={"created_at": 1}
            )
            last_at = _parse_iso(last_analysis.get("created_at")) if last_analysis else None
            if age < CACHE_MAX_AGE_SECONDS and (last_at is None or last_at <= gen_at):
                return existing

    # ─ Fresh compute path
    verdicts = await db.analyses.find(
        {"user_id": user_id},
        {"_id": 0, "id": 1, "ticker": 1, "recommendation": 1, "confidence_score": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(2000)

    # Filter to valid BUY/SELL/HOLD with ticker + timestamp
    verdicts = [
        v for v in verdicts
        if v.get("ticker") and v.get("recommendation") and v.get("created_at")
    ]

    if len(verdicts) < MIN_VERDICTS_REQUIRED:
        result = {
            "kind": "live",
            "user_id": user_id,
            "generated_at": iso(now_utc()),
            "empty": True,
            "verdict_count": len(verdicts),
            "min_required": MIN_VERDICTS_REQUIRED,
            "trades": [],
            "equity_curve": [],
            "benchmark_curve": [],
            "benchmark_ticker": None,
            "metrics": {},
            "strategy_note": "",
        }
        await db.backtest_runs.update_one(
            {"user_id": user_id, "kind": "live"},
            {"$set": result},
            upsert=True,
        )
        return result

    tickers_needed = {v["ticker"].upper() for v in verdicts}
    benchmark = _choose_benchmark(verdicts)
    tickers_needed.add(benchmark)

    # Pick an appropriate yfinance window based on oldest verdict
    first_verdict_dt = _parse_iso(verdicts[0]["created_at"])
    span_days = (now_utc() - first_verdict_dt).days if first_verdict_dt else 90
    period = "1y" if span_days < 330 else "2y" if span_days < 720 else "5y"

    histories = await _gather_histories(tickers_needed, period=period)

    # Run the sim (pure CPU — small, safe to stay on the event loop)
    sim = _simulate(verdicts, histories)

    # Benchmark alignment
    bench_hist = histories.get(benchmark, {})
    equity_dates = [p["date"] for p in sim["equity_curve"]]
    first_date = equity_dates[0] if equity_dates else (first_verdict_dt.date().isoformat() if first_verdict_dt else "")
    benchmark_curve = _compute_benchmark_curve(bench_hist, equity_dates, first_date)

    bench_return_pct = None
    alpha_pct = None
    if benchmark_curve:
        bench_end = benchmark_curve[-1]["benchmark_value"]
        bench_return_pct = ((bench_end - INITIAL_CASH) / INITIAL_CASH) * 100
        alpha_pct = sim["metrics"].get("total_return_pct", 0.0) - bench_return_pct

    sim["metrics"]["benchmark_ticker"] = benchmark
    sim["metrics"]["benchmark_return_pct"] = round(bench_return_pct, 2) if bench_return_pct is not None else None
    sim["metrics"]["alpha_pct"] = round(alpha_pct, 2) if alpha_pct is not None else None
    sim["metrics"]["window_start"] = first_date
    sim["metrics"]["window_end"] = equity_dates[-1] if equity_dates else None
    sim["metrics"]["window_days"] = span_days

    result = {
        "kind": "live",
        "user_id": user_id,
        "generated_at": iso(now_utc()),
        "empty": False,
        "verdict_count": len(verdicts),
        "trades": sim["trades"],
        "equity_curve": sim["equity_curve"],
        "benchmark_curve": benchmark_curve,
        "benchmark_ticker": benchmark,
        "metrics": sim["metrics"],
        "strategy_note": sim["strategy_note"],
    }

    await db.backtest_runs.update_one(
        {"user_id": user_id, "kind": "live"},
        {"$set": result},
        upsert=True,
    )
    return result
