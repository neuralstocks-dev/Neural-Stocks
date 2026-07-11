"""AI analysis service — wraps OpenRouter via openai-compatible client."""
import json
import re
import uuid
import logging
import asyncio
import time as _t
from fastapi import HTTPException
from services.llm_providers import call_llm

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
  "business_model_primer": string (1-2 sentences, plain English: what does this company actually do and how does it make money — written for someone who has never heard of it),
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
- EARNINGS PROXIMITY GATE: If the payload includes `market_context.next_earnings` and the earnings date is within 5 calendar days from today, you MUST: (1) cap `confidence_score` at 55 regardless of signal alignment, (2) add "Earnings release imminent — any technical or fundamental read is low-conviction until results are known" as the first item in `risk_factors`, (3) set `time_horizon_weeks` to 2 (shortest window). Pre-earnings technical setups have historically poor follow-through.
- TREND REGIME GATE: The payload `technical_indicators` now includes `trend_regime` ("bullish" | "bearish" | "mixed"), `pct_from_sma20`, and `pct_from_sma50`. Apply these rules:
  * REVERSAL PATTERNS IN DOWNTREND: If `trend_regime="bearish"` (price < SMA20 < SMA50), bullish reversal patterns (Hammer, Bullish Engulfing, Morning Star, Inverted Hammer) are COUNTER-TREND and historically low-hit-rate. Cap their confidence contribution — do NOT let a single reversal pattern push `confidence_score` above 60 in a bearish regime. Always note the counter-trend risk in `risk_factors`.
  * BREAKDOWN PATTERNS IN UPTREND: If `trend_regime="bullish"` (price > SMA20 > SMA50), bearish reversal patterns (Shooting Star, Bearish Engulfing, Evening Star) are COUNTER-TREND. Same cap applies — single pattern cannot push confidence above 60 against the trend.
  * TREND CONFIRMATION: In a bullish regime, continuation patterns (Three White Soldiers, Bullish Harami after pullback to SMA20) carry HIGHER weight. In bearish regime, Three Black Crows, Dark Cloud Cover carry higher weight.
  * MIXED REGIME: No cap applies but note the conflicted MA structure in `reasoning`.
- Use the *actual* current price to place price_target and stop_loss realistically (typically ±5-25% range).
- TREND REGIME GATE: The payload `technical_indicators` now includes `trend_regime` ("bullish" | "bearish" | "mixed"), `pct_from_sma20`, and `pct_from_sma50`. Apply these rules:
  * REVERSAL PATTERNS IN DOWNTREND: If `trend_regime="bearish"` (price < SMA20 < SMA50), bullish reversal patterns (Hammer, Bullish Engulfing, Morning Star, Inverted Hammer) are COUNTER-TREND and historically low-hit-rate. Cap their confidence contribution — do NOT let a single reversal pattern push `confidence_score` above 60 in a bearish regime. Always note the counter-trend risk in `risk_factors`.
  * BREAKDOWN PATTERNS IN UPTREND: If `trend_regime="bullish"` (price > SMA20 > SMA50), bearish reversal patterns (Shooting Star, Bearish Engulfing, Evening Star) are COUNTER-TREND. Same cap applies — single pattern cannot push confidence above 60 against the trend.
  * TREND CONFIRMATION: In a bullish regime, continuation patterns (Three White Soldiers, Bullish Harami after pullback to SMA20) carry HIGHER weight. In bearish regime, Three Black Crows, Dark Cloud Cover carry higher weight.
  * MIXED REGIME: No cap applies but note the conflicted MA structure in `reasoning`.
- Never recommend penny-stock speculation without warning in risk_factors.
- This output is educational research. Avoid imperative language ("buy now", "sell immediately"). Use observational language ("price is trading below…", "the model classifies…", "an alternative read would be…").

