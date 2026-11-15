import { finiteValues } from "./normalize.ts";

/** Makes MAD comparable to a standard deviation for a normal distribution. */
export const MAD_TO_SIGMA = 0.67448975;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export type AnomalyPoint = {
  value: number | null;
  z: number | null;
  flagged: boolean;
};

function zScore(value: number, center: number, mad: number): number {
  if (mad < 1e-9) {
    return Math.abs(value - center) < 1e-9 ? 0 : Math.sign(value - center) * 10;
  }
  return (MAD_TO_SIGMA * (value - center)) / mad;
}

function scoreAgainst(
  values: readonly (number | null)[],
  center: number,
  mad: number,
  threshold: number,
): AnomalyPoint[] {
  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) {
      return { value, z: null, flagged: false };
    }
    const z = zScore(value, center, mad);
    return { value, z, flagged: Math.abs(z) >= threshold };
  });
}

/**
 * Robust z-score against the series' own median and MAD. `minMad` (default 0)
 * keeps a near-constant series from turning tiny changes into extreme scores.
 */
export function robustAnomalies(
  values: readonly (number | null)[],
  threshold = 2.5,
  minMad = 0,
): AnomalyPoint[] {
  const finite = finiteValues(values);
  const center = median(finite);
  if (center === null) {
    return values.map((value) => ({ value, z: null, flagged: false }));
  }
  const mad = Math.max(minMad, median(finite.map((value) => Math.abs(value - center))) ?? 0);
  return scoreAgainst(values, center, mad, threshold);
}

/** Score `values` against the distribution of a baseline window (Time Machine). */
export function anomaliesAgainstBaseline(
  values: readonly (number | null)[],
  baseline: readonly (number | null)[],
  threshold = 2.5,
): AnomalyPoint[] {
  const finite = finiteValues(baseline);
  const center = median(finite);
  if (center === null) return robustAnomalies(values, threshold);
  const mad = median(finite.map((value) => Math.abs(value - center))) ?? 0;
  return scoreAgainst(values, center, mad, threshold);
}
