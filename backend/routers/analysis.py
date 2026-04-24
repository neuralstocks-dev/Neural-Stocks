"""Analysis + Alerts + Share Verdict + Public view."""
import asyncio
import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query

from core.db import db
from core.security import get_current_user, iso, now_utc
from services.yfinance_svc import get_quote, _yf_history_sync, _yf_fundamentals_sync, compute_technicals
from services.ai import run_ai_analysis, run_timeline_analysis, run_candlestick_analysis
from services.candlestick import scan_daily_and_weekly
from services.finnhub import get_market_context
from services.idx_news import get_market_context_idx, is_idx_ticker
from services import rf_predictor
from services.features import feature_row_for_today
import pandas as pd
from services.quota import enforce_analysis_quota, plan_for, resolved_plan_for
from routers.disclaimer import require_accepted

router = APIRouter(tags=["analysis"])

# Per-task wall-clock cap for the quick/top|bottom batch. Since quick jobs
# now run in the background (fire-and-forget), this no longer competes with
# the ingress 60s budget. We run tickers sequentially inside the job to
# avoid saturating the single-worker event loop with concurrent LLM calls.
QUICK_PER_TASK_TIMEOUT = 120.0
QUICK_BATCH_SIZE = 3
# Strong references to outstanding bg tasks so the GC doesn't drop them
_BG_TASKS: set = set()


async def _ensure_analysis_indexes():
    """Wipe completed/failed analysis jobs after 1 hour — they're transient
    scratchpads. Idempotent."""
    try:
        await db.analysis_jobs.create_index(
            "started_at_ts",
            expireAfterSeconds=3600,
        )
    except Exception:
        pass

# Supported analysis modes
ANALYSIS_MODES = {"standard", "candlestick", "hybrid"}


def _compute_confluence(candlestick_findings: dict, bandarmology: dict) -> dict | None:
    """Return a confluence signal when the two independent sources agree.

    Trigger rule (per user request — "flag when a bullish reversal pattern
    appears AND smart-money is accumulating"):
      * bullish confluence = ANY bullish pattern found + accumulation regime
      * bearish confluence = ANY bearish pattern found + distribution regime
      * divergence         = ANY pattern + opposite-direction regime
      * None               = no patterns or bandarmology regime is balanced
    """
    # Extract every pattern name from both daily + weekly tiers
    bullish_patterns: list[str] = []
    bearish_patterns: list[str] = []
    for tier in ("daily", "weekly"):
        tier_obj = (candlestick_findings or {}).get(tier) or {}
        for p in tier_obj.get("patterns") or []:
            bias = (p.get("bias") or "").lower()
            name = p.get("pattern") or "?"
            if bias == "bullish":
                bullish_patterns.append(name)
            elif bias == "bearish":
                bearish_patterns.append(name)

    if not bullish_patterns and not bearish_patterns:
        return None

    # De-dupe while preserving order
    def _dedupe(xs):
        seen = set()
        return [x for x in xs if not (x in seen or seen.add(x))]
    bullish_patterns = _dedupe(bullish_patterns)
    bearish_patterns = _dedupe(bearish_patterns)

    regime = bandarmology.get("regime") or ""
    bullish_regime = regime in ("strong_accumulation", "mild_accumulation")
    bearish_regime = regime in ("strong_distribution", "mild_distribution")

    # Bullish confluence — prefer this interpretation when signals mixed
    if bullish_patterns and bullish_regime:
        return {
            "direction": "bullish",
            "strength": "strong" if regime == "strong_accumulation" else "mild",
            "pattern_count": len(bullish_patterns),
            "patterns": bullish_patterns[:3],
            "bandarmology_regime": regime,
            "accumulation_ratio": bandarmology.get("accumulation_ratio"),
            "label": (
                "Double-confirmation: bullish reversal pattern + smart-money accumulation"
            ),
        }
    if bearish_patterns and bearish_regime:
        return {
            "direction": "bearish",
            "strength": "strong" if regime == "strong_distribution" else "mild",
            "pattern_count": len(bearish_patterns),
            "patterns": bearish_patterns[:3],
            "bandarmology_regime": regime,
            "accumulation_ratio": bandarmology.get("accumulation_ratio"),
            "label": (
                "Double-confirmation: bearish reversal pattern + smart-money distribution"
            ),
        }
    # Divergence (pattern vs insider flow pull in opposite directions)
    if bullish_patterns and bearish_regime:
        return {
            "direction": "divergence",
            "strength": "neutral",
            "pattern_count": len(bullish_patterns),
            "patterns": bullish_patterns[:3],
            "bandarmology_regime": regime,
            "accumulation_ratio": bandarmology.get("accumulation_ratio"),
            "label": "Signal divergence: bullish pattern vs smart-money distribution",
        }
    if bearish_patterns and bullish_regime:
        return {
            "direction": "divergence",
            "strength": "neutral",
            "pattern_count": len(bearish_patterns),
            "patterns": bearish_patterns[:3],
            "bandarmology_regime": regime,
            "accumulation_ratio": bandarmology.get("accumulation_ratio"),
            "label": "Signal divergence: bearish pattern vs smart-money accumulation",
        }
    return None


