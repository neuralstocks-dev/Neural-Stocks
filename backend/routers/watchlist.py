"""Watchlist CRUD + live merge with latest analysis."""
import asyncio
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.models import AddStockReq
from core.security import get_current_user, iso, now_utc
from services.yfinance_svc import get_quote
from services.quota import plan_for

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("")
async def get_watchlist(user=Depends(get_current_user)):
    return (
        await db.watchlist.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
        .sort("added_at", 1)
        .to_list(50)
    )


@router.post("")
async def add_to_watchlist(req: AddStockReq, user=Depends(get_current_user)):
    ticker = req.ticker.upper().strip()
    # Admins always have unlimited watchlist — consistent with unlimited analysis.
    if not user.get("is_admin"):
        p = plan_for(user)
        count = await db.watchlist.count_documents({"user_id": user["id"]})
        if count >= p["watchlist_limit"]:
            raise HTTPException(
                status_code=402,
                detail=f"Watchlist limit of {p['watchlist_limit']} reached on {p['name']} plan. Upgrade to add more.",
            )
    if await db.watchlist.find_one({"user_id": user["id"], "ticker": ticker}):
        raise HTTPException(status_code=400, detail="Ticker already in watchlist")
    q = await get_quote(ticker)
    if q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found or no data")
    await db.watchlist.insert_one({
        "user_id": user["id"],
        "ticker": ticker,
        "name": q.get("name"),
        "category": (req.category or "other").lower(),
        "added_at": iso(now_utc()),
    })
    return {"ok": True, "ticker": ticker, "name": q.get("name")}


@router.delete("/{ticker}")
async def remove_from_watchlist(ticker: str, user=Depends(get_current_user)):
    res = await db.watchlist.delete_one({"user_id": user["id"], "ticker": ticker.upper()})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticker not in watchlist")
    return {"ok": True}


@router.get("/live")
async def watchlist_live(user=Depends(get_current_user)):
    items = await db.watchlist.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).to_list(50)
    tickers = [i["ticker"] for i in items]
    if not tickers:
        return []
    # Batch: fetch quotes in parallel + latest analysis per ticker via single aggregation
    quotes_task = asyncio.gather(*[get_quote(t) for t in tickers])
    latest_task = db.analyses.aggregate([
        {"$match": {"user_id": user["id"], "ticker": {"$in": tickers}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$ticker",
            "recommendation": {"$first": "$recommendation"},
            "confidence_score": {"$first": "$confidence_score"},
            "created_at": {"$first": "$created_at"},
            "mode": {"$first": "$mode"},
        }},
    ]).to_list(50)
    quotes, latest_docs = await asyncio.gather(quotes_task, latest_task)
    latest_by_ticker = {d["_id"]: d for d in latest_docs}
    merged = []
    for item, q in zip(items, quotes):
        latest = latest_by_ticker.get(item["ticker"])
        merged.append({
            **item,
            "quote": q,
            "latest_analysis": {
                "recommendation": latest["recommendation"],
                "confidence_score": latest["confidence_score"],
                "created_at": latest["created_at"],
                "mode": latest.get("mode"),
            } if latest else None,
        })
    return merged
