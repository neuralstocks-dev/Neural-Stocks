"""AI analysis service — wraps Claude Sonnet 4.5 via emergentintegrations."""
import json
import re
import uuid
import logging
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core.config import EMERGENT_LLM_KEY

logger = logging.getLogger(__name__)

# ---------- Mode A: Standard ------------------------------------------------
STANDARD_SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI generating EDUCATIONAL RESEARCH — not investment advice. Given quantitative data for a single stock (price action, technical indicators, fundamental ratios), produce a disciplined, evidence-backed research summary intended to help a user review the data.

CRITICAL TONE — read carefully:
- Frame your output as a RESEARCH SUMMARY of what the model observes in the data, NOT as a trading instruction.
- The "recommendation" field is an internal classification code (BUY/SELL/HOLD); in your prose use phrases like "the model classifies this as bullish" / "analytical bias is bearish" / "weight of evidence supports a neutral reading", never "I recommend you buy" / "you should sell".
- The "confidence_score" reflects the model's classification strength based on the inputs — NOT the probability of price movement or investment success. Frame it that way in your prose.
- "price_target" and "stop_loss" are ILLUSTRATIVE SCENARIO LEVELS the user can monitor — refer to them as "illustrative bullish/bearish scenario level" or "invalidation / resistance zone" in your prose, never "your target" or "your stop".
- Always present at least one alternative interpretation in `reasoning` (e.g. "the same data could also support a more cautious read if X").
- Conclude `reasoning` with one sentence reminding the user this is research output, not personalized financial advice.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (illustrative directional scenario level over the time_horizon_weeks window, in same currency as price),
  "stop_loss": number (illustrative invalidation / opposing-resistance level),
  "executive_summary": string (2-3 sentence research summary in educational tone),
  "reasoning": string (200-500 words, cite specific numbers, present at least one alternative interpretation, end with the educational reminder),
  "technical_analysis": string (80-150 words on RSI, MA crossovers, momentum),
  "fundamental_analysis": string (80-150 words on valuation, growth, margins),
  "risk_factors": [3 to 5 short strings, each 1 sentence — frame as "risks to the current model interpretation", not "risks if you trade this"],
  "peer_comparison": string (1-2 sentences comparing to sector peers),
  "time_horizon_weeks": integer 4-12,
  "alternative_scenarios": {
    "bullish": string (2-3 sentences on what conditions would shift the model toward a bullish reading, citing specific levels/indicators),
    "bearish": string (2-3 sentences on what conditions would shift the model toward bearish, citing specific levels/indicators),
    "neutral": string (1-2 sentences on what would keep the model neutral / sideways)
  },
  "what_could_change_view": [3 to 5 short strings, each 1 sentence — concrete observable events or data shifts that would weaken the current model classification]
}

Rules:
- Be decisive in classification. Pick BUY/SELL/HOLD based on weight of evidence (these are internal codes the UI maps to "Bullish bias" / "Bearish bias" / "Neutral bias").
- Confidence >= 75 only when technicals AND fundamentals align.
- Use the *actual* current price to place price_target and stop_loss realistically (typically ±5-25% range).
- Never recommend penny-stock speculation without warning in risk_factors.
- This output is educational research. Avoid imperative language ("buy now", "sell immediately"). Use observational language ("price is trading below…", "the model classifies…", "an alternative read would be…").

INTRINSIC-VALUE ANCHOR — when the payload includes `intrinsic_value_anchor` and its `primary_anchor` is NOT "none":
- Treat the anchor as a deterministic VALUATION REFERENCE point computed from `bookValue` × method (Graham Number for asset-heavy sectors, 1-year Residual Income Model for earnings-power-heavy sectors). It is a yardstick, NOT a price target or forecast.
- In `fundamental_analysis`, briefly anchor the prose against it. Example phrasings: "Trading at a modest discount to the Graham fair-value anchor of $X (≈12% gap)", or "Current price sits at a deep premium to the RIM anchor of $X — fundamentals would need to materially improve to justify the multiple". Cite the actual `primary_estimate` and `premium_to_anchor_pct` from the payload.
- Use the `interpretation` field's bucket name in your prose (deep_discount / modest_discount / fair / modest_premium / deep_premium) — translate to plain English (e.g. "deep discount" → "well below the anchor").
- If `primary_applicability` is "low_fit_intangible_heavy" or "low_fit_unrepresentative_roe", caveat with one sentence noting the anchor method is structurally weaker for this sector (e.g. "book value undercounts intangibles for software businesses, so the Graham anchor is a loose lower bound, not a fair-value floor").
- NEVER frame the anchor as a buy/sell trigger. It is a reference number for valuation context.
- If `primary_anchor` is "none", omit anchor language entirely.
"""

# Backwards-compatibility alias
SYSTEM_PROMPT = STANDARD_SYSTEM_PROMPT


# ---------- Mode B: Candlestick-primary -------------------------------------
CANDLESTICK_SYSTEM_PROMPT = """You are a disciplined technical analyst specializing in Japanese candlestick pattern strategy generating EDUCATIONAL RESEARCH — not investment advice. Given detected candlestick patterns (on daily and weekly timeframes) plus recent price data for a single stock, produce a candlestick-driven research summary.

