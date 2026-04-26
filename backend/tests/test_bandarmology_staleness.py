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


class TestConfluenceQualityScore:
    """The quality score (0–100) bakes 4 multiplicative factors:
       freshness × regime_strength × pattern_count × direction.

    These tests lock in the relative ordering rather than the exact integer
    values so the scoring constants can be retuned in one place without
    rewriting the regression suite — what matters is the shape of the
    distribution, not the precise numbers.
    """

    def _bandar(self, regime: str, age_days: int) -> dict:
        from datetime import datetime, timezone, timedelta
        d = (datetime.now(timezone.utc) - timedelta(days=age_days)).strftime("%d %b %y")
        return {"regime": regime, "accumulation_ratio": 0.95, "recent": [{"date": d}]}

    def _patterns(self, n: int, bias: str = "bullish") -> dict:
        names = {"bullish": "Bullish Engulfing", "bearish": "Evening Star"}
        return {
            "daily": {
                "patterns": [
                    {"pattern": f"{names[bias]} {i}", "bias": bias} for i in range(n)
                ]
            }
        }

    def test_fresh_strong_3_patterns_is_excellent(self):
        c = _compute_confluence(
            self._patterns(3, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        assert c is not None
        assert c["quality_tier"] == "excellent"
        assert c["quality_score"] >= 95

    def test_fresh_mild_1_pattern_is_lower_tier(self):
        c = _compute_confluence(
            self._patterns(1, "bullish"),
            self._bandar("mild_accumulation", age_days=0),
        )
        assert c is not None
        # mild × 1 pattern × bullish × today = 1.0 * 0.7 * 0.7 * 1.0 = 0.49 → 49 → moderate
        assert c["quality_tier"] in ("moderate", "weak")
        assert c["quality_score"] < 60

    def test_age_degrades_score(self):
        fresh = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        old = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_accumulation", age_days=70),
        )
        assert fresh is not None and old is not None
        assert fresh["quality_score"] > old["quality_score"]
        assert fresh["freshness_age_days"] == 0
        assert old["freshness_age_days"] >= 69  # tz fuzz tolerance

    def test_divergence_scores_lower_than_confluence_with_same_inputs(self):
        bull = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        diverg = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_distribution", age_days=0),
        )
        assert bull is not None and diverg is not None
        # Same age, same regime strength, same pattern count — only direction differs.
        # Direction factor is 0.5 for divergence vs 1.0 for confluent → score halves.
        assert bull["quality_score"] > diverg["quality_score"]
        assert diverg["direction"] == "divergence"

    def test_strong_regime_scores_higher_than_mild(self):
        strong = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        mild = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("mild_accumulation", age_days=0),
        )
        assert strong is not None and mild is not None
        assert strong["quality_score"] > mild["quality_score"]

    def test_more_patterns_score_higher(self):
        one = _compute_confluence(
            self._patterns(1, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        three = _compute_confluence(
            self._patterns(3, "bullish"),
            self._bandar("strong_accumulation", age_days=0),
        )
        assert one is not None and three is not None
        assert three["quality_score"] > one["quality_score"]

    def test_score_tier_band_invariants(self):
        # Confirm the tier mapping respects the documented bands so the
        # frontend badge color logic can rely on the tier string alone.
        from routers.analysis import _confluence_quality
        assert _confluence_quality(direction="bullish", regime="strong_accumulation",
                                    pattern_count=3, age_days=0)["quality_tier"] == "excellent"
        assert _confluence_quality(direction="bullish", regime="strong_accumulation",
                                    pattern_count=2, age_days=20)["quality_tier"] in ("excellent", "strong")
        assert _confluence_quality(direction="bullish", regime="mild_accumulation",
                                    pattern_count=1, age_days=80)["quality_tier"] in ("weak",)
        assert _confluence_quality(direction="divergence", regime="mild_accumulation",
                                    pattern_count=1, age_days=80)["quality_tier"] == "weak"

    def test_quality_block_includes_all_factors(self):
        c = _compute_confluence(
            self._patterns(2, "bullish"),
            self._bandar("strong_accumulation", age_days=10),
        )
        assert c is not None
        for k in ("quality_score", "quality_tier", "freshness_age_days",
                  "freshness_factor", "regime_factor", "count_factor", "direction_factor"):
            assert k in c, f"missing key: {k}"
        assert 0 <= c["quality_score"] <= 100
