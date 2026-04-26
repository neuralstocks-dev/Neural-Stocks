"""Regression: top-confluences ranking + dedup logic.

We unit-test the pure helper `_rank_top_confluences()` that the
`/api/idx/top-confluences` route delegates to. This isolates the contract
(quality DESC sort, latest-per-ticker dedup, payload slimming) from the
Motor/FastAPI plumbing — fast, deterministic, no event-loop bleed.

Live e2e of the route is verified separately during release smoke tests
(curl + UI screenshot on /dashboard).
"""
from routers.analysis import _rank_top_confluences


def _row(ticker: str, *, qs: int, tier: str = "moderate", age: int = 30,
         created: str = "2026-04-24T10:00:00+00:00", direction: str = "bullish"):
    return {
        "id": f"id-{ticker}-{created[:10]}",
        "ticker": ticker,
        "created_at": created,
        "recommendation": "BUY",
        "confidence_score": 70,
        "price_at_analysis": 1000,
        "quote_snapshot": {"currency": "IDR"},
        "fundamentals": {"shortName": f"{ticker} Co"},
        "confluence": {
            "direction": direction, "strength": "strong", "pattern_count": 3,
            "patterns": ["Bullish Engulfing"],
            "bandarmology_regime": "strong_accumulation",
            "accumulation_ratio": 0.85, "label": "Test confluence",
            "quality_score": qs, "quality_tier": tier,
            "freshness_age_days": age,
        },
    }


class TestRankTopConfluences:
    def test_sorts_by_quality_desc(self):
        rows = [
            _row("BBCA.JK", qs=55, tier="moderate", age=32),
            _row("BRMS.JK", qs=93, tier="excellent", age=6),
            _row("ELSA.JK", qs=41, tier="moderate", age=47),
        ]
        items = _rank_top_confluences(rows, limit=3)
        scores = [it["quality_score"] for it in items]
        assert scores == [93, 55, 41]
        assert items[0]["ticker"] == "BRMS.JK"
        assert items[0]["quality_tier"] == "excellent"

    def test_dedupes_to_first_row_per_ticker(self):
        # Caller pre-sorts rows by created_at desc, so the FIRST occurrence is
        # the latest analysis. Dedup must keep that one.
        rows = [
            _row("DUP.JK", qs=88, tier="excellent", age=5,
                 created="2026-04-26T10:00:00+00:00"),
            _row("DUP.JK", qs=20, tier="weak", age=5,
                 created="2026-04-21T10:00:00+00:00"),
        ]
        items = _rank_top_confluences(rows, limit=3)
        assert len(items) == 1
        assert items[0]["quality_score"] == 88

    def test_limit_truncates(self):
        rows = [_row(f"T{i}.JK", qs=100 - i) for i in range(10)]
        items = _rank_top_confluences(rows, limit=3)
        assert len(items) == 3
        assert [it["quality_score"] for it in items] == [100, 99, 98]

    def test_ties_broken_by_recency(self):
        rows = [
            _row("OLD.JK", qs=80, created="2026-04-20T10:00:00+00:00"),
            _row("NEW.JK", qs=80, created="2026-04-25T10:00:00+00:00"),
        ]
        items = _rank_top_confluences(rows, limit=2)
        # Same score → newer one ranks first.
        assert items[0]["ticker"] == "NEW.JK"
        assert items[1]["ticker"] == "OLD.JK"

    def test_payload_includes_all_expected_fields(self):
        items = _rank_top_confluences(
            [_row("BRMS.JK", qs=93, tier="excellent", age=6)], limit=1
        )
        it = items[0]
        for k in ("analysis_id", "ticker", "company_name", "created_at",
                  "currency", "price_at_analysis", "recommendation",
                  "confidence_score", "direction", "label", "quality_score",
                  "quality_tier", "freshness_age_days", "pattern_count",
                  "patterns", "accumulation_ratio", "bandarmology_regime"):
            assert k in it, f"missing field: {k}"

    def test_zero_quality_score_doesnt_explode(self):
        # Defensive: if a confluence somehow lacks a quality_score, sort
        # treats it as 0 rather than crashing.
        rows = [
            {"id": "1", "ticker": "X.JK", "created_at": "2026-04-25T00:00Z",
             "confluence": {}},
            _row("Y.JK", qs=50),
        ]
        items = _rank_top_confluences(rows, limit=2)
        assert items[0]["ticker"] == "Y.JK"
        assert items[1]["ticker"] == "X.JK"

    def test_empty_input_returns_empty(self):
        assert _rank_top_confluences([], limit=3) == []
