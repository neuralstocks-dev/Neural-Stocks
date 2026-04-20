"""Plan catalog + quota + upgrade stub."""
from fastapi import APIRouter, Depends, HTTPException
from core.config import PLANS
from core.db import db
from core.models import UpgradeReq
from core.security import get_current_user
from services.quota import quota_snapshot
from services.pricing import plans_with_live_pricing

router = APIRouter(tags=["plans"])


@router.get("/plans")
async def list_plans():
    return await plans_with_live_pricing()


@router.get("/quota")
async def get_quota(user=Depends(get_current_user)):
    return await quota_snapshot(user)


@router.post("/plan/upgrade")
async def upgrade_plan(req: UpgradeReq, user=Depends(get_current_user)):
    """Demo/test upgrade path (no charge). Real paid upgrades go through /billing/activate.
    Only allowed for admins or for downgrades to free."""
    if req.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Unknown plan")
    # Block free->paid without payment unless admin
    if req.plan != "free" and not user.get("is_admin"):
        raise HTTPException(
            status_code=402,
            detail="Paid plans require PayPal checkout. Use the Subscribe button on the pricing page.",
        )
    await db.users.update_one({"id": user["id"]}, {"$set": {"plan": req.plan}})
    return {
        "ok": True,
        "plan": req.plan,
        "message": f"Switched to {PLANS[req.plan]['name']}",
    }
