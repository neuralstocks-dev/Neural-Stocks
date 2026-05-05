"""IDX-specific endpoints powered by the RapidAPI provider.

Exposes features that are unique to the Indonesian market and don't fit
into the generic /analysis or /stocks routes:

  * GET /idx/top-picks  — multi-factor ranked trending IDX list (Pro/Elite)

Every endpoint here gracefully degrades when RapidAPI is unconfigured
or its monthly budget is exhausted: returns 503 with a user-friendly
message so the frontend can render a "temporarily unavailable" state."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user
from services import idx_rapidapi
from services.quota import effective_plan_key

router = APIRouter(prefix="/idx", tags=["idx"])


@router.get("/top-picks")
async def top_picks(limit: int = 10, user: dict = Depends(get_current_user)):
    """Top N IDX picks — marketed as a Pro/Elite feature so Free users
    see the upsell rather than the payload.

    Uses `effective_plan_key()` (NOT raw `user["plan"]`) so admin-granted
    test-unlocks and active day-passes correctly bypass the gate. The
    previous direct read of `user["plan"]` ignored these unlock paths,
    causing Pro+ features to be denied to test-unlocked users.
    """
    # Gate on EFFECTIVE plan — handles is_admin, test_unlock, and daypass
    # in one helper so the gate stays consistent with the rest of the app.
    plan = effective_plan_key(user)
    if plan not in ("pro", "elite", "daypass"):
        raise HTTPException(
            status_code=402,
            detail="Top Picks is a Pro+ feature. Upgrade to unlock real-time IDX leaders.",
        )

    if not idx_rapidapi.is_configured():
        raise HTTPException(
            status_code=503,
            detail="IDX data source not configured on this deployment.",
        )

    try:
        picks = await idx_rapidapi.get_top_picks(limit=min(max(1, limit), 25))
    except Exception:
        picks = None
    if picks is None:
        raise HTTPException(
            status_code=503,
            detail="IDX Top Picks is temporarily unavailable (provider timeout or monthly budget reached).",
        )
    return {
        "count": len(picks),
        "picks": picks,
        "source": "rapidapi.idx",
        "methodology": (
            "Ranked from the provider's live trending list by "
            "0.6 × capped daily % change + 0.4 × price-quality heuristic "
            "(penalises sub-Rp 100 penny stocks). Refreshed every 30 minutes."
        ),
    }
