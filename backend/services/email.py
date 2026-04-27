"""Transactional email via Resend."""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional
import resend

from core.config import RESEND_API_KEY, SENDER_EMAIL

logger = logging.getLogger(__name__)

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Brand display name for every transactional email. Users see this in
# their inbox "From" column — keeps the Neulab brand visible even while
# the underlying sender address is `onboarding@resend.dev` pending
# domain-level DNS verification on neulab.xyz.
FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "NeuLab Inc.")
# Where replies land. Resend's verified sender (resend.dev) can't receive
# replies, so we route "Reply" clicks to a dedicated Gmail monitored by
# the team. Can be overridden via env.
REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "ai.neulab.inc@gmail.com")


DISCLAIMER_FOOTER = """
<hr style="border:none;border-top:1px solid #2a2a2a;margin:32px 0 16px 0" />
<p style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;line-height:1.6">
  <strong style="color:#aaa">Educational research output.</strong>
  Neural Stock Intelligence™ is an AI-assisted research tool. All confidence and model-probability values
  describe the strength of the model's classification based on the inputs used —
  <em>not</em> forecasts of price movement or investment success. Content is for
  informational and educational purposes only and is <em>not</em> personalized
  financial advice or a recommendation to buy, sell, or hold any security. Conduct
  your own research and, where appropriate, consult a licensed financial professional.
</p>
"""


