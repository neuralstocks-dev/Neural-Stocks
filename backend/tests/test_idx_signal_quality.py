"""Unit tests for the IDX signal-quality diagnostics on the backtest result.

Scope: `compute_idx_signal_quality()` — verifies cohort segmentation,
alignment logic, low-liquidity tagging, and graceful fallback when there
are too few IDX trades to compute stats reliably.

These tests use synthetic verdicts + trades (no DB, no yfinance) so they
run in under 100ms and can be included in every CI pass.
"""
from services.backtest import (
    _verdict_aligned_with_persistence,
    compute_idx_signal_quality,
)


def _v(vid, ticker, rec, persistence_label=None, persistence_consistent=False,
       volume_gate_tripped=False, impact_tier=None):
    return {
        "id": vid,
        "ticker": ticker,
        "recommendation": rec,
        "created_at": "2026-01-01T00:00:00+00:00",
        "bandarmology": {
            "persistence_label": persistence_label,
            "persistence_consistent": persistence_consistent,
            "volume_gate_tripped": volume_gate_tripped,
            "impact_tier": impact_tier,
        } if persistence_label or volume_gate_tripped or impact_tier else None,
    }


def _t(vid, ticker, pnl_pct):
    return {
        "ticker": ticker,
        "entry_verdict_id": vid,
        "pnl_pct": pnl_pct,
    }


# ---------------------------------------------------------------------------
# _verdict_aligned_with_persistence
# ---------------------------------------------------------------------------

def test_alignment_buy_with_accumulation_is_true():
    assert _verdict_aligned_with_persistence("BUY", "persistent_accumulation") is True
    assert _verdict_aligned_with_persistence("BUY", "mild_accumulation") is True


def test_alignment_sell_with_distribution_is_true():
    assert _verdict_aligned_with_persistence("SELL", "persistent_distribution") is True


def test_alignment_buy_with_distribution_is_false():
    assert _verdict_aligned_with_persistence("BUY", "persistent_distribution") is False
    assert _verdict_aligned_with_persistence("BUY", "mild_distribution") is False


def test_alignment_hold_always_none():
    # HOLD has no conviction to agree/disagree with — always None
    assert _verdict_aligned_with_persistence("HOLD", "persistent_accumulation") is None
    assert _verdict_aligned_with_persistence("HOLD", "persistent_distribution") is None


def test_alignment_balanced_insufficient_is_none():
    assert _verdict_aligned_with_persistence("BUY", "balanced") is None
    assert _verdict_aligned_with_persistence("SELL", "insufficient_data") is None
    assert _verdict_aligned_with_persistence("BUY", None) is None


# ---------------------------------------------------------------------------
# compute_idx_signal_quality — ineligible path
# ---------------------------------------------------------------------------

def test_signal_quality_ineligible_when_too_few_idx_trades():
    verdicts = [_v("v1", "BBCA.JK", "BUY", persistence_label="persistent_accumulation",
                   persistence_consistent=True, impact_tier="material")]
    trades = [_t("v1", "BBCA.JK", 5.0)]
    out = compute_idx_signal_quality(verdicts, trades)
    assert out["eligible"] is False
    assert out["n_idx_trades"] == 1
    assert "Need at least 3" in out["note"]


def test_signal_quality_ignores_non_idx_trades():
    verdicts = [
        _v("v1", "AAPL", "BUY"),
        _v("v2", "AAPL", "BUY"),
        _v("v3", "AAPL", "BUY"),
    ]
    trades = [_t("v1", "AAPL", 2.0), _t("v2", "AAPL", 3.0), _t("v3", "AAPL", -1.0)]
    out = compute_idx_signal_quality(verdicts, trades)
    assert out["eligible"] is False
    assert out["n_idx_trades"] == 0


# ---------------------------------------------------------------------------
# compute_idx_signal_quality — eligible, full cohort segmentation
# ---------------------------------------------------------------------------

