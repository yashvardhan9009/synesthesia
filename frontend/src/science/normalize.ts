/** NASA POWER uses -999 as the documented fill value. */
export const POWER_FILL = -999;

export function isMissing(value: number): boolean {
  return !Number.isFinite(value) || value <= POWER_FILL;
}

export function finiteValues(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

/** Linear-interpolation percentile. `p` is 0–100. Empty input returns null. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const mix = rank - low;
  return sorted[low] * (1 - mix) + sorted[high] * mix;
}

export type NormResult = {
  values: (number | null)[];
  low: number | null;
  high: number | null;
};

/**
 * Map observations onto 0–1 using the pLow/pHigh percentiles, then clamp.
 * Missing values stay null. A zero span (a flat series) becomes 0.5.
 */
export function robustNormalize(
  values: readonly (number | null)[],
  pLow = 5,
  pHigh = 95,
): NormResult {
  const cleaned = values.map((value) =>
    value === null || isMissing(value) ? null : value,
  );
  const finite = finiteValues(cleaned);
  const low = percentile(finite, pLow);
  const high = percentile(finite, pHigh);
  if (low === null || high === null) {
    return { values: values.map(() => null), low, high };
  }
  const span = high - low;
  return {
    low,
    high,
    values: cleaned.map((value) => {
      if (value === null) return null;
      if (Math.abs(span) < 1e-9) return 0.5;
      return Math.min(1, Math.max(0, (value - low) / span));
    }),
  };
}