INTRINSIC-VALUE ANCHOR — when the payload includes `intrinsic_value_anchor` and its `primary_anchor` is NOT "none":
- Treat the anchor as a deterministic VALUATION REFERENCE point computed from `bookValue` × method (Graham Number for asset-heavy sectors, 1-year Residual Income Model for earnings-power-heavy sectors). It is a yardstick, NOT a price target or forecast.
- In `fundamental_analysis`, briefly anchor the prose against it. Example phrasings: "Trading at a modest discount to the Graham fair-value anchor of $X (≈12% gap)", or "Current price sits at a deep premium to the RIM anchor of $X — fundamentals would need to materially improve to justify the multiple". Cite the actual `primary_estimate` and `premium_to_anchor_pct` from the payload.
- Use the `interpretation` field's bucket name in your prose (deep_discount / modest_discount / fair / modest_premium / deep_premium) — translate to plain English (e.g. "deep discount" → "well below the anchor").
- If `primary_applicability` is "low_fit_intangible_heavy" or "low_fit_unrepresentative_roe", caveat with one sentence noting the anchor method is structurally weaker for this sector (e.g. "book value undercounts intangibles for software businesses, so the Graham anchor is a loose lower bound, not a fair-value floor").
- NEVER frame the anchor as a buy/sell trigger. It is a reference number for valuation context.
- If `primary_anchor` is "none", omit anchor language entirely.
- `intrinsic_value_anchor.ev_multiples` now contains EV/EBITDA and EV/FCF multiples benchmarked against Damodaran sector medians (January 2026). When `ev_multiples.data_quality` is "full" or "partial": state the computed multiple, the sector benchmark, and the premium/discount percentage in `fundamental_analysis` prose (e.g. "Apple trades at 28x EV/EBITDA versus a Technology sector median of 24.5x — a 14% premium consistent with its margin profile"). When data_quality is "insufficient" or the sector is None/excluded (Financials), skip EV multiples entirely. Do NOT treat a premium or discount as a directional signal on its own — always contextualise against the company's growth rate and margin profile.
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
  "business_model_primer": string (1-2 sentences, plain English: what does this company actually do and how does it make money — written for someone who has never heard of it),
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
- VOLUME CONFIRMATION GATE: In `candlestick_findings`, each pattern now includes `vol_confirmed` (bool) and `vol_ratio` (float, session volume / 20-period avg). Patterns where `vol_confirmed=false` (vol_ratio < 0.8) are LOW-CONVICTION — list them in `rejected_patterns` with reason "low-volume unconfirmed" and do NOT use them to lift `confidence_score`. Only volume-confirmed patterns (vol_ratio >= 0.8) should drive the classification. A technically perfect pattern on thin volume has historically poor follow-through.
- EARNINGS PROXIMITY GATE: If the payload includes `market_context.next_earnings` and the earnings date is within 5 calendar days from today, you MUST: (1) cap `confidence_score` at 55 regardless of signal alignment, (2) add "Earnings release imminent — any technical or fundamental read is low-conviction until results are known" as the first item in `risk_factors`, (3) set `time_horizon_weeks` to 2 (shortest window). Pre-earnings technical setups have historically poor follow-through.
- \"stop_loss\" should be placed beyond the pattern invalidation level (e.g., below hammer low, above shooting star high) — describe it as \"invalidation level\" in prose.
- TREND REGIME GATE: The payload `technical_indicators` now includes `trend_regime` ("bullish" | "bearish" | "mixed"), `pct_from_sma20`, and `pct_from_sma50`. Apply these rules:
  * REVERSAL PATTERNS IN DOWNTREND: If `trend_regime="bearish"` (price < SMA20 < SMA50), bullish reversal patterns (Hammer, Bullish Engulfing, Morning Star, Inverted Hammer) are COUNTER-TREND and historically low-hit-rate. Cap their confidence contribution — do NOT let a single reversal pattern push `confidence_score` above 60 in a bearish regime. Always note the counter-trend risk in `risk_factors`.
  * BREAKDOWN PATTERNS IN UPTREND: If `trend_regime="bullish"` (price > SMA20 > SMA50), bearish reversal patterns (Shooting Star, Bearish Engulfing, Evening Star) are COUNTER-TREND. Same cap applies — single pattern cannot push confidence above 60 against the trend.
  * TREND CONFIRMATION: In a bullish regime, continuation patterns (Three White Soldiers, Bullish Harami after pullback to SMA20) carry HIGHER weight. In bearish regime, Three Black Crows, Dark Cloud Cover carry higher weight.
  * MIXED REGIME: No cap applies but note the conflicted MA structure in `reasoning`.
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
  "business_model_primer": string (1-2 sentences, plain English: what does this company actually do and how does it make money — written for someone who has never heard of it),
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
  * When patterns WERE detected, at least one of primary_patterns or confirmation_patterns must be non-empty.
  * Only leave ALL THREE arrays empty if NO patterns at all were detected.
  * Name each entry with the PATTERN NAME first (e.g., "Doji · indecision, no bullish confirmation after 34% surge").

