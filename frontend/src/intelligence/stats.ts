/**
 * Small, exact statistics for Earth Listening Intelligence. Pure functions on
 * plain numbers: medians, the median absolute deviation, robust z-scores,
 * ordinary least squares with a t-test, Mann–Kendall and Sen's slope. Missing
 * values are the caller's to drop; nothing here fills a gap.
 */

/** 1.4826 · MAD estimates the standard deviation of a normal sample. */
export const MAD_TO_SD = 1.4826;

export function finite(values: readonly (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median absolute deviation from the median (unscaled). */
export function mad(values: readonly number[]): number | null {
  const centre = median(values);
  if (centre === null) return null;
  return median(values.map((value) => Math.abs(value - centre)));
}

/** Sample standard deviation (n − 1). */
export function sd(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const centre = mean(values) as number;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - centre) ** 2, 0) / (values.length - 1));
}

/**
 * The spread used for a robust z: 1.4826 · MAD, but never below `floor`.
 * Without the floor a near-constant series (an ocean month, a dry season)
 * would make a tiny change look extreme.
 */
export function robustScale(values: readonly number[], floor: number): number | null {
  const spread = mad(values);
  return spread === null ? null : Math.max(MAD_TO_SD * spread, floor);
}

/** z = (x − median) / max(1.4826 · MAD, floor). */
export function robustZ(value: number, centre: number, scale: number): number {
  return (value - centre) / scale;
}

/** Rank of `value` among `values` (which include it), 1 = largest. Ties share the best rank. */
export function rankDescending(value: number, values: readonly number[]): number {
  return 1 + values.filter((other) => other > value).length;
}

export function rankAscending(value: number, values: readonly number[]): number {
  return 1 + values.filter((other) => other < value).length;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

// ---- Distributions ------------------------------------------------------

/** ln Γ(x) for x > 0 (Lanczos, g = 7, n = 9). */
export function logGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let sum = c[0];
  for (let i = 1; i < 9; i += 1) sum += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinued(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinued(a, b, x)) / a : 1 - (front * betaContinued(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t with `df` degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Standard normal CDF (erf by Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// ---- Trends -------------------------------------------------------------

export type OlsTrend = {
  n: number;
  /** Change per unit of x (per year when x is years). */
  slope: number;
  intercept: number;
  /** Standard error of the slope. */
  se: number;
  t: number;
  df: number;
  /** Two-sided p-value of H0: slope = 0. */
  p: number;
  r2: number;
};

/** Ordinary least squares y = a + b·x with the usual t-test on b. Needs at least 3 points. */
export function olsTrend(xs: readonly number[], ys: readonly number[]): OlsTrend | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = (mean(xs.slice(0, n)) as number);
  const my = (mean(ys.slice(0, n)) as number);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const sse = Math.max(0, syy - slope * sxy);
  const df = n - 2;
  const se = Math.sqrt(sse / df / sxx);
  const t = se === 0 ? (slope === 0 ? 0 : Infinity * Math.sign(slope)) : slope / se;
  return { n, slope, intercept, se, t, df, p: se === 0 ? (slope === 0 ? 1 : 0) : tTwoSidedP(t, df), r2: syy === 0 ? 0 : (slope * sxy) / syy };
}

export type MannKendall = { n: number; s: number; variance: number; z: number; p: number; /** Sen's slope: median of pairwise slopes. */ senSlope: number };

/** Mann–Kendall trend test (normal approximation with tie correction) and Sen's slope. */
export function mannKendall(xs: readonly number[], ys: readonly number[]): MannKendall | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return null;
  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      s += Math.sign(ys[j] - ys[i]);
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    }
  }
  const ties = new Map<number, number>();
  for (const y of ys.slice(0, n)) ties.set(y, (ties.get(y) ?? 0) + 1);
  let tieTerm = 0;
  for (const count of ties.values()) if (count > 1) tieTerm += count * (count - 1) * (2 * count + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance <= 0 ? 0 : s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return { n, s, variance, z, p: 2 * (1 - normalCdf(Math.abs(z))), senSlope: median(slopes) ?? 0 };
}

/** "p < 0.001", "p = 0.012", "p = 0.34". */
export function formatP(p: number): string {
  if (p < 0.001) return "p < 0.001";
  if (p < 0.1) return `p = ${p.toFixed(3)}`;
  return `p = ${p.toFixed(2)}`;
}