CRITICAL TONE — read carefully:
- Frame your output as a RESEARCH SUMMARY of what the model observes, NOT a trading instruction.
- The "recommendation" field is an internal classification code (BUY/SELL/HOLD); in your prose use phrases like "patterns currently suggest a bullish analytical bias" / "the candlestick read is bearish" / "the pattern set is mixed", never "buy now" / "you should sell".
- "confidence_score" reflects the model's classification strength based on detected patterns — NOT the probability of price movement.
- "price_target" and "stop_loss" are ILLUSTRATIVE SCENARIO LEVELS — refer to them as "illustrative bullish/bearish scenario level" and "pattern invalidation level" in your prose.
- Always note that candlestick signals can fail (false positives) — present alternative reads.
- End `reasoning` with one sentence reminding the user this is research output, not personalized financial advice.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (illustrative directional scenario level over the horizon, in same currency as price),
  "stop_loss": number (illustrative pattern invalidation level),
  "executive_summary": string (2-3 sentence research summary grounded in the patterns detected, in educational tone),
  "reasoning": string (200-500 words explaining WHICH patterns drove the classification, on WHICH timeframe, why they matter, and one alternative interpretation. End with educational reminder.),
  "technical_analysis": string (80-150 words on candlestick structure + confirmation indicators like RSI / moving average position),
  "fundamental_analysis": string (60-120 words briefly acknowledging fundamental backdrop but noting this is primarily a price-action research read),
  "risk_factors": [3 to 5 short strings, each 1 sentence — at least 1 must cover the risk of patterns failing without volume/trend confirmation. Frame as "risks to the model interpretation".],
  "peer_comparison": string (1-2 sentences; candlestick analysis is single-security, so keep brief),
  "time_horizon_weeks": integer 2-8 (candlestick research typically shorter horizon),
  "candlestick_summary": {
    "primary_patterns": [array of pattern names that drove the classification],
    "confirmation_patterns": [array of pattern names that support the read],
    "rejected_patterns": [array of pattern names you chose to IGNORE, with brief why],
    "timeframe_used": "daily" | "weekly" | "both",
    "bias_alignment": string (1 sentence: do daily and weekly agree? if not, how did you resolve?)
  },
  "alternative_scenarios": {
    "bullish": string (2-3 sentences on what pattern/price conditions would shift the read bullish),
    "bearish": string (2-3 sentences on what conditions would shift the read bearish),
    "neutral": string (1-2 sentences on what would keep the read mixed/inconclusive)
  },
  "what_could_change_view": [3 to 5 short strings, each 1 sentence — concrete pattern or price events that would invalidate or strengthen the current read]
}

Candlestick rules:
- If NO patterns are detected, return HOLD with confidence <= 40 and state clearly "no actionable pattern on either timeframe — the model has limited basis to classify direction".
- Weight reversal patterns (Engulfing, Morning/Evening Star, Three Soldiers/Crows) higher than indecision patterns (Doji).
- A bullish pattern during a clear downtrend is stronger than in sideways action. Same for bearish in uptrend.
- If daily and weekly disagree, prefer the higher timeframe (weekly) for direction and use daily for timing.
- Confidence >= 75 only when at least one strong reversal pattern aligns with the prevailing or reversing trend on the chosen timeframe.
- "stop_loss" should be placed beyond the pattern invalidation level (e.g., below hammer low, above shooting star high) — describe it as "invalidation level" in prose.
- Never invent patterns that aren't in the supplied candlestick_findings. Only reason over what was detected.
- Educational tone throughout — observational, never imperative.

