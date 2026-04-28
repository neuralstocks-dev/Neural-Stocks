"""Regression test — ensure @neuralstockintelligence is surfaced on every
outbound artifact (PDF reports, Trade Slip, Telegram alerts, transactional
emails). Locks the cross-channel brand footer in place so future refactors
don't accidentally strip it.
"""
import io
import os
import sys

import pdfplumber
import pytest

# Make the backend importable when running pytest from repo root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from services.email import DISCLAIMER_FOOTER  # noqa: E402
from services.pdf import (  # noqa: E402
    SOCIAL_HANDLE,
    SOCIAL_LINE_HTML,
    generate_analysis_pdf,
    generate_trade_slip_pdf,
)
from services.telegram import _TG_SOCIAL_FOOTER  # noqa: E402

HANDLE = "@neuralstockintelligence"


def _stub_analysis() -> dict:
    """Minimum analysis payload that exercises the full report + slip
    rendering paths without hitting MongoDB."""
    return {
        "ticker": "AAPL",
        "currency": "USD",
        "current_price": 195.5,
        "recommendation": "BUY",
        "confidence": 78,
        "scenarios": {
            "buy": {"entry": 192, "stop": 184, "target": 215, "horizon_days": 30}
        },
        "technical_analysis": "Strong uptrend with healthy RSI at 58.",
        "fundamental_analysis": "Trading at +730% vs Graham anchor of $32.63 — premium reflects intangibles.",
        "key_drivers": ["RSI 58 (healthy)", "Above 50DMA + 200DMA", "Volume confirms"],
        "risks": ["Macro headwinds", "Sector rotation risk"],
        "analyst_consensus": {"rating": "Buy", "price_target": 220, "analyst_count": 32},
        "earnings_data": {"next_earnings_date": "2026-04-30", "days_until_earnings": 60},
        "news_sentiment": "neutral",
        "rf_score": 0.62,
        "intrinsic_anchor": {
            "primary_anchor": "graham",
            "primary_estimate": 32.63,
            "premium_to_anchor_pct": 730.7,
            "interpretation": "deep_premium",
            "primary_applicability": "low_fit_intangible_heavy",
        },
    }


def test_pdf_constants_expose_handle():
    assert HANDLE == SOCIAL_HANDLE
    assert HANDLE in SOCIAL_LINE_HTML


def test_full_report_pdf_contains_social_handle():
    pdf_bytes = generate_analysis_pdf(_stub_analysis())
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    assert HANDLE in text, "Full report PDF must surface @neuralstockintelligence"
    assert "FOLLOW" in text, "Full report PDF must include the FOLLOW label"


def test_trade_slip_pdf_contains_social_handle():
    slip = generate_trade_slip_pdf(_stub_analysis(), share_url="https://neulab.xyz/v/test")
    with pdfplumber.open(io.BytesIO(slip)) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    assert HANDLE in text, "Trade Slip PDF must surface @neuralstockintelligence"


def test_telegram_alert_footer_has_both_handles_and_links():
    assert HANDLE in _TG_SOCIAL_FOOTER
    assert "https://www.instagram.com/neuralstockintelligence" in _TG_SOCIAL_FOOTER
    assert "https://www.tiktok.com/@neuralstockintelligence" in _TG_SOCIAL_FOOTER
    # Must use proper HTML link entities so Telegram renders them tappable.
    assert _TG_SOCIAL_FOOTER.count("<a href=") == 2


def test_telegram_alert_footer_uses_three_separate_rows():
    """Per UX spec, the footer renders on three lines, one per row:
        Row 1: Follow Neural Stock Intelligence
        Row 2: IG @neuralstockintelligence
        Row 3: TikTok @neuralstockintelligence
    Must NOT use the legacy single-line " · " joiner.
    """
    # No interpunct/bullet joiners between handles.
    assert " · " not in _TG_SOCIAL_FOOTER, (
        "Telegram footer must use newlines, not ' · ' joiners"
    )
    # Strip the leading "\n\n" gap between body and footer, then split on
    # newlines. We expect exactly 3 non-empty rows.
    rows = [r for r in _TG_SOCIAL_FOOTER.lstrip("\n").split("\n") if r.strip()]
    assert len(rows) == 3, f"Expected 3 footer rows, got {len(rows)}: {rows}"
    assert "Follow Neural Stock Intelligence" in rows[0]
    assert rows[1].startswith("<a href=") and "IG @neuralstockintelligence" in rows[1]
    assert rows[2].startswith("<a href=") and "TikTok @neuralstockintelligence" in rows[2]


def test_email_disclaimer_footer_has_both_handles_and_links():
    assert HANDLE in DISCLAIMER_FOOTER
    assert "instagram.com/neuralstockintelligence" in DISCLAIMER_FOOTER
    assert "tiktok.com/@neuralstockintelligence" in DISCLAIMER_FOOTER


def test_send_alert_to_user_appends_social_footer(monkeypatch):
    """Ensure send_alert_to_user() always appends the social footer to the
    final HTML payload pushed to Telegram, regardless of ticker presence."""
    import asyncio
    from types import SimpleNamespace

    from services import telegram as tg

    sent = {}

    async def fake_find_one(_query, _proj=None):
        return {"telegram_chat_id": "999"}

    async def fake_send_message(chat_id, text):
        sent["chat_id"] = chat_id
        sent["text"] = text
        return True

    fake_users = SimpleNamespace(find_one=fake_find_one)
    fake_db = SimpleNamespace(users=fake_users)
    monkeypatch.setattr(tg, "db", fake_db)
    monkeypatch.setattr(tg, "_send_message", fake_send_message)

    ok = asyncio.run(
        tg.send_alert_to_user("uid-1", "Pattern detected", "Bullish engulfing on AAPL")
    )
    assert ok is True
    assert HANDLE in sent["text"]
    assert "Follow Neural Stock Intelligence" in sent["text"]
    # Without ticker → no in-app deep link, but social footer still appended.
    assert "Open AAPL in app" not in sent["text"]
