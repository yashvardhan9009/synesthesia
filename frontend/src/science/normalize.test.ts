import { describe, expect, it } from "vitest";
import { percentile, robustNormalize } from "./normalize.ts";

describe("robustNormalize", () => {
  it("drops POWER fill values before scaling", () => {
    const result = robustNormalize([10, -999, 20, 30]);
    expect(result.values[1]).toBeNull();
    expect(result.values[0]).toBeLessThan(result.values[2]!);
    expect(result.values[2]).toBeLessThan(result.values[3]!);
  });

  it("clamps outliers outside the 5th–95th percentile", () => {
    const result = robustNormalize([0, 10, 10, 10, 10, 10, 10, 100]);
    expect(result.values[0]).toBe(0);
    expect(result.values[result.values.length - 1]).toBe(1);
  });

  it("maps a flat series to the middle of the range", () => {
    const result = robustNormalize([4, 4, 4]);
    expect(result.values).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("percentile", () => {
  it("returns null for an empty list", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("interpolates the median of an even count", () => {
    expect(percentile([1, 3], 50)).toBe(2);
  });
});
