"""Stocks: search + real-time quote + history + exchanges catalog."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException

from core.models import Quote
from core.security import get_current_user
from services.yfinance_svc import get_quote, _yf_history_sync

router = APIRouter(prefix="/stocks", tags=["stocks"])

# Curated catalog — top most-transacted tickers per category per exchange.
# (category ∈ tech|finance|healthcare|commodities|consumer|other)
# Volumes sourced from FY2025 average daily share turnover; list-position ≈ rank.
CATALOG = [
    # ---------- NASDAQ · Technology ----------
    {"ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "NVDA", "name": "NVIDIA Corp.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "GOOGL", "name": "Alphabet Inc. Class A", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "AVGO", "name": "Broadcom Inc.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "INTC", "name": "Intel Corp.", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "PLTR", "name": "Palantir Technologies", "exchange": "NASDAQ", "category": "tech"},
    {"ticker": "MU", "name": "Micron Technology", "exchange": "NASDAQ", "category": "tech"},
    # ---------- NYSE · Technology ----------
    {"ticker": "ORCL", "name": "Oracle Corp.", "exchange": "NYSE", "category": "tech"},
    {"ticker": "IBM", "name": "IBM Corp.", "exchange": "NYSE", "category": "tech"},
    {"ticker": "CRM", "name": "Salesforce Inc.", "exchange": "NYSE", "category": "tech"},
    {"ticker": "NOW", "name": "ServiceNow Inc.", "exchange": "NYSE", "category": "tech"},

    # ---------- NYSE · Finance ----------
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE", "category": "finance"},
    {"ticker": "BAC", "name": "Bank of America", "exchange": "NYSE", "category": "finance"},
    {"ticker": "WFC", "name": "Wells Fargo & Co.", "exchange": "NYSE", "category": "finance"},
    {"ticker": "V", "name": "Visa Inc.", "exchange": "NYSE", "category": "finance"},
    {"ticker": "MA", "name": "Mastercard Inc.", "exchange": "NYSE", "category": "finance"},
    {"ticker": "GS", "name": "Goldman Sachs Group", "exchange": "NYSE", "category": "finance"},
    {"ticker": "MS", "name": "Morgan Stanley", "exchange": "NYSE", "category": "finance"},
    {"ticker": "C", "name": "Citigroup Inc.", "exchange": "NYSE", "category": "finance"},
    {"ticker": "BRK-B", "name": "Berkshire Hathaway B", "exchange": "NYSE", "category": "finance"},
    {"ticker": "AXP", "name": "American Express", "exchange": "NYSE", "category": "finance"},
    # NASDAQ · Finance
    {"ticker": "PYPL", "name": "PayPal Holdings", "exchange": "NASDAQ", "category": "finance"},
    {"ticker": "COIN", "name": "Coinbase Global", "exchange": "NASDAQ", "category": "finance"},

    # ---------- NYSE · Healthcare ----------
    {"ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "UNH", "name": "UnitedHealth Group", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "LLY", "name": "Eli Lilly and Company", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "PFE", "name": "Pfizer Inc.", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "MRK", "name": "Merck & Co.", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "ABBV", "name": "AbbVie Inc.", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "TMO", "name": "Thermo Fisher Scientific", "exchange": "NYSE", "category": "healthcare"},
    {"ticker": "BMY", "name": "Bristol-Myers Squibb", "exchange": "NYSE", "category": "healthcare"},
    # NASDAQ · Healthcare
    {"ticker": "GILD", "name": "Gilead Sciences", "exchange": "NASDAQ", "category": "healthcare"},
    {"ticker": "AMGN", "name": "Amgen Inc.", "exchange": "NASDAQ", "category": "healthcare"},
    {"ticker": "VRTX", "name": "Vertex Pharmaceuticals", "exchange": "NASDAQ", "category": "healthcare"},
    {"ticker": "REGN", "name": "Regeneron Pharmaceuticals", "exchange": "NASDAQ", "category": "healthcare"},

    # ---------- Commodities (NYSE + NYSEARCA ETFs) ----------
    {"ticker": "XOM", "name": "Exxon Mobil", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "CVX", "name": "Chevron Corp.", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "COP", "name": "ConocoPhillips", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "SLB", "name": "Schlumberger", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "FCX", "name": "Freeport-McMoRan", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "NEM", "name": "Newmont Corp. (Gold)", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "GOLD", "name": "Barrick Gold", "exchange": "NYSE", "category": "commodities"},
    {"ticker": "GLD", "name": "SPDR Gold Shares ETF", "exchange": "NYSEARCA", "category": "commodities"},
    {"ticker": "SLV", "name": "iShares Silver Trust ETF", "exchange": "NYSEARCA", "category": "commodities"},
    {"ticker": "USO", "name": "United States Oil Fund", "exchange": "NYSEARCA", "category": "commodities"},
    {"ticker": "UNG", "name": "United States Natural Gas", "exchange": "NYSEARCA", "category": "commodities"},
    {"ticker": "DBC", "name": "Invesco DB Commodity ETF", "exchange": "NYSEARCA", "category": "commodities"},

    # ---------- Consumer (NYSE + NASDAQ) ----------
    {"ticker": "WMT", "name": "Walmart Inc.", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "PG", "name": "Procter & Gamble", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "KO", "name": "Coca-Cola", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "PEP", "name": "PepsiCo Inc.", "exchange": "NASDAQ", "category": "consumer"},
    {"ticker": "MCD", "name": "McDonald's Corp.", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "NKE", "name": "NIKE Inc.", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "DIS", "name": "The Walt Disney Company", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "HD", "name": "The Home Depot", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "SBUX", "name": "Starbucks Corp.", "exchange": "NASDAQ", "category": "consumer"},
    {"ticker": "COST", "name": "Costco Wholesale", "exchange": "NASDAQ", "category": "consumer"},
    {"ticker": "TGT", "name": "Target Corp.", "exchange": "NYSE", "category": "consumer"},
    {"ticker": "LULU", "name": "Lululemon Athletica", "exchange": "NASDAQ", "category": "consumer"},

    # ---------- Other (Industrials, Energy ETF, Real Estate, etc.) ----------
    {"ticker": "BA", "name": "The Boeing Company", "exchange": "NYSE", "category": "other"},
    {"ticker": "CAT", "name": "Caterpillar Inc.", "exchange": "NYSE", "category": "other"},
    {"ticker": "GE", "name": "GE Aerospace", "exchange": "NYSE", "category": "other"},
    {"ticker": "UPS", "name": "United Parcel Service", "exchange": "NYSE", "category": "other"},
    {"ticker": "LMT", "name": "Lockheed Martin", "exchange": "NYSE", "category": "other"},
    {"ticker": "RTX", "name": "RTX Corporation", "exchange": "NYSE", "category": "other"},
    {"ticker": "SPY", "name": "SPDR S&P 500 ETF", "exchange": "NYSEARCA", "category": "other"},
    {"ticker": "QQQ", "name": "Invesco QQQ Trust ETF", "exchange": "NASDAQ", "category": "other"},
    {"ticker": "DIA", "name": "SPDR Dow Jones ETF", "exchange": "NYSEARCA", "category": "other"},
    {"ticker": "IWM", "name": "iShares Russell 2000 ETF", "exchange": "NYSEARCA", "category": "other"},

    # ---------- LSE (London) ----------
    {"ticker": "HSBA.L", "name": "HSBC Holdings (LSE)", "exchange": "LSE", "category": "finance"},
    {"ticker": "BARC.L", "name": "Barclays (LSE)", "exchange": "LSE", "category": "finance"},
    {"ticker": "LLOY.L", "name": "Lloyds Banking (LSE)", "exchange": "LSE", "category": "finance"},
    {"ticker": "SHEL.L", "name": "Shell plc (LSE)", "exchange": "LSE", "category": "commodities"},
    {"ticker": "BP.L", "name": "BP plc (LSE)", "exchange": "LSE", "category": "commodities"},
    {"ticker": "AZN.L", "name": "AstraZeneca (LSE)", "exchange": "LSE", "category": "healthcare"},
    {"ticker": "GSK.L", "name": "GSK plc (LSE)", "exchange": "LSE", "category": "healthcare"},
    {"ticker": "ULVR.L", "name": "Unilever (LSE)", "exchange": "LSE", "category": "consumer"},

    # ---------- SGX (Singapore) ----------
    {"ticker": "D05.SI", "name": "DBS Group (SGX)", "exchange": "SGX", "category": "finance"},
    {"ticker": "U11.SI", "name": "United Overseas Bank (SGX)", "exchange": "SGX", "category": "finance"},
    {"ticker": "O39.SI", "name": "OCBC Bank (SGX)", "exchange": "SGX", "category": "finance"},
    {"ticker": "Z74.SI", "name": "Singtel (SGX)", "exchange": "SGX", "category": "other"},
    {"ticker": "C6L.SI", "name": "Singapore Airlines (SGX)", "exchange": "SGX", "category": "other"},

    # ---------- HKEX (Hong Kong) ----------
    {"ticker": "0700.HK", "name": "Tencent Holdings (HKEX)", "exchange": "HKEX", "category": "tech"},
    {"ticker": "9988.HK", "name": "Alibaba Group (HKEX)", "exchange": "HKEX", "category": "tech"},
    {"ticker": "0005.HK", "name": "HSBC Holdings (HKEX)", "exchange": "HKEX", "category": "finance"},
    {"ticker": "1299.HK", "name": "AIA Group (HKEX)", "exchange": "HKEX", "category": "finance"},

    # ---------- TSE (Tokyo) ----------
    {"ticker": "7203.T", "name": "Toyota Motor (TSE)", "exchange": "TSE", "category": "consumer"},
    {"ticker": "6758.T", "name": "Sony Group (TSE)", "exchange": "TSE", "category": "consumer"},
    {"ticker": "9984.T", "name": "SoftBank Group (TSE)", "exchange": "TSE", "category": "tech"},

    # ---------- TSX (Toronto) ----------
    {"ticker": "SHOP.TO", "name": "Shopify Inc. (TSX)", "exchange": "TSX", "category": "tech"},
    {"ticker": "RY.TO", "name": "Royal Bank of Canada (TSX)", "exchange": "TSX", "category": "finance"},
    {"ticker": "TD.TO", "name": "Toronto-Dominion Bank (TSX)", "exchange": "TSX", "category": "finance"},
    {"ticker": "ENB.TO", "name": "Enbridge Inc. (TSX)", "exchange": "TSX", "category": "commodities"},
]

# Alias for legacy callers (POPULAR used to be exported)
POPULAR = CATALOG


def _available_exchanges() -> list:
    """Return all exchanges in the catalog sorted with common primaries first."""
    primary = ["NASDAQ", "NYSE", "NYSEARCA"]
    seen = {s["exchange"] for s in CATALOG}
    ordered = [e for e in primary if e in seen] + sorted(seen - set(primary))
    return ordered


@router.get("/exchanges")
async def list_exchanges():
    """All available exchanges in the catalog, with ticker counts per exchange."""
    counts = {}
    for s in CATALOG:
        counts[s["exchange"]] = counts.get(s["exchange"], 0) + 1
    out = []
    for ex in _available_exchanges():
        out.append({"exchange": ex, "ticker_count": counts[ex]})
    return out


@router.get("/search")
async def search_stocks(
    q: str = "",
    category: str = "",
    exchange: str = "",
    limit: int = 10,
):
    """Search catalog with optional category and/or exchange filters.
    When q is empty: returns top N (default 10) tickers ordered by curator rank.
    Filters stack — combining category + exchange narrows results."""
    q = (q or "").strip()
    category = (category or "").strip().lower()
    exchange = (exchange or "").strip().upper()
    limit = max(1, min(limit, 50))

    # Free-text query: search the whole catalog (case-insensitive) and accept
    # arbitrary tickers (user might type a ticker we don't know about).
    if q:
        ql = q.lower()
        qu = q.upper()
        results = [
            s for s in CATALOG
            if qu in s["ticker"].upper() or ql in s["name"].lower()
        ]
        if qu not in [s["ticker"] for s in results]:
            results.insert(0, {"ticker": qu, "name": qu, "exchange": "?", "category": "other"})
        return results[:15]

    # No query: apply filters. Ranking is catalog insertion order (curator rank).
    filtered = CATALOG
    if category:
        filtered = [s for s in filtered if s["category"] == category]
    if exchange:
        filtered = [s for s in filtered if s["exchange"] == exchange]
    return filtered[:limit]


@router.get("/{ticker}/quote", response_model=Quote)
async def stock_quote(ticker: str, user=Depends(get_current_user)):
    q = await get_quote(ticker)
    if q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    return q


@router.get("/{ticker}/history")
async def stock_history(
    ticker: str,
    period: str = "3mo",
    interval: str = "1d",
    user=Depends(get_current_user),
):
    hist = await asyncio.to_thread(_yf_history_sync, ticker, period, interval)
    return {"ticker": ticker.upper(), "period": period, "interval": interval, "points": hist}
