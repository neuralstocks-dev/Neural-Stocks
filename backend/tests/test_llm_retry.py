"""Regression tests for the LLM retry + clean-error-mapping behaviour.

Scope:
  - `_is_transient_gateway_error()` recognises every form the upstream
    SDK can express a 502 / 503 / 504 in (typed exception class OR
    string-encoded SDK passthrough).
  - `_handle_llm_error()` maps transient gateway exceptions to a clean
    HTTP 503 with a structured `error_code: llm_upstream_unavailable`
    instead of leaking the verbose `litellm.BadGatewayError: ...` stack
    to the user.
  - `_run_chat_in_thread()` retries on transient errors and stops after
    `_LLM_MAX_RETRIES`.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from services import ai as ai_module
from services.ai import (
    _LLM_MAX_RETRIES,
    _handle_llm_error,
    _is_hard_error,
    _is_transient_gateway_error,
)


# ---------------------------------------------------------------------------
# _is_transient_gateway_error
# ---------------------------------------------------------------------------

class FakeBadGatewayError(Exception):
    """Mirrors the litellm.BadGatewayError class name without dragging in
    the actual library — `_is_transient_gateway_error` matches by class
    name, so this exercises the same code path."""


class FakeServiceUnavailableError(Exception):
    pass


class FakeGatewayTimeoutError(Exception):
    pass


def test_recognises_litellm_bad_gateway_by_class_name():
    e = FakeBadGatewayError("BadGatewayError: OpenAIException - Error code: 502")
    assert _is_transient_gateway_error(e) is True


def test_recognises_service_unavailable_by_class_name():
    assert _is_transient_gateway_error(FakeServiceUnavailableError("temporary")) is True


def test_recognises_gateway_timeout_by_class_name():
    assert _is_transient_gateway_error(FakeGatewayTimeoutError("timeout")) is True


def test_recognises_503_by_string_pattern():
    """Sometimes LiteLLM wraps the upstream error in a generic Exception
    with the HTTP code embedded in the message."""
    assert _is_transient_gateway_error(Exception("Error code: 503 service down")) is True


def test_recognises_502_by_string_pattern():
    assert _is_transient_gateway_error(Exception("Error code: 502 bad gateway")) is True


def test_does_not_match_4xx_errors():
    """4xx responses (rate-limit, auth, validation) are NOT transient
    upstream issues — they need user action and shouldn't be retried."""
    assert _is_transient_gateway_error(Exception("Error code: 401")) is False
    assert _is_transient_gateway_error(Exception("Error code: 429 rate limited")) is False
    assert _is_transient_gateway_error(Exception("Error code: 400 invalid prompt")) is False


def test_does_not_match_unrelated_errors():
    assert _is_transient_gateway_error(Exception("connection refused")) is False
    assert _is_transient_gateway_error(ValueError("bad payload")) is False


# ---------------------------------------------------------------------------
# _handle_llm_error mapping
# ---------------------------------------------------------------------------

def test_handle_llm_error_maps_502_to_clean_503_dict():
    """The user used to see a literal 'litellm.BadGatewayError: ...' string.
    Now they should get a structured 503 with a friendly message."""
    with pytest.raises(HTTPException) as exc_info:
        _handle_llm_error(FakeBadGatewayError("BadGatewayError: Error code: 502"))
    assert exc_info.value.status_code == 503
    assert isinstance(exc_info.value.detail, dict)
    assert exc_info.value.detail["error_code"] == "llm_upstream_unavailable"
    assert "temporarily unavailable" in exc_info.value.detail["message"]
    # The verbose litellm stack must NOT leak into the user message.
    assert "BadGatewayError" not in exc_info.value.detail["message"]
    assert "litellm" not in exc_info.value.detail["message"]


def test_handle_llm_error_keeps_budget_exceeded_path():
    """Pre-existing budget-exhausted handling stays intact."""
    with pytest.raises(HTTPException) as exc_info:
        _handle_llm_error(Exception("Budget has been exceeded"))
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["error_code"] == "llm_budget_exceeded"


