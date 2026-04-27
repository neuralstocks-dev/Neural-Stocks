"""Weekly cost-anchor reminder cron.

Background task that, when admin opted in via the AdminCostPage UI, emails
them every Friday 09-11 UTC with the current anchor age + projected
verdicts left — only if it's actually worth nudging (anchor stale OR
projection low).

This works around the fact that Emergent doesn't expose a programmatic
balance API. Instead of a fragile scraper, we shift the burden back to
the admin via a passive email checkpoint that arrives once a week.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import resend

from core.db import db
from core.config import RESEND_API_KEY, SENDER_EMAIL
from services.telegram import send_alert_to_user, is_configured as _tg_configured

logger = logging.getLogger(__name__)

FROM_NAME = "NeuLab Inc. Admin"
LOOP_CHECK_INTERVAL_S = 600  # 10 min
COOLDOWN_HOURS = 150         # one send per ~6 days, mirrors weekly-digest
# Telegram alert is more aggressive — real-time push when balance is
# critically low. 24h cooldown keeps it actionable without becoming spam.
TG_COOLDOWN_HOURS = 24
TG_LOW_BALANCE_THRESHOLD = 10  # verdicts left
TG_CHECK_INTERVAL_S = 1800     # 30 min — fast enough for a "running out" push

# Match COST_PER_VERDICT_USD in routers/admin.py — keep in sync.
COST_PER_VERDICT_USD = 0.027
ANCHOR_STALE_DAYS = 7
LOW_PROJECTION_THRESHOLD = 25


async def _compute_projection() -> Optional[dict]:
    """Pure read of db state — same logic as admin.cost_summary's anchor
    branch. Returns None if no anchor is set."""
    anchor = await db.app_settings.find_one(
        {"_id": "credit_balance_anchor"}, {"_id": 0}
    )
    if not anchor or anchor.get("credits_at_top_up") is None:
        return None
    anchor_iso = anchor.get("top_up_at") or ""
    used_count = await db.analyses.count_documents(
        {"created_at": {"$gte": anchor_iso}} if anchor_iso else {}
    )
    used_credits = round(used_count * COST_PER_VERDICT_USD * 100, 2)
    starting = float(anchor["credits_at_top_up"])
    remaining = max(0.0, round(starting - used_credits, 2))
    age_days = None
    if anchor_iso:
        try:
            age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(anchor_iso)).days
        except Exception:
            age_days = None
    return {
        "credits_at_top_up": starting,
        "top_up_at": anchor_iso,
        "age_days": age_days,
        "used_credits": used_credits,
        "verdicts_since": used_count,
        "remaining_credits": remaining,
        "remaining_usd": round(remaining * 0.01, 2),
        "verdicts_left": int(remaining // (COST_PER_VERDICT_USD * 100)) if remaining > 0 else 0,
    }


def _render_html(p: dict, recipient: str) -> str:
    """Plain-but-disciplined HTML email body. Mirrors the visual language
    of the in-app cost dashboard so the recipient knows it's real."""
    age = p["age_days"]
    age_label = "today" if age == 0 else f"{age} day{'s' if age != 1 else ''} ago"
    stale_note = ""
    if age is not None and age >= ANCHOR_STALE_DAYS:
        stale_note = "<p style='color:#c08540;margin:8px 0 0;font-size:13px;'>⚠ Your anchor is more than 7 days old. Refresh it to keep projections accurate.</p>"
    low_note = ""
    if p["verdicts_left"] < LOW_PROJECTION_THRESHOLD:
        low_note = f"<p style='color:#b03e3e;margin:8px 0 0;font-size:13px;'>⚠ Projected only {p['verdicts_left']} verdicts left. Top up the Universal Key soon.</p>"
    return f"""
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fafafa;padding:24px;color:#1a1a1a;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;">
    <tr><td style="padding:24px 28px 8px;">
      <p style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#888;margin:0;">NeuLab Inc. · Cost Anchor Reminder</p>
      <h1 style="font-family:Georgia,serif;font-size:22px;letter-spacing:-0.01em;margin:8px 0 0;">Weekly Universal Key check-in.</h1>
      <p style="color:#555;font-size:14px;line-height:1.5;margin:14px 0 0;">
        You opted in for a passive weekly nudge so the Cost Dashboard projection stays accurate. Here's where things stand right now:
      </p>
    </td></tr>
    <tr><td style="padding:8px 28px 16px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e5e5;font-family:'SFMono-Regular',Menlo,monospace;font-size:13px;">
        <tr style="background:#fafafa;"><td style="padding:10px 12px;border-right:1px solid #e5e5e5;color:#888;">Anchor set</td><td style="padding:10px 12px;text-align:right;">{age_label}</td></tr>
        <tr><td style="padding:10px 12px;border-right:1px solid #e5e5e5;border-top:1px solid #e5e5e5;color:#888;">Anchor balance</td><td style="padding:10px 12px;text-align:right;border-top:1px solid #e5e5e5;">{p['credits_at_top_up']:.2f} credits</td></tr>
        <tr style="background:#fafafa;"><td style="padding:10px 12px;border-right:1px solid #e5e5e5;border-top:1px solid #e5e5e5;color:#888;">Used since</td><td style="padding:10px 12px;text-align:right;border-top:1px solid #e5e5e5;">{p['used_credits']:.2f} credits · {p['verdicts_since']} verdicts</td></tr>
        <tr><td style="padding:10px 12px;border-right:1px solid #e5e5e5;border-top:1px solid #e5e5e5;color:#888;">Estimated remaining</td><td style="padding:10px 12px;text-align:right;border-top:1px solid #e5e5e5;color:{"#b03e3e" if p['verdicts_left'] < LOW_PROJECTION_THRESHOLD else "#3a8a4a"};">{p['remaining_credits']:.2f} credits ≈ ${p['remaining_usd']:.2f}</td></tr>
        <tr style="background:#fafafa;"><td style="padding:10px 12px;border-right:1px solid #e5e5e5;border-top:1px solid #e5e5e5;color:#888;">Verdicts left</td><td style="padding:10px 12px;text-align:right;border-top:1px solid #e5e5e5;font-weight:600;">{p['verdicts_left']}</td></tr>
      </table>
      {stale_note}
      {low_note}
    </td></tr>
    <tr><td style="padding:0 28px 24px;">
      <a href="https://app.emergent.sh/" style="display:inline-block;padding:10px 16px;background:#1a1a1a;color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.02em;border-radius:2px;margin-right:8px;">Open Emergent Profile</a>
      <span style="font-size:12px;color:#888;">→ refresh anchor in your Cost Dashboard</span>
    </td></tr>
    <tr><td style="padding:14px 28px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:11px;color:#888;line-height:1.5;">
      Sent to {recipient}. Disable anytime in <em>Admin → Cost &amp; Universal Key</em> by toggling the weekly reminder off.
    </td></tr>
  </table>
</body></html>"""


