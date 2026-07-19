"""Scheduled screener agents — CRUD + manual trigger.

A user configures an "agent" (currently only `relative_strength_screener`)
that runs automatically on a schedule, delivers to Telegram, and shows
results in-app. See HANDOFF.md for the full spec. Gated to Pro/Elite/daypass,
capped at 1 *enabled* agent per user (HANDOFF.md decision #5 — an agent runs
forever regardless of whether the user ever looks at it, so this starts
conservative until there's real cost-per-agent-per-day data).
"""
from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.models import CreateAgentReq, UpdateAgentReq
from core.security import get_current_user, iso, now_utc
from services.quota import effective_plan_key
from services.scheduled_agents import run_agent_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

MAX_ENABLED_AGENTS = 1


def _require_pro(user: dict) -> str:
    plan = effective_plan_key(user)
    if plan not in ("pro", "elite", "daypass"):
        raise HTTPException(
            status_code=402,
            detail="Scheduled Agents is a Pro+ feature. Upgrade to automate your screens.",
        )
    return plan


async def _enforce_enabled_cap(user_id: str, excluding_id: str | None = None):
    query = {"user_id": user_id, "enabled": True}
    if excluding_id:
        query["id"] = {"$ne": excluding_id}
    count = await db.scheduled_agents.count_documents(query)
    if count >= MAX_ENABLED_AGENTS:
        raise HTTPException(
            status_code=402,
            detail=f"You can only have {MAX_ENABLED_AGENTS} active scheduled agent at a time. "
                   "Disable your existing agent before enabling another.",
        )


@router.post("")
async def create_agent(body: CreateAgentReq, user: dict = Depends(get_current_user)):
    _require_pro(user)
    await _enforce_enabled_cap(user["id"])
    doc = {
        "id": str(uuid4()),
        "user_id": user["id"],
        "agent_type": body.agent_type,
        "schedule": body.schedule.model_dump(),
        "deliver_telegram": body.deliver_telegram,
        "enabled": True,
        "last_fired_date": None,
        "last_run_at": None,
        "created_at": iso(now_utc()),
    }
    await db.scheduled_agents.insert_one(dict(doc))
    return doc


@router.get("")
async def list_agents(user: dict = Depends(get_current_user)):
    agents = await db.scheduled_agents.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {"agents": agents}


@router.patch("/{agent_id}")
async def update_agent(agent_id: str, body: UpdateAgentReq, user: dict = Depends(get_current_user)):
    update = {}
    if body.schedule is not None:
        update["schedule"] = body.schedule.model_dump()
    if body.deliver_telegram is not None:
        update["deliver_telegram"] = body.deliver_telegram
    if body.enabled is not None:
        if body.enabled:
            _require_pro(user)
            await _enforce_enabled_cap(user["id"], excluding_id=agent_id)
        update["enabled"] = body.enabled
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update.")

    res = await db.scheduled_agents.update_one(
        {"id": agent_id, "user_id": user["id"]}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found.")
    agent = await db.scheduled_agents.find_one({"id": agent_id, "user_id": user["id"]}, {"_id": 0})
    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, user: dict = Depends(get_current_user)):
    res = await db.scheduled_agents.delete_one({"id": agent_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return {"ok": True}


@router.get("/{agent_id}/runs")
async def list_agent_runs(agent_id: str, limit: int = 30, user: dict = Depends(get_current_user)):
    agent = await db.scheduled_agents.find_one({"id": agent_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    runs = await db.agent_runs.find(
        {"agent_id": agent_id, "user_id": user["id"]}, {"_id": 0}
    ).sort("run_at", -1).to_list(min(limit, 100))
    return {"runs": runs}


@router.post("/{agent_id}/run-now")
async def trigger_run_now(agent_id: str, user: dict = Depends(get_current_user)):
    _require_pro(user)
    agent = await db.scheduled_agents.find_one({"id": agent_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    run_doc = await run_agent_now(agent_id, user["id"])
    if run_doc is None:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return run_doc
