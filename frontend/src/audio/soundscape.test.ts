import { describe, expect, it } from "vitest";
import { syntheticSeries } from "./fixtures.ts";
import { DEFAULT_CONFIG, sanitizeConfig } from "./labConfig.ts";
import { MAPPINGS, POWER_VARIABLES } from "./mappings.ts";
import { anomalyBasis, buildSoundscape, foldIntoBand, ruleFor, soundingLayers, stepSeconds } from "./soundscape.ts";
import { frequencyToMidi, midiToFrequency } from "../science/score.ts";

describe("buildSoundscape (SYNTHETIC)", () => {
  const scape = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture");

  it("has one step per day, each with a trace for every variable", () => {
    expect(scape.steps).toHaveLength(6);
    for (const step of scape.steps) {
      for (const variable of POWER_VARIABLES) {
        const trace = step.traces.find((item) => item.variable === variable && item.layer !== "anomaly" && item.layer !== "pulse");
        expect(trace, `${variable} on ${step.date}`).toBeDefined();
        expect(trace?.datasetId).toBe("NASA-POWER-daily-point-AG");
        expect(trace?.date).toBe(step.date);
        expect(trace?.rule.length).toBeGreaterThan(5);
      }
    }
  });

  it("maps temperature to pitch on the fixed range in Scientific Mode", () => {
    // 20 °C: n = 60/85, 36 chromatic semitones above C3.
    const expected = 48 + Math.round((60 / 85) * 36);
    expect(scape.steps[0].lead?.midi).toBe(expected);
    expect(scape.steps[4].lead!.midi).toBeGreaterThan(scape.steps[0].lead!.midi);
    expect(scape.steps[0].traces[0]).toMatchObject({ variable: "T2M", raw: 20, unit: "°C" });
  });

  it("maps rain to hits, with dry days silent", () => {
    expect(scape.steps.map((step) => step.hits)).toEqual([0, 0, 2, 3, 0, 4]);
  });

  it("maps cloud cover to added voices and humidity to texture", () => {
    expect(scape.steps.map((step) => step.voices.length)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(scape.steps[0].texture!.level).toBeLessThan(scape.steps[5].texture!.level);
  });

  it("modulates on pressure departure from the window median", () => {
    expect(scape.steps[0].vibrato?.depthCents).toBe(0);
    expect(scape.steps[4].vibrato?.depthCents).toBe(40);
    expect(scape.steps[4].vibrato?.rateHz).toBe(5);
  });

  it("rings a bell for the temperature outlier, with a trace", () => {
    const bells = scape.steps[4].bells;
    expect(bells.map((bell) => bell.variable)).toContain("T2M");
    expect(scape.steps[4].traces.some((trace) => trace.layer === "anomaly" && trace.variable === "T2M")).toBe(true);
    expect(scape.steps[4].caption).toContain("Unusual");
  });

  it("is deterministic", () => {
    expect(buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture")).toEqual(scape);
  });
});

describe("missing data (SYNTHETIC)", () => {
  it("never fills a gap: the layer is silent and the gap is reported", () => {
    const series = syntheticSeries({ T2M: [20, null, -999, 20, 20, 20], CLOUD_AMT: [null, null, null, null, null, null] });
    const scape = buildSoundscape(series, DEFAULT_CONFIG);
    expect(scape.steps[1].lead).toBeNull();
    expect(scape.steps[2].lead).toBeNull();
    expect(scape.steps[1].missing).toContain("T2M");
    expect(scape.steps[1].caption).toContain("Missing in POWER");
    expect(scape.missing.T2M).toBe(2);
    expect(scape.missing.CLOUD_AMT).toBe(6);
    expect(scape.steps.every((step) => step.voices.length === 0)).toBe(true);
    expect(scape.steps[1].traces.find((trace) => trace.variable === "T2M")?.raw).toBeNull();
  });

  it("flags a variable absent from the response entirely", () => {
    const series = syntheticSeries();
    delete series.parameters.WS2M;
    const scape = buildSoundscape(series, DEFAULT_CONFIG);
    expect(scape.missing.WS2M).toBe(6);
    expect(scape.steps[0].intensity.gain).toBeCloseTo(0.725, 12);
    expect(scape.steps[0].intensity.brightness).toBeCloseTo(1, 12);
  });
});

describe("Artistic Mode", () => {
  it("window normalization spreads a narrow window across the range", () => {
    const series = syntheticSeries({ T2M: [20, 21, 22, 23, 24, 25] });
    const fixed = buildSoundscape(series, sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic" }));
    const stretched = buildSoundscape(series, sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", normalization: "window" }));
    const spread = (s: typeof fixed) => s.steps[5].lead!.midi - s.steps[0].lead!.midi;
    expect(spread(stretched)).toBeGreaterThan(spread(fixed));
  });

  it("uses only notes of the chosen custom scale", () => {
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", scale: "custom", customSteps: [0, 7], normalization: "window" });
    const scape = buildSoundscape(syntheticSeries(), config);
    for (const step of scape.steps) expect([0, 7]).toContain((step.lead!.midi - 48) % 12);
  });
});

describe("foldIntoBand", () => {
  it("moves by octaves into the band and keeps the pitch class", () => {
    const midi = foldIntoBand(96, 100, 1000);
    expect(midiToFrequency(midi)).toBeLessThanOrEqual(1000);
    expect(midi % 12).toBe(0);
    expect(foldIntoBand(60, 100, 1000)).toBe(60);
    expect(foldIntoBand(24, 100, 1000) % 12).toBe(0);
  });
  it("clamps when the band is narrower than an octave", () => {
    const midi = foldIntoBand(40, 400, 500);
    expect(midi).toBeGreaterThanOrEqual(Math.ceil(frequencyToMidi(400)));
    expect(midi).toBeLessThanOrEqual(Math.floor(frequencyToMidi(500)));
  });
});

describe("stepSeconds", () => {
  it("divides by tempo and playback rate, with limits", () => {
    expect(stepSeconds(60)).toBe(1);
    expect(stepSeconds(60, 2)).toBe(0.5);
    expect(stepSeconds(60, 100)).toBe(0.25);
    expect(stepSeconds(1000)).toBe(60 / 200);
  });
});

describe("anomalyBasis", () => {
  it("scores rain on ln(1 + P) and leaves other variables unchanged", () => {
    expect(anomalyBasis("PRECTOTCORR", [0, null, Math.E - 1])).toEqual([0, null, 1]);
    expect(anomalyBasis("T2M", [3, null])).toEqual([3, null]);
  });
});

describe("soundingLayers (SYNTHETIC)", () => {
  it("lists only layers that make sound that day", () => {
    const scape = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture");
    expect([...soundingLayers(scape.steps[0], false)].sort()).toEqual(["intensity", "pitch", "texture"]);
    expect(soundingLayers(scape.steps[5], true).has("rhythm")).toBe(true);
    expect(soundingLayers(scape.steps[5], true).has("pulse")).toBe(true);
    expect(soundingLayers(scape.steps[4], false).has("anomaly")).toBe(true);
  });
});

describe("ruleFor", () => {
  it("is the reference rule in Scientific Mode and names Artistic changes", () => {
    expect(ruleFor("T2M", { normalization: "fixed", sensitivity: 1 })).toBe(MAPPINGS.T2M.rule);
    const artistic = ruleFor("T2M", { normalization: "window", sensitivity: 2 });
    expect(artistic).toContain("P95");
    expect(artistic).toContain("n^(1/2)");
    expect(ruleFor("PS", { normalization: "window", sensitivity: 2 })).toBe(MAPPINGS.PS.rule);
  });
  it("is what the trace carries", () => {
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, mode: "artistic", normalization: "window" });
    const scape = buildSoundscape(syntheticSeries(), config);
    expect(scape.steps[0].traces[0].rule).toBe(ruleFor("T2M", config));
  });
});