async def _send_reminder(recipient: str, p: dict) -> tuple[bool, str | None]:
    """Returns (sent, error_message). Error message bubbles up to the
    /test-send endpoint so the admin sees the real failure (e.g. Resend's
    "you can only send to your own verified email" quota error) instead of
    a silent False."""
    if not RESEND_API_KEY:
        return False, "RESEND_API_KEY not configured"
    resend.api_key = RESEND_API_KEY
    params = {
        "from": f"{FROM_NAME} <{SENDER_EMAIL}>",
        "to": [recipient],
        "subject": f"[NeuLab Inc.] Universal Key check-in · ~{p['verdicts_left']} verdicts left",
        "html": _render_html(p, recipient),
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Cost reminder sent to %s · id=%s", recipient, result.get("id"))
        return True, None
    except Exception as e:
        msg = str(e)[:300]
        logger.error("Cost reminder send failed: %s", msg)
        return False, msg


async def run_cost_reminder_once(force: bool = False) -> dict:
    """Single iteration. Returns a debug dict — useful for an admin
    'Send test now' button later, or for cron auditing."""
    pref = await db.app_settings.find_one(
        {"_id": "cost_anchor_reminder"}, {"_id": 0}
    ) or {}
    if not pref.get("enabled"):
        return {"sent": False, "reason": "disabled"}
    recipient = pref.get("recipient")
    if not recipient:
        return {"sent": False, "reason": "no_recipient"}
    # Cooldown — last_sent_at within 150h means skip
    last = pref.get("last_sent_at")
    if last and not force:
        try:
            last_dt = datetime.fromisoformat(last)
            if datetime.now(timezone.utc) - last_dt < timedelta(hours=COOLDOWN_HOURS):
                return {"sent": False, "reason": "cooldown"}
        except Exception:
            pass
    p = await _compute_projection()
    if not p:
        return {"sent": False, "reason": "no_anchor"}
    # Worth-emailing gate (skip if everything's fine)
    age = p.get("age_days") or 0
    worth_it = age >= ANCHOR_STALE_DAYS or p["verdicts_left"] < LOW_PROJECTION_THRESHOLD
    if not worth_it and not force:
        return {"sent": False, "reason": "not_worth_emailing", "projection": p}
    ok, err = await _send_reminder(recipient, p)
    if ok:
        await db.app_settings.update_one(
            {"_id": "cost_anchor_reminder"},
            {"$set": {"last_sent_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"sent": True, "projection": p, "recipient": recipient}
    return {
        "sent": False,
        "reason": "send_failed",
        "error": err,
        "projection": p,
        "recipient": recipient,
    }


async def cost_reminder_loop():
    """Wakes every 10 min. Fires Fridays 09-10 UTC (≈ Friday morning ET).
    Cooldown prevents double-sends within the window."""
    await asyncio.sleep(180)  # post-boot settle
    while True:
        try:
            now = datetime.now(timezone.utc)
            # Friday morning UTC, anywhere in the 09-10 window.
            if now.weekday() == 4 and 9 <= now.hour <= 10:
                result = await run_cost_reminder_once()
                if result.get("sent"):
                    logger.info("Cost reminder fired: %s", result.get("recipient"))
        except Exception as e:
            logger.warning("cost_reminder_loop iteration failed: %s", e)
        await asyncio.sleep(LOOP_CHECK_INTERVAL_S)


# --- Telegram low-balance push --------------------------------------------
# Independent of the weekly email cron. Wakes every 30 min, computes the
# current projection, and fires a Telegram push to the linked admin user
# IF projected verdicts left drops below the threshold (default 10) AND
# we haven't already sent a push within the last 24h. The whole point is
# real-time "you're about to run out" — the email is for passive weekly
# bookkeeping, this is for "act now".


async def run_tg_low_balance_check_once(force: bool = False) -> dict:
    """Single iteration. Returns a debug dict so the admin 'Send test now'
    UI button can show what happened."""
    pref = await db.app_settings.find_one(
        {"_id": "cost_anchor_tg_alert"}, {"_id": 0}
    ) or {}
    if not pref.get("enabled"):
        return {"sent": False, "reason": "disabled"}
    user_id = pref.get("user_id")
    if not user_id:
        return {"sent": False, "reason": "no_user_id"}
    if not _tg_configured():
        return {"sent": False, "reason": "telegram_not_configured"}

    threshold = int(pref.get("threshold") or TG_LOW_BALANCE_THRESHOLD)
    last = pref.get("last_sent_at")
    if last and not force:
        try:
            last_dt = datetime.fromisoformat(last)
            if datetime.now(timezone.utc) - last_dt < timedelta(hours=TG_COOLDOWN_HOURS):
                return {"sent": False, "reason": "cooldown"}
        except Exception:
            pass

    p = await _compute_projection()
    if not p:
        return {"sent": False, "reason": "no_anchor"}

    verdicts_left = p["verdicts_left"]
    if verdicts_left >= threshold and not force:
        return {"sent": False, "reason": "above_threshold", "projection": p}

    # Build the Telegram message — short and actionable. <b>...</b> for HTML
    # parse mode; emoji safe across Telegram clients.
    title = "⚠️ Universal Key low"
    body = (
        f"Projected <b>{verdicts_left} verdict{'s' if verdicts_left != 1 else ''}</b> left\n"
        f"Remaining: <b>{p['remaining_credits']:.2f} credits</b> (≈ ${p['remaining_usd']:.2f})\n"
        f"Anchor age: {p['age_days']}d · used since: {p['used_credits']:.1f} cr / {p['verdicts_since']} verdicts\n\n"
        "Top up at app.emergent.sh → Universal Key, then refresh the anchor in /admin/cost."
    )
    ok = await send_alert_to_user(user_id, title, body)
    if ok:
        await db.app_settings.update_one(
            {"_id": "cost_anchor_tg_alert"},
            {"$set": {"last_sent_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"sent": True, "verdicts_left": verdicts_left, "user_id": user_id}
    return {
        "sent": False,
        "reason": "telegram_send_failed",
        "verdicts_left": verdicts_left,
        "user_id": user_id,
    }


async def tg_low_balance_loop():
    """Wakes every 30 min. Independent of the weekly cron — fires whenever
    the projection crosses the threshold, with a 24h cooldown."""
    await asyncio.sleep(240)  # post-boot settle (offset from email loop)
    while True:
        try:
            result = await run_tg_low_balance_check_once()
            if result.get("sent"):
                logger.info(
                    "Telegram low-balance alert fired · verdicts_left=%s user_id=%s",
                    result.get("verdicts_left"),
                    result.get("user_id"),
                )
        except Exception as e:
            logger.warning("tg_low_balance_loop iteration failed: %s", e)
        await asyncio.sleep(TG_CHECK_INTERVAL_S)
