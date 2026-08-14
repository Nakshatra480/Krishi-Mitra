"""
Yield model wrapper. Loads the trained bundle once at import time.

Contract notes for callers:
  * `predicted_yield` is in the unit named by `unit` — NOT always tonnes/ha.
    Coconut is nuts/ha; cotton is lint tonnes/ha. Render the unit, never assume.
  * `yield_range_low/high` is an 80% interval derived from the spread of the
    individual trees, calibrated against held-out years. Narrow means the model
    has seen similar rows; wide means it is guessing. Show the width.
  * `confidence` and `fallback_level` say how much of the answer came from real
    crop/state history versus a coarse fallback. Anything other than "exact"
    should be surfaced to the user rather than presented as a firm number.
"""
from __future__ import annotations

import os
import threading
import warnings

import joblib
import numpy as np

import crop_meta
from stress import apply_stress

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_BUNDLE_PATH = os.path.join(_BASE_DIR, "yield_model.pkl")

try:
    _bundle = joblib.load(_BUNDLE_PATH)
except FileNotFoundError as exc:
    raise RuntimeError(
        "yield_model.pkl not found. Run `python train_model.py` first, "
        "then commit the .pkl to the repository."
    ) from exc

_REQUIRED_KEYS = {"model", "encoders", "priors", "cat_cols", "interval_z", "known_crops"}
_missing = _REQUIRED_KEYS - set(_bundle)
if _missing:
    raise RuntimeError(
        f"yield_model.pkl is from an older training run (missing {sorted(_missing)}). "
        "Re-run `python train_model.py` and commit the regenerated file."
    )

# A scikit-learn skew between training and serving can change tree traversal
# subtly rather than failing outright, so surface it rather than silently
# serving numbers that no longer match the published accuracy.
_trained_with = _bundle.get("sklearn_version")
if _trained_with:
    import sklearn

    if sklearn.__version__ != _trained_with:
        warnings.warn(
            f"yield_model.pkl was trained with scikit-learn {_trained_with} but "
            f"{sklearn.__version__} is installed. Predictions may not match the "
            "published accuracy — pin requirements.txt or retrain.",
            RuntimeWarning,
            stacklevel=2,
        )

_model = _bundle["model"]
_encoders = _bundle["encoders"]
_priors = _bundle["priors"]
_CAT_COLS = _bundle["cat_cols"]
_INTERVAL_Z = _bundle["interval_z"]
_INTERVAL_LABEL = _bundle["interval_label"]
_KNOWN_CROPS = set(_bundle["known_crops"])
_KNOWN_STATES = set(_bundle["known_states"])
_KNOWN_SEASONS = set(_bundle["known_seasons"])

# Predicting with every tree individually is not thread-safe against sklearn's
# shared prediction buffers on some versions; the app runs multi-worker.
_predict_lock = threading.Lock()

_SEASON_CANON = {
    "kharif": "Kharif", "rabi": "Rabi", "summer": "Summer",
    "autumn": "Autumn", "winter": "Winter",
    "whole year": "Whole Year", "wholeyear": "Whole Year",
    "annual": "Whole Year", "perennial": "Whole Year",
    # colloquial names the UI or a farmer may send
    "monsoon": "Kharif", "post-monsoon": "Rabi", "post monsoon": "Rabi",
    "zaid": "Summer", "spring": "Summer", "autumn/winter": "Autumn",
}


# ---------------------------------------------------------------------------
# Input normalisation
# ---------------------------------------------------------------------------

def _canon_season(season: str, crop: str, state: str | None) -> str:
    """
    Map arbitrary season input onto a dataset season. An unrecognised season
    resolves to the season that crop is actually grown in (in that state where
    known) — falling back to a fixed "Whole Year" would miss the crop's real
    history and needlessly drop a confidence level.
    """
    key = " ".join(str(season).strip().lower().split())
    canon = _SEASON_CANON.get(key, str(season).strip().title())
    if canon in _KNOWN_SEASONS:
        return canon
    if state is not None:
        mode = _priors.get("season_mode_by_crop_state", {}).get((crop, state))
        if mode:
            return mode
    return _priors.get("season_mode_by_crop", {}).get(crop, "Whole Year")


