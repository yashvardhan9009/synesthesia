import { ANOMALY_BELL_HZ, MAPPINGS, POWER_VARIABLES, type PowerVariable } from "../audio/mappings.ts";
import { anomalyBasis } from "../audio/soundscape.ts";
import { formatDay } from "../audio/build.ts";
import { robustAnomalies } from "../science/anomaly.ts";
import { isMissing } from "../science/normalize.ts";
import type { Place, PowerSeries, SonicEvent } from "../types.ts";

/** A global 6 × 8 sampling grid, staggered so adjacent latitude bands do not align. */
export function globalGrid(): Place[] {
  const places: Place[] = [];
  for (let row = 0; row < 6; row += 1) {
    const lat = -75 + row * 30;
    const offset = row % 2 ? 22.5 : 0;
    for (let column = 0; column < 8; column += 1) {
      const lon = -180 + column * 45 + offset;
      places.push({
        name: `Grid ${row + 1}.${column + 1}`,
        lat,
        lon: lon > 180 ? lon - 360 : lon,
        why: "Regular global sampling point; measurements are requested from NASA POWER.",
      });
    }
  }
  return places;
}

/** Rain below this (mm/day) is never reported as an unusual wet day. */
export const MIN_WET_MM = 1;

/**
 * The smallest spread (MAD, in the scored units) the global scan accepts. Over
 * oceans and ice a month can be almost constant, and a MAD near zero would turn
 * a tiny change into an extreme score; these floors are a scoring choice, not
 * measurements. Rain is scored on ln(1 + P).
 */
export const MIN_SPREAD: Record<PowerVariable, number> = {
  T2M: 0.5,
  PRECTOTCORR: 0.2,
  WS2M: 0.3,
  RH2M: 2,
  PS: 0.1,
  CLOUD_AMT: 5,
};

/** One unusual day at one place, for one variable. */
export type Finding = {
  place: string;
  latitude: number;
  longitude: number;
  requestUrl: string;
  variable: PowerVariable;
  date: string;
  /** Index of the day in that place's series. */
  dayIndex: number;
  value: number;
  unit: string;
  z: number;
};

/**
 * Every day, at every place, where a POWER variable departs from that place's
 * own window by |z| ≥ threshold (robust z: median and MAD; rain on ln(1 + P),
 * as in the soundscape; rain below MIN_WET_MM is ignored; spread floored at MIN_SPREAD). Sorted by |z|, largest first. Each place is judged
 * against itself, so a hot day in Nuuk and one in Delhi are equally unusual.
 */
export function scanAnomalies(entries: readonly { place: Place; series: PowerSeries }[], threshold: number): Finding[] {
  const findings: Finding[] = [];
  for (const { place, series } of entries) {
    for (const variable of POWER_VARIABLES) {
      const points = series.parameters[variable];
      if (!points) continue;
      const values = points.map((point) => (point.value === null || isMissing(point.value) ? null : point.value));
      const scored = robustAnomalies(anomalyBasis(variable, values), threshold, MIN_SPREAD[variable]);
      scored.forEach((point, dayIndex) => {
        const value = values[dayIndex];
        if (!point.flagged || point.z === null || value === null) return;
        // In a mostly dry window the MAD of rain is zero, so any drizzle scores as extreme.
        // A wet-day anomaly needs measurable rain.
        if (variable === "PRECTOTCORR" && value < MIN_WET_MM) return;
        const unit = series.units[variable] === "C" ? "°C" : series.units[variable] || MAPPINGS[variable].unit;
        findings.push({ place: place.name, latitude: place.lat, longitude: place.lon, requestUrl: series.request_url, variable, date: points[dayIndex].date, dayIndex, value, unit, z: point.z });
      });
    }
  }
  return findings.sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.date.localeCompare(b.date));
}

/** "Hot", "Wet", "Calm" and so on: the direction of a departure in a word. */
export function departureWord(finding: Pick<Finding, "variable" | "z">): string {
  const high = finding.z > 0;
  const words: Record<PowerVariable, [string, string]> = {
    T2M: ["warm", "cold"],
    PRECTOTCORR: ["wet", "dry"],
    WS2M: ["windy", "calm"],
    RH2M: ["humid", "dry air"],
    PS: ["high pressure", "low pressure"],
    CLOUD_AMT: ["cloudy", "clear"],
  };
  return words[finding.variable][high ? 0 : 1];
}

/**
 * The findings in date order as a sequence: each anomaly sounds its variable's
 * bell (the same fixed pitches the soundscape uses), louder for larger |z|.
 */
export function anomalyTimeline(findings: readonly Finding[]): SonicEvent[] {
  return [...findings]
    .sort((a, b) => a.date.localeCompare(b.date) || Math.abs(b.z) - Math.abs(a.z))
    .map((finding, index) => ({
      sourceIndex: index,
      label: `${formatDay(finding.date)} · ${finding.place}`,
      caption: `${formatDay(finding.date)}, ${finding.place}: ${departureWord(finding)}. ${MAPPINGS[finding.variable].name} ${finding.value.toFixed(1)} ${finding.unit}, robust z ${finding.z.toFixed(1)}.`,
      frequency: ANOMALY_BELL_HZ[finding.variable] / 2,
      gain: Math.min(0.5, 0.22 + Math.abs(finding.z) * 0.03),
      filterHz: 3200,
      noise: 0,
      accent: true,
      wave: "sine",
      harmony: null,
      harmonyGain: 0,
    }));
}
