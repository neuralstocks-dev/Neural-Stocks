"""
Neural-Stocks LLM Provider - OpenRouter Gateway
Replaces the Emergent platform entirely.

Usage:
    from services.llm_providers import call_llm

    # Stock verdict (DeepSeek V4 Pro - high quality)
    result = call_llm(prompt, task_type="verdict", json_mode=True)
    verdict_text = result["content"]

    # Fast/cheap tasks: sentiment, digests, kids GAL
    result = call_llm(prompt, task_type="fast", json_mode=True)

    # Free fallback only
    result = call_llm(prompt, task_type="free")

Environment variables (set in Railway):
    OPENROUTER_API_KEY  - required, see Railway variables for the value
    LLM_MODEL_VERDICT   - default: deepseek/deepseek-v4-pro
    LLM_MODEL_FAST      - default: deepseek/deepseek-v4-flash
    LLM_MODEL_FREE      - default: moonshotai/kimi-k2.6:free
    LLM_MODEL_FREE_ALT  - default: nvidia/nemotron-3-super-120b-a12b:free

CHANGE LOG (this pass):
    Root cause investigated for intermittent "502: AI did not return valid
    JSON" on the /analysis endpoint. Two real gaps found in the original
    version of this file, both fixed below:

    1. The per-model try/except in call_llm() only caught exceptions from
       the API call itself (network, auth, rate-limit). A 200 response
       containing malformed or truncated JSON was NOT an exception, so it
       was returned as a "success" -- the cascade to the next model never
       triggered, and services/ai.py's regex-based _parse_ai_json() was
       the only thing standing between that and a 502. Fixed: json_mode
       responses are now validated with json.loads() before being treated
       as successful; a parse failure now correctly falls through to the
       next model in the cascade instead of silently succeeding.

    2. finish_reason was never read or logged, so there was no way to
       distinguish "model returned garbage" from "response was truncated
       because it hit max_tokens mid-JSON" -- a very plausible cause given
       the Hybrid prompt's schema (250-550 word reasoning field alone,
       plus 5+ other verbose fields, previously capped at max_tokens=2048
       total). Fixed: finish_reason is now logged on every call, and a
       finish_reason of "length" is treated as a soft failure that also
       triggers cascade fallback, since a truncated response can never be
       valid JSON regardless of which model produced it.

    max_tokens default raised from 2048 to 4096. NOTE: this is a reasoned
    estimate based on the schema's own stated word-count maximums, not a
    confirmed fix -- the finish_reason logging above is what will tell us,
    on the next occurrence, whether truncation was ever actually the
    cause. If logs show finish_reason="length" was never hit even at
    2048, this can be safely lowered again; if "length" was common, it
    may need to go higher still. Treat 4096 as a hypothesis, not a
    verified number.
"""

import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)


class OpenRouterExhaustedError(RuntimeError):
    """Raised when OpenRouter's own server-side model fallback (the
    `models` array) ran out of models to try, or the one manual
    JSON-validity retry after that also failed. Callers can catch this
    specifically to distinguish "every model failed" from an unrelated
    local exception — see routers/analysis.py's use of
    llm_circuit_breaker.REASON_OPENROUTER_ALL_MODELS_EXHAUSTED."""


# Client
_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "OPENROUTER_API_KEY is not set. "
                "Add it to Railway environment variables."
            )
        _client = OpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": os.environ.get("APP_URL", "https://neural-stocks.pages.dev"),
                "X-Title": "Neural-Stocks",
            },
        )
    return _client