# --- Shared SPY/VIX snapshot for RF regime features ---------------------
# Small in-process cache so every verdict doesn't re-download the same
# market-wide series. ~2y daily history for SPY + VIX; refresh every 10 min.
_MARKET_CACHE: dict = {"payload": None, "fetched_at": None}
_MARKET_CACHE_TTL = timedelta(minutes=10)


def _fetch_rf_market_sync():
    """Download SPY + VIX (~2y, daily). Runs in a worker thread."""
    import yfinance as yf
    out: dict = {}
    for key, ticker in (("spy", "SPY"), ("vix", "^VIX")):
        try:
            df = yf.Ticker(ticker).history(period="2y", interval="1d", auto_adjust=True)
            if df is None or df.empty:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df = df[["Open", "High", "Low", "Close", "Volume"]] if "Volume" in df.columns else df[["Open", "High", "Low", "Close"]]
            out[key] = df
        except Exception:
            continue
    return out


async def _get_rf_market_snapshot() -> dict | None:
    """TTL-cached SPY + VIX snapshot used to compute RF regime features."""
    fetched_at = _MARKET_CACHE["fetched_at"]
    if fetched_at is not None and (now_utc() - fetched_at) < _MARKET_CACHE_TTL:
        return _MARKET_CACHE["payload"]
    try:
        payload = await asyncio.to_thread(_fetch_rf_market_sync)
        if payload:
            _MARKET_CACHE["payload"] = payload
            _MARKET_CACHE["fetched_at"] = now_utc()
            return payload
    except Exception:
        pass
    return _MARKET_CACHE.get("payload")  # stale is better than nothing


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
        # Fire-and-forget Telegram push (if linked)
        try:
            from services.telegram import send_alert_to_user
            target = analysis.get("price_target")
            target_line = f"\nTarget: ${target}" if target else ""
            mode = (analysis.get("mode") or "standard").capitalize()
            asyncio.create_task(send_alert_to_user(
                user_id,
                f"{rec} · {ticker} · {conf}%",
                f"{analysis.get('executive_summary', '')}{target_line}\n\nMode: {mode}",
                ticker=ticker,
            ))
        except Exception:
            pass


@router.post("/analysis/{ticker}/start")
async def start_analysis(
    ticker: str,
    mode: str = Query("standard", description="Analysis mode: standard | candlestick | hybrid"),
    user=Depends(get_current_user),
):
    """Kick off a single-ticker analysis in the background and return a
    job_id immediately so the client can poll for completion.

    Why: the full pipeline (RapidAPI IDX enrichment + yfinance + LLM) can
    exceed 30s for some tickers, and the production ingress caps streaming
    responses at ~30s → `POST /analysis/{ticker}` was returning 504 for
    slow IDX tickers like BRMS.JK. Polling avoids the wall-clock limit
    entirely. Mirrors the pattern used by `/analysis/quick/{kind}`.

    Quota, disclaimer, and mode checks run synchronously so the client
    gets an immediate 402/400 if they're over-quota. Only the expensive
    pipeline is deferred.
    """
    t = (ticker or "").upper().strip()
    if not t:
        raise HTTPException(status_code=400, detail="Ticker is required")
    await require_accepted(user)
    m = (mode or "standard").lower()
    if m not in ANALYSIS_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode. Must be one of: {sorted(ANALYSIS_MODES)}",
        )
    await enforce_analysis_quota(user)
    if is_idx_ticker(t):
        from services.quota import enforce_idx_analysis_quota
        await enforce_idx_analysis_quota(user)

    job_id = str(uuid.uuid4())
    await db.analysis_jobs.insert_one({
        "id": job_id,
        "user_id": user["id"],
        "ticker": t,
        "mode": m,
        "status": "running",
        "started_at": iso(now_utc()),
        "started_at_ts": now_utc(),  # real datetime for Mongo TTL index
        "finished_at": None,
        "result": None,
        "error": None,
    })
    task = asyncio.create_task(_run_single_analysis_job(job_id, t, m, user))
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    return {"job_id": job_id, "status": "running", "ticker": t, "mode": m}