def test_handle_llm_error_openai_proxy_cap_does_not_misclassify_as_universal_key_exhaustion():
    """REGRESSION: Emergent's LiteLLM proxy gates the OpenAI fallback
    provider with a sub-cent `Max budget: 0.001` per call. When our chain
    rotates to OpenAI it ALWAYS raises a BadRequestError whose message
    contains 'Budget has been exceeded! ... Max budget: 0.001' — which
    the old `"budget" in err_msg.lower()` heuristic classified as
    `llm_budget_exceeded` and triggered a misleading 'Top up Universal
    Key' banner for users with healthy 99+ credit balances.

    Now this specific signature MUST be classified as transient
    `llm_upstream_unavailable` so the user is told the truth (fallback
    tier capped, balance unaffected) instead of being misdirected to top
    up a Universal Key that has plenty of credit."""
    openai_proxy_cap_msg = (
        "litellm.BadRequestError: OpenAIException - Budget has been exceeded! "
        "Current cost: 0.023937, Max budget: 0.001"
    )
    with pytest.raises(HTTPException) as exc_info:
        _handle_llm_error(Exception(openai_proxy_cap_msg))
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["error_code"] == "llm_upstream_unavailable"
    # The message must NOT direct the user to top up their Universal Key.
    assert "top up" not in exc_info.value.detail["message"].lower()
    assert "your Universal Key balance is unaffected" in exc_info.value.detail["message"]


def test_handle_llm_error_chat_error_wrapping_openai_proxy_cap():
    """ChatError is the outermost wrapper from emergentintegrations — its
    `str(...)` contains 'Failed to generate chat completion: ...' followed
    by the inner litellm message. Verify the proxy-cap discriminator
    survives the wrapping (the inner 'Max budget: 0.001' substring is
    still present)."""
    chat_err_msg = (
        "Failed to generate chat completion: litellm.BadRequestError: "
        "OpenAIException - Budget has been exceeded! Current cost: 0.023937, "
        "Max budget: 0.001"
    )
    with pytest.raises(HTTPException) as exc_info:
        _handle_llm_error(Exception(chat_err_msg))
    assert exc_info.value.detail["error_code"] == "llm_upstream_unavailable"


# ---------------------------------------------------------------------------
# _is_hard_error — chain-rotation classifier
# ---------------------------------------------------------------------------

class FakeChatError(Exception):
    """Mirrors `emergentintegrations.llm.chat.ChatError` — the generic
    wrapper around any underlying LLM failure. Its message format is
    `Failed to generate chat completion: <inner>`."""


class FakeAuthenticationError(Exception):
    pass


class FakeBadRequestError(Exception):
    pass


def test_is_hard_error_chat_error_with_unknown_inner_is_NOT_hard():
    """REGRESSION: the previous classifier (`not _is_transient_gateway_error`)
    treated a `ChatError` whose inner message didn't literally contain
    'Error code: 502/503/504/500' as a HARD error → chain refused to
    rotate to Gemini. Production logs showed `hard error:ChatError` and
    only Anthropic attempts in the provider strip — Gemini never got a
    shot. The fix is to default to `transient` for unknown error types
    so the chain rotates by default."""
    e = FakeChatError("Failed to generate chat completion: some weird upstream blip")
    assert _is_hard_error(e) is False


def test_is_hard_error_authentication_error_is_hard():
    e = FakeAuthenticationError("AuthenticationError: invalid api key")
    assert _is_hard_error(e) is True


def test_is_hard_error_400_validation_is_hard():
    e = FakeBadRequestError("BadRequestError: Error code: 400 - invalid model parameter")
    assert _is_hard_error(e) is True


def test_is_hard_error_404_model_not_found_is_hard():
    e = Exception("Error code: 404 - model 'gpt-foo' not found")
    assert _is_hard_error(e) is True


def test_is_hard_error_openai_proxy_cap_is_NOT_hard_so_chain_rotates():
    """Even though the OpenAI proxy cap surfaces as a `BadRequestError`
    (which would normally be hard), the sub-cent budget signature is a
    fallback-tier limitation that should trigger chain rotation, NOT
    bubble immediately. Verify the special-case keeps that path open."""
    e = FakeBadRequestError(
        "litellm.BadRequestError: OpenAIException - Budget has been exceeded! "
        "Current cost: 0.023937, Max budget: 0.001"
    )
    assert _is_hard_error(e) is False


def test_is_hard_error_socket_hang_is_NOT_hard():
    """Socket hangs surface as plain `Exception` or `TimeoutError` —
    must rotate to next provider, not bubble."""
    e = Exception("Anthropic socket hang detected after 75s")
    assert _is_hard_error(e) is False
    e2 = TimeoutError("read timeout")
    assert _is_hard_error(e2) is False


def test_is_hard_error_bad_gateway_is_NOT_hard():
    """Gateway errors are textbook transient — must rotate."""
    e = FakeBadGatewayError("BadGatewayError: Error code: 502")
    assert _is_hard_error(e) is False


def test_handle_llm_error_falls_through_to_502_on_unknown():
    """Genuinely unknown errors still surface as a 502 so we don't hide
    novel issues behind a generic friendly message."""
    with pytest.raises(HTTPException) as exc_info:
        _handle_llm_error(ValueError("totally novel issue"))
    assert exc_info.value.status_code == 502
    assert "totally novel issue" in exc_info.value.detail