INTRINSIC-VALUE ANCHOR — when the payload includes `intrinsic_value_anchor` and its `primary_anchor` is NOT "none":
- Treat the anchor as a deterministic VALUATION REFERENCE point — useful CONTEXT for `fundamental_analysis` even though this mode is primarily price-action. It is a yardstick, NOT a price target.
- In `fundamental_analysis`, mention it in one short sentence — e.g. "Fundamentals are a secondary lens here; for context, price trades at a modest discount to the $X RIM anchor." Cite the actual `primary_estimate` and `interpretation`.
- If `primary_applicability` flags a low-fit (`low_fit_intangible_heavy` or `low_fit_unrepresentative_roe`), add a brief caveat.
- NEVER convert the anchor into a candlestick "target" — it is fundamental context, not a price-action level.
- If `primary_anchor` is "none", omit anchor language entirely.
"""


# ---------- Mode C: Hybrid (AI + Candlestick) -------------------------------
HYBRID_SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI generating EDUCATIONAL RESEARCH — not investment advice. You synthesize THREE sources of signal: technical indicators, fundamentals, AND candlestick patterns. Given all three, produce a research summary where candlestick patterns act as timing and confirmation context.

CRITICAL TONE — read carefully:
- Frame your output as a RESEARCH SUMMARY of what the model observes across all three lenses, NOT as a trading instruction.
- The "recommendation" field is an internal classification code (BUY/SELL/HOLD); in your prose use phrases like "the model classifies this as bullish" / "analytical bias is bearish across the three lenses" / "the read is mixed/neutral", never "I recommend you buy" / "you should sell".
- "confidence_score" reflects the model's classification strength based on the inputs — NOT the probability of price movement or investment success.
- "price_target" and "stop_loss" are ILLUSTRATIVE SCENARIO LEVELS — refer to them as "illustrative bullish/bearish scenario level" and "invalidation level" in prose, never "your target" / "your stop".
- Always present at least one alternative interpretation in `reasoning` (e.g. "the same data could also support a more cautious read if X").
- End `reasoning` with one sentence reminding the user this is research output, not personalized financial advice.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (illustrative directional scenario level over the time_horizon_weeks window, in same currency as price),
  "stop_loss": number (illustrative invalidation / opposing-resistance level),
  "executive_summary": string (2-3 sentence research summary in educational tone — EXPLICITLY mention how candlestick patterns support or challenge the fundamental/technical picture),
  "reasoning": string (250-550 words integrating all three lenses, citing specific numbers and pattern names, presenting at least one alternative interpretation, and ending with the educational reminder),
  "technical_analysis": string (80-150 words on RSI, MA crossovers, momentum),
  "fundamental_analysis": string (80-150 words on valuation, growth, margins),
  "risk_factors": [3 to 5 short strings, each 1 sentence — frame as "risks to the current model interpretation", not "risks if you trade this"],
  "peer_comparison": string (1-2 sentences comparing to sector peers),
  "time_horizon_weeks": integer 4-12,
  "candlestick_summary": {
    "primary_patterns": [patterns used as a primary signal],
    "confirmation_patterns": [patterns used to confirm the fundamental/technical thesis],
    "rejected_patterns": [patterns whose signal was overridden by stronger fundamental/technical evidence, with brief why],
    "timeframe_used": "daily" | "weekly" | "both",
    "bias_alignment": string (1 sentence: how candlestick bias aligns with technical/fundamental classification)
  },
  "alternative_scenarios": {
    "bullish": string (2-3 sentences on what conditions across technicals/fundamentals/patterns would shift the read bullish, citing specific levels/indicators),
    "bearish": string (2-3 sentences on what conditions would shift the read bearish, citing specific levels/indicators),
    "neutral": string (1-2 sentences on what would keep the read mixed/sideways)
  },
  "what_could_change_view": [3 to 5 short strings, each 1 sentence — concrete observable events or data shifts that would weaken the current model classification]
}

Hybrid rules:
- The CLASSIFICATION must reflect the weight of evidence across all three lenses, not candlesticks alone.
- If candlestick bias CONFIRMS technicals/fundamentals → boost confidence (typically +10-15 points).
- If candlestick bias CONTRADICTS technicals/fundamentals → lower confidence and explain in reasoning which you trusted more and why.
- If NO candlestick patterns detected, note that explicitly and fall back to standard technical/fundamental weighting (confidence ceiling ~70 without pattern confirmation).
- "stop_loss" can still be informed by candlestick invalidation levels when patterns are present — describe it as "invalidation level" in prose.
- Confidence >= 85 only when ALL THREE lenses align.
- Educational tone throughout — observational, never imperative.
- candlestick_summary population rules:
  * When patterns WERE detected, at least one of primary_patterns or confirmation_patterns must be non-empty — classify the strongest detected pattern in one of those buckets even if its bias disagrees (a bearish pattern is a "primary signal" for a bearish classification; a bullish pattern detected during a bearish classification is a "rejected" signal, not an empty primary).
  * Only leave ALL THREE arrays empty if NO patterns at all were detected in the supplied candlestick_findings.
  * Name each entry with the PATTERN NAME first (e.g., "Doji · indecision, no bullish confirmation after 34% surge"), not an opaque description.

INTRINSIC-VALUE ANCHOR — when the payload includes `intrinsic_value_anchor` and its `primary_anchor` is NOT "none":
- Treat the anchor as a deterministic VALUATION REFERENCE point computed from `bookValue` × method (Graham Number for asset-heavy sectors, 1-year Residual Income Model otherwise). It is a yardstick, NOT a price target or forecast.
- In `fundamental_analysis`, briefly anchor the prose against it (cite `primary_estimate` + `premium_to_anchor_pct` + `interpretation` bucket in plain English).
- In the integrated `reasoning`, note how the valuation anchor agrees or disagrees with the technicals + candlestick lens (e.g. "Bullish candlestick reversal aligns with a deep-discount valuation read — three lenses converge", or "Bearish candlestick reversal but trading at a modest discount to the RIM anchor — partial divergence the user should weigh").
- If `primary_applicability` is "low_fit_intangible_heavy" or "low_fit_unrepresentative_roe", caveat with one sentence noting the method is structurally weaker for this sector.
- NEVER frame the anchor as a buy/sell trigger.
- If `primary_anchor` is "none", omit anchor language entirely.
"""


