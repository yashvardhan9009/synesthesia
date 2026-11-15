import type { SonicEvent } from "../types.ts";

export type ScanPoint = {
  /** Source step (slice or frame) being sounded. */
  source: number;
  /** 0–1 across the picture where the scan line sits. */
  x: number;
  /** The slice being read, as 0–1 edges. */
  band: { from: number; to: number };
};

/**
 * Where the scan line belongs for a fractional run position. While a note
 * sounds, the line sweeps across exactly the slice that note was measured
 * from; with `still`, it rests in the middle of that slice.
 */
export function scanPoint(position: number, events: readonly SonicEvent[], samples: number, still: boolean): ScanPoint | null {
  if (events.length === 0 || samples <= 0 || !Number.isFinite(position)) return null;
  const step = Math.min(events.length - 1, Math.max(0, Math.floor(position)));
  const within = Math.min(1, Math.max(0, position - step));
  const source = events[step].sourceIndex;
  const from = source / samples;
  const to = (source + 1) / samples;
  return { source, x: still ? (from + to) / 2 : from + (to - from) * within, band: { from, to } };
}
