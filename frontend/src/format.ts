import { PARAMETERS, type LeadParameter, type PowerSeries } from "./types.ts";

/** "28.61°N 77.21°E". */
export function formatLatLon(lat: number, lon: number, digits = 2): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(digits)}°${value >= 0 ? positive : negative}`;
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}

/** The unit POWER reported for a parameter, written for display (POWER writes Celsius as "C"). */
export function powerUnit(series: PowerSeries | null, parameter: LeadParameter): string {
  const unit = series?.units[parameter] || PARAMETERS[parameter].unit;
  return unit === "C" ? "°C" : unit;
}

/** "-12.3 °C", or "missing" for a POWER fill value. */
export function formatMeasure(value: number | null, unit: string, digits = 1): string {
  return value === null ? "missing" : `${value.toFixed(digits)} ${unit}`;
}
