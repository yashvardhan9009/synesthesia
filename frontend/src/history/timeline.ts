import type { BaselineStats, PowerMonthly } from "../api.ts";
import { DEFAULT_CONFIG, effectiveConfig, rootMidi, type LabConfig } from "../audio/labConfig.ts";
import {
  ANOMALY_BELL_HZ,
  DENSITY_INTERVALS,
  MAPPINGS,
  bellLevel,
  cloudVoices,
  humidityTexture,
  normalizeFixed,
  rainHits,
  windIntensity,
  type PowerVariable,
} from "../audio/mappings.ts";
import type { Bell, LayerTrace, Soundscape, SoundStep } from "../audio/soundscape.ts";
import { changeReferenceMidi, changeToMidi, midiName, midiToFrequency } from "../science/score.ts";
import { departure, levelOf, statsOf, UNUSUAL_Z, type Departure, type ExplainParameter } from "./anomaly.ts";

/**
 * The Environmental Sound Timeline: a place's NASA POWER monthly record, one
 * step per month, season or year, each compared with the 2001–2020 normal for
 * the same month (season, year). Pure: the same response gives the same sound.
 */

export const TIMELINE_PARAMETERS = "T2M,PRECTOTCORR,RH2M,WS2M,CLOUD_AMT";
export const NORMAL_PERIOD: readonly [number, number] = [2001, 2020];
/** A monthly temperature this far from normal reaches the top or bottom of the pitch range. */
export const TIMELINE_FULL_SCALE_C = 4;

