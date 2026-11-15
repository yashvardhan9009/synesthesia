import { REGION_PARAMETERS, type RegionData, type RegionParameter, type SampledPoint } from "./regionApi.ts";
import {
  finite,
  formatP,
  mad,
  MAD_TO_SD,
  mannKendall,
  mean,
  median,
  olsTrend,
  ordinal,
  rankAscending,
  rankDescending,
  type MannKendall,
  type OlsTrend,
} from "./stats.ts";

/**
 * Earth Listening Intelligence: what a region's NASA POWER monthly record
 * says, computed from the numbers alone. Every sentence a finding carries is a
 * fixed template filled with values computed here, so the same response always
 * gives the same words. Nothing here names a cause.
 */

export const NORMAL_PERIOD: readonly [number, number] = [2001, 2020];
/** A month this many robust standard deviations from its normal is unusual (rings a bell). */
export const UNUSUAL_Z = 2;
/** Consecutive months at least this far from normal, on the same side, form a run. */
export const RUN_Z = 1.5;
export const MIN_RUN = 3;
/** Trends with p below this are called significant. */
export const ALPHA = 0.05;
/**
 * Floors on the robust spread, in each variable's scoring unit (rain: ln(1 + P)).
 * Without them a near-constant ocean month would turn 0.05 °C into a large z.
 */
export const Z_FLOOR: Record<RegionParameter, number> = { T2M: 0.15, PRECTOTCORR: 0.05, WS2M: 0.1, RH2M: 1 };
/** Rain months whose normal is below this (mm/day) are dry-season months: never scored as rain findings. */
export const DRY_NORMAL_MM = 0.5;

type Words = { name: string; lower: string; unit: string; /** Unit of a departure (humidity: percentage points). */ delta: string; digits: number; up: string; down: string; aboveVerb: string; belowVerb: string; rose: string; fell: string };

export const WORDS: Record<RegionParameter, Words> = {
  T2M: { name: "Temperature", lower: "temperature", unit: "°C", delta: "°C", digits: 1, up: "warmest", down: "coolest", aboveVerb: "warmer", belowVerb: "cooler", rose: "rose", fell: "fell" },
  PRECTOTCORR: { name: "Rainfall", lower: "rainfall", unit: "mm/day", delta: "mm/day", digits: 1, up: "wettest", down: "driest", aboveVerb: "wetter", belowVerb: "drier", rose: "rose", fell: "fell" },
  WS2M: { name: "Wind", lower: "wind at 2 m", unit: "m/s", delta: "m/s", digits: 2, up: "windiest", down: "calmest", aboveVerb: "windier", belowVerb: "calmer", rose: "strengthened", fell: "weakened" },
  RH2M: { name: "Humidity", lower: "relative humidity", unit: "%", delta: "percentage points", digits: 1, up: "most humid", down: "least humid", aboveVerb: "more humid", belowVerb: "less humid", rose: "rose", fell: "fell" },
};

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---- Formatting (part of the templates) ---------------------------------

const MINUS = "−";
export function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value >= 0 ? "+" : MINUS}${text}`;
}
export function plain(value: number, digits: number): string {
  return value < 0 && Number(Math.abs(value).toFixed(digits)) !== 0 ? `${MINUS}${Math.abs(value).toFixed(digits)}` : Math.abs(value).toFixed(digits);
}
export function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(4, 6)) - 1]} ${key.slice(0, 4)}`;
}
/** "March 2024", "June–September 2015", "June 2023 to December 2025". */
export function periodLabel(fromKey: string, toKey: string): string {
  if (fromKey === toKey) return monthLabel(fromKey);
  const [fy, ty] = [fromKey.slice(0, 4), toKey.slice(0, 4)];
  if (fy === ty) return `${MONTH_NAMES[Number(fromKey.slice(4, 6)) - 1]}–${MONTH_NAMES[Number(toKey.slice(4, 6)) - 1]} ${fy}`;
  return `${monthLabel(fromKey)} to ${monthLabel(toKey)}`;
}

// ---- Climatology and monthly statistics ---------------------------------

/** Rain is scored on ln(1 + P), the app's convention for a skewed variable; the others as they are. */
export function scoringValue(parameter: RegionParameter, value: number): number {
  return parameter === "PRECTOTCORR" ? Math.log1p(Math.max(0, value)) : value;
}

