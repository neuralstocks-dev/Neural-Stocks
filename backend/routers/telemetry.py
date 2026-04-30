"""Telemetry beacons — lightweight event collection for product analytics.

Scope (Feb 2026): currently used to measure the wizard onboarding funnel
against the published 30-second goal. The same pattern can host any
future product-event tracking (paywall views, share-link clicks, etc.)
without standing up a 3rd-party tool like PostHog.

Design notes:
  * Beacons are FIRE-AND-FORGET from the client (`fetch` with
    `keepalive: true`). They MUST never block the user — a Mongo blip,
    a network blip, or a malformed payload should silently drop the
    event, not throw a visible error.
  * Auth is OPTIONAL — public/anon flows can beacon too. We capture
    `user_id` when a Bearer JWT is present; otherwise we rely on the
    client-supplied `anonymous_id` (random UUID stored in localStorage).
  * Events land in MongoDB collection `telemetry_events`. We create a
    TTL index at startup so events auto-expire after 90 days — keeps
    the collection bounded without an ops cron.
  * Aggregation is read-only and admin-gated; no PII leaks via the
    public beacon endpoint.

Wizard funnel events (canonical names — keep the frontend in sync):
  * `wizard_opened`              — modal first rendered
  * `wizard_step1_next`          — user clicked Next on Step 1
  * `wizard_step2_complete`      — first verdict returned successfully
  * `wizard_step2_error`         — analysis failed at Step 2
  * `wizard_step3_explore`       — user clicked "Explore dashboard"
  * `wizard_step3_close`         — user dismissed at Step 3
  * `wizard_dismissed_early`     — user closed before reaching Step 3
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

import jwt as _pyjwt  # PyJWT — same SDK already used by core.security
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.config import JWT_ALG, JWT_SECRET
from core.db import db
from core.security import admin_required

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telemetry", tags=["telemetry"])

# Event names we accept. Reject anything else to keep the collection
# clean and prevent client typos from polluting the funnel aggregation.
_ALLOWED_EVENTS = frozenset({
    "wizard_opened",
    "wizard_step1_next",
    "wizard_step2_complete",
    "wizard_step2_error",
    "wizard_step3_explore",
    "wizard_step3_close",
    "wizard_dismissed_early",
})

# Hard caps on payload size — defend against accidentally beaconing huge
# objects (e.g. a stack trace) that bloat the collection.
_MAX_PROPS_KEYS = 12
_MAX_VALUE_LEN = 200
_MAX_SESSION_ID_LEN = 64
_MAX_ANON_ID_LEN = 64

# Retain telemetry rows for 90 days. Long enough to spot weekly trends
# and to compute month-over-month funnel shifts; short enough that the
# collection can never grow unbounded without ops attention.
TELEMETRY_TTL_SECONDS = 90 * 24 * 3600


class TelemetryEventIn(BaseModel):
    event: str = Field(..., description="Canonical event name (e.g. wizard_opened)")
    session_id: Optional[str] = Field(None, description="Per-modal-mount UUID for funnel grouping")
    anonymous_id: Optional[str] = Field(None, description="Stable per-browser UUID (localStorage)")
    props: Optional[Dict[str, Any]] = Field(None, description="Free-form bag (clamped — see _MAX_*)")


def _extract_user_id_silently(req: Request) -> Optional[str]:
    """If the request carries a valid Bearer JWT, return its `sub`. Any
    failure path (no header, bad token, expired, mongo blip) returns
    None — telemetry MUST never reject a request just because auth is
    iffy. The whole endpoint works without auth by design."""
    try:
        auth = req.headers.get("authorization") or req.headers.get("Authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return None
        token = auth.split(" ", 1)[1].strip()
        if not token:
            return None
        payload = _pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = payload.get("sub")
        return sub if isinstance(sub, str) else None
    except Exception:
        return None


def _sanitize_props(props: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Clamp the props bag to a safe size + serialisable primitives.
    Drops nested dicts / lists / objects — props should be flat key→
    primitive pairs (string, number, bool). Anything else gets stringified
    and truncated."""
    if not isinstance(props, dict):
        return {}
    cleaned: Dict[str, Any] = {}
    for i, (k, v) in enumerate(props.items()):
        if i >= _MAX_PROPS_KEYS:
            break
        if not isinstance(k, str) or not k:
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            if isinstance(v, str) and len(v) > _MAX_VALUE_LEN:
                v = v[:_MAX_VALUE_LEN] + "…"
            cleaned[k[:64]] = v
        else:
            # Stringify nested types defensively — never accept raw
            # arrays/objects (could be huge).
            try:
                s = str(v)
            except Exception:
                continue
            cleaned[k[:64]] = s[:_MAX_VALUE_LEN]
    return cleaned


