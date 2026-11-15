import type { PowerBaseline } from "../api.ts";
import { formatDay } from "../audio/build.ts";
import { DEFAULT_CONFIG, type LabConfig } from "../audio/labConfig.ts";
import { ANOMALY_BELL_HZ, bellLevel, MAPPINGS, pressureModulation, type PowerVariable } from "../audio/mappings.ts";
import { buildSoundscape, type Bell, type Soundscape, type SoundStep } from "../audio/soundscape.ts";
import { formatLatLon } from "../format.ts";
import type { PowerSeries } from "../types.ts";
import { baselineWindowLabel, departure, EXPLAIN_PARAMETERS, UNUSUAL_Z, type Departure } from "./anomaly.ts";

/**
 * Earth Sound Map: the globe cut into 12 × 5 regions (30° of longitude by 36°
 * of latitude). Each region is heard through the NASA POWER day at its centre
 * point, on the soundscape's fixed physical ranges so regions are directly
 * comparable, with bells for what is unusual against that point's own
 * 2001–2020 normal for the calendar day.
 */

export const MAP_COLS = 12;
export const MAP_ROWS = 5;
export const COL_DEGREES = 360 / MAP_COLS;
export const ROW_DEGREES = 180 / MAP_ROWS;
/** POWER variables the map plays (the soundscape set). */
export const MAP_PARAMETERS = "T2M,PRECTOTCORR,WS2M,RH2M,PS,CLOUD_AMT,ALLSKY_SFC_SW_DWN";


export type Cell = { row: number; col: number };

export function cellId(cell: Cell): string {
  return `${cell.row}-${cell.col}`;
}

/** The sampled point: the centre of the region. Row 0 is the north. */
export function cellCenter(cell: Cell): { lat: number; lon: number } {
  return { lat: 90 - ROW_DEGREES * (cell.row + 0.5), lon: -180 + COL_DEGREES * (cell.col + 0.5) };
}

export function cellName(cell: Cell): string {
  const { lat, lon } = cellCenter(cell);
  return formatLatLon(lat, lon, 0);
}

/** The region under a point of an equirectangular map, given as 0–1 fractions of its width and height. */
export function cellAt(x: number, y: number): Cell {
  const clamp = (value: number, size: number) => Math.min(size - 1, Math.max(0, Math.floor(value * size)));
  return { row: clamp(y, MAP_ROWS), col: clamp(x, MAP_COLS) };
}

/** Arrow keys move one region; east–west wraps around the globe, north–south stops at the poles. Home/End jump along the row. */
export function moveCell(cell: Cell, key: string): Cell | null {
  switch (key) {
    case "ArrowLeft":
      return { row: cell.row, col: (cell.col + MAP_COLS - 1) % MAP_COLS };
    case "ArrowRight":
      return { row: cell.row, col: (cell.col + 1) % MAP_COLS };
    case "ArrowUp":
      return { row: Math.max(0, cell.row - 1), col: cell.col };
    case "ArrowDown":
      return { row: Math.min(MAP_ROWS - 1, cell.row + 1), col: cell.col };
    case "Home":
      return { row: cell.row, col: 0 };
    case "End":
      return { row: cell.row, col: MAP_COLS - 1 };
    default:
      return null;
  }
}

export type TourId = "equator" | "meridian" | "globe";

export const TOURS: Record<TourId, { name: string; describe: string; cells: () => Cell[] }> = {
  equator: {
    name: "Around the equator",
    describe: "The 12 equatorial regions, west to east from the Pacific.",
    cells: () => Array.from({ length: MAP_COLS }, (_, col) => ({ row: Math.floor(MAP_ROWS / 2), col })),
  },
  meridian: {
    name: "Pole to pole",
    describe: "North to south along 15°E, through Europe and Africa, then back up along 165°W across the Pacific.",
    cells: () => [
      ...Array.from({ length: MAP_ROWS }, (_, row) => ({ row, col: MAP_COLS / 2 })),
      ...Array.from({ length: MAP_ROWS }, (_, index) => ({ row: MAP_ROWS - 1 - index, col: 0 })),
    ],
  },
  globe: {
    name: "The whole globe",
    describe: "All 60 regions, row by row from the Arctic, sweeping back and forth.",
    cells: () =>
      Array.from({ length: MAP_ROWS }, (_, row) =>
        Array.from({ length: MAP_COLS }, (_, index) => ({ row, col: row % 2 === 0 ? index : MAP_COLS - 1 - index })),
      ).flat(),
  },
};

export type RegionSound = {
  cell: Cell;
  date: string;
  step: SoundStep;
  /** Every parameter of the day against the point's normal (empty without a baseline). */
  departures: Departure[];
  basis: string | null;
};

const BELL_VARIABLES: readonly PowerVariable[] = ["T2M", "PRECTOTCORR", "WS2M", "RH2M", "PS"];
const fmt = (value: number, digits = 1) => value.toFixed(digits);

/**
 * One region's step: the soundscape of its single POWER day (fixed ranges),
 * then bells and pressure vibrato against the baseline instead of the window
 * (a one-day window has no spread of its own). Without a baseline the step
 * has no bells and a steady tone, and says so.
 */
