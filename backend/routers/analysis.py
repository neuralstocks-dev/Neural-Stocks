"""Analysis + Alerts + Share Verdict + Public view."""
import asyncio
import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException

from core.db import db
from core.security import get_current_user, iso, now_utc
from services.yfinance_svc import get_quote, _yf_history_sync, _yf_fundamentals_sync, compute_technicals
from services.ai import run_ai_analysis, run_timeline_analysis
from services.quota import enforce_analysis_quota, plan_for, resolved_plan_for
from routers.disclaimer import require_accepted

router = APIRouter(tags=["analysis"])

# Per-task wall-clock cap for the quick/top|bottom batch. Since quick jobs
# now run in the background (fire-and-forget), this no longer competes with
# the ingress 60s budget. We run tickers sequentially inside the job to
# avoid saturating the single-worker event loop with concurrent LLM calls.
QUICK_PER_TASK_TIMEOUT = 90.0
QUICK_BATCH_SIZE = 3
# Strong references to outstanding bg tasks so the GC doesn't drop them
_BG_TASKS: set = set()


async def _maybe_create_alert(user_id: str, ticker: str, analysis: dict):
    rec = analysis.get("recommendation")
    conf = int(analysis.get("confidence_score", 0))
    if rec in ("BUY", "SELL") and conf >= 75:
        await db.alerts.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "ticker": ticker,
            "type": "signal",
            "signal": rec,
            "confidence_score": conf,
            "title": f"{rec} signal · {ticker}",
            "message": analysis.get("executive_summary", ""),
            "read": False,
            "created_at": iso(now_utc()),
        })


@router.post("/analysis/{ticker}")
async def create_analysis(ticker: str, user=Depends(get_current_user)):
    ticker = ticker.upper().strip()
    await require_accepted(user)
    await enforce_analysis_quota(user)
    quote_task = get_quote(ticker)
    hist_task = asyncio.to_thread(_yf_history_sync, ticker, "6mo", "1d")
    fund_task = asyncio.to_thread(_yf_fundamentals_sync, ticker)
    quote, history, fundamentals = await asyncio.gather(quote_task, hist_task, fund_task)
    if quote.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    technicals = compute_technicals(history)
    analysis = await run_ai_analysis(ticker, quote, history, fundamentals, technicals)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "created_at": iso(now_utc()),
        "price_at_analysis": quote.get("price"),
        "quote_snapshot": quote,
        "technicals": technicals,
        "fundamentals": fundamentals,
        **analysis,
    }
    await db.analyses.insert_one(doc)
    doc.pop("_id", None)
    await _maybe_create_alert(user["id"], ticker, analysis)
    return doc


@router.get("/analysis/{ticker}/latest")
async def latest_analysis(ticker: str, user=Depends(get_current_user)):
    doc = await db.analyses.find_one(
        {"user_id": user["id"], "ticker": ticker.upper()},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No analysis yet")
    return doc


@router.get("/analysis/{ticker}/history")
async def analysis_history(ticker: str, user=Depends(get_current_user)):
    return (
        await db.analyses.find({"user_id": user["id"], "ticker": ticker.upper()}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(20)
    )


# ---------- Timeline Recommendation (Pro/Elite) ----------
@router.post("/analysis/timeline/{ticker}")
async def timeline_recommendation(ticker: str, user=Depends(get_current_user)):
    """Evaluate a single watchlist stock across short/medium/long term horizons
    and recommend the best-fit timeline. Pro & Elite only."""
    ticker = ticker.upper().strip()
    await require_accepted(user)
    p = plan_for(user)
    if not p["quick_actions"]:  # same gate as other Pro/Elite AI features
        raise HTTPException(
            status_code=402,
            detail=f"Timeline Fit is a Pro/Elite feature. Upgrade from {p['name']} to unlock horizon recommendations.",
        )
    # Must be in watchlist
    in_wl = await db.watchlist.find_one({"user_id": user["id"], "ticker": ticker}, {"_id": 0})
    if not in_wl:
        raise HTTPException(status_code=400, detail=f"{ticker} is not in your watchlist. Add it first.")

    # 24h cache
    since = iso(now_utc() - timedelta(hours=24))
    cached = await db.timeline_recos.find_one(
        {"user_id": user["id"], "ticker": ticker, "created_at": {"$gte": since}},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if cached:
        return {**cached, "cached": True}

    # Enforce quota (counts toward analysis quota)
    await enforce_analysis_quota(user)

    quote_task = get_quote(ticker)
    hist_task = asyncio.to_thread(_yf_history_sync, ticker, "2y", "1d")
    fund_task = asyncio.to_thread(_yf_fundamentals_sync, ticker)
    quote, history, fundamentals = await asyncio.gather(quote_task, hist_task, fund_task)
    if quote.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    technicals = compute_technicals(history)
    reco = await run_timeline_analysis(ticker, quote, history, fundamentals, technicals)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "name": quote.get("name") or fundamentals.get("shortName") or fundamentals.get("longName"),
        "price_at_analysis": quote.get("price"),
        "currency": quote.get("currency"),
        "created_at": iso(now_utc()),
        **reco,
    }
    # Record as a regular analysis too so it counts toward quota
    await db.analyses.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "created_at": doc["created_at"],
        "price_at_analysis": quote.get("price"),
        "quote_snapshot": quote,
        "kind": "timeline",
        "recommendation": "HOLD",  # timeline reco is informational, not BUY/SELL
        "confidence_score": doc.get("confidence_score", 0),
        "executive_summary": doc.get("summary", "")[:500],
    })
    await db.timeline_recos.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "cached": False}


