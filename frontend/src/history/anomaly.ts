import type { BaselineStats, PowerBaseline } from "../api.ts";
import { formatDay } from "../audio/build.ts";
import { finiteValues, percentile } from "../science/normalize.ts";
import type { PowerSeries } from "../types.ts";

/**
 * Anomalies against normal: a value compared with the same time of year in a
 * fixed multi-year baseline (NASA POWER 2001–2020), not with the window it sits
 * in. Everything here is arithmetic on POWER values. The general-background
 * notes at the end are textbook context and are always labelled as such.
 */

export const EXPLAIN_PARAMETERS = ["T2M", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "PS"] as const;
export type ExplainParameter = (typeof EXPLAIN_PARAMETERS)[number];

/** |z| from here on is "unusual" (about 1 day in 20 for a normal spread) and from VERY_UNUSUAL_Z "very unusual". */
export const UNUSUAL_Z = 2;
export const VERY_UNUSUAL_Z = 3;
export const WET_DAY_MM = 1;

type Words = { name: string; unit: string; digits: number; above: string; below: string };

export const EXPLAIN_WORDS: Record<ExplainParameter, Words> = {
  T2M: { name: "Air temperature", unit: "°C", digits: 1, above: "warmer", below: "cooler" },
  PRECTOTCORR: { name: "Rain", unit: "mm/day", digits: 1, above: "wetter", below: "drier" },
  RH2M: { name: "Relative humidity", unit: "%", digits: 0, above: "more humid", below: "drier" },
  WS2M: { name: "Wind at 2 m", unit: "m/s", digits: 1, above: "windier", below: "calmer" },
  ALLSKY_SFC_SW_DWN: { name: "Sunlight at the surface", unit: "MJ/m²/day", digits: 1, above: "sunnier", below: "dimmer" },
  PS: { name: "Surface pressure", unit: "kPa", digits: 2, above: "higher", below: "lower" },
};

export type Level = "normal" | "unusual" | "very unusual";

export type Departure = {
  parameter: ExplainParameter;
  value: number;
  normal: BaselineStats;
  /** value − baseline mean, in the parameter's unit. */
  diff: number;
  /** Standard score against the baseline (rain on ln(1 + P)). Null when the baseline has no spread. */
  z: number | null;
  level: Level;
  direction: "above" | "below";
};

export function levelOf(z: number | null): Level {
  if (z === null) return "normal";
  const size = Math.abs(z);
  return size >= VERY_UNUSUAL_Z ? "very unusual" : size >= UNUSUAL_Z ? "unusual" : "normal";
}

/** Compare one value with its baseline statistics. Missing values give null, never a guess. */
export function departure(parameter: ExplainParameter, value: number | null | undefined, normal: BaselineStats | undefined): Departure | null {
  if (value === null || value === undefined || !Number.isFinite(value) || !normal || normal.n < 2) return null;
  const diff = value - normal.mean;
  let z: number | null = null;
  if (parameter === "PRECTOTCORR" && normal.log_mean !== undefined && normal.log_sd !== undefined) {
    z = normal.log_sd > 1e-9 ? (Math.log1p(Math.max(0, value)) - normal.log_mean) / normal.log_sd : null;
  } else {
    z = normal.sd > 1e-9 ? diff / normal.sd : null;
  }
  return { parameter, value, normal, diff, z, level: levelOf(z), direction: (z ?? diff) >= 0 ? "above" : "below" };
}

export type DayDeparture = Departure & { date: string };

/** Every day and parameter of a POWER daily series against the same calendar days of the baseline. */
export function dailyDepartures(
  series: PowerSeries,
  baseline: PowerBaseline,
  parameters: readonly ExplainParameter[] = EXPLAIN_PARAMETERS,
): DayDeparture[] {
  const out: DayDeparture[] = [];
  for (const parameter of parameters) {
    const normals = baseline.days[parameter];
    if (!normals) continue;
    for (const point of series.parameters[parameter] ?? []) {
      const found = departure(parameter, point.value, normals[point.date.slice(4, 8)]);
      if (found) out.push({ ...found, date: point.date });
    }
  }
  return out;
}

/** The unusual ones, largest |z| first. */
export function mostUnusual<T extends Departure>(departures: readonly T[], limit = 6): T[] {
  return departures
    .filter((item) => item.level !== "normal")
    .sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))
    .slice(0, limit);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 Jun – 22 Jun in 2001–2020": the days that make up the normal for one calendar day. */
export function baselineWindowLabel(mmdd: string, halfWindow: number, period: readonly [number, number]): string {
  const center = Date.UTC(2000, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(2, 4)));
  const day = (offset: number) => {
    const date = new Date(center + offset * 86_400_000);
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  };
  return `${day(-halfWindow)} – ${day(halfWindow)} in ${period[0]}–${period[1]}`;
}

const fmt = (value: number, digits: number) => value.toFixed(digits);

function levelWords(departure: Departure): string {
  if (departure.z === null) return "the baseline has no spread, so no score is given";
  const size = Math.abs(departure.z).toFixed(1);
  const side = departure.direction === "above" ? "above" : "below";
  if (departure.level === "very unusual") return `${size} standard deviations ${side} normal: very unusual against this normal`;
  if (departure.level === "unusual") return `${size} standard deviations ${side} normal: unusual against this normal`;
  return `${size} standard deviations ${side} normal: within the usual spread`;
}

/**
 * One departure in plain words: the value, the normal, by how much, and how
 * unusual. `when` reads like "on 14 Jun 2026"; `basis` like "8 Jun – 22 Jun in 2001–2020".
 */
