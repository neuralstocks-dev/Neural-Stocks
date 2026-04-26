"""Unit tests for verdict confidence calibration (Verdict Accuracy v2)."""
from datetime import datetime, timezone, timedelta

from services.verdict_calibration import (
    apply_earnings_gate,
    apply_rf_disagreement_penalty,
    calibrate_verdict,
    EARNINGS_CONFIDENCE_CEILING,
    RF_DISAGREEMENT_PENALTY,
)


def _v(rec="BUY", conf=82):
    return {"recommendation": rec, "confidence_score": conf}


def _earnings_in_days(d):
    """Returns market_context dict with earnings exactly `d` days from now,
    as a full ISO timestamp. Using `.date().isoformat()` would strip the
    time component and round earnings to midnight UTC, producing an
    off-by-one error when tests run later in the day (delta computes to
    d-1 instead of d). Stamping the same wall-clock time keeps delta
    fractional but consistent across runs."""
    when = (datetime.now(timezone.utc) + timedelta(days=d)).isoformat()
    return {"earnings": {"date": when}}


# ---------- earnings gate ----------

def test_earnings_gate_caps_high_confidence_inside_window():
    v = _v(conf=85)
    apply_earnings_gate(v, _earnings_in_days(3))
    assert v["confidence_score"] == EARNINGS_CONFIDENCE_CEILING
    assert v["earnings_gate_applied"] is True
    assert v["days_until_earnings"] == 3
    assert any("Earnings in" in s for s in v["confidence_adjustments"])


def test_earnings_gate_noop_outside_window():
    v = _v(conf=85)
    apply_earnings_gate(v, _earnings_in_days(14))
    assert v["confidence_score"] == 85
    assert "earnings_gate_applied" not in v


def test_earnings_gate_noop_when_already_below_ceiling():
    v = _v(conf=55)
    apply_earnings_gate(v, _earnings_in_days(2))
    assert v["confidence_score"] == 55
    assert "earnings_gate_applied" not in v


def test_earnings_gate_noop_when_no_market_context():
    v = _v(conf=88)
    apply_earnings_gate(v, None)
    assert v["confidence_score"] == 88


# ---------- RF disagreement penalty ----------

def test_rf_disagreement_strong_edge_penalises():
    v = _v(rec="BUY", conf=80)
    rf = {"direction": "down", "edge": "strong", "prob_up": 0.28}
    apply_rf_disagreement_penalty(v, rf)
    assert v["confidence_score"] == 80 - RF_DISAGREEMENT_PENALTY
    assert v["rf_disagreement_penalty"] == RF_DISAGREEMENT_PENALTY
    assert any("RF model disagrees" in s for s in v["confidence_adjustments"])


def test_rf_disagreement_modest_edge_smaller_penalty():
    v = _v(rec="SELL", conf=78)
    rf = {"direction": "up", "edge": "modest", "prob_up": 0.62}
    apply_rf_disagreement_penalty(v, rf)
    expected = 78 - int(RF_DISAGREEMENT_PENALTY * 0.65)
    assert v["confidence_score"] == expected


def test_rf_agreement_does_not_penalise():
    v = _v(rec="BUY", conf=80)
    rf = {"direction": "up", "edge": "strong", "prob_up": 0.78}
    apply_rf_disagreement_penalty(v, rf)
    assert v["confidence_score"] == 80
    assert "rf_disagreement_penalty" not in v


def test_rf_none_edge_does_not_penalise_disagreement():
    v = _v(rec="BUY", conf=80)
    rf = {"direction": "down", "edge": "none", "prob_up": 0.49}
    apply_rf_disagreement_penalty(v, rf)
    assert v["confidence_score"] == 80


def test_rf_neutral_llm_does_not_penalise():
    v = _v(rec="HOLD", conf=70)
    rf = {"direction": "down", "edge": "strong", "prob_up": 0.25}
    apply_rf_disagreement_penalty(v, rf)
    assert v["confidence_score"] == 70


# ---------- combined calibrate_verdict ----------

def test_calibrate_applies_both_in_order():
    """Earnings gate first → caps to 65 → then RF penalty drops further."""
    v = _v(rec="BUY", conf=88)
    rf = {"direction": "down", "edge": "strong", "prob_up": 0.30}
    calibrate_verdict(v, market_context=_earnings_in_days(2), rf_opinion=rf)
    # 88 → capped to 65 → minus 12 = 53
    assert v["confidence_score"] == EARNINGS_CONFIDENCE_CEILING - RF_DISAGREEMENT_PENALTY
    # Both breadcrumbs land
    msgs = " ".join(v["confidence_adjustments"])
    assert "Earnings in" in msgs
    assert "RF model disagrees" in msgs
