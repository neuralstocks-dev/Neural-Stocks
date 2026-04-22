"""Tests for candlestick pattern detection."""
import pytest
from services.candlestick import scan, scan_daily_and_weekly


def make_candle(date: str, o: float, h: float, l: float, c: float) -> dict:
    return {"date": date, "open": o, "high": h, "low": l, "close": c, "volume": 1000000}


def build_downtrend(n: int = 8, start: float = 110.0, step: float = 1.0) -> list:
    """Generate N boring red candles in a downtrend ending at start-(n-1)*step."""
    out = []
    for i in range(n):
        price = start - i * step
        out.append(make_candle(f"2026-01-{i+1:02d}", price + 0.5, price + 0.6, price - 0.2, price))
    return out


def build_uptrend(n: int = 8, start: float = 100.0, step: float = 1.0) -> list:
    out = []
    for i in range(n):
        price = start + i * step
        out.append(make_candle(f"2026-01-{i+1:02d}", price - 0.5, price + 0.2, price - 0.6, price))
    return out


def test_empty_history_returns_empty_findings():
    result = scan([])
    assert result["patterns"] == []
    assert result["net_bias"] == "neutral"
    assert result["bias_score"] == 0


def test_doji_detected():
    hist = build_uptrend(5) + [make_candle("2026-02-01", 100.0, 105.0, 95.0, 100.1)]
    result = scan(hist, lookback=3)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Doji" in names


def test_hammer_in_downtrend():
    # Build downtrend with varied bodies (so we don't trigger Three Black Crows
    # which would be a valid competing signal), then place a hammer.
    hist = [
        make_candle("2026-01-01", 110.5, 111.0, 110.0, 110.2),  # small
        make_candle("2026-01-02", 108.0, 108.5, 107.0, 107.5),
        make_candle("2026-01-03", 107.5, 107.8, 106.5, 106.8),
        make_candle("2026-01-04", 106.0, 106.3, 105.0, 105.2),
        make_candle("2026-01-05", 104.5, 104.8, 103.0, 103.2),
        make_candle("2026-01-06", 102.5, 102.8, 101.0, 101.2),  # broken pattern of TBC by sizes
        # Hammer
        make_candle("2026-02-01", 100.0, 100.5, 90.0, 100.2),
    ]
    result = scan(hist, lookback=2)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Hammer" in names


def test_shooting_star_in_uptrend():
    hist = build_uptrend(6, step=0.5)  # gentler uptrend
    star = make_candle("2026-02-01", 108.0, 118.0, 107.7, 108.2)
    hist.append(star)
    result = scan(hist, lookback=2)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Shooting Star" in names


def test_bullish_engulfing():
    # Prev red candle, curr green engulfs
    hist = build_downtrend(6)
    prev = make_candle("2026-02-01", 105.0, 105.5, 103.0, 103.5)
    curr = make_candle("2026-02-02", 103.0, 108.0, 102.5, 107.5)
    hist += [prev, curr]
    result = scan(hist, lookback=3)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Bullish Engulfing" in names


def test_bearish_engulfing():
    hist = build_uptrend(6)
    prev = make_candle("2026-02-01", 105.0, 107.0, 104.5, 106.5)
    curr = make_candle("2026-02-02", 107.0, 107.5, 103.0, 103.5)
    hist += [prev, curr]
    result = scan(hist, lookback=3)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Bearish Engulfing" in names


def test_morning_star():
    hist = build_downtrend(6)
    c1 = make_candle("2026-02-01", 105.0, 105.5, 100.0, 100.5)  # long red
    c2 = make_candle("2026-02-02", 99.5, 100.0, 98.8, 99.3)      # small indecisive
    c3 = make_candle("2026-02-03", 99.8, 106.0, 99.5, 105.5)     # strong green
    hist += [c1, c2, c3]
    result = scan(hist, lookback=5)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Morning Star" in names


def test_three_white_soldiers():
    hist = build_downtrend(6)
    c1 = make_candle("2026-02-01", 100.0, 103.0, 99.8, 102.8)
    c2 = make_candle("2026-02-02", 102.5, 105.5, 102.3, 105.3)
    c3 = make_candle("2026-02-03", 105.0, 108.0, 104.8, 107.8)
    hist += [c1, c2, c3]
    result = scan(hist, lookback=5)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Three White Soldiers" in names


def test_three_black_crows():
    hist = build_uptrend(6)
    c1 = make_candle("2026-02-01", 108.0, 108.3, 105.0, 105.2)
    c2 = make_candle("2026-02-02", 105.5, 105.8, 102.0, 102.3)
    c3 = make_candle("2026-02-03", 102.5, 102.7, 99.0, 99.2)
    hist += [c1, c2, c3]
    result = scan(hist, lookback=5)
    names = [p["pattern"] for p in result["patterns"]]
    assert "Three Black Crows" in names


def test_scan_daily_and_weekly_combined():
    daily = build_uptrend(8)
    star = make_candle("2026-02-01", 108.0, 118.0, 107.7, 108.2)
    daily.append(star)
    weekly = build_uptrend(6, start=100.0, step=2.0)
    result = scan_daily_and_weekly(daily, weekly)
    assert "daily" in result
    assert "weekly" in result
    assert "combined_bias" in result
    assert result["combined_bias"] in ("bullish", "bearish", "neutral")


def test_no_patterns_returns_neutral():
    # Pure sideways, no reversal shape
    hist = [make_candle(f"2026-01-{i+1:02d}", 100.0, 100.5, 99.5, 100.1) for i in range(6)]
    result = scan(hist, lookback=5)
    # May or may not find doji depending on exact body size
    # but net_bias should not be strongly bullish/bearish
    assert result["bias_score"] <= 15 and result["bias_score"] >= -15
