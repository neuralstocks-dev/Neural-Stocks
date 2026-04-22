"""Finnhub.io integration — real-time quotes, company news, analyst consensus,
earnings calendar. Falls back gracefully when unavailable or rate-limited.

Free-tier endpoints only:
- /quote (real-time)
- /company-news
- /stock/recommendation
- /calendar/earnings

Paid-only (skipped): /news-sentiment, /stock/price-target.

Sentiment is derived client-side from headlines via a keyword heuristic.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx

from core.config import FINNHUB_API_KEY
from services.sentiment import classify_sentiment_detailed

logger = logging.getLogger(__name__)
BASE = "https://finnhub.io/api/v1"

# Simple in-process TTL cache. Keyed by (endpoint, symbol).
_QUOTE_TTL = 60        # 1 min
_NEWS_TTL = 600        # 10 min
_ANALYST_TTL = 3600    # 1 hour
_EARNINGS_TTL = 3600   # 1 hour
_cache: dict = {}
_lock = asyncio.Lock()


def is_configured() -> bool:
    return bool(FINNHUB_API_KEY)


async def _get(path: str, params: dict, cache_key: str, ttl: int):
    if not is_configured():
        return None
    now = time.time()
    hit = _cache.get(cache_key)
    if hit and (now - hit["t"] < ttl):
        return hit["v"]
    params = {**params, "token": FINNHUB_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get(f"{BASE}{path}", params=params)
        if r.status_code == 429:
            logger.warning("Finnhub rate-limited %s", path)
            return hit["v"] if hit else None  # serve stale on throttle
        if r.status_code != 200:
            logger.info("Finnhub %s returned %s: %s", path, r.status_code, r.text[:150])
            return None
        data = r.json()
        if isinstance(data, dict) and data.get("error"):
            return None
        async with _lock:
            _cache[cache_key] = {"t": now, "v": data}
        return data
    except Exception as e:
        logger.info("Finnhub %s failed: %s", path, e)
        return hit["v"] if hit else None


async def get_quote(symbol: str) -> dict | None:
    """Returns {price, previous_close, day_high, day_low, open} or None.
    Finnhub returns: c=current, d=change, dp=change%, h=high, l=low, o=open, pc=prev_close."""
    data = await _get("/quote", {"symbol": symbol.upper()},
                      f"q:{symbol.upper()}", _QUOTE_TTL)
    if not isinstance(data, dict):
        return None
    price = data.get("c")
    if not price:
        return None
    return {
        "price": float(price),
        "previous_close": float(data["pc"]) if data.get("pc") else None,
        "day_high": float(data["h"]) if data.get("h") else None,
        "day_low": float(data["l"]) if data.get("l") else None,
        "open": float(data["o"]) if data.get("o") else None,
        "source": "finnhub",
    }


# ----- Sentiment heuristic — delegated to services/sentiment ---------------
# Backwards-compat aliases so existing tests that import these still work.
def _classify_sentiment(headline: str) -> str:
    return classify_sentiment_detailed(headline)["sentiment"]


def _classify_sentiment_detailed(headline: str) -> dict:
    return classify_sentiment_detailed(headline)


async def get_company_news(symbol: str, limit: int = 6) -> list[dict]:
    """Returns latest {limit} news items with heuristic sentiment + a 7-day
    daily sentiment sparkline computed from the full window (not just the
    headline preview)."""
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=7)
    data = await _get(
        "/company-news",
        {"symbol": symbol.upper(), "from": start.isoformat(), "to": today.isoformat()},
        f"news:{symbol.upper()}",
        _NEWS_TTL,
    )
    if not isinstance(data, list):
        return []
    # Finnhub returns newest-first already, but sort defensively
    data = sorted(data, key=lambda x: x.get("datetime", 0), reverse=True)

    # --- Build 7-day sparkline from ALL articles (not just preview) ------
    day_buckets: dict[str, dict] = {}
    for item in data:
        ts = item.get("datetime")
        if not ts:
            continue
        try:
            day = datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        except Exception:
            continue
        s = _classify_sentiment_detailed(item.get("headline") or "")["sentiment"]
        bucket = day_buckets.setdefault(day, {"pos": 0, "neg": 0, "total": 0})
        if s == "positive":
            bucket["pos"] += 1
        elif s == "negative":
            bucket["neg"] += 1
        bucket["total"] += 1
    # Emit exactly 7 consecutive days (oldest → newest), filling gaps with 0
    sparkline = []
    for i in range(7, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        b = day_buckets.get(day, {"pos": 0, "neg": 0, "total": 0})
        score = 0.0
        if b["total"] > 0:
            score = round((b["pos"] - b["neg"]) / b["total"], 2)
        sparkline.append({
            "date": day,
            "score": score,
            "positive": b["pos"],
            "negative": b["neg"],
            "total": b["total"],
        })

    # --- Top-N preview articles with per-article triggers ----------------
    out = []
    pos = neg = total = 0
    for item in data[:limit]:
        headline = (item.get("headline") or "").strip()
        detail = _classify_sentiment_detailed(headline)
        senti = detail["sentiment"]
        if senti == "positive":
            pos += 1
        elif senti == "negative":
            neg += 1
        total += 1
        ts = item.get("datetime")
        out.append({
            "headline": headline,
            "summary": (item.get("summary") or "").strip()[:280],
            "source": item.get("source"),
            "url": item.get("url"),
            "published_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
            "sentiment": senti,
            "sentiment_triggers": detail["triggers"],
        })
    # Compute aggregate buzz score (-1..+1) across the *preview set*
    score = 0.0
    if total > 0:
        score = round((pos - neg) / total, 2)
    return {
        "articles": out,
        "total_scanned": len(data),
        "summary_sentiment": "positive" if score > 0.1 else "negative" if score < -0.1 else "neutral",
        "score": score,
        "sentiment_method": "neulab_keyword_heuristic",
        "daily_sentiment": sparkline,
    }


async def get_analyst_consensus(symbol: str) -> dict | None:
    """Returns {strong_buy, buy, hold, sell, strong_sell, total, recommendation_label, period}."""
    data = await _get("/stock/recommendation", {"symbol": symbol.upper()},
                      f"rec:{symbol.upper()}", _ANALYST_TTL)
    if not isinstance(data, list) or not data:
        return None
    # First item is most recent period
    latest = data[0]
    sb = int(latest.get("strongBuy") or 0)
    b = int(latest.get("buy") or 0)
    h = int(latest.get("hold") or 0)
    s = int(latest.get("sell") or 0)
    ss = int(latest.get("strongSell") or 0)
    total = sb + b + h + s + ss
    if total == 0:
        return None
    # Weighted score: strongBuy +2, buy +1, hold 0, sell -1, strongSell -2 -> normalized to -1..1
    raw = (sb * 2 + b - s - ss * 2) / (total * 2)
    if raw > 0.35:
        label = "BUY"
    elif raw > 0.05:
        label = "OVERWEIGHT"
    elif raw > -0.05:
        label = "HOLD"
    elif raw > -0.35:
        label = "UNDERWEIGHT"
    else:
        label = "SELL"
    return {
        "strong_buy": sb,
        "buy": b,
        "hold": h,
        "sell": s,
        "strong_sell": ss,
        "total": total,
        "period": latest.get("period"),
        "score": round(raw, 2),
        "recommendation_label": label,
    }


async def get_next_earnings(symbol: str) -> dict | None:
    today = datetime.now(timezone.utc).date()
    end = today + timedelta(days=120)
    data = await _get(
        "/calendar/earnings",
        {"symbol": symbol.upper(), "from": today.isoformat(), "to": end.isoformat()},
        f"earn:{symbol.upper()}",
        _EARNINGS_TTL,
    )
    if not isinstance(data, dict):
        return None
    cal = data.get("earningsCalendar") or []
    if not cal:
        return None
    next_ = cal[0]
    rev_est = next_.get("revenueEstimate")
    days_until = None
    try:
        d = datetime.fromisoformat(next_["date"]).date()
        days_until = (d - today).days
    except Exception:
        pass
    return {
        "date": next_.get("date"),
        "days_until": days_until,
        "hour": next_.get("hour"),  # "bmo"=before open, "amc"=after close, "dmh"=during market
        "quarter": next_.get("quarter"),
        "year": next_.get("year"),
        "eps_estimate": next_.get("epsEstimate"),
        "revenue_estimate": rev_est,
    }


async def get_market_context(symbol: str) -> dict:
    """One-shot: fetch news + analyst + earnings in parallel. Returns partial
    dict with whatever succeeded (each key may be None/empty)."""
    if not is_configured():
        return {"configured": False}
    news, analyst, earnings = await asyncio.gather(
        get_company_news(symbol),
        get_analyst_consensus(symbol),
        get_next_earnings(symbol),
        return_exceptions=True,
    )
    return {
        "configured": True,
        "news": news if isinstance(news, dict) else None,
        "analyst_consensus": analyst if isinstance(analyst, dict) else None,
        "earnings": earnings if isinstance(earnings, dict) else None,
    }
