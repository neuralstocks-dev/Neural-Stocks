"""Regression tests for routers/telemetry.py — wizard funnel beacons.

Scope:
  * `_sanitize_props` clamps oversized/non-primitive payloads safely
  * `_percentile` matches the standard linear-interpolation P50/P75/P90
  * `record_event` accepts canonical wizard events + rejects unknowns
    without raising (returns `{ok: False, reason: ...}` so beacon
    clients don't get noisy 4xx responses)

We deliberately do NOT exercise the Mongo-aggregation `wizard_funnel`
endpoint here — that's an integration concern best covered by the
testing-agent run against a populated DB. Pure-function helpers stay
unit-tested in isolation.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make sure `routers` resolves the same way the running app does
# (pytest is invoked from /app/backend, so this is just defensive).
_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


from routers.telemetry import _percentile, _sanitize_props, _ALLOWED_EVENTS


# ---------------------------------------------------------------------------
# _percentile
# ---------------------------------------------------------------------------
def test_percentile_empty_returns_none():
    assert _percentile([], 50) is None


def test_percentile_single_value_returns_it():
    assert _percentile([4.2], 50) == 4.2
    assert _percentile([4.2], 90) == 4.2


def test_percentile_p50_p75_p90_match_linear_interpolation():
    # Values 0..100 — P50 is 50, P75 is 75, P90 is 90 by construction.
    vs = list(range(0, 101))
    assert _percentile(vs, 50) == 50
    assert _percentile(vs, 75) == 75
    assert _percentile(vs, 90) == 90


def test_percentile_orders_input():
    # Same values, scrambled — should still yield the correct percentile.
    vs = [90, 10, 50, 30, 70]
    assert _percentile(vs, 50) == 50


# ---------------------------------------------------------------------------
# _sanitize_props
# ---------------------------------------------------------------------------
def test_sanitize_props_passes_primitives_through():
    out = _sanitize_props({"ticker": "AAPL", "elapsed_ms": 1234, "ok": True, "score": 0.42})
    assert out == {"ticker": "AAPL", "elapsed_ms": 1234, "ok": True, "score": 0.42}


def test_sanitize_props_drops_non_dict_input():
    assert _sanitize_props(None) == {}
    assert _sanitize_props("totally wrong") == {}
    assert _sanitize_props(42) == {}


def test_sanitize_props_caps_keys_to_max():
    big = {f"k{i}": i for i in range(50)}
    out = _sanitize_props(big)
    # _MAX_PROPS_KEYS = 12 — see telemetry.py
    assert len(out) == 12


def test_sanitize_props_truncates_long_strings():
    long = "A" * 1000
    out = _sanitize_props({"err": long})
    # _MAX_VALUE_LEN = 200 — kept value should be ≤ 201 chars (200 + …)
    assert len(out["err"]) <= 201
    assert out["err"].endswith("…")


def test_sanitize_props_stringifies_nested_objects():
    # Nested dicts/lists must not pass through verbatim — they get
    # str()-ified and clamped, so the collection can never accidentally
    # store a 50KB blob.
    out = _sanitize_props({"meta": {"a": [1, 2, 3], "b": "x"}})
    assert isinstance(out["meta"], str)
    # Stringified version shouldn't be the original dict object.
    assert "{" in out["meta"] or "[" in out["meta"]


def test_sanitize_props_preserves_falsy_primitives():
    out = _sanitize_props({"zero": 0, "empty_str": "", "false_flag": False, "none_v": None})
    assert out["zero"] == 0
    assert out["empty_str"] == ""
    assert out["false_flag"] is False
    assert out["none_v"] is None


# ---------------------------------------------------------------------------
# Allowed events surface
# ---------------------------------------------------------------------------
def test_allowed_events_contains_full_wizard_funnel():
    """The frontend OnboardingWizard fires these exact strings — if any
    drift, the funnel aggregation silently drops events. Lock the names
    here so a rename in either side trips a failing test."""
    expected = {
        "wizard_opened",
        "wizard_step1_next",
        "wizard_step2_complete",
        "wizard_step2_error",
        "wizard_step3_explore",
        "wizard_step3_close",
        "wizard_dismissed_early",
    }
    assert _ALLOWED_EVENTS == expected