def _canon_state(state: str) -> str | None:
    key = " ".join(str(state).strip().lower().split())
    for known in _KNOWN_STATES:
        if known.lower() == key:
            return known
    # tolerate common spellings that differ from the dataset's
    aliases = {
        "orissa": "Odisha", "pondicherry": "Puducherry", "uttaranchal": "Uttarakhand",
        "j&k": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir",
        "nct of delhi": "Delhi", "new delhi": "Delhi",
    }
    return aliases.get(key)


def _resolve_prior(crop: str, state: str | None, season: str) -> tuple[float, float, str]:
    """
    Walk the prior tables from most to least specific.
    Returns (median_log_yield, std_log_yield, level) where level records how
    much real history backed the answer.
    """
    if state is not None:
        row = _priors["by_crop_state_season"].get((crop, state, season))
        if row is not None:
            return float(row["median"]), float(row["std"]), "exact"
        row = _priors["by_crop_state"].get((crop, state))
        if row is not None:
            return float(row["median"]), float(row["std"]), "crop_state"
    row = _priors["by_crop"].get(crop)
    if row is not None:
        return float(row["median"]), float(row["std"]), "crop_national"
    return _priors["global_median"], _priors["global_std"], "global"


_CONFIDENCE_BY_LEVEL = {
    "exact": "high",
    "crop_state": "medium",
    "crop_national": "low",
    "global": "very_low",
}


def _default_intensity(state: str | None) -> tuple[float, float]:
    """Typical fertiliser/pesticide intensity, so unspecified inputs stay in-distribution."""
    fert = _priors["fert_by_state"].get(state, _priors["fert_global"]) if state else _priors["fert_global"]
    pest = _priors["pest_by_state"].get(state, _priors["pest_global"]) if state else _priors["pest_global"]
    return float(fert), float(pest)


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------

