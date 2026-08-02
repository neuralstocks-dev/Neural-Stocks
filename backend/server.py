"""Neural — AI Stock Analysis Platform — thin app bootstrap."""
import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core.db import client
from routers import auth, plans, stocks, watchlist, analysis, admin, scorecard, disclaimer, billing, portfolio, telegram, idx, trending, anon_try, experiments, backtest, alerts, telemetry, kids_preview, kids_auth, kids_portfolio, kids_journal, kids_consent, kids_parent, kids_billing, neutools, agents

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
api_router.include_router(alerts.router)
api_router.include_router(telemetry.router)
api_router.include_router(kids_preview.router)
api_router.include_router(kids_auth.router)
api_router.include_router(kids_portfolio.router)
api_router.include_router(kids_journal.router)
api_router.include_router(kids_consent.router)
api_router.include_router(kids_parent.router)
api_router.include_router(kids_billing.router)
api_router.include_router(neutools.router)
api_router.include_router(agents.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    # Bearer JWT only (no cookies) — `allow_credentials=True` is INVALID
    # alongside a wildcard `allow_origins=["*"]` per the CORS spec, and
    # browsers silently reject the response for cross-origin calls
    # (e.g. neulab.xyz → p1-builder.preview.emergentagent.com), killing
    # POSTs to /api/auth/google/session before they reach the backend.
    # We carry the auth token in the `Authorization` header which works
    # cleanly with wildcard CORS.
    allow_credentials=False,
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
    from services.digest_pusher import digest_pusher_loop
    from services.cost_reminder import cost_reminder_loop, tg_low_balance_loop
    from services.admin_digest import admin_digest_loop
    from services.verdict_resolution import verdict_resolution_loop
    # weekly_retrain_loop / auto_scan_loop / weekly_digest_loop DISABLED (2026-07-18):
    # the RF secondary opinion was retired after failing to beat a trivial baseline
    # on holdout data (rf_predictor.is_available() returns False unconditionally).
    # These three loops were still waking on a schedule (retrain weekly, auto-scan
    # every 4h, digest weekly) purely to discover the model is disabled and no-op --
    # real wasted compute for zero output. Left un-deleted as reference in case RF
    # is ever revisited with a model that actually clears the baseline.
    # t1 = asyncio.create_task(weekly_retrain_loop())
    # _BG_TASKS.add(t1)
    # t1.add_done_callback(_BG_TASKS.discard)
    # logger.info("Started RF weekly retrain scheduler")
    # t2 = asyncio.create_task(auto_scan_loop())
    # _BG_TASKS.add(t2)
    # t2.add_done_callback(_BG_TASKS.discard)
    # logger.info("Started RF watchlist auto-scan scheduler")
    # t3 = asyncio.create_task(weekly_digest_loop())
    # _BG_TASKS.add(t3)
    # t3.add_done_callback(_BG_TASKS.discard)
    # logger.info("Started weekly RF digest scheduler")
    t4 = asyncio.create_task(digest_pusher_loop())
    _BG_TASKS.add(t4)
    t4.add_done_callback(_BG_TASKS.discard)
    logger.info("Started Telegram digest pusher scheduler")
    # cost_reminder_loop / tg_low_balance_loop DISABLED (2026-07-18): both were
    # built to work around the Emergent platform not exposing a balance API
    # (see docstring in services/cost_reminder.py). OpenRouter is now the sole
    # LLM provider and DOES expose a real balance endpoint (GET /api/v1/credits)
    # -- the manual "anchor" workaround these loops implement is no longer needed.
    # Left un-deleted as reference for a future OpenRouter-native replacement.
    # t5 = asyncio.create_task(cost_reminder_loop())
    # _BG_TASKS.add(t5)
    # t5.add_done_callback(_BG_TASKS.discard)
    # logger.info("Started cost-anchor reminder scheduler")
    # t6 = asyncio.create_task(tg_low_balance_loop())
    # _BG_TASKS.add(t6)
    # t6.add_done_callback(_BG_TASKS.discard)
    # logger.info("Started Telegram low-balance alert scheduler")
    t7 = asyncio.create_task(admin_digest_loop())
    _BG_TASKS.add(t7)
    t7.add_done_callback(_BG_TASKS.discard)
    logger.info("Started admin ops nightly digest scheduler")
    t_resolve = asyncio.create_task(verdict_resolution_loop())
    _BG_TASKS.add(t_resolve)
    t_resolve.add_done_callback(_BG_TASKS.discard)
    logger.info("Started verdict resolution scheduler")
    from services.scheduled_agents import scheduled_agent_loop
    t_agents = asyncio.create_task(scheduled_agent_loop())
    _BG_TASKS.add(t_agents)
    t_agents.add_done_callback(_BG_TASKS.discard)
    logger.info("Started scheduled screener agents scheduler")
    # Ensure TTL indexes (idempotent — no-op if already created).
    try:
        from routers.analysis import _ensure_analysis_indexes
        await _ensure_analysis_indexes()
    except Exception as e:
        logger.warning("Failed to ensure analysis_jobs TTL index: %s", e)
    # Telemetry collection — secondary indexes for the wizard funnel
    # aggregation. Idempotent.
    try:
        from routers.telemetry import ensure_telemetry_indexes
        await ensure_telemetry_indexes()
    except Exception as e:
        logger.warning("Failed to ensure telemetry indexes: %s", e)
    # Start the queue-snapshot refresher so /api/analysis/queue/status
    # reads from cache (responsive even under loop saturation).
    try:
        import asyncio as _asyncio
        from routers.analysis import _queue_snapshot_loop
        _t = _asyncio.create_task(_queue_snapshot_loop())
        _BG_TASKS.add(_t)
        _t.add_done_callback(_BG_TASKS.discard)
        logger.info("Started analysis queue snapshot loop")
    except Exception as e:
        logger.warning("Failed to start queue snapshot loop: %s", e)
    # KidStocks — case-insensitive unique email constraint via collation
    # so signup correctly rejects "Alice@x.com" when "alice@x.com" exists.
    try:
        from core.db import db as _db
        await _db.kids_users.create_index("email", unique=True)
        await _db.kids_users.create_index("id", unique=True)
        await _db.kids_trades.create_index([("student_id", 1), ("created_at", -1)])
        await _db.kids_watchlist.create_index([("student_id", 1), ("ticker", 1)], unique=True)
        await _db.kids_parent_sessions.create_index("token", unique=True)
        await _db.kids_parent_sessions.create_index("parent_email")
        await _db.kids_parent_telegram.create_index("parent_email", unique=True)
        await _db.kids_parent_telegram_codes.create_index("code", unique=True)
        await _db.kids_subscriptions.create_index("parent_email", unique=True)
        await _db.kids_subscriptions.create_index("subscription_id")
        await _db.kids_analysis_log.create_index([("student_id", 1), ("created_at", 1)])
        logger.info("Ensured KidStocks indexes")
    except Exception as e:
        logger.warning("Failed to ensure KidStocks indexes: %s", e)

    # Scheduled screener agents.
    try:
        from core.db import db as _db2
        await _db2.scheduled_agents.create_index("user_id")
        await _db2.agent_runs.create_index([("agent_id", 1), ("run_at", -1)])
        await _db2.eps_estimate_snapshots.create_index([("symbol", 1), ("quarter_key", 1), ("snapshot_date", 1)], unique=True)
        logger.info("Ensured scheduled-agents indexes")
    except Exception as e:
        logger.warning("Failed to ensure scheduled-agents indexes: %s", e)

    # KidStocks — nightly Telegram digest for parents.
    try:
        from services.kids_parent_digest import digest_loop as kids_parent_digest_loop
        t8 = asyncio.create_task(kids_parent_digest_loop())
        _BG_TASKS.add(t8)
        t8.add_done_callback(_BG_TASKS.discard)
        logger.info("Started KidStocks parent Telegram digest scheduler")
    except Exception as e:
        logger.warning("Failed to start kids parent digest loop: %s", e)


_BG_TASKS: set = set()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
