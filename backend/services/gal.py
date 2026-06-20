"""Grade Adaptation Layer (GAL) — KidStocks Phase Zero.

The GAL is the ONE genuinely new AI service in KidStocks. It takes an
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
    * Reuses the existing `_run_chat_in_thread` shim from `services.ai`
      so we inherit the OpenRouter (DeepSeek V4 Pro primary, with
      automatic fallback to V4 Flash and free models) cascade and
      per-attempt timeouts without duplicating call infrastructure.
      Note: this does NOT inherit the llm_circuit_breaker / llm_events
      health-monitoring system — that system deliberately only persists
      timeout/failure events, not successes, since it exists to detect
      outage patterns, not to count billable calls. GAL has its own
      separate `gal_calls` collection (see _record_gal_call below) for
      cost accounting, since that needs every successful call counted,
      which is the opposite of what llm_events is designed to store.
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

from core.db import db
from core.security import iso, now_utc
from services.ai import _parse_ai_json_async, _run_chat_in_thread

log = logging.getLogger(__name__)

AgeBand = Literal["8-10", "11-13", "14-18"]
Lang = Literal["en", "id"]

VALID_BANDS: tuple[AgeBand, ...] = ("8-10", "11-13", "14-18")
VALID_LANGS: tuple[Lang, ...] = ("en", "id")


# Per-language language-output rules. The English path stays as-is for
# backwards compatibility; the Indonesian path swaps the entire output
# language and lightly localises the analogies (pocket money → uang
# jajan, candy shop → toko jajan).
_LANG_RULES: dict[Lang, str] = {
    "en": "Respond entirely in fluent natural English appropriate for the age band. Use US/UK English idioms.",
    "id": (
        "TULIS SELURUH HASIL DALAM BAHASA INDONESIA YANG NATURAL DAN RAMAH ANAK. "
        "Use Bahasa Indonesia for every field — kid_headline, kid_explanation, "
        "did_you_know titles AND bodies, reflection_question, what_would_change_my_mind, "
        "confidence_plain_english. Use natural Indonesian idioms — uang jajan instead of "
        "pocket money, toko jajan / warung instead of candy shop, sepak bola for sports "
        "analogies. The emoji_mood field stays as a single emoji (no language). "
        "Do NOT mix English words for technical concepts — translate them: "
        "moving average → rata-rata pergerakan, momentum → momentum (untranslated, OK), "
        "buying pressure → tekanan beli, selling pressure → tekanan jual, "
        "RSI → RSI (kept), bullish → bullish/optimistis, bearish → bearish/pesimistis."
    ),
}


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


def _build_prompt(adult: dict, band: AgeBand, lang: Lang = "en") -> tuple[str, str]:
    """Return `(system_prompt, user_text)` for the GAL LLM call."""
    spec = _BAND_SPECS[band]
    lang_rule = _LANG_RULES.get(lang, _LANG_RULES["en"])

    system = f"""You are the Grade Adaptation Layer (GAL) for KidStocks — an AI-native financial
literacy platform that teaches kids to invest by translating institutional-grade
AI stock analysis into age-appropriate language.

Your task: take an adult AI stock verdict (Neural Stock Intelligence output) and
rewrite it for a {spec['audience']}.

## Output language
{lang_rule}

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
        f"ADULT NSI VERDICT (translate this for a {spec['audience']}, output language: {lang}):\n\n"
        f"{json.dumps(_slim_adult_nsi(adult), ensure_ascii=False, indent=2)}"
    )
    return system, user_text


# Mirrors COST_PER_VERDICT_USD in routers/admin.py — kept as a sibling
# constant here (not imported) to avoid a backend/routers -> backend/services
# import direction reversal. ~1.1k input tokens (system prompt + slimmed
# adult-verdict payload) + ~325 output tokens (short kid-language JSON) at
# DeepSeek V4 Pro OpenRouter rates ($0.27/1M in, $1.10/1M out) ≈ $0.00065
# per LLM round-trip. A call that needed the one retry (see translate_for_age)
# made two round-trips, so its true cost is ~2x — recorded as such via the
# `attempts` field below rather than silently treating every row as one
# flat-rate call.
GAL_COST_PER_ATTEMPT_USD = 0.00065

_gal_index_ensured = False