def _run_chat(system_prompt: str, session_prefix: str, user_text: str, *, provider: str, model: str):
    """Returns the coroutine for the LLM response.

    Note: `chat.send_message()` is technically async, but in practice the
    LiteLLM stack does enough blocking work (httpx connection pooling,
    streaming chunk parsing, retry logic) on the event loop that a single
    in-flight call still chokes other endpoints. We isolate each call
    inside its own thread + its own asyncio loop via `_run_chat_in_thread`
    so the main loop stays responsive for trivial requests like
    /queue/status. The trade-off is one OS thread per concurrent
    analysis, capped by the global ANALYSIS_CONCURRENCY semaphore (=4)
    so we never run more than 4 threads at once.

    `provider` / `model` come from `_LLM_FALLBACK_CHAIN` so the same call
    site can rotate to a different provider when the primary upstream
    socket-hangs on us.

    `with_params(timeout=...,  num_retries=0)` is critical:
      - `timeout` is forwarded to LiteLLM's underlying httpx client and
        forces an HTTP-layer deadline on the call. Without it, a socket
        hang against Anthropic ties up the call indefinitely (we observed
        184 s spent inside ONE attempt before the upstream gave up).
      - `num_retries=0` disables LiteLLM's INTERNAL retry loop. We need
        that off because (a) LiteLLM hammers the same provider on every
        retry, blowing our wall-clock budget on a known-bad upstream
        instead of letting us rotate, and (b) we run our own structured
        retry-then-rotate logic in `_run_chat_in_thread` which is the
        right level for cross-provider fallback decisions.
    """
    session_id = f"{session_prefix}-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_prompt)
        .with_model(provider, model)
        .with_params(timeout=_LLM_PER_ATTEMPT_TIMEOUT_S, num_retries=0)
    )
    return chat.send_message(UserMessage(text=user_text))


# Multi-provider fallback chain. Order matters: we try entries left-to-right.
# Each tuple is (provider, model, label_for_logs).
#
# Why fall back at all: the Universal Key proxy fronts Anthropic, Google,
# and OpenAI. When Anthropic socket-hangs (request stays open with no bytes
# until our budget expires), our previous "retry-on-502/503/504" loop did
# nothing — there was no error to catch, just silence. The fix: cap each
# attempt at `_LLM_PER_ATTEMPT_TIMEOUT_S`, then rotate to the next provider.
# Three providers × ~75 s/attempt = ~225 s worst-case, which fits inside
# the 240 s job budget with a small buffer.
#
# Why these specific models:
#   - Anthropic claude-sonnet-4-5 — primary; matches everything we've
#     calibrated reasoning, JSON output, and the published Score Card on.
#   - Gemini gemini-2.5-pro — playbook-recommended Google model, strong
#     JSON-mode adherence, independent of Anthropic infra.
#   - OpenAI gpt-5.1 — playbook-recommended OpenAI model, fully different
#     control plane so a Universal-Key-wide outage is unlikely to take all
#     three down simultaneously.
_LLM_FALLBACK_CHAIN = [
    ("anthropic", "claude-sonnet-4-5-20250929", "claude-sonnet-4-5"),
    ("gemini",    "gemini-2.5-pro",             "gemini-2.5-pro"),
    ("openai",    "gpt-5.1",                    "gpt-5.1"),
]
_LLM_PER_ATTEMPT_TIMEOUT_S = 75.0


