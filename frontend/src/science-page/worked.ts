import { midiName, midiToFrequency, SCALES, scoreSample } from "../science/score.ts";
import type { SonicSettings } from "../types.ts";

export type WorkedStep = { label: string; formula: string; result: string };

/**
 * One value through the whole chain, written out with the same functions the
 * instrument plays with. Used by the methodology page's worked example.
 */
export function workedExample(
  value: number,
  low: number,
  high: number,
  z: number,
  settings: Pick<SonicSettings, "scale" | "rootMidi" | "octaves" | "anomalyZ">,
): WorkedStep[] {
  const span = high - low;
  const norm = Math.abs(span) < 1e-9 ? 0.5 : Math.min(1, Math.max(0, (value - low) / span));
  const steps = SCALES[settings.scale];
  const degrees = settings.octaves * steps.length;
  const degree = Math.round(norm * degrees);
  const scored = scoreSample({ norm, z, ...settings });
  const midi = scored?.midi ?? settings.rootMidi;
  const accent = scored?.accent ?? false;
  return [
    { label: "Scale to 0–1", formula: `clamp((${fmt(value)} − ${fmt(low)}) ÷ (${fmt(high)} − ${fmt(low)}))`, result: norm.toFixed(3) },
    { label: "Scale degree", formula: `round(${norm.toFixed(3)} × ${settings.octaves} octaves × ${steps.length} notes)`, result: String(degree) },
    { label: "MIDI note", formula: `tonic ${settings.rootMidi} + 12 × ⌊${degree} ÷ ${steps.length}⌋ + ${settings.scale}[${degree % steps.length}]`, result: `${midi} (${midiName(midi)})` },
    { label: "Frequency", formula: `440 × 2^((${midi} − 69) ÷ 12)`, result: `${midiToFrequency(midi).toFixed(2)} Hz` },
    { label: "Outlier", formula: `|z| = ${Math.abs(z).toFixed(2)} ≥ ${settings.anomalyZ}?`, result: accent ? "yes: louder, brighter, triangle + ping" : "no" },
    { label: "Loudness", formula: `min(0.85, 0.18 + 0.32 × ${norm.toFixed(3)}${accent ? " + 0.22" : ""})`, result: (scored?.gain ?? 0).toFixed(3) },
  ];
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
