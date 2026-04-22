"""Shared Neulab keyword-heuristic sentiment classifier.

Vocabulary spans English + Bahasa Indonesia so the same classifier works on
Finnhub (US stocks) and our IDX RSS scrapers. Expand freely.
"""
from __future__ import annotations

_POS_WORDS_EN = {
    "beat", "beats", "surge", "surged", "soar", "soars", "soared", "rally",
    "rallies", "gain", "gains", "jump", "jumped", "record", "strong",
    "upgrade", "upgraded", "raises", "raised", "bullish", "outperform",
    "top", "breakthrough", "wins", "win", "profit", "profits", "boom",
    "boosts", "boost", "expand", "positive", "growth", "increase", "increased",
    "exceeds", "exceeded",
}
_NEG_WORDS_EN = {
    "miss", "misses", "missed", "plunge", "plunged", "drop", "drops", "dropped",
    "fall", "falls", "fell", "tumble", "tumbled", "crash", "crashed", "decline",
    "declined", "declines", "weak", "downgrade", "downgraded", "cuts", "cut",
    "bearish", "underperform", "loss", "losses", "lawsuit", "probe", "investigate",
    "investigation", "concerns", "warning", "delay", "fraud", "fine", "fined",
    "negative", "slump", "slumped", "layoff", "layoffs", "bankruptcy", "scandal",
}

# Bahasa Indonesia — financial press vocabulary
_POS_WORDS_ID = {
    "naik", "melonjak", "melambung", "menguat", "positif", "untung", "laba",
    "rally", "reli", "meroket", "cuan", "tumbuh", "pertumbuhan", "meningkat",
    "kenaikan", "pemulihan", "pulih", "optimis", "rekor", "cemerlang",
    "gemilang", "menjanjikan", "bullish", "beli", "dibeli", "diborong", "borong",
    "upgrade", "dinaikkan", "apresiasi", "kuat", "lonjak", "melesat", "ekspansi",
    "terbang", "surplus", "solid", "kinclong", "mantap",
}
_NEG_WORDS_ID = {
    "turun", "anjlok", "terjun", "jatuh", "merosot", "melemah", "tergerus",
    "negatif", "rugi", "kerugian", "rontok", "tersungkur", "terkoreksi",
    "koreksi", "ambles", "ambruk", "memble", "lesu", "bearish", "jual",
    "dijual", "diobral", "obral", "downgrade", "diturunkan", "depresiasi",
    "lemah", "ambrol", "anjlok", "defisit", "susut", "menyusut", "tertekan",
    "terpuruk", "amblas", "tumbang", "memerah", "layu", "melempem", "lesu",
    "dilaporkan", "digugat", "skandal", "penipuan", "penyelidikan", "denda",
    "didenda", "phk", "pailit", "bangkrut", "rugi", "masalah",
}

_POS_WORDS = _POS_WORDS_EN | _POS_WORDS_ID
_NEG_WORDS = _NEG_WORDS_EN | _NEG_WORDS_ID


def classify_sentiment(headline: str) -> str:
    return classify_sentiment_detailed(headline)["sentiment"]


def classify_sentiment_detailed(headline: str) -> dict:
    """Returns {sentiment, triggers: {positive: [...], negative: [...]}}.
    Triggers expose the matched keywords so the UI can render a transparent
    "Why this sentiment?" tooltip. Works on English AND Bahasa Indonesia."""
    if not headline:
        return {"sentiment": "neutral", "triggers": {"positive": [], "negative": []}}
    words = {w.strip(".,!?;:'\"()[]").lower() for w in headline.split()}
    pos_hits = sorted(words & _POS_WORDS)
    neg_hits = sorted(words & _NEG_WORDS)
    if len(pos_hits) > len(neg_hits):
        s = "positive"
    elif len(neg_hits) > len(pos_hits):
        s = "negative"
    else:
        s = "neutral"
    return {"sentiment": s, "triggers": {"positive": pos_hits, "negative": neg_hits}}
