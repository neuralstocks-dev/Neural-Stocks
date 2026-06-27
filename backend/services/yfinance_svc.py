"""yfinance quote / history / fundamentals / technicals helpers."""
import asyncio
import math
import time
import yfinance as yf
from services.source_health import track


def _isnan(x) -> bool:
    try:
        return math.isnan(float(x))
    except Exception:
        return False


def _with_retry(fn, *args, attempts: int = 3, base_delay: float = 0.6, **kwargs):
    """Synchronous retry wrapper for yfinance calls. yfinance has no built-in
    retry and each yf.Ticker() spins up a brand-new HTTP session — a cold
    Railway worker firing 3-5 simultaneous fresh-session requests is exactly
    the pattern Yahoo's edge intermittently rate-limits/drops, which is why
    the FIRST analysis after backend idle often fails while an immediate
    retry succeeds. This wrapper absorbs that transient failure server-side
    instead of surfacing "AI did not return valid JSON" to the user.
    Runs inside asyncio.to_thread, so blocking time.sleep is fine here."""
    last_exc = None
    last_result = None
    for i in range(attempts):
        try:
            last_result = fn(*args, **kwargs)
            # Treat an empty/falsy result the same as a transient failure so
            # we retry on silent degraded responses (e.g. info={} on a cold
            # first call) rather than accepting empty data as success.
            if last_result:
                return last_result
            last_exc = None
        except Exception as e:
            last_exc = e
            last_result = None
        if i < attempts - 1:
            time.sleep(base_delay * (2 ** i))
    if last_exc is not None:
        raise last_exc
    return last_result


