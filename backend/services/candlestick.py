"""Candlestick pattern detection.

Pure-Python, deterministic OHLC pattern scanner. No external deps beyond the
standard library. Designed to run on the last N candles of a history returned
by services/yfinance_svc._yf_history_sync(), but will accept any list of
{open, high, low, close, date} dicts.

Supported patterns (15):
  Single-candle: Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man
  Two-candle: Bullish Engulfing, Bearish Engulfing, Harami,
              Piercing Line, Dark Cloud Cover, Tweezer Top, Tweezer Bottom
  Three-candle: Morning Star, Evening Star, Three White Soldiers, Three Black Crows

Each detected pattern returns:
  {
    "pattern": human-readable name,
    "bias": "bullish" | "bearish" | "neutral",
    "candle_date": ISO date of the most recent candle in the pattern,
    "strength": 0-100 integer (detector confidence — NOT trade confidence),
    "explanation": plain-English reason,
  }

Scan entry point: `scan(history, lookback=10, timeframe="daily")`
"""
from __future__ import annotations
from typing import Optional

# --- helpers ----------------------------------------------------------------

def _body(c: dict) -> float:
    return abs(c["close"] - c["open"])


def _range(c: dict) -> float:
    return max(c["high"] - c["low"], 1e-9)  # avoid /0


def _upper_wick(c: dict) -> float:
    return c["high"] - max(c["open"], c["close"])


def _lower_wick(c: dict) -> float:
    return min(c["open"], c["close"]) - c["low"]


def _is_bull(c: dict) -> bool:
    return c["close"] > c["open"]


def _is_bear(c: dict) -> bool:
    return c["close"] < c["open"]


def _trend_before(history: list, idx: int, window: int = 10) -> str:
    """Returns 'up', 'down', or 'flat' based on close trajectory before idx."""
    start = max(0, idx - window)
    segment = history[start:idx]
    closes = [h["close"] for h in segment if h.get("close") is not None]
    if len(closes) < 3:
        return "flat"
    change = (closes[-1] - closes[0]) / closes[0]
    if change > 0.02:
        return "up"
    if change < -0.02:
        return "down"
    return "flat"


def _valid(c: dict) -> bool:
    return all(c.get(k) is not None for k in ("open", "high", "low", "close"))


# --- single-candle detectors ------------------------------------------------

def _doji(c: dict) -> Optional[dict]:
    rng = _range(c)
    body = _body(c)
    if rng > 0 and body <= 0.1 * rng:
        return {
            "pattern": "Doji",
            "bias": "neutral",
            "strength": 60,
            "explanation": "Open and close nearly equal — indecision between buyers and sellers. Often precedes a reversal when it appears after a strong move.",
        }
    return None


def _hammer_family(c: dict, trend: str) -> Optional[dict]:
    """Detects Hammer / Inverted Hammer / Hanging Man / Shooting Star."""
    rng = _range(c)
    body = _body(c)
    upper = _upper_wick(c)
    lower = _lower_wick(c)

    if body == 0 or rng == 0:
        return None

    small_body = body <= 0.35 * rng
    long_lower = lower >= 2 * body
    long_upper = upper >= 2 * body
    tiny_lower = lower <= 0.15 * rng
    tiny_upper = upper <= 0.15 * rng

    # Hammer: small body at top, long lower wick, tiny upper wick, after downtrend
    if small_body and long_lower and tiny_upper:
        if trend == "down":
            return {
                "pattern": "Hammer",
                "bias": "bullish",
                "strength": 72,
                "explanation": "Small body at the top with a long lower shadow after a downtrend. Sellers pushed price lower intraday but buyers drove it back up — often signals a bullish reversal.",
            }
        if trend == "up":
            return {
                "pattern": "Hanging Man",
                "bias": "bearish",
                "strength": 65,
                "explanation": "Hammer-shaped candle appearing after an uptrend. The long lower shadow shows sellers tested lower prices — a potential bearish reversal warning.",
            }

    # Inverted Hammer / Shooting Star: small body at bottom, long upper, tiny lower
    if small_body and long_upper and tiny_lower:
        if trend == "down":
            return {
                "pattern": "Inverted Hammer",
                "bias": "bullish",
                "strength": 65,
                "explanation": "Small body at the bottom with a long upper shadow after a downtrend. Buyers attempted a rally — often signals a potential bullish reversal (needs confirmation).",
            }
        if trend == "up":
            return {
                "pattern": "Shooting Star",
                "bias": "bearish",
                "strength": 72,
                "explanation": "Small body at the bottom with a long upper shadow after an uptrend. Buyers pushed price higher but sellers rejected — classic bearish reversal.",
            }
    return None


