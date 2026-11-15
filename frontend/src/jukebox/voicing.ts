import type { PitchFrom, SonicEvent, TrackDetail } from "../types.ts";

/**
 * Each visualization's soundscape. Pitch, loudness, brightness and the outlier
 * ping still come from the measured picture (audio/build.ts); a voicing only
 * chooses the timbre and texture around them. It is a design choice and
 * carries no data, and the page says so.
 */
export type Voicing = {
  name: string;
  wave: OscillatorType;
  /** Harmony as a frequency ratio to the note, or null. */
  harmony: number | null;
  harmonyGain: number;
  /** Minimum filtered-noise level (0–1, engine adds noise above 0.08). */
  texture: number;
  /** Why this timbre suits the subject. Not a measurement. */
  why: string;
};

const VOICINGS: Record<number, Voicing> = {
  5313: { name: "Night choir", wave: "sine", harmony: 2, harmonyGain: 0.04, texture: 0, why: "Clear sine tones with an octave shimmer, like lights seen from orbit." },
  3912: { name: "Ocean swell", wave: "triangle", harmony: 0.5, harmonyGain: 0.05, texture: 0.1, why: "A rounder tone with an octave below and a soft wash for moving water." },
  5669: { name: "Haze", wave: "sine", harmony: 1.5, harmonyGain: 0.03, texture: 0.14, why: "A hiss under the notes, for particles suspended in air." },
  5533: { name: "Model run", wave: "triangle", harmony: null, harmonyGain: 0, texture: 0.09, why: "A plain, slightly grainy tone for a computed field." },
  5425: { name: "Current", wave: "sine", harmony: 0.5, harmonyGain: 0.06, texture: 0.1, why: "A low octave under each note, for deep western-boundary flow." },
  5196: { name: "Carbon drone", wave: "triangle", harmony: 1.5, harmonyGain: 0.05, texture: 0, why: "An open fifth, sustained, for a gas that spreads and mixes." },
  5011: { name: "Static", wave: "sine", harmony: null, harmonyGain: 0, texture: 0.2, why: "Crackle under each note, for lightning seen from the ISS." },
  4960: { name: "Rain filament", wave: "sine", harmony: 1.5, harmonyGain: 0.04, texture: 0.18, why: "A rain-like noise bed, for a river of water vapour." },
  4950: { name: "Canopy", wave: "triangle", harmony: 1.25, harmonyGain: 0.04, texture: 0, why: "A major third above, warm and woody, for forest height." },
};

export const DEFAULT_VOICING: Voicing = {
  name: "Plain",
  wave: "sine",
  harmony: null,
  harmonyGain: 0,
  texture: 0,
  why: "A plain sine tone.",
};

export function voicingFor(svsId: number): Voicing {
  return VOICINGS[svsId] ?? DEFAULT_VOICING;
}

/** Re-voice measured events. Frequencies, gains, filters and outlier flags are left exactly as built. */
export function applyVoicing(events: readonly SonicEvent[], voicing: Voicing): SonicEvent[] {
  return events.map((event) => ({
    ...event,
    // Outliers keep the triangle the score gives them, so they still stand out.
    wave: event.accent ? event.wave : voicing.wave,
    harmony: voicing.harmony ? event.frequency * voicing.harmony : event.harmony,
    harmonyGain: voicing.harmony ? voicing.harmonyGain : event.harmonyGain,
    noise: Math.max(event.noise, voicing.texture),
  }));
}

const PITCH_SOURCE: Record<PitchFrom, string> = {
  luminance: "the brightness of the picture (0.2126 R + 0.7152 G + 0.0722 B)",
  warmth: "its warmth, red minus blue, which is how this palette paints the variable",
  contrast: "its contrast, the spread of brightness in each slice",
};

/** The sound explanation shown under each visualization. */
export function explainTrack(detail: Pick<TrackDetail, "method" | "samples" | "svs_id">, pitchFrom: PitchFrom): string[] {
  const voicing = voicingFor(detail.svs_id);
  const steps = detail.samples.length;
  const read =
    detail.method === "spatial-scan"
      ? `The picture is cut into ${steps} vertical slices and read from west to east, one slice per note. The scan line sweeps across the slice that is sounding.`
      : `${steps} frames are sampled across the movie, one frame per note, in the order NASA rendered them.`;
  return [
    read,
    `Pitch follows ${PITCH_SOURCE[pitchFrom]}. Each series is scaled between its own 5th and 95th percentiles, so the quietest and loudest slices are this picture's, not a global scale.`,
    "Brighter values are also louder and open the filter. A slice far from the picture's median (robust z at or above the threshold) is an outlier: a triangle tone and a short octave ping.",
    `Soundscape: “${voicing.name}”. ${voicing.why} The timbre is chosen by the instrument and carries no data.`,
  ];
}
