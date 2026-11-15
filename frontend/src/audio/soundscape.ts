import { median, robustAnomalies } from "../science/anomaly.ts";
import { finiteValues, isMissing, robustNormalize } from "../science/normalize.ts";
import { frequencyToMidi, midiName, midiToFrequency, valueToMidiSteps } from "../science/score.ts";
import type { PowerSeries } from "../types.ts";
import { formatDay } from "./build.ts";
import { effectiveConfig, rootMidi, scaleSteps, type LabConfig } from "./labConfig.ts";
import {
  ANOMALY_BELL_HZ,
  ANOMALY_MAPPING,
  DENSITY_INTERVALS,
  MAPPINGS,
  POWER_DAILY,
  POWER_VARIABLES,
  PULSE_MAPPING,
  applySensitivity,
  bellLevel,
  cloudVoices,
  humidityTexture,
  normalizeFixed,
  pressureModulation,
  pulseLevel,
  rainHits,
  windIntensity,
  type LayerId,
  type PowerVariable,
} from "./mappings.ts";

/** Where one sound came from. Every layer of every step carries one. */
export type LayerTrace = {
  datasetId: string;
  variable: PowerVariable;
  layer: LayerId;
  date: string;
  /** The POWER value as published, or null when missing. */
  raw: number | null;
  unit: string;
  /** 0–1 after normalization and sensitivity, or for PS the departure in kPa. Null when missing. */
  normalized: number | null;
  rule: string;
  /** What the rule produced, in words. */
  result: string;
};

export type Bell = { variable: PowerVariable; frequency: number; level: number; z: number };

export type SoundStep = {
  index: number;
  date: string;
  label: string;
  /** Null when temperature is missing: no lead note that day. */
  lead: { midi: number; frequency: number; name: string } | null;
  intensity: { gain: number; brightness: number };
  hits: number;
  texture: { level: number; cutoffHz: number } | null;
  vibrato: { depthCents: number; rateHz: number } | null;
  /** Frequencies of the added chord voices. */
  voices: number[];
  bells: Bell[];
  pulse: number;
  traces: LayerTrace[];
  missing: PowerVariable[];
  caption: string;
  /** Per-step source and request, when one soundscape joins several POWER requests (Sound Map, Timeline). */
  source?: string;
  requestUrl?: string;
};

export type Soundscape = {
  title: string;
  place: string;
  latitude: number;
  longitude: number;
  start: string;
  end: string;
  dataset: string;
  requestUrl: string;
  /** The effective config: in Scientific Mode, the locked one. */
  config: LabConfig;
  steps: SoundStep[];
  /** Days missing per variable. */
  missing: Record<PowerVariable, number>;
};

export const DISPLAY_UNITS: Record<string, string> = { C: "°C" };

function unitOf(series: PowerSeries, variable: PowerVariable): string {
  const unit = series.units[variable];
  if (!unit) return MAPPINGS[variable].unit;
  return DISPLAY_UNITS[unit] ?? unit;
}

function column(series: PowerSeries, variable: PowerVariable): (number | null)[] {
  const points = series.parameters[variable];
  return series.dates.map((date, index) => {
    const point = points?.[index]?.date === date ? points[index] : points?.find((item) => item.date === date);
    const value = point?.value;
    return value === null || value === undefined || isMissing(value) ? null : value;
  });
}

/**
 * Keep a pitch inside the band by whole octaves, so the pitch class (and the scale)
 * is preserved. If the band is narrower than an octave, the nearest edge wins.
 */
export function foldIntoBand(midi: number, lowHz: number, highHz: number): number {
  const low = frequencyToMidi(lowHz);
  const high = frequencyToMidi(highHz);
  let value = midi;
  while (value < low && value + 12 <= high) value += 12;
  while (value > high && value - 12 >= low) value -= 12;
  return Math.min(Math.max(value, Math.ceil(low)), Math.floor(high));
}

/**
 * Rain is zero on most days and heavy on a few, so its anomalies are scored on
 * ln(1 + P). On the raw values the median absolute deviation is tiny and every
 * shower would look extreme.
 */
export function anomalyBasis(variable: PowerVariable, values: readonly (number | null)[]): (number | null)[] {
  if (variable !== "PRECTOTCORR") return [...values];
  return values.map((value) => (value === null ? null : Math.log1p(Math.max(0, value))));
}

const fmt = (value: number, digits = 1) => value.toFixed(digits);

/**
 * Build a multi-variable soundscape from a NASA POWER daily series.
 * Pure: the same series and config always give the same soundscape.
 */
