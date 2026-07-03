"""AI Accuracy Scorecard — per-user and global.

REWRITE NOTE (see services/verdict_resolution.py for the full rationale):
the previous version graded every verdict against the LIVE price on every
request, which meant a verdict's hit/miss status could flip on every page
load, forever, with no memory of its horizon. That's not a track record.

This version reads from the permanent `resolution` sub-document written
once by verdict_resolution.py when a verdict's time_horizon_weeks has
actually elapsed. Verdicts not yet resolved are shown as "pending" —
never as a hit/miss. Once resolved, a grade never changes again.

Two things this unlocks that didn't exist before:
  - Confidence-bucketed hit rate: is a 90-confidence verdict actually
    more reliable than a 50-confidence one? Before, there was no way to
    know. Now `by_confidence_band` answers it directly.
  - Calibration impact: services/verdict_calibration.py (V2) adjusts
    confidence post-LLM for earnings proximity and RF disagreement, and
    already stores confidence_score_pre_calibration. This version cross-
    tabulates hit rate against BOTH the raw and calibrated confidence so
    you can see whether calibration is actually improving anything —
    something the codebase could compute but nothing was reading before.
"""
from fastapi import APIRouter, Depends

from core.db import db
from core.security import get_current_user
from services.idx_news import is_idx_ticker

router = APIRouter(prefix="/scorecard", tags=["scorecard"])

HIT_THRESHOLD_PCT = 5.0  # mirrors services/verdict_resolution.py — display only

# Confidence bands for the breakdown. 75 is kept as an exact boundary
# because it's the threshold that triggers Telegram alerts elsewhere in
# the app — isolating it lets us check whether "alert-worthy" verdicts
# actually earn that status.
CONFIDENCE_BANDS = [
    (0, 45, "0-44 (weak)"),
    (45, 60, "45-59 (moderate)"),
    (60, 75, "60-74 (moderate-high)"),
    (75, 90, "75-89 (high)"),
    (90, 101, "90-100 (very high)"),
]


def _band_label(score) -> str | None:
    if not isinstance(score, (int, float)):
        return None
    for lo, hi, label in CONFIDENCE_BANDS:
        if lo <= score < hi:
            return label
    return None


def _empty_bucket():
    return {"total": 0, "hits": 0, "misses": 0, "hit_rate": None}


def _finalize_bucket(b: dict) -> dict:
    resolved = b["hits"] + b["misses"]
    b["hit_rate"] = round((b["hits"] / resolved) * 100, 1) if resolved else None
    return b


def _empty_summary():
    return {
        "total": 0,
        "resolved": 0,
        "pending": 0,
        "unresolvable": 0,
        "hits": 0,
        "misses": 0,
        "hit_rate": None,
        "by_recommendation": {r: _empty_bucket() for r in ("BUY", "SELL", "HOLD")},
        "by_confidence_band": {label: _empty_bucket() for _, _, label in CONFIDENCE_BANDS},
        # Same band structure, keyed on confidence_score_pre_calibration
        # instead of the (possibly adjusted) final confidence_score. Lets
        # the UI show whether calibration moved verdicts into more
        # accurate bands or is just noise, side-by-side with the main table.
        "by_confidence_band_pre_calibration": {
            label: _empty_bucket() for _, _, label in CONFIDENCE_BANDS
        },
    }


def _tally(summary: dict, a: dict):
    """Apply one analysis document's resolution (or lack thereof) to the
    running summary. Only verdicts with a terminal resolution.status of
    'hit' or 'miss' count toward hit_rate — pending and unresolvable are
    tracked separately and never silently folded into the rate.

    `total` counters (overall + per-recommendation) increment exactly
    once per verdict regardless of resolution state — pending verdicts
    still count as "a verdict that exists", they just don't have a grade
    yet. Only hits/misses/bucket tallies require a resolved status.
    """
    rec = (a.get("recommendation") or "").upper()
    resolution = a.get("resolution") or {}
    status = resolution.get("status")  # "hit" | "miss" | "unresolvable" | None (=pending)

    summary["total"] += 1
    if rec in summary["by_recommendation"]:
        summary["by_recommendation"][rec]["total"] += 1

    if status is None:
        summary["pending"] += 1
        return
    if status == "unresolvable":
        summary["unresolvable"] += 1
        return

    summary["resolved"] += 1
    is_hit = status == "hit"
    if is_hit:
        summary["hits"] += 1
    else:
        summary["misses"] += 1
    if rec in summary["by_recommendation"]:
        summary["by_recommendation"][rec]["hits" if is_hit else "misses"] += 1

    band = _band_label(a.get("confidence_score"))
    if band:
        b = summary["by_confidence_band"][band]
        b["total"] += 1
        b["hits" if is_hit else "misses"] += 1

    # Older docs (pre-V2 calibration) have no confidence_score_pre_calibration
    # at all — in that case pre-calibration IS the final score, since no
    # calibration ran, so we fall back to confidence_score.
    pre_conf = a.get("confidence_score_pre_calibration")
    if pre_conf is None:
        pre_conf = a.get("confidence_score")
    pre_band = _band_label(pre_conf)
    if pre_band:
        b = summary["by_confidence_band_pre_calibration"][pre_band]
        b["total"] += 1
        b["hits" if is_hit else "misses"] += 1