export type Climatology = {
  /** Calendar month, 0 = January. */
  month: number;
  n: number;
  /** Mean of the 2001–2020 values: the normal anomalies are measured from. */
  mean: number;
  /** Median and spread on the scoring scale (rain: ln(1 + P)). spread = max(1.4826 · MAD, floor). */
  median: number;
  spread: number;
  floored: boolean;
};

export type MonthStat = {
  index: number;
  key: string;
  year: number;
  month: number;
  value: number;
  normal: number;
  /** value − normal, in the variable's unit. */
  anomaly: number;
  /** Robust z on the scoring scale; null when the month has no normal. */
  z: number | null;
  /** Rain only: anomaly as a percentage of the normal; null in dry-season months. */
  pct: number | null;
  /** Among the same calendar month in every year of the record. 1 = highest. */
  rank: number;
  rankLow: number;
  of: number;
};

export type YearStat = { year: number; value: number; anomaly: number | null; rank: number; rankLow: number; of: number };

export type Trend = { ols: OlsTrend; mk: MannKendall | null; perDecade: number; senPerDecade: number | null; from: number; to: number; significant: boolean };

export type ParameterAnalysis = {
  parameter: RegionParameter;
  climatology: (Climatology | null)[];
  /** Aligned with RegionData.months; null where the value or its normal is missing. */
  months: (MonthStat | null)[];
  /** Complete calendar years only (all twelve months present). */
  years: YearStat[];
  annualNormal: number | null;
  trend: Trend | null;
};

function calendar(key: string): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(4, 6)) - 1 };
}

export function climatologyOf(parameter: RegionParameter, months: readonly string[], values: readonly (number | null)[], period = NORMAL_PERIOD): (Climatology | null)[] {
  return Array.from({ length: 12 }, (_, month) => {
    const raw = finite(months.map((key, i) => {
      const { year, month: m } = calendar(key);
      return m === month && year >= period[0] && year <= period[1] ? values[i] : null;
    }));
    if (raw.length < 5) return null;
    const scored = raw.map((value) => scoringValue(parameter, value));
    const spreadRaw = MAD_TO_SD * (mad(scored) as number);
    return {
      month,
      n: raw.length,
      mean: mean(raw) as number,
      median: median(scored) as number,
      spread: Math.max(spreadRaw, Z_FLOOR[parameter]),
      floored: spreadRaw < Z_FLOOR[parameter],
    };
  });
}

export function analyseParameter(parameter: RegionParameter, months: readonly string[], values: readonly (number | null)[]): ParameterAnalysis {
  const climatology = climatologyOf(parameter, months, values);
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  months.forEach((key, i) => {
    const value = values[i];
    if (value !== null && Number.isFinite(value)) byMonth[calendar(key).month].push(value);
  });
  const stats: (MonthStat | null)[] = months.map((key, index) => {
    const value = values[index];
    const { year, month } = calendar(key);
    const normal = climatology[month];
    if (value === null || !Number.isFinite(value) || !normal) return null;
    const anomaly = value - normal.mean;
    const z = (scoringValue(parameter, value) - normal.median) / normal.spread;
    const pct = parameter === "PRECTOTCORR" && normal.mean >= DRY_NORMAL_MM ? (anomaly / normal.mean) * 100 : null;
    const pool = byMonth[month];
    return { index, key, year, month, value, normal: normal.mean, anomaly, z, pct, rank: rankDescending(value, pool), rankLow: rankAscending(value, pool), of: pool.length };
  });

  // Annual means from complete years.
  const annual = new Map<number, (number | null)[]>();
  months.forEach((key, i) => {
    const { year } = calendar(key);
    annual.set(year, [...(annual.get(year) ?? []), values[i]]);
  });
  const complete = [...annual.entries()]
    .filter(([, list]) => list.length === 12 && list.every((value) => value !== null && Number.isFinite(value)))
    .map(([year, list]) => ({ year, value: (mean(list as number[]) as number) }));
  const normalYears = complete.filter((item) => item.year >= NORMAL_PERIOD[0] && item.year <= NORMAL_PERIOD[1]);
  const annualNormal = normalYears.length >= 10 ? (mean(normalYears.map((item) => item.value)) as number) : null;
  const pool = complete.map((item) => item.value);
  const years: YearStat[] = complete.map((item) => ({
    year: item.year,
    value: item.value,
    anomaly: annualNormal === null ? null : item.value - annualNormal,
    rank: rankDescending(item.value, pool),
    rankLow: rankAscending(item.value, pool),
    of: pool.length,
  }));

  let trend: Trend | null = null;
  const ols = olsTrend(complete.map((item) => item.year), pool);
  if (ols && complete.length >= 10) {
    const mk = mannKendall(complete.map((item) => item.year), pool);
    trend = { ols, mk, perDecade: ols.slope * 10, senPerDecade: mk ? mk.senSlope * 10 : null, from: complete[0].year, to: complete[complete.length - 1].year, significant: ols.p < ALPHA };
  }
  return { parameter, climatology, months: stats, years, annualNormal, trend };
}

