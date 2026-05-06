"""Grade Adaptation Layer (GAL) — StockKids Phase Zero.

The GAL is the ONE genuinely new AI service in StockKids. It takes an
adult NSI verdict (the `AnalysisResult` JSON produced by `services.ai`)
and rewrites it into age-appropriate language for a kid audience.

Phase Zero scope:
    * Single async helper `translate_for_age()`
    * Ages grouped into 3 BANDS (not grades — PRD author wants worldwide
      applicability; grade systems vary wildly: US K-12, UK Years 1-13,
      Indonesia SD/SMP/SMA, Australia Preps/Years 1-12, etc.)
         - "8-10"   Early primary ·  1-2 signals · analogies · yes/no questions
         - "11-13"  Middle school ·  all 4 NSI signal families introduced
         - "14-18"  High school ·   full NSI reasoning, no simplification filter
    * Reuses the existing `_run_chat_in_thread` fallback chain from
      `services.ai` so we inherit the Sonnet-4.5 → Gemini-2.5-Pro adaptive
      routing, per-attempt timeouts, circuit breaker, and llm_events
      telemetry without duplicating infrastructure.
    * Strict JSON output — the kid frontend binds to a fixed shape.

Out of scope (will ship with V1/V2):
    * Trade-journal reflection persistence
    * Parent co-pilot line
    * Multi-language GAL (Bahasa Indonesia, Spanish, etc.)
    * Age-level calibrated Flesch-Kincaid scoring
"""
from __future__ import annotations

import json
import logging
from typing import Literal

from services.ai import _parse_ai_json_async, _run_chat_in_thread

log = logging.getLogger(__name__)

AgeBand = Literal["8-10", "11-13", "14-18"]

VALID_BANDS: tuple[AgeBand, ...] = ("8-10", "11-13", "14-18")


# Per-age-band guidance injected into the system prompt. The model is
# much more reliable when the grade-appropriateness rules are declarative
# rather than scattered across the instructions.
_BAND_SPECS: dict[AgeBand, dict[str, str]] = {
    "8-10": {
        "audience": "early primary school student, ages 8 to 10",
        "vocabulary": (
            "Use only words a curious 9-year-old would understand. "
            "AVOID: valuation, fundamentals, P/E, RSI, MACD, bearish, bullish, "
            "consensus, catalyst, volatility, resistance, support. "
            "USE: 'the price went up', 'lots of people want to buy this', "
            "'the company is making money', analogies to pocket money, toys, "
            "video games, sports teams, candy shops."
        ),
        "depth": (
            "Mention AT MOST ONE signal (pick whichever is strongest in the "
            "adult analysis). Explain it with a physical-world analogy. "
            "Do NOT introduce multiple technical concepts."
        ),
        "headline_style": "one short sentence, emoji-led, cheerful tone",
        "reflection_style": "a simple yes/no or multiple-choice question",
        "did_you_know_count": "1",
    },
    "11-13": {
        "audience": "middle-school student, ages 11 to 13",
        "vocabulary": (
            "Use middle-school vocabulary. You MAY introduce: RSI, moving "
            "average, buying pressure, selling pressure, momentum, fundamentals. "
            "AVOID: Sharpe ratio, convexity, consensus downgrade, implied "
            "volatility. Explain any technical term the FIRST time you use it."
        ),
        "depth": (
            "Cover 2-3 signals from the adult analysis (pick the most "
            "educational ones). Connect the dots: 'because X is high AND Y is "
            "rising, the AI thinks Z'. Introduce ONE new concept per analysis "
            "in a 'Did you know?' card."
        ),
        "headline_style": "one sentence, confident tone, emoji optional",
        "reflection_style": "an open-ended question asking the student to predict or justify",
        "did_you_know_count": "2 to 3",
    },
    "14-18": {
        "audience": "high-school student, ages 14 to 18",
        "vocabulary": (
            "Use high-school / early college vocabulary. All standard NSI "
            "terminology is fair game: RSI, MACD, candlestick patterns, "
            "Graham Number, consensus rating, momentum. Keep jargon minimal "
            "but do NOT oversimplify — this age band will toggle to Adult "
            "Mode if the explanation feels patronising."
        ),
        "depth": (
            "Cover all 4 NSI signal families if the adult report used them: "
            "price action, technicals, fundamentals, sentiment. Show the "
            "reasoning chain. Include ONE harder concept per analysis."
        ),
        "headline_style": "one analytical sentence, professional tone, no emoji",
        "reflection_style": "a thesis-level question about what would change your mind",
        "did_you_know_count": "2 to 3",
    },
}


