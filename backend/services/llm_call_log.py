"""General LLM call log — one row per call_llm() invocation (success OR
failure), with the model that actually answered and token counts.

Distinct from services/llm_circuit_breaker.py's `llm_events` collection,
which is scoped specifically to *failures* for circuit-breaker trip logic
and the credit-recoup escalation-email flow. This is a separate,
general-purpose log for cost/ops visibility — "which model answered, how
many tokens, how long" — that the LLM Health admin panel surfaces
alongside the failure breakdown.
"""
import logging
import time

logger = logging.getLogger(__name__)

_TTL_S = 7 * 24 * 60 * 60  # 7 days — matches llm_circuit_breaker's llm_events retention
_ttl_index_ensured = False


async def record_call(
    *,
    session: str,
    outcome: str,
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    finish_reason: str | None,
    elapsed_s: float | None,
    error: str | None = None,
) -> None:
    """Best-effort insert into db.llm_calls. Never raises — a logging
    failure must never take down the actual analysis request."""
    global _ttl_index_ensured
    try:
        from core.db import db
        if not _ttl_index_ensured:
            try:
                await db.llm_calls.create_index("ts", expireAfterSeconds=_TTL_S)
            except Exception:
                pass
            _ttl_index_ensured = True
        await db.llm_calls.insert_one({
            "ts": time.time(),
            "session": session,
            "outcome": outcome,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "finish_reason": finish_reason,
            "elapsed_s": round(elapsed_s, 2) if elapsed_s is not None else None,
            "error": (error or "")[:500] or None,
        })
    except Exception as e:
        logger.debug("llm_calls persist skipped: %s", e)


async def clear() -> int:
    """Delete every row. Returns the number deleted."""
    from core.db import db
    result = await db.llm_calls.delete_many({})
    return result.deleted_count