export type Resolution = "month" | "season" | "year";
export const RESOLUTIONS: readonly Resolution[] = ["month", "season", "year"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Meteorological seasons by month; December counts toward the next year's Dec–Feb. */
export const SEASONS = ["Dec–Feb", "Mar–May", "Jun–Aug", "Sep–Nov"] as const;

export type Slotted = { key: string; label: string; year: number; slot: number; value: number | null };

/** Monthly points ("YYYYMM") regrouped. A season or year with any missing month is missing, not averaged around the gap. */
export function slotted(points: readonly { date: string; value: number | null }[], resolution: Resolution): Slotted[] {
  const monthly = points
    .filter((point) => /^\d{6}$/.test(point.date))
    .map((point) => ({ year: Number(point.date.slice(0, 4)), month: Number(point.date.slice(4, 6)), value: point.value }));
  if (resolution === "month") {
    return monthly.map(({ year, month, value }) => ({
      key: `${year}${String(month).padStart(2, "0")}`,
      label: `${MONTHS[month - 1]} ${year}`,
      year,
      slot: month - 1,
      value,
    }));
  }
  const groups = new Map<string, { year: number; slot: number; values: (number | null)[] }>();
  for (const { year, month, value } of monthly) {
    const slot = resolution === "year" ? 0 : Math.floor((month % 12) / 3);
    const owner = resolution === "season" && month === 12 ? year + 1 : year;
    const key = resolution === "year" ? `${owner}` : `${owner}S${slot}`;
    const group = groups.get(key) ?? { year: owner, slot, values: [] };
    group.values.push(value);
    groups.set(key, group);
  }
  const need = resolution === "year" ? 12 : 3;
  return [...groups.entries()]
    .sort(([, a], [, b]) => a.year - b.year || a.slot - b.slot)
    .map(([key, group]) => {
      const complete = group.values.length === need && group.values.every((value) => value !== null && Number.isFinite(value));
      return {
        key,
        label: resolution === "year" ? `${group.year}` : `${SEASONS[group.slot]} ${group.year}`,
        year: group.year,
        slot: group.slot,
        value: complete ? (group.values as number[]).reduce((sum, value) => sum + value, 0) / need : null,
      };
    });
}

/** Normal per slot (month, season or year) from the values inside the normal period. */
export function slotNormals(items: readonly Slotted[], rain: boolean, period: readonly [number, number] = NORMAL_PERIOD): Map<number, BaselineStats> {
  const bySlot = new Map<number, (number | null)[]>();
  for (const item of items) {
    if (item.year < period[0] || item.year > period[1]) continue;
    bySlot.set(item.slot, [...(bySlot.get(item.slot) ?? []), item.value]);
  }
  const out = new Map<number, BaselineStats>();
  for (const [slot, values] of bySlot) {
    const stats = statsOf(values, rain);
    if (stats) out.set(slot, stats);
  }
  return out;
}

/** "Junes of 2001–2020", "Dec–Feb seasons of 2001–2020", "the years 2001–2020". */
export function normalBasis(resolution: Resolution, slot: number, period: readonly [number, number] = NORMAL_PERIOD): string {
  const span = `${period[0]}–${period[1]}`;
  if (resolution === "month") return `the ${MONTH_NAMES[slot]}s of ${span}`;
  if (resolution === "season") return `the ${SEASONS[slot]} seasons of ${span}`;
  return `the years ${span}`;
}

const EXPLAINED: readonly ExplainParameter[] = ["T2M", "PRECTOTCORR", "RH2M", "WS2M"];
const UNITS: Record<string, string> = { T2M: "°C", PRECTOTCORR: "mm/day", RH2M: "%", WS2M: "m/s", CLOUD_AMT: "%" };

export type TimelineRow = {
  index: number;
  key: string;
  label: string;
  year: number;
  slot: number;
  values: Record<string, number | null>;
  /** Against the normal for the same slot. Absent when the value or the normal is missing. */
  departures: Partial<Record<ExplainParameter, Departure>>;
  bells: Bell[];
};

export type Timeline = {
  rows: TimelineRow[];
  scape: Soundscape;
  resolution: Resolution;
  /** Rows whose temperature normal could be computed (needs the normal period inside the response). */
  normalsAvailable: boolean;
  referenceNote: string;
};

export type TimelineInput = {
  place: string;
  monthly: PowerMonthly;
  resolution: Resolution;
  /** Years shown and played; the response may reach further back for the normal. */
  from: number;
  to: number;
  config?: LabConfig;
};

const fmt = (value: number, digits = 1) => value.toFixed(digits);

export function buildTimeline({ place, monthly, resolution, from, to, config = DEFAULT_CONFIG }: TimelineInput): Timeline {
  const cfg = { ...effectiveConfig(config), anomalyZ: UNUSUAL_Z };
  const parameters = Object.keys(monthly.monthly);
  const grouped = Object.fromEntries(parameters.map((name) => [name, slotted(monthly.monthly[name] ?? [], resolution)])) as Record<string, Slotted[]>;
  const normals = Object.fromEntries(parameters.map((name) => [name, slotNormals(grouped[name], name === "PRECTOTCORR")])) as Record<string, Map<number, BaselineStats>>;
  const spine = (grouped.T2M ?? grouped[parameters[0]] ?? []).filter((item) => item.year >= from && item.year <= to);
  const byKey = Object.fromEntries(parameters.map((name) => [name, new Map(grouped[name].map((item) => [item.key, item]))])) as Record<string, Map<string, Slotted>>;
  const root = rootMidi(cfg);
  const referenceMidi = changeReferenceMidi(root, cfg.span);
  const requestUrl = monthly.request_url;

  const rows: TimelineRow[] = [];
  const steps: SoundStep[] = [];
  spine.forEach((item, index) => {
    const values: Record<string, number | null> = {};
    for (const name of parameters) values[name] = byKey[name].get(item.key)?.value ?? null;
    const departures: TimelineRow["departures"] = {};
    for (const name of EXPLAINED) {
      const found = departure(name, values[name], normals[name]?.get(item.slot));
      if (found) departures[name] = found;
    }
    const traces: LayerTrace[] = [];
    const absent: PowerVariable[] = [];
    const words: string[] = [];
    const trace = (variable: PowerVariable, layer: LayerTrace["layer"], normalized: number | null, rule: string, result: string) =>
      traces.push({ datasetId: "NASA POWER monthly", variable, layer, date: item.key, raw: values[variable] ?? null, unit: UNITS[variable] ?? "", normalized, rule, result });

    // Temperature departure from the normal → pitch around a fixed reference.
    const t = departures.T2M;
    let lead: SoundStep["lead"] = null;
    if (!t) {
      absent.push("T2M");
      trace("T2M", "pitch", null, "pitch = reference ± scale steps for (T − normal)", values.T2M === null ? "Missing: no lead note" : "No normal for this slot: no lead note");
    } else {
      const midi = changeToMidi(t.diff, "chromatic", root, cfg.span, TIMELINE_FULL_SCALE_C);
      lead = { midi, frequency: midiToFrequency(midi), name: midiName(midi) };
      trace("T2M", "pitch", 0.5 + Math.max(-1, Math.min(1, t.diff / TIMELINE_FULL_SCALE_C)) / 2, `pitch = ${midiName(referenceMidi)} at the normal, ±${TIMELINE_FULL_SCALE_C} °C to the ends (${normalBasis(resolution, item.slot)})`, `${lead.name}, ${fmt(lead.frequency)} Hz`);
      words.push(`${fmt(t.value)} °C, ${fmt(Math.abs(t.diff))} °C ${t.diff >= 0 ? "above" : "below"} normal, heard as ${lead.name}.`);
    }

    // Rain → percussion hits, on the soundscape's fixed rule.
    const rain = values.PRECTOTCORR ?? null;
    let hits = 0;
    if (rain === null) {
      absent.push("PRECTOTCORR");
      trace("PRECTOTCORR", "rhythm", null, MAPPINGS.PRECTOTCORR.rule, "Missing: no percussion");
    } else {
      const norm = normalizeFixed(rain, MAPPINGS.PRECTOTCORR.range);
      hits = rainHits(rain, norm);
      trace("PRECTOTCORR", "rhythm", norm, MAPPINGS.PRECTOTCORR.rule, hits === 0 ? "Dry: no hits" : `${hits} hit${hits === 1 ? "" : "s"}`);
      words.push(`Rain ${fmt(rain)} mm/day on average.`);
    }

    // Wind → intensity.
    const wind = values.WS2M ?? null;
    let intensity = windIntensity(0.5);
    if (wind === null) {
      absent.push("WS2M");
      trace("WS2M", "intensity", null, MAPPINGS.WS2M.rule, "Missing: neutral loudness used");
    } else {
      const norm = normalizeFixed(wind, MAPPINGS.WS2M.range);
      intensity = windIntensity(norm);
      trace("WS2M", "intensity", norm, MAPPINGS.WS2M.rule, `gain × ${fmt(intensity.gain, 2)}, brightness × ${fmt(intensity.brightness, 2)}`);
    }

    // Humidity → texture.
    const humidity = values.RH2M ?? null;
    let texture: SoundStep["texture"] = null;
    if (humidity === null) {
      absent.push("RH2M");
      trace("RH2M", "texture", null, MAPPINGS.RH2M.rule, "Missing: no texture");
    } else {
      const norm = normalizeFixed(humidity, MAPPINGS.RH2M.range);
      texture = humidityTexture(norm);
      trace("RH2M", "texture", norm, MAPPINGS.RH2M.rule, `noise ${fmt(texture.level, 3)}, cutoff ${Math.round(texture.cutoffHz)} Hz`);
    }

    // Cloud → density.
    const cloud = values.CLOUD_AMT ?? null;
    let voices: number[] = [];
    if (cloud === null) {
      absent.push("CLOUD_AMT");
      trace("CLOUD_AMT", "density", null, MAPPINGS.CLOUD_AMT.rule, "Missing: no added voices");
    } else {
      const norm = normalizeFixed(cloud, MAPPINGS.CLOUD_AMT.range);
      const count = cloudVoices(norm);
      voices = lead ? DENSITY_INTERVALS.slice(0, count).map((interval) => midiToFrequency(lead!.midi + interval)) : [];
      trace("CLOUD_AMT", "density", norm, MAPPINGS.CLOUD_AMT.rule, `${count} added voice${count === 1 ? "" : "s"}`);
    }

    // Departures from normal → bells.
    const bells: Bell[] = [];
    for (const name of EXPLAINED) {
      const found = departures[name];
      if (!found || found.z === null || levelOf(found.z) === "normal") continue;
      const variable = name as PowerVariable;
      bells.push({ variable, frequency: ANOMALY_BELL_HZ[variable], level: bellLevel(found.z), z: found.z });
      const own = traces.find((entry) => entry.variable === variable && entry.layer !== "anomaly");
      if (own) own.result = `${own.result} · bell, z ${fmt(found.z)} against normal`;
      trace(variable, "anomaly", found.z, `z = (x − normal) / sd over ${normalBasis(resolution, item.slot)}${name === "PRECTOTCORR" ? " (rain: x = ln(1 + P))" : ""}; bell when |z| ≥ ${UNUSUAL_Z}`, `Bell, z ${fmt(found.z)}`);
    }
    if (bells.length > 0) words.push(`Unusual against normal: ${bells.map((bell) => `${MAPPINGS[bell.variable].name.toLowerCase()} (z ${fmt(bell.z)})`).join(", ")}.`);
    if (absent.length > 0) words.push(`Missing: ${absent.join(", ")}.`);

    rows.push({ index, key: item.key, label: item.label, year: item.year, slot: item.slot, values, departures, bells });
    steps.push({
      index,
      date: item.key,
      label: item.label,
      lead,
      intensity,
      hits,
      texture,
      vibrato: null,
      voices,
      bells,
      pulse: 0,
      traces,
      missing: absent,
      caption: `${place}, ${item.label}. ${words.join(" ")}`,
      source: `NASA POWER monthly · ${place}`,
      requestUrl,
    });
  });

  const missing = { T2M: 0, PRECTOTCORR: 0, WS2M: 0, RH2M: 0, PS: steps.length, CLOUD_AMT: 0 } as Record<PowerVariable, number>;
  for (const step of steps) for (const variable of step.missing) missing[variable] += 1;
  const first = rows[0]?.label ?? `${from}`;
  const last = rows[rows.length - 1]?.label ?? `${to}`;
  return {
    rows,
    resolution,
    normalsAvailable: rows.some((row) => row.departures.T2M !== undefined),
    referenceNote: midiName(referenceMidi),
    scape: {
      title: `${place}, ${first} to ${last}`,
      place,
      latitude: monthly.latitude,
      longitude: monthly.longitude,
      start: rows[0]?.key ?? "",
      end: rows[rows.length - 1]?.key ?? "",
      dataset: monthly.source,
      requestUrl,
      config: cfg,
      steps,
      missing,
    },
  };
}

/** First year of POWER's monthly MERRA-2 record. */
export const MONTHLY_FIRST_YEAR = 1981;

/**
 * The years to ask POWER for: the chosen span plus the normal period, and one
 * year before both so the first Dec–Feb season has its December.
 */
export function requestYears(from: number, to: number, period: readonly [number, number] = NORMAL_PERIOD): [number, number] {
  return [Math.max(MONTHLY_FIRST_YEAR, Math.min(from, period[0]) - 1), Math.max(to, period[1])];
}
