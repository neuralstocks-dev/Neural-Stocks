"""Regression tests for the public Timeline Fit share contract.

The `/t/{share_id}` public page renders a strict whitelist of fields
returned by `_public_timeline_view`. This test locks that contract so a
future schema change can't accidentally leak `user_id`, `id`, or any
other owner-private field onto the public page.
"""
from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _sample_reco() -> dict:
    return {
        # PRIVATE fields that MUST be stripped:
        "id": "abc-123-private",
        "user_id": "owner-uuid-private",
        "cached": True,
        # PUBLIC fields that MUST be surfaced:
        "ticker": "AAPL",
        "name": "Apple Inc.",
        "recommendation_label": "Best fit: Long Term",
        "summary": "Apple shows strong fundamentals.",
        "confidence_score": 78,
        "recommended_timeline": "long_term",
        "other_timelines": {
            "short_term": {"fit_score": 42, "note": "Mixed signals."},
            "medium_term": {"fit_score": 65, "note": "Supports 1-2y."},
            "long_term": {"fit_score": 89, "note": "Durable moat."},
        },
        "explanation": "Recurring revenue favors long lens.",
        "strengths": ["Strong FCF"],
        "risks": ["China concentration"],
        "data_completeness_note": "All inputs present.",
        "price_at_analysis": 195.42,
        "currency": "USD",
        "created_at": "2026-02-03T15:30:00Z",
    }


def test_public_timeline_view_strips_owner_private_fields():
    """Whitelist must not surface `user_id` / `id` / `cached` on the
    public share page."""
    from routers.analysis import _public_timeline_view
    out = _public_timeline_view(_sample_reco())
    # PRIVATE fields — MUST be stripped:
    assert "user_id" not in out, "user_id leaked on public share"
    assert "id" not in out, "internal id leaked on public share"
    assert "cached" not in out, "cached flag leaked on public share"


def test_public_timeline_view_surfaces_all_display_fields():
    """The public page binds to these keys — keep them present even when
    refactoring the underlying doc shape."""
    from routers.analysis import _public_timeline_view
    out = _public_timeline_view(_sample_reco())
    expected = {
        "ticker", "name", "recommendation_label", "summary",
        "confidence_score", "recommended_timeline", "other_timelines",
        "explanation", "strengths", "risks", "data_completeness_note",
        "price_at_analysis", "currency", "created_at",
    }
    assert expected.issubset(out.keys()), (
        f"missing public fields: {expected - out.keys()}"
    )
    assert out["ticker"] == "AAPL"
    assert out["recommended_timeline"] == "long_term"
    assert out["other_timelines"]["long_term"]["fit_score"] == 89


def test_public_timeline_view_handles_missing_optional_fields():
    """Older recos may not have name/data_completeness_note. The view
    MUST surface None, not raise."""
    from routers.analysis import _public_timeline_view
    minimal = {
        "ticker": "MSFT",
        "recommendation_label": "Best fit: Medium Term",
        "summary": "...",
        "confidence_score": 60,
        "recommended_timeline": "medium_term",
    }
    out = _public_timeline_view(minimal)
    assert out["ticker"] == "MSFT"
    assert out["name"] is None
    assert out["data_completeness_note"] is None


def test_public_timeline_view_handles_empty_input():
    """Defensive guard — must not raise when the share doc points at a
    deleted reco that returns None."""
    from routers.analysis import _public_timeline_view
    assert _public_timeline_view(None) == {}
    assert _public_timeline_view({}) == {}
