import { robustAnomalies } from "../science/anomaly.ts";
import { robustNormalize } from "../science/normalize.ts";
import { CHANGE_FULL_SCALE_C, changeReferenceMidi, changeToMidi, midiName, midiToFrequency, scoreSample } from "../science/score.ts";
import { keyedPoints } from "../geo/comparison.ts";
import type {
  FrameSample,
  PitchFrom,
  PowerSeries,
  SonicEvent,
  SonicSettings,
} from "../types.ts";
import { PARAMETERS } from "../types.ts";

const PITCH_WORD: Record<PitchFrom, string> = {
  luminance: "brightness",
  warmth: "warmth",
  contrast: "contrast",
};

export function formatDay(yyyymmdd: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  if (!month || !day) return yyyymmdd;
  return `${day} ${months[month - 1]} ${yyyymmdd.slice(0, 4)}`;
}

function channel(series: PowerSeries, name: string): (number | null)[] {
  return (series.parameters[name] ?? []).map((point) => point.value);
}

export function eventsFromFrames(
  title: string,
  samples: FrameSample[],
  pitchFrom: PitchFrom,
  settings: SonicSettings,
): SonicEvent[] {
  const raw = samples.map((sample) => sample[pitchFrom]);
  const scaled = robustNormalize(raw);
  const anomalies = robustAnomalies(raw, settings.anomalyZ);
  const events: SonicEvent[] = [];
  samples.forEach((sample, index) => {
    const scored = scoreSample({
      norm: scaled.values[index],
      z: anomalies[index]?.z ?? null,
      ...settings,
    });
    if (!scored) return;
    const word = PITCH_WORD[pitchFrom];
    const value = sample[pitchFrom];
    const flag = scored.accent
      ? ` This step is an outlier among the others (|z| ${Math.abs(anomalies[index].z ?? 0).toFixed(1)}).`
      : "";
    events.push({
      sourceIndex: index,
      label: sample.label,
      caption: `${title}. ${sample.label}. ${word} ${value.toFixed(2)} is heard as ${midiName(scored.midi)}.${flag}`,
      frequency: scored.frequency,
      gain: scored.gain,
      filterHz: scored.filterHz,
      noise: scored.noise,
      accent: scored.accent,
      wave: scored.wave,
      harmony: null,
      harmonyGain: 0,
    });
  });
  return events;
}

export function eventsFromPower(
  place: string,
  series: PowerSeries,
  settings: SonicSettings,
): SonicEvent[] {
  const dates = series.dates;
  const leadName = settings.lead;
  const lead = channel(series, leadName);
  const temperature = channel(series, "T2M");
  const rain = robustNormalize(channel(series, "PRECTOTCORR"));
  const wind = robustNormalize(channel(series, "WS10M"));
  const solar = robustNormalize(channel(series, "ALLSKY_SFC_SW_DWN"));
  const humidity = robustNormalize(channel(series, "RH2M"));
  const scaled = robustNormalize(lead);
  // Rain is scored on ln(1 + P), as in the soundscape: on raw values most days are dry, the MAD is tiny and every shower would ring.
  const anomalies = robustAnomalies(leadName === "PRECTOTCORR" ? lead.map((value) => (value === null ? null : Math.log1p(Math.max(0, value)))) : lead, settings.anomalyZ);
  const unit = series.units[leadName] || PARAMETERS[leadName].unit;
  const leadLabel = PARAMETERS[leadName].label;
  const events: SonicEvent[] = [];

  dates.forEach((date, index) => {
    const scored = scoreSample({
      norm: scaled.values[index] ?? null,
      z: anomalies[index]?.z ?? null,
      ...settings,
    });
    if (!scored || lead[index] === null || lead[index] === undefined) return;
    const rainNorm = leadName === "PRECTOTCORR" ? 0 : (rain.values[index] ?? 0);
    const windNorm = wind.values[index] ?? 0.4;
    const solarNorm = solar.values[index] ?? 0.5;
    const humidityNorm = leadName === "RH2M" ? null : humidity.values[index];
    const rawLead = lead[index] as number;
    const rawTemp = temperature[index];
    const flag = scored.accent
      ? ` Flagged anomaly, ${Math.abs(anomalies[index].z ?? 0).toFixed(1)} robust standard deviations from the median of this window${leadName === "PRECTOTCORR" ? " (scored on ln(1 + rain))" : ""}.`
      : " Within the usual range of this window.";
    const rainBit =
      leadName !== "PRECTOTCORR" && series.parameters.PRECTOTCORR?.[index]?.value != null
        ? ` Rain ${series.parameters.PRECTOTCORR[index].value} ${series.units.PRECTOTCORR || "mm/day"}.`
        : "";
    const tempBit =
      leadName !== "T2M" && rawTemp != null ? ` Air temperature that day ${rawTemp.toFixed(1)} ${!series.units.T2M || series.units.T2M === "C" ? "°C" : series.units.T2M}.` : "";
    events.push({
      sourceIndex: index,
      label: formatDay(date),
      caption: `${place}, ${formatDay(date)}. ${leadLabel} ${rawLead.toFixed(1)} ${unit}, heard as ${midiName(scored.midi)}.${rainBit}${tempBit}${flag}`,
      frequency: scored.frequency,
      gain: Math.min(0.85, scored.gain * (0.75 + 0.5 * solarNorm)),
      filterHz: 380 + windNorm * 3400,
      noise: Math.min(0.7, scored.noise + rainNorm * 0.45),
      accent: scored.accent,
      wave: scored.wave,
      harmony: humidityNorm === null ? null : scored.frequency * 1.5,
      harmonyGain: humidityNorm === null ? 0 : 0.04 + humidityNorm * 0.08,
    });
  });
  return events;
}

