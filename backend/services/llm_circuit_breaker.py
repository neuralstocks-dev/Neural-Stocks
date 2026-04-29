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

Failure-reason telemetry: each non-success outcome carries a structured
`reason` code ("llm_timeout" / "litellm_retry_exhausted" /
"llm_socket_hang" / "other_exception") persisted to a TTL-capped
MongoDB collection (7 days). The admin dashboard can query this to
distinguish one-off Claude hiccups from systemic LiteLLM config issues.
Persistence is best-effort: a mongo write error NEVER affects the
breaker's in-memory decision logic — Claude health must stay available
even when the ops database is degraded.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import deque
from typing import Literal, Optional

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


# TTL in seconds for the failure-telemetry collection. Default 7 days —
# long enough to spot weekly patterns, short enough to not balloon
# storage when incidents cluster.
_LLM_EVENT_TTL_S = int(os.environ.get("LLM_EVENT_TTL_S", str(7 * 24 * 60 * 60)))

# Closure-captured TTL-index guard so we only issue `create_index` once
# per process. MongoDB's TTL monitor scans every 60s — the index itself
# only needs to exist; re-creating it is a cheap no-op but we skip to
# keep startup logs clean.
_ttl_index_ensured = False

# Error reason codes. Kept explicit (not freeform strings) so the admin
# dashboard can render stable colored breakdowns. New codes require a
# PR review — this is a small reference table users grep for.
REASON_LLM_TIMEOUT = "llm_timeout"
REASON_LLM_SOCKET_HANG = "llm_socket_hang"
REASON_LITELLM_RETRY_EXHAUSTED = "litellm_retry_exhausted"
REASON_OTHER_EXCEPTION = "other_exception"
REASON_CACHE_MISS_FALLBACK = "cache_miss_fallback"  # reserved for future use


def classify_timeout_reason(elapsed_s: float, timeout_budget_s: float) -> str:
    """Heuristic: if the job timed out well before the hard wall-clock
    budget, it's more likely a LiteLLM retry-exhaustion than a pure
    socket hang. LiteLLM's default retry schedule is 4 × ~30s so jobs
    that die right at the budget tend to be deep socket hangs, while
    jobs that die much earlier (the wrapper cancels the future) point
    to upstream retry rejection. Rough heuristic, not definitive."""
    if elapsed_s >= timeout_budget_s * 0.95:
        return REASON_LLM_SOCKET_HANG
    if elapsed_s >= timeout_budget_s * 0.5:
        return REASON_LITELLM_RETRY_EXHAUSTED
    return REASON_LLM_TIMEOUT


async def _persist_event(event: dict) -> None:
    """Best-effort insert into `llm_events`. Imports db lazily to keep
    this module importable in isolation (unit tests don't need mongo).
    Swallows ALL exceptions so a mongo issue never cascades into the
    breaker's decision path."""
    global _ttl_index_ensured
    try:
        from core.db import db  # local import — avoid import cycles
        if not _ttl_index_ensured:
            # expireAfterSeconds on `ts` — MongoDB will auto-delete
            # documents older than _LLM_EVENT_TTL_S. Idempotent.
            try:
                await db.llm_events.create_index("ts", expireAfterSeconds=_LLM_EVENT_TTL_S)
            except Exception:  # noqa: BLE001
                pass
            _ttl_index_ensured = True
        await db.llm_events.insert_one(event)
    except Exception as e:  # noqa: BLE001
        _log.debug("llm_events persist skipped: %s", e)


def _format_error_detail(exc: BaseException, *, with_traceback: bool = True) -> str:
    """Compose a diagnostic string for `record_outcome(error_detail=...)`.

    The goal is to capture enough upstream signal to prove (when escalating
    socket-hang complaints to support@emergent.sh) that the failure is
    upstream of the application — typically: the HTTP status code from
    Anthropic / liteLLM, the exception class, the first line of the error
    message, and the first few traceback frames showing the call stops at
    a network-IO boundary. We deliberately cap at 1500 chars at insert
    time so giant pydantic validators don't bloat the collection.
    """
    parts = [f"{type(exc).__module__}.{type(exc).__name__}: {exc}"]
    if with_traceback:
        import traceback as _tb
        # Last 6 frames are where the actual failure happened — earlier
        # frames are mostly the FastAPI / asyncio task plumbing.
        tb_lines = _tb.format_tb(exc.__traceback__)[-6:]
        if tb_lines:
            parts.append("--- traceback (tail) ---")
            parts.extend(line.strip("\n") for line in tb_lines)
    return "\n".join(parts)


def record_outcome(
    outcome: Literal["success", "timeout"],
    *,
    ticker: Optional[str] = None,
    reason: Optional[str] = None,
    elapsed_s: Optional[float] = None,
    surface: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> None:
    """Call this from every analysis job completion path (anon + auth).

    `outcome` is deliberately 2-valued: we only care about timeouts —
    validation errors, ticker-not-found, rate-limit 429, user-canceled,
    etc. are NOT LLM-health signals and should NOT be recorded.

    Extra kwargs are telemetry-only — they don't affect trip logic, they
    get persisted to the capped `llm_events` collection for the admin
    dashboard's "why did this outage happen" breakdown.

    `surface`: "anon" | "auth" | "quick" (the caller type).
    `reason`: structured error code (see REASON_* constants above).
              On "success" outcomes this is ignored.
    `elapsed_s`: wall-clock seconds the job actually ran. Useful for
              distinguishing fast-cancel-on-retry-exhaust vs full-budget
              socket hang in the admin UI.
    `error_detail`: free-form diagnostic string from the actual exception
              (truncated to 1500 chars). Surfaces upstream HTTP codes,
              litellm error tags, and the first few traceback frames so
              the admin can prove socket hangs are upstream — not the
              app's code — when escalating credit-recoup requests to
              support@emergent.sh. Persisted only on timeout outcomes.
    """
    global _consec_fail, _consec_ok, _tripped_at
    ts = time.time()
    _recent.append({"outcome": outcome, "ts": ts, "reason": reason, "surface": surface})
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
        # Persist failure events only. Successes are implicit (the lack
        # of a failure over some window = healthy); storing them would
        # bloat the collection. Schedule as a fire-and-forget task so
        # the caller isn't blocked on the mongo round-trip.
        event = {
            "ts": ts,
            "outcome": outcome,
            "reason": reason or REASON_OTHER_EXCEPTION,
            "ticker": ticker,
            "elapsed_s": elapsed_s,
            "surface": surface,
            "consec_fail_at_event": _consec_fail,
            "tripped_breaker": _tripped_at is not None,
            # Truncate to 1500 chars so the document stays small even on
            # giant tracebacks — it's still plenty to identify the
            # upstream HTTP code, litellm error class, and the first few
            # frames where the failure originated. None when caller
            # didn't have an exception object handy (e.g. asyncio.TimeoutError
            # which has no message of its own).
            "error_detail": (error_detail or "")[:1500] or None,
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_persist_event(event))
        except RuntimeError:
            # Called from a non-async context (e.g. a unit test). Skip
            # persistence silently — the in-memory trip logic is what
            # actually guards the request path.
            pass


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
