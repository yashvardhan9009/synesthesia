import type { PowerPoint, PowerSeries } from "../types.ts";

export type AlignedMeasurement = { day: string; label: string; earlier: number | null; later: number | null };

/**
 * Calendar key for matching two windows: the month and day plus how many
 * years after the window's first year the day falls. A two-year window
 * therefore keeps 1 Jan of its first year and 1 Jan of its second year apart
 * (instead of collapsing them onto one "0101"), and a window that crosses New
 * Year sorts December before January. Keys sort in calendar order.
 */
export function calendarKey(date: string, firstYear: number): string {
  const offset = Number(date.slice(0, 4)) - firstYear;
  return `${String(offset).padStart(2, "0")}${date.slice(4, 8)}`;
}

/** Points of one parameter, keyed by calendarKey against the series' own first year. */
export function keyedPoints(points: readonly PowerPoint[]): Map<string, PowerPoint> {
  const firstYear = points.length ? Number(points[0].date.slice(0, 4)) : 0;
  return new Map(points.map((point) => [calendarKey(point.date, firstYear), point]));
}

/**
 * Pair the same calendar days of two windows (see calendarKey). Days without a
 * partner (for example 29 February against a common year) are left out; a
 * missing value stays null.
 */
export function alignMeasurement(earlier: PowerSeries, later: PowerSeries, parameter: string): AlignedMeasurement[] {
  const before = keyedPoints(earlier.parameters[parameter] ?? []);
  const after = keyedPoints(later.parameters[parameter] ?? []);
  return [...before.keys()].filter((key) => after.has(key)).sort().map((key) => {
    const date = after.get(key)?.date ?? "00000000";
    return {
      day: key,
      label: `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`,
      earlier: before.get(key)?.value ?? null,
      later: after.get(key)?.value ?? null,
    };
  });
}

export function measurementRange(points: PowerPoint[]): [number, number] {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? [min - 1, max + 1] : [min, max];
}