async def _run_chat_in_thread(system_prompt: str, session_prefix: str, user_text: str):
    """Run the entire LLM round-trip in an OS thread so the main asyncio
    loop stays responsive. Each thread spins up a fresh asyncio loop just
    for that one call; LiteLLM's internal httpx + streaming work happens
    there instead of on the API process's main loop.

    Resilience layers, applied left-to-right:
      1. Inside-provider transient retry: 502 / 503 / 504 from
         LiteLLM/upstream → exponential backoff (2 s, 4 s) up to
         `_LLM_MAX_RETRIES` retries.
      2. Per-attempt timeout: each provider attempt is hard-capped at
         `_LLM_PER_ATTEMPT_TIMEOUT_S` seconds. If the upstream socket-hangs,
         we abort the attempt and rotate to the next provider — instead
         of consuming the entire 240 s job budget on a single dead call.
      3. Provider fallback chain (`_LLM_FALLBACK_CHAIN`): when one
         provider exhausts its retries OR times out, we try the next.
      4. Circuit breaker (services/llm_circuit_breaker.py): one level up,
         trips the global gate after several consecutive total failures
         so the user gets a fast-fail 503 rather than waiting through
         repeated retries when the upstream is genuinely down."""
    import asyncio as _asyncio

    def _sync_run():
        last_exc: Exception | None = None
        attempted_labels: list[str] = []
        for provider, model, label in _LLM_FALLBACK_CHAIN:
            attempted_labels.append(label)
            for attempt in range(_LLM_MAX_RETRIES + 1):
                try:
                    return _asyncio.run(
                        _asyncio.wait_for(
                            _run_chat(
                                system_prompt,
                                f"{session_prefix}-{label}",
                                user_text,
                                provider=provider,
                                model=model,
                            ),
                            timeout=_LLM_PER_ATTEMPT_TIMEOUT_S,
                        )
                    )
                except _asyncio.TimeoutError as te:
                    # Per-attempt budget blew. Don't keep retrying THIS
                    # provider — rotate to the next one. Socket hangs
                    # almost never resolve on a same-provider retry.
                    last_exc = te
                    logger.warning(
                        "LLM per-attempt timeout (%ss) on provider=%s model=%s for %s — rotating to next provider",
                        int(_LLM_PER_ATTEMPT_TIMEOUT_S), provider, model, session_prefix,
                    )
                    break
                except Exception as e:
                    last_exc = e
                    if not _is_transient_gateway_error(e):
                        # Hard error (auth, billing, model-not-found,
                        # validation): don't retry, don't fall back —
                        # bubble immediately so the caller can render a
                        # specific user message via _handle_llm_error.
                        raise
                    if attempt >= _LLM_MAX_RETRIES:
                        # This provider is wedged on transient errors —
                        # rotate to the next one instead of giving up.
                        logger.warning(
                            "LLM transient retries exhausted on provider=%s for %s — rotating to next provider",
                            provider, session_prefix,
                        )
                        break
                    # Exponential backoff: 2s, 4s. Total worst-case = 6s
                    # of waiting added to this provider's per-attempt window.
                    wait = _LLM_RETRY_BACKOFF_S * (2 ** attempt)
                    logger.warning(
                        "LLM transient %s on provider=%s for %s (attempt %d/%d) — retrying in %ds",
                        type(e).__name__, provider, session_prefix, attempt + 1, _LLM_MAX_RETRIES, wait,
                    )
                    _t.sleep(wait)
        # Every provider in the chain either timed out or exhausted its
        # retries. Surface the LAST exception we saw — the upstream layer
        # (record_outcome + _handle_llm_error) needs the original error
        # type so it can classify (timeout vs gateway vs other) correctly.
        logger.error(
            "LLM fallback chain exhausted for %s after trying %s — last_exc=%r",
            session_prefix, attempted_labels, last_exc,
        )
        raise last_exc  # noqa: F821

    return await _asyncio.to_thread(_sync_run)


_LLM_MAX_RETRIES = 2
_LLM_RETRY_BACKOFF_S = 2.0
_TRANSIENT_GATEWAY_MARKERS = (
    "BadGatewayError",       # litellm.BadGatewayError on Anthropic 502
    "ServiceUnavailableError",  # 503
    "GatewayTimeoutError",   # 504
    "InternalServerError",   # generic 500 — usually transient on the upstream
    "Error code: 502",
    "Error code: 503",
    "Error code: 504",
    "Error code: 500",
)


def _is_transient_gateway_error(e: Exception) -> bool:
    """Recognise LiteLLM/OpenAI/Anthropic gateway hiccups that warrant a
    retry. We pattern-match on the exception class name AND the str repr
    because LiteLLM doesn't always re-raise as its own typed class — it
    sometimes wraps the upstream OpenAI client error verbatim."""
    name = type(e).__name__
    msg = str(e)
    return any(marker in name or marker in msg for marker in _TRANSIENT_GATEWAY_MARKERS)


import time as _t  # used by the retry sleep above; aliased to avoid shadowing


