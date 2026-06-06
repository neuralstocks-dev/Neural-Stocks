"""
Neural-Stocks LLM Provider — OpenRouter Gateway
Replaces the Emergent platform entirely.

Usage:
    from services.llm_providers import call_llm

    # Stock verdict (DeepSeek V4 Pro — high quality)
    result = call_llm(prompt, task_type="verdict", json_mode=True)
    verdict_text = result["content"]

    # Fast/cheap tasks: sentiment, digests, kids GAL
    result = call_llm(prompt, task_type="fast", json_mode=True)

    # Free fallback only
    result = call_llm(prompt, task_type="free")

Environment variables (set in Railway):
    OPENROUTER_API_KEY      — required (sk-or-v1-...)
    LLM_MODEL_VERDICT       — default: deepseek/deepseek-v4-pro
    LLM_MODEL_FAST          — default: deepseek/deepseek-v4-flash
    LLM_MODEL_FREE          — default: moonshotai/kimi-k2.6:free
    LLM_MODEL_FREE_ALT      — default: nvidia/nemotron-3-super-120b-a12b:free
"""

import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

# ── Client ──────────────────────────────────────────────────────────────────
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


# ── Model registry ───────────────────────────────────────────────────────────
def _model_cascade(task_type: str) -> list[str]:
    """
    Returns an ordered list of models to try for the given task type.
    Falls back from paid → cheaper paid → free → free-alt.
    """
    verdict  = os.environ.get("LLM_MODEL_VERDICT",  "deepseek/deepseek-v4-pro")
    fast     = os.environ.get("LLM_MODEL_FAST",     "deepseek/deepseek-v4-flash")
    free     = os.environ.get("LLM_MODEL_FREE",     "moonshotai/kimi-k2.6:free")
    free_alt = os.environ.get("LLM_MODEL_FREE_ALT", "nvidia/nemotron-3-super-120b-a12b:free")

    cascades = {
        "verdict": [verdict, fast, free, free_alt],
        "fast":    [fast, free, free_alt],
        "free":    [free, free_alt],
    }
    return cascades.get(task_type, cascades["fast"])


# ── Core call ────────────────────────────────────────────────────────────────
def call_llm(
    prompt: str,
    task_type: str = "fast",
    json_mode: bool = False,
    system_prompt: str | None = None,
    max_tokens: int = 2048,
) -> dict:
    """
    Call the LLM via OpenRouter with automatic fallback.

    Args:
        prompt:        The user message / analysis prompt.
        task_type:     "verdict" | "fast" | "free"
        json_mode:     If True, instructs the model to return JSON only.
        system_prompt: Override the default system prompt.
        max_tokens:    Max tokens in the response (default 2048).

    Returns:
        {
            "content":    str,   # Raw text / JSON string from the model
            "model_used": str,   # Which model actually responded
            "input_tokens":  int,
            "output_tokens": int,
        }

    Raises:
        RuntimeError if ALL models in the cascade fail.
    """
    client = _get_client()
    models = _model_cascade(task_type)

    default_system = (
        "You are a professional stock market analyst. "
        "Provide accurate, concise analysis. "
        + ("Respond ONLY with valid JSON — no markdown, no prose." if json_mode else "")
    )
    messages = [
        {"role": "system", "content": system_prompt or default_system},
        {"role": "user",   "content": prompt},
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
            content = response.choices[0].message.content or ""
            usage   = response.usage

            logger.info(
                f"LLM success: {model} | "
                f"in={usage.prompt_tokens} out={usage.completion_tokens} tokens"
            )
            return {
                "content":       content,
                "model_used":    model,
                "input_tokens":  usage.prompt_tokens,
                "output_tokens": usage.completion_tokens,
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


# ── Convenience wrappers (drop-in replacements for Emergent calls) ────────────
def analyze_stock(prompt: str) -> dict:
    """BUY/SELL/HOLD verdict — uses highest-quality model."""
    return call_llm(prompt, task_type="verdict", json_mode=True)


def analyze_sentiment(text: str) -> dict:
    """News sentiment analysis — uses fast/cheap model."""
    return call_llm(text, task_type="fast", json_mode=True)


def generate_digest(prompt: str) -> dict:
    """Weekly digest generation — uses fast model."""
    return call_llm(prompt, task_type="fast", json_mode=False)


def rewrite_for_kids(prompt: str) -> dict:
    """Kids GAL rewrite — uses fast model."""
    return call_llm(prompt, task_type="fast", json_mode=False)