def _slim_adult_nsi(adult: dict) -> dict:
    """Project the adult NSI verdict down to just the fields the GAL
    prompt consumes — cuts token usage on the GAL call by ~70%.

    The adult verdict can carry 20+ fields (full technicals dict, RF
    disagreement breakdown, candlestick pattern array, etc.) that the
    kid translation doesn't need directly; the model only needs the
    verdict + the short-form reasoning + the headline signals.
    """
    return {
        "ticker": adult.get("ticker"),
        "name": adult.get("name"),
        "recommendation": adult.get("recommendation"),
        "confidence_score": adult.get("confidence_score"),
        "price_target": adult.get("price_target"),
        "stop_loss": adult.get("stop_loss"),
        "time_horizon": adult.get("time_horizon"),
        "reasoning": (adult.get("reasoning") or "")[:1600],
        "key_signals": (adult.get("key_signals") or [])[:6],
        "risks": (adult.get("risks") or [])[:4],
        "strengths": (adult.get("strengths") or [])[:4],
        "current_price": adult.get("current_price") or adult.get("price_at_analysis"),
        "currency": adult.get("currency") or "USD",
    }


def _build_prompt(adult: dict, band: AgeBand) -> tuple[str, str]:
    """Return `(system_prompt, user_text)` for the GAL LLM call."""
    spec = _BAND_SPECS[band]

    system = f"""You are the Grade Adaptation Layer (GAL) for StockKids — an AI-native financial
literacy platform that teaches kids to invest by translating institutional-grade
AI stock analysis into age-appropriate language.

Your task: take an adult AI stock verdict (Neural Stock Intelligence output) and
rewrite it for a {spec['audience']}.

## Vocabulary rules
{spec['vocabulary']}

## Depth rules
{spec['depth']}

## Safety framing
CRITICAL: This is for EDUCATIONAL USE ONLY. The child is not using real money.
- NEVER tell the child to buy or sell — frame everything as "the AI thinks..." or "the signals suggest...".
- ALWAYS remind them that real investing involves losing money.
- NEVER predict the future. Use phrases like "might", "could", "tends to".

## Output format (STRICT JSON — no prose, no backticks, no explanation)
{{
  "kid_headline": "{spec['headline_style']}, max 90 characters",
  "kid_explanation": "One paragraph (3-5 sentences) in child-appropriate voice. Must weave in 1-3 concrete signals from the adult verdict.",
  "did_you_know": [
    {{
      "title": "Short catchy title, max 40 chars",
      "body": "2-3 sentence explanation of ONE concept from the adult verdict. Use an analogy."
    }}
    // total entries: {spec['did_you_know_count']}
  ],
  "reflection_question": "{spec['reflection_style']}",
  "what_would_change_my_mind": "One sentence in kid-speak: what price or event would make the AI change its verdict? Example: 'If the price drops below $185, the AI said its reasons for being hopeful stop working.'",
  "confidence_plain_english": "Translate the confidence score to kid speech. 0-40=not sure, 41-65=somewhat sure, 66-85=pretty sure, 86-100=very sure. Add a one-sentence rationale.",
  "emoji_mood": "ONE emoji that matches the verdict vibe (e.g. 🚀 for strong BUY, 😐 for HOLD, ⚠️ for SELL)."
}}

Respond with ONLY the JSON object. No preamble, no code fences, no trailing text."""

    user_text = (
        f"ADULT NSI VERDICT (translate this for a {spec['audience']}):\n\n"
        f"{json.dumps(_slim_adult_nsi(adult), ensure_ascii=False, indent=2)}"
    )
    return system, user_text


async def translate_for_age(adult_verdict: dict, age_band: AgeBand, ticker: str) -> dict:
    """Translate an adult NSI verdict into a kid-appropriate output.

    Returns a strict dict with the GAL JSON shape. On LLM failure, falls
    back to a minimally-safe stub (so the kid preview page can still
    render a "this ticker isn't ready yet" card rather than crashing).

    This function deliberately does NOT persist anything — Phase Zero is
    read-only on the adult analyses collection. The caller may cache the
    result in-memory if needed for demo performance.
    """
    if age_band not in VALID_BANDS:
        raise ValueError(f"Invalid age_band '{age_band}', must be one of {VALID_BANDS}")

    system, user_text = _build_prompt(adult_verdict, age_band)
    session_prefix = f"gal-{ticker}-{age_band}"

    raw, meta = await _run_chat_in_thread(system, session_prefix, user_text)
    try:
        out = await _parse_ai_json_async(raw)
    except Exception as e:
        log.warning("GAL JSON parse failed for %s (age=%s): %s", ticker, age_band, e)
        # Return a deliberate degraded card so the frontend can show a
        # "we're still learning this one" message rather than a 500.
        out = {
            "kid_headline": f"We're still learning about {ticker}!",
            "kid_explanation": (
                "The AI was a bit confused translating this one. Try another "
                "stock from the list — or come back in a few minutes."
            ),
            "did_you_know": [],
            "reflection_question": "Why do you think the AI might get confused sometimes?",
            "what_would_change_my_mind": "",
            "confidence_plain_english": "Not sure — the AI didn't finish its thought.",
            "emoji_mood": "🤔",
            "_degraded": True,
        }

    # Attach provenance so the admin can debug which provider generated
    # each kid translation (Sonnet vs Gemini fallback). Inherits the
    # same meta dict shape `services.ai` uses.
    out["_provider"] = meta.get("provider")
    out["_model"] = meta.get("model")
    return out
