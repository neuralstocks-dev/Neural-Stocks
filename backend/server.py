"""Neural — AI Stock Analysis Platform — thin app bootstrap."""
import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core.db import client
from routers import auth, plans, stocks, watchlist, analysis, admin, scorecard, disclaimer, billing, portfolio, telegram, idx, trending, anon_try, experiments, backtest

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
api_router.include_router(disclaimer.router)
api_router.include_router(billing.router)
api_router.include_router(portfolio.router)
api_router.include_router(telegram.router)
api_router.include_router(idx.router)
api_router.include_router(trending.router)
api_router.include_router(anon_try.router)
api_router.include_router(experiments.router)
api_router.include_router(backtest.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def start_background_tasks():
    """Kick off long-running background coroutines that should run for the
    lifetime of the app. Each task is kept alive in `_BG_TASKS` so the GC
    doesn't drop it."""
    import asyncio
    from services.rf_retrain import weekly_retrain_loop
    from services.auto_scan import auto_scan_loop
    from services.weekly_digest import weekly_digest_loop
    t1 = asyncio.create_task(weekly_retrain_loop())
    _BG_TASKS.add(t1)
    t1.add_done_callback(_BG_TASKS.discard)
    logger.info("Started RF weekly retrain scheduler")
    t2 = asyncio.create_task(auto_scan_loop())
    _BG_TASKS.add(t2)
    t2.add_done_callback(_BG_TASKS.discard)
    logger.info("Started RF watchlist auto-scan scheduler")
    t3 = asyncio.create_task(weekly_digest_loop())
    _BG_TASKS.add(t3)
    t3.add_done_callback(_BG_TASKS.discard)
    logger.info("Started weekly RF digest scheduler")
    # Ensure TTL indexes (idempotent — no-op if already created).
    try:
        from routers.analysis import _ensure_analysis_indexes
        await _ensure_analysis_indexes()
    except Exception as e:
        logger.warning("Failed to ensure analysis_jobs TTL index: %s", e)


_BG_TASKS: set = set()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
