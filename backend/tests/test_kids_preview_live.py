"""Tests for the on-demand live-analysis flow on /api/kids/preview/{ticker}.

Locks the contract:
  - Cache HIT  → 200 with kid_view inline (existing behaviour, unchanged).
  - Cache MISS → 202 with job_id (NEW — net-new tickers no longer 503).
  - Job poll   → returns pending → done with kid_view, or error.
  - Rate limit → blocks abusive enumeration.
  - Bad ticker / age → 400.
  - Unknown job_id → 404.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch, AsyncMock

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from motor.motor_asyncio import AsyncIOMotorClient
from httpx import AsyncClient, ASGITransport

import core.db as core_db
from routers import kids_preview as kp
from server import app


def _http():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _setup_test_db():
    """Returns a per-test motor db handle with the relevant collections
    wiped. Patches both `core.db.db` and the captured-at-import-time
    `kids_preview.db` reference (the latter is critical because
    `from core.db import db` snapshots the module attribute)."""
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    test_db = cli[os.environ["DB_NAME"] + "_kp_live_test"]
    return cli, test_db


async def _wipe(test_db):
    for coll in ("analyses", "kids_preview_jobs", "kids_preview_rate"):
        await test_db[coll].drop()


def test_preview_cache_hit_returns_kid_view():
    async def _run():
        cli, db = _setup_test_db()
        await _wipe(db)
        original_core, original_kp = core_db.db, kp.db
        core_db.db = db
        kp.db = db
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.analyses.insert_one({
                "id": "fix-aapl-1", "ticker": "AAPL", "user_id": "test",
                "created_at": now_iso, "price_at_analysis": 200.0,
                "recommendation": "HOLD", "confidence_score": 60,
                "reasoning": "Mixed.", "quote_snapshot": {"name": "Apple Inc.", "currency": "USD"},
            })
            fake_kid = {
                "kid_headline": "Apple is mixed",
                "kid_explanation": "Some good, some not.",
                "did_you_know": [], "reflection_question": "What do you think?",
                "what_would_change_my_mind": "If RSI flips.",
                "confidence_plain_english": "Sort of sure.", "emoji_mood": "🤔",
            }
            with patch.object(kp, "translate_for_age", AsyncMock(return_value=fake_kid)):
                async with _http() as ac:
                    r = await ac.get("/api/kids/preview/AAPL?age=11-13")
            assert r.status_code == 200
            body = r.json()
            assert body["kid_view"]["kid_headline"] == "Apple is mixed"
            assert "job_id" not in body
        finally:
            core_db.db, kp.db = original_core, original_kp
            cli.close()

    asyncio.run(_run())


def test_preview_cache_miss_returns_202_with_job_id():
    """The bug fix: net-new ticker no longer 503s."""
    async def _run():
        cli, db = _setup_test_db()
        await _wipe(db)
        original_core, original_kp = core_db.db, kp.db
        core_db.db = db
        kp.db = db
        try:
            with patch.object(kp, "_run_kid_analysis_job", AsyncMock(return_value=None)):
                async with _http() as ac:
                    r = await ac.get("/api/kids/preview/RBLX?age=11-13")
            assert r.status_code == 202
            body = r.json()
            assert body["status"] == "pending"
            assert body["ticker"] == "RBLX"
            assert "job_id" in body and len(body["job_id"]) >= 8
            assert body["poll_url"] == f"/api/kids/preview/job/{body['job_id']}"
            assert await db.kids_preview_jobs.count_documents({"job_id": body["job_id"]}) == 1
            assert await db.kids_preview_rate.count_documents({"ticker": "RBLX"}) == 1
        finally:
            core_db.db, kp.db = original_core, original_kp
            cli.close()

    asyncio.run(_run())


def test_poll_job_states():
    """Done returns the prepared payload; pending surfaces stage_label;
    error surfaces the error string; unknown job → 404."""
    async def _run():
        cli, db = _setup_test_db()
        await _wipe(db)
        original_core, original_kp = core_db.db, kp.db
        core_db.db = db
        kp.db = db
        try:
            payload = {
                "ticker": "RBLX", "name": "Roblox", "age_band": "11-13",
                "lang": "en", "kid_view": {"kid_headline": "All good!"},
                "adult_snapshot": {}, "generated_at": "2026-01-01T00:00:00Z",
            }
            await db.kids_preview_jobs.insert_many([
                {"job_id": "done1", "ticker": "RBLX", "age": "11-13", "lang": "en",
                 "status": "done", "payload": payload,
                 "created_at_ts": datetime.now(timezone.utc)},
                {"job_id": "pend1", "ticker": "ZZZ", "age": "11-13", "lang": "en",
                 "status": "pending", "stage_label": "Reading the chart…",
                 "created_at_ts": datetime.now(timezone.utc)},
                {"job_id": "err1", "ticker": "ZZZ", "age": "11-13", "lang": "en",
                 "status": "error", "error": "Something broke",
                 "created_at_ts": datetime.now(timezone.utc)},
            ])
            async with _http() as ac:
                r_done = await ac.get("/api/kids/preview/job/done1")
                r_pend = await ac.get("/api/kids/preview/job/pend1")
                r_err = await ac.get("/api/kids/preview/job/err1")
                r_404 = await ac.get("/api/kids/preview/job/missing")
            assert r_done.status_code == 200
            assert r_done.json()["kid_view"]["kid_headline"] == "All good!"
            assert r_done.json()["_job"]["status"] == "done"
            assert r_pend.json()["_job"] == {
                "status": "pending", "job_id": "pend1",
                "ticker": "ZZZ", "stage_label": "Reading the chart…",
                "stage_offset_s": None,
            }
            assert r_err.json()["_job"]["status"] == "error"
            assert r_err.json()["_job"]["error"] == "Something broke"
            assert r_404.status_code == 404
        finally:
            core_db.db, kp.db = original_core, original_kp
            cli.close()

    asyncio.run(_run())


def test_rate_limit_blocks_after_threshold():
    """KID_PREVIEW_RATE_PER_HOUR consumed → next cache-miss must 429."""
    async def _run():
        cli, db = _setup_test_db()
        await _wipe(db)
        original_core, original_kp = core_db.db, kp.db
        core_db.db = db
        kp.db = db
        try:
            now = datetime.now(timezone.utc)
            ip_h = kp._ip_hash("198.51.100.7")
            for i in range(kp.KID_RATE_LIMIT):
                await db.kids_preview_rate.insert_one({
                    "ip_hash": ip_h, "ticker": f"T{i}", "created_at_ts": now,
                })
            with patch.object(kp, "_run_kid_analysis_job", AsyncMock(return_value=None)):
                async with _http() as ac:
                    r = await ac.get(
                        "/api/kids/preview/NEWONE?age=11-13",
                        headers={"X-Forwarded-For": "198.51.100.7"},
                    )
            assert r.status_code == 429
        finally:
            core_db.db, kp.db = original_core, original_kp
            cli.close()

    asyncio.run(_run())


def test_bad_ticker_shape_and_age_return_400():
    async def _run():
        cli, db = _setup_test_db()
        await _wipe(db)
        original_core, original_kp = core_db.db, kp.db
        core_db.db = db
        kp.db = db
        try:
            async with _http() as ac:
                r1 = await ac.get("/api/kids/preview/!!!?age=11-13")
                r2 = await ac.get("/api/kids/preview/AAPL?age=99-100")
            assert r1.status_code == 400
            assert r2.status_code == 400
        finally:
            core_db.db, kp.db = original_core, original_kp
            cli.close()

    asyncio.run(_run())
