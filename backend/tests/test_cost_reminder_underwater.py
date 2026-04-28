"""Regression test — when the credit-balance anchor goes underwater
(used_credits ≥ credits_at_top_up), the Telegram low-balance push must
NOT send a misleading "0 verdicts left" alert. Instead, it should send
a clearer "anchor needs refresh" nudge so the admin updates the anchor
rather than panicking about a fake 0-balance.

This guards against the regression where users received Telegram alerts
claiming "0 credits left for Universal Key" while their actual upstream
balance was still healthy.
"""
import asyncio
import os
import sys
from types import SimpleNamespace

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from services import cost_reminder as cr  # noqa: E402


class _FakeAppSettings:
    """Drop-in stand-in for db.app_settings supporting find_one + update_one."""

    def __init__(self, docs):
        # docs: dict[id_str, dict]
        self.docs = dict(docs)
        self.last_update = None

    async def find_one(self, query, _proj=None):
        return self.docs.get(query.get("_id"))

    async def update_one(self, query, update, upsert=False):
        self.last_update = (query, update)
        target = self.docs.setdefault(query.get("_id"), {})
        if "$set" in update:
            target.update(update["$set"])


def _make_db(*, anchor_credits, used_count, alert_pref):
    """Build a fake db that satisfies the cost_reminder dependencies."""
    docs = {
        "credit_balance_anchor": {
            "credits_at_top_up": anchor_credits,
            "top_up_at": "2026-04-20T00:00:00+00:00",
        },
        "cost_anchor_tg_alert": dict(alert_pref),
    }
    settings = _FakeAppSettings(docs)

    class _AnalysesCursor:
        def __init__(self, n):
            self.n = n

        async def count_documents(self, _q):
            return self.n

    db = SimpleNamespace(
        app_settings=settings,
        analyses=_AnalysesCursor(used_count),
    )
    return db, settings


@pytest.fixture(autouse=True)
def _patch_dependencies(monkeypatch):
    """Always patch out telegram + db so tests don't reach the network."""
    sent = {}

    async def fake_send(user_id, title, body):
        sent["user_id"] = user_id
        sent["title"] = title
        sent["body"] = body
        return True

    monkeypatch.setattr(cr, "send_alert_to_user", fake_send)
    monkeypatch.setattr(cr, "_tg_configured", lambda: True)
    monkeypatch.setattr(cr, "_TG_LOW_BALANCE_THRESHOLD", 10, raising=False)

    yield sent


def test_underwater_anchor_sends_refresh_nudge_not_zero_credits_alert(_patch_dependencies, monkeypatch):
    """81 verdicts × 2.7 credits = 218.7 used vs 54.89 anchored → underwater.
    Expectation: alert kind == 'anchor_refresh_needed' and the message
    body must NOT mention '0 verdicts left' or '0.00 credits' as a hard
    claim.
    """
    db, settings = _make_db(
        anchor_credits=54.89,
        used_count=81,
        alert_pref={
            "enabled": True,
            "user_id": "admin-uid",
            "threshold": 10,
        },
    )
    monkeypatch.setattr(cr, "db", db)

    sent = _patch_dependencies
    result = asyncio.run(cr.run_tg_low_balance_check_once(force=True))

    assert result["sent"] is True
    assert result["kind"] == "anchor_refresh_needed"
    assert "anchor needs refresh" in sent["title"].lower()
    # Must NOT make the misleading "0 verdicts left" claim.
    assert "0 verdicts left" not in sent["body"].lower()
    assert "verdicts left" not in sent["body"].lower(), (
        "Underwater alert should pivot to anchor-refresh language, not "
        "claim a definitive verdicts-left count."
    )
    # Must surface the underwater diagnostic so admin understands why.
    assert "underwater" in sent["body"].lower()
    assert "refresh" in sent["body"].lower()


def test_healthy_low_balance_still_sends_standard_low_alert(_patch_dependencies, monkeypatch):
    """When the projection is just LOW (not underwater), the original
    low-balance message should still fire."""
    # 100 anchor credits, 10 used → 90 remaining → ~33 verdicts left.
    # Push threshold to 50 so verdicts_left=33 < threshold triggers.
    db, _ = _make_db(
        anchor_credits=100.0,
        used_count=10,
        alert_pref={
            "enabled": True,
            "user_id": "admin-uid",
            "threshold": 50,
        },
    )
    monkeypatch.setattr(cr, "db", db)

    sent = _patch_dependencies
    result = asyncio.run(cr.run_tg_low_balance_check_once(force=True))

    assert result["sent"] is True
    assert result["kind"] == "low_balance"
    assert "Universal Key low" in sent["title"]
    assert "verdicts</b> left" in sent["body"]
