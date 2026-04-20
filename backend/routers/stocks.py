"""Stocks: search + real-time quote + history."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException

from core.models import Quote
from core.security import get_current_user
from services.yfinance_svc import get_quote, _yf_history_sync

router = APIRouter(prefix="/stocks", tags=["stocks"])

POPULAR = [
    {"ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "exchange": "NASDAQ"},
    {"ticker": "GOOGL", "name": "Alphabet Inc. Class A", "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ"},
    {"ticker": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ"},
    {"ticker": "NVDA", "name": "NVIDIA Corp.", "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ"},
    {"ticker": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "exchange": "NASDAQ"},
    {"ticker": "INTC", "name": "Intel Corp.", "exchange": "NASDAQ"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE"},
    {"ticker": "BAC", "name": "Bank of America", "exchange": "NYSE"},
    {"ticker": "V", "name": "Visa Inc.", "exchange": "NYSE"},
    {"ticker": "MA", "name": "Mastercard Inc.", "exchange": "NYSE"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE"},
    {"ticker": "PG", "name": "Procter & Gamble", "exchange": "NYSE"},
    {"ticker": "XOM", "name": "Exxon Mobil", "exchange": "NYSE"},
    {"ticker": "KO", "name": "Coca-Cola", "exchange": "NYSE"},
    {"ticker": "DIS", "name": "The Walt Disney Company", "exchange": "NYSE"},
    {"ticker": "BA", "name": "The Boeing Company", "exchange": "NYSE"},
    {"ticker": "D05.SI", "name": "DBS Group (SGX)", "exchange": "SGX"},
    {"ticker": "U11.SI", "name": "United Overseas Bank (SGX)", "exchange": "SGX"},
    {"ticker": "O39.SI", "name": "OCBC Bank (SGX)", "exchange": "SGX"},
    {"ticker": "Z74.SI", "name": "Singtel (SGX)", "exchange": "SGX"},
    {"ticker": "C6L.SI", "name": "Singapore Airlines (SGX)", "exchange": "SGX"},
]


@router.get("/search")
async def search_stocks(q: str = ""):
    q = q.strip().upper()
    if not q:
        return POPULAR[:15]
    results = [s for s in POPULAR if q in s["ticker"] or q.lower() in s["name"].lower()]
    if q not in [s["ticker"] for s in results]:
        results.insert(0, {"ticker": q, "name": q, "exchange": "?"})
    return results[:15]


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