export type ChangeDay = {
  key: string;
  label: string;
  earlier: number | null;
  later: number | null;
  delta: number | null;
  flagged: boolean;
};

/**
 * Day-matched temperature change. Delta is later minus earlier, from the raw
 * values. Days are matched by month, day and year-within-window (see
 * geo/comparison.ts#calendarKey), so multi-year windows never collapse.
 */
export function compareTemperatures(earlier: PowerSeries, later: PowerSeries): {
  days: ChangeDay[];
  medianDelta: number | null;
} {
  const early = keyedPoints(earlier.parameters.T2M ?? []);
  const late = keyedPoints(later.parameters.T2M ?? []);
  const keys = [...early.keys()].filter((key) => late.has(key)).sort();
  const days: ChangeDay[] = keys.map((key) => {
    const before = early.get(key)?.value ?? null;
    const after = late.get(key)?.value ?? null;
    const date = late.get(key)?.date ?? "00000000";
    return {
      key,
      label: formatDay(date),
      earlier: before,
      later: after,
      delta: before === null || after === null ? null : after - before,
      flagged: false,
    };
  });
  const finite = days.map((day) => day.delta).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const medianDelta =
    finite.length === 0
      ? null
      : finite.length % 2 === 1
        ? finite[(finite.length - 1) / 2]
        : (finite[finite.length / 2 - 1] + finite[finite.length / 2]) / 2;
  return { days, medianDelta };
}

/**
 * Day-matched temperature change between two POWER windows. Pitch is absolute:
 * zero change is always the reference tonic (changeReferenceMidi), a warmer day
 * sits above it and a cooler day the same number of scale steps below, with
 * ±CHANGE_FULL_SCALE_C °C at the ends. The outlier flag is still the robust z
 * among the compared changes. SYNTHETIC series are for tests only.
 */
export function eventsFromChange(
  place: string,
  earlier: PowerSeries,
  later: PowerSeries,
  settings: SonicSettings,
): { events: SonicEvent[]; days: ChangeDay[]; medianDelta: number | null } {
  const compared = compareTemperatures(earlier, later);
  const deltas = compared.days.map((day) => day.delta);
  const anomalies = robustAnomalies(deltas, settings.anomalyZ);
  const days = compared.days.map((day, index) => ({ ...day, flagged: anomalies[index]?.flagged ?? false }));
  const reference = midiName(changeReferenceMidi(settings.rootMidi, settings.octaves));
  const events: SonicEvent[] = [];
  days.forEach((day, index) => {
    if (day.delta === null || day.earlier === null || day.later === null) return;
    // Loudness and brightness follow the size of the change, the same for warmer and cooler.
    const norm = 0.5 + Math.min(1, Math.abs(day.delta) / CHANGE_FULL_SCALE_C) / 2;
    const base = scoreSample({ norm, z: anomalies[index]?.z ?? null, ...settings });
    if (!base) return;
    const midi = changeToMidi(day.delta, settings.scale, settings.rootMidi, settings.octaves);
    const scored = { ...base, midi, frequency: midiToFrequency(midi) };
    const direction = day.delta > 0.05 ? "warmer" : day.delta < -0.05 ? "cooler" : "about the same";
    events.push({
      sourceIndex: index,
      label: day.label,
      caption: `${place}, ${day.label}. ${day.later.toFixed(1)}°C versus ${day.earlier.toFixed(1)}°C on this calendar day in the earlier window, ${Math.abs(day.delta).toFixed(1)}°C ${direction}. Heard as ${midiName(scored.midi)} (no change is ${reference}).${scored.accent ? " This change is an outlier among the days compared." : ""}`,
      frequency: scored.frequency,
      gain: scored.gain,
      filterHz: scored.filterHz,
      noise: scored.noise,
      accent: scored.accent,
      wave: scored.wave,
      harmony: null,
      harmonyGain: 0,
    });
  });
  return { events, days, medianDelta: compared.medianDelta };
}
