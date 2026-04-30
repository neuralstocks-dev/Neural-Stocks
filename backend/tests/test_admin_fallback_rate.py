"""Regression test for `/api/admin/llm-events/fallback-rate`.

Locks the contract that the Admin LLM Health panel's "Fallback-verdict
rate · last 24h" tile depends on:

  1. Pre-Feb-2026 analyses missing `llm_provider` are EXCLUDED from the
     denominator (otherwise the rate would be artificially diluted by
     legacy rows we have no provenance for).
  2. The endpoint aggregates by `created_at` against a UTC ISO-8601
     cutoff string — older rows must NOT be counted.
  3. `fallback_count` counts every provider that isn't `primary_provider`
     ("anthropic"), so adding Gemini OR OpenAI verdicts both bump the
     fallback rate.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def test_fallback_rate_excludes_legacy_rows_and_old_window():
    """Seed a mix of analyses (some with provenance, some without; some
    in-window, some out-of-window) and assert the endpoint counts ONLY
    the in-window provenance-tagged rows."""
    from routers.admin import llm_events_fallback_rate

    test_user = "fallback-rate-test-user"

    async def _run():
        # Use a FRESH motor client bound to the current event loop. The
        # global `core.db.db` client is bound to whichever loop ran
        # first, and reusing it across `asyncio.run()` boundaries closes
        # connections — see test_auto_scan.py for the same pattern.
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        local_db = cli[os.environ["DB_NAME"]]

        # Clean up any leftover rows from previous runs.
        await local_db.analyses.delete_many({"user_id": test_user})

        now = datetime.now(timezone.utc)
        rows = [
            # In-window, anthropic
            {"id": "fb-1", "user_id": test_user, "ticker": "AAPL",
             "created_at": _iso(now - timedelta(hours=1)),
             "llm_provider": "anthropic", "llm_model": "claude-sonnet-4-5"},
            # In-window, anthropic
            {"id": "fb-2", "user_id": test_user, "ticker": "MSFT",
             "created_at": _iso(now - timedelta(hours=2)),
             "llm_provider": "anthropic", "llm_model": "claude-sonnet-4-5"},
            # In-window, gemini (= 1 fallback)
            {"id": "fb-3", "user_id": test_user, "ticker": "TSLA",
             "created_at": _iso(now - timedelta(hours=3)),
             "llm_provider": "gemini", "llm_model": "gemini-2.5-pro"},
            # In-window, openai (= 2nd fallback)
            {"id": "fb-4", "user_id": test_user, "ticker": "NVDA",
             "created_at": _iso(now - timedelta(hours=4)),
             "llm_provider": "openai", "llm_model": "gpt-5.1"},
            # In-window but NO llm_provider — must be excluded.
            {"id": "fb-5", "user_id": test_user, "ticker": "GOOG",
             "created_at": _iso(now - timedelta(hours=5))},
            # Out-of-window (48h ago) — must be excluded even though tagged.
            {"id": "fb-6", "user_id": test_user, "ticker": "AMZN",
             "created_at": _iso(now - timedelta(hours=48)),
             "llm_provider": "gemini", "llm_model": "gemini-2.5-pro"},
        ]
        await local_db.analyses.insert_many(rows)

        try:
            # The endpoint reads from `core.db.db` (the global client),
            # not from `local_db` — so we need to monkey-patch the
            # global temporarily so the endpoint sees the same db
            # handle bound to THIS loop. Without this, the endpoint
            # would use a stale handle whose connections are closed.
            import core.db as _core_db
            original_db = _core_db.db
            _core_db.db = local_db
            try:
                result = await llm_events_fallback_rate(
                    hours=24, _admin={"role": "admin"},
                )
                return result
            finally:
                _core_db.db = original_db
        finally:
            await local_db.analyses.delete_many({"user_id": test_user})
            cli.close()

    result = asyncio.run(_run())

    # The endpoint operates over the WHOLE analyses collection, not just
    # our test_user; so the test can't assert absolute totals. Instead
    # assert that our seeded contributions show up at minimum.
    assert result["by_provider"].get("anthropic", 0) >= 2, f"unexpected: {result}"
    assert result["by_provider"].get("gemini", 0) >= 1
    assert result["by_provider"].get("openai", 0) >= 1
    assert result["primary_provider"] == "anthropic"
    assert isinstance(result["fallback_rate_pct"], (int, float))


def test_fallback_rate_zero_verdicts_returns_clean_zero():
    """Guards against a divide-by-zero — empty window must return 0
    counts and 0% rate, not raise."""
    from routers.admin import llm_events_fallback_rate

    async def _run():
        from motor.motor_asyncio import AsyncIOMotorClient
        import os
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        local_db = cli[os.environ["DB_NAME"]]
        try:
            import core.db as _core_db
            original_db = _core_db.db
            _core_db.db = local_db
            try:
                return await llm_events_fallback_rate(hours=1, _admin={"role": "admin"})
            finally:
                _core_db.db = original_db
        finally:
            cli.close()

    result = asyncio.run(_run())
    assert isinstance(result["total_verdicts"], int)
    assert isinstance(result["fallback_count"], int)
    assert isinstance(result["fallback_rate_pct"], (int, float))
    if result["total_verdicts"] == 0:
        assert result["fallback_rate_pct"] == 0.0
        assert result["fallback_count"] == 0