export type RegionAnalysis = Record<RegionParameter, ParameterAnalysis>;

export function analyseRegion(data: Pick<RegionData, "months" | "mean">): RegionAnalysis {
  return Object.fromEntries(REGION_PARAMETERS.map((parameter) => [parameter, analyseParameter(parameter, data.months, data.mean[parameter] ?? [])])) as RegionAnalysis;
}

// ---- Runs -----------------------------------------------------------------

export type Run = { parameter: RegionParameter; from: number; to: number; sign: 1 | -1; length: number; meanZ: number; peak: MonthStat; months: MonthStat[] };

/**
 * Maximal runs of consecutive months on the same side of normal with
 * |robust z| ≥ threshold. A missing month (or a rain month in the dry season)
 * ends a run; nothing is bridged.
 */
export function anomalousRuns(stats: readonly (MonthStat | null)[], parameter: RegionParameter, threshold = RUN_Z, minLength = MIN_RUN): Run[] {
  const runs: Run[] = [];
  let current: MonthStat[] = [];
  let sign: 1 | -1 = 1;
  const close = () => {
    if (current.length >= minLength) {
      const peak = current.reduce((best, item) => (Math.abs(item.z ?? 0) > Math.abs(best.z ?? 0) ? item : best), current[0]);
      runs.push({ parameter, from: current[0].index, to: current[current.length - 1].index, sign, length: current.length, meanZ: (mean(current.map((item) => item.z ?? 0)) as number), peak, months: current });
    }
    current = [];
  };
  for (const item of stats) {
    const usable = item && item.z !== null && Math.abs(item.z) >= threshold && !(parameter === "PRECTOTCORR" && item.pct === null);
    if (!usable) {
      close();
      continue;
    }
    const itemSign = (item.z as number) >= 0 ? 1 : -1;
    if (current.length > 0 && itemSign !== sign) close();
    sign = itemSign;
    current.push(item);
  }
  close();
  return runs;
}

export function runSeverity(run: Pick<Run, "meanZ" | "length">): number {
  return Math.abs(run.meanZ) + Math.log2(run.length);
}

// ---- Spatial contrast -----------------------------------------------------

export type PointDeparture = { point: SampledPoint; position: string; anomaly: number; pct: number | null; months: number };

/** "north-west", "centre", "south", from the point's place in the grid; for boxes wrapping the pole, its coordinates. */
export function positionWord(point: Pick<SampledPoint, "row" | "column" | "lat" | "lon">, rows: number, columns: number, wraps: boolean): string {
  const coords = `${Math.abs(point.lat).toFixed(1)}° ${point.lat >= 0 ? "N" : "S"}, ${Math.abs(point.lon).toFixed(1)}° ${point.lon >= 0 ? "E" : "W"}`;
  const third = (index: number, count: number) => (count <= 1 ? 0.5 : index / (count - 1));
  const ns = third(point.row, rows) < 1 / 3 ? "north" : third(point.row, rows) > 2 / 3 ? "south" : "";
  const ew = third(point.column, columns) < 1 / 3 ? "west" : third(point.column, columns) > 2 / 3 ? "east" : "";
  if (wraps) return `the point at ${coords}`;
  const word = ns && ew ? `${ns}-${ew}` : ns || ew || "centre";
  return `the ${word} (${coords})`;
}

/**
 * Each grid point's departure from its own 2001–2020 normal over the same
 * months: mean of (x − normal) month by month, and for rain the total as a
 * percentage of the total normal. Points missing any of the months are left out.
 */
