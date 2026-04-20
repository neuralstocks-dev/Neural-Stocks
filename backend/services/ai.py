"""AI analysis service — wraps Claude Sonnet 4.5 via emergentintegrations."""
import json
import re
import uuid
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core.config import EMERGENT_LLM_KEY

SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI. Given quantitative data for a single stock (price action, technical indicators, fundamental ratios), produce a disciplined, evidence-backed analysis.

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


async def run_ai_analysis(ticker: str, quote: dict, history: list, fundamentals: dict, technicals: dict) -> dict:
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
        "recent_price_series_last_20": [
            {"date": h["date"], "close": h["close"]} for h in history[-20:]
        ],
    }
    session_id = f"analysis-{ticker}-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=SYSTEM_PROMPT)
        .with_model("anthropic", "claude-sonnet-4-5-20250929")
    )
    msg = UserMessage(
        text="Analyze this stock using the data below. Return ONLY valid JSON.\n\n" + json.dumps(payload, default=str)
    )
    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        err_msg = str(e)
        if "Budget has been exceeded" in err_msg or "budget" in err_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="AI analysis temporarily unavailable — LLM budget exceeded. Please top up your Emergent Universal Key (Profile → Universal Key → Add Balance).",
            )
        raise HTTPException(status_code=502, detail=f"AI provider error: {err_msg[:200]}")
    text = raw if isinstance(raw, str) else str(raw)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise HTTPException(status_code=502, detail="AI did not return valid JSON")
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI JSON parse error: {e}")
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    return parsed
