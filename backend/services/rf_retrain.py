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
