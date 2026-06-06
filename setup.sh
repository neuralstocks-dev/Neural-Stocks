#!/bin/bash

# ==============================================
# Neural-Stocks — Automated Setup
# MacBook Pro Edition | OpenRouter + Open-Source LLMs
# ==============================================

set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

echo ""
echo "=============================================="
echo "  Neural-Stocks — Automated Setup"
echo "=============================================="
echo ""

# Guard: must be run from Neural-Stocks root
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
  echo -e "${RED}ERROR: Run this script from the Neural-Stocks project root.${RESET}"
  echo -e "Expected: ${BOLD}cd ~/Documents/Neural-Stocks && bash setup.sh${RESET}"
  exit 1
fi

# ─── [1/6] backend/Procfile ────────────────────────────────────────────────
echo -e "${CYAN}[1/6] Creating backend/Procfile ...${RESET}"
cat > backend/Procfile <<'EOF'
web: uvicorn server:app --host 0.0.0.0 --port $PORT
EOF
echo -e "${GREEN}Done.${RESET}"

# ─── [2/6] backend/runtime.txt ─────────────────────────────────────────────
echo -e "${CYAN}[2/6] Creating backend/runtime.txt ...${RESET}"
cat > backend/runtime.txt <<'EOF'
python-3.11.9
EOF
echo -e "${GREEN}Done.${RESET}"

# ─── [3/6] backend/nixpacks.toml ───────────────────────────────────────────
echo -e "${CYAN}[3/6] Creating backend/nixpacks.toml ...${RESET}"
cat > backend/nixpacks.toml <<'EOF'
[phases.setup]
nixPkgs = ["python311", "gcc"]

[phases.install]
cmds = ["pip install -r requirements.txt"]

[start]
cmd = "uvicorn server:app --host 0.0.0.0 --port $PORT"
EOF
echo -e "${GREEN}Done.${RESET}"

# ─── [4/6] frontend/public/_redirects ──────────────────────────────────────
echo -e "${CYAN}[4/6] Creating frontend/public/_redirects ...${RESET}"
mkdir -p frontend/public
cat > frontend/public/_redirects <<'EOF'
/* /index.html 200
EOF
echo -e "${GREEN}Done.${RESET}"

# ─── [5/6] backend/services/llm_providers.py ───────────────────────────────
echo -e "${CYAN}[5/6] Creating backend/services/llm_providers.py ...${RESET}"
mkdir -p backend/services
cat > backend/services/llm_providers.py <<'EOF'
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
EOF
echo -e "${GREEN}Done.${RESET}"

# ─── [6/6] backend/requirements.txt — ensure openai is present ─────────────
echo -e "${CYAN}[6/6] Checking backend/requirements.txt for openai ...${RESET}"
REQS="backend/requirements.txt"

if [ ! -f "$REQS" ]; then
  echo "openai>=1.30.0" > "$REQS"
  echo -e "${GREEN}Created requirements.txt and added openai>=1.30.0.${RESET}"
elif grep -q "openai" "$REQS"; then
  echo -e "${YELLOW}openai already present in requirements.txt — skipped.${RESET}"
else
  echo "openai>=1.30.0" >> "$REQS"
  echo -e "${GREEN}Added openai>=1.30.0 to requirements.txt.${RESET}"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo -e "${GREEN}${BOLD}Setup complete! Files created:${RESET}"
echo "=============================================="
echo "  backend/Procfile"
echo "  backend/runtime.txt"
echo "  backend/nixpacks.toml"
echo "  frontend/public/_redirects"
echo "  backend/services/llm_providers.py"
echo "  backend/requirements.txt  (openai>=1.30.0 ensured)"
echo ""
echo -e "${CYAN}Next step:${RESET}"
echo "  git add ."
echo '  git commit -m "Add deployment config + OpenRouter LLM provider"'
echo "  git push -u origin main"
echo ""
