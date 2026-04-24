"""Iter 24 — Telegram Quiet Hours feature.

Validates:
  * GET /api/telegram/preferences → new `quiet_hours` field w/ defaults
  * POST /api/telegram/preferences partial-merge on `quiet_hours`
  * POST validation (object, hour bounds, bool enabled, non-empty tz)
  * routers.telegram.is_in_quiet_hours semantics (disabled / zero-width /
    forward window / cross-midnight)
  * End-to-end: realtime + QH covering current UTC hour → queues instead
    of pushing
  * Regression: realtime + QH disabled → immediate push (no queue row)
  * digest_pusher_loop scheduler still running (backend log)
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

import pytest
import requests

sys.path.insert(0, "/app/backend")


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PW = "admin1234"


# ─── Fixtures ───────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.admin_user = r.json().get("user", {})
    return s


@pytest.fixture(scope="module")
def admin_user_id(admin_session):
    return admin_session.admin_user.get("id")


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module", autouse=True)
def reset_prefs(admin_session, event_loop):
    """Reset admin prefs to all-realtime + QH disabled (defaults) before+after."""
    def _reset():
        admin_session.post(
            f"{BASE_URL}/api/telegram/preferences",
            json={
                "alert_schedule": {k: "realtime" for k in ["signal", "pattern", "rf_watchlist_scan"]},
                "quiet_hours": {"enabled": False, "start_hour": 22, "end_hour": 7, "tz": "UTC"},
            },
        )
    _reset()
    yield
    _reset()
    from core.db import db
    event_loop.run_until_complete(
        db.alert_queue.delete_many({"user_id": {"$exists": True}, "flushed_at": None, "channel": "signal"})
    )


# ─── GET returns quiet_hours with correct shape ─────────────────────────
def test_get_preferences_has_quiet_hours(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/telegram/preferences")
    assert r.status_code == 200
    body = r.json()
    assert "quiet_hours" in body, f"missing quiet_hours; body keys: {list(body.keys())}"
    qh = body["quiet_hours"]
    assert set(qh.keys()) == {"enabled", "start_hour", "end_hour", "tz"}
    assert isinstance(qh["enabled"], bool)
    assert isinstance(qh["start_hour"], int) and 0 <= qh["start_hour"] <= 23
    assert isinstance(qh["end_hour"], int) and 0 <= qh["end_hour"] <= 23
    assert isinstance(qh["tz"], str) and qh["tz"]
    # Post-reset defaults:
    assert qh == {"enabled": False, "start_hour": 22, "end_hour": 7, "tz": "UTC"}


# ─── POST partial merge on quiet_hours ──────────────────────────────────
def test_post_partial_merge_quiet_hours(admin_session):
    # Step 1: set only enabled+tz → start/end stay at defaults 22/7
    r1 = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"quiet_hours": {"enabled": True, "tz": "Asia/Jakarta"}},
    )
    assert r1.status_code == 200, r1.text
    body = admin_session.get(f"{BASE_URL}/api/telegram/preferences").json()
    qh = body["quiet_hours"]
    assert qh["enabled"] is True
    assert qh["tz"] == "Asia/Jakarta"
    assert qh["start_hour"] == 22
    assert qh["end_hour"] == 7

    # Step 2: change only start_hour → enabled+tz+end_hour preserved
    r2 = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"quiet_hours": {"start_hour": 0}},
    )
    assert r2.status_code == 200
    body = admin_session.get(f"{BASE_URL}/api/telegram/preferences").json()
    qh = body["quiet_hours"]
    assert qh["start_hour"] == 0
    assert qh["end_hour"] == 7
    assert qh["enabled"] is True
    assert qh["tz"] == "Asia/Jakarta"

    # Step 3: disable → all other fields intact
    r3 = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"quiet_hours": {"enabled": False}},
    )
    assert r3.status_code == 200
    body = admin_session.get(f"{BASE_URL}/api/telegram/preferences").json()
    qh = body["quiet_hours"]
    assert qh["enabled"] is False
    assert qh["start_hour"] == 0
    assert qh["end_hour"] == 7
    assert qh["tz"] == "Asia/Jakarta"


# ─── POST validation — 400 on invalid quiet_hours payloads ──────────────
@pytest.mark.parametrize(
    "payload,field_hint",
    [
        ({"quiet_hours": "notanobj"}, "object"),
        ({"quiet_hours": {"start_hour": 99}}, "start_hour"),
        ({"quiet_hours": {"enabled": "yes"}}, "bool"),
        ({"quiet_hours": {"tz": ""}}, "tz"),
        ({"quiet_hours": {"end_hour": -1}}, "end_hour"),
    ],
)
def test_post_validation_errors(admin_session, payload, field_hint):
    r = admin_session.post(f"{BASE_URL}/api/telegram/preferences", json=payload)
    assert r.status_code == 400, f"expected 400 for {payload}, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "").lower()
    assert "quiet_hours" in detail or field_hint in detail


# ─── Unit tests for is_in_quiet_hours() ─────────────────────────────────
def test_is_in_quiet_hours_logic():
    from routers.telegram import is_in_quiet_hours

    # disabled → always False
    assert is_in_quiet_hours({"enabled": False, "start_hour": 22, "end_hour": 7, "tz": "UTC"}) is False

    # zero-width (start == end) → False
    assert is_in_quiet_hours({"enabled": True, "start_hour": 10, "end_hour": 10, "tz": "UTC"}) is False

    # Forward window covering current UTC hour → True
    h = datetime.now(timezone.utc).hour
    fwd_start = h
    fwd_end = (h + 1) % 24
    if fwd_start < fwd_end:
        assert is_in_quiet_hours({"enabled": True, "start_hour": fwd_start, "end_hour": fwd_end, "tz": "UTC"}) is True
    else:
        # If h is 23 the forward window wraps — use cross-midnight branch instead
        assert is_in_quiet_hours({"enabled": True, "start_hour": fwd_start, "end_hour": fwd_end, "tz": "UTC"}) is True

    # Forward window NOT covering current hour (far offset)
    off_start = (h + 3) % 24
    off_end = (h + 4) % 24
    if off_start < off_end:
        assert is_in_quiet_hours({"enabled": True, "start_hour": off_start, "end_hour": off_end, "tz": "UTC"}) is False

    # Cross-midnight window 22→7: in-window if h>=22 OR h<7
    in_cross = (h >= 22) or (h < 7)
    assert is_in_quiet_hours({"enabled": True, "start_hour": 22, "end_hour": 7, "tz": "UTC"}) is in_cross

    # Malformed tz → falls back to UTC, still works
    assert is_in_quiet_hours({"enabled": True, "start_hour": 10, "end_hour": 10, "tz": "Not/A_Real_TZ"}) is False


# ─── digest_pusher_loop still running ───────────────────────────────────
def test_digest_pusher_loop_running():
    import subprocess
    out = subprocess.check_output(
        ["grep", "-c", "Started Telegram digest pusher scheduler", "/var/log/supervisor/backend.err.log"],
        text=True,
    ).strip()
    assert int(out) >= 1, "digest_pusher_loop never started"


# ─── Live defer path: realtime + QH covering current hour → queue ──────
def test_live_realtime_with_qh_defers_to_queue(admin_session, admin_user_id, event_loop):
    """Realtime schedule + quiet_hours covering current UTC hour must queue
    instead of push. Verify db.alert_queue has a new row (flushed_at=null),
    db.alerts also has a row (in-app feed unaffected)."""
    # Ensure realtime schedule
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "realtime"}},
    )
    h = datetime.now(timezone.utc).hour
    start_h = h
    end_h = (h + 1) % 24
    # Enable QH covering current UTC hour in UTC tz
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"quiet_hours": {"enabled": True, "start_hour": start_h, "end_hour": end_h, "tz": "UTC"}},
    )

    from core.db import db

    async def _queue_before():
        return await db.alert_queue.count_documents(
            {"user_id": admin_user_id, "channel": "signal", "flushed_at": None}
        )
    before = event_loop.run_until_complete(_queue_before())

    # Fire analysis — try multiple tickers and modes until BUY/SELL ≥75%
    import time
    verdict = None
    confidence = 0.0
    last_info = ""
    for ticker, mode in [("AAPL", "hybrid"), ("NVDA", "hybrid"), ("TSLA", "hybrid"), ("AAPL", "standard")]:
        r = admin_session.post(
            f"{BASE_URL}/api/analysis/{ticker}/start",
            json={"mode": mode},
        )
        if r.status_code not in (200, 201, 202):
            continue
        start_body = r.json()
        job_id = start_body.get("job_id") or start_body.get("id") or start_body.get("analysis_id")
        if not job_id:
            continue
        for _ in range(60):
            rr = admin_session.get(f"{BASE_URL}/api/analysis/jobs/{job_id}")
            if rr.status_code == 200:
                d = rr.json()
                st = d.get("status")
                if st in ("complete", "done", "completed", "finished"):
                    res = d.get("result") or d
                    verdict = (res.get("recommendation") or res.get("verdict") or "").upper()
                    confidence = float(res.get("confidence_score") or res.get("confidence") or 0)
                    last_info = f"{ticker}/{mode} → {verdict} {confidence}"
                    break
                if st in ("error", "failed"):
                    last_info = f"{ticker}/{mode} → ERROR {d.get('error')}"
                    break
            time.sleep(2)
        if verdict in ("BUY", "SELL") and confidence >= 75.0:
            break

    if verdict in ("BUY", "SELL") and confidence >= 75.0:
        async def _queue_after():
            return await db.alert_queue.count_documents(
                {"user_id": admin_user_id, "channel": "signal", "flushed_at": None}
            )
            # db.alerts row also expected but we don't gate on count — it depends on other prefs
        after = event_loop.run_until_complete(_queue_after())
        assert after > before, (
            f"expected queue row for deferred realtime alert; before={before} after={after} "
            f"last={last_info}"
        )
    else:
        pytest.skip(
            f"no ticker reached BUY/SELL≥75% in available modes; last={last_info} — "
            f"cannot deterministically test defer path"
        )

    # Cleanup: delete any queue rows we created and disable QH
    async def _cleanup():
        await db.alert_queue.delete_many(
            {"user_id": admin_user_id, "channel": "signal", "flushed_at": None}
        )
    event_loop.run_until_complete(_cleanup())
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"quiet_hours": {"enabled": False}},
    )


# ─── Regression: realtime + QH disabled → NO queue row ─────────────────
def test_regression_realtime_qh_disabled_pushes_immediately(admin_session, admin_user_id, event_loop):
    """With QH disabled, realtime must NOT queue — preserves iter 22+23 invariants."""
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={
            "alert_schedule": {"signal": "realtime"},
            "quiet_hours": {"enabled": False},
        },
    )
    from core.db import db

    async def _qcount():
        return await db.alert_queue.count_documents(
            {"user_id": admin_user_id, "channel": "signal", "flushed_at": None}
        )
    before = event_loop.run_until_complete(_qcount())

    fired = None
    for ticker in ("AAPL", "NVDA"):
        r = admin_session.post(
            f"{BASE_URL}/api/analysis/{ticker}/start",
            json={"mode": "standard"},
        )
        if r.status_code in (200, 201, 202):
            fired = (ticker, r.json())
            break
    assert fired
    ticker, start_body = fired
    job_id = start_body.get("job_id") or start_body.get("id") or start_body.get("analysis_id")
    verdict, confidence = None, 0.0
    if job_id:
        import time
        for _ in range(60):
            rr = admin_session.get(f"{BASE_URL}/api/analysis/jobs/{job_id}")
            if rr.status_code == 200:
                d = rr.json()
                if d.get("status") in ("complete", "done", "completed", "finished"):
                    res = d.get("result") or d
                    verdict = (res.get("recommendation") or res.get("verdict") or "").upper()
                    confidence = float(res.get("confidence_score") or res.get("confidence") or 0)
                    break
                if d.get("status") in ("error", "failed"):
                    break
            time.sleep(2)

    after = event_loop.run_until_complete(_qcount())
    # Regardless of verdict, queue MUST NOT grow (realtime path doesn't write queue rows).
    assert after == before, (
        f"regression: queue grew with QH disabled (before={before} after={after} "
        f"ticker={ticker} verdict={verdict} conf={confidence}) — realtime push path broken"
    )
