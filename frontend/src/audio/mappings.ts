/**
 * The sonification mappings, as data. Each variable has one fixed rule, and every
 * rule has a plain explanation and a scientific one. The Science page renders this
 * table directly, so the words and the arithmetic cannot drift apart: the pure
 * functions below are the same ones the soundscape builder calls.
 */

/** The six NASA POWER daily variables the soundscape listens to. */
export type PowerVariable = "T2M" | "PRECTOTCORR" | "WS2M" | "RH2M" | "PS" | "CLOUD_AMT";

/** One layer of the mix per variable, plus the anomaly events and the heartbeat pulse. */
export type LayerId = "pitch" | "rhythm" | "intensity" | "texture" | "modulation" | "density" | "anomaly" | "pulse";

export const POWER_VARIABLES: readonly PowerVariable[] = ["T2M", "PRECTOTCORR", "WS2M", "RH2M", "PS", "CLOUD_AMT"];

export const LAYERS: readonly LayerId[] = ["pitch", "rhythm", "intensity", "texture", "modulation", "density", "anomaly", "pulse"];

/** NASA POWER request string for the soundscape. */
export const SOUNDSCAPE_PARAMETERS = POWER_VARIABLES.join(",");

export type Dataset = {
  id: string;
  name: string;
  source: string;
  url: string;
};

export const POWER_DAILY: Dataset = {
  id: "NASA-POWER-daily-point-AG",
  name: "NASA POWER daily point data, Agroclimatology community",
  source: "NASA Langley Research Center POWER project. Meteorology from GMAO MERRA-2; cloud amount from CERES SYN1deg.",
  url: "https://power.larc.nasa.gov/docs/services/api/temporal/daily/",
};

/** A fixed physical range. Scientific Mode normalizes against these so two places are comparable. */
export type PhysicalRange = { low: number; high: number; scale: "linear" | "log1p" | "anomaly" };

export type Mapping = {
  variable: PowerVariable;
  layer: LayerId;
  /** POWER long name. */
  name: string;
  unit: string;
  /** What you hear, in a few words. */
  sound: string;
  range: PhysicalRange;
  /** The rule as written arithmetic, shown in the trace readout. */
  rule: string;
  plain: string;
  science: string;
};

export const MAPPINGS: Record<PowerVariable, Mapping> = {
  T2M: {
    variable: "T2M",
    layer: "pitch",
    name: "Temperature at 2 meters",
    unit: "°C",
    sound: "Pitch of the lead voice",
    range: { low: -40, high: 45, scale: "linear" },
    rule: "n = (T − (−40)) / 85, clamped to 0–1; pitch = scale degree round(n × steps) above the tonic",
    plain: "Warmer days play higher notes, colder days lower ones. The same temperature always gives the same note.",
    science:
      "Daily mean 2 m air temperature from MERRA-2 is mapped linearly from a fixed −40 °C to 45 °C range onto the scale. In Scientific Mode that is 36 chromatic semitones from C3, about 2.4 °C per semitone, so a note heard in Nuuk and a note heard in Delhi are directly comparable.",
  },
  PRECTOTCORR: {
    variable: "PRECTOTCORR",
    layer: "rhythm",
    name: "Precipitation corrected",
    unit: "mm/day",
    sound: "Percussion hits per day",
    range: { low: 0, high: 50, scale: "log1p" },
    rule: "dry if P < 0.1 mm/day; otherwise n = ln(1 + P) / ln(51), hits = 1 + round(n × 3)",
    plain: "A dry day has no drum. Rain adds soft hits, and heavy rain fills the beat with up to four.",
    science:
      "Bias-corrected total precipitation is near zero most days and occasionally very large, so it is compressed with ln(1 + P) before scaling against 50 mm/day. Below 0.1 mm/day, the usual trace threshold, the day is treated as dry and is silent.",
  },
  WS2M: {
    variable: "WS2M",
    layer: "intensity",
    name: "Wind speed at 2 meters",
    unit: "m/s",
    sound: "Loudness and brightness of the whole day",
    range: { low: 0, high: 15, scale: "linear" },
    rule: "n = W / 15, clamped; gain × (0.45 + 0.55 n); low-pass cutoff × (0.6 + 0.8 n)",
    plain: "Calm days are quieter and softer. Windy days are louder and brighter.",
    science:
      "Daily mean wind speed at 2 m scales the gain and the low-pass cutoff of the lead voice. 15 m/s, a near gale as a daily mean, is the top of the range. The scaling is gentle so a calm day stays audible.",
  },
  RH2M: {
    variable: "RH2M",
    layer: "texture",
    name: "Relative humidity at 2 meters",
    unit: "%",
    sound: "A bed of filtered noise",
    range: { low: 0, high: 100, scale: "linear" },
    rule: "n = RH / 100; noise level = 0.02 + 0.10 n; low-pass cutoff = 6000 − 4800 n Hz",
    plain: "Dry air is a faint, bright hiss. Humid air is a thicker, darker haze.",
    science:
      "Relative humidity is already a 0–100 % quantity, so it maps linearly. Higher humidity raises the level of a noise bed and lowers its cutoff, a texture rather than a note, because humidity is a property of the air around the sound.",
  },
  PS: {
    variable: "PS",
    layer: "modulation",
    name: "Surface pressure",
    unit: "kPa",
    sound: "Vibrato on the lead voice",
    range: { low: -2, high: 2, scale: "anomaly" },
    rule: "Δp = PS − median(PS over the window); depth = 40 × min(1, |Δp| / 2 kPa) cents; rate = 5 Hz if Δp < 0, else 2 Hz",
    plain: "Steady pressure gives a steady tone. Falling pressure, often unsettled weather, makes the note waver faster.",
    science:
      "Surface pressure is dominated by elevation, so its absolute value says more about altitude than weather. The rule uses the departure from the window's own median instead: a 2 kPa departure gives the full 40-cent vibrato, and below-median pressure uses the faster rate.",
  },
  CLOUD_AMT: {
    variable: "CLOUD_AMT",
    layer: "density",
    name: "Cloud amount",
    unit: "%",
    sound: "Extra voices in the chord",
    range: { low: 0, high: 100, scale: "linear" },
    rule: "n = C / 100; added voices = round(n × 3), taken in order: fifth, octave, tenth",
    plain: "A clear sky is a single note. A cloudy sky stacks up to three more voices on top.",
    science:
      "Daily cloud amount from CERES SYN1deg maps linearly to the number of added chord tones. It is often published later than the MERRA-2 variables, so recent days are frequently missing and play without the extra voices.",
  },
};

