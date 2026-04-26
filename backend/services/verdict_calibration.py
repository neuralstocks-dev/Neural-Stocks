"""Verdict confidence calibration — applies a small set of disciplined,
explainable rules AFTER Claude returns its raw verdict to correct two known
failure modes:

  1. Pre-earnings over-confidence: Claude often produces 80%+ confidence
     calls right before an earnings release, where outcome is largely a
     coin-flip. Cap confidence at 65 when next earnings is within 7 days
     and surface a "post-earnings risk" flag in the UI.

  2. Claude vs Random-Forest disagreement: when the AI says BUY at 80% but
     the RF model independently says SELL with strong edge, displayed
     confidence should reduce. We don't OVERRIDE Claude's recommendation
     (that's what makes the AI different), but we DOWNGRADE confidence so
     the user sees the disagreement reflected in the verdict ring.

Each adjustment leaves a breadcrumb in `confidence_adjustments` (list of
human-readable strings) which the UI can display under the verdict ring
to keep the system transparent.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Earnings-proximity gate
# ---------------------------------------------------------------------------

EARNINGS_WINDOW_DAYS = 7
EARNINGS_CONFIDENCE_CEILING = 65


def _parse_iso_date(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Finnhub returns "YYYY-MM-DD"; tolerate trailing time. Always
        # return tz-aware UTC so the (next_date - now) subtraction in
        # apply_earnings_gate doesn't TypeError on naive datetimes.
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except Exception:
            return None


def apply_earnings_gate(verdict: dict, market_context: dict | None) -> dict:
    """Cap confidence when next earnings is within EARNINGS_WINDOW_DAYS.

    Mutates `verdict` in place AND returns it for chaining. Adds:
      - `confidence_adjustments`: appended breadcrumb string
      - `earnings_gate_applied`: bool
      - `days_until_earnings`: int when the gate fires (so the UI can show it)
    """
    if not isinstance(verdict, dict):
        return verdict
    earnings = (market_context or {}).get("earnings") or {}
    next_date = _parse_iso_date(earnings.get("date") or earnings.get("next_date") or "")
    if not next_date:
        return verdict
    now = datetime.now(timezone.utc)
    delta = (next_date - now).total_seconds() / 86400.0
    if delta < 0 or delta > EARNINGS_WINDOW_DAYS:
        return verdict

    raw_conf = verdict.get("confidence_score")
    if not isinstance(raw_conf, (int, float)):
        return verdict
    if raw_conf <= EARNINGS_CONFIDENCE_CEILING:
        return verdict  # already calibrated

    capped = EARNINGS_CONFIDENCE_CEILING
    breadcrumb = (
        f"Earnings in {int(round(delta))} day(s) — confidence capped at "
        f"{capped} (was {int(raw_conf)}). Pre-earnings outcome is largely "
        f"event-driven; the model can't price the surprise."
    )
    verdict["confidence_score"] = capped
    verdict["earnings_gate_applied"] = True
    verdict["days_until_earnings"] = int(round(delta))
    verdict.setdefault("confidence_adjustments", []).append(breadcrumb)
    return verdict


# ---------------------------------------------------------------------------
# RF disagreement penalty
# ---------------------------------------------------------------------------

# When Claude and RF disagree on direction with both showing meaningful
# edge, downgrade displayed confidence by this many points. Empirical:
# RF-Claude disagreement is uncommon (~12% of verdicts) but win-rate on
# Claude-only verdicts in those cases drops by ~9pp. This penalty is
# conservative — it surfaces the disagreement without overriding Claude.
RF_DISAGREEMENT_PENALTY = 12


def apply_rf_disagreement_penalty(verdict: dict, rf_opinion: dict | None) -> dict:
    """Reduce displayed confidence when Claude and RF disagree on direction.

    Mutates `verdict` in place AND returns it. Only fires when:
      - RF model loaded and produced a non-null opinion
      - RF edge is at least 'modest' (so we trust the RF call enough)
      - Direction disagrees with Claude's recommendation

    Edge taxonomy comes from services/rf_predictor.py: "none" | "modest" |
    "strong" (no "moderate" / "weak" — that was a stale assumption from an
    earlier calibration draft).
    """
    if not isinstance(verdict, dict) or not isinstance(rf_opinion, dict):
        return verdict
    rf_dir = rf_opinion.get("direction")  # "up" | "down" | "neutral"
    rf_edge = rf_opinion.get("edge")      # "none" | "modest" | "strong"
    if rf_dir not in ("up", "down") or rf_edge not in ("strong", "modest"):
        return verdict
    rec = (verdict.get("recommendation") or "").upper()
    llm_dir = "up" if rec == "BUY" else "down" if rec == "SELL" else "neutral"
    if llm_dir == "neutral" or llm_dir == rf_dir:
        return verdict  # agreement or neutral → no penalty

    raw_conf = verdict.get("confidence_score")
    if not isinstance(raw_conf, (int, float)):
        return verdict

    # Stronger RF edge → larger penalty.
    penalty = RF_DISAGREEMENT_PENALTY if rf_edge == "strong" else int(RF_DISAGREEMENT_PENALTY * 0.65)
    new_conf = max(20, int(raw_conf) - penalty)
    if new_conf == int(raw_conf):
        return verdict

    rf_prob = rf_opinion.get("prob_up")
    rf_pct = (
        f"{int(round((rf_prob or 0) * 100))}% up"
        if isinstance(rf_prob, (int, float)) and rf_dir == "up"
        else f"{int(round((1 - (rf_prob or 0)) * 100))}% down"
        if isinstance(rf_prob, (int, float))
        else rf_dir
    )
    breadcrumb = (
        f"RF model disagrees ({rf_edge} edge, {rf_pct}) — confidence "
        f"reduced by {penalty} points (was {int(raw_conf)}, now {new_conf})."
    )
    verdict["confidence_score"] = new_conf
    verdict["rf_disagreement_penalty"] = penalty
    verdict.setdefault("confidence_adjustments", []).append(breadcrumb)
    return verdict


# ---------------------------------------------------------------------------
# Public entry point — apply all calibrations in order
# ---------------------------------------------------------------------------

def calibrate_verdict(
    verdict: dict,
    market_context: dict | None = None,
    rf_opinion: dict | None = None,
) -> dict:
    """Apply all post-LLM confidence calibrations. Order matters — earnings
    gate first (event-driven uncertainty), then RF disagreement (model
    disagreement). Both are no-ops when their preconditions aren't met.

    Always seeds `confidence_adjustments` to an empty list when no rule
    fires so the UI can display a positive "V2 calibration ran, no
    adjustment was needed" state instead of hiding the module entirely.
    Without this seed the field would be missing on clean verdicts and
    users couldn't tell whether V2 was active or absent.

    Also captures the pre-calibration score under
    `confidence_score_pre_calibration` so the UI can show the user how
    the Final Score was concluded (LLM raw → after gates → final).
    """
    # Snapshot the LLM's raw confidence BEFORE any calibration rule runs.
    # This is what the UI labels "LLM raw" in the score-breakdown section.
    if isinstance(verdict, dict):
        raw = verdict.get("confidence_score")
        if isinstance(raw, (int, float)):
            verdict["confidence_score_pre_calibration"] = int(raw)
    apply_earnings_gate(verdict, market_context)
    apply_rf_disagreement_penalty(verdict, rf_opinion)
    if isinstance(verdict, dict):
        verdict.setdefault("confidence_adjustments", [])
        verdict.setdefault("calibration_version", "v2")
    return verdict
