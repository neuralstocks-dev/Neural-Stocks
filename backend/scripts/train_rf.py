"""Offline training for the Random Forest secondary-opinion model.

Run once (or periodically) to refresh /app/backend/models/rf_signal.joblib.

Usage:
    cd /app/backend && python scripts/train_rf.py [--tickers N] [--years Y]

Methodology (documented on /technical#random-forest):
  * Universe: broad large-cap US slice (~300 S&P 500 names across 11 sectors).
  * Input features: the FEATURE_NAMES set from services/features.py.
  * Label: binary — did the closing price RISE over the next 20 trading
    days (≈1 calendar month)? Longer horizon smooths single-day noise and
    lets the model lean on regime-level features (52-week position, MACD
    momentum, SMA ratios) instead of pure short-term noise.
  * Walk-forward split: train on the first 80% of DATES (not rows). Holdout
    is the most recent 20% of dates across all tickers. This prevents
    lookahead bias and approximates a real "retrain-then-forecast" cycle.
  * Model: RandomForestClassifier(n_estimators=400, max_depth=12,
            min_samples_leaf=50, class_weight='balanced', n_jobs=-1).
  * Evaluated: accuracy, ROC-AUC, OOB score, per-class precision/recall.
  * Saved artifact includes feature names, training date range, holdout
    metrics, feature importance ranking — consumed by the runtime
    predictor and surfaced on /technical + provenance banner on every
    verdict.
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
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    classification_report,
    roc_auc_score,
)
import joblib

# Allow running this script from anywhere under /app/backend
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from services.features import FEATURE_NAMES, compute_feature_frame  # noqa: E402

# S&P 500 broad slice — stable symbols, liquid, diverse across all 11 GICS sectors.
# Expanded in Apr 2026 for the 20-day-horizon retrain. ~300 names total.
DEFAULT_UNIVERSE = [
    # Mega cap tech + software
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA", "AVGO", "ORCL",
    "ADBE", "CRM", "INTC", "AMD", "CSCO", "QCOM", "IBM", "TXN", "MU", "ACN",
    "INTU", "NOW", "PANW", "CRWD", "NET", "SNOW", "DDOG", "ZS", "ADSK", "CDNS",
    "SNPS", "WDAY", "TEAM", "MDB", "FTNT", "ANET", "KLAC", "LRCX", "AMAT", "MRVL",
    "ADI", "ON", "NXPI", "MPWR", "STX", "WDC", "HPQ", "DELL", "HPE", "NTAP",
    "APH", "GLW", "TDY", "KEYS", "FFIV", "ZBRA",
    # Finance + insurance
    "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "BLK", "SCHW", "SPGI",
    "V", "MA", "PYPL", "COIN", "AIG", "USB", "PNC", "TFC", "BK", "MET",
    "PRU", "ALL", "TRV", "CB", "PGR", "HIG", "AFL", "AJG", "MMC", "AON",
    "ICE", "CME", "NDAQ", "MCO", "FIS", "FISV", "GPN", "BRK-B", "TROW", "STT",
    "NTRS", "RJF", "LNC", "CINF", "WRB", "RE",
    # Healthcare + biotech + devices
    "JNJ", "UNH", "PFE", "ABBV", "LLY", "MRK", "TMO", "ABT", "DHR", "BMY",
    "AMGN", "GILD", "CVS", "CI", "HUM", "ELV", "ISRG", "MDT", "SYK", "BSX",
    "ZTS", "REGN", "VRTX", "BIIB", "MRNA", "ILMN", "IQV", "MCK", "COR", "CAH",
    "DXCM", "EW", "BDX", "A", "IDXX", "RMD", "HOLX", "ALGN",
    # Consumer discretionary + staples + retail
    "WMT", "COST", "HD", "LOW", "MCD", "SBUX", "NKE", "TGT", "LULU", "CMG",
    "PG", "KO", "PEP", "PM", "MDLZ", "CL", "KMB", "GIS", "HSY", "STZ",
    "MO", "KHC", "KR", "WBA", "SYY", "TSN", "CAG", "HRL", "K", "CPB",
    "CHD", "CLX", "DLTR", "DG", "ROST", "TJX", "ORLY", "AZO", "BBY", "YUM",
    "QSR", "DPZ", "MAR", "HLT", "BKNG", "ABNB", "RCL", "CCL", "MGM", "LVS",
    # Industrials + transports + defense
    "CAT", "DE", "BA", "GE", "HON", "LMT", "RTX", "NOC", "GD", "UPS",
    "FDX", "UNP", "CSX", "NSC", "MMM", "EMR", "ETN", "ITW", "PH", "TT",
    "CMI", "PCAR", "WM", "RSG", "ROP", "ROK", "DOV", "FAST", "PWR", "URI",
    "EFX", "VRSK", "FTV", "J", "SNA", "XYL", "PNR", "CARR", "OTIS", "GWW",
    # Energy + materials + chemicals
    "XOM", "CVX", "COP", "SLB", "EOG", "PSX", "MPC", "VLO", "OXY", "HES",
    "LIN", "APD", "SHW", "FCX", "NEM", "DOW", "DD", "PPG", "CTVA", "NUE",
    "STLD", "VMC", "MLM", "ALB", "IP", "PKG", "AVY", "LYB", "CE", "BALL",
    "HAL", "BKR", "DVN", "FANG", "PXD", "KMI", "WMB", "OKE", "TRGP",
    # Utilities + REIT + communication
    "NEE", "SO", "DUK", "SRE", "AEP", "EXC", "XEL", "ED", "PEG", "EIX",
    "T", "VZ", "CMCSA", "DIS", "NFLX", "TMUS", "CHTR", "EA", "TTWO", "ROKU",
    "PLD", "AMT", "CCI", "EQIX", "SPG", "O", "PSA", "DLR", "WELL", "EXR",
    "AVB", "EQR", "ESS", "MAA", "UDR", "VTR", "ARE", "BXP", "IRM", "WY",
    "AWK", "WEC", "ES", "DTE", "PPL", "CMS", "AEE", "NI", "ATO", "EVRG",
    # Semi + cloud + misc
    "SHOP", "SQ", "UBER", "LYFT", "DASH", "PINS", "SNAP", "SPOT", "DOCU", "ZM",
    "TWLO", "OKTA", "HUBS", "DBX", "BILL", "PLTR", "U", "RBLX", "PATH",
    # ADR / Non-US mega caps traded on NYSE
    "PDD", "BABA", "JD", "NIO", "TSM", "ASML", "NVO", "SAP", "TM", "SONY",
    "SHEL", "BP", "UL", "DEO", "RIO",
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


def _download_market_context(years: int) -> dict:
    """Download SPY + ^VIX for the regime features. Returns {'spy': df, 'vix': df}."""
    end = datetime.now(timezone.utc).date()
    start = end.replace(year=end.year - years - 1)  # extra year for 252d rolling mean
    print(f"▸ downloading market context (SPY, ^VIX) {start}..{end}", flush=True)
    out: dict = {}
    for key, ticker in (("spy", "SPY"), ("vix", "^VIX")):
        df = yf.download(
            ticker, start=str(start), end=str(end), interval="1d",
            auto_adjust=True, progress=False, threads=False,
        )
        if df is None or df.empty:
            print(f"  !! {ticker} empty", flush=True)
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df = df[[c for c in ("Open", "High", "Low", "Close", "Volume") if c in df.columns]]
        df.index = pd.to_datetime(df.index)
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        out[key] = df
        print(f"  ok {ticker}: {len(df)} rows", flush=True)
    return out


def _build_training_set(
    histories: dict[str, pd.DataFrame],
    horizon_days: int = 5,
    market_df: dict | None = None,
):
    """For every (ticker, date) with valid features, compute label = sign(close[t+h]/close[t] − 1)."""
    frames = []
    for ticker, df in histories.items():
        features = compute_feature_frame(df, market_df=market_df)
        # Label = N-day forward return positive?
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
    ap.add_argument("--horizon", type=int, default=20,
                    help="Forward-return horizon in TRADING days (default 20 ≈ 1 calendar month).")
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

    market_df = _download_market_context(years=args.years)
    if "spy" not in market_df or "vix" not in market_df:
        print("  !! market context incomplete; regime features will be NaN and all rows will drop", flush=True)
        raise RuntimeError("Need both SPY and ^VIX for regime features")

    print(f"▸ building feature set (horizon={args.horizon} trading days)…", flush=True)
    dataset = _build_training_set(histories, horizon_days=args.horizon, market_df=market_df)
    print(f"  rows: {len(dataset):,}  (positive class pct: {dataset['_label'].mean():.1%})", flush=True)

    train, test, cutoff = _walk_forward_split(dataset, train_frac=0.8)
    print(f"▸ walk-forward split: train<{cutoff.date()}  test>={cutoff.date()}", flush=True)
    print(f"  train rows: {len(train):,}  test rows: {len(test):,}", flush=True)

    X_train = train[FEATURE_NAMES].values
    y_train = train["_label"].values
    X_test = test[FEATURE_NAMES].values
    y_test = test["_label"].values

    # Hold out a calibration slice from the training window so we can fit
    # an isotonic calibrator on data the base RF has never seen — while
    # still keeping the chronological holdout sacred for evaluation.
    X_fit, X_cal, y_fit, y_cal = train_test_split(
        X_train, y_train, test_size=0.2, random_state=42, stratify=y_train,
    )

    base_model = RandomForestClassifier(
        n_estimators=400,
        max_depth=12,
        min_samples_leaf=50,
        class_weight="balanced",
        oob_score=True,
        n_jobs=-1,
        random_state=42,
    )
    print(f"▸ training base Random Forest on {len(X_fit):,} rows…", flush=True)
    base_model.fit(X_fit, y_fit)

    # Uncalibrated holdout metrics (for comparison)
    y_pred_raw = base_model.predict(X_test)
    y_proba_raw = base_model.predict_proba(X_test)[:, 1]
    uncal_acc = accuracy_score(y_test, y_pred_raw)
    uncal_auc = roc_auc_score(y_test, y_proba_raw)
    uncal_brier = brier_score_loss(y_test, y_proba_raw)

    print(f"▸ calibrating (isotonic, frozen-prefit) on {len(X_cal):,} held-out rows…", flush=True)
    # sklearn ≥1.6 removed cv='prefit' — wrap with FrozenEstimator instead.
    model = CalibratedClassifierCV(FrozenEstimator(base_model), method="isotonic")
    model.fit(X_cal, y_cal)

    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    holdout_acc = accuracy_score(y_test, y_pred)
    holdout_auc = roc_auc_score(y_test, y_proba)
    holdout_brier = brier_score_loss(y_test, y_proba)
    report = classification_report(y_test, y_pred, target_names=["DOWN", "UP"], output_dict=True)

    importances = sorted(
        zip(FEATURE_NAMES, base_model.feature_importances_),
        key=lambda kv: kv[1],
        reverse=True,
    )

    print("▸ holdout metrics (calibrated)")
    print(f"    accuracy    {holdout_acc:.4f}  (uncal {uncal_acc:.4f})")
    print(f"    ROC-AUC     {holdout_auc:.4f}  (uncal {uncal_auc:.4f})")
    print(f"    Brier       {holdout_brier:.4f}  (uncal {uncal_brier:.4f}, lower is better)")
    print(f"    OOB score   {base_model.oob_score_:.4f}")
    print(f"    baseline    {max(y_test.mean(), 1 - y_test.mean()):.4f}  (always-majority)")
    print("▸ top 10 features")
    for name, imp in importances[:10]:
        print(f"    {imp:0.4f}  {name}")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    training_start = str(pd.Series(dataset.index).min().date())
    training_end = str(pd.Series(dataset.index).max().date())
    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "universe_size": len(histories),
        "universe": sorted(histories.keys()),
        "years_of_history": args.years,
        "horizon_days": args.horizon,
        "feature_names": FEATURE_NAMES,
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "cutoff_date": str(cutoff.date()),
        "training_start_date": training_start,
        "training_end_date": training_end,
        "holdout_accuracy": round(float(holdout_acc), 4),
        "holdout_auc": round(float(holdout_auc), 4),
        "oob_score": round(float(base_model.oob_score_), 4),
        "baseline_accuracy": round(float(max(y_test.mean(), 1 - y_test.mean())), 4),
        "calibration_method": "isotonic_frozen",
        "calibration_rows": int(len(X_cal)),
        "calibrated_brier": round(float(holdout_brier), 4),
        "uncalibrated_brier": round(float(uncal_brier), 4),
        "uncalibrated_accuracy": round(float(uncal_acc), 4),
        "uncalibrated_auc": round(float(uncal_auc), 4),
        "classification_report": report,
        "feature_importance": [
            {"name": n, "importance": round(float(v), 6)} for n, v in importances
        ],
    }

    # Persist feature_importances at the top level too — the calibrated
    # wrapper doesn't expose this attribute so the runtime predictor
    # reads it from here.
    bundle = {
        "model": model,
        "meta": meta,
        "feature_importances": base_model.feature_importances_.tolist(),
    }
    joblib.dump(bundle, out_path)
    # Write meta separately (human-readable)
    (out_path.parent / "rf_signal.meta.json").write_text(json.dumps(meta, indent=2))
    elapsed = time.time() - t0
    print(f"▸ saved {out_path}  ({os.path.getsize(out_path)/1e6:.2f} MB) · {elapsed:.1f}s")


if __name__ == "__main__":
    main()
