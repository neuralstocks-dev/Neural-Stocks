"""yfinance quote / history / fundamentals / technicals helpers."""
import asyncio
import math
import yfinance as yf


def _isnan(x) -> bool:
    try:
        return math.isnan(float(x))
    except Exception:
        return False


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


async def get_quote(ticker: str) -> dict:
    return await asyncio.to_thread(_yf_quote_sync, ticker)


def _yf_history_sync(ticker: str, period: str = "3mo", interval: str = "1d") -> list:
    t = yf.Ticker(ticker)
    try:
        hist = t.history(period=period, interval=interval)
    except Exception:
        return []
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


def _yf_fundamentals_sync(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    try:
        info = t.info or {}
    except Exception:
        info = {}
    keys = [
        "shortName", "longName", "sector", "industry", "marketCap",
        "trailingPE", "forwardPE", "priceToBook", "dividendYield", "beta",
        "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "averageVolume",
        "profitMargins", "returnOnEquity", "trailingEps",
        "revenueGrowth", "earningsGrowth", "debtToEquity",
        "recommendationKey", "targetMeanPrice", "longBusinessSummary",
    ]
    return {k: info.get(k) for k in keys}


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
    return {
        "rsi_14": round(rsi(closes, 14), 2) if rsi(closes, 14) is not None else None,
        "sma_20": round(sma(closes, 20), 4) if sma(closes, 20) is not None else None,
        "sma_50": round(sma(closes, 50), 4) if sma(closes, 50) is not None else None,
        "ema_12": round(ema12, 4) if ema12 is not None else None,
        "ema_26": round(ema26, 4) if ema26 is not None else None,
        "macd": round(macd, 4) if macd is not None else None,
    }