# Model registry
def _model_cascade(task_type: str) -> list[str]:
    """
    Returns an ordered list of models to try for the given task type.
    Falls back from paid-premium to paid-cheap-diversified to free to free-alt.

    `fallback` (glm-4.7-flash by default) sits between the DeepSeek tier and
    the free tier: it's priced in the same range as LLM_MODEL_FAST (roughly
    $0.00000006/$0.0000004 per token vs deepseek-v4-flash's $0.0000001/
    $0.0000002) but served by a completely different backend (Zhipu AI, not
    DeepSeek) — so it protects against a DeepSeek-wide outage, not just a
    single model on that provider being slow. See services/llm_circuit_breaker.py
    for why that distinction matters: deepseek-v4-pro timing out repeatedly is
    exactly what's been tripping the breaker.
    """
    verdict = os.environ.get("LLM_MODEL_VERDICT", "deepseek/deepseek-v4-pro")
    fast = os.environ.get("LLM_MODEL_FAST", "deepseek/deepseek-v4-flash")
    fallback = os.environ.get("LLM_MODEL_FALLBACK", "z-ai/glm-4.7-flash")
    free = os.environ.get("LLM_MODEL_FREE", "moonshotai/kimi-k2.6")
    free_alt = os.environ.get("LLM_MODEL_FREE_ALT", "nvidia/nemotron-3-super-120b-a12b:free")

    cascades = {
        "verdict": [verdict, fast, fallback, free, free_alt],
        "fast": [fast, fallback, free, free_alt],
        "free": [free, free_alt],
    }
    return cascades.get(task_type, cascades["fast"])