@router.get("/analysis/timeline/{ticker}/latest")
async def timeline_latest(ticker: str, user=Depends(get_current_user)):
    doc = await db.timeline_recos.find_one(
        {"user_id": user["id"], "ticker": ticker.upper()},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No timeline recommendation yet")
    return doc


@router.post("/analysis/quick/{kind}")
async def quick_analyze(kind: str, user=Depends(get_current_user)):
    """Fire-and-forget: kicks off a background quick-sweep and returns a job_id
    immediately. Client polls /api/analysis/quick/jobs/{job_id} for progress."""
    if kind not in ("top", "bottom"):
        raise HTTPException(status_code=400, detail="kind must be 'top' or 'bottom'")
    await require_accepted(user)
    p = plan_for(user)
    if not p["quick_actions"]:
        raise HTTPException(
            status_code=402,
            detail=f"Quick batch analysis is a Pro/Elite feature. Upgrade from {p['name']} to unlock Top/Bottom sweeps.",
        )
    if await db.watchlist.count_documents({"user_id": user["id"]}) == 0:
        raise HTTPException(status_code=400, detail="Watchlist is empty")

    job_id = str(uuid.uuid4())
    await db.quick_jobs.insert_one({
        "id": job_id,
        "user_id": user["id"],
        "kind": kind,
        "status": "running",
        "progress": {"completed": 0, "timed_out": 0, "errored": 0, "total": 0},
        "analyzed": [],
        "results": [],
        "started_at": iso(now_utc()),
        "finished_at": None,
    })
    task = asyncio.create_task(_run_quick_job(job_id, user, kind))
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return {"job_id": job_id, "status": "running", "kind": kind}


async def _run_quick_job(job_id: str, user: dict, kind: str):
    """Background worker — writes progress to db.quick_jobs as it executes."""
    try:
        items = await db.watchlist.find(
            {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
        ).to_list(50)
        tickers = [i["ticker"] for i in items]
        quotes = await asyncio.gather(*[get_quote(t) for t in tickers])
        ranked = sorted(
            zip(items, quotes),
            key=lambda iq: (iq[1].get("change_pct") or 0),
            reverse=(kind == "top"),
        )
        selected = [iq[0]["ticker"] for iq in ranked[:QUICK_BATCH_SIZE]]
        await db.quick_jobs.update_one(
            {"id": job_id},
            {"$set": {"analyzed": selected, "progress.total": len(selected)}},
        )

        # Sequential processing: keeps peak event-loop pressure at 1 LLM call
        # at a time. POST already returned fast; no point in racing here.
        results = []
        completed = 0
        timed_out = 0
        errored = 0
        for tk in selected:
            try:
                r = await asyncio.wait_for(
                    create_analysis(tk, user=user),
                    timeout=QUICK_PER_TASK_TIMEOUT,
                )
                results.append({
                    "ticker": r.get("ticker"),
                    "recommendation": r.get("recommendation"),
                    "confidence_score": r.get("confidence_score"),
                    "executive_summary": r.get("executive_summary"),
                    "price_target": r.get("price_target"),
                    "stop_loss": r.get("stop_loss"),
                    "analysis_id": r.get("id"),
                })
                completed += 1
            except asyncio.TimeoutError:
                timed_out += 1
                results.append({
                    "ticker": tk,
                    "status": "timeout",
                    "error": f"Exceeded {int(QUICK_PER_TASK_TIMEOUT)}s — run single-ticker Analyze to continue.",
                })
            except HTTPException as e:
                errored += 1
                detail = e.detail if isinstance(e.detail, str) else str(e.detail)
                results.append({"ticker": tk, "error": detail, "status_code": e.status_code})
            except Exception as e:
                errored += 1
                results.append({"ticker": tk, "error": str(e)[:200]})
            # Update DB after each ticker so clients polling see live progress
            await db.quick_jobs.update_one(
                {"id": job_id},
                {"$set": {
                    "results": results,
                    "progress": {
                        "completed": completed,
                        "timed_out": timed_out,
                        "errored": errored,
                        "total": len(selected),
                    },
                }},
            )
            # Yield briefly so other endpoints get scheduled between LLM calls
            await asyncio.sleep(0)

        await db.quick_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "done",
                "finished_at": iso(now_utc()),
            }},
        )
    except Exception as e:
        await db.quick_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "error": str(e)[:300],
                "finished_at": iso(now_utc()),
            }},
        )