async def _run_single_analysis_job(job_id: str, ticker: str, mode: str, user: dict):
    """Background worker — writes result (or error) to db.analysis_jobs."""
    try:
        r = await asyncio.wait_for(
            _create_analysis_impl(ticker, mode, user),
            timeout=QUICK_PER_TASK_TIMEOUT,
        )
        await db.analysis_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "done",
                "finished_at": iso(now_utc()),
                "result": r,
            }},
        )
    except asyncio.TimeoutError:
        await db.analysis_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "finished_at": iso(now_utc()),
                "error": f"Analysis exceeded {int(QUICK_PER_TASK_TIMEOUT)}s timeout. Please try again.",
            }},
        )
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        await db.analysis_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "finished_at": iso(now_utc()),
                "error": detail,
                "status_code": e.status_code,
            }},
        )
    except Exception as e:
        await db.analysis_jobs.update_one(
            {"id": job_id},
            {"$set": {
                "status": "failed",
                "finished_at": iso(now_utc()),
                "error": str(e)[:500],
            }},
        )


@router.get("/analysis/jobs/{job_id}")
async def analysis_job_status(job_id: str, user=Depends(get_current_user)):
    """Poll the status of an analysis job started via /analysis/{ticker}/start.
    Client should call every 2-3s until status != 'running'."""
    job = await db.analysis_jobs.find_one(
        {"id": job_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0}
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/analysis/{ticker}")
async def create_analysis(
    ticker: str,
    mode: str = Query("standard", description="Analysis mode: standard | candlestick | hybrid"),
    user=Depends(get_current_user),
):
    return await _create_analysis_impl(ticker, mode, user)


async def _create_analysis_impl(ticker: str, mode: str, user: dict):
    ticker = ticker.upper().strip()
    is_anon = bool(user.get("__anon__"))
    if not is_anon:
        await require_accepted(user)
    mode = (mode or "standard").lower()
    if mode not in ANALYSIS_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Must be one of: {sorted(ANALYSIS_MODES)}")

    # Anonymous "Try one free" requests bypass per-user quotas because they
    # have their own IP-based rate limit (1 per 24h per IP), enforced in
    # routers/anon_try.py. They still run the full pipeline.
    if not is_anon:
        # All analysis modes (standard, candlestick, hybrid) are available to all tiers.
        # Free tier still has lower per-day quotas enforced below.
        await enforce_analysis_quota(user)
        is_idx = is_idx_ticker(ticker)
        if is_idx:
            # IDX uses a shared monthly RapidAPI budget (1000 req/month free tier).
            # Apply tighter per-tier daily caps to protect the shared resource.
            from services.quota import enforce_idx_analysis_quota
            await enforce_idx_analysis_quota(user)
    else:
        is_idx = is_idx_ticker(ticker)

    quote_task = get_quote(ticker)
    hist_task = asyncio.to_thread(_yf_history_sync, ticker, "6mo", "1d")
    fund_task = asyncio.to_thread(_yf_fundamentals_sync, ticker)
    market_ctx_task = get_market_context_idx(ticker) if is_idx else get_market_context(ticker)
    # For IDX tickers, also pull richer quote + key stats from RapidAPI
    # (augments yfinance; gracefully None on any failure → we stay on yf).
    idx_quote_task = None
    idx_keystats_task = None
    idx_bandar_task = None
    if is_idx:
        from services import idx_rapidapi
        if idx_rapidapi.is_configured():
            idx_quote_task = idx_rapidapi.get_quote(ticker)
            idx_keystats_task = idx_rapidapi.get_key_stats(ticker)
            idx_bandar_task = idx_rapidapi.get_bandarmology(ticker)
    # For candlestick/hybrid we also need weekly candles
    weekly_task = None
    if mode in ("candlestick", "hybrid"):
        weekly_task = asyncio.to_thread(_yf_history_sync, ticker, "1y", "1wk")
    # RF secondary opinion needs ~1y of daily history for 52-week regime features
    rf_hist_task = None
    if rf_predictor.is_available():
        rf_hist_task = asyncio.to_thread(_yf_history_sync, ticker, "2y", "1d")

    gather_args = [quote_task, hist_task, fund_task, market_ctx_task]
    if idx_quote_task is not None:
        gather_args.append(idx_quote_task)
    if idx_keystats_task is not None:
        gather_args.append(idx_keystats_task)
    if idx_bandar_task is not None:
        gather_args.append(idx_bandar_task)
    if weekly_task is not None:
        gather_args.append(weekly_task)
    if rf_hist_task is not None:
        gather_args.append(rf_hist_task)
    results = await asyncio.gather(*gather_args)
    quote, history, fundamentals, market_ctx = results[0], results[1], results[2], results[3]
    idx = 4
    idx_quote = results[idx] if idx_quote_task is not None else None
    if idx_quote_task is not None:
        idx += 1
    idx_keystats = results[idx] if idx_keystats_task is not None else None
    if idx_keystats_task is not None:
        idx += 1
    idx_bandar = results[idx] if idx_bandar_task is not None else None
    if idx_bandar_task is not None:
        idx += 1
    weekly_history = results[idx] if weekly_task is not None else []
    if weekly_task is not None:
        idx += 1
    rf_history = results[idx] if rf_hist_task is not None else []
    # Pull cached SPY + VIX once per minute for RF regime features (shared
    # across all concurrent requests via _market_regime_cache below).
    rf_market = await _get_rf_market_snapshot() if rf_hist_task is not None else None

    # Data-source provenance chip surfaced to the UI: "rapidapi" means the
    # primary quote came from the paid source; "yfinance" means we fell
    # back because RapidAPI was unconfigured / budget-exhausted / errored.
    idx_data_source = None
    if is_idx:
        idx_data_source = "rapidapi" if (idx_quote and idx_quote.get("price") is not None) else "yfinance"
        # If RapidAPI returned a fresh quote, use it to fill / override yfinance
        # fields (yfinance sometimes lags on .JK by ~15 min or returns None).
        if idx_quote and idx_quote.get("price") is not None:
            quote["price"] = idx_quote.get("price") or quote.get("price")
            quote["change"] = idx_quote.get("change") or quote.get("change")
            quote["change_pct"] = idx_quote.get("change_pct") or quote.get("change_pct")
            quote["volume"] = idx_quote.get("volume") or quote.get("volume")
            quote["market_cap"] = idx_quote.get("market_cap") or quote.get("market_cap")
            quote["open"] = idx_quote.get("open") or quote.get("open")
            quote["high"] = idx_quote.get("high") or quote.get("high")
            quote["low"] = idx_quote.get("low") or quote.get("low")
            quote["prev_close"] = idx_quote.get("prev_close") or quote.get("prev_close")
        # Similarly, overlay the richer fundamentals (P/E, P/B, ROE, etc.)
        if idx_keystats:
            for k in ("pe_ratio", "pb_ratio", "dividend_yield", "roe", "roa", "eps", "debt_equity", "revenue_growth", "profit_margin"):
                if idx_keystats.get(k) is not None:
                    fundamentals[k] = idx_keystats[k]

    if quote.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    technicals = compute_technicals(history)

    candlestick_findings = None
    if mode in ("candlestick", "hybrid"):
        candlestick_findings = scan_daily_and_weekly(history, weekly_history)

    if mode == "candlestick":
        analysis = await run_candlestick_analysis(
            ticker, quote, history, fundamentals, technicals, candlestick_findings
        )
    elif mode == "hybrid":
        analysis = await run_ai_analysis(
            ticker, quote, history, fundamentals, technicals,
            candlestick_findings=candlestick_findings, mode="hybrid",
            market_context=market_ctx,
        )
    else:
        analysis = await run_ai_analysis(
            ticker, quote, history, fundamentals, technicals,
            market_context=market_ctx,
        )

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "created_at": iso(now_utc()),
        "price_at_analysis": quote.get("price"),
        "quote_snapshot": quote,
        "technicals": technicals,
        "fundamentals": fundamentals,
        "mode": mode,
        "market_context": market_ctx if isinstance(market_ctx, dict) and market_ctx.get("configured") else None,
        **analysis,
    }
    if idx_data_source is not None:
        doc["idx_data_source"] = idx_data_source  # "rapidapi" | "yfinance"
    if is_idx and idx_bandar is not None:
        doc["bandarmology"] = idx_bandar
    if candlestick_findings is not None:
        doc["candlestick_findings"] = candlestick_findings

    # Candlestick × Bandarmology confluence — flag when a reversal pattern
    # agrees with insider flow direction. Only for IDX (needs bandarmology).
    if is_idx and idx_bandar and candlestick_findings:
        confluence = _compute_confluence(candlestick_findings, idx_bandar)
        if confluence:
            doc["confluence"] = confluence

    # Random Forest secondary opinion (independent of Claude). Uses ≥1y of
    # daily history. Only attaches when the model is loaded and features are
    # computable (IDX tickers with short history will silently skip).
    if rf_history:
        try:
            df = pd.DataFrame(rf_history)
            df["date"] = pd.to_datetime(df["date"], utc=True)
            df = df.set_index("date").rename(columns={
                "open": "Open", "high": "High", "low": "Low",
                "close": "Close", "volume": "Volume",
            })
            feat = feature_row_for_today(df, market_df=rf_market)
            if feat is not None:
                opinion = rf_predictor.predict_from_features(feat)
                if opinion is not None:
                    # Flag agreement/disagreement with the LLM verdict
                    llm_rec = (analysis.get("recommendation") or "").upper()
                    llm_direction = "up" if llm_rec == "BUY" else "down" if llm_rec == "SELL" else "neutral"
                    opinion["agrees_with_llm"] = (
                        opinion["edge"] != "none"
                        and llm_direction != "neutral"
                        and opinion["direction"] == llm_direction
                    )
                    opinion["llm_direction"] = llm_direction
                    doc["rf_opinion"] = opinion
        except Exception as e:
            # Never fail the whole analysis because of the RF layer
            import logging
            logging.getLogger(__name__).warning("RF opinion failed for %s: %s", ticker, e)

    await db.analyses.insert_one(doc)
    doc.pop("_id", None)
    if not is_anon:
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