export function explainDeparture(departure: Departure, when: string, basis: string): string {
  const words = EXPLAIN_WORDS[departure.parameter];
  const { normal } = departure;
  if (departure.parameter === "PRECTOTCORR") {
    const wet = normal.wet === undefined ? "" : ` ${Math.round(normal.wet * 100)}% of those days had at least ${WET_DAY_MM} mm.`;
    const rank =
      departure.value > normal.p90
        ? " That is more than 9 in 10 of them."
        : departure.value < normal.p10
          ? " That is less than 9 in 10 of them."
          : "";
    return `Rain ${fmt(departure.value, 1)} mm/day ${when}. Across ${basis}, the median was ${fmt(normal.p50, 1)} mm/day and the average ${fmt(normal.mean, 1)} mm/day.${wet}${rank} Scored on ln(1 + rain), it is ${levelWords(departure)}.`;
  }
  const size = Math.abs(departure.diff);
  const comparative = departure.diff >= 0 ? words.above : words.below;
  const lead =
    size < 10 ** -words.digits
      ? `${words.name} ${fmt(departure.value, words.digits)} ${words.unit} ${when} was right at normal`
      : `${words.name} ${fmt(departure.value, words.digits)} ${words.unit} ${when} was ${fmt(size, words.digits)} ${words.unit} ${comparative} than normal`;
  return `${lead} (average across ${basis}: ${fmt(normal.mean, words.digits)} ${words.unit}; 8 in 10 of those values fell between ${fmt(normal.p10, words.digits)} and ${fmt(normal.p90, words.digits)}). That is ${levelWords(departure)}.`;
}

/** Explain a day of a daily series against its baseline (convenience for the views). */
export function explainDay(departure: DayDeparture, baseline: Pick<PowerBaseline, "half_window" | "period">): string {
  return explainDeparture(departure, `on ${formatDay(departure.date)}`, baselineWindowLabel(departure.date.slice(4, 8), baseline.half_window, baseline.period));
}

/** Label every general-background note carries. */
export const BACKGROUND_LABEL = "General background, not computed from this data and not a cause of this event";

/**
 * What typically drives departures like these, as found in introductory
 * meteorology. These are not attributions: the app has not looked for, and does
 * not claim, a cause for any particular day.
 */
export const BACKGROUND: Record<ExplainParameter, { above: string; below: string }> = {
  T2M: {
    above:
      "Unusually warm spells often come with a persistent high-pressure system (clear skies, sinking air), warm air carried in from elsewhere, or dry soil that heats quickly. Over decades, a warming climate also shifts the whole distribution upward.",
    below:
      "Unusually cool spells often come with cold air flowing in from higher latitudes, persistent cloud and rain, or clear, calm nights that let heat radiate away. Snow cover keeps the air above it colder.",
  },
  PRECTOTCORR: {
    above:
      "Unusually wet days typically come with organised storms: frontal systems, monsoon surges, tropical cyclones, or moist air forced up over mountains. Large-scale patterns such as El Niño–Southern Oscillation shift where such rain falls in some regions.",
    below:
      "Unusually dry spells typically come with persistent high pressure that blocks storms, a late or weak rainy season, or large-scale patterns such as El Niño–Southern Oscillation moving rain elsewhere.",
  },
  RH2M: {
    above: "High relative humidity usually goes with moist air brought in by the wind, rain or fog, and cooler air (cooler air holds less water vapour, so the same moisture is a higher percentage).",
    below: "Low relative humidity usually goes with dry continental or descending air, and hot afternoons (warmer air can hold more vapour, so the percentage drops).",
  },
  WS2M: {
    above: "Strong near-surface winds typically come with tight pressure gradients: passing storms and fronts, monsoon or trade-wind surges, or air channelled by terrain.",
    below: "Calm conditions typically come with stagnant high pressure and stable air near the ground, often overnight or in sheltered valleys.",
  },
  ALLSKY_SFC_SW_DWN: {
    above: "More sunlight than usual at the surface typically means fewer or thinner clouds and cleaner air than is normal for the season.",
    below: "Less sunlight than usual typically means more cloud, rain, haze, dust or smoke between the Sun and the ground.",
  },
  PS: {
    above: "Higher surface pressure than usual typically marks a high-pressure system: settled, often clear weather with sinking air.",
    below: "Lower surface pressure than usual typically marks a passing low-pressure system or storm, with rising air, cloud and wind.",
  },
};

export function backgroundFor(departure: Pick<Departure, "parameter" | "direction">): string {
  return BACKGROUND[departure.parameter][departure.direction];
}

/** Baseline statistics from a list of values, as the backend computes them (used for monthly normals). */
export function statsOf(values: readonly (number | null)[], rain = false, wetFraction = false): BaselineStats | undefined {
  const finite = finiteValues(values);
  const n = finite.length;
  if (n === 0) return undefined;
  const mean = finite.reduce((sum, value) => sum + value, 0) / n;
  const sd = n > 1 ? Math.sqrt(finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0;
  const stats: BaselineStats = {
    n,
    mean,
    sd,
    p10: percentile(finite, 10) ?? mean,
    p50: percentile(finite, 50) ?? mean,
    p90: percentile(finite, 90) ?? mean,
  };
  if (rain) {
    const logs = finite.map((value) => Math.log1p(Math.max(0, value)));
    const logStats = statsOf(logs);
    stats.log_mean = logStats?.mean;
    stats.log_sd = logStats?.sd;
    if (wetFraction) stats.wet = finite.filter((value) => value >= WET_DAY_MM).length / n;
  }
  return stats;
}
