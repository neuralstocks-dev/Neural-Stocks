"""KidStocks AI-analysis quota — mirrors services/quota.py's rolling-window
pattern, but scoped to db.kids_users / a dedicated db.kids_analysis_log.

GET /api/kids/analyze/{ticker} has no quota concept on its own (it's just a
GAL translation of a cached adult analysis) — this module is what turns
"free" into an actual daily cap, and "kids_pro" into a higher one. Like the
adult quota system, the daily window is a rolling `now - 1 day` query, so it
self-resets by construction — no cron/reset job needed.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from core.config import KIDS_PLANS
from core.db import db
from core.security import iso, now_utc


def effective_kids_plan_key(student: dict) -> str:
    """Resolve a kid's live plan, reverting to free once a cancelled
    subscription's grace period has passed (or if payment lapsed) — mirrors
    quota.effective_plan_key's belt-and-braces revert so a stale webhook
    delivery doesn't leave a lapsed account on kids_pro indefinitely."""
    cancels_at = student.get("subscription_cancels_at")
    if cancels_at and student.get("subscription_status") == "CANCELLED":
        try:
            dt = datetime.fromisoformat(str(cancels_at).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > dt:
                return "free"
        except Exception:
            pass
    if student.get("subscription_status") in ("SUSPENDED", "PAYMENT_FAILED"):
        return "free"
    return student.get("plan") or "free"


async def count_kids_analyses(student_id: str, since: datetime) -> int:
    return await db.kids_analysis_log.count_documents(
        {"student_id": student_id, "created_at": {"$gte": iso(since)}}
    )


async def enforce_kids_analysis_quota(student: dict):
    plan_key = effective_kids_plan_key(student)
    limit = KIDS_PLANS.get(plan_key, KIDS_PLANS["free"])["analyses_per_day"]
    if limit is None:
        return
    since = now_utc() - timedelta(days=1)
    used = await count_kids_analyses(student["id"], since)
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail=(
                f"You've used all {limit} of today's stock explanations! "
                f"Ask a parent to upgrade to KidStocks Pro for more."
            ),
        )


async def log_kids_analysis(student_id: str, ticker: str):
    await db.kids_analysis_log.insert_one({
        "student_id": student_id,
        "ticker": ticker,
        "created_at": iso(now_utc()),
    })
