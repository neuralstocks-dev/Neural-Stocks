"""Source-health telemetry — measures the upstream data sources we depend
on (yfinance, Finnhub, RapidAPI IDX, news feeds, etc.) the same way we
measure LLM providers.

Usage:
    @track("finnhub.get_quote")
    async def get_quote(symbol):
        ...

The decorator records each call's outcome + elapsed_s into the
`source_events` Mongo collection (capped, fire-and-forget). The admin
LLM-Health panel surfaces the per-source success-rate strip so we can
spot a degraded data vendor at a glance — same pattern as the LLM
provider strip.

Outcomes:
  - "success" — function returned a truthy value
  - "empty"   — function returned None (used to distinguish "vendor
                replied but had no data for this ticker" from a real failure)
  - "failure" — function raised an exception
"""
from __future__ import annotations

import functools
import time
from typing import Optional

from core.db import db


async def _record(
    source: str,
    outcome: str,
    elapsed_s: float,
    ticker: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    """Best-effort insert into `source_events`. Mongo blip MUST NEVER
    break the calling fetch — we wrap everything in a bare except."""
    try:
        await db.source_events.insert_one({
            "ts": time.time(),
            "source": source,
            "outcome": outcome,
            "elapsed_s": round(elapsed_s, 3),
            "ticker": ticker,
            "reason": reason,
        })
    except Exception:
        pass


def track(source_name: str):
    """Async-only decorator. Records every call's outcome into
    `source_events`. The first positional arg is captured as `ticker`
    if it's a string — useful for triaging "AAPL fails on yfinance but
    everything else works".

    The decorated function's return value semantics:
      - non-None      → recorded as "success"
      - None          → recorded as "empty" (vendor responded, no data)
      - raised exc    → recorded as "failure" with the exception class name
                        as the reason; exception is re-raised unchanged.
    """
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            ticker = args[0] if args and isinstance(args[0], str) else None
            started = time.monotonic()
            try:
                result = await fn(*args, **kwargs)
                elapsed = time.monotonic() - started
                outcome = "empty" if result is None else "success"
                await _record(source_name, outcome, elapsed, ticker)
                return result
            except Exception as e:
                elapsed = time.monotonic() - started
                await _record(
                    source_name, "failure", elapsed, ticker,
                    reason=type(e).__name__,
                )
                raise
        return wrapper
    return decorator
