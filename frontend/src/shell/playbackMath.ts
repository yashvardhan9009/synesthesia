/** Playback speeds offered in the dock. 1 is the tempo the section asked for. */
export const RATES = [0.5, 0.75, 1, 1.5, 2] as const;

/** 0–1 progress for a step index, counting the sounding step as reached. */
export function progressOf(index: number | null, total: number): number {
  if (index === null || total <= 0) return 0;
  return Math.min(1, Math.max(0, (index + 1) / total));
}

export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(0) : String(rate)}×`;
}

/** m:ss for a number of steps of a given length. */
export function formatDuration(steps: number, stepSeconds: number): string {
  const total = Math.max(0, Math.round(steps * stepSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