def _finalize_summary(s: dict) -> dict:
    s["hit_rate"] = round((s["hits"] / s["resolved"]) * 100, 1) if s["resolved"] else None
    for rec in ("BUY", "SELL", "HOLD"):
        _finalize_bucket(s["by_recommendation"][rec])
    for _, _, label in CONFIDENCE_BANDS:
        _finalize_bucket(s["by_confidence_band"][label])
        _finalize_bucket(s["by_confidence_band_pre_calibration"][label])
    return s


_METHODOLOGY_NOTE = (
    "Verdicts are graded once, permanently, when their own time_horizon_weeks "
    "has elapsed — not against today's live price. A grade never changes "
    "after it's set. Verdicts still within their horizon show as 'pending', "
    "never as a hit or miss."
)


@router.get("/me")
async def my_scorecard(user=Depends(get_current_user)):
    analyses = await db.analyses.find(
        {"user_id": user["id"]},
        {"_id": 0, "id": 1, "ticker": 1, "recommendation": 1,
         "confidence_score": 1, "confidence_score_pre_calibration": 1,
         "calibration_version": 1, "price_at_analysis": 1, "price_target": 1,
         "created_at": 1, "time_horizon_weeks": 1, "resolution": 1},
    ).sort("created_at", -1).to_list(500)

    summary = _empty_summary()
    recent = []

    for a in analyses:
        _tally(summary, a)
        resolution = a.get("resolution") or {}
        recent.append({
            "analysis_id": a.get("id"),
            "ticker": a.get("ticker"),
            "recommendation": a.get("recommendation"),
            "confidence_score": a.get("confidence_score"),
            "confidence_score_pre_calibration": a.get("confidence_score_pre_calibration"),
            "calibration_version": a.get("calibration_version"),
            "price_at_analysis": a.get("price_at_analysis"),
            "price_target": a.get("price_target"),
            "time_horizon_weeks": a.get("time_horizon_weeks"),
            "created_at": a.get("created_at"),
            "status": resolution.get("status", "pending"),
            "resolution_price": resolution.get("resolution_price"),
            "return_pct": resolution.get("return_pct"),
            "resolved_at": resolution.get("resolved_at"),
            "horizon_due_at": resolution.get("horizon_due_at"),
            "currency": "IDR" if is_idx_ticker(a.get("ticker")) else "USD",
        })

    _finalize_summary(summary)
    summary["threshold_pct"] = HIT_THRESHOLD_PCT
    summary["methodology"] = _METHODOLOGY_NOTE
    return {"summary": summary, "verdicts": recent[:50]}


