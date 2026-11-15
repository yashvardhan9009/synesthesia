import { describe, expect, it } from "vitest";
import { NORMAL_MAX_Z, PRACTICE_TRIALS, TEST_TRIALS, UNUSUAL_MIN_Z, classify, exportCsv, exportJson, makeTrials, robustZ, scoreClip, scoreResponses, seedFor, seededRandom, type CandidateWindow, type StudyClip, type Trial } from "./study.ts";
import { CANDIDATES } from "./stimuli.ts";
import { earOnly } from "./earOnly.ts";
import { buildSoundscape } from "../audio/soundscape.ts";
import { DEFAULT_CONFIG } from "../audio/labConfig.ts";
import type { PowerBaseline } from "../api.ts";
import type { PowerSeries } from "../types.ts";

const clip = (id: string, unusual: boolean, z: number): StudyClip => ({
  id, place: "Test place", start: "2024-01-01", end: "2024-01-30", series: {} as StudyClip["series"], z: [z], maxAbsZ: Math.abs(z), peakZ: z, unusual,
});

describe("listening test logic", () => {
  it("scores a value against robust same-calendar spread", () => {
    expect(robustZ(15, { p10: 8.7185, p50: 10, p90: 11.2815 })).toBeCloseTo(5);
    expect(robustZ(null, { p10: 1, p50: 2, p90: 3 })).toBeNull();
  });

  it("computes trial labels from POWER values and baseline statistics", () => {
    const window: CandidateWindow = { id: "event", place: "Test place", latitude: 0, longitude: 0, start: "2024-01-01", end: "2024-01-10" };
    const dates = Array.from({ length: 10 }, (_, index) => `202401${String(index + 1).padStart(2, "0")}`);
    const series = { dates, parameters: { T2M: dates.map((date) => ({ date, value: 13 })) } } as unknown as PowerSeries;
    const baseline = { days: { T2M: Object.fromEntries(dates.map((date) => [date.slice(4), { n: 20, mean: 10, sd: 1, p10: 8.7185, p50: 10, p90: 11.2815 }])) } } as unknown as PowerBaseline;
    const scored = scoreClip(window, series, baseline);
    expect(scored.maxAbsZ).toBeCloseTo(3);
    expect(scored.unusual).toBe(true);
  });

  it("uses a seeded order and the data-derived clip labels for answer keys", () => {
    const anomalies = [clip("hot-a", true, 2.7), clip("hot-b", true, -3)];
    const normals = [clip("usual-a", false, 0.9), clip("usual-b", false, -1.2)];
    const first = makeTrials(anomalies, normals, 872341, 1, 5);
    expect(makeTrials(anomalies, normals, 872341, 1, 5)).toEqual(first);
    expect(first).toHaveLength(6);
    expect(first.every((trial) => trial.clips[trial.correct].unusual)).toBe(true);
    expect(first[0]?.practice).toBe(true);
  });

  it("uses a log-linear correction and reports a perfect listener with finite d prime", () => {
    const trials: Trial[] = Array.from({ length: 8 }, (_, index) => {
      const hot = clip(`hot-${index}`, true, 2.8);
      const usual = clip(`usual-${index}`, false, 0.4);
      return { id: `trial-${index}`, seed: 12, condition: "warm-anomaly", clips: index % 2 ? [usual, hot] : [hot, usual], correct: index % 2 ? 1 : 0, practice: false };
    });
    const responses = trials.map((trial) => ({ trialId: trial.id, response: trial.correct, rtMs: 900, confidence: 4 as const, correct: 1 as const }));
    const result = scoreResponses(trials, responses);
    expect(result.accuracy).toBe(1);
    expect(result.dPrime).toBeGreaterThan(0);
    expect(Number.isFinite(result.dPrime)).toBe(true);
    expect(result.meanRtMs).toBe(900);
    expect(result.byCondition["warm-anomaly"]?.n).toBe(8);
  });

  it("makes seeded random sequences reproducible", () => {
    const a = seededRandom(9); const b = seededRandom(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("exports measurement keys and responses in both formats", () => {
    const hot = clip("hot", true, 2.8); const usual = clip("usual", false, 0.2);
    const trial: Trial = { id: "trial-1", seed: 88, condition: "warm-anomaly", clips: [hot, usual], correct: 0, practice: false };
    const responses = [{ trialId: trial.id, response: 0 as const, rtMs: 1400, confidence: 3 as const, correct: 1 as const }];
    expect(exportCsv([trial], responses)).toContain('"88"');
    expect(exportCsv([trial], responses)).toContain('"Test place","2024-01-01","2024-01-30"');
    const json = JSON.parse(exportJson([trial], responses)) as { seed: number; correct: number; response: number; rtMs: number; confidence: number }[];
    expect(json).toHaveLength(2);
    expect(json[0]).toMatchObject({ seed: 88, correct: 0, response: 0, rtMs: 1400, confidence: 3 });
  });
});

describe("listening test pool and ear-only clips", () => {
  it("uses each clip once while the pools last", () => {
    const anomalies = Array.from({ length: 12 }, (_, index) => clip(`u${index}`, true, index % 2 ? 3 : -3));
    const normals = Array.from({ length: 12 }, (_, index) => clip(`n${index}`, false, 0.5));
    const trials = makeTrials(anomalies, normals, seedFor("participant-7"));
    expect(trials).toHaveLength(PRACTICE_TRIALS + TEST_TRIALS);
    const ids = trials.flatMap((trial) => trial.clips.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(trials.filter((trial) => trial.practice)).toHaveLength(PRACTICE_TRIALS);
    expect(makeTrials(anomalies, normals, seedFor("participant-7"))).toEqual(trials);
    expect(makeTrials(anomalies, normals, seedFor("participant-8"))).not.toEqual(trials);
  });

  it("classifies by the protocol cutoffs and never uses the clips between them", () => {
    expect(classify({ maxAbsZ: UNUSUAL_MIN_Z })).toBe("unusual");
    expect(classify({ maxAbsZ: NORMAL_MAX_Z - 0.01 })).toBe("normal");
    expect(classify({ maxAbsZ: 2 })).toBe("between");
  });

  it("curates at least twelve of each kind across many places and years", () => {
    expect(CANDIDATES.length).toBeGreaterThanOrEqual(24);
    expect(new Set(CANDIDATES.map((item) => item.id)).size).toBe(CANDIDATES.length);
    expect(new Set(CANDIDATES.map((item) => item.place)).size).toBeGreaterThanOrEqual(12);
    const years = CANDIDATES.map((item) => Number(item.start.slice(0, 4)));
    expect(Math.min(...years)).toBeLessThanOrEqual(2002);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2024);
  });

  it("strips every readable detail from a trial clip", () => {
    const dates = ["20240101", "20240102"];
    const series = { latitude: 1, longitude: 2, start: "20240101", end: "20240102", dates, units: {}, source: "NASA POWER", request_url: "https://power.larc.nasa.gov/x", parameters: { T2M: dates.map((date) => ({ date, value: 20 })) } } as unknown as PowerSeries;
    const scape = earOnly(buildSoundscape(series, DEFAULT_CONFIG, "Secret place"), "Clip 1");
    const text = JSON.stringify(scape);
    expect(text).not.toContain("2024");
    expect(text).not.toContain("Secret place");
    expect(text).not.toContain("power.larc");
    expect(scape.steps.every((step) => step.traces.length === 0 && step.caption === "")).toBe(true);
  });
});
