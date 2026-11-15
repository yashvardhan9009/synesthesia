"""Long records from NASA POWER: monthly/annual series and a same-calendar-day baseline.

Everything here is computed from parsed POWER values (see app.power.parse_power).
Missing values (fill -999 → None) are skipped, never filled.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

# The baseline period. POWER's own climatology product spans a longer period,
# but a fixed 20-year window keeps every anomaly in the app on one stated basis.
BASELINE_START_YEAR = 2001
BASELINE_END_YEAR = 2020
# Days either side of a calendar day that count as "the same time of year".
BASELINE_HALF_WINDOW = 7
# Monthly MERRA-2 records in POWER start in 1981.
MONTHLY_FIRST_YEAR = 1981
MONTHLY_MAX_YEARS = 46
# Rain at or above this is a wet day (the explorer's rule as well).
WET_DAY_MM = 1.0

BASELINE_PARAMETERS = ("T2M", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PS")


def split_monthly(parsed: dict[str, Any]) -> dict[str, Any]:
    """POWER monthly keys are YYYYMM, with month 13 the annual value. Split them."""
    monthly: dict[str, list[dict[str, Any]]] = {}
    annual: dict[str, list[dict[str, Any]]] = {}
    months: set[str] = set()
    years: set[str] = set()
    for name, points in parsed["parameters"].items():
        monthly[name] = []
        annual[name] = []
        for point in points:
            key = str(point["date"])
            if len(key) != 6 or not key.isdigit():
                continue
            month = int(key[4:])
            if month == 13:
                annual[name].append({"date": key[:4], "value": point["value"]})
                years.add(key[:4])
            elif 1 <= month <= 12:
                monthly[name].append({"date": key, "value": point["value"]})
                months.add(key)
    return {"monthly": monthly, "annual": annual, "months": sorted(months), "years": sorted(years)}


def leap_day_index(month: int, day: int) -> int:
    """0-based day of year in a leap calendar, so 29 Feb has its own slot (59) in every year."""
    return (date(2000, month, day) - date(2000, 1, 1)).days


def _quantile(sorted_values: list[float], q: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = q * (len(sorted_values) - 1)
    low = math.floor(rank)
    high = math.ceil(rank)
    mix = rank - low
    return sorted_values[low] * (1 - mix) + sorted_values[high] * mix


def _stats(values: list[float]) -> dict[str, float | int]:
    ordered = sorted(values)
    n = len(ordered)
    mean = sum(ordered) / n
    sd = math.sqrt(sum((value - mean) ** 2 for value in ordered) / (n - 1)) if n > 1 else 0.0
    return {
        "n": n,
        "mean": round(mean, 4),
        "sd": round(sd, 4),
        "p10": round(_quantile(ordered, 0.1), 4),
        "p50": round(_quantile(ordered, 0.5), 4),
        "p90": round(_quantile(ordered, 0.9), 4),
    }


def calendar_baseline(
    parsed: dict[str, Any],
    half_window: int = BASELINE_HALF_WINDOW,
) -> dict[str, dict[str, dict[str, float | int]]]:
    """For every calendar day MMDD, statistics of all observed days within ±half_window days of it.

    The window wraps over New Year. Rain adds the mean and sd of ln(1 + P) (the
    scale anomalies are scored on) and the fraction of wet days.
    """
    out: dict[str, dict[str, dict[str, float | int]]] = {}
    for name, points in parsed["parameters"].items():
        buckets: list[list[float]] = [[] for _ in range(366)]
        for point in points:
            value = point["value"]
            key = str(point["date"])
            if value is None or len(key) != 8:
                continue
            buckets[leap_day_index(int(key[4:6]), int(key[6:8]))].append(float(value))
        days: dict[str, dict[str, float | int]] = {}
        for index in range(366):
            pooled: list[float] = []
            for offset in range(-half_window, half_window + 1):
                pooled.extend(buckets[(index + offset) % 366])
            if not pooled:
                continue
            stats = _stats(pooled)
            if name == "PRECTOTCORR":
                logs = [math.log1p(max(0.0, value)) for value in pooled]
                log_stats = _stats(logs)
                stats["log_mean"] = log_stats["mean"]
                stats["log_sd"] = log_stats["sd"]
                stats["wet"] = round(sum(1 for value in pooled if value >= WET_DAY_MM) / len(pooled), 4)
            day = date(2000, 1, 1).toordinal() + index
            mmdd = date.fromordinal(day).strftime("%m%d")
            days[mmdd] = stats
        out[name] = days
    return out