def test_signal_quality_segments_cohorts_correctly():
    """Craft a mini dataset covering every cohort: aligned-HQ, misaligned,
    low-liquidity, plus each impact tier. Assert the aggregator buckets
    each trade into the correct bins."""
    verdicts = [
        # Aligned-HQ winners: BUY + persistent_accumulation + consistent + gate clean
        _v("v1", "BBCA.JK", "BUY", "persistent_accumulation", True, False, "material"),
        _v("v2", "BBRI.JK", "BUY", "persistent_accumulation", True, False, "notable"),
        # Misaligned: BUY + persistent_distribution
        _v("v3", "TLKM.JK", "BUY", "persistent_distribution", True, False, "cosmetic"),
        # Low-liquidity (gate tripped) — also aligned but gate kills HQ bucket
        _v("v4", "BRMS.JK", "BUY", "persistent_accumulation", True, True, "cosmetic"),
        # Aligned but NOT consistent — should NOT be in HQ bucket
        _v("v5", "UNVR.JK", "BUY", "mild_accumulation", False, False, "notable"),
    ]
    trades = [
        _t("v1", "BBCA.JK", 8.0),      # aligned-HQ winner
        _t("v2", "BBRI.JK", 4.0),      # aligned-HQ winner
        _t("v3", "TLKM.JK", -3.5),     # misaligned loser
        _t("v4", "BRMS.JK", 1.0),      # low-liquidity
        _t("v5", "UNVR.JK", 0.5),      # not HQ (inconsistent)
    ]

    out = compute_idx_signal_quality(verdicts, trades)

    assert out["eligible"] is True
    assert out["n_idx_trades"] == 5
    assert out["all_idx"]["n"] == 5
    assert out["all_idx"]["avg_pnl_pct"] == round((8.0 + 4.0 - 3.5 + 1.0 + 0.5) / 5, 2)
    # 4 winners out of 5 → 80%
    assert out["all_idx"]["win_rate"] == 80.0

    # Aligned-HQ bucket: only v1 and v2
    assert out["aligned_high_quality"]["n"] == 2
    assert out["aligned_high_quality"]["avg_pnl_pct"] == 6.0
    assert out["aligned_high_quality"]["win_rate"] == 100.0

    # Misaligned bucket: only v3
    assert out["misaligned"]["n"] == 1
    assert out["misaligned"]["avg_pnl_pct"] == -3.5

    # Low-liquidity bucket: only v4
    assert out["low_liquidity"]["n"] == 1

    # Impact-tier buckets
    assert out["by_impact_tier"]["material"]["n"] == 1
    assert out["by_impact_tier"]["notable"]["n"] == 2   # v2 + v5
    assert out["by_impact_tier"]["cosmetic"]["n"] == 2  # v3 + v4

    # Narrative note should cite aligned-HQ vs baseline delta
    assert "Aligned high-quality" in out["note"]


def test_signal_quality_skips_trades_without_source_verdict():
    """Trades whose entry_verdict_id isn't in the verdicts list (e.g. the
    verdict was deleted) should be silently ignored, not crash."""
    verdicts = [_v("v1", "BBCA.JK", "BUY", "persistent_accumulation", True, False, "material")]
    trades = [
        _t("v1", "BBCA.JK", 5.0),
        _t("v_missing", "BBRI.JK", 2.0),  # orphan — verdict not in map
    ]
    out = compute_idx_signal_quality(verdicts, trades)
    # Only 1 IDX trade survives → ineligible
    assert out["n_idx_trades"] == 1


def test_signal_quality_verdict_without_bandarmology_still_counted_as_idx():
    """An IDX verdict with no bandarmology block (e.g. filings fetch failed)
    still counts toward the all_idx baseline but falls through the cohort
    buckets, since None persistence is treated as no-signal."""
    verdicts = [
        _v("v1", "BBCA.JK", "BUY"),  # no bandarmology dict
        _v("v2", "BBRI.JK", "BUY"),
        _v("v3", "TLKM.JK", "BUY"),
    ]
    trades = [_t("v1", "BBCA.JK", 3.0), _t("v2", "BBRI.JK", -2.0), _t("v3", "TLKM.JK", 1.5)]
    out = compute_idx_signal_quality(verdicts, trades)
    assert out["eligible"] is True
    assert out["all_idx"]["n"] == 3
    # No cohort attributes → HQ and misaligned buckets are empty
    assert out["aligned_high_quality"]["n"] == 0
    assert out["misaligned"]["n"] == 0
    assert out["low_liquidity"]["n"] == 0