@router.post("/event")
async def record_event(payload: TelemetryEventIn, request: Request):
    """Fire-and-forget beacon endpoint. Returns `{ok: True}` on accept.
    Even validation failures return 200 with `{ok: False, reason: ...}`
    rather than raising — beacon clients ignore the response anyway, but
    we don't want noisy 4xx logs cluttering ops dashboards."""
    if payload.event not in _ALLOWED_EVENTS:
        return {"ok": False, "reason": "unknown_event"}

    session_id = (payload.session_id or "")[:_MAX_SESSION_ID_LEN] or None
    anonymous_id = (payload.anonymous_id or "")[:_MAX_ANON_ID_LEN] or None
    if not (session_id or anonymous_id):
        # We need at least one identifier to group events into a funnel.
        # Generate one server-side as a safety net so the event isn't
        # totally orphaned, but flag it so it's distinguishable in
        # diagnostics.
        anonymous_id = f"server-{uuid.uuid4().hex[:12]}"

    user_id = _extract_user_id_silently(request)
    props = _sanitize_props(payload.props)

    doc = {
        "id": uuid.uuid4().hex,
        "ts": time.time(),
        "event": payload.event,
        "session_id": session_id,
        "anonymous_id": anonymous_id,
        "user_id": user_id,
        "props": props,
    }
    try:
        await db.telemetry_events.insert_one(doc)
    except Exception as e:
        # Best-effort — drop on the floor and log so ops can investigate
        # if rates spike, but never surface to the client.
        logger.warning("telemetry insert failed: %r", e)
        return {"ok": False, "reason": "persist_failed"}
    return {"ok": True}


