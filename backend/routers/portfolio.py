"""Portfolio P&L — holdings with live price computation."""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.security import get_current_user, iso, now_utc
from services.yfinance_svc import get_quote

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

MAX_POSITIONS = 100


class PositionCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=12)
    shares: float = Field(gt=0, le=10_000_000)
    avg_cost: float = Field(gt=0, le=1_000_000)
    purchase_date: Optional[str] = None  # ISO date string
    notes: Optional[str] = Field(default=None, max_length=240)


class PositionUpdate(BaseModel):
    shares: Optional[float] = Field(default=None, gt=0, le=10_000_000)
    avg_cost: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    purchase_date: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=240)


def _public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "ticker": doc["ticker"],
        "shares": doc["shares"],
        "avg_cost": doc["avg_cost"],
        "purchase_date": doc.get("purchase_date"),
        "notes": doc.get("notes"),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@router.get("")
async def list_positions(user=Depends(get_current_user)):
    docs = await db.portfolio.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(MAX_POSITIONS)
    if not docs:
        return {
            "positions": [],
            "total_cost_basis": 0,
            "total_market_value": 0,
            "total_unrealized_pl": 0,
            "total_unrealized_pl_pct": None,
            "total_day_change": 0,
            "total_day_change_pct": None,
            "currency": "USD",
        }

    tickers = list({d["ticker"] for d in docs})
    quotes = await asyncio.gather(*[get_quote(t) for t in tickers], return_exceptions=True)
    qmap = {}
    for t, q in zip(tickers, quotes):
        if isinstance(q, dict):
            qmap[t] = q

    enriched = []
    total_cost_basis = 0.0
    total_market_value = 0.0
    total_day_change = 0.0
    for d in docs:
        q = qmap.get(d["ticker"]) or {}
        price = q.get("price")
        prev_close = q.get("previous_close")
        cost_basis = d["shares"] * d["avg_cost"]
        market_value = (price * d["shares"]) if price else None
        unrealized_pl = (market_value - cost_basis) if market_value is not None else None
        unrealized_pl_pct = ((unrealized_pl / cost_basis) * 100) if (unrealized_pl is not None and cost_basis > 0) else None
        day_change = None
        if price is not None and prev_close is not None:
            day_change = (price - prev_close) * d["shares"]
        if market_value is not None:
            total_market_value += market_value
        if day_change is not None:
            total_day_change += day_change
        total_cost_basis += cost_basis
        enriched.append({
            **_public(d),
            "current_price": price,
            "previous_close": prev_close,
            "cost_basis": round(cost_basis, 2),
            "market_value": round(market_value, 2) if market_value is not None else None,
            "unrealized_pl": round(unrealized_pl, 2) if unrealized_pl is not None else None,
            "unrealized_pl_pct": round(unrealized_pl_pct, 2) if unrealized_pl_pct is not None else None,
            "day_change": round(day_change, 2) if day_change is not None else None,
            "day_change_pct": round(((price - prev_close) / prev_close) * 100, 2) if (price and prev_close) else None,
            "currency": q.get("currency") or "USD",
            "name": q.get("name"),
            "exchange": q.get("exchange"),
        })

    # Compute allocation % using market_value (or cost_basis as fallback)
    for row in enriched:
        basis = row["market_value"] if row["market_value"] is not None else row["cost_basis"]
        denom = total_market_value if total_market_value > 0 else total_cost_basis
        row["allocation_pct"] = round((basis / denom) * 100, 2) if denom > 0 else 0

    total_unrealized_pl = total_market_value - total_cost_basis
    total_unrealized_pl_pct = ((total_unrealized_pl / total_cost_basis) * 100) if total_cost_basis > 0 else None
    # Day change % using previous total market value
    prev_total = total_market_value - total_day_change
    total_day_change_pct = ((total_day_change / prev_total) * 100) if prev_total > 0 else None

    # Infer currency from first position's quote
    currency = enriched[0]["currency"] if enriched else "USD"

    return {
        "positions": enriched,
        "total_cost_basis": round(total_cost_basis, 2),
        "total_market_value": round(total_market_value, 2),
        "total_unrealized_pl": round(total_unrealized_pl, 2),
        "total_unrealized_pl_pct": round(total_unrealized_pl_pct, 2) if total_unrealized_pl_pct is not None else None,
        "total_day_change": round(total_day_change, 2),
        "total_day_change_pct": round(total_day_change_pct, 2) if total_day_change_pct is not None else None,
        "currency": currency,
    }


@router.post("", status_code=201)
async def add_position(body: PositionCreate, user=Depends(get_current_user)):
    count = await db.portfolio.count_documents({"user_id": user["id"]})
    if count >= MAX_POSITIONS:
        raise HTTPException(status_code=400, detail=f"Portfolio is capped at {MAX_POSITIONS} positions.")

    ticker = body.ticker.upper().strip()
    # Validate ticker exists (fetch a live quote)
    q = await get_quote(ticker)
    if not q or q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No market data for ticker {ticker}.")

    # Validate purchase_date if provided
    if body.purchase_date:
        try:
            datetime.fromisoformat(body.purchase_date.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="purchase_date must be ISO format (YYYY-MM-DD).")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "shares": body.shares,
        "avg_cost": body.avg_cost,
        "purchase_date": body.purchase_date,
        "notes": body.notes,
        "created_at": iso(now_utc()),
        "updated_at": iso(now_utc()),
    }
    await db.portfolio.insert_one(doc)
    doc.pop("_id", None)
    return _public(doc)


@router.put("/{position_id}")
async def update_position(position_id: str, body: PositionUpdate, user=Depends(get_current_user)):
    existing = await db.portfolio.find_one({"id": position_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Position not found")
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if body.purchase_date:
        try:
            datetime.fromisoformat(body.purchase_date.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="purchase_date must be ISO format (YYYY-MM-DD).")
    if not updates:
        return _public(existing)
    updates["updated_at"] = iso(now_utc())
    await db.portfolio.update_one({"id": position_id}, {"$set": updates})
    merged = {**existing, **updates}
    return _public(merged)


@router.delete("/{position_id}")
async def delete_position(position_id: str, user=Depends(get_current_user)):
    res = await db.portfolio.delete_one({"id": position_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"deleted": True}
