"""
Weather-stress adjustment applied on top of the statistical yield baseline.
Pure computation over daily weather arrays — no I/O, no model access.

Scope and honesty: these are heuristic agronomic penalties, not fitted
coefficients. The per-day and per-mm rates below are round numbers chosen to be
directionally right and deliberately conservative; the composite is clamped so
the layer can never dominate the statistical baseline. Thresholds come from
crop_meta, so all 55 crops get crop-appropriate limits rather than rice's.
"""
from __future__ import annotations

from typing import TypedDict

import crop_meta


class StressBreakdown(TypedDict):
    heat_factor: float
    water_factor: float
    dry_spell_factor: float
    stress_factor: float
    # Intermediates, so the UI can say *why* a penalty was applied instead of
    # showing a bare multiplier nobody can check.
    hot_days: int
    upper_temp_c: float
    total_rainfall_mm: float
    water_need_mm: float
    water_expected_mm: float
    longest_dry_run_days: int
    dry_tolerance_days: int
    clamped: bool


_STRESS_MIN = 0.5
_STRESS_MAX = 1.1

# Reproductive window as a fraction of accumulated GDD. Heat during flowering
# costs far more than the same heat during vegetative growth.
_FLOWERING_START = 0.40
_FLOWERING_END = 0.65


def count_hot_days(tmax_series: list[float], crop: str) -> int:
    """Days above the crop's upper threshold — the count behind the heat penalty."""
    upper = crop_meta.get_spec(crop)["upper_temp_c"]
    return sum(1 for t in tmax_series if t is not None and t > upper)


def longest_dry_run(daily_rainfall: list[float]) -> int:
    """Longest consecutive run of days below 1 mm."""
    max_run = current_run = 0
    for rain in daily_rainfall:
        if (rain or 0) < 1.0:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 0
    return max_run


def dry_tolerance(crop: str) -> tuple[int, int]:
    """(tolerated days, severe threshold) — scales with the crop's water need."""
    need = crop_meta.get_spec(crop)["water_need_mm"]
    if need <= 400:        # drought-adapted: millets, moth, horse-gram
        return 21, 30
    if need >= 1000:       # thirsty: rice, sugarcane, banana, spices
        return 10, 16
    return 14, 21


def compute_heat_factor(tmax_series: list[float], crop: str, gdd_pct: float) -> float:
    """Yield reduction from days above the crop's upper temperature threshold."""
    if not tmax_series:
        return 0.0
    hot_days = count_hot_days(tmax_series, crop)

    base_reduction = hot_days * 0.008  # 0.8% per hot day

    extra = 0.0
    if _FLOWERING_START <= gdd_pct <= _FLOWERING_END and hot_days > 5:
        extra = (hot_days - 5) * 0.010

    return max(0.0, base_reduction + extra)


def compute_water_factor(total_rainfall_mm: float, crop: str, season_fraction: float = 1.0) -> float:
    """
    Rainfall measured against the share of the crop's seasonal requirement it
    should have received by now.

    `season_fraction` is how far through the season the crop is. It matters:
    rainfall accrues day by day, but `water_need_mm` is the whole-season total,
    so comparing the two directly made every field look water-stressed until
    the very last day. A rice crop 59% of the way through with 445mm of an
    1100mm seasonal need is on track, not in drought.

    Negative return means a small bonus. Note this reads rainfall only: an
    irrigated field will look water-stressed here, which is why the composite
    is floored and why irrigation should eventually be an input.

    No rainfall data is not the same as no rainfall. The heat and dry-spell
    terms already return 0 for an empty series; this one used to read a missing
    series as total drought and apply the maximum penalty, which pinned the
    whole composite to its floor on any caller that omitted the arrays.
    """
    need = crop_meta.get_spec(crop)["water_need_mm"]
    if need <= 0 or total_rainfall_mm <= 0:
        return 0.0

    # Floored: in the first days of a season the expected total is near zero,
    # and dividing by it would turn a light shower into a large bonus.
    expected = need * min(1.0, max(0.15, season_fraction))
    ratio = total_rainfall_mm / expected

    if ratio >= 1.0:
        return -min((ratio - 1.0) * 0.02, 0.05)
    if ratio >= 0.6:
        return (1.0 - ratio) * 0.20
    return 0.20 + (0.6 - ratio) * 0.50


def compute_dry_spell_factor(daily_rainfall: list[float], crop: str) -> float:
    """
    Longest consecutive run below 1 mm/day. Tolerance scales with the crop's
    water need: millets shrug off three dry weeks that would hurt rice.
    """
    if not daily_rainfall:
        return 0.0

    max_run = longest_dry_run(daily_rainfall)
    tolerance, severe = dry_tolerance(crop)

    if max_run <= tolerance:
        return 0.0
    if max_run <= severe:
        return (max_run - tolerance) * 0.015
    return (severe - tolerance) * 0.015 + (max_run - severe) * 0.025


def apply_stress(
    baseline_yield: float,
    crop: str,
    gdd_pct: float,
    tmax_series: list[float],
    total_rainfall_mm: float,
    daily_rainfall: list[float],
) -> StressBreakdown:
    """Composite stress factor, clamped to [0.5, 1.1] and applied to the baseline."""
    heat = compute_heat_factor(tmax_series, crop, gdd_pct)
    water = compute_water_factor(total_rainfall_mm, crop, gdd_pct)
    dry = compute_dry_spell_factor(daily_rainfall, crop)

    total_reduction = heat + water + dry
    raw_factor = 1.0 - total_reduction
    stress_factor = max(_STRESS_MIN, min(_STRESS_MAX, raw_factor))

    spec = crop_meta.get_spec(crop)
    tolerance, _severe = dry_tolerance(crop)

    return StressBreakdown(
        heat_factor=round(heat, 4),
        water_factor=round(water, 4),
        dry_spell_factor=round(dry, 4),
        stress_factor=round(stress_factor, 4),
        hot_days=count_hot_days(tmax_series, crop),
        upper_temp_c=float(spec["upper_temp_c"]),
        total_rainfall_mm=round(float(total_rainfall_mm), 1),
        water_need_mm=float(spec["water_need_mm"]),
        # What the crop should have received by this point, which is what the
        # penalty is actually measured against.
        water_expected_mm=round(float(spec["water_need_mm"]) * min(1.0, max(0.15, gdd_pct)), 1),
        longest_dry_run_days=longest_dry_run(daily_rainfall),
        dry_tolerance_days=tolerance,
        # Surfaced deliberately: once clamped the layer stops responding to
        # weather at all, and anyone reading the number should know that.
        clamped=bool(abs(raw_factor - stress_factor) > 1e-9),
    )