export const ANOMALY_MAPPING = {
  sound: "A bell, one per variable that is unusual that day",
  rule: "z = 0.6745 × (x − median) / MAD over the window (rain: x = ln(1 + P)); a bell sounds when |z| ≥ threshold; bell level = min(1, |z| / 6)",
  plain: "When a day is far outside what is usual for this window, a bell rings. Each variable has its own bell.",
  science:
    "The robust z-score uses the median and median absolute deviation of the selected window, so one extreme day cannot hide itself by inflating the spread. Rain is scored on ln(1 + P), because on raw values the many dry days make the spread tiny and every shower would look extreme. When more than half the days share one value the spread is zero, and any other value is reported as |z| 10. The default threshold is 2.5. It finds days that are unusual for this window and place. It is not a comparison with a long-term climatology.",
} as const;

export const PULSE_MAPPING = {
  sound: "Earth Heartbeat: a low double pulse on every day",
  rule: "pulse level = 0.4 + 0.6 × min(1, |z(T2M)| / 3)",
  plain: "Earth Heartbeat loops the window without stopping. The pulse beats harder when the day's temperature is further from the window's middle.",
  science:
    "The pulse level follows the absolute robust z-score of daily temperature, capped at 3, so the beat is strongest on the days with the largest temperature departure.",
} as const;

export const MISSING_DATA_RULE =
  "A missing POWER value (−999 or absent) is never filled in. The layer it drives is silent that day, and the trace says which variable was missing.";

/** Bell pitch per variable, so each anomaly has its own sound. Hz. */
export const ANOMALY_BELL_HZ: Record<PowerVariable, number> = {
  T2M: 1567.98,
  PRECTOTCORR: 1318.51,
  WS2M: 1174.66,
  RH2M: 1975.53,
  PS: 987.77,
  CLOUD_AMT: 2349.32,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Normalize a raw value against a fixed physical range. */
export function normalizeFixed(value: number, range: PhysicalRange): number {
  if (range.scale === "log1p") {
    return clamp01(Math.log1p(Math.max(0, value)) / Math.log1p(range.high));
  }
  return clamp01((value - range.low) / (range.high - range.low));
}

/** Sensitivity is a gamma curve: above 1 stretches small differences near the low end. */
export function applySensitivity(norm: number, sensitivity: number): number {
  const s = Math.min(4, Math.max(0.25, sensitivity));
  return clamp01(norm) ** (1 / s);
}

/** Trace threshold below which a day counts as dry. mm/day. */
export const DRY_DAY_MM = 0.1;
export const MAX_HITS = 4;

export function rainHits(mmPerDay: number, norm: number): number {
  if (!(mmPerDay >= DRY_DAY_MM)) return 0;
  return Math.min(MAX_HITS, 1 + Math.round(clamp01(norm) * (MAX_HITS - 1)));
}

export function windIntensity(norm: number): { gain: number; brightness: number } {
  const n = clamp01(norm);
  return { gain: 0.45 + 0.55 * n, brightness: 0.6 + 0.8 * n };
}

export function humidityTexture(norm: number): { level: number; cutoffHz: number } {
  const n = clamp01(norm);
  return { level: 0.02 + 0.1 * n, cutoffHz: 6000 - 4800 * n };
}

export const VIBRATO_MAX_CENTS = 40;
export const VIBRATO_FULL_KPA = 2;

export function pressureModulation(deltaKpa: number): { depthCents: number; rateHz: number } {
  const depthCents = VIBRATO_MAX_CENTS * Math.min(1, Math.abs(deltaKpa) / VIBRATO_FULL_KPA);
  return { depthCents, rateHz: deltaKpa < 0 ? 5 : 2 };
}

/** Semitones above the lead for each added voice: fifth, octave, tenth. */
export const DENSITY_INTERVALS = [7, 12, 16] as const;

export function cloudVoices(norm: number): number {
  return Math.round(clamp01(norm) * DENSITY_INTERVALS.length);
}

export function bellLevel(z: number): number {
  return Math.min(1, Math.abs(z) / 6);
}

export function pulseLevel(z: number | null): number {
  return 0.4 + 0.6 * Math.min(1, Math.abs(z ?? 0) / 3);
}