export function regionSound(cell: Cell, series: PowerSeries, baseline: PowerBaseline | null, config: LabConfig = DEFAULT_CONFIG): RegionSound | null {
  const date = series.dates[0];
  if (!date) return null;
  const name = cellName(cell);
  const scape = buildSoundscape({ ...series, dates: [date] }, config, name);
  const base = scape.steps[0];
  if (!base) return null;
  const mmdd = date.slice(4, 8);
  const departures: Departure[] = [];
  if (baseline) {
    for (const parameter of EXPLAIN_PARAMETERS) {
      const value = series.parameters[parameter]?.find((point) => point.date === date)?.value ?? null;
      const found = departure(parameter, value, baseline.days[parameter]?.[mmdd]);
      if (found) departures.push(found);
    }
  }
  const basis = baseline ? baselineWindowLabel(mmdd, baseline.half_window, baseline.period) : null;
  const byParameter = new Map(departures.map((item) => [item.parameter as string, item]));

  // Drop the window-relative anomaly and pulse layers; they mean nothing for a single day.
  const traces = base.traces.filter((trace) => trace.layer !== "anomaly" && trace.layer !== "pulse");
  const words: string[] = [base.caption.replace(/ Unusual for this window:[^.]*\./, "").replace(/ Pressure [^.]*median\./, "")];

  let vibrato: SoundStep["vibrato"] = null;
  const pressure = byParameter.get("PS");
  const psTrace = traces.find((trace) => trace.variable === "PS");
  if (psTrace) {
    if (pressure) {
      vibrato = pressureModulation(pressure.diff);
      psTrace.normalized = pressure.diff;
      psTrace.rule = `vibrato depth from (PS − normal) over ${basis}, full at ±2 kPa; slower above normal, faster below`;
      psTrace.result = `vibrato ${fmt(vibrato.depthCents)} cents at ${vibrato.rateHz} Hz`;
      words.push(`Pressure ${fmt(Math.abs(pressure.diff), 2)} kPa ${pressure.diff < 0 ? "below" : "above"} normal.`);
    } else {
      psTrace.normalized = null;
      psTrace.rule = "vibrato from the departure against the 2001–2020 normal";
      psTrace.result = baseline ? "Missing: steady tone" : "No baseline: steady tone";
    }
  }

  const bells: Bell[] = [];
  for (const variable of BELL_VARIABLES) {
    const found = byParameter.get(variable);
    if (!found || found.z === null || found.level === "normal") continue;
    bells.push({ variable, frequency: ANOMALY_BELL_HZ[variable], level: bellLevel(found.z), z: found.z });
    const own = traces.find((trace) => trace.variable === variable);
    if (own) own.result = `${own.result} · bell, z ${fmt(found.z)} against normal`;
    traces.push({
      datasetId: "NASA POWER daily",
      variable,
      layer: "anomaly",
      date,
      raw: found.value,
      unit: MAPPINGS[variable].unit,
      normalized: found.z,
      rule: `z = (x − normal) / sd over ${basis}${variable === "PRECTOTCORR" ? " (rain: x = ln(1 + P))" : ""}; bell when |z| ≥ ${UNUSUAL_Z}`,
      result: `Bell, z ${fmt(found.z)}`,
    });
  }
  if (bells.length > 0) words.push(`Unusual against normal: ${bells.map((bell) => `${MAPPINGS[bell.variable].name.toLowerCase()} (z ${fmt(bell.z)})`).join(", ")}.`);
  if (!baseline) words.push("No 2001–2020 baseline: no bells.");

  const label = `${name} · ${formatDay(date)}`;
  return {
    cell,
    date,
    departures,
    basis,
    step: {
      ...base,
      label,
      traces,
      vibrato,
      bells,
      pulse: 0,
      caption: words.join(" "),
      source: `NASA POWER daily · ${name}`,
      requestUrl: series.request_url,
    },
  };
}

/** Join regions into one playable soundscape (a tour), re-indexed in order. */
export function mapSoundscape(regions: readonly RegionSound[], title: string, config: LabConfig = DEFAULT_CONFIG): Soundscape {
  const steps = regions.map((region, index) => ({ ...region.step, index }));
  const missing = { T2M: 0, PRECTOTCORR: 0, WS2M: 0, RH2M: 0, PS: 0, CLOUD_AMT: 0 } as Record<PowerVariable, number>;
  for (const step of steps) for (const variable of step.missing) missing[variable] += 1;
  const first = regions[0];
  return {
    title,
    place: "Earth Sound Map",
    latitude: first ? cellCenter(first.cell).lat : 0,
    longitude: first ? cellCenter(first.cell).lon : 0,
    start: first?.date ?? "",
    end: first?.date ?? "",
    dataset: "NASA POWER daily point (MERRA-2 / GEOS), one request per region",
    requestUrl: first?.step.requestUrl ?? "",
    config: { ...config, anomalyZ: UNUSUAL_Z },
    steps,
    missing,
  };
}
