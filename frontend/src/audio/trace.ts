import { noteLabel } from "../science/score.ts";
import type { SonicEvent } from "../types.ts";
import { MAPPINGS } from "./mappings.ts";
import type { Soundscape, SoundStep } from "./soundscape.ts";

/**
 * Where one note came from: the measurement, how it was scaled, and what the
 * instrument added rather than measured. Every playback in the app can attach
 * one per step; the dock's trace drawer renders it.
 */
export type TraceMeasure = {
  name: string;
  value: string;
  unit?: string;
  /** What this value became in the sound, when the step has several layers. */
  heard?: string;
};

export type TraceRecord = {
  /** e.g. "NASA SVS 5313 · Change in Night Lights between 2012 and 2023" */
  source: string;
  sourceUrl: string | null;
  /** Where in the source: "West-to-east slice 7 of 24", "12 Jun 2026". */
  where: string;
  /** Read straight from the NASA file or API response. */
  measured: TraceMeasure[];
  /** 0–1 after scaling, with the series' 5th–95th percentile window when that was the scale. */
  normalized: number | null;
  window: { low: number; high: number } | null;
  /** Robust z against this series, and the threshold in force. */
  z: number | null;
  threshold: number;
  outlier: boolean;
  frequency: number;
  /** Things the instrument chose, which carry no data: timbre, harmony, ping. */
  generated: string[];
};

/**
 * The fallback trace for a sequence that has no tracer of its own: the label
 * and frequency of the note and its outlier flag.
 */
export function traceFromEvent(event: SonicEvent & { trace?: Partial<TraceRecord> }, source: string, threshold: number): TraceRecord {
  const supplied = event.trace;
  return {
    source: supplied?.source ?? source,
    sourceUrl: supplied?.sourceUrl ?? null,
    where: supplied?.where ?? event.label,
    measured: supplied?.measured ?? [],
    normalized: supplied?.normalized ?? null,
    window: supplied?.window ?? null,
    z: supplied?.z ?? null,
    threshold: supplied?.threshold ?? threshold,
    outlier: supplied?.outlier ?? event.accent,
    frequency: supplied?.frequency ?? event.frequency,
    generated: supplied?.generated ?? describeGenerated(event),
  };
}

/** The trace of one soundscape day: every POWER variable, its value and what it became. */
export function traceFromStep(scape: Soundscape, step: SoundStep): TraceRecord {
  const layered = step.traces.filter((trace) => trace.layer !== "anomaly" && trace.layer !== "pulse");
  const pitch = layered.find((trace) => trace.layer === "pitch") ?? null;
  const zTrace = step.traces.find((trace) => trace.layer === "pulse") ?? null;
  const generated = [`${scape.config.instrument} instrument (timbre)`];
  if (step.voices.length > 0) generated.push("chord voices are fixed intervals above the lead");
  if (step.bells.length > 0) generated.push("anomaly bells are fixed pitches per variable");
  return {
    source: step.source ?? `NASA POWER daily · ${scape.place}`,
    sourceUrl: step.requestUrl || scape.requestUrl || null,
    where: step.label,
    measured: layered.map((trace) => ({
      name: MAPPINGS[trace.variable].name,
      value: trace.raw === null ? "missing" : trace.raw.toFixed(trace.variable === "PS" ? 2 : 1),
      unit: trace.raw === null ? undefined : trace.unit,
      heard: trace.result,
    })),
    normalized: pitch?.normalized ?? null,
    window: null,
    z: zTrace?.normalized ?? null,
    threshold: scape.config.anomalyZ,
    outlier: step.bells.length > 0,
    frequency: step.lead?.frequency ?? 0,
    generated,
  };
}

const INTERVALS: [number, string][] = [
  [0.5, "an octave below"],
  [1.25, "a major third above"],
  [1.5, "a fifth above"],
  [2, "an octave above"],
];

export function describeGenerated(event: Pick<SonicEvent, "wave" | "accent" | "harmony" | "noise" | "frequency">): string[] {
  const parts = [`${event.wave} oscillator (timbre)`];
  if (event.accent) parts.push("octave ping on an outlier");
  if (event.harmony) {
    const ratio = event.harmony / event.frequency;
    const named = INTERVALS.find(([value]) => Math.abs(value - ratio) < 0.01)?.[1] ?? `${ratio.toFixed(2)}× the note`;
    parts.push(`${named}, as harmony`);
  }
  if (event.noise > 0.08) parts.push("filtered noise texture");
  return parts;
}

/** One line for screen readers and the caption: the whole trace in words. */
export function traceSentence(trace: TraceRecord): string {
  const note = noteLabel(trace.frequency);
  const measured = trace.measured.map((item) => `${item.name} ${item.value}${item.unit ? ` ${item.unit}` : ""}`).join(", ");
  const scaled = trace.normalized === null ? "" : ` Scaled to ${trace.normalized.toFixed(2)}${trace.window ? ` of ${trace.window.low.toFixed(2)}–${trace.window.high.toFixed(2)}` : " of this series' range"}.`;
  const z = trace.z === null ? "" : ` Robust z ${trace.z.toFixed(2)}, ${trace.outlier ? "an outlier" : "within range"} at |z| ≥ ${trace.threshold}.`;
  return `${trace.source}, ${trace.where}.${measured ? ` Measured ${measured}.` : ""}${scaled}${z}${note ? ` Heard as ${note.note}, ${note.hz}.` : ""}`;
}
