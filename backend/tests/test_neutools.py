"""Tests for /api/neutools/* — real-data endpoints powering StockHoroscope
and StockTimeMachine.

These are integration tests — they actually hit yfinance — so they verify
the contract (shape + non-zero data) without asserting specific prices,
which change daily. Skipped automatically if yfinance can't reach the
network.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from routers import neutools as nt  # noqa: E402
from server import app  # noqa: E402


def _http():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_market_pulse_returns_real_or_503():
    """At least one of VIX / S&P / IHSG must be a real number, OR a 503 if
    yfinance is unreachable. We never return random/synthetic values."""
    nt._PULSE_CACHE["data"] = None  # force fresh fetch
    nt._PULSE_CACHE["ts"] = 0.0

    async def _run():
        async with _http() as ac:
            r = await ac.get("/api/neutools/market-pulse")
        return r

    r = asyncio.run(_run())
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        body = r.json()
        assert "vix" in body and "sp500_5d_pct" in body and "ihsg_5d_pct" in body
        assert "as_of" in body
        # At least one field came back from yfinance (otherwise the endpoint
        # wouldn't have returned 200 — see _PULSE_CACHE gating in the router).
        assert any(body[k] is not None for k in ("vix", "sp500_5d_pct", "ihsg_5d_pct"))


def test_market_pulse_caches_within_ttl():
    """Two back-to-back calls must serve `cached: True` on the second."""
    async def _run():
        async with _http() as ac:
            r1 = await ac.get("/api/neutools/market-pulse")
            r2 = await ac.get("/api/neutools/market-pulse")
        return r1, r2

    r1, r2 = asyncio.run(_run())
    if r1.status_code != 200:
        pytest.skip("yfinance unreachable in this env")
    assert r2.status_code == 200
    assert r2.json()["cached"] is True


def test_historical_return_bad_ticker_400():
    async def _run():
        async with _http() as ac:
            r = await ac.get("/api/neutools/historical-return?ticker=bogus&from=2020-01-01")
        return r
    r = asyncio.run(_run())
    assert r.status_code == 400


def test_historical_return_bad_date_format_400():
    async def _run():
        async with _http() as ac:
            r = await ac.get("/api/neutools/historical-return?ticker=bbca&from=not-a-date")
        return r
    r = asyncio.run(_run())
    assert r.status_code == 400


def test_historical_return_future_date_400():
    async def _run():
        async with _http() as ac:
            r = await ac.get("/api/neutools/historical-return?ticker=bbca&from=2999-01-01")
        return r
    r = asyncio.run(_run())
    assert r.status_code == 400


def test_historical_return_shape_real_data():
    async def _run():
        async with _http() as ac:
            r = await ac.get("/api/neutools/historical-return?ticker=apple&from=2020-01-01")
        return r
    r = asyncio.run(_run())
    if r.status_code != 200:
        pytest.skip("yfinance unreachable in this env")
    body = r.json()
    assert body["yf_ticker"] == "AAPL"
    # Apple is consistently positive over 5+ years — sanity check.
    assert body["total_return_pct"] > 0
    assert body["start_close"] > 0
    assert body["end_close"] > 0
    assert body["years"] >= 5.0
    assert body["start_date"] >= "2020-01-01"