def _yf_quote_sync(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    info = {}
    try:
        info = dict(t.fast_info or {})
    except Exception:
        info = {}
    name = None
    exchange = None
    currency = info.get("currency")
    try:
        meta = t.info or {}
        name = meta.get("shortName") or meta.get("longName")
        exchange = meta.get("exchange") or meta.get("fullExchangeName")
        currency = currency or meta.get("currency")
    except Exception:
        meta = {}

    price = info.get("last_price") or info.get("lastPrice")
    prev_close = info.get("previous_close") or info.get("previousClose")
    day_high = info.get("day_high") or info.get("dayHigh")
    day_low = info.get("day_low") or info.get("dayLow")
    volume = info.get("last_volume") or info.get("lastVolume")
    market_state = info.get("market_state") or info.get("marketState")

    if price is None or prev_close is None:
        try:
            hist = t.history(period="5d", interval="1d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1]) if price is None else price
                if prev_close is None and len(hist) >= 2:
                    prev_close = float(hist["Close"].iloc[-2])
                if day_high is None:
                    day_high = float(hist["High"].iloc[-1])
                if day_low is None:
                    day_low = float(hist["Low"].iloc[-1])
                if volume is None:
                    volume = int(hist["Volume"].iloc[-1])
        except Exception:
            pass

    change = None
    change_pct = None
    if price is not None and prev_close:
        change = price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else None

    return {
        "ticker": ticker.upper(),
        "name": name or ticker.upper(),
        "price": float(price) if price is not None else None,
        "previous_close": float(prev_close) if prev_close is not None else None,
        "change": round(float(change), 4) if change is not None else None,
        "change_pct": round(float(change_pct), 4) if change_pct is not None else None,
        "currency": currency,
        "market_state": market_state,
        "volume": int(volume) if volume is not None else None,
        "day_high": float(day_high) if day_high is not None else None,
        "day_low": float(day_low) if day_low is not None else None,
        "exchange": exchange,
    }


@track("yfinance.get_quote")
async def get_quote(ticker: str) -> dict:
    """Returns a merged quote dict.

    - Finnhub (if configured) provides fresher live price, prev_close, day high/low.
    - yfinance provides metadata (name, exchange, currency, volume, fundamentals).

    When both succeed, Finnhub fields override price-related values. If Finnhub
    fails or isn't configured, yfinance-only data is returned (backward compatible).
    """
    from services.finnhub import get_quote as finnhub_quote, is_configured as fh_ready
    from services.idx_news import is_idx_ticker
    yf_task = asyncio.to_thread(_yf_quote_sync, ticker)
    # Finnhub's free tier doesn't cover IDX (.JK) — skip the call to avoid
    # log noise from 403 "You don't have access to this resource" responses.
    # IDX quotes are sourced from RapidAPI (primary) + yfinance (fallback)
    # via services/idx_rapidapi.py inside routers/analysis.py.
    if fh_ready() and not is_idx_ticker(ticker):
        fh_task = finnhub_quote(ticker)
        yf_data, fh_data = await asyncio.gather(yf_task, fh_task, return_exceptions=True)
    else:
        yf_data = await yf_task
        fh_data = None
    if isinstance(yf_data, Exception) or not isinstance(yf_data, dict):
        yf_data = {}
    # Safety net: yfinance intermittently returns empty/priceless dicts,
    # especially after Yahoo Finance API changes (confirmed broken for US
    # tickers mid-2025 onwards without Finnhub fallback). Retry up to 3×
    # with a short backoff before giving up — cheap and avoids surfacing
    # transient Yahoo rate-limit blips as hard failures to the user.
    if not yf_data.get("price"):
        for _attempt in range(3):
            await asyncio.sleep(1.0 * (_attempt + 1))  # 1s, 2s, 3s backoff
            retry_data = await asyncio.to_thread(_yf_quote_sync, ticker)
            if isinstance(retry_data, dict) and retry_data.get("price"):
                yf_data = retry_data
                break
    merged = dict(yf_data)
    if isinstance(fh_data, dict) and fh_data.get("price") is not None:
        # Prefer Finnhub for live market data
        merged["price"] = fh_data["price"]
        if fh_data.get("previous_close") is not None:
            merged["previous_close"] = fh_data["previous_close"]
        if fh_data.get("day_high") is not None:
            merged["day_high"] = fh_data["day_high"]
        if fh_data.get("day_low") is not None:
            merged["day_low"] = fh_data["day_low"]
        # Recompute change/change_pct
        p, pc = merged.get("price"), merged.get("previous_close")
        if p is not None and pc:
            merged["change"] = round(p - pc, 4)
            merged["change_percent"] = round(((p - pc) / pc) * 100, 4)
        merged["quote_source"] = "finnhub+yfinance"
    else:
        merged["quote_source"] = "yfinance"
    return merged


def _yf_history_fetch_once(ticker: str, period: str, interval: str) -> list:
    t = yf.Ticker(ticker)
    hist = t.history(period=period, interval=interval)
    if hist is None or hist.empty:
        return []
    out = []
    for idx, row in hist.iterrows():
        out.append({
            "date": idx.isoformat(),
            "open": float(row["Open"]) if not _isnan(row["Open"]) else None,
            "high": float(row["High"]) if not _isnan(row["High"]) else None,
            "low": float(row["Low"]) if not _isnan(row["Low"]) else None,
            "close": float(row["Close"]) if not _isnan(row["Close"]) else None,
            "volume": int(row["Volume"]) if not _isnan(row["Volume"]) else 0,
        })
    return out


def _yf_history_sync(ticker: str, period: str = "3mo", interval: str = "1d") -> list:
    try:
        return _with_retry(_yf_history_fetch_once, ticker, period, interval)
    except Exception:
        return []


def _yf_fundamentals_fetch_once(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    info = t.info or {}
    keys = [
        "shortName", "longName", "sector", "industry", "marketCap",
        "trailingPE", "forwardPE", "priceToBook", "dividendYield", "beta",
        "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "averageVolume",
        "profitMargins", "returnOnEquity", "trailingEps",
        "bookValue",  # per-share book value — feeds Graham Number + RIM intrinsic anchors
        "revenueGrowth", "earningsGrowth", "debtToEquity",
        "recommendationKey", "targetMeanPrice", "longBusinessSummary",
    ]
    return {k: info.get(k) for k in keys}


def _yf_fundamentals_sync(ticker: str) -> dict:
    try:
        return _with_retry(_yf_fundamentals_fetch_once, ticker)
    except Exception:
        return {}


def compute_technicals(history: list) -> dict:
    closes = [h["close"] for h in history if h.get("close") is not None]
    if len(closes) < 15:
        return {"rsi_14": None, "sma_20": None, "sma_50": None, "ema_12": None, "ema_26": None, "macd": None}

    def sma(values, n):
        return sum(values[-n:]) / n if len(values) >= n else None

    def ema(values, n):
        if len(values) < n:
            return None
        k = 2 / (n + 1)
        e = sum(values[:n]) / n
        for v in values[n:]:
            e = v * k + e * (1 - k)
        return e

    def rsi(values, n=14):
        if len(values) < n + 1:
            return None
        gains, losses = [], []
        for i in range(1, len(values)):
            d = values[i] - values[i - 1]
            gains.append(max(d, 0))
            losses.append(abs(min(d, 0)))
        avg_gain = sum(gains[-n:]) / n
        avg_loss = sum(losses[-n:]) / n
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd = (ema12 - ema26) if (ema12 is not None and ema26 is not None) else None
    sma20_val = sma(closes, 20)
    sma50_val = sma(closes, 50)
    price = closes[-1]

    # Trend regime: classify the current price/MA relationship so the LLM
    # can apply the reversal pattern confidence gate correctly.
    # bullish  = price > SMA20 > SMA50  (confirmed uptrend)
    # bearish  = price < SMA20 < SMA50  (confirmed downtrend)
    # mixed    = everything else (transition / conflicted)
    if sma20_val and sma50_val:
        if price > sma20_val and sma20_val > sma50_val:
            trend_regime = "bullish"
        elif price < sma20_val and sma20_val < sma50_val:
            trend_regime = "bearish"
        else:
            trend_regime = "mixed"
        # How far is price from each MA (as %)
        pct_from_sma20 = round((price / sma20_val - 1) * 100, 2)
        pct_from_sma50 = round((price / sma50_val - 1) * 100, 2) if sma50_val else None
    else:
        trend_regime = None
        pct_from_sma20 = None
        pct_from_sma50 = None

    return {
        "rsi_14": round(rsi(closes, 14), 2) if rsi(closes, 14) is not None else None,
        "sma_20": round(sma20_val, 4) if sma20_val is not None else None,
        "sma_50": round(sma50_val, 4) if sma50_val is not None else None,
        "ema_12": round(ema12, 4) if ema12 is not None else None,
        "ema_26": round(ema26, 4) if ema26 is not None else None,
        "macd": round(macd, 4) if macd is not None else None,
        "trend_regime": trend_regime,          # "bullish" | "bearish" | "mixed" | None
        "pct_from_sma20": pct_from_sma20,      # e.g. -8.3 = price 8.3% below SMA20
        "pct_from_sma50": pct_from_sma50,      # e.g. +12.1 = price 12.1% above SMA50
    }