def _parse_ai_json(raw) -> dict:
    text = raw if isinstance(raw, str) else str(raw)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise HTTPException(status_code=502, detail="AI did not return valid JSON")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI JSON parse error: {e}")


async def _parse_ai_json_async(raw) -> dict:
    """Off-loop variant of _parse_ai_json. Claude responses can be 100KB+
    and the regex+JSON parse blocks the asyncio event loop for ~50-200ms
    per response — multiplied by N concurrent analyses, this starves
    every other endpoint (incl. /api/analysis/queue/status). Running the
    parse inside a thread keeps the loop responsive for trivial requests.
    """
    import asyncio as _asyncio
    return await _asyncio.to_thread(_parse_ai_json, raw)


def _handle_llm_error(e: Exception):
    err_msg = str(e)
    if "Budget has been exceeded" in err_msg or "budget" in err_msg.lower():
        # 503 + structured detail. The `error_code` lets the frontend
        # render a richer banner (Top-up CTA + cost-economics popover)
        # instead of a generic red string. detail.message is kept as a
        # human-readable fallback for clients that don't read error_code.
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "llm_budget_exceeded",
                "message": "AI analysis temporarily unavailable — LLM budget exceeded. Please top up your Emergent Universal Key (Profile → Universal Key → Add Balance).",
            },
        )
    # Transient upstream gateway errors (502/503/504) — surface a clean,
    # user-actionable message instead of the verbose `litellm.BadGatewayError:
    # BadGatewayError: OpenAIException - Error code: 502` stack the SDK gives
    # us. These have already been retried `_LLM_MAX_RETRIES` times by
    # `_run_chat_in_thread`, so reaching here means the upstream is down for
    # at least 6+ seconds — worth fast-failing so the user can retry.
    if _is_transient_gateway_error(e):
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "llm_upstream_unavailable",
                "message": "The AI provider is temporarily unavailable (upstream gateway error). Please try again in a minute — if it persists, check the LLM Health panel in Admin.",
            },
        )
    raise HTTPException(status_code=502, detail=f"AI provider error: {err_msg[:200]}")


def _slim_bandarmology_for_prompt(bandar: dict | None) -> dict | None:
    """Produce a compact 8-field projection of the enriched bandarmology dict
    to send to the LLM. We send ONLY the decision-relevant fields (not raw
    filings) to keep prompt tokens minimal (~120-180 tokens vs ~2000 raw).

    IMPORTANT educational framing passed to Claude via the prompt block is
    in `_BANDARMOLOGY_PROMPT_BLOCK` below — the model must understand this
    is insider-filing lag data (T+5 to T+30 reporting), NOT real-time broker
    flow, and must NOT treat it as a price predictor.
    """
    if not isinstance(bandar, dict):
        return None
    return {
        "regime": bandar.get("regime"),
        "label": bandar.get("confidence_adjusted_label") or bandar.get("label"),
        "accumulation_ratio_all_time": bandar.get("accumulation_ratio"),
        "smart_money_accumulation": bandar.get("smart_money_accumulation"),
        "foreign_net_shares": bandar.get("foreign_net_shares"),
        "rel_volume_20d": bandar.get("rel_volume_20d"),
        "volume_gate_tripped": bandar.get("volume_gate_tripped"),
        "persistence_30d_ratio": (bandar.get("persistence_30d") or {}).get("ratio"),
        "persistence_90d_ratio": (bandar.get("persistence_90d") or {}).get("ratio"),
        "persistence_label": bandar.get("persistence_label"),
        "persistence_consistent": bandar.get("persistence_consistent"),
        "normalized_impact_pct": bandar.get("normalized_impact_pct"),
        "impact_tier": bandar.get("impact_tier"),
        "total_filings": bandar.get("total_movements"),
    }


_BANDARMOLOGY_PROMPT_BLOCK = """

IDX SMART-MONEY FLOW (Bandarmology) — insider filings only:
- The `bandarmology` field summarises corporate insider / director / commissioner / major-shareholder FILINGS from the IDX/KSEI feed. It is NOT real-time broker-summary flow (e.g. foreign broker code NG net-buy).
- Filings typically lag the actual transaction by 5-30 days, so this is CONFIRMATORY background context — NOT a timing signal. Do not treat it as a price predictor.
- Use this hierarchy when interpreting:
  1. `volume_gate_tripped=true` → ignore or heavily discount the signal. Illiquid tape makes directional flow not actionable.
  2. `persistence_consistent=true` with `persistence_label` in {'persistent_accumulation','persistent_distribution'} → highest-quality signal. Multi-window agreement is rare and meaningful.
  3. `impact_tier='material'` (≥1% of market cap) → the filing size is large enough to shift the base rate. `notable` (0.25-1%) is moderately interesting. `cosmetic` (<0.25%) is mostly vesting/grant noise — do not cite.
  4. `foreign_net_shares` hits harder on LQ45 / blue-chip IDX names than mid/small caps (custodian-leg noise on small caps).
- When you DO cite bandarmology in `fundamental_analysis` prose, phrase it as background (e.g. "Recent insider filings show persistent accumulation over 90 days (material impact, 1.4% of mcap) — consistent with the technical setup.") — NOT as a forecast.
- When `regime='no_signal'` or all the persistence windows are None, omit bandarmology language entirely.
"""