export function buildSoundscape(series: PowerSeries, config: LabConfig, place = "Selected point"): Soundscape {
  const cfg = effectiveConfig(config);
  const columns = Object.fromEntries(POWER_VARIABLES.map((variable) => [variable, column(series, variable)])) as Record<
    PowerVariable,
    (number | null)[]
  >;
  const windowNorm = Object.fromEntries(
    POWER_VARIABLES.map((variable) => [variable, robustNormalize(columns[variable]).values]),
  ) as Record<PowerVariable, (number | null)[]>;
  const anomalies = Object.fromEntries(
    POWER_VARIABLES.map((variable) => [variable, robustAnomalies(anomalyBasis(variable, columns[variable]), cfg.anomalyZ)]),
  ) as Record<PowerVariable, ReturnType<typeof robustAnomalies>>;
  const pressureCenter = median(finiteValues(columns.PS));
  const steps = scaleSteps(cfg);
  const root = rootMidi(cfg);

  const normalized = (variable: PowerVariable, index: number): number | null => {
    const raw = columns[variable][index];
    if (raw === null) return null;
    const base = cfg.normalization === "window" ? windowNorm[variable][index] : normalizeFixed(raw, MAPPINGS[variable].range);
    return base === null ? null : applySensitivity(base, cfg.sensitivity);
  };

  const missing = Object.fromEntries(
    POWER_VARIABLES.map((variable) => [variable, columns[variable].filter((value) => value === null).length]),
  ) as Record<PowerVariable, number>;

  const built: SoundStep[] = series.dates.map((date, index) => {
    const label = formatDay(date);
    const traces: LayerTrace[] = [];
    const absent: PowerVariable[] = [];
    const trace = (variable: PowerVariable, norm: number | null, result: string, layer: LayerId = MAPPINGS[variable].layer, rule = ruleFor(variable, cfg)) => {
      const raw = columns[variable][index];
      traces.push({ datasetId: POWER_DAILY.id, variable, layer, date, raw, unit: unitOf(series, variable), normalized: norm, rule, result });
    };
    const words: string[] = [];

    // Temperature -> pitch.
    const tNorm = normalized("T2M", index);
    let lead: SoundStep["lead"] = null;
    if (tNorm === null) {
      absent.push("T2M");
      trace("T2M", null, "Missing: no lead note this day");
    } else {
      const midi = foldIntoBand(valueToMidiSteps(tNorm, steps, root, cfg.span), cfg.lowHz, cfg.highHz);
      const frequency = midiToFrequency(midi);
      lead = { midi, frequency, name: midiName(midi) };
      trace("T2M", tNorm, `${lead.name}, ${fmt(frequency)} Hz`);
      words.push(`${fmt(columns.T2M[index] as number)} ${unitOf(series, "T2M")} heard as ${lead.name} (${Math.round(frequency)} Hz).`);
    }

    // Precipitation -> rhythm.
    const pNorm = normalized("PRECTOTCORR", index);
    let hits = 0;
    if (pNorm === null) {
      absent.push("PRECTOTCORR");
      trace("PRECTOTCORR", null, "Missing: no percussion this day");
    } else {
      const mm = columns.PRECTOTCORR[index] as number;
      hits = rainHits(mm, pNorm);
      trace("PRECTOTCORR", pNorm, hits === 0 ? "Dry: no hits" : `${hits} hit${hits === 1 ? "" : "s"}`);
      words.push(hits === 0 ? "Dry." : `Rain ${fmt(mm)} mm/day, ${hits} hit${hits === 1 ? "" : "s"}.`);
    }

    // Wind -> intensity. Missing wind leaves the neutral middle setting.
    const wNorm = normalized("WS2M", index);
    let intensity = windIntensity(0.5);
    if (wNorm === null) {
      absent.push("WS2M");
      trace("WS2M", null, "Missing: neutral loudness used");
    } else {
      intensity = windIntensity(wNorm);
      trace("WS2M", wNorm, `gain × ${fmt(intensity.gain, 2)}, brightness × ${fmt(intensity.brightness, 2)}`);
      words.push(`Wind ${fmt(columns.WS2M[index] as number)} m/s.`);
    }

    // Humidity -> texture.
    const hNorm = normalized("RH2M", index);
    let texture: SoundStep["texture"] = null;
    if (hNorm === null) {
      absent.push("RH2M");
      trace("RH2M", null, "Missing: no texture this day");
    } else {
      texture = humidityTexture(hNorm);
      trace("RH2M", hNorm, `noise ${fmt(texture.level, 3)}, cutoff ${Math.round(texture.cutoffHz)} Hz`);
      words.push(`Humidity ${Math.round(columns.RH2M[index] as number)} %.`);
    }

    // Pressure -> modulation, against the window median.
    const pressure = columns.PS[index];
    let vibrato: SoundStep["vibrato"] = null;
    if (pressure === null || pressureCenter === null) {
      absent.push("PS");
      trace("PS", null, "Missing: steady tone");
    } else {
      const delta = pressure - pressureCenter;
      vibrato = pressureModulation(delta);
      trace("PS", delta, `vibrato ${fmt(vibrato.depthCents)} cents at ${vibrato.rateHz} Hz`);
      words.push(
        Math.abs(delta) < 0.05
          ? "Pressure at the window median."
          : `Pressure ${fmt(Math.abs(delta), 2)} kPa ${delta < 0 ? "below" : "above"} the window median.`,
      );
    }

    // Cloud -> density.
    const cNorm = normalized("CLOUD_AMT", index);
    let voices: number[] = [];
    if (cNorm === null) {
      absent.push("CLOUD_AMT");
      trace("CLOUD_AMT", null, "Missing: no added voices");
    } else {
      const count = cloudVoices(cNorm);
      voices = lead ? DENSITY_INTERVALS.slice(0, count).map((interval) => midiToFrequency(lead!.midi + interval)) : [];
      trace("CLOUD_AMT", cNorm, `${count} added voice${count === 1 ? "" : "s"}`);
      words.push(`Cloud ${Math.round(columns.CLOUD_AMT[index] as number)} %.`);
    }

    // Anomalies -> bells.
    const bells: Bell[] = [];
    for (const variable of POWER_VARIABLES) {
      const point = anomalies[variable][index];
      if (!point?.flagged || point.z === null) continue;
      bells.push({ variable, frequency: ANOMALY_BELL_HZ[variable], level: bellLevel(point.z), z: point.z });
      trace(variable, point.z, `Anomaly bell, z ${fmt(point.z)}`, "anomaly", ANOMALY_MAPPING.rule);
    }
    if (bells.length > 0) {
      words.push(`Unusual for this window: ${bells.map((bell) => `${MAPPINGS[bell.variable].name.toLowerCase()} (z ${fmt(bell.z)})`).join(", ")}.`);
    }

    const tz = anomalies.T2M[index]?.z ?? null;
    const pulse = pulseLevel(tz);
    trace("T2M", tz, `pulse level ${fmt(pulse, 2)}`, "pulse", PULSE_MAPPING.rule);
    if (absent.length > 0) words.push(`Missing in POWER: ${absent.join(", ")}.`);

    return {
      index,
      date,
      label,
      lead,
      intensity,
      hits,
      texture,
      vibrato,
      voices,
      bells,
      pulse,
      traces,
      missing: absent,
      caption: `${place}, ${label}. ${words.join(" ")}`,
    };
  });

  return {
    title: `${place}, ${formatDay(series.start)} to ${formatDay(series.end)}`,
    place,
    latitude: series.latitude,
    longitude: series.longitude,
    start: series.start,
    end: series.end,
    dataset: series.source || POWER_DAILY.name,
    requestUrl: series.request_url,
    config: cfg,
    steps: built,
    missing,
  };
}

