"""LLM circuit breaker — protects users from Claude upstream outages.

Problem: when Claude/LiteLLM hits a retry storm (transient 5xx, socket
hangs), individual analysis jobs still correctly time out at 180s, but
EVERY guest/paid user who clicks "Analyze" during that window waits 3
full minutes before seeing an error. That's wasted user patience AND
wasted LLM-key budget on retries that will fail anyway.

Solution: track the rolling outcome of the last N LLM-backed analysis
jobs. When failure rate crosses a threshold, trip the breaker — new
`POST /start` and `POST /try` requests return HTTP 503 *instantly* with
a polite message until we observe enough successes to reset.

State is process-local (in-memory). Running multiple workers means each
holds its own breaker — which is fine: each worker independently
samples Claude health. If one worker trips, users routed there get the
fast-fail; users routed to a healthy worker still get analyses. No
cross-worker synchronization needed.

The breaker tracks a *single* Claude-health signal (not per-ticker or
per-user) because Claude outages are model-provider-wide, not scoped.

Thread/async safety: the underlying deque + int counters are mutated
from inside asyncio tasks. Python's GIL makes the individual list/int
ops atomic, and the compound decisions here (check trip-state then
route) are read-only against the snapshot — so no lock needed.
"""
from __future__ import annotations

import logging
import os
import time
from collections import deque
from typing import Literal

_log = logging.getLogger(__name__)

# ---- Config (env-tunable) ------------------------------------------------
# Consecutive timeout count that TRIPS the breaker. Default 3 — tight
# enough to fast-fail during genuine outages, loose enough to absorb
# one-off slow LLM calls without penalizing healthy traffic.
_TRIP_AFTER = int(os.environ.get("LLM_BREAKER_TRIP_AFTER", "3"))

# Consecutive successes required to RESET a tripped breaker. Default 2
# so one lucky success doesn't re-open the gate prematurely.
_RESET_AFTER = int(os.environ.get("LLM_BREAKER_RESET_AFTER", "2"))

# How long the breaker stays tripped WITHOUT observing any outcomes.
# Claude is often back within 2-3 min; cap at 10 min so that users who
# arrive long after the trip don't stay gated forever just because no
# one has sent a success through to reset the counter.
_MAX_TRIP_SECONDS = float(os.environ.get("LLM_BREAKER_MAX_TRIP_S", "600"))

# Public-facing message. Kept deliberately neutral — don't name the LLM
# provider ("Claude") to end users; frame as a transient platform issue.
PUBLIC_MESSAGE = (
    "Our AI provider is temporarily slow. Please try again in a few minutes."
)


# ---- Internal state -------------------------------------------------------
# Ring buffer of recent outcomes for observability (not used in trip logic,
# but surfaced via `status()` for admin dashboards / debug endpoints).
_recent: deque[dict] = deque(maxlen=20)

# Trip-logic state: two consecutive counters. `_consec_fail` counts
# timeouts in a row (resets on any success); `_consec_ok` counts
# successes in a row (resets on any timeout). Using consecutive counts
# instead of a ratio keeps the breaker responsive to sharp onset/offset
# of outages — which is how Claude's patchy days actually behave.
_consec_fail = 0
_consec_ok = 0

# Timestamp when breaker tripped; used to enforce `_MAX_TRIP_SECONDS`.
_tripped_at: float | None = None


def record_outcome(outcome: Literal["success", "timeout"]) -> None:
    """Call this from every analysis job completion path (anon + auth).

    `outcome` is deliberately 2-valued: we only care about timeouts —
    validation errors, ticker-not-found, rate-limit 429, user-canceled,
    etc. are NOT LLM-health signals and should NOT be recorded.
    """
    global _consec_fail, _consec_ok, _tripped_at
    _recent.append({"outcome": outcome, "ts": time.time()})
    if outcome == "success":
        _consec_ok += 1
        _consec_fail = 0
        if _tripped_at is not None and _consec_ok >= _RESET_AFTER:
            _log.info("LLM breaker RESET after %d consecutive successes", _consec_ok)
            _tripped_at = None
    elif outcome == "timeout":
        _consec_fail += 1
        _consec_ok = 0
        if _tripped_at is None and _consec_fail >= _TRIP_AFTER:
            _tripped_at = time.time()
            _log.warning(
                "LLM breaker TRIPPED after %d consecutive timeouts — "
                "new analysis requests will fast-fail for the next %.0fs",
                _consec_fail,
                _MAX_TRIP_SECONDS,
            )


def is_tripped() -> bool:
    """Non-blocking gate check for request handlers."""
    global _tripped_at
    if _tripped_at is None:
        return False
    # Auto-clear trip after the hard time window so users arriving long
    # after the original outage aren't gated forever on stale state.
    if time.time() - _tripped_at > _MAX_TRIP_SECONDS:
        _log.info("LLM breaker time-cleared after %.0fs of no reset signal", _MAX_TRIP_SECONDS)
        _tripped_at = None
        return False
    return True


def status() -> dict:
    """Snapshot for admin/debug endpoints."""
    return {
        "tripped": is_tripped(),
        "tripped_at": _tripped_at,
        "seconds_tripped": (time.time() - _tripped_at) if _tripped_at else 0,
        "consec_fail": _consec_fail,
        "consec_ok": _consec_ok,
        "recent": list(_recent)[-10:],
        "config": {
            "trip_after": _TRIP_AFTER,
            "reset_after": _RESET_AFTER,
            "max_trip_seconds": _MAX_TRIP_SECONDS,
        },
    }
