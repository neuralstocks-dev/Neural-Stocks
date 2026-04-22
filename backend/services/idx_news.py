"""IDX (Indonesia Stock Exchange) news scraper.

Finnhub does not cover IDX tickers on the free tier. This module fills the gap
by pulling Indonesian-language market RSS feeds (CNBC Indonesia Market, Detik
Finance) and filtering them by ticker / company-name mention.

Returns the same shape as `services.finnhub.get_company_news()` so the UI and
PDF consumers don't have to special-case IDX.

Design notes:
  * RSS feeds only — no scraping of HTML pages. Fast + stable.
  * Ticker matching: exact 4-letter IDX code (case-insensitive, word-boundary)
    OR any alias from `IDX_ALIASES` (common company names, abbreviations).
  * Sentiment classifier is the shared Neulab heuristic (EN + ID vocabulary).
  * In-process TTL cache (10 min) to avoid hammering the feeds.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from services.sentiment import classify_sentiment_detailed

logger = logging.getLogger(__name__)

_FEEDS = [
    ("CNBC Indonesia", "https://www.cnbcindonesia.com/market/rss"),
    ("Detik Finance", "https://finance.detik.com/rss"),
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; NeulabBot/1.0; +https://neulab.xyz)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

# Shared TTL cache keyed by feed URL
_FEED_TTL = 600  # 10 min
_feed_cache: dict[str, dict] = {}
_feed_lock = asyncio.Lock()

# Ticker → list of alias strings the ticker might be referred to in Bahasa press
# headlines. Bare 4-letter ticker is always added at lookup time.
IDX_ALIASES: dict[str, list[str]] = {
    "BBCA": ["Bank Central Asia", "BCA"],
    "BBRI": ["Bank Rakyat Indonesia", "BRI"],
    "BMRI": ["Bank Mandiri", "Mandiri"],
    "BBNI": ["Bank Negara Indonesia", "BNI"],
    "TLKM": ["Telkom Indonesia", "Telkom"],
    "ASII": ["Astra International", "Astra"],
    "UNVR": ["Unilever Indonesia", "Unilever"],
    "GOTO": ["GoTo Gojek Tokopedia", "Gojek", "Tokopedia"],
    "ICBP": ["Indofood CBP", "Indofood"],
    "INDF": ["Indofood Sukses Makmur"],
    "KLBF": ["Kalbe Farma", "Kalbe"],
    "EXCL": ["XL Axiata"],
    "SMGR": ["Semen Indonesia", "Semen"],
    "JSMR": ["Jasa Marga"],
    "PGAS": ["PGN", "Perusahaan Gas Negara"],
    "ADRO": ["Adaro Energy", "Adaro"],
    "ANTM": ["Aneka Tambang", "Antam"],
    "PTBA": ["Bukit Asam"],
    "BREN": ["Barito Renewables"],
    "DSSA": ["Dian Swastatika Sentosa"],
    "GGRM": ["Gudang Garam"],
    "HMSP": ["HM Sampoerna", "Sampoerna"],
}


def _strip_jk(symbol: str) -> str:
    """'BBCA.JK' → 'BBCA'. Leaves symbols without suffix unchanged."""
    s = (symbol or "").upper().strip()
    return s[:-3] if s.endswith(".JK") else s


def is_idx_ticker(symbol: str) -> bool:
    return (symbol or "").upper().endswith(".JK")


async def _fetch_feed(name: str, url: str) -> list[dict]:
    """Returns a normalized list of {title, link, summary, published_at (iso),
    source}. Uses a 10-min TTL cache. Failures return [] (never raise)."""
    now = time.time()
    hit = _feed_cache.get(url)
    if hit and (now - hit["t"] < _FEED_TTL):
        return hit["v"]
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_HEADERS) as hc:
            r = await hc.get(url, follow_redirects=True)
        if r.status_code != 200:
            logger.info("IDX feed %s HTTP %s", name, r.status_code)
            return hit["v"] if hit else []
        root = ET.fromstring(r.text)
    except Exception as e:
        logger.info("IDX feed %s failed: %s", name, e)
        return hit["v"] if hit else []

    out: list[dict] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        link = (item.findtext("link") or "").strip()
        summary = (item.findtext("description") or "").strip()
        # Strip HTML tags from description for a clean preview
        summary = re.sub(r"<[^>]+>", " ", summary)
        summary = re.sub(r"\s+", " ", summary).strip()[:280]
        pub_raw = (item.findtext("pubDate") or "").strip()
        published_at = None
        try:
            dt = parsedate_to_datetime(pub_raw)
            if dt is not None:
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                published_at = dt.astimezone(timezone.utc).isoformat()
        except Exception:
            published_at = None
        out.append({
            "headline": title,
            "summary": summary,
            "source": name,
            "url": link,
            "published_at": published_at,
        })
    _feed_cache[url] = {"t": now, "v": out}
    return out


def _build_matcher(symbol: str) -> re.Pattern:
    """Builds a case-insensitive regex that matches the ticker or any alias,
    bounded by word boundaries so 'BRI' doesn't match 'brief'."""
    code = _strip_jk(symbol)
    aliases = [code] + IDX_ALIASES.get(code, [])
    # Sort longest first so 'Bank Rakyat Indonesia' matches before 'BRI'
    aliases = sorted({a.strip() for a in aliases if a.strip()}, key=len, reverse=True)
    pattern = r"\b(?:" + "|".join(re.escape(a) for a in aliases) + r")\b"
    return re.compile(pattern, re.IGNORECASE)


