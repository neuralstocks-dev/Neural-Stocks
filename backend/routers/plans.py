"""Plan catalog + quota + upgrade stub."""
from fastapi import APIRouter, Depends, HTTPException
from core.config import PLANS
from core.db import db
from core.models import UpgradeReq
from core.security import get_current_user
from services.quota import quota_snapshot

router = APIRouter(tags=["plans"])


@router.get("/plans")
async def list_plans():
    return PLANS


@router.get("/quota")
async def get_quota(user=Depends(get_current_user)):
    return await quota_snapshot(user)


@router.post("/plan/upgrade")
async def upgrade_plan(req: UpgradeReq, user=Depends(get_current_user)):
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan")
    await db.users.update_one({"id": user["id"]}, {"$set": {"plan": req.plan}})
    return {
        "ok": True,
        "plan": req.plan,
        "message": f"Switched to {PLANS[req.plan]['name']} (demo · no charge)",
    }
