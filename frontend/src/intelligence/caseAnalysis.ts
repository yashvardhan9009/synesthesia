import {
  MONTH_NAMES,
  NORMAL_PERIOD,
  RUN_Z,
  UNUSUAL_Z,
  WORDS,
  monthLabel,
  periodLabel,
  plain,
  rankPhrase,
  signed,
  type MonthStat,
  type RegionAnalysis,
} from "./analysis.ts";
import { REGION_PARAMETERS, type RegionData, type RegionParameter } from "./regionApi.ts";
import { mean } from "./stats.ts";

/**
 * The case study: search a region's monthly record for its strongest
 * compound heat-and-dryness event (temperature above normal while rainfall and
 * relative humidity are below), pick a data-selected normal reference for the
 * same calendar months, and describe both with fixed templates filled from the
 * numbers. Wind is reported beside them but is not part of the test. Pure;
 * nothing here names a cause.
 */

/** Each of the three legs must reach this |robust z| in the peak month for the event to count. */
export const COMPOUND_Z = UNUSUAL_Z;
/** Neighbouring months stay in the event while all three legs keep this |robust z|. */
export const EXTEND_Z = RUN_Z;
export const MAX_EVENT_MONTHS = 6;
/** The heard window: twelve consecutive months containing the event. */
export const WINDOW_MONTHS = 12;
/** 12 notes at this tempo last 10 s. */
export const CASE_BPM = 72;

const NORMAL = `${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]}`;
/** The legs of the test and the side each must be on. */
export const LEGS: readonly { parameter: RegionParameter; sign: 1 | -1 }[] = [
  { parameter: "T2M", sign: 1 },
  { parameter: "PRECTOTCORR", sign: -1 },
  { parameter: "RH2M", sign: -1 },
];

/**
 * How strongly a month is hot and dry at once: the weakest of +z(temperature),
 * −z(rain) and −z(humidity). Null when a leg is missing or the rain month is in
 * the dry season (its normal is below 0.5 mm/day, so rain is not scored).
 */
export function compoundStrength(analysis: RegionAnalysis, index: number): number | null {
  let weakest = Infinity;
  for (const leg of LEGS) {
    const item = analysis[leg.parameter].months[index];
    if (!item || item.z === null) return null;
    if (leg.parameter === "PRECTOTCORR" && item.pct === null) return null;
    weakest = Math.min(weakest, leg.sign * item.z);
  }
  return weakest;
}

export type CaseSide = {
  /** Mean over the event months (or their reference months), in the variable's unit. */
  value: number;
  normal: number;
  anomaly: number;
  /** Rain: total departure as a percentage of the total normal. */
  pct: number | null;
  /** Mean robust z over the months that have one. */
  meanZ: number | null;
};

export type CaseMeasure = {
  parameter: RegionParameter;
  event: CaseSide;
  reference: CaseSide;
  /** The event month with the largest |z| for this variable. */
  peak: MonthStat | null;
  /** Whether this variable is part of the compound test. */
  leg: boolean;
};

export type CaseEvent = {
  /** True when the peak month passes |z| ≥ COMPOUND_Z on all three legs. */
  met: boolean;
  peak: number;
  strength: number;
  /** Each variable's robust z in the peak month. */
  peakZ: Record<RegionParameter, number | null>;
  /** Event months (indices into RegionData.months), consecutive. */
  from: number;
  to: number;
  /** The heard 12-month window around the event. */
  window: { from: number; to: number };
  /** The same calendar window shifted by whole years into the normal period. */
  reference: { shift: number; from: number; to: number; eventFrom: number; eventTo: number; maxAbsZ: number };
  measures: CaseMeasure[];
  /** Months searched, and how many could be scored on all three legs. */
  searched: { first: string; last: string; scored: number };
};

function side(analysis: RegionAnalysis, parameter: RegionParameter, from: number, to: number): CaseSide | null {
  const items: MonthStat[] = [];
  for (let index = from; index <= to; index += 1) {
    const item = analysis[parameter].months[index];
    if (!item) return null;
    items.push(item);
  }
  if (items.length === 0) return null;
  const value = mean(items.map((item) => item.value)) as number;
  const normal = mean(items.map((item) => item.normal)) as number;
  const zs = items.filter((item) => item.z !== null && !(parameter === "PRECTOTCORR" && item.pct === null)).map((item) => item.z as number);
  const usableRain = parameter === "PRECTOTCORR" && items.every((item) => item.pct !== null) && normal > 0;
  return { value, normal, anomaly: value - normal, pct: usableRain ? ((value - normal) / normal) * 100 : null, meanZ: zs.length ? (mean(zs) as number) : null };
}

