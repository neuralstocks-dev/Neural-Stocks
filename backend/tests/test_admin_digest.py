"""Regression tests for `services/admin_digest.py`.

Locks the gating contract: ONLY users in `ADMIN_EMAILS` who have a
linked Telegram chat receive the nightly ops digest. Any user with
Telegram linked but NOT in the admin allowlist must be excluded.

Also exercises:
  * cooldown (re-running within 22h sends 0 messages)
  * `force=True` bypasses the cooldown (manual-trigger endpoint path)
  * formatter omits lines for missing metrics so the message stays terse
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch, AsyncMock

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _seed_users(local_db, admin_email: str, non_admin_email: str):
    """Wipe + re-seed the two test users we need."""
    return [
        # Admin with Telegram linked → SHOULD receive
        {"id": "u-admin", "email": admin_email,
         "telegram_chat_id": "777"},
        # Non-admin with Telegram linked → MUST NOT receive
        {"id": "u-other", "email": non_admin_email,
         "telegram_chat_id": "888"},
        # Admin WITHOUT Telegram → silently skipped (no chat to push to)
        {"id": "u-admin-noTg", "email": admin_email + ".alt",
         # no telegram_chat_id
         },
    ]


def test_admin_digest_only_sends_to_admin_emails_with_linked_telegram():
    """The CRITICAL gating contract — non-admin users with Telegram
    linked must NEVER receive the ops digest."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import os
    import core.config as _core_config

    async def _run():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        local_db = cli[os.environ["DB_NAME"]]
        admin_email = "jolor69+test@gmail.com"
        non_admin_email = "evil-user+test@gmail.com"

        # Wipe + seed test users.
        await local_db.users.delete_many({"email": {"$in": [
            admin_email, non_admin_email, admin_email + ".alt"]}})
        await local_db.users.insert_many(_seed_users(local_db, admin_email, non_admin_email))

        # Patch ADMIN_EMAILS to ONLY contain our test admin.
        original_admins = _core_config.ADMIN_EMAILS
        _core_config.ADMIN_EMAILS = {admin_email.lower()}
        # The admin_digest module captured `db` at import time via
        # `from core.db import db`, so monkey-patching `core.db.db`
        # doesn't affect it. Patch the module-level reference directly.
        from services import admin_digest
        original_module_db = admin_digest.db
        admin_digest.db = local_db
        # Same for the ADMIN_EMAILS reference (imported same way).
        original_module_admins = admin_digest.ADMIN_EMAILS
        admin_digest.ADMIN_EMAILS = {admin_email.lower()}

        sent_to: list[str] = []

        async def fake_send_message(chat_id, _text):
            sent_to.append(str(chat_id))
            return True

        try:
            with patch.object(admin_digest, "_send_message", new=AsyncMock(side_effect=fake_send_message)), \
                 patch.object(admin_digest, "_tg_configured", lambda: True), \
                 patch.object(admin_digest, "_aggregate_admin_metrics",
                              new=AsyncMock(return_value={"verdicts": 0, "window_hours": 24})):
                result = await admin_digest.run_admin_digest_once(force=True)
            return result, sent_to
        finally:
            await local_db.users.delete_many({"email": {"$in": [
                admin_email, non_admin_email, admin_email + ".alt"]}})
            _core_config.ADMIN_EMAILS = original_admins
            admin_digest.db = original_module_db
            admin_digest.ADMIN_EMAILS = original_module_admins
            cli.close()

    result, sent_to = asyncio.run(_run())

    # Exactly ONE Telegram send: to the admin's chat_id (777). The
    # non-admin's chat_id (888) MUST NOT appear.
    assert result["sent"] == 1, f"unexpected: {result}"
    assert sent_to == ["777"], (
        f"non-admin received digest! sent_to={sent_to} (expected only ['777']). "
        "This is a regression of the admin gating contract."
    )


def test_admin_digest_respects_cooldown_when_not_forced():
    """A non-forced run within COOLDOWN_HOURS of a prior digest must
    skip the admin (avoids double-sending if the loop double-wakes
    inside the firing hour)."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import os
    from datetime import datetime, timezone
    import core.config as _core_config

    async def _run():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        local_db = cli[os.environ["DB_NAME"]]
        admin_email = "jolor69+cooldown@gmail.com"

        await local_db.users.delete_many({"email": admin_email})
        await local_db.users.insert_one({
            "id": "u-cool",
            "email": admin_email,
            "telegram_chat_id": "999",
            # Pretend we sent the digest 1 hour ago — cooldown is 22h
            # so this user must NOT be eligible for a new send.
            "admin_digest_last_run_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })

        original_admins = _core_config.ADMIN_EMAILS
        _core_config.ADMIN_EMAILS = {admin_email.lower()}
        from services import admin_digest
        original_module_db = admin_digest.db
        admin_digest.db = local_db
        original_module_admins = admin_digest.ADMIN_EMAILS
        admin_digest.ADMIN_EMAILS = {admin_email.lower()}

        try:
            with patch.object(admin_digest, "_send_message", new=AsyncMock(return_value=True)), \
                 patch.object(admin_digest, "_tg_configured", lambda: True), \
                 patch.object(admin_digest, "_aggregate_admin_metrics",
                              new=AsyncMock(return_value={"verdicts": 0, "window_hours": 24})):
                # `force=False` (the loop's normal call) — must skip.
                non_forced = await admin_digest.run_admin_digest_once(force=False)
                # `force=True` (manual-trigger endpoint) — must send.
                forced = await admin_digest.run_admin_digest_once(force=True)
            return non_forced, forced
        finally:
            await local_db.users.delete_many({"email": admin_email})
            _core_config.ADMIN_EMAILS = original_admins
            admin_digest.db = original_module_db
            admin_digest.ADMIN_EMAILS = original_module_admins
            cli.close()

    non_forced, forced = asyncio.run(_run())
    assert non_forced["sent"] == 0
    assert non_forced.get("skipped_reason") == "no_eligible_admins"
    assert forced["sent"] == 1


def test_format_digest_omits_lines_for_missing_metrics():
    """When a metric query fails (None in the dict), its line must NOT
    appear in the message — keeps the digest terse and avoids "—"
    placeholder noise."""
    from services.admin_digest import _format_digest

    # Only verdicts present; everything else None.
    msg = _format_digest({
        "verdicts": 5,
        "thirty_second_goal_pct": None,
        "thirty_second_goal_n": None,
        "fallback_rate_pct": None,
        "top_failure_reason": None,
        "universal_key_balance": None,
        "window_hours": 24,
    })
    assert "Verdicts</b>: 5" in msg
    # These labels MUST be absent because their data was None.
    assert "30s-goal" not in msg
    assert "Fallback" not in msg
    assert "Top failure" not in msg
    assert "Universal Key" not in msg