INTRINSIC-VALUE ANCHOR — when the payload includes `intrinsic_value_anchor` and its `primary_anchor` is NOT "none":
- Treat the anchor as a deterministic VALUATION REFERENCE point. It is a yardstick, NOT a price target or forecast.
- In `fundamental_analysis`, briefly anchor the prose against it (cite `primary_estimate` + `premium_to_anchor_pct` + `interpretation` bucket in plain English).
- In the integrated `reasoning`, note how the valuation anchor agrees or disagrees with the technicals + candlestick lens.
- If `primary_applicability` is "low_fit_intangible_heavy" or "low_fit_unrepresentative_roe", caveat with one sentence.
- NEVER frame the anchor as a buy/sell trigger.
- If `primary_anchor` is "none", omit anchor language entirely.
"""


# ---------- LLM call (OpenRouter) -------------------------------------------

async def _run_llm(system_prompt: str, user_text: str, session_prefix: str) -> tuple[str, dict]:
    """
    Run LLM call via OpenRouter in a thread (keeps asyncio loop free).
    Returns (raw_text, meta) where meta = {"provider": ..., "model": ...}.
    Raises RuntimeError if all models in the cascade fail.
    """
    def _sync():
        result = call_llm(
            prompt=user_text,
            task_type="verdict",
            json_mode=True,
            system_prompt=system_prompt,
            max_tokens=4096,
        )
        return result["content"], {
            "provider": "openrouter",
            "model": result["model_used"],
            "label": result["model_used"],
        }

    return await asyncio.to_thread(_sync)


def _parse_ai_json(raw) -> dict:
    """
    Robustly extract the first valid JSON object from an LLM response.
    Pass 1: direct json.loads on stripped string.
    Pass 2: strip markdown fences, try again.
    Pass 3: bracket-counter from first '{' — no greedy regex.
    Pass 4: single-quote swap + trailing-comma strip as last resort.
    Raises HTTPException(502) only if all four passes fail.
    """
    import logging
    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()

    # Pass 1: clean direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Pass 2: strip markdown fences
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Pass 3: bracket-counter — finds first complete {...} block
    start = text.find("{")
    if start != -1:
        depth = 0
        in_string = False
        escape_next = False
        for i, ch in enumerate(text[start:], start=start):
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break

    # Pass 4: last-resort quote swap + trailing comma strip
    try:
        if start != -1:
            end = text.rfind("}")
            candidate = text[start:end + 1] if end != -1 else text
        else:
            candidate = text
        candidate = candidate.replace("'", '"')
        candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        return json.loads(candidate)
    except (json.JSONDecodeError, Exception):
        pass

    logging.error(f"_parse_ai_json: all passes failed. raw[:500]={text[:500]!r}")
    raise HTTPException(status_code=502, detail="AI did not return valid JSON")


async def _parse_ai_json_async(raw) -> dict:
    return await asyncio.to_thread(_parse_ai_json, raw)


def _handle_llm_error(e: Exception):
    err_msg = str(e)
    err_lower = err_msg.lower()
    if "insufficient_credits" in err_lower or "insufficient credits" in err_lower:
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "llm_budget_exceeded",
                "message": "AI analysis temporarily unavailable — OpenRouter credits exhausted. Please top up at openrouter.ai/credits.",
            },
        )
    if any(code in err_lower for code in ("502", "503", "504", "bad gateway", "service unavailable")):
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "llm_upstream_unavailable",
                "message": "The AI provider is temporarily unavailable. Please try again in a minute.",
            },
        )
    raise HTTPException(status_code=502, detail=f"AI provider error: {err_msg[:200]}")


def _slim_bandarmology_for_prompt(bandar: dict | None) -> dict | None:
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
- The `bandarmology` field summarises corporate insider / director / commissioner / major-shareholder FILINGS from the IDX/KSEI feed. It is NOT real-time broker-summary flow.
- Filings typically lag the actual transaction by 5-30 days, so this is CONFIRMATORY background context — NOT a timing signal. Do not treat it as a price predictor.
- Use this hierarchy when interpreting:
  1. `volume_gate_tripped=true` → ignore or heavily discount the signal.
  2. `persistence_consistent=true` with `persistence_label` in {'persistent_accumulation','persistent_distribution'} → highest-quality signal.
  3. `impact_tier='material'` (≥1% of market cap) → filing size is large enough to shift the base rate. `notable` (0.25-1%) is moderately interesting. `cosmetic` (<0.25%) is mostly vesting/grant noise — do not cite.
  4. `foreign_net_shares` hits harder on LQ45 / blue-chip IDX names than mid/small caps.
- When you DO cite bandarmology, phrase it as background — NOT as a forecast.
- When `regime='no_signal'` or all persistence windows are None, omit bandarmology language entirely.
"""


