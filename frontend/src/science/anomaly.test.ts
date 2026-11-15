import { describe, expect, it } from "vitest";
import { MAD_TO_SIGMA, anomaliesAgainstBaseline, median, robustAnomalies } from "./anomaly.ts";

describe("robustAnomalies (SYNTHETIC series, not NASA data)", () => {
  it("flags a single spike and leaves the flat days alone", () => {
    const points = robustAnomalies([1, 1, 1, 1, 10], 2.5);
    expect(points.map((point) => point.flagged)).toEqual([false, false, false, false, true]);
  });

  it("does not flag a gentle trend", () => {
    const points = robustAnomalies([0, 1, 2, 3, 4, 5], 2.5);
    expect(points.some((point) => point.flagged)).toBe(false);
  });

  it("ignores missing days", () => {
    const points = robustAnomalies([1, null, 1, 1, 9], 2.5);
    expect(points[1].z).toBeNull();
    expect(points[4].flagged).toBe(true);
  });
});

describe("robust z against raw temperatures (SYNTHETIC, hand-computed)", () => {
  it("matches median, MAD and z for a known series", () => {
    const values = [20, 21, 22, 23, 40];
    expect(median(values)).toBe(22);
    const points = robustAnomalies(values, 2.5);
    const center = 22;
    const mad = 1;
    const expected = (MAD_TO_SIGMA * (40 - center)) / mad;
    expect(points[4].z).toBeCloseTo(expected, 6);
    expect(points[4].flagged).toBe(true);
    expect(points[2].z).toBeCloseTo(0, 6);
    expect(points[2].flagged).toBe(false);
    expect(points[0].flagged).toBe(false);
  });
});

describe("anomaliesAgainstBaseline", () => {
  it("compares a later window with an earlier climate", () => {
    const baseline = [20, 21, 19, 20, 22];
    const later = [20, 28, 21];
    const points = anomaliesAgainstBaseline(later, baseline, 2.5);
    expect(points[1].flagged).toBe(true);
    expect(points[0].flagged).toBe(false);
  });
});
