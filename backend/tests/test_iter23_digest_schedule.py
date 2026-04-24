"""Iter 23 — Per-channel Telegram delivery scheduling.

Validates:
  * GET /api/telegram/preferences → alert_schedule + all_alert_schedules
  * POST /api/telegram/preferences partial-merge on alert_schedule
  * POST validation errors for alert_schedule
  * services.digest_pusher.queue_alert writes correct row shape
  * services.digest_pusher.flush_user sends a digest, flushes rows, idempotent
  * Live path: analysis with schedule=digest_daily queues (does NOT push realtime)
"""
import asyncio
import os
import sys

import pytest
import requests

# Ensure backend package importable
sys.path.insert(0, "/app/backend")

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # Fallback: read from frontend/.env (test env only — not production code)
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
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
    """Shared module-scoped event loop so Motor's collection bindings stay valid."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# Reset prefs to all-realtime before and after module
@pytest.fixture(scope="module", autouse=True)
def reset_schedule(admin_session, event_loop):
    def _reset():
        admin_session.post(
            f"{BASE_URL}/api/telegram/preferences",
            json={"alert_schedule": {k: "realtime" for k in ["signal", "pattern", "rf_watchlist_scan"]}},
        )
    _reset()
    yield
    _reset()
    # Cleanup any leftover test queue rows
    from core.db import db
    event_loop.run_until_complete(db.alert_queue.delete_many({"title": {"$regex": "^TEST_"}}))


# ─── GET preferences returns new fields ─────────────────────────────────
def test_get_preferences_has_schedule_fields(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/telegram/preferences")
    assert r.status_code == 200
    body = r.json()
    assert "alert_schedule" in body
    assert "all_alert_schedules" in body
    assert body["all_alert_schedules"] == ["realtime", "digest_daily", "digest_weekly"]
    sched = body["alert_schedule"]
    assert set(sched.keys()) == {"signal", "pattern", "rf_watchlist_scan"}
    # Defaults after module-reset: all realtime
    for v in sched.values():
        assert v == "realtime"


# ─── POST partial merge semantics ───────────────────────────────────────
def test_post_partial_merge_schedule(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "digest_weekly"}},
    )
    assert r.status_code == 200, r.text
    # GET reflects: signal=weekly, others unchanged (realtime)
    g = admin_session.get(f"{BASE_URL}/api/telegram/preferences").json()
    assert g["alert_schedule"]["signal"] == "digest_weekly"
    assert g["alert_schedule"]["pattern"] == "realtime"
    assert g["alert_schedule"]["rf_watchlist_scan"] == "realtime"
    # Second partial only touches pattern
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"pattern": "digest_daily"}},
    )
    g2 = admin_session.get(f"{BASE_URL}/api/telegram/preferences").json()
    assert g2["alert_schedule"]["signal"] == "digest_weekly"  # preserved
    assert g2["alert_schedule"]["pattern"] == "digest_daily"
    assert g2["alert_schedule"]["rf_watchlist_scan"] == "realtime"


# ─── POST validation errors ─────────────────────────────────────────────
def test_post_rejects_non_dict_schedule(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": "not-a-dict"},
    )
    assert r.status_code == 400


def test_post_rejects_bogus_value(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "bogus"}},
    )
    assert r.status_code == 400


def test_post_rejects_unknown_channel(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"unknown_channel": "realtime"}},
    )
    assert r.status_code == 400


# ─── digest_pusher.queue_alert row shape ────────────────────────────────
def test_queue_alert_inserts_row(admin_user_id, event_loop):
    from core.db import db
    from services.digest_pusher import queue_alert

    async def _run():
        await queue_alert(
            admin_user_id, "signal",
            ticker="TEST", title="TEST_queued_row", body="TEST body",
        )
        row = await db.alert_queue.find_one(
            {"user_id": admin_user_id, "title": "TEST_queued_row"},
            {"_id": 0},
        )
        return row

    row = event_loop.run_until_complete(_run())
    assert row is not None
    assert row["channel"] == "signal"
    assert row["ticker"] == "TEST"
    assert row["title"] == "TEST_queued_row"
    assert row["body"] == "TEST body"
    assert row["flushed_at"] is None
    assert row["user_id"] == admin_user_id
    assert "id" in row
    assert "created_at" in row


# ─── flush_user sends digest, marks flushed, idempotent ─────────────────
def test_flush_user_sends_digest_and_is_idempotent(admin_session, admin_user_id, event_loop, monkeypatch):
    from core.db import db
    from services import digest_pusher

    # Set signal channel to digest_daily so flush_user matches
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "digest_daily"}},
    )

    sent_calls = []

    async def fake_send(user_id, title, body, **kwargs):
        sent_calls.append({"user_id": user_id, "title": title, "body": body})
        return True

    monkeypatch.setattr(digest_pusher, "send_alert_to_user", fake_send)

    async def _run():
        # Seed one queued alert
        await digest_pusher.queue_alert(
            admin_user_id, "signal",
            ticker="TEST", title="TEST_flush_alert", body="TEST flush body",
        )
        n1 = await digest_pusher.flush_user(admin_user_id, "digest_daily")
        n2 = await digest_pusher.flush_user(admin_user_id, "digest_daily")
        # Cleanup
        await db.alert_queue.delete_many({"user_id": admin_user_id, "title": "TEST_flush_alert"})
        return n1, n2

    n1, n2 = event_loop.run_until_complete(_run())
    assert n1 >= 1, f"expected ≥1 flushed, got {n1}"
    assert n2 == 0, f"idempotency broken — got {n2}"
    assert len(sent_calls) == 1
    assert sent_calls[0]["title"] == "Neulab digest"
    assert "TEST_flush_alert" in sent_calls[0]["body"]

    # Reset signal back to realtime
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "realtime"}},
    )


# ─── Analysis path: signal=digest_daily → queued, not pushed ────────────
@pytest.mark.timeout(180)
def test_analysis_schedule_respected(admin_session, admin_user_id, event_loop):
    from core.db import db

    # Set signal → digest_daily
    r = admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "digest_daily"}},
    )
    assert r.status_code == 200

    # Kick off analysis — AAPL usually produces confident verdict
    r = admin_session.post(f"{BASE_URL}/api/analysis/AAPL/start")
    if r.status_code == 402:
        pytest.skip("admin over analysis quota")
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]

    # Poll up to 120s
    import time
    job = None
    for _ in range(40):
        time.sleep(3)
        j = admin_session.get(f"{BASE_URL}/api/analysis/jobs/{job_id}").json()
        if j.get("status") != "running":
            job = j
            break
    assert job is not None, "analysis never finished"
    assert job.get("status") == "done", f"job failed: {job.get('error')}"
    result = job.get("result") or {}
    rec = result.get("recommendation")
    conf = result.get("confidence_score", 0)
    if rec not in ("BUY", "SELL") or conf < 75:
        # If verdict wasn't actionable, the alert won't have been created at
        # all — this is a "skip" rather than a failure of the schedule path.
        pytest.skip(f"AAPL verdict not actionable ({rec}/{conf}%) — cannot verify queue path")

    async def _check():
        # Give backend a moment to persist the queue row
        await asyncio.sleep(1)
        # db.alerts row present
        alert = await db.alerts.find_one(
            {"user_id": admin_user_id, "ticker": "AAPL", "type": "signal"},
            sort=[("created_at", -1)],
        )
        # db.alert_queue row present, unflushed
        qrow = await db.alert_queue.find_one(
            {"user_id": admin_user_id, "channel": "signal", "ticker": "AAPL", "flushed_at": None},
            sort=[("created_at", -1)],
        )
        return alert, qrow

    alert, qrow = event_loop.run_until_complete(_check())
    assert alert is not None, "in-app alert row missing"
    assert qrow is not None, "queue row missing (schedule not respected)"
    assert qrow["flushed_at"] is None

    # Cleanup queue row
    async def _cleanup():
        await db.alert_queue.delete_one({"id": qrow["id"]})
    event_loop.run_until_complete(_cleanup())

    # Reset schedule
    admin_session.post(
        f"{BASE_URL}/api/telegram/preferences",
        json={"alert_schedule": {"signal": "realtime"}},
    )
