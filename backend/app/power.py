"""Parse NASA POWER daily point responses. Fill value -999 becomes null."""

from __future__ import annotations

from typing import Any

# POWER documents -999 as the fill. A tiny tolerance covers -999.0.
FILL_CEILING = -998.0

ALLOWED_PARAMETERS = (
    "T2M",
    "PRECTOTCORR",
    "WS10M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
    "RH2M",
    "PS",
    "CLOUD_AMT",
)

# What the page asks for when it does not name parameters.
DEFAULT_PARAMETERS = (
    "T2M",
    "PRECTOTCORR",
    "WS10M",
    "ALLSKY_SFC_SW_DWN",
    "RH2M",
    "PS",
    "CLOUD_AMT",
)


def is_fill(value: Any, fill: float) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return True
    if value != value:  # NaN
        return True
    return float(value) <= max(fill + 0.1, FILL_CEILING)


def parse_power(payload: dict[str, Any]) -> dict[str, Any]:
    """Turn a POWER JSON document into aligned daily series.

    Raises ValueError with NASA's own message when the body is not a point result.
    This function does not invent observations.
    """
    if not isinstance(payload, dict) or "properties" not in payload:
        message = _message(payload)
        raise ValueError(message or "NASA POWER did not return a point series.")

    header = payload.get("header") or {}
    fill = float(header.get("fill_value", -999))
    raw_parameters = (payload.get("properties") or {}).get("parameter") or {}
    if not isinstance(raw_parameters, dict) or not raw_parameters:
        raise ValueError(_message(payload) or "NASA POWER returned no parameters.")

    dates: set[str] = set()
    for series in raw_parameters.values():
        if isinstance(series, dict):
            dates.update(str(day) for day in series.keys())
    ordered = sorted(dates)

    meta = payload.get("parameters") or {}
    parameters: dict[str, list[dict[str, Any]]] = {}
    units: dict[str, str] = {}
    longnames: dict[str, str] = {}
    for name, series in raw_parameters.items():
        if not isinstance(series, dict):
            continue
        points = []
        for day in ordered:
            raw = series.get(day, series.get(int(day)) if day.isdigit() else None)
            # POWER keys are strings. Keep a None when the day is absent.
            if day not in series:
                value = None
            else:
                value = None if is_fill(series[day], fill) else float(series[day])
            points.append({"date": day, "value": value})
        parameters[name] = points
        info = meta.get(name) or {}
        if isinstance(info, dict):
            if info.get("units"):
                units[name] = str(info["units"])
            if info.get("longname"):
                longnames[name] = str(info["longname"])

    messages = _messages(payload.get("messages"))
    geometry = (payload.get("geometry") or {}).get("coordinates")
    return {
        "parameters": parameters,
        "units": units,
        "longnames": longnames,
        "messages": messages,
        "fill_value": fill,
        "header_title": header.get("title"),
        "coordinates": geometry,
        "dates": ordered,
    }


def _message(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("message", "reason", "detail"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        messages = _messages(payload.get("messages"))
        if messages:
            return "; ".join(messages)
    return ""


def _messages(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        out: list[str] = []
        for item in raw:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                text = item.get("message") or item.get("text") or item.get("description")
                if isinstance(text, str) and text.strip():
                    out.append(text.strip())
        return out
    return [str(raw)]