export function spatialDepartures(data: Pick<RegionData, "months" | "points" | "box">, parameter: RegionParameter, monthIndices: readonly number[]): PointDeparture[] {
  const rows = Math.max(0, ...data.points.map((point) => point.row)) + 1;
  const columns = Math.max(0, ...data.points.map((point) => point.column)) + 1;
  const wraps = data.box.east - data.box.west >= 180;
  const out: PointDeparture[] = [];
  for (const point of data.points) {
    const values = point.series[parameter] ?? [];
    const climatology = climatologyOf(parameter, data.months, values);
    let sumValue = 0;
    let sumNormal = 0;
    let ok = monthIndices.length > 0;
    for (const index of monthIndices) {
      const value = values[index];
      const normal = climatology[calendar(data.months[index]).month];
      if (value === null || value === undefined || !normal) {
        ok = false;
        break;
      }
      sumValue += value;
      sumNormal += normal.mean;
    }
    if (!ok) continue;
    const anomaly = (sumValue - sumNormal) / monthIndices.length;
    const pct = parameter === "PRECTOTCORR" && sumNormal / monthIndices.length >= DRY_NORMAL_MM ? ((sumValue - sumNormal) / sumNormal) * 100 : null;
    out.push({ point, position: positionWord(point, rows, columns, wraps), anomaly, pct, months: monthIndices.length });
  }
  return out;
}

// ---- Findings ---------------------------------------------------------------

export type FindingKind = "temperature" | "rain" | "wind" | "humidity" | "trend" | "record" | "spatial";

export type EvidenceRow = { label: string; value: string; normal: string; anomaly: string; z: string; rank: string };

export type Finding = {
  id: string;
  kind: FindingKind;
  parameter: RegionParameter;
  /** Ranking score; see the Science page for the rule. */
  score: number;
  /** One templated sentence filled with computed numbers. */
  sentence: string;
  /** Month indices (into RegionData.months) where it can be heard. */
  span: { from: number; to: number };
  /** How this finding was computed, in one line. */
  method: string;
  evidence: EvidenceRow[];
  evidenceUnit: "months" | "years";
  spatial?: PointDeparture[];
};

const KIND_OF: Record<RegionParameter, FindingKind> = { T2M: "temperature", PRECTOTCORR: "rain", WS2M: "wind", RH2M: "humidity" };

function zText(z: number | null): string {
  return z === null ? "—" : plain(z, 1);
}

function monthEvidence(parameter: RegionParameter, item: MonthStat): EvidenceRow {
  const w = WORDS[parameter];
  return {
    label: monthLabel(item.key),
    value: `${plain(item.value, w.digits)} ${w.unit}`,
    normal: `${plain(item.normal, w.digits)} ${w.unit}`,
    anomaly: item.pct !== null ? `${signed(item.anomaly, w.digits)} ${w.delta} (${signed(item.pct, 0)}%)` : `${signed(item.anomaly, w.digits)} ${w.delta}`,
    z: zText(item.z),
    rank: `${ordinal(item.rank)} highest, ${ordinal(item.rankLow)} lowest of ${item.of}`,
  };
}

function yearEvidence(parameter: RegionParameter, item: YearStat, analysis: ParameterAnalysis): EvidenceRow {
  const w = WORDS[parameter];
  const pct = parameter === "PRECTOTCORR" && item.anomaly !== null && analysis.annualNormal ? ` (${signed((item.anomaly / analysis.annualNormal) * 100, 0)}%)` : "";
  return {
    label: String(item.year),
    value: `${plain(item.value, w.digits)} ${w.unit}`,
    normal: analysis.annualNormal === null ? "—" : `${plain(analysis.annualNormal, w.digits)} ${w.unit}`,
    anomaly: item.anomaly === null ? "—" : `${signed(item.anomaly, w.digits)} ${w.delta}${pct}`,
    z: "—",
    rank: `${ordinal(item.rank)} highest, ${ordinal(item.rankLow)} lowest of ${item.of}`,
  };
}

/** "the warmest March in 45 years", "the 3rd driest July of 45 years", or "" when outside the top five. */
export function rankPhrase(item: Pick<MonthStat, "rank" | "rankLow" | "of" | "month">, high: boolean, parameter: RegionParameter): string {
  const rank = high ? item.rank : item.rankLow;
  if (rank > 5 || item.of < 10) return "";
  const word = high ? WORDS[parameter].up : WORDS[parameter].down;
  const month = MONTH_NAMES[item.month];
  return rank === 1 ? `the ${word} ${month} in ${item.of} years` : `the ${ordinal(rank)} ${word} ${month} of ${item.of} years`;
}

