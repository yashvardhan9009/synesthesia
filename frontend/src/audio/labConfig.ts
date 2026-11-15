import type { ScaleName, SonicSettings } from "../types.ts";
import { LAYERS, type LayerId } from "./mappings.ts";

/**
 * Sonic Lab configuration. Scientific Mode replaces every mapping parameter with a
 * fixed, published set so the same data always gives the same sound. Artistic Mode
 * uses whatever the listener chose. Mix levels and pan are allowed in both modes:
 * they change how loud a layer is, not what the data means.
 */

export type LabMode = "scientific" | "artistic";

export type LabScaleName = "chromatic" | "pentatonic" | "major" | "minor" | "dorian" | "wholeTone" | "custom";

export const LAB_SCALES: Record<Exclude<LabScaleName, "custom">, readonly number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

export const SCALE_LABELS: Record<LabScaleName, string> = {
  chromatic: "Chromatic",
  pentatonic: "Pentatonic",
  major: "Major",
  minor: "Natural minor",
  dorian: "Dorian",
  wholeTone: "Whole tone",
  custom: "Custom",
};

export type InstrumentId = "probe" | "glass" | "reed" | "strings" | "pluck";

export type Instrument = {
  id: InstrumentId;
  name: string;
  wave: OscillatorType;
  /** Attack in seconds. */
  attack: number;
  /** Note length as a fraction of a step. */
  sustain: number;
  /** Multiplies the low-pass cutoff. */
  brightness: number;
  /** A quiet inharmonic partial, as a frequency ratio, for bell-like timbres. */
  partial: number | null;
};

export const INSTRUMENTS: Record<InstrumentId, Instrument> = {
  probe: { id: "probe", name: "Sine probe", wave: "sine", attack: 0.02, sustain: 1, brightness: 1, partial: null },
  glass: { id: "glass", name: "Glass", wave: "sine", attack: 0.005, sustain: 0.9, brightness: 1.4, partial: 2.76 },
  reed: { id: "reed", name: "Reed", wave: "square", attack: 0.03, sustain: 0.95, brightness: 0.5, partial: null },
  strings: { id: "strings", name: "Bowed", wave: "sawtooth", attack: 0.12, sustain: 1.05, brightness: 0.55, partial: null },
  pluck: { id: "pluck", name: "Pluck", wave: "triangle", attack: 0.004, sustain: 0.45, brightness: 1.1, partial: 3.01 },
};

export type LayerMix = { level: number; pan: number; on: boolean };

export type Normalization = "fixed" | "window";

export type LabConfig = {
  version: 1;
  mode: LabMode;
  instrument: InstrumentId;
  scale: LabScaleName;
  /** Semitones 0–11 used when scale is "custom". 0 is always included. */
  customSteps: number[];
  /** MIDI note of the tonic before the octave shift. */
  tonic: number;
  /** Octave shift, -2 to +2. */
  octave: number;
  /** Octaves the pitch range spans, 1 to 4. */
  span: number;
  bpm: number;
  /** Gamma applied after normalization, 0.25 to 4. 1 is linear. */
  sensitivity: number;
  /** Lead voice is held inside this band. Hz. */
  lowHz: number;
  highHz: number;
  anomalyZ: number;
  /** fixed: physical ranges, comparable between places. window: stretched to this window. */
  normalization: Normalization;
  layers: Record<LayerId, LayerMix>;
};

const DEFAULT_PAN: Record<LayerId, number> = {
  pitch: 0,
  rhythm: -0.35,
  intensity: 0,
  texture: 0.3,
  modulation: 0,
  density: 0.15,
  anomaly: -0.15,
  pulse: 0,
};

const DEFAULT_LEVEL: Record<LayerId, number> = {
  pitch: 0.8,
  rhythm: 0.7,
  intensity: 1,
  texture: 0.5,
  modulation: 1,
  density: 0.6,
  anomaly: 0.75,
  pulse: 0.7,
};

export function defaultLayers(): Record<LayerId, LayerMix> {
  return Object.fromEntries(
    LAYERS.map((layer) => [layer, { level: DEFAULT_LEVEL[layer], pan: DEFAULT_PAN[layer], on: true }]),
  ) as Record<LayerId, LayerMix>;
}

/** The locked mapping parameters of Scientific Mode. */
export const SCIENTIFIC_LOCK = {
  instrument: "probe",
  scale: "chromatic",
  tonic: 48,
  octave: 0,
  span: 3,
  bpm: 96,
  sensitivity: 1,
  lowHz: 60,
  highHz: 2000,
  anomalyZ: 2.5,
  normalization: "fixed",
} as const satisfies Partial<LabConfig>;

export type LockedKey = keyof typeof SCIENTIFIC_LOCK;
export const LOCKED_KEYS = Object.keys(SCIENTIFIC_LOCK) as LockedKey[];

