import { DEFAULT_CONFIG, effectiveConfig, rootMidi } from "../audio/labConfig.ts";
import { ANOMALY_BELL_HZ, MAPPINGS, bellLevel, humidityTexture, normalizeFixed, rainHits, windIntensity, type PowerVariable } from "../audio/mappings.ts";
import { stepSeconds, type Bell, type LayerTrace, type Soundscape, type SoundStep } from "../audio/soundscape.ts";
import { changeReferenceMidi, changeToMidi, midiName, midiToFrequency } from "../science/score.ts";
import { MONTH_NAMES, NORMAL_PERIOD, UNUSUAL_Z, monthLabel, plain, signed, type Finding, type MonthStat, type RegionAnalysis } from "./analysis.ts";
import { REGION_PARAMETERS, type RegionData, type RegionParameter } from "./regionApi.ts";

/**
 * The region's soundscape: one note per month (or season) of the area-mean
 * record. Pitch is the temperature's departure from its 2001–2020 normal for
 * that calendar month; rain, wind and humidity colour the note on the app's
 * fixed physical ranges; a bell rings for each variable at |robust z| ≥ 2.
 * Pure: the same analysis gives the same notes, and each note carries its trace.
 */

export type ListenResolution = "month" | "season";

export type ListenSpan = {
  id: string;
  label: string;
  /** First and last year. */
  from: number;
  to: number;
  resolution: ListenResolution;
  /** Optional month-index range (into RegionData.months) that narrows a monthly span, e.g. a 12-month case-study window. */
  months?: { from: number; to: number };
  /** Notes per minute; LISTEN_BPM when absent. */
  bpm?: number;
};

/** Notes per minute. 160 bpm keeps twelve years of months under a minute. */
export const LISTEN_BPM = 160;

/** The playable spans: a compact default, and the whole record by season or by month. */
export function listenSpans(firstYear: number, lastYear: number): ListenSpan[] {
  const compactFrom = Math.max(firstYear, lastYear - 11);
  return [
    { id: "recent", label: `${compactFrom}–${lastYear}, monthly`, from: compactFrom, to: lastYear, resolution: "month" },
    { id: "full-season", label: `${firstYear}–${lastYear}, by season`, from: firstYear, to: lastYear, resolution: "season" },
    { id: "full-month", label: `${firstYear}–${lastYear}, monthly`, from: firstYear, to: lastYear, resolution: "month" },
  ];
}

/**
 * The temperature departure that reaches the ends of the pitch range: the 95th
 * percentile of |anomaly| over the whole record, rounded up to 0.5 °C, within
 * 1–6 °C. An ocean box and the Arctic both use their full range of pitch.
 */
export function pitchFullScale(analysis: RegionAnalysis): number {
  const sizes = analysis.T2M.months.filter((item): item is MonthStat => item !== null).map((item) => Math.abs(item.anomaly)).sort((a, b) => a - b);
  if (sizes.length === 0) return 2;
  const p95 = sizes[Math.min(sizes.length - 1, Math.floor(0.95 * (sizes.length - 1)))];
  return Math.min(6, Math.max(1, Math.ceil(p95 * 2) / 2));
}

const SEASONS = ["Dec–Feb", "Mar–May", "Jun–Aug", "Sep–Nov"];

/** Which month indices make each step. A season with a missing month keeps the months it has; DJF takes the previous December. */
export function stepMonths(months: readonly string[], from: number, to: number, resolution: ListenResolution, range?: { from: number; to: number }): { label: string; key: string; indices: number[] }[] {
  const inSpan = months.map((key, index) => ({ key, index, year: Number(key.slice(0, 4)), month: Number(key.slice(4, 6)) - 1 }));
  if (resolution === "month") {
    return inSpan.filter((item) => item.year >= from && item.year <= to && (!range || (item.index >= range.from && item.index <= range.to))).map((item) => ({ label: monthLabel(item.key), key: item.key, indices: [item.index] }));
  }
  const groups = new Map<string, { label: string; key: string; indices: number[]; order: number }>();
  for (const item of inSpan) {
    const owner = item.month === 11 ? item.year + 1 : item.year;
    if (owner < from || owner > to) continue;
    const slot = Math.floor(((item.month + 1) % 12) / 3);
    const key = `${owner}S${slot}`;
    const group = groups.get(key) ?? { label: `${SEASONS[slot]} ${owner}`, key, indices: [], order: owner * 4 + slot };
    group.indices.push(item.index);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order).map(({ label, key, indices }) => ({ label, key, indices }));
}

export type ListenScape = {
  scape: Soundscape;
  /** steps[i] is made of these month indices. */
  stepIndices: number[][];
  fullScale: number;
  referenceNote: string;
  span: ListenSpan;
};