def _receipt_html(full_name: str, plan_name: str, amount: float, subscription_id: str,
                  next_billing: Optional[str] = None) -> str:
    greeting = full_name.split(" ")[0] if full_name else "there"
    next_line = (
        f'<tr><td style="padding:6px 0;color:#888">Next billing date</td>'
        f'<td style="padding:6px 0;text-align:right;font-family:monospace">{next_billing}</td></tr>'
        if next_billing else ""
    )
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b0b;color:#e6e6e6;font-family:Georgia,serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0b">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#131313;border:1px solid #2a2a2a;padding:32px">
        <tr><td>
          <p style="font-size:10px;letter-spacing:0.18em;color:#b8994f;text-transform:uppercase;margin:0">Neulab · Receipt</p>
          <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;color:#f5f5f0;margin:8px 0 0;letter-spacing:-0.01em">
            Thank you, {greeting}.
          </h1>
          <p style="color:#a8a8a8;font-size:15px;line-height:1.65;margin-top:16px">
            Your <strong style="color:#e6e6e6">{plan_name}</strong> subscription is active.
            You now have full access to Neural Stock Intelligence™'s AI-powered stock analysis engine.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;font-size:14px">
            <tr><td style="padding:6px 0;color:#888">Plan</td>
                <td style="padding:6px 0;text-align:right;color:#f5f5f0">{plan_name} · monthly</td></tr>
            <tr><td style="padding:6px 0;color:#888">Amount charged</td>
                <td style="padding:6px 0;text-align:right;font-family:monospace;color:#79d694">${amount:.2f} USD</td></tr>
            <tr><td style="padding:6px 0;color:#888">Subscription ID</td>
                <td style="padding:6px 0;text-align:right;font-family:monospace;font-size:11px;color:#a8a8a8">{subscription_id}</td></tr>
            {next_line}
          </table>

          <p style="color:#a8a8a8;font-size:13px;line-height:1.65;margin-top:28px">
            Manage or cancel your subscription anytime from your
            <a href="#" style="color:#b8994f;text-decoration:none;border-bottom:1px solid #b8994f">Pricing page</a>.
          </p>

          {DISCLAIMER_FOOTER}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def send_receipt_email(to_email: str, full_name: str, plan_name: str,
                             amount: float, subscription_id: str,
                             next_billing: Optional[str] = None) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping receipt email")
        return False
    html = _receipt_html(full_name, plan_name, amount, subscription_id, next_billing)
    params = {
        "from": f"{FROM_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "reply_to": REPLY_TO,
        "subject": f"Receipt · {FROM_NAME} {plan_name} subscription",
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Receipt email sent to %s · id=%s", to_email, result.get("id"))
        return True
    except Exception as e:
        logger.error("Resend send failed: %s", e)
        return False



# ─── Weekly RF Digest ────────────────────────────────────────────────────
_PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")


def _signal_row_html(sig: dict, locked: bool = False) -> str:
    """Render a single watchlist signal row. `locked=True` blurs the row
    for Free users beyond the free-tier limit.

    The internal `direction` value remains BUY/SELL (used for color routing
    + analytics), but every user-facing label here uses the educational
    framing — "Bullish bias" / "Bearish bias" — to stay consistent with
    the web report, PDF, share page, and Telegram alerts.
    """
    ticker = sig["ticker"]
    direction = sig["direction"]
    conf = sig["confidence_pct"]
    last_close = sig.get("last_close")
    horizon = sig.get("horizon_days", 20)

    dir_color = "#79d694" if direction == "BUY" else "#e26c6c"
    bias_label = "Bullish bias" if direction == "BUY" else "Bearish bias"
    close_line = f"${last_close:.2f}" if last_close else "—"

    if locked:
        return (
            '<tr><td style="padding:14px 12px;border-top:1px solid #2a2a2a;'
            'filter:blur(4px);opacity:0.45;pointer-events:none">'
            f'<div style="display:flex;justify-content:space-between;align-items:center">'
            f'<span style="font-family:monospace;font-size:15px;color:#f5f5f0">{ticker}</span>'
            f'<span style="font-family:monospace;font-size:13px;color:{dir_color};letter-spacing:0.12em">'
            f'{bias_label} · {conf}%</span>'
            '</div></td></tr>'
        )

    ticker_link = (
        f'<a href="{_PUBLIC_APP_URL}/analysis/{ticker}?autorun=1" '
        f'style="color:#f5f5f0;text-decoration:none;border-bottom:1px dotted #555">{ticker}</a>'
        if _PUBLIC_APP_URL else ticker
    )
    return f"""<tr><td style="padding:14px 12px;border-top:1px solid #2a2a2a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="font-family:monospace;font-size:16px;color:#f5f5f0;letter-spacing:0.02em">{ticker_link}</td>
      <td style="text-align:right;font-family:monospace;font-size:13px;color:{dir_color};letter-spacing:0.14em">
        {bias_label} · {conf}% model probability
      </td>
    </tr>
    <tr>
      <td style="padding-top:4px;font-size:12px;color:#8a8a8a;font-family:monospace">
        Last close {close_line} · {horizon}-day horizon · RF model
      </td>
      <td style="padding-top:4px;text-align:right;font-size:11px;color:#666;font-family:monospace">
        Tap for full research view →
      </td>
    </tr>
  </table>
</td></tr>"""


def _weekly_digest_html(full_name: str, signals: list[dict], locked_count: int,
                        is_paid: bool, plan: str) -> str:
    greeting = full_name.split(" ")[0] if full_name else "there"
    now = datetime.now(timezone.utc) if False else None  # noqa — kept for later i18n

    if not signals:
        body = (
            '<p style="color:#a8a8a8;font-size:15px;line-height:1.65;margin-top:16px">'
            'No strong directional reads on your watchlist this week — the Random-Forest '
            'model classifies everything you\'re tracking as roughly balanced. That\'s a '
            '<em>useful</em> signal too: nothing is flagging an asymmetric setup right now. '
            'Stay patient.'
            '</p>'
        )
    else:
        rows = "".join(_signal_row_html(s) for s in signals)
        locked_rows = "".join(
            _signal_row_html({"ticker": "·····", "direction": "BUY", "confidence_pct": 0}, locked=True)
            for _ in range(locked_count)
        )
        body = f"""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border:1px solid #2a2a2a">
    {rows}
    {locked_rows}
  </table>
"""

    # Upgrade CTA for Free users only.
    upgrade_cta = ""
    if not is_paid:
        upgrade_cta = f"""
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;background:#1a140a;border:1px solid #b8994f;padding:20px">
    <tr><td>
      <p style="margin:0;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:0.18em;color:#b8994f;text-transform:uppercase">
        Want daily instead of weekly?
      </p>
      <p style="margin:8px 0 0;color:#e6e6e6;font-size:14px;line-height:1.55">
        <strong>Watchlist Auto-Scan</strong> (Pro/Elite) pushes the same
        analytical-bias reads to Telegram every day, the moment the model
        sees a strong shift — not 5 days later. $12/mo.
      </p>
      <p style="margin:16px 0 0">
        <a href="{_PUBLIC_APP_URL}/pricing" style="display:inline-block;padding:10px 18px;background:#b8994f;color:#0b0b0b;font-family:monospace;font-size:12px;letter-spacing:0.12em;text-decoration:none;text-transform:uppercase">
          See plans →
        </a>
      </p>
    </td></tr>
  </table>
"""

    settings_link = f"{_PUBLIC_APP_URL}/settings" if _PUBLIC_APP_URL else "#"

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b0b;color:#e6e6e6;font-family:Georgia,serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0b0b">
    <tr><td align="center" style="padding:40px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#131313;border:1px solid #2a2a2a;padding:32px">
        <tr><td>
          <p style="font-size:10px;letter-spacing:0.18em;color:#b8994f;text-transform:uppercase;margin:0">
            Neural Stock Intelligence™ · Weekly Digest · {plan.upper()}
          </p>
          <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;color:#f5f5f0;margin:8px 0 0;letter-spacing:-0.01em">
            Hi {greeting} — here's your week.
          </h1>
          <p style="color:#a8a8a8;font-size:14px;line-height:1.65;margin-top:14px">
            The Random-Forest model ran across your watchlist. Below are the
            {len(signals)} strongest directional reads it sees — framed as
            <strong>analytical bias</strong>, not trade instructions. These
            are <strong>RF-only signals</strong> — tap any ticker to open the
            full Claude-assisted multi-lens research view before drawing
            conclusions.
          </p>
          {body}
          {upgrade_cta}
          <p style="color:#6a6a6a;font-size:11px;line-height:1.65;margin-top:28px;font-family:monospace">
            Don't want the weekly digest?
            <a href="{settings_link}" style="color:#b8994f;text-decoration:none;border-bottom:1px solid #444">
              Turn it off in Settings
            </a>.
          </p>
          {DISCLAIMER_FOOTER}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def send_weekly_digest_email(to_email: str, full_name: str, signals: list[dict],
                                   locked_count: int, is_paid: bool, plan: str) -> bool:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping weekly digest")
        return False
    html = _weekly_digest_html(full_name, signals, locked_count, is_paid, plan)
    subject = (
        f"Your NSI weekly digest · {len(signals)} strong directional read"
        + ("s" if len(signals) != 1 else "")
        if signals else "Your NSI weekly digest · no strong reads this week"
    )
    params = {
        "from": f"{FROM_NAME} <{SENDER_EMAIL}>",
        "to": [to_email],
        "reply_to": REPLY_TO,
        "subject": subject,
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Weekly digest sent to %s · id=%s · signals=%d",
                    to_email, result.get("id"), len(signals))
        return True
    except Exception as e:
        logger.error("Weekly digest send failed: %s", e)
        return False
