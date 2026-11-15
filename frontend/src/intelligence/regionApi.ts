import { getJson } from "../api.ts";
import type { RegionBox } from "./regions.ts";

/** The four NASA POWER monthly parameters a region is analysed on (backend app/region.py). */
export const REGION_PARAMETERS = ["T2M", "PRECTOTCORR", "WS2M", "RH2M"] as const;
export type RegionParameter = (typeof REGION_PARAMETERS)[number];

export type GridPoint = {
  row: number;
  column: number;
  lat: number;
  lon: number;
  /** cos(latitude): its share of the area mean. */
  weight: number;
};

export type PlannedPoint = GridPoint & { cached: boolean; request_url: string };

export type RegionPlan = { start: number; end: number; parameters: string[]; points: PlannedPoint[] };

export type SampledPoint = GridPoint & {
  request_url: string;
  /** Values aligned with RegionData.months; null where NASA POWER has none. */
  series: Record<RegionParameter, (number | null)[]>;
};

export type FailedPoint = GridPoint & { error: string; request_url: string | null };

/** GET /api/region: every grid point's monthly record and their cos-latitude weighted area mean. */
export type RegionData = {
  box: { south: number; west: number; north: number; east: number };
  start: number;
  end: number;
  parameters: RegionParameter[];
  units: Record<string, string>;
  /** YYYYMM, in order. */
  months: string[];
  points: SampledPoint[];
  failed: FailedPoint[];
  requested: number;
  mean: Record<RegionParameter, (number | null)[]>;
  /** How many points had a value, per month. */
  coverage: Record<RegionParameter, number[]>;
  weighting: string;
  request_urls: string[];
  source: string;
};

function boxQuery(box: Pick<RegionBox, "south" | "west" | "north" | "east">): URLSearchParams {
  return new URLSearchParams({ south: String(box.south), west: String(box.west), north: String(box.north), east: String(box.east) });
}

export function regionPath(box: Pick<RegionBox, "south" | "west" | "north" | "east">): string {
  return `/api/region?${boxQuery(box).toString()}`;
}

export function regionGridPath(box: Pick<RegionBox, "south" | "west" | "north" | "east">): string {
  return `/api/region/grid?${boxQuery(box).toString()}`;
}

/** The backend path that fetches (and caches) one grid point, the same request /api/region makes. */
export function pointPath(point: GridPoint, start: number, end: number): string {
  const query = new URLSearchParams({ lat: point.lat.toFixed(4), lon: point.lon.toFixed(4), start: String(start), end: String(end), parameters: REGION_PARAMETERS.join(",") });
  return `/api/power/monthly?${query.toString()}`;
}

export type RegionProgress = { done: number; total: number; cached: number; failed: number };

/**
 * Load a region with honest progress: ask for the sampling plan, fetch the
 * uncached grid points (four at a time) so each one can be counted as it
 * lands, then assemble the region, which now reads from the backend cache.
 */
export async function loadRegion(
  box: Pick<RegionBox, "south" | "west" | "north" | "east">,
  onProgress: (progress: RegionProgress) => void,
  signal?: AbortSignal,
): Promise<RegionData> {
  const plan = await getJson<RegionPlan>(regionGridPath(box), signal);
  const pending = plan.points.filter((point) => !point.cached);
  const progress: RegionProgress = { done: plan.points.length - pending.length, total: plan.points.length, cached: plan.points.length - pending.length, failed: 0 };
  onProgress({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const point = pending[next];
      next += 1;
      try {
        await getJson<unknown>(pointPath(point, plan.start, plan.end), signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        progress.failed += 1; // /api/region tries it once more and reports it
      }
      progress.done += 1;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  return getJson<RegionData>(regionPath(box), signal);
}