async def run_ai_analysis(ticker: str, quote: dict, history: list, fundamentals: dict,
                          technicals: dict, candlestick_findings: dict | None = None,
                          mode: str = "standard", market_context: dict | None = None,
                          weekly_history: list | None = None,
                          intrinsic_anchor: dict | None = None,
                          bandarmology: dict | None = None) -> dict:
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
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

    if isinstance(intrinsic_anchor, dict) and intrinsic_anchor.get("primary_anchor") and intrinsic_anchor.get("primary_anchor") != "none":
        payload["intrinsic_value_anchor"] = {
            k: intrinsic_anchor.get(k) for k in (
                "primary_anchor", "primary_estimate", "primary_applicability",
                "current_price", "premium_to_anchor_pct", "interpretation",
                "sector", "market",
            ) if intrinsic_anchor.get(k) is not None
        }

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

    slim_bandar = _slim_bandarmology_for_prompt(bandarmology)
    if slim_bandar and slim_bandar.get("regime") and slim_bandar.get("regime") != "no_signal":
        payload["bandarmology"] = slim_bandar

    try:
        system_to_use = system_prompt + (_BANDARMOLOGY_PROMPT_BLOCK if "bandarmology" in payload else "")
        raw, llm_meta = await _run_llm(
            system_to_use,
            "Analyze this stock using the data below. Return ONLY valid JSON.\n\n" + json.dumps(payload, default=str),
            f"{prefix}-{ticker}",
        )
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)

    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    parsed["llm_provider"] = llm_meta["provider"]
    parsed["llm_model"] = llm_meta["model"]
    return parsed


async def run_candlestick_analysis(ticker: str, quote: dict, history: list,
                                   fundamentals: dict, technicals: dict,
                                   candlestick_findings: dict,
                                   intrinsic_anchor: dict | None = None,
                                   bandarmology: dict | None = None) -> dict:
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
        raw, llm_meta = await _run_llm(
            system_to_use,
            "Analyze this stock using the detected candlestick patterns plus price context. Return ONLY valid JSON.\n\n" + json.dumps(payload, default=str),
            f"candlestick-{ticker}",
        )
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)

    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    parsed["llm_provider"] = llm_meta["provider"]
    parsed["llm_model"] = llm_meta["model"]
    return parsed


# ---------- Timeline Analysis -----------------------------------------------
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
- VOLUME CONFIRMATION GATE: In `candlestick_findings`, each pattern now includes `vol_confirmed` (bool) and `vol_ratio` (float, session volume / 20-period avg). Patterns where `vol_confirmed=false` (vol_ratio < 0.8) are LOW-CONVICTION — list them in `rejected_patterns` with reason "low-volume unconfirmed" and do NOT use them to lift `confidence_score`. Only volume-confirmed patterns (vol_ratio >= 0.8) should drive the classification. A technically perfect pattern on thin volume has historically poor follow-through.
- EARNINGS PROXIMITY GATE: If the payload includes `market_context.next_earnings` and the earnings date is within 5 calendar days from today, you MUST: (1) cap `confidence_score` at 55 regardless of signal alignment, (2) add "Earnings release imminent — any technical or fundamental read is low-conviction until results are known" as the first item in `risk_factors`, (3) set `time_horizon_weeks` to 2 (shortest window). Pre-earnings technical setups have historically poor follow-through.
- Use specific numbers (PE, revenue growth, RSI, margins, debt ratios) — no hand-waving.
- Never recommend direct buy/sell actions. Language must be informational.
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
        raw, _llm_meta = await _run_llm(
            TIMELINE_SYSTEM_PROMPT,
            "Evaluate this stock's fit across short-, medium-, and long-term horizons. Return ONLY valid JSON.\n\n" + json.dumps(payload, default=str),
            f"timeline-{ticker}",
        )
    except HTTPException:
        raise
    except Exception as e:
        _handle_llm_error(e)

    parsed = await _parse_ai_json_async(raw)
    if parsed.get("recommended_timeline") not in ("short_term", "medium_term", "long_term"):
        raise HTTPException(status_code=502, detail="AI returned invalid timeline")
    return parsed


# ── Backwards-compatibility shim ─────────────────────────────────────────────
# services/gal.py and other modules import _run_chat_in_thread directly.
# This shim maps the old interface to the new OpenRouter-based _run_llm.
async def _run_chat_in_thread(system_prompt: str, session_prefix: str, user_text: str):
    """Shim: replaces the old Emergent/LiteLLM _run_chat_in_thread with OpenRouter."""
    return await _run_llm(system_prompt, user_text, session_prefix)
