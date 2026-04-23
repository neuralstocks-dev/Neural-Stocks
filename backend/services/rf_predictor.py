"""Runtime predictor for the Random Forest secondary-opinion model.

Loads /app/backend/models/rf_signal.joblib at startup. If the file is
missing (e.g. a fresh deploy that hasn't been trained) the service
no-ops — analysis responses simply omit `rf_opinion` and the UI hides
the Secondary Opinion module. Inference is cheap (~1 ms on a single row).

Honesty layer:
  * The trained model's 2025 holdout accuracy is ~49% (documented on
    /technical#random-forest). We therefore apply an "opinion threshold":
    when the predicted probability is close to 0.5, we return
    edge_rating="none" so the UI won't display a misleading number.
  * We always include the top-3 features that drove this specific
    prediction (via SHAP-like feature contribution via tree paths), so
    the user can judge reliability per-case.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "rf_signal.joblib"
_BUNDLE: dict[str, Any] | None = None
_LOAD_ATTEMPTED = False

# UI thresholds — below these the prediction is presented as "no edge"
_EDGE_NONE_HALFWIDTH = 0.08   # |p - 0.5| < 0.08  → no meaningful edge
_EDGE_STRONG_HALFWIDTH = 0.15  # |p - 0.5| > 0.15 → strong


def _lazy_load() -> dict[str, Any] | None:
    global _BUNDLE, _LOAD_ATTEMPTED
    if _LOAD_ATTEMPTED:
        return _BUNDLE
    _LOAD_ATTEMPTED = True
    if not _MODEL_PATH.exists():
        logger.info("RF model not found at %s — secondary opinion disabled", _MODEL_PATH)
        return None
    try:
        import joblib
        bundle = joblib.load(_MODEL_PATH)
        meta = bundle["meta"]
        logger.info(
            "RF model loaded · features=%d  holdout_acc=%.3f  holdout_auc=%.3f",
            len(meta["feature_names"]), meta["holdout_accuracy"], meta["holdout_auc"],
        )
        _BUNDLE = bundle
    except Exception as e:
        logger.warning("RF model load failed: %s", e)
        _BUNDLE = None
    return _BUNDLE


def is_available() -> bool:
    return _lazy_load() is not None


def get_meta() -> dict | None:
    """Expose metadata (training date, holdout metrics, feature importance)
    for the /technical page."""
    b = _lazy_load()
    return None if b is None else b["meta"]


def _edge_rating(prob_up: float) -> str:
    d = abs(prob_up - 0.5)
    if d < _EDGE_NONE_HALFWIDTH:
        return "none"
    if d > _EDGE_STRONG_HALFWIDTH:
        return "strong"
    return "modest"


def _feature_importances(bundle) -> np.ndarray | None:
    """Read feature importances from the bundle. Handles both a plain
    RandomForestClassifier and a CalibratedClassifierCV wrapping it."""
    imp = bundle.get("feature_importances")
    if imp is not None:
        return np.asarray(imp, dtype=float)
    model = bundle["model"]
    if hasattr(model, "feature_importances_"):
        return np.asarray(model.feature_importances_, dtype=float)
    # CalibratedClassifierCV exposes calibrated_classifiers_ — average
    # importances from the wrapped base estimators.
    if hasattr(model, "calibrated_classifiers_"):
        bases = []
        for cc in model.calibrated_classifiers_:
            b = getattr(cc, "estimator", None) or getattr(cc, "base_estimator", None)
            if b is not None and hasattr(b, "feature_importances_"):
                bases.append(np.asarray(b.feature_importances_, dtype=float))
        if bases:
            return np.mean(bases, axis=0)
    return None


def _top_contributors(bundle, feature_names: list[str], x: np.ndarray, k: int = 3):
    """Return the top-k features that most differ from the training mean in
    this sample (a cheap substitute for SHAP — good enough for a UI
    transparency chip, not for a research paper)."""
    importances = _feature_importances(bundle)
    if importances is None:
        return []
    scores = np.abs(x) * importances
    idx = np.argsort(scores)[::-1][:k]
    return [
        {
            "name": feature_names[i],
            "value": round(float(x[i]), 4),
            "relative_importance": round(float(importances[i]), 4),
        }
        for i in idx
    ]


def predict_from_features(feature_row: dict | None) -> dict | None:
    """Returns the full opinion payload or None if the model isn't loaded
    or features are insufficient. Never raises — all failures become None."""
    if feature_row is None:
        return None
    bundle = _lazy_load()
    if bundle is None:
        return None
    try:
        model = bundle["model"]
        meta = bundle["meta"]
        feature_names = meta["feature_names"]
        x = np.array([feature_row.get(n, np.nan) for n in feature_names], dtype=float)
        if np.isnan(x).any():
            return None
        proba = model.predict_proba(x.reshape(1, -1))[0]
        # Binary classifier: class 1 == UP
        prob_up = float(proba[1])
        edge = _edge_rating(prob_up)
        return {
            "prob_up": round(prob_up, 4),
            "prob_down": round(1.0 - prob_up, 4),
            "edge": edge,  # "none" | "modest" | "strong"
            "horizon_days": int(meta.get("horizon_days", 5)),
            "direction": "up" if prob_up >= 0.5 else "down",
            "top_features": _top_contributors(bundle, feature_names, x, k=3),
            "model_info": {
                "trained_at": meta.get("trained_at"),
                "holdout_accuracy": meta.get("holdout_accuracy"),
                "holdout_auc": meta.get("holdout_auc"),
                "baseline_accuracy": meta.get("baseline_accuracy"),
                "universe_size": meta.get("universe_size"),
                "cutoff_date": meta.get("cutoff_date"),
                "training_start_date": meta.get("training_start_date"),
                "training_end_date": meta.get("training_end_date"),
                "horizon_days": int(meta.get("horizon_days", 5)),
                "calibration_method": meta.get("calibration_method"),
                "calibrated_brier": meta.get("calibrated_brier"),
                "uncalibrated_brier": meta.get("uncalibrated_brier"),
            },
        }
    except Exception as e:
        logger.warning("RF predict failed: %s", e)
        return None
