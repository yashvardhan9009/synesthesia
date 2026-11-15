"""Regions for Earth Listening Intelligence: a lat/lon box sampled as a grid of NASA POWER points.

A region is not one coordinate. The box is cut into equal cells and the POWER
monthly record is fetched at each cell centre. The area mean is weighted by
cos(latitude), because a degree of longitude covers less ground near the poles.
Missing values stay missing: a month is averaged over the points that have it,
and only when those points carry at least half of the area weight.
"""

from __future__ import annotations

import math
from typing import Any

REGION_PARAMETERS = ("T2M", "PRECTOTCORR", "WS2M", "RH2M")
MAX_POINTS = 16
# Below this share of the successful points' weight, a month's area mean is missing.
MIN_COVERAGE = 0.5


class RegionError(ValueError):
    """A box that cannot be sampled. The message is safe to show."""


def validate_box(south: float, west: float, north: float, east: float) -> None:
    if not (-90 <= south < north <= 90):
        raise RegionError("South must be below north, both within -90 to 90.")
    if not (-180 <= west < east <= 180):
        raise RegionError("West must be less than east, both within -180 to 180 (boxes do not cross the date line).")
    if north - south < 1 or east - west < 1:
        raise RegionError("A region must be at least 1 degree on each side.")
    if north - south > 60:
        raise RegionError("A region may span at most 60 degrees of latitude.")


def grid_shape(south: float, west: float, north: float, east: float) -> tuple[int, int]:
    """Rows and columns of the sampling grid.

    About one point per 10 degrees, three or four a side. A box that wraps most of
    a latitude circle (the Arctic) gets six columns and two or three rows instead,
    so the points spread around the pole rather than crowding one meridian.
    """
    lat_span = north - south
    lon_span = east - west
    if lon_span >= 180:
        rows = min(3, max(2, math.ceil(lat_span / 10)))
        return rows, 6
    rows = min(4, max(3, math.ceil(lat_span / 10)))
    mid = math.radians((north + south) / 2)
    columns = min(4, max(3, math.ceil(lon_span * math.cos(mid) / 10)))
    return rows, columns


def grid_points(south: float, west: float, north: float, east: float) -> list[dict[str, Any]]:
    """Cell centres from north-west to south-east, each with its cos-latitude weight."""
    validate_box(south, west, north, east)
    rows, columns = grid_shape(south, west, north, east)
    points = []
    for row in range(rows):
        lat = north - (row + 0.5) * (north - south) / rows
        for column in range(columns):
            lon = west + (column + 0.5) * (east - west) / columns
            points.append({
                "row": row,
                "column": column,
                "lat": round(lat, 2),
                "lon": round(lon, 2),
                "weight": round(math.cos(math.radians(lat)), 6),
            })
    assert len(points) <= MAX_POINTS
    return points


def monthly_values(monthly: dict[str, list[dict[str, Any]]], months: list[str], parameter: str) -> list[float | None]:
    """One parameter's values aligned to `months`; absent months are None."""
    by_month = {str(point["date"]): point["value"] for point in monthly.get(parameter, [])}
    out: list[float | None] = []
    for month in months:
        value = by_month.get(month)
        out.append(float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None)
    return out


def area_mean(
    series: list[list[float | None]],
    weights: list[float],
    min_coverage: float = MIN_COVERAGE,
) -> tuple[list[float | None], list[int]]:
    """Cos-latitude weighted mean across points, month by month, and how many points had a value."""
    if not series:
        return [], []
    total = sum(weights)
    length = len(series[0])
    means: list[float | None] = []
    counts: list[int] = []
    for index in range(length):
        weight_sum = 0.0
        value_sum = 0.0
        count = 0
        for values, weight in zip(series, weights):
            value = values[index]
            if value is None:
                continue
            weight_sum += weight
            value_sum += weight * value
            count += 1
        counts.append(count)
        if total <= 0 or weight_sum < min_coverage * total or weight_sum == 0:
            means.append(None)
        else:
            means.append(round(value_sum / weight_sum, 4))
    return means, counts


def assemble(
    box: dict[str, float],
    start: int,
    end: int,
    points: list[dict[str, Any]],
    results: list[dict[str, Any] | Exception],
) -> dict[str, Any]:
    """Join per-point monthly answers (or their failures) into the region document.

    `results[i]` is the /api/power/monthly document for `points[i]`, or the
    exception that stopped it. Raises RegionError when no point succeeded.
    """
    months = [f"{year}{month:02d}" for year in range(start, end + 1) for month in range(1, 13)]
    good: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    units: dict[str, str] = {}
    for point, result in zip(points, results):
        if isinstance(result, Exception):
            detail = getattr(result, "detail", None) or str(result) or type(result).__name__
            failed.append({**point, "error": str(detail)[:300], "request_url": getattr(result, "request_url", None)})
            continue
        units.update(result.get("units") or {})
        series = {name: monthly_values(result.get("monthly") or {}, months, name) for name in REGION_PARAMETERS}
        good.append({**point, "request_url": result.get("request_url"), "series": series})
    if not good:
        reasons = "; ".join(sorted({item["error"] for item in failed}))[:400]
        raise RegionError(f"NASA POWER answered for none of the {len(points)} grid points. {reasons}".strip())

    # Trailing months that no point has yet (the current year filling in) are dropped, not shown as gaps.
    last = len(months)
    while last > 0 and all(point["series"][name][last - 1] is None for point in good for name in REGION_PARAMETERS):
        last -= 1
    months = months[:last]
    for point in good:
        point["series"] = {name: values[:last] for name, values in point["series"].items()}

    weights = [point["weight"] for point in good]
    mean: dict[str, list[float | None]] = {}
    coverage: dict[str, list[int]] = {}
    for name in REGION_PARAMETERS:
        mean[name], coverage[name] = area_mean([point["series"][name] for point in good], weights)
    return {
        "box": box,
        "start": start,
        "end": end,
        "parameters": list(REGION_PARAMETERS),
        "units": units,
        "months": months,
        "points": good,
        "failed": failed,
        "requested": len(points),
        "mean": mean,
        "coverage": coverage,
        "weighting": "cos(latitude) of each grid point; a month needs points carrying at least half the weight",
        "request_urls": [point["request_url"] for point in good if point.get("request_url")],
        "source": "NASA POWER monthly point (MERRA-2), community=AG, sampled on a grid and area-averaged",
    }
