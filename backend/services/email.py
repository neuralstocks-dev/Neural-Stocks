"""Transactional email via Resend."""
import asyncio
import logging
import os
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
FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Neulab")
# Where replies land. Resend's verified sender (resend.dev) can't receive
# replies, so we route "Reply" clicks to a dedicated Gmail monitored by
# the team. Can be overridden via env.
REPLY_TO = os.environ.get("EMAIL_REPLY_TO", "neulab.ai@gmail.com")


DISCLAIMER_FOOTER = """
<hr style="border:none;border-top:1px solid #2a2a2a;margin:32px 0 16px 0" />
<p style="font-size:11px;color:#888;font-family:'IBM Plex Mono',monospace;line-height:1.6">
  <strong style="color:#aaa">Financial Disclaimer.</strong>
  Neulab is an AI-assisted analysis tool. Content is for educational and informational
  purposes only and is <em>not</em> investment advice, financial advice, or a
  recommendation to buy or sell any security. Markets are volatile; past performance
  does not guarantee future results. You are solely responsible for your investment
  decisions. Consult a licensed financial advisor before acting.
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
            You now have full access to Neulab's AI-powered stock analysis engine.
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
