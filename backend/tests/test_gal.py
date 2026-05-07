"""Phase Zero regression tests for the Grade Adaptation Layer (GAL).

These lock the public contract of `services.gal` so a future schema
change can't accidentally break the kid-preview frontend. We mock the
underlying LLM call so the suite is fast and offline-safe.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def _adult_fixture() -> dict:
    """Realistic-shape adult NSI verdict — mirrors what `services.ai`
    actually emits. Locked here so a future change to that emitter
    surfaces in this test as a contract failure."""
    return {
        "ticker": "AAPL",
        "name": "Apple Inc.",
        "recommendation": "BUY",
        "confidence_score": 78,
        "price_target": 215.0,
        "stop_loss": 185.0,
        "time_horizon": 12,
        "reasoning": (
            "Apple's recurring services revenue + buybacks + healthy free cash flow "
            "support a constructive multi-quarter view. RSI of 58 shows healthy buying "
            "pressure without overheating, and the 50DMA crossed above the 200DMA last "
            "week — a textbook golden cross."
        ),
        "key_signals": ["RSI 58", "Golden cross", "Strong FCF"],
        "risks": ["China revenue concentration", "App Store regulation"],
        "strengths": ["Durable moat", "Capital return discipline"],
        "current_price": 198.42,
        "currency": "USD",
    }


def test_translate_for_age_uses_correct_band_spec():
    """Age band 8-10 must produce a prompt with the early-primary
    vocabulary rules. Locks the BAND_SPECS contract."""
    from services import gal
    captured = {}

    async def fake_chat(system, session_prefix, user_text):
        captured["system"] = system
        captured["session_prefix"] = session_prefix
        return (
            json.dumps({
                "kid_headline": "🚀 Apple looks strong!",
                "kid_explanation": "The AI thinks Apple is doing well right now.",
                "did_you_know": [{"title": "What is RSI?", "body": "RSI is like a speedometer for stock prices."}],
                "reflection_question": "Do you use Apple products at home?",
                "what_would_change_my_mind": "If the price drops below $185.",
                "confidence_plain_english": "Pretty sure — 78 means the AI feels good about this one.",
                "emoji_mood": "🚀",
            }),
            {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "label": "claude-sonnet-4-5"},
        )

    with patch.object(gal, "_run_chat_in_thread", side_effect=fake_chat):
        out = asyncio.run(gal.translate_for_age(_adult_fixture(), "8-10", "AAPL"))

    # Returned shape contract
    for k in ("kid_headline", "kid_explanation", "did_you_know", "reflection_question",
              "what_would_change_my_mind", "confidence_plain_english", "emoji_mood"):
        assert k in out, f"missing required key: {k}"
    assert out["_provider"] == "anthropic"
    assert out["_model"] == "claude-sonnet-4-5-20250929"
    assert captured["session_prefix"] == "gal-AAPL-8-10-en"

    # Prompt-side contract — band-specific guidance landed in the system prompt
    sys_prompt = captured["system"]
    assert "8 to 10" in sys_prompt
    assert "AT MOST ONE" in sys_prompt or "ONE signal" in sys_prompt
    assert "AVOID:" in sys_prompt and "RSI" in sys_prompt  # 8-10 must explicitly avoid RSI


def test_translate_for_age_high_school_band_does_not_oversimplify():
    """14-18 band must NOT include early-primary 'avoid RSI/MACD'."""
    from services import gal
    captured = {}

    async def fake_chat(system, session_prefix, user_text):
        captured["system"] = system
        return (
            json.dumps({
                "kid_headline": "AAPL: BUY at 78% confidence — golden-cross + healthy RSI.",
                "kid_explanation": "Apple's technicals and fundamentals are aligned bullish.",
                "did_you_know": [
                    {"title": "Golden Cross Pattern", "body": "When the 50-day MA crosses above the 200-day MA."},
                    {"title": "RSI Interpretation", "body": "Above 70 is overbought, below 30 is oversold."},
                ],
                "reflection_question": "What single piece of news would invalidate this thesis?",
                "what_would_change_my_mind": "A close below $185 invalidates the setup.",
                "confidence_plain_english": "Very confident — 78% is a strong reading.",
                "emoji_mood": "📈",
            }),
            {"provider": "google", "model": "gemini-2.5-pro", "label": "gemini-2.5-pro"},
        )

    with patch.object(gal, "_run_chat_in_thread", side_effect=fake_chat):
        out = asyncio.run(gal.translate_for_age(_adult_fixture(), "14-18", "AAPL"))

    assert out["_provider"] == "google"
    sys_prompt = captured["system"]
    assert "14 to 18" in sys_prompt
    # 14-18 vocabulary section ALLOWS RSI/MACD
    assert "All standard NSI" in sys_prompt
    assert "do NOT oversimplify" in sys_prompt


def test_translate_for_age_handles_llm_garbage_gracefully():
    """Non-JSON LLM output must fall back to a degraded card."""
    from services import gal

    async def bad_chat(system, session_prefix, user_text):
        return ("absolutely not json — the model went off the rails",
                {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "label": "x"})

    with patch.object(gal, "_run_chat_in_thread", side_effect=bad_chat):
        out = asyncio.run(gal.translate_for_age(_adult_fixture(), "11-13", "AAPL"))

    assert out.get("_degraded") is True
    for k in ("kid_headline", "kid_explanation", "did_you_know", "reflection_question",
              "what_would_change_my_mind", "confidence_plain_english", "emoji_mood"):
        assert k in out, f"degraded card missing required key: {k}"


def test_translate_for_age_rejects_invalid_age_band():
    """Reject unknown age bands at the service boundary."""
    from services import gal
    with pytest.raises(ValueError, match="Invalid age_band"):
        asyncio.run(gal.translate_for_age(_adult_fixture(), "5-7", "AAPL"))


def test_slim_adult_nsi_strips_oversize_fields():
    """Reasoning text capped at 1600 chars; key_signals at 6 entries."""
    from services.gal import _slim_adult_nsi
    adult = _adult_fixture()
    adult["reasoning"] = "x" * 5000
    adult["key_signals"] = [f"sig{i}" for i in range(20)]
    out = _slim_adult_nsi(adult)
    assert len(out["reasoning"]) == 1600
    assert len(out["key_signals"]) == 6
