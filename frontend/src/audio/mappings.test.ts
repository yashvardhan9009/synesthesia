import { describe, expect, it } from "vitest";
import {
  MAPPINGS,
  POWER_VARIABLES,
  applySensitivity,
  bellLevel,
  cloudVoices,
  humidityTexture,
  normalizeFixed,
  pressureModulation,
  pulseLevel,
  rainHits,
  windIntensity,
} from "./mappings.ts";

describe("normalizeFixed", () => {
  it("maps the temperature range ends to 0 and 1 and clamps outside", () => {
    const range = MAPPINGS.T2M.range;
    expect(normalizeFixed(-40, range)).toBe(0);
    expect(normalizeFixed(45, range)).toBe(1);
    expect(normalizeFixed(2.5, range)).toBeCloseTo(0.5, 10);
    expect(normalizeFixed(-80, range)).toBe(0);
    expect(normalizeFixed(60, range)).toBe(1);
  });

  it("compresses rain with ln(1 + P) against 50 mm/day", () => {
    const range = MAPPINGS.PRECTOTCORR.range;
    expect(normalizeFixed(0, range)).toBe(0);
    expect(normalizeFixed(50, range)).toBeCloseTo(1, 10);
    expect(normalizeFixed(5, range)).toBeCloseTo(Math.log(6) / Math.log(51), 10);
    expect(normalizeFixed(-3, range)).toBe(0);
  });
});

describe("applySensitivity", () => {
  it("is the identity at 1 and keeps 0 and 1 fixed for any setting", () => {
    expect(applySensitivity(0.3, 1)).toBeCloseTo(0.3, 12);
    for (const s of [0.25, 0.5, 2, 4]) {
      expect(applySensitivity(0, s)).toBe(0);
      expect(applySensitivity(1, s)).toBe(1);
    }
    expect(applySensitivity(0.25, 2)).toBeCloseTo(0.5, 12);
  });
});

describe("rainHits", () => {
  it("is silent below the 0.1 mm trace threshold", () => {
    expect(rainHits(0, 0)).toBe(0);
    expect(rainHits(0.09, 0.01)).toBe(0);
    expect(rainHits(Number.NaN, 0.5)).toBe(0);
  });
  it("gives 1 to 4 hits, monotonic in the normalized value", () => {
    expect(rainHits(0.1, 0)).toBe(1);
    expect(rainHits(50, 1)).toBe(4);
    let last = 0;
    for (let n = 0; n <= 1; n += 0.05) {
      const hits = rainHits(1, n);
      expect(hits).toBeGreaterThanOrEqual(last);
      last = hits;
    }
  });
});

describe("layer mappings", () => {
  it("wind scales gain 0.45 to 1 and brightness 0.6 to 1.4", () => {
    expect(windIntensity(0)).toEqual({ gain: 0.45, brightness: 0.6 });
    expect(windIntensity(1)).toEqual({ gain: 1, brightness: 1.4 });
    expect(windIntensity(2)).toEqual({ gain: 1, brightness: 1.4 });
  });
  it("humidity raises the noise level and darkens it", () => {
    expect(humidityTexture(0)).toEqual({ level: 0.02, cutoffHz: 6000 });
    const humid = humidityTexture(1);
    expect(humid.level).toBeCloseTo(0.12, 12);
    expect(humid.cutoffHz).toBe(1200);
  });
  it("pressure departure sets vibrato depth, capped at 40 cents, faster when low", () => {
    expect(pressureModulation(0).depthCents).toBe(0);
    expect(pressureModulation(1)).toEqual({ depthCents: 20, rateHz: 2 });
    expect(pressureModulation(-1)).toEqual({ depthCents: 20, rateHz: 5 });
    expect(pressureModulation(-9).depthCents).toBe(40);
  });
  it("cloud amount adds 0 to 3 voices", () => {
    expect(cloudVoices(0)).toBe(0);
    expect(cloudVoices(0.5)).toBe(2);
    expect(cloudVoices(1)).toBe(3);
  });
  it("bell and pulse levels follow |z| and are capped", () => {
    expect(bellLevel(3)).toBe(0.5);
    expect(bellLevel(-12)).toBe(1);
    expect(pulseLevel(null)).toBe(0.4);
    expect(pulseLevel(-3)).toBeCloseTo(1, 12);
    expect(pulseLevel(30)).toBeCloseTo(1, 12);
  });
});

describe("MAPPINGS", () => {
  it("documents every variable with plain and scientific text", () => {
    for (const variable of POWER_VARIABLES) {
      const mapping = MAPPINGS[variable];
      expect(mapping.variable).toBe(variable);
      expect(mapping.plain.length).toBeGreaterThan(20);
      expect(mapping.science.length).toBeGreaterThan(40);
      expect(mapping.rule.length).toBeGreaterThan(10);
    }
  });
});
