"""Offline unit tests for the relative-strength screener's pure logic —
no network, no LLM, no DB. Covers the same-day-divergence detector, the
scheduled-agent due-ness check, and the guidance-proxy quarter-key helper,
since these are the parts most likely to have off-by-one/boundary bugs.
"""
import os
import sys
from datetime import datetime

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.relative_strength_screener import _find_divergence_hit
from services.scheduled_agents import _is_due
from services.finnhub import _next_quarter_key


def _closes(prices_by_date: dict) -> pd.DataFrame:
    idx = pd.DatetimeIndex([datetime.fromisoformat(d) for d in prices_by_date])
    return pd.DataFrame({"Close": list(prices_by_date.values())}, index=idx)


class TestFindDivergenceHit:
    def test_hit_when_near_ath_and_spy_down_same_day(self):
        hist = _closes({
            "2026-06-01": 90.0,
            "2026-06-02": 100.0,  # ATH
            "2026-06-03": 99.5,   # within 1% of ATH, and SPY down that day
        })
        spy_pct = {"2026-06-03": -0.008}
        hit = _find_divergence_hit(hist, spy_pct)
        assert hit is not None
        assert hit["divergence_date"] == "2026-06-03"
        assert hit["ath_price"] == 100.0

    def test_no_hit_when_price_too_far_from_ath(self):
        hist = _closes({
            "2026-06-01": 100.0,  # ATH
            "2026-06-02": 95.0,   # 5% off ATH — outside the 1% band
        })
        spy_pct = {"2026-06-02": -0.01}
        assert _find_divergence_hit(hist, spy_pct) is None

    def test_no_hit_when_spy_not_down_enough_same_day(self):
        hist = _closes({
            "2026-06-01": 100.0,
            "2026-06-02": 99.7,  # near ATH...
        })
        spy_pct = {"2026-06-02": -0.002}  # ...but SPY only down 0.2%
        assert _find_divergence_hit(hist, spy_pct) is None

    def test_no_hit_when_divergence_on_different_day_than_near_ath(self):
        # Same-day requirement (HANDOFF.md decision #1): near-ATH on day A,
        # market-down on day B must NOT count even if both occurred within
        # the trailing window.
        hist = _closes({
            "2026-06-01": 100.0,  # ATH, but SPY was flat this day
            "2026-06-02": 90.0,   # SPY down big this day, but price far from ATH
        })
        spy_pct = {"2026-06-01": 0.0, "2026-06-02": -0.02}
        assert _find_divergence_hit(hist, spy_pct) is None

    def test_prefers_most_recent_qualifying_day(self):
        hist = _closes({
            "2026-06-01": 100.0,  # ATH
            "2026-06-02": 99.5,   # qualifies
            "2026-06-03": 99.8,   # also qualifies, more recent
        })
        spy_pct = {"2026-06-02": -0.01, "2026-06-03": -0.01}
        hit = _find_divergence_hit(hist, spy_pct)
        assert hit["divergence_date"] == "2026-06-03"


class TestIsDue:
    def _agent(self, days, time_str, last_fired_date=None):
        return {"schedule": {"days": days, "time": time_str}, "last_fired_date": last_fired_date}

    def test_due_when_time_reached_and_not_fired_today(self):
        agent = self._agent(["mon", "tue", "wed", "thu", "fri"], "09:00")
        now = datetime(2026, 7, 20, 9, 3)  # a Monday, just after 9am
        assert _is_due(agent, now) is True

    def test_not_due_before_scheduled_time(self):
        agent = self._agent(["mon"], "09:00")
        now = datetime(2026, 7, 20, 8, 55)
        assert _is_due(agent, now) is False

    def test_not_due_on_off_day(self):
        agent = self._agent(["mon", "tue", "wed", "thu", "fri"], "09:00")
        now = datetime(2026, 7, 25, 9, 3)  # a Saturday
        assert _is_due(agent, now) is False

    def test_not_due_if_already_fired_today(self):
        agent = self._agent(["mon"], "09:00", last_fired_date="2026-07-20")
        now = datetime(2026, 7, 20, 9, 30)
        assert _is_due(agent, now) is False

    def test_due_again_next_day_after_firing(self):
        agent = self._agent(["mon", "tue"], "09:00", last_fired_date="2026-07-20")
        now = datetime(2026, 7, 21, 9, 5)  # Tuesday
        assert _is_due(agent, now) is True


class TestNextQuarterKey:
    def test_rolls_within_year(self):
        assert _next_quarter_key(2026, 1) == "2026Q2"
        assert _next_quarter_key(2026, 3) == "2026Q4"

    def test_rolls_into_next_year(self):
        assert _next_quarter_key(2026, 4) == "2027Q1"

    def test_none_on_missing_input(self):
        assert _next_quarter_key(None, 2) is None
        assert _next_quarter_key(2026, None) is None