/** Largest |z| over the four variables in a run of months; Infinity if any value is missing. */
function maxAbsZ(analysis: RegionAnalysis, from: number, to: number): number {
  let worst = 0;
  for (let index = from; index <= to; index += 1) {
    for (const parameter of REGION_PARAMETERS) {
      const item = analysis[parameter].months[index];
      if (!item) return Infinity;
      if (item.z === null || (parameter === "PRECTOTCORR" && item.pct === null)) continue;
      worst = Math.max(worst, Math.abs(item.z));
    }
  }
  return worst;
}

/**
 * Search the whole record for the strongest compound month, grow it into the
 * neighbouring months that keep every leg at EXTEND_Z, place a 12-month window
 * around it, and choose the reference: the same calendar months shifted by
 * whole years into 2001–2020 whose largest |z| across all four variables is the
 * smallest. Null when no month can be scored on all three legs or no reference fits.
 */
export function findCompoundEvent(data: Pick<RegionData, "months">, analysis: RegionAnalysis): CaseEvent | null {
  const n = data.months.length;
  let peak = -1;
  let strength = -Infinity;
  let scored = 0;
  for (let index = 0; index < n; index += 1) {
    const value = compoundStrength(analysis, index);
    if (value === null) continue;
    scored += 1;
    if (value > strength) {
      strength = value;
      peak = index;
    }
  }
  if (peak < 0 || n < WINDOW_MONTHS) return null;
  const met = strength >= COMPOUND_Z;
  let from = peak;
  let to = peak;
  const keeps = (index: number) => index >= 0 && index < n && (compoundStrength(analysis, index) ?? -Infinity) >= EXTEND_Z;
  if (met) {
    while (to - from + 1 < MAX_EVENT_MONTHS) {
      const left = keeps(from - 1) ? compoundStrength(analysis, from - 1)! : -Infinity;
      const right = keeps(to + 1) ? compoundStrength(analysis, to + 1)! : -Infinity;
      if (left === -Infinity && right === -Infinity) break;
      if (left >= right) from -= 1;
      else to += 1;
    }
  }
  const length = to - from + 1;
  const start = Math.max(0, Math.min(n - WINDOW_MONTHS, from - Math.floor((WINDOW_MONTHS - length) / 2)));
  const window = { from: start, to: start + WINDOW_MONTHS - 1 };

  let reference: CaseEvent["reference"] | null = null;
  const year = (index: number) => Number(data.months[index].slice(0, 4));
  for (let shift = -60; shift <= 60; shift += 1) {
    if (shift === 0) continue;
    const delta = shift * 12;
    const [eFrom, eTo, wFrom, wTo] = [from + delta, to + delta, window.from + delta, window.to + delta];
    if (wFrom < 0 || wTo >= n || year(eFrom) < NORMAL_PERIOD[0] || year(eTo) > NORMAL_PERIOD[1]) continue;
    if (eTo >= from && eFrom <= to) continue;
    const score = maxAbsZ(analysis, eFrom, eTo);
    if (!Number.isFinite(score)) continue;
    if (!reference || score < reference.maxAbsZ - 1e-9 || (Math.abs(score - reference.maxAbsZ) <= 1e-9 && Math.abs(shift) < Math.abs(reference.shift))) {
      reference = { shift, from: wFrom, to: wTo, eventFrom: eFrom, eventTo: eTo, maxAbsZ: score };
    }
  }
  if (!reference) return null;

  const measures: CaseMeasure[] = [];
  for (const parameter of REGION_PARAMETERS) {
    const event = side(analysis, parameter, from, to);
    const ref = side(analysis, parameter, reference.eventFrom, reference.eventTo);
    if (!event || !ref) return null;
    let best: MonthStat | null = null;
    for (let index = from; index <= to; index += 1) {
      const item = analysis[parameter].months[index];
      if (!item || item.z === null || (parameter === "PRECTOTCORR" && item.pct === null)) continue;
      if (!best || Math.abs(item.z) > Math.abs(best.z as number)) best = item;
    }
    measures.push({ parameter, event, reference: ref, peak: best, leg: LEGS.some((leg) => leg.parameter === parameter) });
  }
  const peakZ = Object.fromEntries(REGION_PARAMETERS.map((parameter) => [parameter, analysis[parameter].months[peak]?.z ?? null])) as Record<RegionParameter, number | null>;
  return { met, peak, strength, peakZ, from, to, window, reference, measures, searched: { first: data.months[0], last: data.months[n - 1], scored } };
}

// ---- Templates ----------------------------------------------------------------

export function eventPeriod(data: Pick<RegionData, "months">, event: Pick<CaseEvent, "from" | "to">): string {
  return periodLabel(data.months[event.from], data.months[event.to]);
}

export function referencePeriod(data: Pick<RegionData, "months">, event: Pick<CaseEvent, "reference">): string {
  return periodLabel(data.months[event.reference.eventFrom], data.months[event.reference.eventTo]);
}

export function windowPeriod(data: Pick<RegionData, "months">, range: { from: number; to: number }): string {
  return periodLabel(data.months[range.from], data.months[range.to]);
}

