import { formatLatLon } from "../format.ts";
import { midiName, scoreSample, type ScoreOutput } from "../science/score.ts";
import type { SonicSettings } from "../types.ts";

/** A point under a hand on a Blue Marble globe. Luminance is null until the GIBS image has loaded. */
export type BlueMarbleSample = { lat: number; lon: number; luminance: number | null };

/**
 * What a hand on the Blue Marble plays, and the caption that says so. The
 * pitch is the pixel's brightness on the current scale: an image value, not a
 * measurement, and the caption says that too.
 */
export function blueMarbleTouch(sample: BlueMarbleSample, settings: SonicSettings): { note: ScoreOutput | null; caption: string } {
  const where = formatLatLon(sample.lat, sample.lon, 1);
  if (sample.luminance === null) return { note: null, caption: `Blue Marble is still loading from NASA GIBS at ${where}.` };
  const note = scoreSample({ norm: sample.luminance, z: null, ...settings });
  if (!note) return { note: null, caption: `No brightness could be read at ${where}.` };
  return {
    note,
    caption: `Blue Marble under your hand, ${where}. Brightness ${sample.luminance.toFixed(2)} is heard as ${midiName(note.midi)}. This is the NASA image, not a temperature.`,
  };
}
