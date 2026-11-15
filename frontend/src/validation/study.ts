import type { PowerBaseline } from "../api.ts";
import type { PowerSeries } from "../types.ts";
import { isMissing } from "../science/normalize.ts";

/** A clip is unusual when some five-day mean robust z reaches this magnitude… */
export const UNUSUAL_MIN_Z = 2.5;
/** …and normal when every five-day mean stays below this one. Clips in between are never used. */
export const NORMAL_MAX_Z = 1.5;
export const PRACTICE_TRIALS = 2;
export const TEST_TRIALS = 10;

export type CandidateWindow = { id: string; place: string; latitude: number; longitude: number; start: string; end: string };
export type StudyClip = { id: string; place: string; start: string; end: string; series: PowerSeries; maxAbsZ: number; peakZ: number; z: number[]; unusual: boolean };
export type Trial = { id: string; seed: number; condition: "warm-anomaly" | "cool-anomaly"; clips: [StudyClip, StudyClip]; correct: 0 | 1; practice: boolean };
export type TrialResponse = { trialId: string; response: 0 | 1; rtMs: number; confidence: 1 | 2 | 3 | 4; correct: 0 | 1 };

/** Robustly standardize against the baseline's same-calendar-day 10th–90th range. */
export function robustZ(value: number | null | undefined, stats: { p10: number; p50: number; p90: number } | undefined): number | null {
  if (value == null || !Number.isFinite(value) || !stats) return null;
  const robustSd = (stats.p90 - stats.p10) / 2.563;
  return robustSd > 1e-9 ? (value - stats.p50) / robustSd : null;
}

export function scoreClip(window: CandidateWindow, series: PowerSeries, baseline: PowerBaseline): StudyClip {
  const dailyZ = series.dates.map((date, index) => {
    const value = series.parameters.T2M?.[index]?.value;
    if (value == null || isMissing(value)) return null;
    const stats = baseline.days.T2M?.[date.slice(4, 8)];
    return robustZ(value, stats);
  });
  // A five-day mean is the event unit: it preserves a short weather episode
  // while reducing day-to-day noise. Missing dates break a window; they are
  // never imputed.
  const z: number[] = [];
  for (let index = 0; index <= dailyZ.length - 5; index += 1) {
    const windowZ = dailyZ.slice(index, index + 5);
    if (windowZ.length === 5 && windowZ.every((value): value is number => value !== null)) z.push(windowZ.reduce((sum, value) => sum + value, 0) / 5);
  }
  const maxAbsZ = z.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const peakZ = z.reduce((peak, value) => Math.abs(value) > Math.abs(peak) ? value : peak, 0);
  return { ...window, id: window.id, series, z, maxAbsZ, peakZ, unusual: maxAbsZ >= UNUSUAL_MIN_Z };
}

export function eligiblePair(anomalies: readonly StudyClip[], normals: readonly StudyClip[]): boolean {
  return anomalies.some((clip) => clip.maxAbsZ >= UNUSUAL_MIN_Z) && normals.some((clip) => clip.maxAbsZ < NORMAL_MAX_Z);
}

/** FNV-1a: a participant code and the candidate list give a reproducible 32-bit seed. */
export function seedFor(text: string): number {
  return [...text].reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Classify a scored clip by the protocol's cutoffs. */
export function classify(clip: Pick<StudyClip, "maxAbsZ">): "unusual" | "normal" | "between" {
  return clip.maxAbsZ >= UNUSUAL_MIN_Z ? "unusual" : clip.maxAbsZ < NORMAL_MAX_Z ? "normal" : "between";
}

/**
 * Seeded trials. While the pools last, every pair uses clips not yet heard in
 * the session; only a pool smaller than the session is reused (cyclically).
 */
export function makeTrials(anomalies: readonly StudyClip[], normals: readonly StudyClip[], seed: number, practiceCount = PRACTICE_TRIALS, testCount = TEST_TRIALS): Trial[] {
  if (!eligiblePair(anomalies, normals)) return [];
  const random = seededRandom(seed);
  const shuffled = <T,>(items: readonly T[]) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other]!, result[index]!];
    }
    return result;
  };
  const unusual = shuffled(anomalies.filter((clip) => classify(clip) === "unusual"));
  const usual = shuffled(normals.filter((clip) => classify(clip) === "normal"));
  return Array.from({ length: practiceCount + testCount }, (_, index) => {
    const unusualClip = unusual[index % unusual.length];
    const usualClip = usual[index % usual.length];
    const order: [StudyClip, StudyClip] = random() < 0.5 ? [unusualClip, usualClip] : [usualClip, unusualClip];
    return { id: `trial-${index + 1}`, seed, condition: unusualClip.peakZ >= 0 ? "warm-anomaly" : "cool-anomaly", clips: order, correct: order[0].unusual ? 0 : 1, practice: index < practiceCount };
  });
}

