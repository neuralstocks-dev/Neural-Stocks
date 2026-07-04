"""Runtime predictor for the Random Forest secondary-opinion model.

Loads /app/backend/models/rf_signal.joblib at startup. If the file is
missing (e.g. a fresh deploy that hasn't been trained) the service
no-ops — analysis responses simply omit `rf_opinion` and the UI hides
the Secondary Opinion module. Inference is cheap (~1 ms on a single row).

TARGET (as of the retrain that fixed field names below): the model
predicts whether a stock will OUTPERFORM SPY over the horizon, not
whether it will go up in absolute terms. The prior absolute-direction
target held out at ~49% accuracy — barely above chance — most likely
because per-stock technical/fundamental features have little power to
predict a target dominated by broad market movement. Relative-to-SPY
labeling removes that market-wide component. See
scripts/train_rf.py::_build_training_set for the label construction.

Honesty layer:
  * We apply an "opinion threshold": when the predicted probability is
    close to 0.5, we return edge_rating="none" so the UI won't display
    a misleading number. Check /technical#random-forest for the
    current model's actual holdout accuracy before trusting this.
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
    """True only if a model is loaded AND functionally active (passes the
    same label_type gate as predict_from_features()). A model can be
    present on disk but gated off -- e.g. because it predates the current
    label semantics, or (as of the relative-outperformance-vs-SPY retrain
    tested against a proper walk-forward holdout) because retraining
    failed to beat even a trivial always-majority baseline and the
    feature was deliberately kept disabled. This must NOT report True in
    either case -- doing so lets /technical and any other consumer render
    a fully populated, confident-looking metrics dashboard for a model
    that predict_from_features() will never actually return a value from,
    which is a worse failure mode than an honest 'unavailable' state.
    """
    b = _lazy_load()
    if b is None:
        return False
    return b["meta"].get("label_type") == "relative_vs_spy" and b["meta"].get("rf_feature_enabled") is True


def reload() -> dict | None:
    """Force a re-read of the joblib from disk. Called after an on-host
    retrain (via admin endpoint or the weekly scheduler) so new weights
    are picked up without a backend restart."""
    global _BUNDLE, _LOAD_ATTEMPTED
    _BUNDLE = None
    _LOAD_ATTEMPTED = False
    return _lazy_load()


def get_meta() -> dict | None:
    """Expose metadata (training date, holdout metrics, feature importance)
    for the /technical page. Returns None -- not the raw file's metadata
    -- when the model is gated off (see is_available() docstring), so the
    Technical page's existing 'model not loaded on this deploy' fallback
    fires correctly instead of rendering live-looking stats for a
    disabled feature."""
    if not is_available():
        return None
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
    or features are insufficient. Never raises — all failures become None.

    SAFETY GATE: this code labels output as relative-outperformance-vs-SPY
    (see module docstring). A model trained before that change predicts
    absolute direction instead, and labeling that as "outperform" would be
    a false claim, not a rename. meta["label_type"] == "relative_vs_spy"
    is written only by the retrained scripts/train_rf.py. Any model
    missing that marker (old model, unretrained) returns None here —
    RF opinion silently disappears from the UI rather than showing a
    correctly-formatted but wrong number. Retraining is what turns this
    back on; no second deploy needed.
    """
    if feature_row is None:
        return None
    bundle = _lazy_load()
    if bundle is None:
        return None
    try:
        model = bundle["model"]
        meta = bundle["meta"]
        if meta.get("label_type") != "relative_vs_spy" or meta.get("rf_feature_enabled") is not True:
            return None
        feature_names = meta["feature_names"]
        x = np.array([feature_row.get(n, np.nan) for n in feature_names], dtype=float)
        if np.isnan(x).any():
            return None
        proba = model.predict_proba(x.reshape(1, -1))[0]
        # Binary classifier: class 1 == "beats SPY over the horizon"
        # (relative-outperformance label — see scripts/train_rf.py
        # _build_training_set docstring for why this replaced absolute
        # up/down direction as the training target).
        prob_outperform = float(proba[1])
        edge = _edge_rating(prob_outperform)
        return {
            "prob_outperform": round(prob_outperform, 4),
            "prob_underperform": round(1.0 - prob_outperform, 4),
            "edge": edge,  # "none" | "modest" | "strong"
            "horizon_days": int(meta.get("horizon_days", 5)),
            "relative_direction": "outperform" if prob_outperform >= 0.5 else "underperform",
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