const NORMAL = `${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]}`;

/** Template: one unusual month. */
export function monthSentence(parameter: RegionParameter, item: MonthStat): string {
  const w = WORDS[parameter];
  const high = (item.z ?? item.anomaly) >= 0;
  const rank = rankPhrase(item, high, parameter);
  const tail = rank ? `, ${rank}` : "";
  const month = MONTH_NAMES[item.month];
  if (parameter === "PRECTOTCORR" && item.pct !== null) {
    return `${w.name}: ${monthLabel(item.key)} was ${Math.abs(item.pct).toFixed(0)}% ${item.pct >= 0 ? "above" : "below"} its ${NORMAL} ${month} normal (${plain(item.value, 1)} against ${plain(item.normal, 1)} mm/day; robust z = ${zText(item.z)})${tail}.`;
  }
  return `${w.name}: ${monthLabel(item.key)} was ${Math.abs(item.anomaly).toFixed(w.digits)} ${w.delta} ${item.anomaly >= 0 ? "above" : "below"} its ${NORMAL} ${month} normal (robust z = ${zText(item.z)})${tail}.`;
}

/** Template: a run of anomalous months. */
export function runSentence(run: Run): string {
  const p = run.parameter;
  const w = WORDS[p];
  const first = run.months[0].key;
  const last = run.months[run.months.length - 1].key;
  const side = run.sign > 0 ? "above" : "below";
  const bound = `robust z ${run.sign > 0 ? "≥" : "≤"} ${plain(run.sign * RUN_Z, 1)} each month`;
  const peak = run.peak;
  const peakRank = rankPhrase(peak, run.sign > 0, p);
  const peakText = `most unusual: ${monthLabel(peak.key)}, ${signed(peak.anomaly, w.digits)} ${w.delta}, z = ${zText(peak.z)}${peakRank ? `, ${peakRank}` : ""}`;
  if (p === "PRECTOTCORR") {
    const total = run.months.reduce((sum, item) => sum + item.value, 0);
    const normal = run.months.reduce((sum, item) => sum + item.normal, 0);
    const pct = ((total - normal) / normal) * 100;
    return `${w.name}: ${periodLabel(first, last)} was ${Math.abs(pct).toFixed(0)}% ${pct >= 0 ? "above" : "below"} normal, ${run.length} consecutive months with ${bound} (${plain(total / run.length, 1)} against a normal of ${plain(normal / run.length, 1)} mm/day; ${peakText}).`;
  }
  const meanAnomaly = mean(run.months.map((item) => item.anomaly)) as number;
  return `${w.name}: from ${monthLabel(first)} to ${monthLabel(last)}, ${run.length} consecutive months ran ${side} their ${NORMAL} normals, by ${signed(meanAnomaly, w.digits)} ${w.delta} on average (${bound}; ${peakText}).`;
}

/** Template: the trend over the whole record. */
export function trendSentence(parameter: RegionParameter, trend: Trend, annualNormal: number | null): string {
  const w = WORDS[parameter];
  const per = `${signed(trend.perDecade, w.digits === 1 ? 2 : w.digits)} ${w.delta} per decade`;
  const pctOf = parameter === "PRECTOTCORR" && annualNormal ? ` (${signed((trend.perDecade / annualNormal) * 100, 1)}% of the ${NORMAL} annual normal)` : "";
  const span = `${trend.from}–${trend.to}`;
  const mk = trend.mk ? `; Sen's slope ${signed((trend.senPerDecade ?? 0), w.digits === 1 ? 2 : w.digits)} ${w.delta} per decade, Mann–Kendall ${formatP(trend.mk.p)}` : "";
  if (!trend.significant) {
    return `Trend: no significant change in ${w.lower} over ${span} (${per}, OLS ${formatP(trend.ols.p)}${mk}).`;
  }
  const verb = trend.perDecade >= 0 ? w.rose : w.fell;
  return `Trend: ${w.lower} ${verb} by ${Math.abs(trend.perDecade).toFixed(w.digits === 1 ? 2 : w.digits)} ${w.delta} per decade${pctOf} over ${span} (OLS on ${trend.ols.n} annual means, ${formatP(trend.ols.p)}${mk}).`;
}

