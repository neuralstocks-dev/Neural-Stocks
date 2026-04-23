"""Offline training for the Random Forest secondary-opinion model.

Run once (or periodically) to refresh /app/backend/models/rf_signal.joblib.

Usage:
    cd /app/backend && python scripts/train_rf.py [--tickers N] [--years Y]

Methodology (documented on /technical#random-forest):
  * Universe: top-liquidity large-cap US names (S&P 500 slice).
  * Input features: the FEATURE_NAMES set from services/features.py.
  * Label: binary — did the closing price RISE over the next 5 trading days?
  * Walk-forward split: train on the first 80% of DATES (not rows). Holdout
    is the most recent 20% of dates across all tickers. This prevents
    lookahead bias and approximates a real "retrain-then-forecast" cycle.
  * Model: RandomForestClassifier(n_estimators=400, max_depth=12,
            min_samples_leaf=50, class_weight='balanced', n_jobs=-1).
  * Evaluated: accuracy, ROC-AUC, OOB score, per-class precision/recall.
  * Saved artifact includes feature names, training cutoff date, holdout
    metrics, feature importance ranking — consumed by the runtime
    predictor and surfaced on /technical.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    roc_auc_score,
)
import joblib

# Allow running this script from anywhere under /app/backend
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from services.features import FEATURE_NAMES, compute_feature_frame  # noqa: E402

# S&P 500 large-cap-by-sector slice — stable symbols, liquid, diverse
DEFAULT_UNIVERSE = [
    # Mega cap tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "AVGO", "ORCL", "ADBE",
    "CRM", "INTC", "AMD", "CSCO", "QCOM", "IBM", "TXN", "MU", "ACN", "INTU",
    # Finance
    "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "BLK", "SCHW", "SPGI",
    "V", "MA", "PYPL", "COIN", "AIG", "USB", "PNC", "TFC", "BK", "MET",
    # Healthcare
    "JNJ", "UNH", "PFE", "ABBV", "LLY", "MRK", "TMO", "ABT", "DHR", "BMY",
    "AMGN", "GILD", "CVS", "CI", "HUM", "ELV", "ISRG", "MDT", "SYK", "BSX",
    # Consumer
    "WMT", "COST", "HD", "LOW", "MCD", "SBUX", "NKE", "TGT", "LULU", "CMG",
    "PG", "KO", "PEP", "PM", "MDLZ", "CL", "KMB", "GIS", "HSY", "STZ",
    # Industrials
    "CAT", "DE", "BA", "GE", "HON", "LMT", "RTX", "NOC", "GD", "UPS",
    "FDX", "UNP", "CSX", "NSC", "MMM", "EMR", "ETN", "ITW", "PH", "TT",
    # Energy + materials
    "XOM", "CVX", "COP", "SLB", "EOG", "PSX", "MPC", "VLO", "OXY", "HES",
    "LIN", "APD", "SHW", "FCX", "NEM", "DOW", "DD", "PPG", "CTVA",
    # Utilities + REIT + communication
    "NEE", "SO", "DUK", "SRE", "AEP", "EXC", "XEL", "ED", "PEG", "EIX",
    "T", "VZ", "CMCSA", "DIS", "NFLX", "TMUS", "CHTR", "EA", "TTWO",
    "PLD", "AMT", "CCI", "EQIX", "SPG", "O", "PSA", "DLR", "WELL", "EXR",
    # Small sampling across (to keep training set diverse)
    "BRK-B", "V", "WFC", "MU", "ADI", "BKNG", "SHOP", "NOW", "ADSK",
    "CDNS", "SNPS", "PANW", "CRWD", "NET", "SNOW", "DDOG", "ZS",
    "PDD", "BABA", "JD", "NIO",
]


def _download_history(tickers: list[str], years: int) -> dict[str, pd.DataFrame]:
    """Batch-download OHLCV. yfinance handles threading + rate limits."""
    end = datetime.now(timezone.utc).date()
    start = end.replace(year=end.year - years)
    print(f"▸ downloading {len(tickers)} tickers · {start}..{end}", flush=True)
    # group_by='ticker' so we get a dict-like frame
    raw = yf.download(
        tickers,
        start=str(start),
        end=str(end),
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=True,
    )
    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        try:
            df = raw[t].dropna(how="all").copy() if t in raw.columns.get_level_values(0) else None
            if df is None or df.empty:
                continue
            df = df[["Open", "High", "Low", "Close", "Volume"]]
            df.index = pd.to_datetime(df.index)
            if len(df) >= 300:
                out[t] = df
        except Exception:
            continue
    print(f"▸ got usable history for {len(out)}/{len(tickers)} tickers", flush=True)
    return out


def _build_training_set(histories: dict[str, pd.DataFrame], horizon_days: int = 5):
    """For every (ticker, date) with valid features, compute label = sign(close[t+h]/close[t] − 1)."""
    frames = []
    for ticker, df in histories.items():
        features = compute_feature_frame(df)
        # Label = 5-day forward return positive?
        fwd_ret = df["Close"].pct_change(horizon_days).shift(-horizon_days)
        label = (fwd_ret > 0).astype(int)
        combined = features.copy()
        combined["_label"] = label
        combined["_ticker"] = ticker
        combined = combined.dropna()
        frames.append(combined)
    if not frames:
        raise RuntimeError("No training frames produced — check history downloads")
    full = pd.concat(frames, axis=0)
    full.index.name = "date"
    full = full.sort_index()
    return full


def _walk_forward_split(dataset: pd.DataFrame, train_frac: float = 0.8):
    """Strict chronological split — no ticker bleed across train/test, since
    the cutoff is a calendar date that applies to every ticker simultaneously."""
    dates = pd.Series(dataset.index.unique()).sort_values()
    cutoff_idx = int(len(dates) * train_frac)
    cutoff = dates.iloc[cutoff_idx]
    train = dataset[dataset.index < cutoff]
    test = dataset[dataset.index >= cutoff]
    return train, test, cutoff


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--tickers", type=int, default=0, help="Limit universe to first N (0 = all)")
    ap.add_argument("--out", type=str, default=str(ROOT / "models" / "rf_signal.joblib"))
    args = ap.parse_args()

    universe = DEFAULT_UNIVERSE
    if args.tickers > 0:
        universe = DEFAULT_UNIVERSE[: args.tickers]

    # Deduplicate while preserving order
    seen = set()
    universe = [t for t in universe if not (t in seen or seen.add(t))]

    t0 = time.time()
    histories = _download_history(universe, years=args.years)
    if len(histories) < 20:
        raise RuntimeError(f"Too few tickers succeeded ({len(histories)}) — try again later")

    print(f"▸ building feature set (horizon=5 trading days)…", flush=True)
    dataset = _build_training_set(histories, horizon_days=5)
    print(f"  rows: {len(dataset):,}  (positive class pct: {dataset['_label'].mean():.1%})", flush=True)

    train, test, cutoff = _walk_forward_split(dataset, train_frac=0.8)
    print(f"▸ walk-forward split: train<{cutoff.date()}  test>={cutoff.date()}", flush=True)
    print(f"  train rows: {len(train):,}  test rows: {len(test):,}", flush=True)

    X_train = train[FEATURE_NAMES].values
    y_train = train["_label"].values
    X_test = test[FEATURE_NAMES].values
    y_test = test["_label"].values

    model = RandomForestClassifier(
        n_estimators=400,
        max_depth=12,
        min_samples_leaf=50,
        class_weight="balanced",
        oob_score=True,
        n_jobs=-1,
        random_state=42,
    )
    print("▸ training Random Forest…", flush=True)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    holdout_acc = accuracy_score(y_test, y_pred)
    holdout_auc = roc_auc_score(y_test, y_proba)
    report = classification_report(y_test, y_pred, target_names=["DOWN", "UP"], output_dict=True)

    importances = sorted(
        zip(FEATURE_NAMES, model.feature_importances_),
        key=lambda kv: kv[1],
        reverse=True,
    )

    print("▸ holdout metrics")
    print(f"    accuracy    {holdout_acc:.4f}")
    print(f"    ROC-AUC     {holdout_auc:.4f}")
    print(f"    OOB score   {model.oob_score_:.4f}")
    print(f"    baseline    {max(y_test.mean(), 1 - y_test.mean()):.4f}  (always-majority)")
    print("▸ top 10 features")
    for name, imp in importances[:10]:
        print(f"    {imp:0.4f}  {name}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "universe_size": len(histories),
        "universe": sorted(histories.keys()),
        "years_of_history": args.years,
        "horizon_days": 5,
        "feature_names": FEATURE_NAMES,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "cutoff_date": str(cutoff.date()),
        "holdout_accuracy": round(float(holdout_acc), 4),
        "holdout_auc": round(float(holdout_auc), 4),
        "oob_score": round(float(model.oob_score_), 4),
        "baseline_accuracy": round(float(max(y_test.mean(), 1 - y_test.mean())), 4),
        "classification_report": report,
        "feature_importance": [
            {"name": n, "importance": round(float(v), 6)} for n, v in importances
        ],
    }

    joblib.dump({"model": model, "meta": meta}, out_path)
    # Write meta separately (human-readable)
    (out_path.parent / "rf_signal.meta.json").write_text(json.dumps(meta, indent=2))
    elapsed = time.time() - t0
    print(f"▸ saved {out_path}  ({os.path.getsize(out_path)/1e6:.2f} MB) · {elapsed:.1f}s")


if __name__ == "__main__":
    main()