/**
 * The rule as it applies under this config. Artistic changes to normalization
 * and sensitivity are written in front of the reference rule, so the trace
 * never shows a formula that was not used.
 */
export function ruleFor(variable: PowerVariable, config: Pick<LabConfig, "normalization" | "sensitivity">): string {
  const base = MAPPINGS[variable].rule;
  if (MAPPINGS[variable].range.scale === "anomaly") return base;
  const parts: string[] = [];
  if (config.normalization === "window") parts.push("n = (x − P5) / (P95 − P5) of this window, clamped, instead of the fixed range");
  if (Math.abs(config.sensitivity - 1) > 1e-9) parts.push(`then n = n^(1/${Number(config.sensitivity.toFixed(2))})`);
  return parts.length === 0 ? base : `${parts.join("; ")}. Reference: ${base}`;
}

/** Seconds per step for a config and playback rate. */
export function stepSeconds(bpm: number, rate = 1): number {
  const safeRate = Math.min(4, Math.max(0.25, rate));
  return 60 / (Math.min(200, Math.max(40, bpm)) * safeRate);
}

/** The layers that actually make sound on this step (a dry day has no rhythm, and so on). */
export function soundingLayers(step: SoundStep, heartbeat: boolean): Set<LayerId> {
  const layers = new Set<LayerId>();
  if (step.lead) layers.add("pitch").add("intensity");
  if (step.hits > 0) layers.add("rhythm");
  if (step.texture) layers.add("texture");
  if (step.lead && step.vibrato && step.vibrato.depthCents > 0.5) layers.add("modulation");
  if (step.voices.length > 0) layers.add("density");
  if (step.bells.length > 0) layers.add("anomaly");
  if (heartbeat) layers.add("pulse");
  return layers;
}