# ---------------------------------------------------------------------------
# _run_chat_in_thread retry loop
# ---------------------------------------------------------------------------

import asyncio


def test_run_chat_retries_on_transient_then_succeeds():
    """First two calls raise BadGatewayError, third returns clean. Should
    return the third result without raising."""
    call_count = {"n": 0}

    def fake_run_chat(*_args, **_kwargs):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            raise FakeBadGatewayError("BadGatewayError: Error code: 502")

        async def _resp():
            return "ok"
        return _resp()

    with patch.object(ai_module, "_run_chat", fake_run_chat), \
         patch.object(ai_module._t, "sleep", lambda _s: None):
        result = asyncio.run(ai_module._run_chat_in_thread("sys", "test", "msg"))

    assert result == "ok"
    assert call_count["n"] == 3  # 2 failures + 1 success


def test_run_chat_re_raises_after_max_retries_across_full_chain():
    """All retries fail with transient errors across EVERY provider in
    the fallback chain → final exception is raised (not retried
    infinitely). With the chain at 2 providers (Anthropic, Gemini) and
    `_LLM_MAX_RETRIES + 1 = 3` attempts each, total attempts = 6."""
    from services.ai import _LLM_FALLBACK_CHAIN
    call_count = {"n": 0}

    def fake_run_chat(*_args, **_kwargs):
        call_count["n"] += 1
        raise FakeBadGatewayError("BadGatewayError: persistent")

    with patch.object(ai_module, "_run_chat", fake_run_chat), \
         patch.object(ai_module._t, "sleep", lambda _s: None):
        with pytest.raises(FakeBadGatewayError):
            asyncio.run(ai_module._run_chat_in_thread("sys", "test", "msg"))

    expected = (_LLM_MAX_RETRIES + 1) * len(_LLM_FALLBACK_CHAIN)
    assert call_count["n"] == expected


class FakeAuthErrorForRetryTest(Exception):
    """Class name contains 'AuthenticationError' marker — the chain
    classifier MUST treat this as a hard error and bail immediately."""
    def __init__(self):
        super().__init__("AuthenticationError: invalid api key")


def test_run_chat_does_not_retry_on_hard_error():
    """A hard error (auth, validation, model-not-found) should NOT be
    retried OR rotated — bubble immediately so the caller can render a
    targeted user message. We use an AuthenticationError signature
    because that's a textbook hard error that CANNOT be fixed by either
    retrying the same provider or trying a different one."""
    call_count = {"n": 0}

    class _AuthErr(Exception):
        pass
    _AuthErr.__name__ = "AuthenticationError"

    def fake_run_chat(*_args, **_kwargs):
        call_count["n"] += 1
        raise _AuthErr("invalid api key")

    with patch.object(ai_module, "_run_chat", fake_run_chat), \
         patch.object(ai_module._t, "sleep", lambda _s: None):
        with pytest.raises(_AuthErr):
            asyncio.run(ai_module._run_chat_in_thread("sys", "test", "msg"))

    assert call_count["n"] == 1  # exactly one attempt, no retry, no rotation


def test_run_chat_chat_error_with_unknown_inner_rotates_through_chain():
    """REGRESSION: this is the exact production failure mode the user
    saw — the provider strip showed only Anthropic attempts because
    `ChatError` with an inner message that didn't match transient
    markers fell through the OLD `not _is_transient_gateway_error` check
    and bubbled immediately as a hard error. After the fix, the chain
    MUST rotate through both providers and only bubble after the LAST
    provider exhausts."""
    from services.ai import _LLM_FALLBACK_CHAIN

    class _ChatError(Exception):
        pass
    _ChatError.__name__ = "ChatError"  # mimic emergentintegrations

    call_count = {"n": 0}

    def fake_run_chat(*_args, **_kwargs):
        call_count["n"] += 1
        raise _ChatError(
            "Failed to generate chat completion: weird upstream blip"
        )

    with patch.object(ai_module, "_run_chat", fake_run_chat), \
         patch.object(ai_module._t, "sleep", lambda _s: None):
        with pytest.raises(_ChatError):
            asyncio.run(ai_module._run_chat_in_thread("sys", "test", "msg"))

    expected = (_LLM_MAX_RETRIES + 1) * len(_LLM_FALLBACK_CHAIN)
    assert call_count["n"] == expected, (
        f"ChatError must rotate across all providers; got {call_count['n']} "
        f"attempts, expected {expected}"
    )
