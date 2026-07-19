"""Background scheduler for user-configured screener agents. See
HANDOFF.md for the product spec and backend/routers/agents.py for the CRUD
API that manages `db.scheduled_agents` docs.

Loop pattern mirrors every other scheduler in this codebase (see
services/digest_pusher.py): wakes on a fixed interval, and idempotency is
enforced via a DB-persisted stamp (`last_fired_date`, a local calendar-date
string) rather than precise loop timing — a restart, a slow wake, or loop
drift can never cause two fires on the same local day. Due-ness uses "has
the scheduled time passed today, local to the agent's timezone, and have we
not already fired today" rather than exact-minute equality, since the loop
only wakes every LOOP_INTERVAL_S and would otherwise miss most schedules.
"""
import asyncio
import logging
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from core.db import db
from core.security import iso, now_utc
from services import relative_strength_screener
from services.quota import effective_plan_key
from services.telegram import send_alert_to_user

logger = logging.getLogger(__name__)

LOOP_INTERVAL_S = 5 * 60  # 5 min

SCREENERS = {
    "relative_strength_screener": relative_strength_screener.run_screen,
}


def _local_now(tz_name: str) -> datetime:
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except Exception:
        from datetime import timezone as _tz
        tz = _tz.utc
    return datetime.now(tz)


def _is_due(agent: dict, local_now: datetime) -> bool:
    schedule = agent.get("schedule") or {}
    days = schedule.get("days") or []
    time_str = schedule.get("time") or "09:00"
    day_abbrevs = {str(d).lower()[:3] for d in days}
    if local_now.strftime("%a").lower() not in day_abbrevs:
        return False
    if local_now.strftime("%H:%M") < time_str:
        return False  # scheduled time hasn't arrived yet today
    today_str = local_now.strftime("%Y-%m-%d")
    if agent.get("last_fired_date") == today_str:
        return False  # already fired today
    return True


def _format_telegram_summary(result: dict) -> tuple[str, str]:
    hits = result.get("hits") or []
    title = f"Scheduled screen · Relative Strength · {len(hits)} hit{'s' if len(hits) != 1 else ''}"
    if not hits:
        body = (
            "No tickers matched today's relative-strength criteria "
            f"({result.get('universe_size', 0)} tickers screened)."
        )
    else:
        lines = [
            f"• {h['ticker']} — {h['pct_from_ath']}% from ATH, {h['quarters_beat']}/4 qtrs beat, "
            f"mcap ${h['mcap'] / 1e9:.1f}B"
            for h in hits[:10]
        ]
        body = "\n".join(lines)
        if len(hits) > 10:
            body += f"\n…and {len(hits) - 10} more — open the app for the full list."
    if not result.get("guidance_proxy_available"):
        body += (
            "\n\n⚠️ Guidance-beat data was unavailable for this run — the "
            "earnings-quality criterion used EPS-beat-only as a fallback."
        )
    return title, body


async def _store_run(agent: dict, result: dict, triggered_by: str) -> dict:
    run_doc = {
        "id": str(uuid4()),
        "agent_id": agent["id"],
        "user_id": agent["user_id"],
        "run_at": iso(now_utc()),
        "hits": result.get("hits") or [],
        "universe_size": result.get("universe_size"),
        "guidance_proxy_available": result.get("guidance_proxy_available"),
        "status": "error" if result.get("error") else "ok",
        "error": result.get("error"),
        "triggered_by": triggered_by,
    }
    await db.agent_runs.insert_one(dict(run_doc))
    return run_doc


async def run_agent(agent: dict, triggered_by: str = "scheduled") -> dict:
    """Executes one agent's screener, stores the run, and (if enabled)
    pushes a Telegram summary. Returns the stored run doc."""
    screener_fn = SCREENERS.get(agent.get("agent_type"))
    if screener_fn is None:
        logger.warning("scheduled_agents: unknown agent_type %r", agent.get("agent_type"))
        result = {"hits": [], "universe_size": 0, "guidance_proxy_available": False, "error": "unknown_agent_type"}
    else:
        try:
            result = await screener_fn()
        except Exception as e:
            logger.warning("scheduled_agents: run failed for agent %s: %s", agent.get("id"), e)
            result = {"hits": [], "universe_size": 0, "guidance_proxy_available": False, "error": str(e)}

    run_doc = await _store_run(agent, result, triggered_by)

    update = {"last_run_at": iso(now_utc())}
    if triggered_by == "scheduled":
        tz_name = (agent.get("schedule") or {}).get("timezone") or "UTC"
        update["last_fired_date"] = _local_now(tz_name).strftime("%Y-%m-%d")
    await db.scheduled_agents.update_one({"id": agent["id"]}, {"$set": update})

    if agent.get("deliver_telegram", True) and not result.get("error"):
        try:
            title, body = _format_telegram_summary(result)
            await send_alert_to_user(agent["user_id"], title, body)
        except Exception as e:
            logger.warning("scheduled_agents: telegram push failed for agent %s: %s", agent.get("id"), e)

    return run_doc


async def run_agent_now(agent_id: str, user_id: str) -> dict | None:
    """Manual "Run now" trigger. Does NOT touch last_fired_date, so it never
    blocks that day's scheduled run."""
    agent = await db.scheduled_agents.find_one({"id": agent_id, "user_id": user_id}, {"_id": 0})
    if not agent:
        return None
    return await run_agent(agent, triggered_by="manual")


async def _owner_still_eligible(user_id: str) -> bool:
    """Re-checks the owning user's plan at fire time, not just at create
    time. A scheduled agent runs forever regardless of whether the user
    still pays for it (see HANDOFF.md decision #5's cost-control
    rationale) — without this, a downgraded user's agent would keep
    consuming yfinance/Finnhub calls indefinitely."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return False
    return effective_plan_key(user) in ("pro", "elite", "daypass")


async def _check_all_due() -> int:
    fired = 0
    agents = await db.scheduled_agents.find({"enabled": True}, {"_id": 0}).to_list(1000)
    for agent in agents:
        tz_name = (agent.get("schedule") or {}).get("timezone") or "UTC"
        local_now = _local_now(tz_name)
        if not _is_due(agent, local_now):
            continue
        if not await _owner_still_eligible(agent.get("user_id")):
            logger.info("scheduled_agents: skipping agent %s -- owner no longer Pro+", agent.get("id"))
            continue
        try:
            await run_agent(agent, triggered_by="scheduled")
            fired += 1
        except Exception as e:
            logger.warning("scheduled_agents: run_agent failed for %s: %s", agent.get("id"), e)
    return fired


async def scheduled_agent_loop():
    """Runs forever. Wakes every LOOP_INTERVAL_S and fires any enabled
    agent whose {days, time, timezone} is due and hasn't already run
    today."""
    await asyncio.sleep(120)  # let the app settle after boot
    while True:
        try:
            fired = await _check_all_due()
            if fired:
                logger.info("scheduled_agents: fired %d agent(s)", fired)
        except Exception as e:
            logger.warning("scheduled_agent_loop iteration failed: %s", e)
        await asyncio.sleep(LOOP_INTERVAL_S)