# --- two-candle detectors ---------------------------------------------------

def _engulfing(prev: dict, curr: dict) -> Optional[dict]:
    prev_body_top = max(prev["open"], prev["close"])
    prev_body_bot = min(prev["open"], prev["close"])
    curr_body_top = max(curr["open"], curr["close"])
    curr_body_bot = min(curr["open"], curr["close"])
    # Current body must engulf previous body
    if curr_body_top < prev_body_top or curr_body_bot > prev_body_bot:
        return None
    if _body(curr) < 1.1 * _body(prev):
        return None
    if _is_bear(prev) and _is_bull(curr):
        return {
            "pattern": "Bullish Engulfing",
            "bias": "bullish",
            "strength": 78,
            "explanation": "A large green candle fully engulfs the prior red candle's body. Buyers aggressively overtook sellers — strong bullish reversal signal.",
        }
    if _is_bull(prev) and _is_bear(curr):
        return {
            "pattern": "Bearish Engulfing",
            "bias": "bearish",
            "strength": 78,
            "explanation": "A large red candle fully engulfs the prior green candle's body. Sellers aggressively overtook buyers — strong bearish reversal signal.",
        }
    return None


def _harami(prev: dict, curr: dict) -> Optional[dict]:
    prev_body_top = max(prev["open"], prev["close"])
    prev_body_bot = min(prev["open"], prev["close"])
    curr_body_top = max(curr["open"], curr["close"])
    curr_body_bot = min(curr["open"], curr["close"])
    if _body(prev) < 2 * _body(curr):
        return None
    if curr_body_top > prev_body_top or curr_body_bot < prev_body_bot:
        return None
    if _is_bear(prev) and _is_bull(curr):
        return {
            "pattern": "Bullish Harami",
            "bias": "bullish",
            "strength": 62,
            "explanation": "A small green candle contained inside the prior large red candle's body. Selling momentum is pausing — potential reversal if confirmed next session.",
        }
    if _is_bull(prev) and _is_bear(curr):
        return {
            "pattern": "Bearish Harami",
            "bias": "bearish",
            "strength": 62,
            "explanation": "A small red candle contained inside the prior large green candle's body. Buying momentum is pausing — potential reversal if confirmed next session.",
        }
    return None


def _piercing_darkcloud(prev: dict, curr: dict) -> Optional[dict]:
    prev_mid = (prev["open"] + prev["close"]) / 2
    # Piercing Line: prev red, curr green opens below prev low, closes above prev mid
    if _is_bear(prev) and _is_bull(curr):
        if curr["open"] < prev["low"] and curr["close"] > prev_mid and curr["close"] < prev["open"]:
            return {
                "pattern": "Piercing Line",
                "bias": "bullish",
                "strength": 70,
                "explanation": "Today's green candle opened below yesterday's low but closed above the midpoint of yesterday's red body. Bulls forcefully reversed the gap — bullish reversal signal.",
            }
    # Dark Cloud Cover: prev green, curr red opens above prev high, closes below prev mid
    if _is_bull(prev) and _is_bear(curr):
        if curr["open"] > prev["high"] and curr["close"] < prev_mid and curr["close"] > prev["open"]:
            return {
                "pattern": "Dark Cloud Cover",
                "bias": "bearish",
                "strength": 70,
                "explanation": "Today's red candle opened above yesterday's high but closed below the midpoint of yesterday's green body. Bears forcefully reversed the gap — bearish reversal signal.",
            }
    return None


