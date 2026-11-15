import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types.ts";
import {
  DEFAULT_CONFIG,
  LAB_PRESETS,
  SCIENTIFIC_LOCK,
  configDiff,
  decodeConfig,
  encodeConfig,
  deleteNamedConfig,
  effectiveConfig,
  listSavedConfigs,
  loadCurrentConfig,
  normalizeSteps,
  sanitizeConfig,
  saveCurrentConfig,
  saveNamedConfig,
  scaleSteps,
  toSonicSettings,
  type KeyValueStore,
} from "./labConfig.ts";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("effectiveConfig", () => {
  it("locks every mapping parameter in Scientific Mode", () => {
    const wild = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "scientific", scale: "minor", bpm: 150, instrument: "reed", normalization: "window" });
    const effective = effectiveConfig(wild);
    for (const [key, value] of Object.entries(SCIENTIFIC_LOCK)) {
      expect(effective[key as keyof typeof SCIENTIFIC_LOCK]).toBe(value);
    }
  });
  it("keeps the listener's choices in Artistic Mode", () => {
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", scale: "minor", bpm: 150 });
    expect(effectiveConfig(config).scale).toBe("minor");
    expect(effectiveConfig(config).bpm).toBe(150);
  });
});

describe("sanitizeConfig", () => {
  it("returns the defaults for junk", () => {
    expect(sanitizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(sanitizeConfig("nope")).toEqual(DEFAULT_CONFIG);
  });
  it("clamps ranges and rejects unknown enums", () => {
    const config = sanitizeConfig({ bpm: 9000, scale: "lydian", sensitivity: -1, layers: { rhythm: { level: 3, pan: -7, on: false } } });
    expect(config.bpm).toBe(200);
    expect(config.scale).toBe(DEFAULT_CONFIG.scale);
    expect(config.sensitivity).toBe(0.25);
    expect(config.layers.rhythm).toEqual({ level: 1, pan: -1, on: false });
  });
  it("keeps the frequency band ordered", () => {
    const config = sanitizeConfig({ lowHz: 900, highHz: 200 });
    expect(config.lowHz).toBeLessThan(config.highHz);
  });
  it("accepts every built-in preset unchanged", () => {
    for (const preset of LAB_PRESETS) expect(sanitizeConfig(preset.config)).toEqual(preset.config);
  });
});

describe("custom scales", () => {
  it("always contains the tonic and stays sorted and unique", () => {
    expect(normalizeSteps([7, 3, 3, 14, -1, 2.5])).toEqual([0, 3, 7]);
    expect(scaleSteps({ scale: "custom", customSteps: [] })).toEqual([0]);
  });
});

describe("persistence", () => {
  it("round-trips the current config", () => {
    const store = memoryStore();
    expect(loadCurrentConfig(store)).toEqual(DEFAULT_CONFIG);
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", bpm: 120 });
    saveCurrentConfig(store, config);
    expect(loadCurrentConfig(store)).toEqual(config);
  });
  it("survives corrupt storage", () => {
    const store = memoryStore();
    store.setItem("synesthesia.lab.config.v1", "{not json");
    store.setItem("synesthesia.lab.saved.v1", "[1, {\"name\": 4}]");
    expect(loadCurrentConfig(store)).toEqual(DEFAULT_CONFIG);
    expect(listSavedConfigs(store)).toEqual([]);
  });
  it("saves named configs newest first, overwrites by name, and deletes", () => {
    const store = memoryStore();
    saveNamedConfig(store, "One", DEFAULT_CONFIG, new Date("2026-01-01"));
    saveNamedConfig(store, "Two", DEFAULT_CONFIG, new Date("2026-01-02"));
    const list = saveNamedConfig(store, "One", { ...DEFAULT_CONFIG, bpm: 100 }, new Date("2026-01-03"));
    expect(list.map((item) => item.name)).toEqual(["One", "Two"]);
    expect(listSavedConfigs(store)[0].config.bpm).toBe(100);
    expect(deleteNamedConfig(store, "One").map((item) => item.name)).toEqual(["Two"]);
  });
  it("keeps working when storage throws", () => {
    const store: KeyValueStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    expect(loadCurrentConfig(store)).toEqual(DEFAULT_CONFIG);
    expect(saveCurrentConfig(store, DEFAULT_CONFIG)).toBe(false);
  });
});

describe("configDiff", () => {
  it("is empty for identical configs and names what changed", () => {
    expect(configDiff(DEFAULT_CONFIG, DEFAULT_CONFIG)).toEqual([]);
    const b = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", scale: "minor" });
    expect(configDiff(DEFAULT_CONFIG, b)).toEqual(expect.arrayContaining(["mode", "scale"]));
  });
  it("ignores locked fields hidden by Scientific Mode", () => {
    const b = sanitizeConfig({ ...DEFAULT_CONFIG, scale: "minor" });
    expect(configDiff(DEFAULT_CONFIG, b)).toEqual([]);
  });
});

describe("toSonicSettings", () => {
  it("passes shared fields to the other modes and keeps unknown scales out", () => {
    const previous = { ...DEFAULT_SETTINGS };
    const scientific = toSonicSettings(DEFAULT_CONFIG, previous);
    expect(scientific).toMatchObject({ scale: "chromatic", rootMidi: 48, octaves: 3, bpm: 96, anomalyZ: 2.5 });
    const minor = toSonicSettings(sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", scale: "minor", octave: 1, span: 4, bpm: 200 }), previous);
    expect(minor.scale).toBe(previous.scale);
    expect(minor.rootMidi).toBe(60);
    expect(minor.octaves).toBe(3);
    expect(minor.bpm).toBe(160);
    expect(minor.lead).toBe(previous.lead);
  });
});

describe("encodeConfig / decodeConfig", () => {
  it("round-trips every preset and is URL-safe", () => {
    for (const preset of LAB_PRESETS) {
      const text = encodeConfig(preset.config);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(decodeConfig(text)).toEqual(preset.config);
    }
  });
  it("is short for the default", () => {
    expect(encodeConfig(DEFAULT_CONFIG).length).toBeLessThan(8);
  });
  it("rejects garbage and clamps tampered values", () => {
    expect(decodeConfig("%%%")).toBeNull();
    expect(decodeConfig(btoa("[1,2]"))).toBeNull();
    const tampered = btoa(JSON.stringify({ bpm: 99999, mode: "artistic" })).replace(/=+$/, "");
    expect(decodeConfig(tampered)).toMatchObject({ bpm: 200, mode: "artistic" });
  });
});
