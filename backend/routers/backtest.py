"""Backtest routes — live user backtest (Option D)."""
from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import db
from core.security import get_current_user
from services.backtest import build_live_backtest
from services.quota import effective_plan_key

router = APIRouter(prefix="/backtest", tags=["backtest"])


def _gate_pro(user: dict):
    """Backtest is a Pro/Elite/Day-Pass feature. Free users get a 402 with copy."""
    plan = effective_plan_key(user)
    if plan == "free":
        raise HTTPException(
            status_code=402,
            detail=(
                "Backtest is a Pro/Elite feature. Upgrade to see the hypothetical "
                "portfolio that would have resulted from following every Neulab "
                "verdict you've received."
            ),
        )


@router.get("/me")
async def my_backtest(
    user=Depends(get_current_user),
    force_refresh: bool = Query(False, description="Bypass the 6h cache and recompute now"),
):
    _gate_pro(user)
    result = await build_live_backtest(user["id"], force=bool(force_refresh))
    # Strip fields the client doesn't need
    result.pop("user_id", None)
    return result


@router.get("/ml")
async def ml_backtest():
    """Read the cached Neulab-ML walk-forward backtest.
    Public (unauthenticated) so it can be embedded in marketing pages later.
    Returns HTTP 404-shape empty-state dict if never computed."""
    doc = await db.backtest_runs.find_one({"kind": "ml"}, {"_id": 0, "user_id": 0})
    if not doc:
        return {
            "kind": "ml",
            "empty": True,
            "message": "Neulab-ML walk-forward has not been computed yet.",
        }
    return doc


@router.get("/me/status")
async def my_backtest_status(user=Depends(get_current_user)):
    """Lightweight endpoint the dashboard can call to decide whether to surface
    a backtest call-out. Returns: {eligible, verdict_count, min_required}."""
    plan = effective_plan_key(user)
    count = await db.analyses.count_documents({"user_id": user["id"]})
    from services.backtest import MIN_VERDICTS_REQUIRED
    return {
        "plan": plan,
        "plan_gated": plan == "free",
        "verdict_count": count,
        "min_required": MIN_VERDICTS_REQUIRED,
        "eligible": plan != "free" and count >= MIN_VERDICTS_REQUIRED,
    }