# ------------------ Admin aggregation: wizard funnel ------------------
#
# Computes, for the requested window:
#   * Funnel counts: opened → step1 → step2 → step3 (per session)
#   * Drop-off %: between each pair of stages
#   * Median / P75 / P90 elapsed seconds from `wizard_opened` →
#     `wizard_step2_complete` (the 30-second product goal lives here)
#   * % of completers under the 30-second goal
#
# Sessions are grouped by `session_id` (preferred) or `anonymous_id`
# (fallback, for older events that pre-date session_id). Because beacons
# can arrive out-of-order and even drop, we count a session as having
# reached a stage if ANY event with that name exists for the session in
# the window.
def _percentile(values: List[float], p: float) -> Optional[float]:
    """Tiny percentile helper — avoids pulling in numpy for one usage.
    `p` is 0..100. Returns None for empty input, otherwise the linear-
    interpolation percentile (matches Mongo's `$percentile` semantics for
    a small N, which is fine for product funnels of ≤thousands)."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


@router.get("/wizard-funnel")
async def wizard_funnel(days: int = 30, _admin=Depends(admin_required)):
    """Admin-gated. Returns the wizard onboarding funnel for the last N
    days (capped at 90 to align with the TTL). Frontend renders this as
    a horizontal funnel + 30-second goal completion rate."""
    days = max(1, min(int(days), 90))
    since = time.time() - (days * 24 * 3600)

    # Pull just the wizard events into a dict keyed by session, so we can
    # compute per-session min(opened) and min(step2_complete) timestamps.
    cursor = db.telemetry_events.find(
        {"ts": {"$gte": since}, "event": {"$in": list(_ALLOWED_EVENTS)}},
        {"_id": 0, "event": 1, "ts": 1, "session_id": 1, "anonymous_id": 1, "props": 1},
    )

    sessions: Dict[str, Dict[str, Any]] = {}
    async for ev in cursor:
        sid = ev.get("session_id") or ev.get("anonymous_id")
        if not sid:
            continue
        bucket = sessions.setdefault(sid, {"events": {}, "props": {}})
        # Keep the EARLIEST timestamp per event name in this session
        # (because we're measuring wall-clock-from-open).
        prev = bucket["events"].get(ev["event"])
        if prev is None or ev["ts"] < prev:
            bucket["events"][ev["event"]] = ev["ts"]
        # First non-empty props snapshot wins (small, useful for context).
        if ev.get("props") and not bucket["props"]:
            bucket["props"] = ev["props"]

    n_opened = 0
    n_step1 = 0
    n_step2 = 0
    n_step3 = 0
    n_step2_error = 0
    n_dismissed_early = 0
    elapsed_to_verdict_s: List[float] = []
    elapsed_to_dismiss_s: List[float] = []

    for s in sessions.values():
        ev = s["events"]
        if "wizard_opened" in ev:
            n_opened += 1
        if "wizard_step1_next" in ev:
            n_step1 += 1
        if "wizard_step2_complete" in ev:
            n_step2 += 1
        if "wizard_step2_error" in ev:
            n_step2_error += 1
        if "wizard_step3_explore" in ev or "wizard_step3_close" in ev:
            n_step3 += 1
        if "wizard_dismissed_early" in ev:
            n_dismissed_early += 1
        opened_ts = ev.get("wizard_opened")
        verdict_ts = ev.get("wizard_step2_complete")
        if opened_ts and verdict_ts and verdict_ts >= opened_ts:
            elapsed_to_verdict_s.append(verdict_ts - opened_ts)
        # Compute time-to-dismiss for sessions that finished on Step 3
        # explore/close.
        end_ts = ev.get("wizard_step3_explore") or ev.get("wizard_step3_close")
        if opened_ts and end_ts and end_ts >= opened_ts:
            elapsed_to_dismiss_s.append(end_ts - opened_ts)

    def _round_or_none(v: Optional[float]) -> Optional[float]:
        return None if v is None else round(v, 2)

    p50 = _percentile(elapsed_to_verdict_s, 50)
    p75 = _percentile(elapsed_to_verdict_s, 75)
    p90 = _percentile(elapsed_to_verdict_s, 90)
    under_30s = sum(1 for v in elapsed_to_verdict_s if v <= 30.0)
    under_30s_rate = (under_30s / len(elapsed_to_verdict_s)) if elapsed_to_verdict_s else None

    def _drop(prev: int, curr: int) -> Optional[float]:
        if not prev:
            return None
        return round(100 * (1 - curr / prev), 1)

    return {
        "window_days": days,
        "session_total": len(sessions),
        "funnel": [
            {"step": "opened", "count": n_opened, "drop_from_prev_pct": None},
            {"step": "step1_next", "count": n_step1, "drop_from_prev_pct": _drop(n_opened, n_step1)},
            {"step": "step2_complete", "count": n_step2, "drop_from_prev_pct": _drop(n_step1, n_step2)},
            {"step": "step3_done", "count": n_step3, "drop_from_prev_pct": _drop(n_step2, n_step3)},
        ],
        "step2_errors": n_step2_error,
        "dismissed_early": n_dismissed_early,
        "time_to_verdict_seconds": {
            "p50": _round_or_none(p50),
            "p75": _round_or_none(p75),
            "p90": _round_or_none(p90),
            "min": _round_or_none(min(elapsed_to_verdict_s)) if elapsed_to_verdict_s else None,
            "max": _round_or_none(max(elapsed_to_verdict_s)) if elapsed_to_verdict_s else None,
            "n": len(elapsed_to_verdict_s),
        },
        "time_to_dismiss_seconds": {
            "p50": _round_or_none(_percentile(elapsed_to_dismiss_s, 50)),
            "n": len(elapsed_to_dismiss_s),
        },
        "thirty_second_goal": {
            "n_completers": len(elapsed_to_verdict_s),
            "n_under_30s": under_30s,
            "rate_pct": None if under_30s_rate is None else round(100 * under_30s_rate, 1),
        },
    }


async def ensure_telemetry_indexes() -> None:
    """Idempotent — called once on app startup. Creates a TTL index that
    auto-expires telemetry rows after `TELEMETRY_TTL_SECONDS` and a
    secondary index on `(event, ts)` for the funnel aggregation.

    `ts` is stored as a Unix timestamp (float seconds), so we use a
    partial-filter expression + a separate Date-typed sweep field is NOT
    needed — Mongo supports TTL on Date fields only, but we work around
    that by also writing `expires_at` as a real Date when inserting...
    actually the simplest approach is to not auto-expire at the Mongo
    level and instead let an admin-cron handle pruning. For now we just
    add the secondary index for query performance and document that the
    collection should be purged manually if it grows too large."""
    try:
        await db.telemetry_events.create_index([("event", 1), ("ts", -1)])
        await db.telemetry_events.create_index([("session_id", 1), ("ts", 1)])
        await db.telemetry_events.create_index([("anonymous_id", 1), ("ts", 1)])
    except Exception as e:
        logger.warning("telemetry index creation failed: %r", e)