def _tweezer(prev: dict, curr: dict, trend: str) -> Optional[dict]:
    avg_price = (prev["close"] + curr["close"]) / 2
    tolerance = 0.003 * avg_price  # 0.3%
    if trend == "up" and abs(prev["high"] - curr["high"]) <= tolerance and _is_bull(prev) and _is_bear(curr):
        return {
            "pattern": "Tweezer Top",
            "bias": "bearish",
            "strength": 60,
            "explanation": "Two consecutive candles with nearly equal highs at the top of an uptrend. Buyers failed twice at the same resistance — a bearish reversal warning.",
        }
    if trend == "down" and abs(prev["low"] - curr["low"]) <= tolerance and _is_bear(prev) and _is_bull(curr):
        return {
            "pattern": "Tweezer Bottom",
            "bias": "bullish",
            "strength": 60,
            "explanation": "Two consecutive candles with nearly equal lows at the bottom of a downtrend. Sellers failed twice at the same support — a bullish reversal signal.",
        }
    return None


# --- three-candle detectors -------------------------------------------------

def _morning_evening_star(c1: dict, c2: dict, c3: dict) -> Optional[dict]:
    c1_body = _body(c1)
    c2_body = _body(c2)
    c3_body = _body(c3)
    c1_mid = (c1["open"] + c1["close"]) / 2
    # Star candle must have small body
    if c2_body > 0.4 * c1_body:
        return None
    # Morning Star: red → small → green closing above c1 midpoint
    if _is_bear(c1) and _is_bull(c3) and c3["close"] > c1_mid and c3_body > 0.5 * c1_body:
        return {
            "pattern": "Morning Star",
            "bias": "bullish",
            "strength": 82,
            "explanation": "Three-candle reversal: a long red candle, a small indecisive body (gap down), then a strong green candle closing into the first candle's body. Classic bullish reversal.",
        }
    # Evening Star: green → small → red closing below c1 midpoint
    if _is_bull(c1) and _is_bear(c3) and c3["close"] < c1_mid and c3_body > 0.5 * c1_body:
        return {
            "pattern": "Evening Star",
            "bias": "bearish",
            "strength": 82,
            "explanation": "Three-candle reversal: a long green candle, a small indecisive body (gap up), then a strong red candle closing into the first candle's body. Classic bearish reversal.",
        }
    return None


def _three_soldiers_crows(c1: dict, c2: dict, c3: dict) -> Optional[dict]:
    # Each candle must have strong body and progressive close
    bodies_ok = all(_body(c) > 0.5 * _range(c) for c in (c1, c2, c3))
    if not bodies_ok:
        return None
    # Three White Soldiers
    if all(_is_bull(c) for c in (c1, c2, c3)):
        if c2["close"] > c1["close"] and c3["close"] > c2["close"]:
            if c2["open"] >= c1["open"] and c3["open"] >= c2["open"]:
                return {
                    "pattern": "Three White Soldiers",
                    "bias": "bullish",
                    "strength": 85,
                    "explanation": "Three consecutive strong green candles with progressively higher closes. Persistent buying pressure — a powerful bullish continuation / reversal from a downtrend.",
                }
    # Three Black Crows
    if all(_is_bear(c) for c in (c1, c2, c3)):
        if c2["close"] < c1["close"] and c3["close"] < c2["close"]:
            if c2["open"] <= c1["open"] and c3["open"] <= c2["open"]:
                return {
                    "pattern": "Three Black Crows",
                    "bias": "bearish",
                    "strength": 85,
                    "explanation": "Three consecutive strong red candles with progressively lower closes. Persistent selling pressure — a powerful bearish continuation / reversal from an uptrend.",
                }
    return None


# --- public API --------------------------------------------------------------

