"""Regression: stale-bandarmology gate on confluence detection.

`_compute_confluence()` pairs candlestick patterns with `bandarmology.regime`
to produce "Double-confirmation: bullish reversal + smart-money accumulation"
labels that get persisted on the analysis doc and shown to users on the
analysis page.

Without a staleness check, a 4-year-old "strong_accumulation" regime + a fresh
bullish candlestick would fabricate a fake "double confirmation" — misleading
since the smart-money data is dead. This suite locks in the >90-day cut-off so
future refactors can't silently regress it.
"""
import pytest

from routers.analysis import _is_bandarmology_stale, _compute_confluence


class TestIsBandarmologyStale:
    def test_fresh_today(self):
        # Use a recent date string format ("DD MMM YY") that the parser supports
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%d %b %y")
        assert _is_bandarmology_stale({"recent": [{"date": today}]}) is False

    def test_one_month_old_not_stale(self):
        # BBCA-style: 25 Mar 26 was reported as ~32 days old when shipped
        from datetime import datetime, timezone, timedelta
        d = (datetime.now(timezone.utc) - timedelta(days=32)).strftime("%d %b %y")
        assert _is_bandarmology_stale({"recent": [{"date": d}]}) is False

    def test_four_years_old_is_stale(self):
        # KOBX-style: 14 Jun 22 — way past the 90-day cutoff
        assert _is_bandarmology_stale({"recent": [{"date": "14 Jun 22"}]}) is True

    def test_threshold_boundary_above(self):
        from datetime import datetime, timezone, timedelta
        d = (datetime.now(timezone.utc) - timedelta(days=91)).strftime("%d %b %y")
        assert _is_bandarmology_stale({"recent": [{"date": d}]}) is True

    def test_threshold_boundary_below(self):
        from datetime import datetime, timezone, timedelta
        d = (datetime.now(timezone.utc) - timedelta(days=89)).strftime("%d %b %y")
        assert _is_bandarmology_stale({"recent": [{"date": d}]}) is False

    @pytest.mark.parametrize("payload", [
        {},
        {"recent": []},
        {"recent": [{}]},
        {"recent": [{"date": None}]},
        {"recent": [{"date": "garbage"}]},
        {"recent": [{"date": "32 Foo 26"}]},  # invalid month
        {"recent": [{"date": "99 Mar 26"}]},  # invalid day
        None,
    ])
    def test_malformed_inputs_treated_as_fresh(self, payload):
        # Defensive: never silently suppress confluences for valid data.
        assert _is_bandarmology_stale(payload) is False


class TestComputeConfluenceStaleGate:
    BULLISH_PATTERN = {
        "daily": {"patterns": [{"pattern": "Bullish Engulfing", "bias": "bullish"}]}
    }

    def test_stale_data_suppresses_bullish_confluence(self):
        stale = {
            "regime": "strong_accumulation",
            "accumulation_ratio": 0.95,
            "recent": [{"date": "14 Jun 22"}],
        }
        assert _compute_confluence(self.BULLISH_PATTERN, stale) is None

    def test_fresh_data_fires_bullish_confluence(self):
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%d %b %y")
        fresh = {
            "regime": "strong_accumulation",
            "accumulation_ratio": 0.95,
            "recent": [{"date": today}],
        }
        result = _compute_confluence(self.BULLISH_PATTERN, fresh)
        assert result is not None
        assert result["direction"] == "bullish"
        assert "smart-money accumulation" in result["label"]

    def test_stale_data_suppresses_bearish_confluence(self):
        stale = {
            "regime": "strong_distribution",
            "accumulation_ratio": 0.05,
            "recent": [{"date": "01 Jan 23"}],  # ~3 years old
        }
        bearish_pattern = {
            "daily": {"patterns": [{"pattern": "Evening Star", "bias": "bearish"}]}
        }
        assert _compute_confluence(bearish_pattern, stale) is None

    def test_stale_data_suppresses_divergence_too(self):
        # When data is stale the divergence interpretation is also nonsense
        # (we don't know what insiders are currently doing — the regime is dead).
        stale = {
            "regime": "strong_distribution",
            "accumulation_ratio": 0.10,
            "recent": [{"date": "14 Jun 22"}],
        }
        assert _compute_confluence(self.BULLISH_PATTERN, stale) is None