/** Template: a record year. */
export function recordSentence(parameter: RegionParameter, item: YearStat, high: boolean, annualNormal: number | null): string {
  const w = WORDS[parameter];
  const word = high ? w.up : w.down;
  const value = `${plain(item.value, w.digits)} ${w.unit}`;
  let against = "";
  if (item.anomaly !== null && annualNormal !== null) {
    against = parameter === "PRECTOTCORR"
      ? `, ${Math.abs((item.anomaly / annualNormal) * 100).toFixed(0)}% ${item.anomaly >= 0 ? "above" : "below"} the ${NORMAL} annual normal (${value} against ${plain(annualNormal, 1)} mm/day)`
      : `, at ${value}: ${Math.abs(item.anomaly).toFixed(w.digits)} ${w.delta} ${item.anomaly >= 0 ? "above" : "below"} the ${NORMAL} annual normal`;
  }
  return `Record: ${item.year} was the ${word} year in the ${item.of}-year record${against}.`;
}

/** Template: where in the box the departure was largest and smallest. */
export function spatialSentence(parameter: RegionParameter, period: string, points: readonly PointDeparture[], areaValue: number | null = null): string | null {
  if (points.length < 2) return null;
  const w = WORDS[parameter];
  const measure = (item: PointDeparture) => (parameter === "PRECTOTCORR" ? item.pct : item.anomaly);
  const usable = points.filter((item) => measure(item) !== null);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => Math.abs(measure(b) as number) - Math.abs(measure(a) as number));
  const most = sorted[0];
  const least = sorted[sorted.length - 1];
  const show = (value: number) => (parameter === "PRECTOTCORR" ? `${signed(value, 0)}%` : `${signed(value, w.digits)} ${w.delta}`);
  const fmt = (item: PointDeparture) => show(measure(item) as number);
  const area = areaValue === null ? "" : `, against ${show(areaValue)} for the area mean`;
  return `Across the box: during ${period}, ${most.position} departed most from its own ${NORMAL} normal (${w.lower} ${fmt(most)}), and ${least.position} least (${fmt(least)})${area}; ${usable.length} grid points compared.`;
}

export type FindingOptions = {
  /** Years whose months can produce event findings (the span being heard). Trends and record ranks always use the whole record. */
  focus: readonly [number, number];
  limit?: number;
};

const METHOD = {
  month: `x − normal; normal = mean of the same calendar month in ${NORMAL}; robust z = (x − median) / max(1.4826 · MAD, floor) over those ${NORMAL_PERIOD[1] - NORMAL_PERIOD[0] + 1} values (rain on ln(1 + P)); rank among the same calendar month of every year`,
  run: `consecutive months with |robust z| ≥ ${RUN_Z} on the same side of normal, at least ${MIN_RUN} months, no gaps bridged`,
  trend: "ordinary least squares on complete-year annual means with a two-sided t-test (n − 2 degrees of freedom); Mann–Kendall test and Sen's slope as a check",
  record: "highest or lowest annual mean among complete years of the record",
  spatial: `each grid point against its own ${NORMAL} normal for the same months`,
};

/**
 * The ranked findings for a region. Event findings (unusual months, runs,
 * records) come from the focus years; the trend from the whole record. The
 * best finding of each kind is kept before the rest are ranked by score, so
 * temperature, rain, wind and history all have a voice when the data allow.
 */
