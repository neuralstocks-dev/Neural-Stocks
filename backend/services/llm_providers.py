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
    Falls back from paid to cheaper paid to free to free-alt.
    """
    verdict = os.environ.get("LLM_MODEL_VERDICT", "deepseek/deepseek-v4-pro")
    fast = os.environ.get("LLM_MODEL_FAST", "deepseek/deepseek-v4-flash")
    free = os.environ.get("LLM_MODEL_FREE", "moonshotai/kimi-k2.6:free")
    free_alt = os.environ.get("LLM_MODEL_FREE_ALT", "nvidia/nemotron-3-super-120b-a12b:free")

    cascades = {
        "verdict": [verdict, fast, free, free_alt],
        "fast": [fast, free, free_alt],
        "free": [free, free_alt],
    }
    return cascades.get(task_type, cascades["fast"])


# Core call
def call_llm(
    prompt: str,
    task_type: str = "fast",
    json_mode: bool = False,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
) -> dict:
    """
    Call the LLM via OpenRouter with automatic fallback.

    Args:
        prompt: The user message / analysis prompt.
        task_type: "verdict" | "fast" | "free"
        json_mode: If True, instructs the model to return JSON only, AND
            validates the response is actually parseable JSON before
            treating the call as successful (see CHANGE LOG above).
        system_prompt: Override the default system prompt.
        max_tokens: Max tokens in the response (default 4096 - see
            CHANGE LOG above for why this was raised from 2048).

    Returns:
        {
            "content": str,        # Raw text / JSON string from the model
            "model_used": str,     # Which model actually responded
            "input_tokens": int,
            "output_tokens": int,
            "finish_reason": str,  # "stop" | "length" | other provider-specific value
        }

    Raises:
        RuntimeError if ALL models in the cascade fail (including models
        that returned malformed/truncated JSON when json_mode=True).
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

    last_error = None
    for model in models:
        try:
            logger.info(f"LLM call: {model} [task={task_type}]")
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=0.3,
                **extra_kwargs,
            )
            choice = response.choices[0]
            content = choice.message.content or ""
            finish_reason = getattr(choice, "finish_reason", None)
            usage = response.usage

            logger.info(
                f"LLM response: {model} | finish_reason={finish_reason} | "
                f"in={usage.prompt_tokens} out={usage.completion_tokens} tokens"
            )

            # A response truncated mid-generation can never be valid JSON
            # regardless of what the model actually produced. Treat this
            # as a soft failure so the cascade tries the next model,
            # instead of returning it as a "success" that will only fail
            # later, opaquely, inside the caller's JSON parser.
            if finish_reason == "length":
                logger.warning(
                    f"LLM truncated ({model}): hit max_tokens={max_tokens} "
                    f"before finishing - falling back to next model in cascade."
                )
                last_error = RuntimeError(
                    f"{model} response truncated at max_tokens={max_tokens} "
                    f"(finish_reason=length)"
                )
                continue

            # When JSON was explicitly requested, validate it here rather
            # than push that burden entirely onto the caller. A 200
            # response with malformed content used to be returned as a
            # "success" - the cascade never saw it and never got a chance
            # to try a better-behaved model.
            if json_mode:
                try:
                    json.loads(content)
                except json.JSONDecodeError as e:
                    logger.warning(
                        f"LLM returned invalid JSON ({model}): {e} - "
                        f"falling back to next model in cascade."
                    )
                    last_error = RuntimeError(
                        f"{model} returned invalid JSON: {e}"
                    )
                    continue

            logger.info(f"LLM success: {model}")
            return {
                "content": content,
                "model_used": model,
                "input_tokens": usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
                "finish_reason": finish_reason,
            }

        except Exception as exc:
            last_error = exc
            logger.warning(f"LLM failed ({model}): {exc}")
            continue

    logger.error("All LLM models failed.")
    raise RuntimeError(
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