export type Score = { accuracy: number; hitRate: number; falseAlarmRate: number; dPrime: number; meanRtMs: number; byCondition: Record<string, { n: number; accuracy: number }> };

/** Log-linear correction prevents infinite d′ when a rate is zero or one. */
export function scoreResponses(trials: readonly Trial[], responses: readonly TrialResponse[]): Score {
  const pairs = trials.map((trial) => ({ trial, response: responses.find((item) => item.trialId === trial.id) })).filter((item): item is { trial: Trial; response: TrialResponse } => Boolean(item.response));
  let hits = 0; let misses = 0; let falseAlarms = 0; let correctRejects = 0;
  const conditions: Record<string, { n: number; correct: number }> = {};
  for (const { trial, response } of pairs) {
    const condition = conditions[trial.condition] ??= { n: 0, correct: 0 };
    condition.n += 1;
    const selected = trial.clips[response.response];
    const notSelected = trial.clips[response.response === 0 ? 1 : 0];
    if (selected.unusual) { hits += 1; condition.correct += response.response === trial.correct ? 1 : 0; }
    else falseAlarms += 1;
    if (notSelected.unusual) misses += 1;
    else correctRejects += 1;
  }
  const hitRate = (hits + 0.5) / (hits + misses + 1);
  const falseAlarmRate = (falseAlarms + 0.5) / (falseAlarms + correctRejects + 1);
  const inverseNormal = (p: number) => {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) { const r = 0.180625 - q * q; return q * (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1); }
    const r = q < 0 ? p : 1 - p;
    const root = Math.sqrt(-Math.log(r));
    const value = (((((c[0]! * root + c[1]!) * root + c[2]!) * root + c[3]!) * root + c[4]!) * root + c[5]!) / ((((d[0]! * root + d[1]!) * root + d[2]!) * root + d[3]!) * root + 1);
    return q < 0 ? value : -value;
  };
  return {
    accuracy: pairs.length ? pairs.filter(({ trial, response }) => trial.correct === response.response).length / pairs.length : 0,
    hitRate, falseAlarmRate, dPrime: inverseNormal(hitRate) - inverseNormal(falseAlarmRate),
    meanRtMs: pairs.length ? pairs.reduce((sum, item) => sum + item.response.rtMs, 0) / pairs.length : 0,
    byCondition: Object.fromEntries(Object.entries(conditions).map(([key, value]) => [key, { n: value.n, accuracy: value.n ? value.correct / value.n : 0 }])),
  };
}

export function exportCsv(trials: readonly Trial[], responses: readonly TrialResponse[]): string {
  const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows: unknown[][] = [["trial", "seed", "place", "date_start", "date_end", "z_max_abs", "correct_clip", "response", "rt_ms", "confidence", "practice"]];
  for (const trial of trials) {
    const response = responses.find((item) => item.trialId === trial.id);
    for (const clip of trial.clips) rows.push([trial.id, trial.seed, clip.place, clip.start, clip.end, clip.maxAbsZ.toFixed(3), trial.correct, response?.response ?? "", response?.rtMs ?? "", response?.confidence ?? "", trial.practice]);
  }
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

export function exportJson(trials: readonly Trial[], responses: readonly TrialResponse[]): string {
  return JSON.stringify(trials.flatMap((trial) => trial.clips.map((clip) => ({ trial: trial.id, seed: trial.seed, place: clip.place, start: clip.start, end: clip.end, z: clip.z, zMaxAbs: clip.maxAbsZ, correct: trial.correct, response: responses.find((item) => item.trialId === trial.id)?.response ?? null, rtMs: responses.find((item) => item.trialId === trial.id)?.rtMs ?? null, confidence: responses.find((item) => item.trialId === trial.id)?.confidence ?? null }))), null, 2);
}