@router.get("/analysis/rf-model/meta")
async def rf_model_meta():
    """Public metadata about the Random Forest secondary-opinion model —
    documented on /technical#random-forest. Returns null when no model is
    loaded (e.g. fresh deploy before training)."""
    meta = rf_predictor.get_meta()
    if meta is None:
        return {"available": False}
    # Only expose the fields the UI needs (omit the full classification_report
    # and the universe list is already covered by size).
    return {
        "available": True,
        "trained_at": meta.get("trained_at"),
        "universe_size": meta.get("universe_size"),
        "years_of_history": meta.get("years_of_history"),
        "horizon_days": meta.get("horizon_days"),
        "train_rows": meta.get("train_rows"),
        "test_rows": meta.get("test_rows"),
        "cutoff_date": meta.get("cutoff_date"),
        "training_start_date": meta.get("training_start_date"),
        "training_end_date": meta.get("training_end_date"),
        "holdout_accuracy": meta.get("holdout_accuracy"),
        "holdout_auc": meta.get("holdout_auc"),
        "oob_score": meta.get("oob_score"),
        "baseline_accuracy": meta.get("baseline_accuracy"),
        "calibration_method": meta.get("calibration_method"),
        "calibration_rows": meta.get("calibration_rows"),
        "calibrated_brier": meta.get("calibrated_brier"),
        "uncalibrated_brier": meta.get("uncalibrated_brier"),
        "uncalibrated_accuracy": meta.get("uncalibrated_accuracy"),
        "uncalibrated_auc": meta.get("uncalibrated_auc"),
        # Top-10 features with importance for the UI table
        "feature_importance": (meta.get("feature_importance") or [])[:10],
    }