const UNITS: Record<RegionParameter, string> = { T2M: "°C", PRECTOTCORR: "mm/day", WS2M: "m/s", RH2M: "%" };

type Agg = { value: number; anomaly: number; z: number | null; normal: number } | null;

/** Mean value and anomaly over a step's months; z is the most extreme month's (so a bell is never averaged away). */
function aggregate(stats: readonly (MonthStat | null)[], indices: readonly number[]): Agg {
  const items = indices.map((index) => stats[index]).filter((item): item is MonthStat => item !== null);
  if (items.length === 0) return null;
  const zs = items.filter((item) => item.z !== null);
  const z = zs.length ? zs.reduce((best, item) => (Math.abs(item.z as number) > Math.abs(best.z as number) ? item : best), zs[0]).z : null;
  const n = items.length;
  return { value: items.reduce((s, i) => s + i.value, 0) / n, anomaly: items.reduce((s, i) => s + i.anomaly, 0) / n, normal: items.reduce((s, i) => s + i.normal, 0) / n, z };
}

export function buildListenScape(regionName: string, data: Pick<RegionData, "months" | "points" | "request_urls" | "source" | "box">, analysis: RegionAnalysis, span: ListenSpan): ListenScape {
  const cfg = { ...effectiveConfig(DEFAULT_CONFIG), bpm: span.bpm ?? LISTEN_BPM, anomalyZ: UNUSUAL_Z };
  const root = rootMidi(cfg);
  const referenceMidi = changeReferenceMidi(root, cfg.span);
  const fullScale = pitchFullScale(analysis);
  const groups = stepMonths(data.months, span.from, span.to, span.resolution, span.months);
  const source = `NASA POWER monthly · area mean of ${data.points.length} grid points · ${regionName}`;
  const requestUrl = data.request_urls[0] ?? "";
  const latitude = (data.box.north + data.box.south) / 2;
  const longitude = (data.box.east + data.box.west) / 2;
  const basis = (indices: number[]) =>
    indices.length === 1 ? `the ${MONTH_NAMES[Number(data.months[indices[0]].slice(4, 6)) - 1]}s of ${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]}` : `each month's ${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]} normal, averaged over the season`;

  const steps: SoundStep[] = groups.map((group, index) => {
    const agg = Object.fromEntries(REGION_PARAMETERS.map((p) => [p, aggregate(analysis[p].months, group.indices)])) as Record<RegionParameter, Agg>;
    const traces: LayerTrace[] = [];
    const missing: PowerVariable[] = [];
    const words: string[] = [];
    const trace = (variable: RegionParameter, layer: LayerTrace["layer"], normalized: number | null, rule: string, result: string) =>
      traces.push({ datasetId: "NASA POWER monthly, area mean", variable, layer, date: group.key, raw: agg[variable]?.value ?? null, unit: UNITS[variable], normalized, rule, result });

    const t = agg.T2M;
    let lead: SoundStep["lead"] = null;
    if (!t) {
      missing.push("T2M");
      trace("T2M", "pitch", null, "pitch = reference ± scale steps for (T − normal)", "Missing: no lead note");
    } else {
      const midi = changeToMidi(t.anomaly, "chromatic", root, cfg.span, fullScale);
      lead = { midi, frequency: midiToFrequency(midi), name: midiName(midi) };
      trace("T2M", "pitch", 0.5 + Math.max(-1, Math.min(1, t.anomaly / fullScale)) / 2, `pitch = ${midiName(referenceMidi)} at the normal, ±${fullScale} °C to the ends (${basis(group.indices)})`, `${lead.name}, ${midiToFrequency(midi).toFixed(1)} Hz`);
      words.push(`Temperature ${plain(t.value, 1)} °C, ${signed(t.anomaly, 1)} °C against normal, heard as ${lead.name}.`);
    }

    const rain = agg.PRECTOTCORR;
    let hits = 0;
    if (!rain) {
      missing.push("PRECTOTCORR");
      trace("PRECTOTCORR", "rhythm", null, MAPPINGS.PRECTOTCORR.rule, "Missing: no percussion");
    } else {
      const norm = normalizeFixed(rain.value, MAPPINGS.PRECTOTCORR.range);
      hits = rainHits(rain.value, norm);
      trace("PRECTOTCORR", "rhythm", norm, MAPPINGS.PRECTOTCORR.rule, hits === 0 ? "Dry: no hits" : `${hits} hit${hits === 1 ? "" : "s"}`);
      words.push(`Rain ${plain(rain.value, 1)} mm/day (normal ${plain(rain.normal, 1)}).`);
    }

    const wind = agg.WS2M;
    let intensity = windIntensity(0.5);
    if (!wind) {
      missing.push("WS2M");
      trace("WS2M", "intensity", null, MAPPINGS.WS2M.rule, "Missing: neutral loudness used");
    } else {
      const norm = normalizeFixed(wind.value, MAPPINGS.WS2M.range);
      intensity = windIntensity(norm);
      trace("WS2M", "intensity", norm, MAPPINGS.WS2M.rule, `gain × ${intensity.gain.toFixed(2)}, brightness × ${intensity.brightness.toFixed(2)}`);
    }

    const humidity = agg.RH2M;
    let texture: SoundStep["texture"] = null;
    if (!humidity) {
      missing.push("RH2M");
      trace("RH2M", "texture", null, MAPPINGS.RH2M.rule, "Missing: no texture");
    } else {
      const norm = normalizeFixed(humidity.value, MAPPINGS.RH2M.range);
      texture = humidityTexture(norm);
      trace("RH2M", "texture", norm, MAPPINGS.RH2M.rule, `noise ${texture.level.toFixed(3)}, cutoff ${Math.round(texture.cutoffHz)} Hz`);
    }

    const bells: Bell[] = [];
    for (const p of REGION_PARAMETERS) {
      const item = agg[p];
      if (!item || item.z === null || Math.abs(item.z) < UNUSUAL_Z) continue;
      if (p === "PRECTOTCORR" && group.indices.every((i) => analysis.PRECTOTCORR.months[i]?.pct === null)) continue; // dry season: never a rain bell
      bells.push({ variable: p, frequency: ANOMALY_BELL_HZ[p], level: bellLevel(item.z), z: item.z });
      trace(p, "anomaly", item.z, `robust z = (x − median) / max(1.4826 · MAD, floor) over ${basis(group.indices)}${p === "PRECTOTCORR" ? " (rain on ln(1 + P))" : ""}; bell when |z| ≥ ${UNUSUAL_Z}`, `Bell, z ${plain(item.z, 1)}`);
    }
    if (bells.length) words.push(`Unusual: ${bells.map((bell) => `${MAPPINGS[bell.variable].name.toLowerCase()} (z ${plain(bell.z, 1)})`).join(", ")}.`);

    return {
      index,
      date: group.key,
      label: group.label,
      lead,
      intensity,
      hits,
      texture,
      vibrato: null,
      voices: [],
      bells,
      pulse: 0,
      traces,
      missing,
      caption: `${regionName}, ${group.label}. ${words.join(" ")}`,
      source,
      requestUrl,
    };
  });

  const missing = { T2M: 0, PRECTOTCORR: 0, WS2M: 0, RH2M: 0, PS: steps.length, CLOUD_AMT: steps.length } as Record<PowerVariable, number>;
  for (const step of steps) for (const variable of step.missing) missing[variable] += 1;
  return {
    scape: {
      title: `${regionName}, ${span.label}`,
      place: regionName,
      latitude,
      longitude,
      start: groups[0]?.key ?? "",
      end: groups[groups.length - 1]?.key ?? "",
      dataset: data.source,
      requestUrl,
      config: cfg,
      steps,
      missing,
    },
    stepIndices: groups.map((group) => group.indices),
    fullScale,
    referenceNote: midiName(referenceMidi),
    span,
  };
}