@router.get("/analysis/quick/jobs/{job_id}")
async def quick_job_status(job_id: str, user=Depends(get_current_user)):
    job = await db.quick_jobs.find_one(
        {"id": job_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ---------- Alerts ----------
@router.get("/alerts")
async def list_alerts(user=Depends(get_current_user)):
    return (
        await db.alerts.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )


@router.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, user=Depends(get_current_user)):
    res = await db.alerts.update_one({"id": alert_id, "user_id": user["id"]}, {"$set": {"read": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@router.post("/alerts/read_all")
async def mark_all_alerts_read(user=Depends(get_current_user)):
    await db.alerts.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Share Verdict ----------
def _public_view(analysis: dict) -> dict:
    return {
        "ticker": analysis.get("ticker"),
        "created_at": analysis.get("created_at"),
        "price_at_analysis": analysis.get("price_at_analysis"),
        "recommendation": analysis.get("recommendation"),
        "confidence_score": analysis.get("confidence_score"),
        "price_target": analysis.get("price_target"),
        "stop_loss": analysis.get("stop_loss"),
        "executive_summary": analysis.get("executive_summary"),
        "reasoning": analysis.get("reasoning"),
        "technical_analysis": analysis.get("technical_analysis"),
        "fundamental_analysis": analysis.get("fundamental_analysis"),
        "peer_comparison": analysis.get("peer_comparison"),
        "risk_factors": analysis.get("risk_factors") or [],
        "time_horizon_weeks": analysis.get("time_horizon_weeks"),
        "technicals": {k: v for k, v in (analysis.get("technicals") or {}).items()
                       if k in ("rsi_14", "sma_20", "sma_50", "macd")},
        "fundamentals": {k: v for k, v in (analysis.get("fundamentals") or {}).items()
                         if k in ("sector", "industry", "marketCap", "trailingPE", "shortName", "longName")},
        "quote_snapshot": {k: v for k, v in (analysis.get("quote_snapshot") or {}).items()
                           if k in ("name", "currency", "exchange")},
    }


@router.post("/analysis/{analysis_id}/share")
async def share_analysis(analysis_id: str, user=Depends(get_current_user)):
    p = await resolved_plan_for(user)
    if not p["share_verdicts"]:
        raise HTTPException(
            status_code=402,
            detail=f"Sharing verdicts is a Pro/Elite feature. Upgrade from {p['name']} to unlock public share links.",
        )
    # Daily rate limit by effective plan
    daily_limit = p.get("share_per_day")
    if daily_limit is not None:
        since = iso(now_utc() - timedelta(days=1))
        shares_today = await db.shared_verdicts.count_documents(
            {"owner_id": user["id"], "created_at": {"$gte": since}}
        )
        if shares_today >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Daily share limit reached ({daily_limit}/day on {p['name']} plan). Upgrade to unlock more shares.",
            )
    analysis = await db.analyses.find_one({"id": analysis_id, "user_id": user["id"]}, {"_id": 0})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    existing = await db.shared_verdicts.find_one({"analysis_id": analysis_id, "owner_id": user["id"]}, {"_id": 0})
    if existing:
        return {"share_id": existing["share_id"], "url_path": f"/v/{existing['share_id']}", "created_at": existing["created_at"]}
    share_id = uuid.uuid4().hex[:12]
    created_at = iso(now_utc())
    await db.shared_verdicts.insert_one({
        "share_id": share_id,
        "analysis_id": analysis_id,
        "owner_id": user["id"],
        "ticker": analysis["ticker"],
        "created_at": created_at,
    })
    return {"share_id": share_id, "url_path": f"/v/{share_id}", "created_at": created_at}


@router.get("/public/verdict/{share_id}")
async def get_shared_verdict(share_id: str):
    share = await db.shared_verdicts.find_one({"share_id": share_id}, {"_id": 0})
    if not share:
        raise HTTPException(status_code=404, detail="Shared verdict not found")
    analysis = await db.analyses.find_one({"id": share["analysis_id"]}, {"_id": 0})
    if not analysis:
        raise HTTPException(status_code=404, detail="Underlying analysis no longer exists")
    owner = await db.users.find_one(
        {"id": share["owner_id"]},
        {"_id": 0, "password_hash": 0, "google_linked": 0, "plan": 0, "test_unlock_expires_at": 0},
    )
    return {
        "share_id": share_id,
        "shared_at": share["created_at"],
        "shared_by_name": owner.get("full_name") if owner else "A Neural user",
        "analysis": _public_view(analysis),
    }