def _extract_openrouter_error(exc: Exception) -> str:
    """Best-effort extraction of OpenRouter's actual error body from an
    openai-SDK exception. str(exc) alone is often just "Error code: 429"
    with no indication of which upstream provider failed or why (rate
    limit vs no-available-providers vs insufficient credits) — exactly
    the detail needed to distinguish a real outage from a misconfigured
    model id when reading logs."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return f"{err.get('code', '?')}: {err.get('message', str(exc))}"
        if err:
            return str(err)
    response = getattr(exc, "response", None)
    if response is not None:
        try:
            return f"HTTP {response.status_code}: {response.text[:300]}"
        except Exception:
            pass
    return str(exc)


# Core call
def call_llm(
    prompt: str,
    task_type: str = "fast",
    json_mode: bool = False,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
) -> dict:
    """
    Call the LLM via OpenRouter, using OpenRouter's own server-side model
    fallback (the `models` array in the request body — see
    https://openrouter.ai/docs/guides/routing/model-fallbacks) instead of a
    client-side retry loop. OpenRouter fails over across "any error"
    (context-length, moderation, rate-limiting, downtime) within a single
    request — faster, and catches more failure modes than our own
    try/except ever could. This directly addresses why deepseek-v4-pro
    timeouts were tripping the circuit breaker: a client-side loop can't
    fall back to model 2 until its OWN call to model 1 finishes timing out.

    What OpenRouter's fallback does NOT catch: a 200 response whose content
    is truncated (finish_reason="length") or isn't valid JSON when
    json_mode=True — that's a "successful" call from OpenRouter's point of
    view. We still validate for that locally and, if it happens, move on to
    the next chunk of the cascade.

    OpenRouter caps the `models` fallback array at 3 entries per request
    (confirmed live against the real API — not documented on their routing
    page). Cascades longer than that are split into chunks of <=3 and tried
    in order; a second HTTP call only happens if the first chunk is fully
    exhausted or every model in it returns unusable content, so this is
    still typically ONE call instead of the old client-side loop's up to 4.

    Args:
        prompt: The user message / analysis prompt.
        task_type: "verdict" | "fast" | "free"
        json_mode: If True, instructs the model to return JSON only, AND
            validates the response is actually parseable JSON before
            treating the call as successful.
        system_prompt: Override the default system prompt.
        max_tokens: Max tokens in the response.

    Returns:
        {
            "content": str,        # Raw text / JSON string from the model
            "model_used": str,     # Which model actually responded
            "input_tokens": int,
            "output_tokens": int,
            "finish_reason": str,  # "stop" | "length" | other provider-specific value
        }

    Raises:
        RuntimeError if OpenRouter's own fallback chain is exhausted, or
        the one manual JSON-validity retry also fails.
    """
    client = _get_client()
    models = _model_cascade(task_type)

    default_system = (
        "You are a professional stock market analyst. "
        "Provide accurate, concise analysis. "
        + ("Respond ONLY with valid JSON - no markdown, no prose." if json_mode else "")
    )
    messages = [
        {"role": "system", "content": system_prompt or default_system},
        {"role": "user", "content": prompt},
    ]

    extra_kwargs = {}
    if json_mode:
        extra_kwargs["response_format"] = {"type": "json_object"}

    def _attempt(candidate_models: list[str]):
        """One HTTP call using OpenRouter's native `models` fallback array.
        Returns (content, model_used, finish_reason, usage) — which may
        still be a soft JSON/truncation failure the caller must check —
        or raises if OpenRouter exhausts every model in the list."""
        logger.info(f"LLM call: {candidate_models} [task={task_type}]")
        response = client.chat.completions.create(
            model=candidate_models[0],
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.3,
            timeout=60.0,
            extra_body={"models": candidate_models},
            **extra_kwargs,
        )
        choice = response.choices[0]
        content = choice.message.content or ""
        finish_reason = getattr(choice, "finish_reason", None)
        model_used = getattr(response, "model", None) or candidate_models[0]
        usage = response.usage
        logger.info(
            f"LLM response: {model_used} | finish_reason={finish_reason} | "
            f"in={usage.prompt_tokens} out={usage.completion_tokens} tokens"
        )
        return content, model_used, finish_reason, usage

    def _validate(content: str, model_used: str, finish_reason) -> str | None:
        """Returns a diagnostic string if the response is unusable despite
        a successful transport, else None."""
        if finish_reason == "length":
            return f"{model_used} response truncated at max_tokens={max_tokens} (finish_reason=length)"
        if json_mode:
            try:
                json.loads(content)
            except json.JSONDecodeError as e:
                return f"{model_used} returned invalid JSON: {e}"
        return None

    # OpenRouter caps the `models` fallback array at 3 entries per request
    # (confirmed live — "'models' array must have 3 items or fewer", not
    # documented on the routing-fallbacks page). Cascades can run longer
    # than that (verdict has 5 tiers), so we chunk into groups of <=3 and
    # only issue a second HTTP call if the first chunk is fully exhausted —
    # still typically ONE call instead of the old loop's up to 4.
    chunks = [models[i:i + 3] for i in range(0, len(models), 3)]
    last_error = None
    for chunk in chunks:
        try:
            content, model_used, finish_reason, usage = _attempt(chunk)
        except Exception as exc:
            # OpenRouter's own fallback chain across this whole chunk was
            # exhausted server-side — move on to the next chunk, if any.
            last_error = _extract_openrouter_error(exc)
            logger.error(f"LLM call failed after OpenRouter fallback exhausted {chunk}: {last_error}")
            continue

        bad = _validate(content, model_used, finish_reason)
        if bad is None:
            logger.info(f"LLM success: {model_used}")
            return {
                "content": content,
                "model_used": model_used,
                "input_tokens": usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
                "finish_reason": finish_reason,
            }

        last_error = bad
        logger.warning(f"{bad} - trying next chunk of cascade.")

    logger.error("All LLM models failed.")
    raise OpenRouterExhaustedError(
        f"All LLM models failed. Last error: {last_error}\n"
        "Check OPENROUTER_API_KEY and model names in Railway variables."
    )


# Convenience wrappers (drop-in replacements for Emergent calls)
def analyze_stock(prompt: str) -> dict:
    """BUY/SELL/HOLD verdict - uses highest-quality model."""
    return call_llm(prompt, task_type="verdict", json_mode=True)


def analyze_sentiment(text: str) -> dict:
    """News sentiment analysis - uses fast/cheap model."""
    return call_llm(text, task_type="fast", json_mode=True)


def generate_digest(prompt: str) -> dict:
    """Weekly digest generation - uses fast model."""
    return call_llm(prompt, task_type="fast", json_mode=False)


def rewrite_for_kids(prompt: str) -> dict:
    """Kids GAL rewrite - uses fast model."""
    return call_llm(prompt, task_type="fast", json_mode=False)