/** The opening sentence: the event, or an honest statement that the test was not met. */
export function caseHeadline(regionName: string, data: Pick<RegionData, "months">, event: CaseEvent): string {
  const peakKey = data.months[event.peak];
  const peakZ = (parameter: RegionParameter) => {
    const z = event.peakZ[parameter];
    return z === null ? "—" : signed(z, 1);
  };
  const legs = `temperature ${peakZ("T2M")}, rainfall ${peakZ("PRECTOTCORR")} and relative humidity ${peakZ("RH2M")}`;
  const first = monthLabel(event.searched.first);
  const last = monthLabel(event.searched.last);
  if (!event.met) {
    return `${regionName}: no month from ${first} to ${last} had temperature above normal and rainfall and humidity below normal all by ${COMPOUND_Z} or more robust standard deviations, so this record has no compound heat-and-dryness event by this test. The closest was ${monthLabel(peakKey)} (${legs}; weakest leg ${signed(event.strength, 2)}). It is shown for comparison, not as an event.`;
  }
  const length = event.to - event.from + 1;
  const spread = length > 1 ? ` All three stayed at |z| ≥ ${EXTEND_Z} in each month of ${eventPeriod(data, event)}, so the event spans ${length} months.` : "";
  return `${regionName}, ${eventPeriod(data, event)}: heat and dryness at the same time. Searching every month from ${first} to ${last}, the strongest was ${monthLabel(peakKey)}, with robust z of ${legs} against each calendar month's ${NORMAL} normal; all three pass |z| ≥ ${COMPOUND_Z}.${spread}`;
}

/** One sentence per variable: event mean against normal, the reference, and the most unusual month. */
export function measureSentence(measure: CaseMeasure, period: string, referenceLabel: string): string {
  const w = WORDS[measure.parameter];
  const e = measure.event;
  const r = measure.reference;
  const amount = measure.parameter === "PRECTOTCORR" && e.pct !== null
    ? `${Math.abs(e.pct).toFixed(0)}% ${e.pct >= 0 ? "above" : "below"} normal (${plain(e.value, 1)} against ${plain(e.normal, 1)} mm/day)`
    : `${Math.abs(e.anomaly).toFixed(w.digits)} ${w.delta} ${e.anomaly >= 0 ? "above" : "below"} normal (${plain(e.value, w.digits)} ${w.unit})`;
  const refAmount = measure.parameter === "PRECTOTCORR" && r.pct !== null ? `${signed(r.pct, 0)}%` : `${signed(r.anomaly, w.digits)} ${w.delta}`;
  const peak = measure.peak;
  const rank = peak ? rankPhrase(peak, (peak.z ?? 0) >= 0, measure.parameter) : "";
  const peakText = peak && peak.z !== null ? `; most unusual month ${MONTH_NAMES[peak.month]} ${peak.year}, z = ${signed(peak.z, 1)}${rank ? `, ${rank}` : ""}` : "";
  const unusual = peak && peak.z !== null && Math.abs(peak.z) >= COMPOUND_Z;
  const note = measure.leg ? "" : unusual ? " Wind is not part of the test, but it was unusual too." : ` Wind is not part of the test and stayed within |z| < ${COMPOUND_Z}.`;
  return `${w.name}: ${period} averaged ${amount}${peakText}. Reference ${referenceLabel}: ${refAmount}.${note}`;
}

/** Why the reference was chosen. */
export function referenceSentence(data: Pick<RegionData, "months">, event: CaseEvent): string {
  return `Reference: ${referencePeriod(data, event)}, the same calendar months moved ${Math.abs(event.reference.shift)} year${Math.abs(event.reference.shift) === 1 ? "" : "s"} ${event.reference.shift < 0 ? "earlier" : "later"}. Of every such shift inside ${NORMAL}, its largest |robust z| across all four variables was the smallest: ${plain(event.reference.maxAbsZ, 1)}.`;
}

/** What changes in the sound, from the two pieces' own notes. */
export function earSentence(eventNotes: readonly { label: string; note: string | null; bells: number }[], referenceNotes: readonly { label: string; note: string | null; bells: number }[], peakPosition: number): string {
  const e = eventNotes[peakPosition];
  const r = referenceNotes[peakPosition];
  const eventBells = eventNotes.reduce((sum, item) => sum + item.bells, 0);
  const referenceBells = referenceNotes.reduce((sum, item) => sum + item.bells, 0);
  const pitch = e && r && e.note && r.note ? `At note ${peakPosition + 1}, ${e.label} plays ${e.note} where ${r.label} plays ${r.note}. ` : "";
  return `${pitch}The event piece rings ${eventBells} anomaly bell${eventBells === 1 ? "" : "s"} over its ${eventNotes.length} notes; the reference rings ${referenceBells}.`;
}