async def get_company_news_idx(symbol: str, limit: int = 6) -> dict | None:
    """Fetch IDX news for a .JK ticker. Returns the same shape as
    `finnhub.get_company_news()` so consumers don't need to branch."""
    code = _strip_jk(symbol)
    matcher = _build_matcher(symbol)

    async with _feed_lock:
        pass  # no-op, cache writes are atomic-per-feed
    items_nested = await asyncio.gather(*[_fetch_feed(n, u) for n, u in _FEEDS])
    all_items: list[dict] = []
    for batch in items_nested:
        all_items.extend(batch)

    # Match by ticker / alias in headline + summary. Headline is higher-signal.
    matched: list[dict] = []
    for it in all_items:
        hay = f"{it.get('headline', '')} {it.get('summary', '')}"
        if matcher.search(hay):
            matched.append(it)

    if not matched:
        return {
            "articles": [],
            "total_scanned": len(all_items),
            "summary_sentiment": "neutral",
            "score": 0.0,
            "sentiment_method": "neulab_keyword_heuristic_idx",
            "daily_sentiment": _empty_sparkline(),
            "matched_ticker": code,
        }

    # Deduplicate by URL (some RSS feeds syndicate the same story)
    seen = set()
    deduped = []
    for it in matched:
        u = it.get("url") or it.get("headline")
        if u in seen:
            continue
        seen.add(u)
        deduped.append(it)
    # Newest first
    deduped.sort(key=lambda x: x.get("published_at") or "", reverse=True)

    # --- 8-day sparkline from ALL matched articles (not just preview) ---
    today = datetime.now(timezone.utc).date()
    day_buckets: dict[str, dict] = {}
    for it in deduped:
        if not it.get("published_at"):
            continue
        try:
            day = datetime.fromisoformat(it["published_at"]).date().isoformat()
        except Exception:
            continue
        s = classify_sentiment_detailed(it.get("headline") or "")["sentiment"]
        bucket = day_buckets.setdefault(day, {"pos": 0, "neg": 0, "total": 0})
        if s == "positive":
            bucket["pos"] += 1
        elif s == "negative":
            bucket["neg"] += 1
        bucket["total"] += 1
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

    # --- Top-N preview articles with per-article triggers ---
    articles = []
    pos = neg = total = 0
    for it in deduped[:limit]:
        detail = classify_sentiment_detailed(it.get("headline") or "")
        senti = detail["sentiment"]
        if senti == "positive":
            pos += 1
        elif senti == "negative":
            neg += 1
        total += 1
        articles.append({
            "headline": it.get("headline"),
            "summary": it.get("summary", ""),
            "source": it.get("source"),
            "url": it.get("url"),
            "published_at": it.get("published_at"),
            "sentiment": senti,
            "sentiment_triggers": detail["triggers"],
        })
    score = 0.0
    if total > 0:
        score = round((pos - neg) / total, 2)
    return {
        "articles": articles,
        "total_scanned": len(all_items),
        "matched": len(deduped),
        "summary_sentiment": "positive" if score > 0.1 else "negative" if score < -0.1 else "neutral",
        "score": score,
        "sentiment_method": "neulab_keyword_heuristic_idx",
        "daily_sentiment": sparkline,
        "matched_ticker": code,
    }


def _empty_sparkline() -> list[dict]:
    today = datetime.now(timezone.utc).date()
    return [
        {
            "date": (today - timedelta(days=i)).isoformat(),
            "score": 0.0,
            "positive": 0,
            "negative": 0,
            "total": 0,
        }
        for i in range(7, -1, -1)
    ]


async def get_market_context_idx(symbol: str) -> dict:
    """IDX equivalent of finnhub.get_market_context(). Only provides news —
    analyst consensus and earnings calendar aren't aggregated for IDX on any
    of our current free sources."""
    news = await get_company_news_idx(symbol)
    return {
        "configured": True,
        "market": "IDX",
        "news": news,
        "analyst_consensus": None,
        "earnings": None,
    }