def scan(history: list, lookback: int = 10, timeframe: str = "daily") -> dict:
    """Scan the last `lookback` candles for patterns.

    Args:
        history: list of {open, high, low, close, date} dicts, chronologically sorted.
        lookback: how many trailing candles to scan (patterns ending inside this window).
        timeframe: label for the returned dict (e.g. "daily", "weekly").

    Returns:
        {
            "timeframe": str,
            "scanned_candles": int,
            "candles_examined_range": {"from": iso, "to": iso},
            "patterns": [ {pattern, bias, candle_date, strength, explanation}, ... ],
            "net_bias": "bullish" | "bearish" | "neutral",
            "bias_score": int (-100..100),
        }
    """
    hist = [c for c in history if _valid(c)]
    if len(hist) < 3:
        return {
            "timeframe": timeframe,
            "scanned_candles": len(hist),
            "candles_examined_range": None,
            "patterns": [],
            "net_bias": "neutral",
            "bias_score": 0,
        }

    lookback = min(lookback, len(hist))
    start_idx = len(hist) - lookback
    found: list = []

    # Compute 20-candle average volume for volume confirmation gate
    # Uses all available history up to the scan window for a stable baseline
    vol_window = [c.get("volume") or 0 for c in hist if (c.get("volume") or 0) > 0]
    avg_vol_20 = sum(vol_window[-20:]) / len(vol_window[-20:]) if len(vol_window) >= 5 else None

    for i in range(start_idx, len(hist)):
        curr = hist[i]
        trend = _trend_before(hist, i)
        # Volume ratio for this session vs 20-period average
        curr_vol = curr.get("volume") or 0
        vol_ratio = round(curr_vol / avg_vol_20, 2) if avg_vol_20 and avg_vol_20 > 0 else None
        vol_confirmed = vol_ratio is None or vol_ratio >= 0.8  # treat missing volume as confirmed

        # Single
        for det in (_doji(curr), _hammer_family(curr, trend)):
            if det:
                found.append({**det, "candle_date": curr["date"],
                               "vol_ratio": vol_ratio,
                               "vol_confirmed": vol_confirmed})
        # Two-candle
        if i >= 1:
            prev = hist[i - 1]
            for det in (_engulfing(prev, curr), _harami(prev, curr),
                        _piercing_darkcloud(prev, curr), _tweezer(prev, curr, trend)):
                if det:
                    found.append({**det, "candle_date": curr["date"],
                                   "vol_ratio": vol_ratio,
                                   "vol_confirmed": vol_confirmed})
        # Three-candle
        if i >= 2:
            c1, c2, c3 = hist[i - 2], hist[i - 1], hist[i]
            for det in (_morning_evening_star(c1, c2, c3),
                        _three_soldiers_crows(c1, c2, c3)):
                if det:
                    found.append({**det, "candle_date": curr["date"],
                                   "vol_ratio": vol_ratio,
                                   "vol_confirmed": vol_confirmed})

    # Dedupe: keep the strongest pattern per (pattern_name, candle_date)
    seen = {}
    for p in found:
        key = (p["pattern"], p["candle_date"])
        if key not in seen or p["strength"] > seen[key]["strength"]:
            seen[key] = p
    patterns = sorted(seen.values(), key=lambda x: (x["candle_date"], -x["strength"]))

    # Compute net bias score (recent patterns weighted more)
    # Patterns without volume confirmation are downweighted by 50%
    score = 0
    for p in patterns:
        w = p["strength"] / 100.0
        if not p.get("vol_confirmed", True):
            w *= 0.5  # halve weight for low-volume, unconfirmed patterns
        if p["bias"] == "bullish":
            score += 20 * w
        elif p["bias"] == "bearish":
            score -= 20 * w
    score = max(-100, min(100, round(score)))
    if score >= 15:
        net = "bullish"
    elif score <= -15:
        net = "bearish"
    else:
        net = "neutral"

    return {
        "timeframe": timeframe,
        "scanned_candles": lookback,
        "candles_examined_range": {
            "from": hist[start_idx]["date"],
            "to": hist[-1]["date"],
        },
        "patterns": patterns,
        "net_bias": net,
        "bias_score": score,
    }


def scan_daily_and_weekly(daily_history: list, weekly_history: list,
                          lookback_daily: int = 10,
                          lookback_weekly: int = 6) -> dict:
    """Convenience: scan both daily and weekly histories and return a combined
    findings object consumable by the AI layer and UI."""
    daily = scan(daily_history, lookback=lookback_daily, timeframe="daily")
    weekly = scan(weekly_history, lookback=lookback_weekly, timeframe="weekly")
    # Combined bias: daily weighted 60%, weekly 40%
    combined = round(0.6 * daily["bias_score"] + 0.4 * weekly["bias_score"])
    if combined >= 15:
        combined_bias = "bullish"
    elif combined <= -15:
        combined_bias = "bearish"
    else:
        combined_bias = "neutral"
    return {
        "daily": daily,
        "weekly": weekly,
        "combined_bias": combined_bias,
        "combined_score": combined,
    }
