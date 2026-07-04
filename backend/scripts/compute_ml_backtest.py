"""Compute the Neulab-ML walk-forward backtest (Option C).

Runs a deterministic monthly-rebalance simulation on a curated subset of
well-known, liquid tickers using the current Random-Forest model's P(up)
predictions. Saves the full result to MongoDB under
`db.backtest_runs` with kind="ml", keyed on the RF model's `trained_at`
timestamp so a new RF retrain automatically invalidates the cache.

Strategy (v1):
  * Universe: 25 ultra-liquid mega-caps from the trained universe.
  * Rebalance: 1st trading day of each month from cutoff_date → today.
  * Ranking: top-5 tickers by RF P(up) that month.
  * Execution: equal-weight long-only, held until next rebalance.
  * Starting capital: $10,000 notional.
  * Benchmark: SPY buy-and-hold over same window.

Run:
    python -m scripts.compute_ml_backtest
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make `backend` the cwd-relative root
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

import joblib
import numpy as np
import pandas as pd
import yfinance as yf
from motor.motor_asyncio import AsyncIOMotorClient

from services.features import compute_feature_frame, MIN_HISTORY_ROWS

logging.basicConfig(level=logging.INFO, format="%(asctime)s · %(levelname)s · %(message)s")
log = logging.getLogger("ml-backtest")

INITIAL_CASH = 10_000.0
TOP_K = 5
MODEL_PATH = BACKEND_ROOT / "models" / "rf_signal.joblib"
META_PATH = BACKEND_ROOT / "models" / "rf_signal.meta.json"

# Curated subset — mega-cap liquid names spanning sectors. Keeps compute fast
# (~2 mins total) while still covering enough names that ranking matters.
UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "NFLX", "AMD", "AVGO",
    "JPM", "V", "MA", "JNJ", "UNH", "XOM", "CVX", "LLY", "HD", "PG",
    "KO", "PEP", "WMT", "COST", "ORCL",
]


def _download_histories(tickers: list[str], years: int = 3) -> dict[str, pd.DataFrame]:
    end = datetime.now(timezone.utc).date()
    start = end.replace(year=end.year - years)
    log.info(f"Downloading {len(tickers)} tickers · {start} → {end}")
    raw = yf.download(
        tickers, start=str(start), end=str(end), interval="1d",
        group_by="ticker", auto_adjust=True, progress=False, threads=True,
    )
    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        try:
            df = raw[t].dropna(how="all").copy() if t in raw.columns.get_level_values(0) else None
            if df is None or df.empty:
                continue
            df = df[["Open", "High", "Low", "Close", "Volume"]]
            df.index = pd.to_datetime(df.index)
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            if len(df) >= MIN_HISTORY_ROWS:
                out[t] = df
        except Exception as e:
            log.warning(f"skip {t}: {e}")
    log.info(f"Loaded {len(out)}/{len(tickers)} tickers with sufficient history")
    return out


def _download_market(years: int = 4) -> dict:
    """Market context (SPY + VIX) for regime features."""
    end = datetime.now(timezone.utc).date()
    start = end.replace(year=end.year - years)
    out = {}
    for key, ticker in (("spy", "SPY"), ("vix", "^VIX")):
        try:
            df = yf.download(ticker, start=str(start), end=str(end), interval="1d",
                             auto_adjust=True, progress=False, threads=False)
            if df is None or df.empty:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df.index = pd.to_datetime(df.index)
            if df.index.tz is not None:
                df.index = df.index.tz_localize(None)
            out[key] = df
        except Exception as e:
            log.warning(f"market ctx {ticker}: {e}")
    return out


def _feature_frames(histories: dict[str, pd.DataFrame], market_df: dict) -> dict[str, pd.DataFrame]:
    out = {}
    for t, df in histories.items():
        ff = compute_feature_frame(df, market_df=market_df)
        if ff is not None and not ff.empty:
            out[t] = ff
    return out


def _rebalance_dates(start: pd.Timestamp, end: pd.Timestamp, market_trading_days: pd.DatetimeIndex) -> list[pd.Timestamp]:
    """First trading day of each calendar month between start and end."""
    dates = []
    cursor = pd.Timestamp(start.year, start.month, 1)
    while cursor <= end:
        # Find the first trading day >= cursor in the market calendar
        mask = market_trading_days >= cursor
        if mask.any():
            first_td = market_trading_days[mask][0]
            # Only include if still within our window
            if start <= first_td <= end:
                dates.append(first_td)
        # Advance to next month
        if cursor.month == 12:
            cursor = pd.Timestamp(cursor.year + 1, 1, 1)
        else:
            cursor = pd.Timestamp(cursor.year, cursor.month + 1, 1)
    return dates


def _run_simulation(
    model, feature_names: list[str],
    features: dict[str, pd.DataFrame], histories: dict[str, pd.DataFrame],
    benchmark_history: pd.DataFrame | None,
    cutoff_date: str,
):
    """Walk monthly, predict P(up), pick top-K, hold until next rebalance."""
    tickers = list(features.keys())
    if not tickers:
        return None
    # Build a union trading-day index (use first ticker as proxy — they align)
    proxy_idx = histories[tickers[0]].index
    cutoff = pd.Timestamp(cutoff_date)
    today = pd.Timestamp(datetime.now(timezone.utc).date())
    window_dates = proxy_idx[(proxy_idx >= cutoff) & (proxy_idx <= today)]
    if len(window_dates) < 20:
        log.warning("window too short, abort")
        return None
    rebal_dates = _rebalance_dates(window_dates[0], window_dates[-1], proxy_idx)
    log.info(f"Rebalance dates: {len(rebal_dates)} — first {rebal_dates[0].date()} last {rebal_dates[-1].date()}")

    cash = INITIAL_CASH
    positions: dict[str, tuple[float, float]] = {}  # ticker -> (shares, entry_price)
    trades: list[dict] = []

    def _mark_to_market(on: pd.Timestamp) -> float:
        total = cash
        for tk, (shares, _entry) in positions.items():
            df = histories.get(tk)
            if df is None:
                continue
            sub = df.loc[df.index <= on]
            if sub.empty:
                continue
            total += shares * float(sub["Close"].iloc[-1])
        return total

    # Predict for every (ticker, rebal_date) upfront for speed
    # Shape: list of (date, [(ticker, prob_up), ...])
    ranked_by_date: dict[pd.Timestamp, list[tuple[str, float]]] = {}
    for rd in rebal_dates:
        scored = []
        for t in tickers:
            ff = features[t]
            sub = ff.loc[ff.index <= rd]
            if sub.empty:
                continue
            row = sub.iloc[-1]
            x = np.array([row.get(n, np.nan) for n in feature_names], dtype=float)
            if np.isnan(x).any():
                continue
            try:
                p_up = float(model.predict_proba(x.reshape(1, -1))[0][1])
            except Exception:
                continue
            scored.append((t, p_up))
        scored.sort(key=lambda pair: pair[1], reverse=True)
        ranked_by_date[rd] = scored[:TOP_K]

    # Walk rebalances: on each, close all existing positions and open top-K
    prev_rd = None
    for rd in rebal_dates:
        # ─ Close old positions first at rd-close
        for tk, (shares, entry_price) in list(positions.items()):
            df = histories.get(tk)
            if df is None:
                continue
            sub = df.loc[df.index <= rd]
            if sub.empty:
                continue
            exit_price = float(sub["Close"].iloc[-1])
            cash += shares * exit_price
            trades.append({
                "ticker": tk,
                "entry_at": prev_rd.date().isoformat() if prev_rd else None,
                "entry_price": round(entry_price, 4),
                "exit_at": rd.date().isoformat(),
                "exit_price": round(exit_price, 4),
                "shares": round(shares, 6),
                "pnl_pct": round(((exit_price - entry_price) / entry_price) * 100, 3) if entry_price else 0,
                "exit_reason": "rebalance",
            })
        positions.clear()

        # ─ Open new top-K equal-weight
        picks = ranked_by_date.get(rd, [])
        if not picks:
            continue
        alloc = cash / len(picks)
        for t, p_up in picks:
            df = histories.get(t)
            if df is None:
                continue
            sub = df.loc[df.index <= rd]
            if sub.empty:
                continue
            entry_price = float(sub["Close"].iloc[-1])
            if entry_price <= 0:
                continue
            shares = alloc / entry_price
            cash -= alloc
            positions[t] = (shares, entry_price)
        prev_rd = rd

    # ─ Close all remaining positions at last trading day
    end_day = window_dates[-1]
    for tk, (shares, entry_price) in list(positions.items()):
        df = histories.get(tk)
        if df is None:
            continue
        sub = df.loc[df.index <= end_day]
        if sub.empty:
            continue
        exit_price = float(sub["Close"].iloc[-1])
        cash += shares * exit_price
        trades.append({
            "ticker": tk,
            "entry_at": prev_rd.date().isoformat() if prev_rd else None,
            "entry_price": round(entry_price, 4),
            "exit_at": end_day.date().isoformat(),
            "exit_price": round(exit_price, 4),
            "shares": round(shares, 6),
            "pnl_pct": round(((exit_price - entry_price) / entry_price) * 100, 3) if entry_price else 0,
            "exit_reason": "window_end",
        })
    positions.clear()

    # ─ Build daily equity curve across full window
    for d in window_dates:
        # Re-mark with historical positions logic would require replay — use
        # a simpler linear interpolation by computing MtM per-day based on
        # positions held at each rebalance boundary.
        # For v1 we sample at rebalance boundaries only and linearly connect.
        pass

    # Simpler equity curve: value per rebalance date + final day
    equity_curve: list[dict] = []
    # Rebuild by replaying trades chronologically for correct MtM
    replay_cash = INITIAL_CASH
    replay_pos: dict[str, tuple[float, float]] = {}
    trade_iter = sorted(trades, key=lambda t: t["exit_at"] or "")

    # index trades by rebalance dates for replay
    trades_by_entry: dict[str, list[dict]] = {}
    for t in trades:
        k = t["entry_at"] or ""
        trades_by_entry.setdefault(k, []).append(t)

    for d in window_dates:
        d_str = d.date().isoformat()
        # ─ Apply any trade exits on this day
        for t in [t for t in trade_iter if t["exit_at"] == d_str]:
            tk = t["ticker"]
            if tk in replay_pos:
                shares, _ = replay_pos.pop(tk)
                replay_cash += shares * float(t["exit_price"])
        # ─ Apply any trade entries on this day
        for t in trades_by_entry.get(d_str, []):
            tk = t["ticker"]
            if tk in replay_pos:
                continue  # already in
            shares = float(t["shares"])
            alloc = shares * float(t["entry_price"])
            replay_cash -= alloc
            replay_pos[tk] = (shares, float(t["entry_price"]))
        # MtM
        total = replay_cash
        for tk, (shares, _entry) in replay_pos.items():
            df = histories.get(tk)
            if df is None:
                continue
            sub = df.loc[df.index <= d]
            if sub.empty:
                continue
            total += shares * float(sub["Close"].iloc[-1])
        equity_curve.append({"date": d_str, "portfolio_value": round(total, 2)})

    # ─ Benchmark (SPY) curve aligned on same dates
    benchmark_curve = []
    if benchmark_history is not None and not benchmark_history.empty:
        seed_row = benchmark_history.loc[benchmark_history.index >= window_dates[0]]
        if not seed_row.empty:
            seed_close = float(seed_row["Close"].iloc[0])
            for d in window_dates:
                sub = benchmark_history.loc[benchmark_history.index <= d]
                if sub.empty:
                    continue
                bench_close = float(sub["Close"].iloc[-1])
                benchmark_curve.append({
                    "date": d.date().isoformat(),
                    "benchmark_value": round(INITIAL_CASH * (bench_close / seed_close), 2),
                })

    # ─ Metrics
    final_val = equity_curve[-1]["portfolio_value"] if equity_curve else INITIAL_CASH
    total_return = ((final_val - INITIAL_CASH) / INITIAL_CASH) * 100
    peak, max_dd = INITIAL_CASH, 0.0
    for pt in equity_curve:
        if pt["portfolio_value"] > peak:
            peak = pt["portfolio_value"]
        dd = (pt["portfolio_value"] - peak) / peak * 100 if peak else 0
        if dd < max_dd:
            max_dd = dd

    wins = [t for t in trades if t["pnl_pct"] > 0]

    bench_return = None
    if benchmark_curve:
        bench_return = ((benchmark_curve[-1]["benchmark_value"] - INITIAL_CASH) / INITIAL_CASH) * 100

    return {
        "equity_curve": equity_curve,
        "benchmark_curve": benchmark_curve,
        "trades": sorted(trades, key=lambda t: t["exit_at"] or ""),
        "metrics": {
            "initial_cash": INITIAL_CASH,
            "final_value": round(final_val, 2),
            "total_return_pct": round(total_return, 2),
            "benchmark_return_pct": round(bench_return, 2) if bench_return is not None else None,
            "alpha_pct": round(total_return - bench_return, 2) if bench_return is not None else None,
            "max_drawdown_pct": round(max_dd, 2),
            "trade_count": len(trades),
            "win_count": len(wins),
            "win_rate_pct": round((len(wins) / len(trades)) * 100, 1) if trades else None,
            "window_start": window_dates[0].date().isoformat(),
            "window_end": window_dates[-1].date().isoformat(),
            "rebalance_count": len(rebal_dates),
            "universe_size": len(tickers),
            "top_k": TOP_K,
            "benchmark_ticker": "SPY",
        },
        "strategy_note": (
            f"Monthly rebalance · top-{TOP_K} by Random-Forest P(up) · equal-weight · "
            f"universe of {len(tickers)} mega-caps · walk-forward from {cutoff_date} "
            f"(model training cutoff) → today. Pure RF model — no LLM. Ignores fees, "
            f"slippage, and dividends. Starting capital ${INITIAL_CASH:,.0f}."
        ),
    }


async def _save(db, payload: dict, meta: dict):
    payload.update({
        "kind": "ml",
        "user_id": None,
        "rf_trained_at": meta.get("trained_at"),
        "rf_holdout_accuracy": meta.get("holdout_accuracy"),
        "rf_baseline_accuracy": meta.get("baseline_accuracy"),
        "rf_calibration": meta.get("calibration_method"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.backtest_runs.update_one(
        {"kind": "ml"},
        {"$set": payload},
        upsert=True,
    )
    log.info("Saved ML backtest to db.backtest_runs")


async def main():
    # Load meta + model
    meta = json.loads(META_PATH.read_text())
    cutoff_date = meta["cutoff_date"]
    feature_names = meta["feature_names"]

    # SAFETY GATE — mirrors services/rf_predictor.py's predict_from_features()
    # gate. This script loads the .joblib directly via joblib.load() rather
    # than going through rf_predictor.py's public functions, so it was
    # NOT covered by that gate at all until this check was added. Without
    # it, running the admin /backtest/ml/recompute trigger would silently
    # repopulate the PUBLIC, unauthenticated /backtest/ml endpoint with
    # numbers derived from a model that's been deliberately disabled after
    # failing two separate walk-forward validation attempts (see
    # scripts/train_rf.py meta["rf_feature_enabled"] for the full reasoning).
    if meta.get("label_type") != "relative_vs_spy" or meta.get("rf_feature_enabled") is not True:
        log.error(
            "RF model is gated off (label_type=%r, rf_feature_enabled=%r) — "
            "refusing to compute a new ML backtest against a retired model. "
            "See scripts/train_rf.py for why this feature was disabled.",
            meta.get("label_type"), meta.get("rf_feature_enabled"),
        )
        raise SystemExit(1)

    log.info(f"RF trained_at={meta['trained_at']} cutoff={cutoff_date} horizon={meta['horizon_days']}d")

    bundle = joblib.load(MODEL_PATH)
    model = bundle["model"] if isinstance(bundle, dict) else bundle

    # Download data
    market_df = _download_market(years=4)
    histories = _download_histories(UNIVERSE, years=3)
    features = _feature_frames(histories, market_df)
    log.info(f"Feature frames ready: {len(features)} tickers")

    bench_hist = None
    if "spy" in market_df:
        bench_hist = market_df["spy"]

    result = _run_simulation(model, feature_names, features, histories, bench_hist, cutoff_date)
    if result is None:
        log.error("Simulation failed — aborting")
        return 1
    log.info("Simulation complete. Metrics: %s", result["metrics"])

    # Save to Mongo (re-use backend's motor client)
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME", "test_database")
    if not mongo_url:
        # try loading from backend/.env
        env_path = BACKEND_ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not mongo_url:
        log.error("MONGO_URL not set")
        return 1
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    await _save(db, result, meta)
    client.close()
    return 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    sys.exit(rc)
