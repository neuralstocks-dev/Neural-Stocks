"""AI analysis service — wraps Claude Sonnet 4.5 via emergentintegrations."""
import json
import re
import uuid
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core.config import EMERGENT_LLM_KEY

# ---------- Mode A: Standard ------------------------------------------------
STANDARD_SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI. Given quantitative data for a single stock (price action, technical indicators, fundamental ratios), produce a disciplined, evidence-backed analysis.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (12-week target in same currency as price),
  "stop_loss": number (suggested stop loss price),
  "executive_summary": string (2-3 sentence crisp thesis),
  "reasoning": string (200-500 words, cite specific numbers from the data),
  "technical_analysis": string (80-150 words on RSI, MA crossovers, momentum),
  "fundamental_analysis": string (80-150 words on valuation, growth, margins),
  "risk_factors": [3 to 5 short strings, each 1 sentence],
  "peer_comparison": string (1-2 sentences comparing to sector peers),
  "time_horizon_weeks": integer 4-12
}

Rules:
- Be decisive. Avoid "it depends" hedging. Pick BUY/SELL/HOLD based on weight of evidence.
- Confidence >= 75 only when technicals AND fundamentals align.
- Use the *actual* current price to place price_target and stop_loss realistically (typically ±5-25% range).
- Never recommend penny-stock speculation without warning in risk_factors.
- This is educational analysis, not a financial advice license.
"""

# Backwards-compatibility alias
SYSTEM_PROMPT = STANDARD_SYSTEM_PROMPT


# ---------- Mode B: Candlestick-primary -------------------------------------
CANDLESTICK_SYSTEM_PROMPT = """You are a disciplined technical analyst specializing in Japanese candlestick pattern strategy. Given detected candlestick patterns (on daily and weekly timeframes) plus recent price data for a single stock, produce a candlestick-driven verdict.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (12-week target in same currency as price),
  "stop_loss": number (suggested stop loss price),
  "executive_summary": string (2-3 sentence thesis grounded in the patterns detected),
  "reasoning": string (200-500 words explaining WHICH patterns drove the verdict, on WHICH timeframe, and why they matter in context),
  "technical_analysis": string (80-150 words on candlestick structure + confirmation indicators like RSI / moving average position),
  "fundamental_analysis": string (60-120 words briefly acknowledging fundamental backdrop but noting this is primarily a price-action strategy),
  "risk_factors": [3 to 5 short strings, each 1 sentence — at least 1 must cover the risk of patterns failing without volume/trend confirmation],
  "peer_comparison": string (1-2 sentences; candlestick analysis is single-security, so keep brief),
  "time_horizon_weeks": integer 2-8 (candlestick strategies typically shorter horizon),
  "candlestick_summary": {
    "primary_patterns": [array of pattern names that drove the verdict],
    "confirmation_patterns": [array of pattern names that support the verdict],
    "rejected_patterns": [array of pattern names you chose to IGNORE, with brief why],
    "timeframe_used": "daily" | "weekly" | "both",
    "bias_alignment": string (1 sentence: do daily and weekly agree? if not, how did you resolve?)
  }
}

Candlestick rules:
- If NO patterns are detected, return HOLD with confidence <= 40 and state clearly "no actionable pattern on either timeframe".
- Weight reversal patterns (Engulfing, Morning/Evening Star, Three Soldiers/Crows) higher than indecision patterns (Doji).
- A bullish pattern during a clear downtrend is stronger than in sideways action. Same for bearish in uptrend.
- If daily and weekly disagree, prefer the higher timeframe (weekly) for direction and use daily for timing.
- Confidence >= 75 only when at least one strong reversal pattern aligns with the prevailing or reversing trend on the chosen timeframe.
- Stop-loss should be placed beyond the pattern invalidation level (e.g., below hammer low, above shooting star high).
- Never invent patterns that aren't in the supplied candlestick_findings. Only reason over what was detected.
"""


# ---------- Mode C: Hybrid (AI + Candlestick) -------------------------------
HYBRID_SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI that synthesizes THREE sources of signal: technical indicators, fundamentals, AND candlestick patterns. Given all three, produce a decisive verdict where candlestick patterns act as timing and confirmation.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (12-week target in same currency as price),
  "stop_loss": number (suggested stop loss price),
  "executive_summary": string (2-3 sentence thesis — EXPLICITLY mention how candlestick patterns support or challenge the fundamental/technical picture),
  "reasoning": string (250-550 words that integrates all three lenses: technicals, fundamentals, candlestick. Cite specific numbers and pattern names),
  "technical_analysis": string (80-150 words on RSI, MA crossovers, momentum),
  "fundamental_analysis": string (80-150 words on valuation, growth, margins),
  "risk_factors": [3 to 5 short strings, each 1 sentence],
  "peer_comparison": string (1-2 sentences comparing to sector peers),
  "time_horizon_weeks": integer 4-12,
  "candlestick_summary": {
    "primary_patterns": [patterns used as a primary signal],
    "confirmation_patterns": [patterns used to confirm the fundamental/technical thesis],
    "rejected_patterns": [patterns whose signal was overridden by stronger fundamental/technical evidence, with brief why],
    "timeframe_used": "daily" | "weekly" | "both",
    "bias_alignment": string (1 sentence: how candlestick bias aligns with technical/fundamental verdict)
  }
}

Hybrid rules:
- The VERDICT must reflect the weight of evidence across all three lenses, not candlesticks alone.
- If candlestick bias CONFIRMS technicals/fundamentals → boost confidence (typically +10-15 points).
- If candlestick bias CONTRADICTS technicals/fundamentals → lower confidence and explain in reasoning which you trusted more and why.
- If NO candlestick patterns detected, note that explicitly and fall back to standard technical/fundamental weighting (confidence ceiling ~70 without pattern confirmation).
- Stop-loss can still be informed by candlestick invalidation levels when patterns are present.
- Confidence >= 85 only when ALL THREE lenses align.
- Be decisive. Avoid hedging.
- candlestick_summary population rules:
  * When patterns WERE detected, at least one of primary_patterns or confirmation_patterns must be non-empty — classify the strongest detected pattern in one of those buckets even if its bias disagrees (a bearish pattern is a "primary signal" for a SELL verdict; a bullish pattern detected during a SELL verdict is a "rejected" signal, not an empty primary).
  * Only leave ALL THREE arrays empty if NO patterns at all were detected in the supplied candlestick_findings.
  * Name each entry with the PATTERN NAME first (e.g., "Doji · indecision, no bullish confirmation after 34% surge"), not an opaque description.
"""