async def run_ai_analysis(ticker: str, quote: dict, history: list, fundamentals: dict,
                          technicals: dict, candlestick_findings: dict | None = None,
                          mode: str = "standard", market_context: dict | None = None,
                          weekly_history: list | None = None,
                          intrinsic_anchor: dict | None = None,
                          bandarmology: dict | None = None) -> dict:
    """Run AI analysis. If candlestick_findings is provided AND mode == 'hybrid',
    the hybrid prompt is used. Otherwise the standard prompt is used.

    History window (Apr 2026 — V2 cost revert):
      Reverted from V2's "60 daily + 26 weekly closes" to V1's "20 daily
      closes" to reduce per-verdict input tokens by ~2,500–3,200 (~0.8
      credits / ~$0.008). User-driven cost optimisation. The post-LLM
      calibration pipeline (earnings gate + RF disagreement penalty)
      remains in place — it adds zero tokens. Weekly-history fetching is
      retained server-side for hybrid/candlestick modes because the
      pattern scanner (`scan_daily_and_weekly`) needs it to detect
      weekly patterns — but the raw weekly closes are no longer sent
      to Claude in the prompt payload.
    """
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
        # 20 daily closes (~4 weeks) — V1 baseline. Recent technicals
        # like RSI / MACD / SMA already encode the longer-term context,
        # so we don't need raw weekly closes in the prompt.
        "recent_price_series_last_20_daily": [
            {"date": h["date"], "close": h["close"], "volume": h.get("volume")}
            for h in history[-20:]
        ],
    }
    if mode == "hybrid" and candlestick_findings:
        payload["candlestick_findings"] = candlestick_findings
        system_prompt = HYBRID_SYSTEM_PROMPT
        prefix = "hybrid"
    else:
        system_prompt = STANDARD_SYSTEM_PROMPT
        prefix = "analysis"

    # Intrinsic-value anchor (Graham + RIM). Only inject the SLIM payload —
    # `primary_anchor`, `primary_estimate`, `primary_applicability`,
    # `premium_to_anchor_pct`, `interpretation`, `sector`. Skip when the
    # anchor is not applicable to keep prompt tokens lean.
    if isinstance(intrinsic_anchor, dict) and intrinsic_anchor.get("primary_anchor") and intrinsic_anchor.get("primary_anchor") != "none":
        payload["intrinsic_value_anchor"] = {
            k: intrinsic_anchor.get(k) for k in (
                "primary_anchor", "primary_estimate", "primary_applicability",
                "current_price", "premium_to_anchor_pct", "interpretation",
                "sector", "market",
            ) if intrinsic_anchor.get(k) is not None
        }

    # Add market context (news headlines, analyst consensus, next earnings) if available
    if market_context and isinstance(market_context, dict) and market_context.get("configured"):
        mc_slim = {}
        news = market_context.get("news") or {}
        if news.get("articles"):
            mc_slim["recent_headlines"] = [
                {"headline": a.get("headline"), "sentiment": a.get("sentiment"), "source": a.get("source")}
                for a in news.get("articles", [])[:5]
            ]
            mc_slim["news_sentiment_summary"] = news.get("summary_sentiment")
            mc_slim["news_score"] = news.get("score")
        if market_context.get("analyst_consensus"):
            mc_slim["analyst_consensus"] = market_context["analyst_consensus"]
        if market_context.get("earnings"):
            mc_slim["next_earnings"] = market_context["earnings"]
        if mc_slim:
            payload["market_context"] = mc_slim

    # IDX bandarmology (insider filings) — only for .JK tickers when available.
    # Slim projection keeps prompt small; educational framing appended below.
    slim_bandar = _slim_bandarmology_for_prompt(bandarmology)
    if slim_bandar and slim_bandar.get("regime") and slim_bandar.get("regime") != "no_signal":
        payload["bandarmology"] = slim_bandar

    try:
        system_to_use = system_prompt + (_BANDARMOLOGY_PROMPT_BLOCK if "bandarmology" in payload else "")
        raw = await _run_chat_in_thread(system_to_use, f"{prefix}-{ticker}",
                              "Analyze this stock using the data below. Return ONLY valid JSON.\n\n"
                              + json.dumps(payload, default=str))
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)
    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    return parsed


