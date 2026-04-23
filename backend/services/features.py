"""Feature extraction for the Random Forest secondary-opinion model.

This module is SHARED between the offline training script and runtime
inference so features are guaranteed identical. Adding a feature here means
you must retrain the model before the new feature is useful.

Design:
  * Input: a pandas DataFrame of daily OHLCV (index = datetime, columns =
    Open/High/Low/Close/Volume) — same shape yfinance returns.
  * Output: a 1-row dict (for inference) or a full DataFrame (for training)
    where each row is the feature vector for THAT day, computed using ONLY
    data available on-or-before that day (no lookahead).

The returned feature names are frozen in FEATURE_NAMES below — changes
require a retrain.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_NAMES = [
    # Returns
    "ret_1d", "ret_5d", "ret_20d",
    # RSI
    "rsi_14", "rsi_change_3d",
    # Moving-average position
    "close_over_sma20", "close_over_sma50", "sma20_over_sma50",
    # Volatility
    "realized_vol_20d", "atr_14_over_close",
    # Volume
    "vol_ratio_20d", "vol_trend_5d",
    # MACD
    "macd_hist", "macd_hist_delta",
    # Gap & candle shape
    "overnight_gap", "candle_body_ratio", "upper_shadow_ratio", "lower_shadow_ratio",
    # Regime (distance to 52-week extremes, range position)
    "dist_52w_high", "dist_52w_low", "range_pos_52w",
    # Market-regime context (added Apr 23 2026 — conditions the model on
    # macro vs stock-specific context so it can learn different behaviour
    # in risk-on vs risk-off regimes). Both features need a market_df to
    # compute — NaN if market_df is omitted, which means the row is dropped
    # during training and RF opinion is silently skipped at inference.
    "spy_ret_20d",        # SPY 20-day trailing return = market momentum
    "vix_level_rel",      # VIX today / VIX 252d mean − 1 = regime fear level
]

MIN_HISTORY_ROWS = 260  # ~1y trading days; enforces the 52-week regime features


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Wilder-smoothed RSI — same formula documented on /technical#rsi."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder smoothing = EMA with alpha = 1/period (equivalent form)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high_low = df["High"] - df["Low"]
    high_close = (df["High"] - df["Close"].shift()).abs()
    low_close = (df["Low"] - df["Close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def _macd_hist(series: pd.Series) -> pd.Series:
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return macd - signal


def _market_regime_series(market_df: dict | None, index: pd.DatetimeIndex) -> pd.DataFrame:
    """Build the SPY and VIX regime columns aligned to the ticker's date
    index. `market_df` is an optional dict with 'spy' and/or 'vix' keys
    (each a DataFrame with a 'Close' column, datetime index)."""
    out = pd.DataFrame(index=index, columns=["spy_ret_20d", "vix_level_rel"], dtype=float)
    if not isinstance(market_df, dict):
        return out
    try:
        spy = market_df.get("spy")
        if isinstance(spy, pd.DataFrame) and not spy.empty and "Close" in spy.columns:
            spy_close = spy["Close"].astype(float)
            # tz-normalise both to avoid reindex mismatches
            if spy_close.index.tz is not None:
                spy_close.index = spy_close.index.tz_localize(None)
            spy_ret = spy_close.pct_change(20)
            out["spy_ret_20d"] = spy_ret.reindex(
                index.tz_localize(None) if index.tz is not None else index,
                method="ffill",
            ).values
    except Exception:
        pass
    try:
        vix = market_df.get("vix")
        if isinstance(vix, pd.DataFrame) and not vix.empty and "Close" in vix.columns:
            vix_close = vix["Close"].astype(float)
            if vix_close.index.tz is not None:
                vix_close.index = vix_close.index.tz_localize(None)
            vix_mean_252 = vix_close.rolling(252, min_periods=120).mean()
            vix_rel = (vix_close / vix_mean_252) - 1.0
            out["vix_level_rel"] = vix_rel.reindex(
                index.tz_localize(None) if index.tz is not None else index,
                method="ffill",
            ).values
    except Exception:
        pass
    return out


def compute_feature_frame(df: pd.DataFrame, market_df: dict | None = None) -> pd.DataFrame:
    """Compute the full feature matrix for a history DataFrame.

    `market_df` is an optional dict with 'spy' and 'vix' DataFrames (each
    daily OHLCV). When provided, the regime columns `spy_ret_20d` and
    `vix_level_rel` are populated; otherwise they are NaN.

    Returns one row per input day that has enough trailing history
    (~260 trading days). NaNs in the result indicate those days should be
    dropped before training or inference.
    """
    if df is None or df.empty:
        return pd.DataFrame(columns=FEATURE_NAMES)

    d = df.copy()
    # Defensive: yfinance sometimes returns MultiIndex columns
    if isinstance(d.columns, pd.MultiIndex):
        d.columns = d.columns.get_level_values(0)
    required = {"Open", "High", "Low", "Close", "Volume"}
    if not required.issubset(d.columns):
        return pd.DataFrame(columns=FEATURE_NAMES)

    close = d["Close"].astype(float)
    open_ = d["Open"].astype(float)
    high = d["High"].astype(float)
    low = d["Low"].astype(float)
    volume = d["Volume"].astype(float)

    # Returns
    ret_1d = close.pct_change(1)
    ret_5d = close.pct_change(5)
    ret_20d = close.pct_change(20)

    # RSI
    rsi14 = _rsi(close, 14)
    rsi_chg_3 = rsi14.diff(3)

    # Moving averages
    sma20 = close.rolling(20, min_periods=20).mean()
    sma50 = close.rolling(50, min_periods=50).mean()

    # Volatility
    realized_vol_20 = ret_1d.rolling(20, min_periods=20).std() * np.sqrt(252)
    atr = _atr(d, 14)

    # Volume
    vol_sma20 = volume.rolling(20, min_periods=20).mean()
    vol_ratio = volume / vol_sma20
    vol_trend_5 = (volume.rolling(5, min_periods=5).mean() / vol_sma20) - 1.0

    # MACD
    macd_hist = _macd_hist(close)
    macd_hist_delta = macd_hist.diff(1)

    # Candle shape (avoid div by zero)
    bar_range = (high - low).replace(0, np.nan)
    body = (close - open_).abs()
    body_ratio = body / bar_range
    upper_shadow = (high - close.where(close > open_, open_)) / bar_range
    lower_shadow = (close.where(close < open_, open_) - low) / bar_range
    # overnight gap = open[t] vs close[t-1] as fraction
    overnight_gap = (open_ - close.shift(1)) / close.shift(1)

    # 52-week regime
    high52 = close.rolling(252, min_periods=120).max()
    low52 = close.rolling(252, min_periods=120).min()
    dist_high = (close / high52) - 1.0
    dist_low = (close / low52) - 1.0
    range_pos = (close - low52) / (high52 - low52).replace(0, np.nan)

    out = pd.DataFrame({
        "ret_1d": ret_1d,
        "ret_5d": ret_5d,
        "ret_20d": ret_20d,
        "rsi_14": rsi14,
        "rsi_change_3d": rsi_chg_3,
        "close_over_sma20": (close / sma20) - 1.0,
        "close_over_sma50": (close / sma50) - 1.0,
        "sma20_over_sma50": (sma20 / sma50) - 1.0,
        "realized_vol_20d": realized_vol_20,
        "atr_14_over_close": atr / close,
        "vol_ratio_20d": vol_ratio,
        "vol_trend_5d": vol_trend_5,
        "macd_hist": macd_hist / close,  # normalized by price
        "macd_hist_delta": macd_hist_delta / close,
        "overnight_gap": overnight_gap,
        "candle_body_ratio": body_ratio,
        "upper_shadow_ratio": upper_shadow,
        "lower_shadow_ratio": lower_shadow,
        "dist_52w_high": dist_high,
        "dist_52w_low": dist_low,
        "range_pos_52w": range_pos,
    }, index=d.index)

    # Market-regime columns (SPY 20d return, VIX relative). NaN when
    # market_df is omitted — those rows drop out in dataset.dropna() during
    # training; inference returns None and the UI skips the RF module.
    regime = _market_regime_series(market_df, d.index)
    out["spy_ret_20d"] = regime["spy_ret_20d"].values
    out["vix_level_rel"] = regime["vix_level_rel"].values

    return out[FEATURE_NAMES]


def feature_row_for_today(df: pd.DataFrame, market_df: dict | None = None) -> dict | None:
    """Compute features for the MOST RECENT day. Returns None if not enough
    history to produce valid (non-NaN) features. `market_df` is an optional
    dict {'spy': DataFrame, 'vix': DataFrame} for the regime features."""
    frame = compute_feature_frame(df, market_df=market_df)
    if frame.empty:
        return None
    last = frame.iloc[-1]
    if last.isna().any():
        return None
    return {k: float(v) for k, v in last.items()}