def _run_chat(system_prompt: str, session_prefix: str, user_text: str):
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
    """
    session_id = f"{session_prefix}-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_prompt)
        .with_model("anthropic", "claude-sonnet-4-5-20250929")
    )
    return chat.send_message(UserMessage(text=user_text))


async def _run_chat_in_thread(system_prompt: str, session_prefix: str, user_text: str):
    """Run the entire Claude round-trip in an OS thread so the main asyncio
    loop stays responsive. Each thread spins up a fresh asyncio loop just
    for that one call; LiteLLM's internal httpx + streaming work happens
    there instead of on the API process's main loop."""
    import asyncio as _asyncio

    def _sync_run():
        try:
            return _asyncio.run(_run_chat(system_prompt, session_prefix, user_text))
        except Exception as e:
            # Re-raise the original exception so callers see the same
            # error class they would have seen on the main loop.
            raise e

    return await _asyncio.to_thread(_sync_run)


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
        raise HTTPException(
            status_code=503,
            detail="AI analysis temporarily unavailable — LLM budget exceeded. Please top up your Emergent Universal Key (Profile → Universal Key → Add Balance).",
        )
    raise HTTPException(status_code=502, detail=f"AI provider error: {err_msg[:200]}")


async def run_ai_analysis(ticker: str, quote: dict, history: list, fundamentals: dict,
                          technicals: dict, candlestick_findings: dict | None = None,
                          mode: str = "standard", market_context: dict | None = None,
                          weekly_history: list | None = None) -> dict:
    """Run AI analysis. If candlestick_findings is provided AND mode == 'hybrid',
    the hybrid prompt is used. Otherwise the standard prompt is used.

    Verdict Accuracy v2 (Apr 2026):
      - History window expanded from 20 daily closes -> 60 daily + 26 weekly.
        More context lets the model spot multi-month trend regimes vs short
        noise. Net token cost: ~+120 tokens (~$0.0004 per verdict).
    """
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
        # 60 daily closes (~12 weeks) — captures swing structure, prior
        # support/resistance, recent earnings reaction, and trend health.
        "recent_price_series_last_60_daily": [
            {"date": h["date"], "close": h["close"], "volume": h.get("volume")}
            for h in history[-60:]
        ],
    }
    # 26 weekly closes (~6 months) — gives Claude the higher-timeframe regime
    # context. Especially valuable for hybrid/candlestick where weekly bias
    # should override conflicting daily signals.
    if weekly_history:
        payload["recent_price_series_last_26_weekly"] = [
            {"date": h["date"], "close": h["close"]}
            for h in weekly_history[-26:]
        ]
    if mode == "hybrid" and candlestick_findings:
        payload["candlestick_findings"] = candlestick_findings
        system_prompt = HYBRID_SYSTEM_PROMPT
        prefix = "hybrid"
    else:
        system_prompt = STANDARD_SYSTEM_PROMPT
        prefix = "analysis"

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

    try:
        raw = await _run_chat_in_thread(system_prompt, f"{prefix}-{ticker}",
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
                                   candlestick_findings: dict) -> dict:
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
    try:
        raw = await _run_chat_in_thread(CANDLESTICK_SYSTEM_PROMPT, f"candlestick-{ticker}",
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