async def _record_gal_call(ticker: str, age_band: str, lang: str, attempts: int, degraded: bool) -> None:
    """Best-effort log of one GAL translation request for cost accounting.

    Deliberately separate from llm_circuit_breaker's `llm_events` collection
    (see module docstring) — that system only persists failures/timeouts by
    design, which is the opposite of what cost tracking needs: every
    successful (billable) call counted, every retry's extra round-trip
    counted too. Swallows all exceptions so a Mongo hiccup never breaks the
    actual kid-facing translation response.

    No TTL on this collection (unlike llm_events or kids_preview_jobs) —
    the admin cost dashboard reads up to 365 days back, so GAL spend
    history needs to persist exactly as long as db.analyses does.
    """
    global _gal_index_ensured
    try:
        if not _gal_index_ensured:
            try:
                await db.gal_calls.create_index("created_at")
            except Exception:  # noqa: BLE001
                pass
            _gal_index_ensured = True
        await db.gal_calls.insert_one({
            "ticker": ticker,
            "age_band": age_band,
            "lang": lang,
            "attempts": attempts,
            "degraded": degraded,
            "usd": round(attempts * GAL_COST_PER_ATTEMPT_USD, 6),
            "created_at": iso(now_utc()),
        })
    except Exception as e:  # noqa: BLE001
        log.debug("gal_calls persist skipped: %s", e)


async def translate_for_age(adult_verdict: dict, age_band: AgeBand, ticker: str, lang: Lang = "en") -> dict:
    """Translate an adult NSI verdict into a kid-appropriate output.

    `lang` selects the output language: "en" (English, default — preserves
    existing behaviour) or "id" (Bahasa Indonesia). Caching keys upstream
    must include the language so EN and ID outputs don't clobber each
    other.
    """
    if age_band not in VALID_BANDS:
        raise ValueError(f"Invalid age_band '{age_band}', must be one of {VALID_BANDS}")
    if lang not in VALID_LANGS:
        lang = "en"

    system, user_text = _build_prompt(adult_verdict, age_band, lang)
    session_prefix = f"gal-{ticker}-{age_band}-{lang}"

    # One retry on a malformed/truncated response before falling back to the
    # generic "still learning" message. The kid-translation prompt asks for
    # a genuinely short JSON payload (one paragraph, 1-3 short cards, a
    # couple of one-liners) so a parse failure here is almost always a
    # transient cold/flaky LLM call rather than a token-budget problem —
    # the same class of intermittent failure diagnosed on the adult
    # pipeline (see services/yfinance_svc.py _with_retry for the analogous
    # fix on the data-fetch side). A single retry resolves the large
    # majority of these without making the user wait through two full
    # fallback-and-reload cycles.
    raw, meta = await _run_chat_in_thread(system, session_prefix, user_text)
    attempts = 1
    degraded = False
    try:
        out = await _parse_ai_json_async(raw)
    except Exception as e:
        log.warning(
            "GAL JSON parse failed for %s (age=%s, lang=%s), retrying once: %s",
            ticker, age_band, lang, e,
        )
        attempts = 2
        try:
            raw, meta = await _run_chat_in_thread(system, session_prefix + "-retry", user_text)
            out = await _parse_ai_json_async(raw)
        except Exception as e2:
            log.warning(
                "GAL JSON parse failed for %s (age=%s, lang=%s) on retry too: %s",
                ticker, age_band, lang, e2,
            )
            degraded = True
            meta = {"provider": None, "model": None}
            if lang == "id":
                out = {
                    "kid_headline": f"Kami masih belajar tentang {ticker}!",
                    "kid_explanation": (
                        "AI agak bingung menerjemahkan yang ini. Coba saham lain dari daftar — "
                        "atau kembali lagi beberapa menit lagi."
                    ),
                    "did_you_know": [],
                    "reflection_question": "Menurutmu kenapa AI kadang bisa bingung?",
                    "what_would_change_my_mind": "",
                    "confidence_plain_english": "Belum yakin — AI belum selesai berpikir.",
                    "emoji_mood": "🤔",
                    "_degraded": True,
                }
            else:
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

    out["_provider"] = meta.get("provider")
    out["_model"] = meta.get("model")
    out["_lang"] = lang
    # Cost accounting — every call counted (1 attempt = clean success,
    # 2 = needed the retry, degraded=True if even the retry's response
    # failed to parse and the fallback message was returned). The LLM
    # round-trip still happened and was still billed by OpenRouter even
    # when the final response is the degraded fallback, so this fires
    # on the failure path too, not just on clean success.
    await _record_gal_call(ticker, age_band, lang, attempts, degraded)
    return out
