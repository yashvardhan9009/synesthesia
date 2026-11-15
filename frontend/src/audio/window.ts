/** Calendar windows for POWER requests. Months are "YYYY-MM". */

export function monthWindow(month: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]);
  if (index < 1 || index > 12 || year < 1981) return null;
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { start: `${match[1]}${match[2]}01`, end: `${match[1]}${match[2]}${String(last).padStart(2, "0")}` };
}

export function monthsBack(today: Date, months: number): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** POWER MERRA-2 daily data trails real time by a few weeks; two full months back is safe. */
export function latestCompleteMonth(today: Date): string {
  return monthsBack(today, 2);
}

/**
 * CERES cloud amount (CLOUD_AMT) is published months later than the MERRA-2
 * variables. Five months back usually has all six, so the first sound has every layer.
 */
export function defaultSoundscapeMonth(today: Date): string {
  return monthsBack(today, 5);
}