@router.get("/analysis/{analysis_id}/pdf")
async def analysis_pdf(analysis_id: str, user=Depends(get_current_user)):
    """Download an analysis verdict as a branded PDF. Owner-only access."""
    from fastapi.responses import StreamingResponse
    from services.pdf import generate_analysis_pdf
    import io
    doc = await db.analyses.find_one(
        {"id": analysis_id, "user_id": user["id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    pdf_bytes = generate_analysis_pdf(doc)
    filename = f"neulab-{doc.get('ticker', 'analysis').lower()}-{analysis_id[:8]}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
                    _create_analysis_impl(tk, "standard", user),
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
# Strength threshold for a candlestick pattern to trigger an alert
PATTERN_ALERT_MIN_STRENGTH = 70


@router.post("/patterns/scan")
async def scan_watchlist_patterns(user=Depends(get_current_user)):
    """Scan every watchlist stock for high-strength candlestick patterns
    (daily + weekly). Creates alerts for each qualifying pattern. Available
    on all tiers — the detector is deterministic Python, no LLM calls."""
    await require_accepted(user)
    items = await db.watchlist.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).to_list(50)
    if not items:
        raise HTTPException(status_code=400, detail="Watchlist is empty. Add stocks before running Pattern Scan.")

    tickers = [i["ticker"] for i in items]

    async def _scan_one(ticker: str):
        try:
            daily = await asyncio.to_thread(_yf_history_sync, ticker, "3mo", "1d")
            weekly = await asyncio.to_thread(_yf_history_sync, ticker, "1y", "1wk")
            findings = scan_daily_and_weekly(daily, weekly)
            return ticker, findings, None
        except Exception as e:
            return ticker, None, str(e)[:200]

    results = await asyncio.gather(*[_scan_one(t) for t in tickers])

    detected = []
    alerts_created = 0
    errored = []
    now_iso = iso(now_utc())

    for ticker, findings, err in results:
        if err or not findings:
            errored.append({"ticker": ticker, "error": err or "scan failed"})
            continue
        # Combine patterns from both timeframes, keep those above the threshold
        candidates = []
        for tf_key in ("daily", "weekly"):
            tf = findings.get(tf_key) or {}
            for pat in tf.get("patterns", []):
                if pat.get("strength", 0) >= PATTERN_ALERT_MIN_STRENGTH and pat.get("bias") in ("bullish", "bearish"):
                    candidates.append({**pat, "timeframe": tf_key})
        # Keep the single strongest candidate per ticker to avoid noise
        if not candidates:
            continue
        best = max(candidates, key=lambda c: c["strength"])
        detected.append({
            "ticker": ticker,
            "pattern": best["pattern"],
            "bias": best["bias"],
            "strength": best["strength"],
            "timeframe": best["timeframe"],
            "candle_date": best.get("candle_date"),
            "combined_bias": findings.get("combined_bias"),
        })
        # Dedupe: skip if an identical unread alert already exists for this
        # ticker+pattern+candle_date (avoids duplicates across repeated scans).
        dup = await db.alerts.find_one({
            "user_id": user["id"],
            "ticker": ticker,
            "type": "pattern",
            "pattern": best["pattern"],
            "candle_date": best.get("candle_date"),
            "timeframe": best["timeframe"],
        })
        if dup:
            continue
        await db.alerts.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "ticker": ticker,
            "type": "pattern",
            "pattern": best["pattern"],
            "bias": best["bias"],
            "strength": best["strength"],
            "timeframe": best["timeframe"],
            "candle_date": best.get("candle_date"),
            "title": f"{best['pattern']} · {ticker}",
            "message": f"{best['bias'].upper()} {best['pattern']} detected on {best['timeframe']} timeframe (strength {best['strength']}). {best.get('explanation', '')}",
            "read": False,
            "created_at": now_iso,
        })
        alerts_created += 1
        # Fire-and-forget Telegram push (if user is linked)
        try:
            from services.telegram import send_alert_to_user
            asyncio.create_task(send_alert_to_user(
                user["id"],
                f"{best['pattern']} · {ticker}",
                f"{best['bias'].upper()} on {best['timeframe']} · strength {best['strength']}\n\n{best.get('explanation', '')}",
                ticker=ticker,
            ))
        except Exception:
            pass

    return {
        "scanned": len(tickers),
        "detected": len(detected),
        "alerts_created": alerts_created,
        "patterns": detected,
        "errored": errored,
        "threshold": PATTERN_ALERT_MIN_STRENGTH,
    }


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
        "mode": analysis.get("mode") or "standard",
        "candlestick_summary": analysis.get("candlestick_summary"),
        "candlestick_findings": analysis.get("candlestick_findings"),
        "market_context": analysis.get("market_context"),
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