export function buildFindings(data: Pick<RegionData, "months" | "mean" | "points" | "box">, analysis: RegionAnalysis, options: FindingOptions): Finding[] {
  const [fromYear, toYear] = options.focus;
  const inFocus = (item: MonthStat | null): item is MonthStat => item !== null && item.year >= fromYear && item.year <= toYear;
  const focusIndices = data.months.map((key, index) => ({ key, index })).filter(({ key }) => Number(key.slice(0, 4)) >= fromYear && Number(key.slice(0, 4)) <= toYear);
  const focusSpan = { from: focusIndices[0]?.index ?? 0, to: focusIndices[focusIndices.length - 1]?.index ?? 0 };
  const all: Finding[] = [];
  const topEvent: Partial<Record<RegionParameter, { indices: number[]; period: string }>> = {};

  for (const parameter of REGION_PARAMETERS) {
    const a = analysis[parameter];
    const kind = KIND_OF[parameter];
    const focus = a.months.filter(inFocus);
    const scorable = focus.filter((item) => item.z !== null && !(parameter === "PRECTOTCORR" && item.pct === null));

    // Runs.
    const runs = anomalousRuns(a.months.map((item) => (inFocus(item) ? item : null)), parameter);
    const keptRuns: Run[] = [];
    for (const sign of [1, -1] as const) {
      const best = runs.filter((run) => run.sign === sign).sort((x, y) => runSeverity(y) - runSeverity(x))[0];
      if (best) keptRuns.push(best);
    }
    for (const run of keptRuns) {
      all.push({
        id: `${parameter}-run-${run.months[0].key}`,
        kind,
        parameter,
        score: runSeverity(run),
        sentence: runSentence(run),
        span: { from: run.from, to: run.to },
        method: METHOD.run,
        evidence: run.months.map((item) => monthEvidence(parameter, item)),
        evidenceUnit: "months",
      });
    }

    // Single unusual months not already inside a kept run on the same side.
    for (const high of [true, false]) {
      const pick = scorable.filter((item) => (high ? (item.z as number) > 0 : (item.z as number) < 0)).sort((x, y) => Math.abs(y.z as number) - Math.abs(x.z as number))[0];
      if (!pick || Math.abs(pick.z as number) < UNUSUAL_Z) continue;
      if (keptRuns.some((run) => run.sign === (high ? 1 : -1) && pick.index >= run.from && pick.index <= run.to)) continue;
      all.push({
        id: `${parameter}-month-${pick.key}`,
        kind,
        parameter,
        score: Math.abs(pick.z as number),
        sentence: monthSentence(parameter, pick),
        span: { from: pick.index, to: pick.index },
        method: METHOD.month,
        evidence: [monthEvidence(parameter, pick)],
        evidenceUnit: "months",
      });
    }

    // The strongest event of this variable, for the spatial contrast.
    const events = all.filter((item) => item.parameter === parameter && item.kind === kind).sort((x, y) => y.score - x.score);
    if (events[0]) {
      const indices: number[] = [];
      for (let i = events[0].span.from; i <= events[0].span.to; i += 1) indices.push(i);
      topEvent[parameter] = { indices, period: periodLabel(data.months[events[0].span.from], data.months[events[0].span.to]) };
    }

    // Trend over the whole record.
    if (a.trend) {
      all.push({
        id: `${parameter}-trend`,
        kind: "trend",
        parameter,
        score: trendScore(a.trend, a.years.map((item) => item.value)),
        sentence: trendSentence(parameter, a.trend, a.annualNormal),
        span: focusSpan,
        method: METHOD.trend,
        evidence: a.years.map((item) => yearEvidence(parameter, item, a)),
        evidenceUnit: "years",
      });
    }

    // Record years inside the focus.
    if (parameter !== "RH2M") {
      for (const high of [true, false]) {
        if (parameter === "T2M" && !high) continue; // the coolest year of a long record is rarely recent; the trend covers it
        const record = a.years.find((item) => (high ? item.rank === 1 : item.rankLow === 1));
        if (!record || record.year < fromYear || record.year > toYear || record.of < 10) continue;
        const from = data.months.indexOf(`${record.year}01`);
        const to = data.months.indexOf(`${record.year}12`);
        if (from < 0 || to < 0) continue;
        all.push({
          id: `${parameter}-record-${high ? "high" : "low"}-${record.year}`,
          kind: "record",
          parameter,
          score: parameter === "T2M" ? 4 : parameter === "PRECTOTCORR" ? 3 : 2.5,
          sentence: recordSentence(parameter, record, high, a.annualNormal),
          span: { from, to },
          method: METHOD.record,
          evidence: [yearEvidence(parameter, record, a)],
          evidenceUnit: "years",
        });
      }
    }
  }

  // Spatial contrast for the strongest temperature and rain events.
  for (const parameter of ["T2M", "PRECTOTCORR"] as const) {
    const event = topEvent[parameter];
    if (!event) continue;
    const points = spatialDepartures(data, parameter, event.indices);
    const stats = event.indices.map((index) => analysis[parameter].months[index]).filter((item): item is MonthStat => item !== null);
    const areaValue = stats.length !== event.indices.length ? null
      : parameter === "PRECTOTCORR"
        ? (() => { const normal = stats.reduce((sum, item) => sum + item.normal, 0); return normal > 0 ? ((stats.reduce((sum, item) => sum + item.value, 0) - normal) / normal) * 100 : null; })()
        : stats.reduce((sum, item) => sum + item.anomaly, 0) / stats.length;
    const sentence = spatialSentence(parameter, event.period, points, areaValue);
    if (!sentence) continue;
    const values = points.map((item) => (parameter === "PRECTOTCORR" ? item.pct ?? 0 : item.anomaly));
    const contrast = Math.max(...values) - Math.min(...values);
    all.push({
      id: `${parameter}-spatial`,
      kind: "spatial",
      parameter,
      score: 2 + Math.min(1, contrast / (parameter === "PRECTOTCORR" ? 50 : 1)),
      sentence,
      span: { from: event.indices[0], to: event.indices[event.indices.length - 1] },
      method: METHOD.spatial,
      evidence: points.map((item) => ({
        label: item.position.replace(/^the /, ""),
        value: "",
        normal: "",
        anomaly: parameter === "PRECTOTCORR" && item.pct !== null ? `${signed(item.pct, 0)}%` : `${signed(item.anomaly, WORDS[parameter].digits)} ${WORDS[parameter].delta}`,
        z: "—",
        rank: "",
      })),
      evidenceUnit: "months",
      spatial: points,
    });
  }

  return rankFindings(all, options.limit ?? 10);
}

