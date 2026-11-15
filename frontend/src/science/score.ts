import type { ScaleName } from "../types.ts";

export const SCALES: Record<ScaleName, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/** Map 0–1 onto a scale so both ends land on the tonic. */
export function valueToMidi(
  norm: number,
  scale: ScaleName,
  rootMidi: number,
  octaves: number,
): number {
  return valueToMidiSteps(norm, SCALES[scale], rootMidi, octaves);
}

/** Same rule for any set of semitone steps within an octave (custom scales). Steps must include 0. */
export function valueToMidiSteps(
  norm: number,
  steps: readonly number[],
  rootMidi: number,
  octaves: number,
): number {
  const degrees = steps.length > 0 ? steps : [0];
  const span = Math.max(1, octaves) * degrees.length;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(norm) ? norm : 0));
  const degree = Math.round(clamped * span);
  if (degree >= span) return rootMidi + Math.max(1, octaves) * 12;
  const octave = Math.floor(degree / degrees.length);
  return rootMidi + octave * 12 + degrees[degree % degrees.length];
}

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

/** Note name and frequency as written in readouts: "A4 · 440.0 Hz". Null for silence. */
export function noteLabel(frequency: number | null | undefined): { note: string; hz: string } | null {
  if (frequency == null || !Number.isFinite(frequency) || frequency <= 0) return null;
  return { note: midiName(frequencyToMidi(frequency)), hz: `${frequency.toFixed(1)} Hz` };
}

/** Cents from the nearest equal-tempered note, -50 to +50. */
export function centsOff(frequency: number): number {
  const midi = frequencyToMidi(frequency);
  return Math.round((midi - Math.round(midi)) * 100);
}

export type ScoreInput = {
  norm: number | null;
  z: number | null;
  scale: ScaleName;
  rootMidi: number;
  octaves: number;
  anomalyZ: number;
};

export type ScoreOutput = {
  frequency: number;
  midi: number;
  gain: number;
  filterHz: number;
  noise: number;
  accent: boolean;
  wave: OscillatorType;
};

export function scoreSample(input: ScoreInput): ScoreOutput | null {
  if (input.norm === null || !Number.isFinite(input.norm)) return null;
  const midi = valueToMidi(input.norm, input.scale, input.rootMidi, input.octaves);
  const z = input.z;
  const accent = z !== null && Math.abs(z) >= input.anomalyZ;
  const gain = Math.min(0.85, 0.18 + input.norm * 0.32 + (accent ? 0.22 : 0));
  const filterHz = 420 + input.norm * 2800 + (accent ? 700 : 0);
  const noise = accent && z !== null ? Math.min(0.45, 0.12 + Math.abs(z) * 0.04) : 0.04;
  return {
    frequency: midiToFrequency(midi),
    midi,
    gain,
    filterHz,
    noise,
    accent,
    wave: accent ? "triangle" : "sine",
  };
}

/**
 * Time Machine change scale: a change of ±CHANGE_FULL_SCALE_C °C reaches the
 * top or bottom of the range; larger changes clamp there.
 */
export const CHANGE_FULL_SCALE_C = 10;

/** The reference note for zero change: the tonic in the middle of the range. */
export function changeReferenceMidi(rootMidi: number, octaves: number): number {
  return rootMidi + 12 * Math.ceil(Math.max(1, octaves) / 2);
}

/**
 * Map a signed change onto scale degrees around a fixed reference tonic.
 * Zero is always the reference note; +x and −x are the same number of scale
 * degrees above and below it (symmetric), whatever the other changes are.
 */
export function changeToMidi(
  delta: number,
  scale: ScaleName,
  rootMidi: number,
  octaves: number,
  fullScale = CHANGE_FULL_SCALE_C,
): number {
  const degrees = SCALES[scale];
  const perSide = Math.max(1, Math.ceil((Math.max(1, octaves) * degrees.length) / 2));
  const ratio = Number.isFinite(delta) && fullScale > 0 ? Math.min(1, Math.max(-1, delta / fullScale)) : 0;
  // Round the magnitude so +x and −x land the same number of steps from the reference.
  const steps = Math.sign(ratio) * Math.round(Math.abs(ratio) * perSide);
  const octave = Math.floor(steps / degrees.length);
  const within = ((steps % degrees.length) + degrees.length) % degrees.length;
  return changeReferenceMidi(rootMidi, octaves) + octave * 12 + degrees[within];
}