def predict(
    *,
    crop: str,
    season: str,
    state: str,
    area_ha: float,
    annual_rainfall_mm: float,
    fertilizer_kg_ha: float | None = None,
    pesticide_kg_ha: float | None = None,
    gdd_pct: float = 0.5,
    tmax_series: list[float] | None = None,
    daily_rainfall: list[float] | None = None,
) -> dict:
    """
    Baseline (statistical) yield, then a weather-stress adjustment.

    Never raises on an unrecognised crop, state or season — it degrades through
    the prior hierarchy and reports how far it fell back, because a field check
    returning a flagged low-confidence number beats one returning a 500.
    """
    tmax_series = tmax_series or []
    daily_rainfall = daily_rainfall or []

    crop_key = crop_meta.canonical_crop(crop)
    state_key = _canon_state(state)
    season_key = _canon_season(season, crop_key, state_key)
    spec = crop_meta.get_spec(crop_key)

    prior, prior_std, level = _resolve_prior(crop_key, state_key, season_key)

    # Unknown categoricals must not be silently encoded as class 0 (an arbitrary
    # alphabetically-first crop/state). Fall back to the most common seen value;
    # the prior feature above carries the real signal either way.
    def enc(col: str, value: str | None) -> int:
        classes = list(_encoders[col].classes_)
        if value is not None and value in classes:
            return int(_encoders[col].transform([value])[0])
        return int(len(classes) // 2)

    fert_default, pest_default = _default_intensity(state_key)
    fert = float(fertilizer_kg_ha) if fertilizer_kg_ha is not None else fert_default
    pest = float(pesticide_kg_ha) if pesticide_kg_ha is not None else pest_default

    # Guard against callers passing out-of-distribution intensities (the old
    # hardcoded pesticide default of 5 kg/ha was ~18x the dataset maximum).
    fert = float(np.clip(fert, 20.0, 400.0))
    pest = float(np.clip(pest, 0.01, 5.0))

    rainfall = float(annual_rainfall_mm)
    if rainfall <= 0:
        rainfall = float(_priors["rain_by_state"].get(state_key, 1100.0)) if state_key else 1100.0

    # NB: area is deliberately absent. The dataset's Area is a district
    # aggregate, so at farm scale it only inflates variance — see train_model.py.
    features = np.array([[
        enc("Crop", crop_key if crop_key in _KNOWN_CROPS else None),
        enc("Season", season_key),
        enc("State", state_key),
        rainfall,
        fert,
        pest,
        prior,
        prior_std,
    ]], dtype=float)

    with _predict_lock:
        per_tree = np.array([t.predict(features)[0] for t in _model.estimators_])

    mu = float(per_tree.mean())
    sd = float(per_tree.std())
    baseline_yield = float(np.exp(mu))

    # Weather stress multiplier on top of the statistical baseline.
    stress = apply_stress(
        baseline_yield=baseline_yield,
        crop=crop_key,
        gdd_pct=gdd_pct,
        tmax_series=tmax_series,
        total_rainfall_mm=sum(daily_rainfall),
        daily_rainfall=daily_rainfall,
    )
    factor = stress["stress_factor"]
    predicted = baseline_yield * factor

    # Interval computed in log space (where the model is symmetric), then scaled
    # by the same stress factor so it tracks the adjusted point estimate.
    low = float(np.exp(mu - _INTERVAL_Z * sd)) * factor
    high = float(np.exp(mu + _INTERVAL_Z * sd)) * factor

    digits = 0 if spec["unit"] == crop_meta.NUTS else 3

    # Area does not inform per-hectare yield, but it does convert it into the
    # number the farmer actually cares about: total expected output.
    area = max(float(area_ha), 0.0)
    total_production = round(predicted * area, digits)

    return {
        # -- contract preserved for the Node field-check service --
        "baseline_yield": round(baseline_yield, digits),
        "predicted_yield": round(predicted, digits),
        "yield_range_low": round(low, digits),
        "yield_range_high": round(high, digits),
        "stress_factor": factor,
        "heat_factor": stress["heat_factor"],
        "water_factor": stress["water_factor"],
        "dry_spell_factor": stress["dry_spell_factor"],
        # Full breakdown including the intermediate counts, so a stress figure
        # can be explained on screen rather than asserted.
        "stress_breakdown": dict(stress),
        # -- added: everything needed to render the number honestly --
        "unit": spec["unit"],
        "area_ha": round(area, 4),
        "total_production": total_production,
        "total_production_low": round(low * area, digits),
        "total_production_high": round(high * area, digits),
        "crop_resolved": crop_key,
        "crop_recognised": crop_key in _KNOWN_CROPS,
        "state_resolved": state_key,
        "season_resolved": season_key,
        "confidence": _CONFIDENCE_BY_LEVEL[level],
        "fallback_level": level,
        "interval_confidence": _INTERVAL_LABEL,
        "interval_half_width_pct": round((high / predicted - 1) * 100, 1) if predicted > 0 else None,
        "inputs_defaulted": sorted(
            k for k, v in (("fertilizer_kg_ha", fertilizer_kg_ha),
                           ("pesticide_kg_ha", pesticide_kg_ha)) if v is None
        ),
    }


def model_info() -> dict:
    """Served at /model-info so the accuracy claim is inspectable, not folklore."""
    metrics = _bundle.get("metrics", {})
    holdout = metrics.get("holdout", {})
    return {
        "estimator": type(_model).__name__,
        "n_estimators": len(_model.estimators_),
        "trained_rows": metrics.get("trained_rows"),
        "crops": len(_KNOWN_CROPS),
        "states": len(_KNOWN_STATES),
        "validation": "temporal holdout, "
                      f"train <{metrics.get('holdout_from_year')} / test >={metrics.get('holdout_from_year')}",
        "median_abs_pct_error": round(holdout.get("median_ape", 0) * 100, 2),
        "within_20pct": round(holdout.get("within_20pct", 0) * 100, 1),
        "r2_log": round(holdout.get("r2_log", 0), 3),
        "interval_coverage": metrics.get("interval", {}).get("coverage"),
        "sklearn_version": _bundle.get("sklearn_version"),
    }


def supported_crops() -> list[str]:
    return sorted(_KNOWN_CROPS)
