"""Trade Journal — reflection prompts after each kid buy/sell.

Education > simulation. This turns each virtual trade into a learning
loop:

* After a BUY/SELL the kid is invited (not forced) to answer 3 short
  prompts about *why* they made the trade and what would change their
  mind.
* Completing a journal awards a small StockCoin bonus (`JOURNAL_BONUS_SC`).
* Anti-farming: max `MAX_BONUS_PER_UTC_DAY` per kid per UTC day. Beyond
  the cap the journal still saves (the learning value is the point), but
  no extra bonus is granted.
* Idempotency: one journal per trade. Re-submission overwrites the
  prompts but never re-awards the bonus.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.db import db
from core.kids_security import get_current_kid
from core.security import iso, now_utc

router = APIRouter(prefix="/kids", tags=["kids-journal"])

JOURNAL_BONUS_SC = 50
MAX_BONUS_PER_UTC_DAY = 5

# Hard limits on free-text fields — kids on phones, plus protection
# against runaway content.
_FIELD_MAX = 500


def _today_utc() -> str:
    """Return today's date in UTC as YYYY-MM-DD — used to scope the
    daily-bonus cap so a kid who journaled 5 trades yesterday still
    earns on today's first journal."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class JournalBody(BaseModel):
    why: str = Field(..., min_length=1, max_length=_FIELD_MAX)
    signal: str = Field(..., min_length=1, max_length=_FIELD_MAX)
    exit_plan: str = Field(..., min_length=1, max_length=_FIELD_MAX)


def _public_journal(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "trade_id": doc.get("trade_id"),
        "ticker": doc.get("ticker"),
        "side": doc.get("side"),
        "qty": doc.get("qty"),
        "price": doc.get("price"),
        "prompts": doc.get("prompts") or {},
        "bonus_awarded_sc": doc.get("bonus_awarded_sc", 0),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@router.post("/trades/{trade_id}/journal")
async def upsert_journal(trade_id: str, body: JournalBody, student=Depends(get_current_kid)):
    """Create or update the journal for a trade.

    On first creation: award `JOURNAL_BONUS_SC` if the kid is under
    today's daily cap. Subsequent updates never re-award.
    """
    trade = await db.kids_trades.find_one(
        {"id": trade_id, "student_id": student["id"]},
        {"_id": 0},
    )
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found.")

    existing = await db.kids_journals.find_one(
        {"trade_id": trade_id, "student_id": student["id"]},
        {"_id": 0},
    )

    prompts = {"why": body.why.strip(), "signal": body.signal.strip(), "exit_plan": body.exit_plan.strip()}
    now_iso = iso(now_utc())

    # Update path — never touches balance.
    if existing:
        await db.kids_journals.update_one(
            {"id": existing["id"]},
            {"$set": {"prompts": prompts, "updated_at": now_iso}},
        )
        existing["prompts"] = prompts
        existing["updated_at"] = now_iso
        return {
            "journal": _public_journal(existing),
            "bonus_awarded_sc": 0,
            "new_balance": student.get("stock_coins_balance", 0),
            "already_journaled": True,
        }

    # Daily cap check — count journals first granted today.
    today = _today_utc()
    granted_today = await db.kids_journals.count_documents({
        "student_id": student["id"],
        "bonus_awarded_sc": {"$gt": 0},
        "bonus_award_day": today,
    })

    award = JOURNAL_BONUS_SC if granted_today < MAX_BONUS_PER_UTC_DAY else 0

    journal_id = str(uuid.uuid4())
    doc = {
        "id": journal_id,
        "student_id": student["id"],
        "trade_id": trade_id,
        "ticker": trade["ticker"],
        "side": trade["side"],
        "qty": trade["qty"],
        "price": trade["price"],
        "prompts": prompts,
        "bonus_awarded_sc": award,
        "bonus_award_day": today if award else None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.kids_journals.insert_one(doc)

    new_balance = student.get("stock_coins_balance", 0)
    if award:
        upd = await db.kids_users.find_one_and_update(
            {"id": student["id"]},
            {"$inc": {"stock_coins_balance": award}},
            projection={"_id": 0, "stock_coins_balance": 1},
            return_document=True,
        )
        if upd:
            new_balance = upd.get("stock_coins_balance", new_balance)

    return {
        "journal": _public_journal(doc),
        "bonus_awarded_sc": award,
        "new_balance": new_balance,
        "daily_cap_hit": award == 0,
        "already_journaled": False,
    }


@router.get("/trades/{trade_id}/journal")
async def get_journal(trade_id: str, student=Depends(get_current_kid)):
    """Return the journal for a trade, or 404."""
    doc = await db.kids_journals.find_one(
        {"trade_id": trade_id, "student_id": student["id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No reflection yet for this trade.")
    return _public_journal(doc)


@router.get("/journals")
async def list_journals(
    student=Depends(get_current_kid),
    ticker: Optional[str] = None,
    limit: int = 50,
):
    """List the kid's journals — most recent first."""
    q: dict = {"student_id": student["id"]}
    if ticker:
        q["ticker"] = ticker.upper().strip()
    cur = (
        db.kids_journals
        .find(q, {"_id": 0})
        .sort("created_at", -1)
        .limit(min(max(limit, 1), 200))
    )
    items = await cur.to_list(length=200)
    return {"journals": [_public_journal(d) for d in items]}