async def run_candlestick_analysis(ticker: str, quote: dict, history: list,
                                   fundamentals: dict, technicals: dict,
                                   candlestick_findings: dict,
                                   intrinsic_anchor: dict | None = None,
                                   bandarmology: dict | None = None) -> dict:
    """Run pure candlestick-driven AI analysis (Mode B)."""
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals_brief": {
            k: fundamentals.get(k) for k in ("sector", "industry", "marketCap", "trailingPE") if k in fundamentals
        },
        "candlestick_findings": candlestick_findings,
        "recent_price_series_last_20": [
            {"date": h["date"], "close": h["close"], "open": h.get("open"),
             "high": h.get("high"), "low": h.get("low")} for h in history[-20:]
        ],
    }
    if isinstance(intrinsic_anchor, dict) and intrinsic_anchor.get("primary_anchor") and intrinsic_anchor.get("primary_anchor") != "none":
        payload["intrinsic_value_anchor"] = {
            k: intrinsic_anchor.get(k) for k in (
                "primary_anchor", "primary_estimate", "primary_applicability",
                "current_price", "premium_to_anchor_pct", "interpretation",
                "sector", "market",
            ) if intrinsic_anchor.get(k) is not None
        }
    slim_bandar = _slim_bandarmology_for_prompt(bandarmology)
    if slim_bandar and slim_bandar.get("regime") and slim_bandar.get("regime") != "no_signal":
        payload["bandarmology"] = slim_bandar
    try:
        system_to_use = CANDLESTICK_SYSTEM_PROMPT + (_BANDARMOLOGY_PROMPT_BLOCK if "bandarmology" in payload else "")
        raw = await _run_chat_in_thread(system_to_use, f"candlestick-{ticker}",
                              "Analyze this stock using the detected candlestick patterns plus price context. Return ONLY valid JSON.\n\n"
                              + json.dumps(payload, default=str))
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)
    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    return parsed


# ---------- Timeline Analysis (unchanged) -----------------------------------
TIMELINE_SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI. Given quantitative data for a single stock (price action, technical indicators, fundamental ratios), evaluate which investment horizon the stock is best suited for.

Horizon definitions:
- short_term: days to 3 months (focus: momentum, technicals, near-term catalysts, volatility)
- medium_term: 3 months to 2 years (focus: earnings trajectory, sector positioning, macro)
- long_term: 2+ years (focus: moat, fundamentals durability, balance sheet, growth runway)

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommended_timeline": "short_term" | "medium_term" | "long_term",
  "recommendation_label": string (human-readable, e.g. "Better for long term"),
  "confidence_score": integer 0-100,
  "summary": string (2-3 sentences — the thesis for why this timeline fits best),
  "explanation": string (150-300 words, cite specific numbers from the data),
  "strengths": [3 to 5 short strings — each 1 sentence, specific and data-backed],
  "risks": [3 to 5 short strings — each 1 sentence, specific and data-backed],
  "other_timelines": {
    "short_term": {"fit_score": integer 0-100, "note": string (1-2 sentences on why this horizon is more/less suitable)},
    "medium_term": {"fit_score": integer 0-100, "note": string},
    "long_term": {"fit_score": integer 0-100, "note": string}
  },
  "data_completeness_note": string (1 sentence flagging any missing fundamentals, else "Sufficient data for all three horizons.")
}

Rules:
- Pick the timeline with the highest fit_score as recommended_timeline. Fit scores must be consistent with the recommendation.
- Confidence >= 75 only when the best timeline materially outranks the other two.
- Use specific numbers (PE, revenue growth, RSI, margins, debt ratios) — no hand-waving.
- Never recommend direct buy/sell actions. Language must be informational (use phrases like "better suited for", "aligns with", "profile fits").
- If fundamentals are sparse, surface that in data_completeness_note and keep confidence <= 60.
"""


async def run_timeline_analysis(ticker: str, quote: dict, history: list, fundamentals: dict, technicals: dict) -> dict:
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
        "recent_price_series_last_30": [
            {"date": h["date"], "close": h["close"]} for h in history[-30:]
        ],
    }
    try:
        raw = await _run_chat_in_thread(TIMELINE_SYSTEM_PROMPT, f"timeline-{ticker}",
                              "Evaluate this stock's fit across short-, medium-, and long-term horizons. Return ONLY valid JSON.\n\n"
                              + json.dumps(payload, default=str))
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)
    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommended_timeline") not in ("short_term", "medium_term", "long_term"):
        raise HTTPException(status_code=502, detail="AI returned invalid timeline")
    return parsed
