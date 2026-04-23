"""Trending on Neulab — aggregate "which tickers do our users actually care
about right now" from the `analyses` collection. Zero external API calls;
pure MongoDB $group pipeline over the last N days.

Surfaces on the Dashboard (authed) AND the public marketing touchpoints
(login / signup / shared-verdict pages) as a social-proof acquisition loop.
"""
from datetime import timedelta
from fastapi import APIRouter, Query

from core.db import db
from core.security import iso, now_utc

router = APIRouter(prefix="/trending", tags=["trending"])


@router.get("/neulab")
async def trending_on_neulab(
    window_days: int = Query(7, ge=1, le=90),
    limit: int = Query(8, ge=1, le=50),
    idx_only: bool = Query(False),
):
    """Returns tickers ordered by how many unique Neulab users analysed them
    in the last `window_days`. PUBLIC endpoint — no auth — because the
    data is already aggregated (no user identities leak) and it drives
    social-proof on the marketing pages.
    """
    cutoff = iso(now_utc() - timedelta(days=window_days))
    match: dict = {"created_at": {"$gte": cutoff}}
    if idx_only:
        match["ticker"] = {"$regex": r"\.JK$"}

    pipeline = [
        {"$match": match},
        # Sort first so $first/$last capture the most recent verdict per ticker
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$ticker",
            "unique_users": {"$addToSet": "$user_id"},
            "total_analyses": {"$sum": 1},
            "latest_created_at": {"$first": "$created_at"},
            "latest_recommendation": {"$first": "$recommendation"},
            "latest_confidence": {"$first": "$confidence_score"},
            "latest_price": {"$first": "$price_at_analysis"},
            "latest_currency": {"$first": "$quote_snapshot.currency"},
            "latest_company_name": {
                "$first": {
                    "$ifNull": [
                        "$fundamentals.longName",
                        {"$ifNull": [
                            "$fundamentals.shortName",
                            "$quote_snapshot.name",
                        ]},
                    ]
                }
            },
        }},
        {"$project": {
            "_id": 0,
            "ticker": "$_id",
            "unique_users": {"$size": "$unique_users"},
            "total_analyses": 1,
            "latest_created_at": 1,
            "latest_recommendation": 1,
            "latest_confidence": 1,
            "latest_price": 1,
            "latest_currency": 1,
            "latest_company_name": 1,
        }},
        {"$sort": {
            "unique_users": -1,
            "total_analyses": -1,
            "latest_created_at": -1,
        }},
        {"$limit": limit},
    ]
    cursor = db.analyses.aggregate(pipeline)
    rows = await cursor.to_list(length=limit)

    # Human-readable "since" label
    return {
        "window_days": window_days,
        "idx_only": idx_only,
        "generated_at": iso(now_utc()),
        "count": len(rows),
        "items": rows,
    }