export const DEFAULT_CONFIG: LabConfig = {
  version: 1,
  mode: "scientific",
  ...SCIENTIFIC_LOCK,
  customSteps: [0, 3, 5, 7, 10],
  layers: defaultLayers(),
};

/** What actually drives the sound. Scientific Mode overrides every mapping parameter. */
export function effectiveConfig(config: LabConfig): LabConfig {
  if (config.mode !== "scientific") return config;
  return { ...config, ...SCIENTIFIC_LOCK };
}

export function scaleSteps(config: Pick<LabConfig, "scale" | "customSteps">): readonly number[] {
  if (config.scale !== "custom") return LAB_SCALES[config.scale];
  return normalizeSteps(config.customSteps);
}

/** Sorted, unique, within 0–11, and always containing the tonic. */
export function normalizeSteps(steps: readonly number[]): number[] {
  const set = new Set<number>([0]);
  for (const step of steps) {
    if (Number.isInteger(step) && step >= 0 && step <= 11) set.add(step);
  }
  return [...set].sort((a, b) => a - b);
}

/** Lowest MIDI note of the range, after the octave shift. */
export function rootMidi(config: Pick<LabConfig, "tonic" | "octave">): number {
  return config.tonic + config.octave * 12;
}

const clamp = (value: unknown, low: number, high: number, fallback: number): number => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(high, Math.max(low, number));
};

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Accept anything (from storage or an import) and return a valid config. Unknown or bad fields fall back to defaults. */
export function sanitizeConfig(input: unknown): LabConfig {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = DEFAULT_CONFIG;
  const rawLayers = (raw.layers && typeof raw.layers === "object" ? raw.layers : {}) as Record<string, unknown>;
  const layers = defaultLayers();
  for (const layer of LAYERS) {
    const mix = (rawLayers[layer] && typeof rawLayers[layer] === "object" ? rawLayers[layer] : {}) as Record<string, unknown>;
    layers[layer] = {
      level: clamp(mix.level, 0, 1, layers[layer].level),
      pan: clamp(mix.pan, -1, 1, layers[layer].pan),
      on: typeof mix.on === "boolean" ? mix.on : true,
    };
  }
  const lowHz = clamp(raw.lowHz, 30, 4000, base.lowHz);
  const highHz = clamp(raw.highHz, 30, 8000, base.highHz);
  return {
    version: 1,
    mode: pick(raw.mode, ["scientific", "artistic"] as const, base.mode),
    instrument: pick(raw.instrument, Object.keys(INSTRUMENTS) as InstrumentId[], base.instrument),
    scale: pick(raw.scale, Object.keys(SCALE_LABELS) as LabScaleName[], base.scale),
    customSteps: normalizeSteps(Array.isArray(raw.customSteps) ? (raw.customSteps as number[]) : base.customSteps),
    tonic: Math.round(clamp(raw.tonic, 36, 59, base.tonic)),
    octave: Math.round(clamp(raw.octave, -2, 2, base.octave)),
    span: Math.round(clamp(raw.span, 1, 4, base.span)),
    bpm: Math.round(clamp(raw.bpm, 40, 200, base.bpm)),
    sensitivity: clamp(raw.sensitivity, 0.25, 4, base.sensitivity),
    lowHz: Math.min(lowHz, highHz - 1),
    highHz: Math.max(highHz, lowHz + 1),
    anomalyZ: clamp(raw.anomalyZ, 1, 5, base.anomalyZ),
    normalization: pick(raw.normalization, ["fixed", "window"] as const, base.normalization),
    layers,
  };
}

export type LabPreset = { id: string; name: string; note: string; config: LabConfig };

const artistic = (patch: Partial<LabConfig>): LabConfig => ({ ...DEFAULT_CONFIG, mode: "artistic", ...patch, layers: { ...defaultLayers(), ...patch.layers } });

export const LAB_PRESETS: LabPreset[] = [
  {
    id: "scientific",
    name: "Scientific reference",
    note: "Fixed physical ranges, chromatic, sine probe. Comparable between places and reproducible.",
    config: DEFAULT_CONFIG,
  },
  {
    id: "glass-pentatonic",
    name: "Glass pentatonic",
    note: "Stretched to the window so every change is heard. Bell timbre, pentatonic.",
    config: artistic({ instrument: "glass", scale: "pentatonic", span: 2, normalization: "window", bpm: 104 }),
  },
  {
    id: "monsoon-reed",
    name: "Monsoon reed",
    note: "Minor scale, reed lead, rain brought forward in the mix.",
    config: artistic({
      instrument: "reed",
      scale: "minor",
      tonic: 50,
      span: 2,
      normalization: "window",
      bpm: 88,
      layers: { ...defaultLayers(), rhythm: { level: 1, pan: -0.5, on: true }, texture: { level: 0.7, pan: 0.5, on: true } },
    }),
  },
  {
    id: "slow-strings",
    name: "Slow bowed",
    note: "Long bowed notes at 64 bpm, lower register, softer anomaly bells.",
    config: artistic({
      instrument: "strings",
      scale: "dorian",
      octave: -1,
      span: 2,
      bpm: 64,
      normalization: "window",
      layers: { ...defaultLayers(), anomaly: { level: 0.4, pan: 0, on: true } },
    }),
  },
  {
    id: "sensitive-pluck",
    name: "Sensitive pluck",
    note: "Fixed ranges with sensitivity 2, so small differences on mild days open up. Anomaly |z| 2.",
    config: artistic({ instrument: "pluck", scale: "major", span: 3, sensitivity: 2, anomalyZ: 2, bpm: 120 }),
  },
];

