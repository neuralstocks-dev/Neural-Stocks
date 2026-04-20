"""Neural — AI Stock Analysis Platform — thin app bootstrap."""
import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core.db import client
from routers import auth, plans, stocks, watchlist, analysis, admin, scorecard

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Neural — AI Stock Analysis")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "neural-stock-analysis", "status": "ok"}


# Mount sub-routers under /api
api_router.include_router(auth.router)
api_router.include_router(plans.router)
api_router.include_router(stocks.router)
api_router.include_router(watchlist.router)
api_router.include_router(analysis.router)
api_router.include_router(admin.router)
api_router.include_router(scorecard.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
