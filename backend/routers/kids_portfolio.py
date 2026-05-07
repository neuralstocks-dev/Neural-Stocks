"""KidStocks portfolio + watchlist + authenticated analyze.

Design choices:
* **Holdings are computed from `kids_trades`**, not denormalised. With
  the V1-α trading volume (1 kid * 12 tickers * a few trades/week)
  the aggregation is trivial and we avoid drift bugs that come with
  maintaining a positions table in parallel.
* **Prices are pulled from the most recent `analyses` row** for the
  ticker (any user, <14d). This is deliberate: the pilot teaches
  decision-making, not real-time mechanics. Avoids API costs and
  ensures every buy is paired with a fresh GAL verdict the kid
  actually saw.
* **Whitelist of 12 educational tickers** — mainstream US + IDX names
  with consistent fresh adult coverage. Expanded on demand in V1-β.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.db import db
from core.kids_security import get_current_kid
from core.security import iso, now_utc

router = APIRouter(prefix="/kids", tags=["kids-portfolio"])

# Curated kid-tradable list — household names + IDX. Cap at 12 so the
# pilot UX stays focused. Keeps the "do your homework first" framing:
# every ticker has fresh adult coverage so the GAL never returns empty.
KID_TRADABLE = (
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "NVDA", "TSLA", "AMD", "NFLX", "DIS",
    "BBCA.JK", "BRMS.JK",
)

_MAX_PRICE_AGE = timedelta(days=14)


async def _latest_price_for(ticker: str) -> dict:
    """Return `{price, currency, name, analysis_id, created_at}` for the
    latest fresh adult analysis. Raises 404 if none exists.

    Uses the same 14-day cache window as the kids preview router so a
    kid never sees a different price than the GAL verdict they were
    just shown.
    """
    cutoff = (datetime.now(timezone.utc) - _MAX_PRICE_AGE).isoformat()
    doc = await db.analyses.find_one(
        {"ticker": ticker, "created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
        projection={"_id": 0, "id": 1, "ticker": 1, "price_at_analysis": 1, "quote_snapshot": 1, "created_at": 1},
    )
    if not doc:
        raise HTTPException(
            status_code=404,
            detail=f"No fresh price for {ticker} — ask a grown-up to analyse it first.",
        )
    quote = doc.get("quote_snapshot") if isinstance(doc.get("quote_snapshot"), dict) else {}
    price = doc.get("price_at_analysis")
    if not price:
        raise HTTPException(status_code=404, detail=f"No price recorded for {ticker}.")
    return {
        "price": float(price),
        "currency": quote.get("currency") or "USD",
        "name": quote.get("name") or ticker,
        "analysis_id": doc.get("id"),
        "created_at": doc.get("created_at"),
    }


# ---------------------------------------------------------------------------
# /api/kids/tradable — what's in the kid universe
# ---------------------------------------------------------------------------

@router.get("/tradable")
async def list_tradable(student=Depends(get_current_kid)):
    """Surface the kid-tradable universe with current prices.

    Frontend uses this to power the dashboard "Discover" section and
    the buy/sell ticker pickers. Skips tickers without fresh prices
    so the kid never lands on a dead button.
    """
    out = []
    for sym in KID_TRADABLE:
        try:
            p = await _latest_price_for(sym)
            out.append({
                "ticker": sym,
                "name": p["name"],
                "price": p["price"],
                "currency": p["currency"],
            })
        except HTTPException:
            # Skip tickers without fresh prices rather than fail the
            # whole list — keeps the dashboard rendering even when one
            # ticker hasn't been refreshed.
            continue
    return {"tickers": out}


# ---------------------------------------------------------------------------
# /api/kids/portfolio — computed positions + total P&L
# ---------------------------------------------------------------------------

@router.get("/portfolio")
async def get_portfolio(student=Depends(get_current_kid)):
    """Return the kid's StockCoins balance + per-ticker holdings.

    Holdings are computed by aggregating `kids_trades` (BUY adds qty,
    SELL subtracts). Cost basis uses average-cost accounting — simpler
    than FIFO and developmentally appropriate for ages 11–18.
    """
    # Aggregate net qty + cost basis per ticker.
    pipeline = [
        {"$match": {"student_id": student["id"]}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$ticker",
            # Track running totals; cost basis = sum of (buy qty * buy price).
            "buys_qty": {"$sum": {"$cond": [{"$eq": ["$side", "BUY"]}, "$qty", 0]}},
            "buys_cost": {"$sum": {"$cond": [{"$eq": ["$side", "BUY"]}, {"$multiply": ["$qty", "$price"]}, 0]}},
            "sells_qty": {"$sum": {"$cond": [{"$eq": ["$side", "SELL"]}, "$qty", 0]}},
        }},
    ]
    positions = []
    total_market_value = 0.0
    total_cost_basis = 0.0
    async for row in db.kids_trades.aggregate(pipeline):
        ticker = row["_id"]
        qty_held = (row.get("buys_qty") or 0) - (row.get("sells_qty") or 0)
        if qty_held <= 0:
            continue  # Position closed
        avg_cost = (row.get("buys_cost") or 0) / max(row.get("buys_qty") or 0, 1)
        # Pull current price; if stale, surface 0 P&L and a `stale` flag
        # rather than failing the whole portfolio request.
        try:
            p = await _latest_price_for(ticker)
            current_price = p["price"]
            currency = p["currency"]
            stale = False
        except HTTPException:
            current_price = avg_cost  # fall back to cost basis
            currency = "USD"
            stale = True
        market_value = current_price * qty_held
        cost_basis = avg_cost * qty_held
        pnl = market_value - cost_basis
        pnl_pct = (pnl / cost_basis * 100.0) if cost_basis > 0 else 0.0
        total_market_value += market_value
        total_cost_basis += cost_basis
        positions.append({
            "ticker": ticker,
            "qty": qty_held,
            "avg_cost": round(avg_cost, 4),
            "current_price": round(current_price, 4),
            "currency": currency,
            "market_value": round(market_value, 2),
            "cost_basis": round(cost_basis, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "stale_price": stale,
        })

    sc_balance = student.get("stock_coins_balance", 0)
    starting = student.get("starting_stock_coins", 10000)
    total_value = sc_balance + total_market_value  # SC = $1 equivalent for kids
    total_pnl = total_value - starting
    return {
        "stock_coins_balance": sc_balance,
        "starting_stock_coins": starting,
        "positions": positions,
        "totals": {
            "market_value": round(total_market_value, 2),
            "cost_basis": round(total_cost_basis, 2),
            "cash": sc_balance,
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round((total_pnl / starting * 100.0), 2) if starting > 0 else 0.0,
        },
    }


# ---------------------------------------------------------------------------
# /api/kids/trades — execute buy/sell + read history
# ---------------------------------------------------------------------------

class TradeBody(BaseModel):
    ticker: str = Field(..., max_length=16)
    qty: int = Field(..., gt=0, le=10_000, description="Whole shares only — keeps mental math simple")
    side: Literal["BUY", "SELL"]


@router.post("/trades")
async def place_trade(body: TradeBody, student=Depends(get_current_kid)):
    """Place a BUY or SELL trade.

    Atomicity: we update the kid's balance THEN insert the trade
    record. If the trade insert fails the balance is rolled back.
    Mongo doesn't have multi-doc transactions on this cluster, but
    these two ops are sequential within a single request — failure
    between them would only orphan a balance change, which we explicitly
    reverse in the except block.
    """
    ticker = body.ticker.upper().strip()
    if ticker not in KID_TRADABLE:
        raise HTTPException(
            status_code=400,
            detail=f"{ticker} isn't on the KidStocks learning list yet.",
        )

    p = await _latest_price_for(ticker)
    price = p["price"]
    cost = round(price * body.qty, 2)

    # Pre-flight balance / position checks.
    if body.side == "BUY":
        if cost > student.get("stock_coins_balance", 0):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"You need {int(cost):,} StockCoins for this — you have "
                    f"{int(student.get('stock_coins_balance', 0)):,}."
                ),
            )
        balance_delta = -cost
    else:  # SELL
        held = await _held_qty(student["id"], ticker)
        if body.qty > held:
            raise HTTPException(
                status_code=400,
                detail=f"You only have {held} shares of {ticker} to sell.",
            )
        balance_delta = +cost

    # 1) Update balance atomically with $inc + return-after-update.
    update_res = await db.kids_users.find_one_and_update(
        {"id": student["id"]},
        {"$inc": {"stock_coins_balance": balance_delta}},
        projection={"_id": 0, "stock_coins_balance": 1},
        return_document=True,
    )
    if not update_res:
        raise HTTPException(status_code=500, detail="Couldn't update your balance — try again.")

    # 2) Insert the trade record. If this fails, reverse the balance change.
    trade_id = str(uuid.uuid4())
    trade_doc = {
        "id": trade_id,
        "student_id": student["id"],
        "ticker": ticker,
        "side": body.side,
        "qty": int(body.qty),
        "price": float(price),
        "cost": cost,  # absolute cost (always positive)
        "stock_coins_delta": balance_delta,  # signed
        "currency": p["currency"],
        "analysis_id": p.get("analysis_id"),
        "created_at": iso(now_utc()),
    }
    try:
        await db.kids_trades.insert_one(trade_doc)
    except Exception:
        # Reverse the balance change so the kid isn't penalised for our
        # storage failure.
        await db.kids_users.update_one(
            {"id": student["id"]},
            {"$inc": {"stock_coins_balance": -balance_delta}},
        )
        raise HTTPException(status_code=500, detail="Couldn't record the trade — your StockCoins were refunded.")

    return {
        "trade_id": trade_id,
        "ticker": ticker,
        "side": body.side,
        "qty": body.qty,
        "price": price,
        "cost": cost,
        "new_balance": update_res.get("stock_coins_balance"),
    }


async def _held_qty(student_id: str, ticker: str) -> int:
    pipeline = [
        {"$match": {"student_id": student_id, "ticker": ticker}},
        {"$group": {
            "_id": None,
            "buys": {"$sum": {"$cond": [{"$eq": ["$side", "BUY"]}, "$qty", 0]}},
            "sells": {"$sum": {"$cond": [{"$eq": ["$side", "SELL"]}, "$qty", 0]}},
        }},
    ]
    async for row in db.kids_trades.aggregate(pipeline):
        return max(0, (row.get("buys") or 0) - (row.get("sells") or 0))
    return 0


@router.get("/trades")
async def list_trades(student=Depends(get_current_kid), limit: int = 50):
    """Recent trade history — most recent first."""
    cur = (
        db.kids_trades
        .find({"student_id": student["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(min(max(limit, 1), 200))
    )
    return {"trades": await cur.to_list(length=200)}


# ---------------------------------------------------------------------------
# /api/kids/watchlist
# ---------------------------------------------------------------------------

@router.get("/watchlist")
async def list_watchlist(student=Depends(get_current_kid)):
    cur = db.kids_watchlist.find(
        {"student_id": student["id"]}, {"_id": 0}
    ).sort("added_at", 1)
    items = await cur.to_list(length=100)
    # Decorate with current prices so the watchlist UI is informative.
    for it in items:
        try:
            p = await _latest_price_for(it["ticker"])
            it["price"] = p["price"]
            it["currency"] = p["currency"]
            it["name"] = p["name"]
        except HTTPException:
            it["price"] = None
            it["currency"] = "USD"
    return {"watchlist": items}


@router.post("/watchlist/{ticker}")
async def add_watchlist(ticker: str, student=Depends(get_current_kid)):
    sym = ticker.upper().strip()
    if sym not in KID_TRADABLE:
        raise HTTPException(status_code=400, detail=f"{sym} isn't on the learning list yet.")
    # Idempotent — allow re-adding without error.
    existing = await db.kids_watchlist.find_one({"student_id": student["id"], "ticker": sym})
    if existing:
        return {"ok": True, "already": True}
    await db.kids_watchlist.insert_one({
        "id": str(uuid.uuid4()),
        "student_id": student["id"],
        "ticker": sym,
        "added_at": iso(now_utc()),
    })
    return {"ok": True}


@router.delete("/watchlist/{ticker}")
async def remove_watchlist(ticker: str, student=Depends(get_current_kid)):
    sym = ticker.upper().strip()
    res = await db.kids_watchlist.delete_one({"student_id": student["id"], "ticker": sym})
    return {"ok": True, "removed": res.deleted_count}


# ---------------------------------------------------------------------------
# /api/kids/analyze/{ticker} — authenticated kid-friendly analysis.
# Distinct from /kids/preview/* (public Phase Zero) — this version uses
# the student's own age_band and broadens the universe to the full
# KID_TRADABLE list instead of the 5-ticker pilot pool.
# ---------------------------------------------------------------------------

@router.get("/analyze/{ticker}")
async def analyze_ticker(
    ticker: str,
    student=Depends(get_current_kid),
    lang: str = Query(default="en", description="Output language: en or id"),
):
    from services.gal import translate_for_age
    from routers.kids_preview import _adult_to_gal_input

    ticker = ticker.upper().strip()
    if ticker not in KID_TRADABLE:
        raise HTTPException(status_code=400, detail=f"{ticker} isn't on the learning list yet.")

    if lang not in ("en", "id"):
        lang = student.get("lang") or "en"

    cutoff = (datetime.now(timezone.utc) - _MAX_PRICE_AGE).isoformat()
    doc = await db.analyses.find_one(
        {"ticker": ticker, "created_at": {"$gte": cutoff}},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(
            status_code=404,
            detail=f"No fresh analysis of {ticker} yet — try again later.",
        )

    age_band = student.get("age_band") or "11-13"
    kid_view = await translate_for_age(_adult_to_gal_input(doc), age_band, ticker, lang)
    quote = doc.get("quote_snapshot") if isinstance(doc.get("quote_snapshot"), dict) else {}
    return {
        "ticker": ticker,
        "name": quote.get("name") or ticker,
        "age_band": age_band,
        "lang": lang,
        "current_price": doc.get("price_at_analysis"),
        "currency": quote.get("currency") or "USD",
        "kid_view": {k: v for k, v in kid_view.items() if not k.startswith("_")},
    }