/** Minimal storage interface so persistence can be tested without a browser. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CONFIG_KEY = "synesthesia.lab.config.v1";
export const SAVED_KEY = "synesthesia.lab.saved.v1";

export type SavedConfig = { name: string; savedAt: string; config: LabConfig };

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const text = store.getItem(key);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown): boolean {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled: keep working without persistence.
    return false;
  }
}

export function loadCurrentConfig(store: KeyValueStore): LabConfig {
  const raw = readJson(store, CONFIG_KEY);
  return raw ? sanitizeConfig(raw) : DEFAULT_CONFIG;
}

export function saveCurrentConfig(store: KeyValueStore, config: LabConfig): boolean {
  return writeJson(store, CONFIG_KEY, config);
}

export function listSavedConfigs(store: KeyValueStore): SavedConfig[] {
  const raw = readJson(store, SAVED_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string")
    .map((item) => ({
      name: String(item.name).slice(0, 60),
      savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
      config: sanitizeConfig(item.config),
    }));
}

/** Save under a name; the same name overwrites. Newest first, at most 20. */
export function saveNamedConfig(store: KeyValueStore, name: string, config: LabConfig, now = new Date()): SavedConfig[] {
  const trimmed = name.trim().slice(0, 60) || "Untitled";
  const rest = listSavedConfigs(store).filter((item) => item.name !== trimmed);
  const next = [{ name: trimmed, savedAt: now.toISOString(), config }, ...rest].slice(0, 20);
  writeJson(store, SAVED_KEY, next);
  return next;
}

export function deleteNamedConfig(store: KeyValueStore, name: string): SavedConfig[] {
  const next = listSavedConfigs(store).filter((item) => item.name !== name);
  writeJson(store, SAVED_KEY, next);
  return next;
}

/** Fields that differ between two configs, for the A/B readout. */
export function configDiff(a: LabConfig, b: LabConfig): string[] {
  const left = effectiveConfig(a);
  const right = effectiveConfig(b);
  const keys: (keyof LabConfig)[] = ["mode", ...LOCKED_KEYS];
  const changed: string[] = keys.filter((key) => left[key] !== right[key]);
  if (left.scale === "custom" && right.scale === "custom" && left.customSteps.join() !== right.customSteps.join()) changed.push("customSteps");
  for (const layer of LAYERS) {
    const l = left.layers[layer];
    const r = right.layers[layer];
    if (l.level !== r.level || l.pan !== r.pan || l.on !== r.on) changed.push(`layers.${layer}`);
  }
  return changed;
}

const SHARED_SCALES: readonly ScaleName[] = ["pentatonic", "major", "dorian", "chromatic"];

/**
 * The parts of a Lab config the other modes understand. Scales they do not know
 * keep the previous choice; the range is limited to what they support.
 */
export function toSonicSettings(config: LabConfig, previous: SonicSettings): SonicSettings {
  const cfg = effectiveConfig(config);
  const scale = (SHARED_SCALES as readonly string[]).includes(cfg.scale) ? (cfg.scale as ScaleName) : previous.scale;
  return {
    ...previous,
    scale,
    rootMidi: rootMidi(cfg),
    octaves: Math.min(3, cfg.span),
    bpm: Math.min(160, Math.max(60, cfg.bpm)),
    anomalyZ: Math.min(4, Math.max(1.5, cfg.anomalyZ)),
  };
}

/**
 * A compact, URL-safe encoding of a config for shareable links. Only fields
 * that differ from the defaults are written; decoding goes through
 * sanitizeConfig, so a tampered link can only produce a valid config.
 */
export function encodeConfig(config: LabConfig): string {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "version") continue;
    if (JSON.stringify(value) !== JSON.stringify(DEFAULT_CONFIG[key as keyof LabConfig])) diff[key] = value;
  }
  const json = JSON.stringify(diff);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfig(text: string): LabConfig | null {
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const diff = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
    const merged = { ...DEFAULT_CONFIG, ...(diff as Record<string, unknown>) };
    const layers = (diff as { layers?: unknown }).layers;
    if (layers && typeof layers === "object") merged.layers = { ...DEFAULT_CONFIG.layers, ...(layers as object) };
    return sanitizeConfig(merged);
  } catch {
    return null;
  }
}
