import { describeGenerated, type TraceRecord } from "../audio/trace.ts";
import { robustAnomalies } from "../science/anomaly.ts";
import { robustNormalize } from "../science/normalize.ts";
import type { PitchFrom, SonicEvent, TrackDetail } from "../types.ts";

const WORD: Record<PitchFrom, string> = { luminance: "Brightness", warmth: "Warmth", contrast: "Contrast" };

/** Per-note traces for a jukebox run, recomputed from the same samples the score used. */
export function jukeboxTracer(
  detail: TrackDetail,
  pitchFrom: PitchFrom,
  events: readonly SonicEvent[],
  threshold: number,
): (index: number) => TraceRecord | null {
  const raw = detail.samples.map((sample) => sample[pitchFrom]);
  const scaled = robustNormalize(raw);
  const anomalies = robustAnomalies(raw, threshold);
  const window = scaled.low !== null && scaled.high !== null ? { low: scaled.low, high: scaled.high } : null;
  return (index) => {
    const event = events[index];
    if (!event) return null;
    const sample = detail.samples[event.sourceIndex];
    if (!sample) return null;
    return {
      source: `NASA SVS ${detail.svs_id} · ${detail.title}`,
      sourceUrl: detail.page_url,
      where: sample.label,
      measured: [
        { name: WORD[pitchFrom], value: sample[pitchFrom].toFixed(3), unit: "0–1" },
        { name: "Mean R G B", value: [sample.red, sample.green, sample.blue].map((value) => value.toFixed(2)).join(" ") },
      ],
      normalized: scaled.values[event.sourceIndex] ?? null,
      window,
      z: anomalies[event.sourceIndex]?.z ?? null,
      threshold,
      outlier: event.accent,
      frequency: event.frequency,
      generated: describeGenerated(event),
    };
  };
}