/** The step that sounds a month, or null if the month is outside the played span. */
export function stepOfMonth(listen: Pick<ListenScape, "stepIndices">, monthIndex: number): number | null {
  const found = listen.stepIndices.findIndex((indices) => indices.includes(monthIndex));
  return found < 0 ? null : found;
}

/** The first step where a finding can be heard (its first month inside the span), or null. */
export function findingStep(listen: Pick<ListenScape, "stepIndices">, finding: Pick<Finding, "span">): number | null {
  for (let month = finding.span.from; month <= finding.span.to; month += 1) {
    const step = stepOfMonth(listen, month);
    if (step !== null) return step;
  }
  return null;
}

/** Seconds from the start of the piece to a step, at a tempo and playback rate. */
export function stepTime(step: number, bpm = LISTEN_BPM, rate = 1): number {
  return step * stepSeconds(bpm, rate);
}

/** "0:32", "2:05". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Findings whose months include any month of this step, in their ranked order. Trend findings (whole span) are left out. */
export function findingsAtStep(listen: Pick<ListenScape, "stepIndices">, findings: readonly Finding[], step: number): Finding[] {
  const indices = listen.stepIndices[step] ?? [];
  return findings.filter((finding) => finding.kind !== "trend" && indices.some((index) => index >= finding.span.from && index <= finding.span.to));
}