/**
 * Significant trends score 3 + min(3, −log10 p) scaled by effect size: the
 * change over the record relative to the spread of annual means (full credit
 * at one standard deviation). A tiny but very regular drift ranks lower.
 */
export function trendScore(trend: Trend, annual: readonly number[]): number {
  if (!trend.significant) return 0.3;
  const spread = annual.length > 1 ? Math.sqrt(annual.reduce((sum, v, _, all) => sum + (v - all.reduce((a, b) => a + b, 0) / all.length) ** 2, 0) / (annual.length - 1)) : 0;
  const change = Math.abs(trend.ols.slope * (trend.to - trend.from));
  const effect = spread > 0 ? Math.min(1, change / spread) : 1;
  return 3 * effect + Math.min(3, -Math.log10(Math.max(trend.ols.p, 1e-12))) * effect;
}

/** At most this many findings of one kind make the list, so one variable cannot crowd out the others. */
export const MAX_PER_KIND: Partial<Record<FindingKind, number>> = { trend: 2, spatial: 1 };
const DEFAULT_MAX_PER_KIND = 3;

/** Higher score first; ties go to temperature, then rain, wind and humidity, then by id. */
function byRank(a: Finding, b: Finding): number {
  return b.score - a.score || REGION_PARAMETERS.indexOf(a.parameter) - REGION_PARAMETERS.indexOf(b.parameter) || a.id.localeCompare(b.id);
}

const GROUPS: readonly FindingKind[][] = [["temperature"], ["rain"], ["wind"], ["trend", "record"], ["humidity"], ["spatial"]];

/** Best of each group first (temperature, rain, wind, history, humidity, spatial), then the rest by score; returned highest score first. */
export function rankFindings(findings: readonly Finding[], limit: number): Finding[] {
  const byScore = [...findings].sort(byRank);
  const chosen: Finding[] = [];
  for (const group of GROUPS) {
    const best = byScore.find((item) => group.includes(item.kind) && !chosen.includes(item));
    if (best && chosen.length < limit) chosen.push(best);
  }
  const count = (kind: FindingKind) => chosen.filter((item) => item.kind === kind).length;
  for (const item of byScore) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(item) && count(item.kind) < (MAX_PER_KIND[item.kind] ?? DEFAULT_MAX_PER_KIND)) chosen.push(item);
  }
  return chosen.sort(byRank);
}

/** The header summary, "What the measurements say": a templated opening and the top findings' own sentences. */
export function summarize(regionName: string, data: Pick<RegionData, "points" | "requested" | "months">, findings: readonly Finding[], top = 3): { lead: string; points: string[] } {
  const first = data.months[0]?.slice(0, 4) ?? "";
  const last = data.months[data.months.length - 1];
  const missing = data.requested - data.points.length;
  const lead = `${regionName}: NASA POWER monthly records at ${data.points.length} grid point${data.points.length === 1 ? "" : "s"}${missing > 0 ? ` (${missing} of ${data.requested} failed and are left out)` : ""}, ${first} to ${last ? monthLabel(last) : ""}, area-averaged with cos-latitude weights and compared with each calendar month's ${NORMAL} normal.`;
  const strong = findings.filter((item) => item.score >= 1);
  return { lead, points: (strong.length > 0 ? strong : findings).slice(0, top).map((item) => item.sentence) };
}