@router.get("/global")
async def global_scorecard(_user=Depends(get_current_user)):
    """Platform-wide stats (auth required). Response is scrubbed of user_id/email.

    IMPORTANT: this must NOT be a find() + Python-loop tally over the whole
    analyses collection. An earlier version of this endpoint did exactly
    that (first capped at to_list(2000), later carelessly bumped to
    to_list(5000) with no load-testing) and it 503'd in production once
    the collection grew — pulling thousands of full documents into app
    memory on every single page load doesn't scale, and raising the cap
    only postpones the same failure at a larger collection size.

    Instead, the tally happens inside MongoDB via aggregation: group by
    (recommendation, resolution.status, confidence band) and let the
    database do the counting. This returns fixed-size bucket counts
    regardless of how many analyses exist — cost scales with an index
    scan, not with response payload size in application memory.
    """
    summary = _empty_summary()

    # Single aggregation pass: project a computed confidence_band and
    # pre_calibration_band per document, then group by every dimension we
    # need counts for. $facet runs multiple independent group-bys in one
    # pipeline execution instead of three separate collection scans.
    pipeline = [
        {"$project": {
            "recommendation": {"$toUpper": {"$ifNull": ["$recommendation", ""]}},
            "status": {"$ifNull": ["$resolution.status", "pending"]},
            "confidence_score": 1,
            "confidence_score_pre_calibration": 1,
        }},
        {"$facet": {
            "overall": [
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ],
            "by_recommendation": [
                {"$match": {"recommendation": {"$in": ["BUY", "SELL", "HOLD"]}}},
                {"$group": {
                    "_id": {"rec": "$recommendation", "status": "$status"},
                    "count": {"$sum": 1},
                }},
            ],
            "by_confidence_band": [
                {"$match": {"status": {"$in": ["hit", "miss"]}}},
                {"$bucket": {
                    "groupBy": "$confidence_score",
                    "boundaries": [b[0] for b in CONFIDENCE_BANDS] + [101],
                    "default": "unbanded",
                    "output": {
                        "hits": {"$sum": {"$cond": [{"$eq": ["$status", "hit"]}, 1, 0]}},
                        "misses": {"$sum": {"$cond": [{"$eq": ["$status", "miss"]}, 1, 0]}},
                    },
                }},
            ],
            "by_confidence_band_pre_calibration": [
                {"$match": {"status": {"$in": ["hit", "miss"]}}},
                {"$project": {
                    "status": 1,
                    "pre_conf": {"$ifNull": [
                        "$confidence_score_pre_calibration", "$confidence_score",
                    ]},
                }},
                {"$bucket": {
                    "groupBy": "$pre_conf",
                    "boundaries": [b[0] for b in CONFIDENCE_BANDS] + [101],
                    "default": "unbanded",
                    "output": {
                        "hits": {"$sum": {"$cond": [{"$eq": ["$status", "hit"]}, 1, 0]}},
                        "misses": {"$sum": {"$cond": [{"$eq": ["$status", "miss"]}, 1, 0]}},
                    },
                }},
            ],
        }},
    ]

    result = await db.analyses.aggregate(pipeline).to_list(1)
    facets = result[0] if result else {
        "overall": [], "by_recommendation": [],
        "by_confidence_band": [], "by_confidence_band_pre_calibration": [],
    }

    # --- overall ---
    for bucket in facets.get("overall", []):
        status, count = bucket["_id"], bucket["count"]
        summary["total"] += count
        if status == "pending":
            summary["pending"] += count
        elif status == "unresolvable":
            summary["unresolvable"] += count
        else:
            summary["resolved"] += count
            if status == "hit":
                summary["hits"] += count
            elif status == "miss":
                summary["misses"] += count

    # --- by_recommendation ---
    for bucket in facets.get("by_recommendation", []):
        rec, status = bucket["_id"]["rec"], bucket["_id"]["status"]
        count = bucket["count"]
        if rec not in summary["by_recommendation"]:
            continue
        b = summary["by_recommendation"][rec]
        b["total"] += count
        if status == "hit":
            b["hits"] += count
        elif status == "miss":
            b["misses"] += count

    # --- confidence bands (both variants share this shape) ---
    boundary_to_label = {lo: label for lo, _, label in CONFIDENCE_BANDS}
    for facet_key, target_key in (
        ("by_confidence_band", "by_confidence_band"),
        ("by_confidence_band_pre_calibration", "by_confidence_band_pre_calibration"),
    ):
        for bucket in facets.get(facet_key, []):
            lo = bucket["_id"]
            label = boundary_to_label.get(lo)
            if not label:
                continue  # "unbanded" bucket — missing/invalid confidence_score
            b = summary[target_key][label]
            b["hits"] += bucket.get("hits", 0)
            b["misses"] += bucket.get("misses", 0)
            b["total"] += bucket.get("hits", 0) + bucket.get("misses", 0)

    _finalize_summary(summary)
    summary["threshold_pct"] = HIT_THRESHOLD_PCT
    summary["methodology"] = _METHODOLOGY_NOTE
    return {"summary": summary}
