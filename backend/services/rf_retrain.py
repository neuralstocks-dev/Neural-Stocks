"""Out-of-process Random Forest retrain orchestration.

The training script itself (`scripts/train_rf.py`) does the heavy lifting.
This module provides:

  * `trigger_retrain()` — spawn the script as a subprocess, stream logs into
    a job document in `db.rf_retrain_jobs`, atomically swap the model file
    on success, and call `rf_predictor.reload()`.
  * `get_retrain_status()` — return the most recent job document.
  * `weekly_retrain_loop()` — background coroutine that checks every 6h
    whether the model is older than `RF_RETRAIN_STALE_DAYS` (default 7) and
    kicks off a retrain if so. Started from server.py at app boot.

Only one retrain runs at a time — a filesystem lock (`rf_signal.retrain.lock`)
plus an in-process `asyncio.Lock` guard against double-starts.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shlex
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from core.db import db
from core.security import iso, now_utc
from services import rf_predictor

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
TRAIN_SCRIPT = BACKEND_ROOT / "scripts" / "train_rf.py"
MODEL_PATH = BACKEND_ROOT / "models" / "rf_signal.joblib"
META_PATH = BACKEND_ROOT / "models" / "rf_signal.meta.json"
LOCK_PATH = BACKEND_ROOT / "models" / "rf_signal.retrain.lock"

# Weekly cadence — if the model is older than this, the scheduler retrains.
RF_RETRAIN_STALE_DAYS = int(os.environ.get("RF_RETRAIN_STALE_DAYS", "7"))
# Scheduler heartbeat — check once every N seconds.
RF_RETRAIN_CHECK_INTERVAL_S = int(os.environ.get("RF_RETRAIN_CHECK_INTERVAL_S", str(6 * 3600)))

_process_lock = asyncio.Lock()


def _model_age_days() -> float | None:
    """Return the age of the currently-loaded model file in days, or None
    if the meta file is missing / unparseable."""
    try:
        meta = json.loads(META_PATH.read_text())
        trained_at = meta.get("trained_at")
        if not trained_at:
            return None
        dt = datetime.fromisoformat(trained_at.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - dt).total_seconds() / 86400
        return age
    except Exception:
        return None


async def _run_training_subprocess(job_id: str, years: int, horizon: int) -> tuple[int, str, str]:
    """Spawn `python scripts/train_rf.py` as a detached subprocess. Streams
    stdout/stderr back. Updates the job document with the tail of the log
    every ~5 seconds."""
    cmd = [sys.executable, str(TRAIN_SCRIPT), "--years", str(years), "--horizon", str(horizon)]
    logger.info("RF retrain job %s starting: %s", job_id, shlex.join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(BACKEND_ROOT),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    buffer: list[str] = []
    try:
        assert proc.stdout is not None
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").rstrip()
            buffer.append(line)
            # Persist a rolling tail (last 80 lines) to the job doc every 5s
            if len(buffer) % 4 == 0:
                await db.rf_retrain_jobs.update_one(
                    {"id": job_id},
                    {"$set": {"log_tail": "\n".join(buffer[-80:]), "updated_at": iso(now_utc())}},
                )
    except Exception as e:
        logger.warning("RF retrain job %s log stream failed: %s", job_id, e)

    returncode = await proc.wait()
    return returncode, "\n".join(buffer[-80:]), "\n".join(buffer[-300:])


async def _create_job(triggered_by: str, years: int, horizon: int) -> dict:
    job = {
        "id": str(uuid.uuid4()),
        "status": "running",
        "triggered_by": triggered_by,
        "years": years,
        "horizon": horizon,
        "started_at": iso(now_utc()),
        "finished_at": None,
        "returncode": None,
        "log_tail": "",
        "error": None,
        "meta": None,
    }
    await db.rf_retrain_jobs.insert_one(job)
    return job


async def trigger_retrain(triggered_by: str = "admin", years: int = 5, horizon: int = 20) -> dict:
    """Start a retrain. Returns the job document. Returns an existing
    running job document if one is already in progress (no double-start)."""
    if _process_lock.locked():
        running = await db.rf_retrain_jobs.find_one(
            {"status": "running"}, projection={"_id": 0}, sort=[("started_at", -1)],
        )
        if running:
            return running

    async def _runner(job_id: str):
        async with _process_lock:
            try:
                LOCK_PATH.write_text(job_id)
                rc, tail, full = await _run_training_subprocess(job_id, years, horizon)
                if rc == 0 and MODEL_PATH.exists():
                    # Reload the model so the new weights are picked up by
                    # the next inference call without a backend restart.
                    rf_predictor.reload()
                    try:
                        meta_doc = json.loads(META_PATH.read_text())
                    except Exception:
                        meta_doc = None
                    await db.rf_retrain_jobs.update_one(
                        {"id": job_id},
                        {"$set": {
                            "status": "success",
                            "returncode": rc,
                            "finished_at": iso(now_utc()),
                            "log_tail": tail,
                            "meta": {
                                k: meta_doc.get(k) for k in (
                                    "trained_at", "universe_size", "horizon_days",
                                    "holdout_accuracy", "holdout_auc", "oob_score",
                                    "baseline_accuracy", "calibrated_brier",
                                    "uncalibrated_brier", "training_start_date",
                                    "training_end_date", "cutoff_date",
                                )
                            } if meta_doc else None,
                        }},
                    )
                    # Drift check — compare new holdout metrics against the
                    # 4-week rolling average of previous successful retrains.
                    # Push a Telegram alert to any admin who's linked their
                    # chat if accuracy drops >5pp or Brier rises >20%.
                    if meta_doc:
                        try:
                            await _check_drift_and_alert(meta_doc, job_id)
                        except Exception as e:
                            logger.warning("RF drift check failed: %s", e)
                else:
                    await db.rf_retrain_jobs.update_one(
                        {"id": job_id},
                        {"$set": {
                            "status": "failed",
                            "returncode": rc,
                            "finished_at": iso(now_utc()),
                            "log_tail": tail,
                            "error": f"Training exited with code {rc}" if rc != 0 else "Model file missing after training",
                        }},
                    )
            except Exception as e:
                logger.exception("RF retrain runner crashed")
                await db.rf_retrain_jobs.update_one(
                    {"id": job_id},
                    {"$set": {
                        "status": "failed",
                        "finished_at": iso(now_utc()),
                        "error": str(e),
                    }},
                )
            finally:
                if LOCK_PATH.exists():
                    try:
                        LOCK_PATH.unlink()
                    except OSError:
                        pass

    job = await _create_job(triggered_by, years, horizon)
    task = asyncio.create_task(_runner(job["id"]))
    # Keep a reference so the GC doesn't drop the task
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)
    job.pop("_id", None)
    return job


_BG_TASKS: set = set()


async def get_retrain_status() -> dict:
    """Most-recent job + whether a retrain is currently running."""
    latest = await db.rf_retrain_jobs.find_one({}, projection={"_id": 0}, sort=[("started_at", -1)])
    age_days = _model_age_days()
    return {
        "latest_job": latest,
        "is_running": _process_lock.locked(),
        "model_age_days": round(age_days, 2) if age_days is not None else None,
        "stale_threshold_days": RF_RETRAIN_STALE_DAYS,
        "is_stale": (age_days is not None and age_days >= RF_RETRAIN_STALE_DAYS),
    }


async def weekly_retrain_loop():
    """Background coroutine started from server.py. Checks every 6h whether
    the model file is older than RF_RETRAIN_STALE_DAYS and kicks off a
    retrain if so. Runs for the lifetime of the app."""
    # Small initial delay so the first check doesn't compete with app boot
    await asyncio.sleep(60)
    while True:
        try:
            age = _model_age_days()
            if age is not None and age >= RF_RETRAIN_STALE_DAYS and not _process_lock.locked():
                logger.info("RF model is %.1f days old — triggering weekly retrain", age)
                await trigger_retrain(triggered_by="scheduler")
            else:
                logger.debug("RF scheduler tick · age=%s days · locked=%s", age, _process_lock.locked())
        except Exception as e:
            logger.warning("RF scheduler tick failed: %s", e)
        await asyncio.sleep(RF_RETRAIN_CHECK_INTERVAL_S)


# --- Drift detection & Telegram alerts -----------------------------------
# Thresholds: alert if the new model's accuracy drops >5 percentage points
# vs the 4-week rolling mean, OR Brier rises >20%. Both signals indicate
# the model's behaviour is materially different from what we've been
# shipping recently and warrants an admin look.
DRIFT_ACC_DROP_PP = 0.05
DRIFT_BRIER_RISE_RATIO = 1.2


async def _rolling_mean(last_n: int = 4) -> dict | None:
    """Compute rolling mean of holdout metrics from the last N successful
    retrains (excluding the newest one)."""
    cursor = db.rf_retrain_jobs.find(
        {"status": "success", "meta": {"$ne": None}},
        projection={"_id": 0, "meta": 1, "finished_at": 1},
        sort=[("finished_at", -1)],
    ).limit(last_n + 1)
    rows = [r async for r in cursor]
    if len(rows) < 2:
        return None  # need at least 1 prior success to compare
    # Drop the newest (that's the one we just inserted)
    history = rows[1: 1 + last_n]
    acc = [r["meta"].get("holdout_accuracy") for r in history if r.get("meta")]
    brier = [r["meta"].get("calibrated_brier") for r in history if r.get("meta")]
    acc = [a for a in acc if a is not None]
    brier = [b for b in brier if b is not None]
    if not acc:
        return None
    return {
        "n_samples": len(acc),
        "acc_mean": sum(acc) / len(acc),
        "brier_mean": (sum(brier) / len(brier)) if brier else None,
    }


async def _check_drift_and_alert(new_meta: dict, job_id: str):
    """Compare new meta against rolling history; if drift exceeds threshold,
    push a Telegram message to every linked admin."""
    rolling = await _rolling_mean(last_n=4)
    if rolling is None:
        logger.info("RF drift check: not enough history yet (job=%s)", job_id)
        return

    new_acc = new_meta.get("holdout_accuracy")
    new_brier = new_meta.get("calibrated_brier")
    if new_acc is None:
        return

    acc_drop = rolling["acc_mean"] - new_acc  # positive = degradation
    brier_ratio = (
        new_brier / rolling["brier_mean"]
        if (new_brier is not None and rolling["brier_mean"])
        else None
    )

    drift_reasons = []
    if acc_drop >= DRIFT_ACC_DROP_PP:
        drift_reasons.append(
            f"Holdout accuracy dropped {acc_drop * 100:.2f}pp "
            f"({rolling['acc_mean'] * 100:.2f}% → {new_acc * 100:.2f}%)"
        )
    if brier_ratio is not None and brier_ratio >= DRIFT_BRIER_RISE_RATIO:
        drift_reasons.append(
            f"Calibrated Brier rose {(brier_ratio - 1) * 100:.1f}% "
            f"({rolling['brier_mean']:.4f} → {new_brier:.4f})"
        )

    # Always log the drift check outcome (useful for ops even without alert)
    await db.rf_retrain_jobs.update_one(
        {"id": job_id},
        {"$set": {
            "drift_check": {
                "rolling_acc_mean": rolling["acc_mean"],
                "rolling_brier_mean": rolling["brier_mean"],
                "rolling_samples": rolling["n_samples"],
                "acc_drop_pp": acc_drop,
                "brier_ratio": brier_ratio,
                "alerted": bool(drift_reasons),
                "reasons": drift_reasons,
            }
        }},
    )

    if not drift_reasons:
        logger.info(
            "RF drift check OK · acc %.4f vs rolling %.4f · brier %s vs %s",
            new_acc, rolling["acc_mean"],
            f"{new_brier:.4f}" if new_brier is not None else "—",
            f"{rolling['brier_mean']:.4f}" if rolling['brier_mean'] else "—",
        )
        return

    # Push Telegram alert to every linked admin
    try:
        from services.telegram import send_alert_to_user
    except Exception as e:
        logger.warning("Cannot import telegram service for drift alert: %s", e)
        return

    title = "⚠️ RF model drift detected"
    body = (
        "A fresh retrain has deviated from the 4-week rolling baseline:\n\n"
        + "\n".join(f"• {r}" for r in drift_reasons)
        + "\n\n<b>New model</b>\n"
        + f"• Trained: {new_meta.get('trained_at', '—')}\n"
        + f"• Universe: {new_meta.get('universe_size', '—')} tickers · "
        + f"{new_meta.get('horizon_days', '—')}d horizon\n"
        + f"• Holdout: {(new_acc or 0) * 100:.2f}% acc · "
        + f"{new_meta.get('holdout_auc', 0):.3f} AUC · "
        + f"{new_meta.get('oob_score', 0) * 100:.2f}% OOB\n\n"
        + "<i>Reload from disk or trigger another retrain from /admin if needed.</i>"
    )

    admins = [
        a async for a in db.users.find(
            {"is_admin": True, "telegram_chat_id": {"$exists": True, "$ne": None}},
            projection={"_id": 0, "id": 1, "email": 1},
        )
    ]
    if not admins:
        logger.info("RF drift alert: drift detected but no linked admin to notify")
        return

    sent = 0
    for a in admins:
        try:
            ok = await send_alert_to_user(a["id"], title, body)
            if ok:
                sent += 1
        except Exception as e:
            logger.warning("Drift alert to admin %s failed: %s", a.get("email"), e)

    logger.warning(
        "RF DRIFT ALERT pushed to %d/%d admin(s) · reasons=%s",
        sent, len(admins), "; ".join(drift_reasons),
    )

