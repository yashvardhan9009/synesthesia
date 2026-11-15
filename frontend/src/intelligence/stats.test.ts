import { describe, expect, it } from "vitest";
import { formatP, incompleteBeta, mad, mannKendall, median, normalCdf, olsTrend, ordinal, rankAscending, rankDescending, robustScale, robustZ, sd, tTwoSidedP } from "./stats.ts";

describe("robust statistics", () => {
  it("medians and MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it("floors the robust scale for near-constant series", () => {
    expect(robustScale([1, 2, 3, 4, 100], 0.1)).toBeCloseTo(1.4826, 4);
    expect(robustScale([5, 5, 5, 5, 5.01], 0.15)).toBe(0.15);
    expect(robustZ(5.3, 5, 0.15)).toBeCloseTo(2, 9);
  });

  it("ranks with ties sharing the best rank", () => {
    expect(rankDescending(9, [1, 9, 3, 9])).toBe(1);
    expect(rankDescending(3, [1, 9, 3, 9])).toBe(3);
    expect(rankAscending(1, [1, 9, 3])).toBe(1);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });
});

describe("distributions", () => {
  it("matches tabulated values", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 5);
    expect(incompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(tTwoSidedP(2.228139, 10)).toBeCloseTo(0.05, 4);
    expect(tTwoSidedP(2, 10)).toBeCloseTo(0.07339, 4);
    expect(tTwoSidedP(0, 5)).toBeCloseTo(1, 10);
    expect(tTwoSidedP(12.706205, 1)).toBeCloseTo(0.05, 4);
  });

  it("formats p-values", () => {
    expect(formatP(0.0004)).toBe("p < 0.001");
    expect(formatP(0.0123)).toBe("p = 0.012");
    expect(formatP(0.342)).toBe("p = 0.34");
  });
});

describe("trends", () => {
  it("ordinary least squares with a t-test", () => {
    const fit = olsTrend([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
    expect(fit.slope).toBeCloseTo(0.6, 10);
    expect(fit.intercept).toBeCloseTo(2.2, 10);
    expect(fit.se).toBeCloseTo(Math.sqrt(0.08), 10);
    expect(fit.t).toBeCloseTo(2.12132, 4);
    expect(fit.df).toBe(3);
    expect(fit.p).toBeCloseTo(0.1240, 3);
    expect(olsTrend([1, 2], [1, 2])).toBeNull();
  });

  it("Mann–Kendall and Sen's slope", () => {
    const xs = Array.from({ length: 10 }, (_, i) => 2000 + i);
    const mk = mannKendall(xs, xs.map((x) => 2 * x))!;
    expect(mk.s).toBe(45);
    expect(mk.variance).toBe(125);
    expect(mk.z).toBeCloseTo(44 / Math.sqrt(125), 9);
    expect(mk.p).toBeLessThan(0.001);
    expect(mk.senSlope).toBe(2);
    const flat = mannKendall(xs, [1, 2, 1, 2, 1, 2, 1, 2, 1, 2])!;
    expect(flat.p).toBeGreaterThan(0.3);
  });
});
