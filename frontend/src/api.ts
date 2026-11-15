import type { PowerPoint, PowerSeries } from "./types.ts";

/**
 * GET a JSON body from the backend. Every failure becomes an Error whose
 * message is safe to show: the backend's own `detail`, or what went wrong on
 * the way. shell/problem.ts turns that message into an explained problem.
 */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      error instanceof Error
        ? `The data service did not answer (${error.message}). Check that the data service is running.`
        : "The data service did not answer.",
    );
  }
  const text = await response.text();
  let body: { detail?: unknown } | null = null;
  try {
    body = text ? (JSON.parse(text) as { detail?: unknown }) : null;
  } catch {
    body = { detail: text.slice(0, 300) };
  }
  if (!response.ok) {
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

/** Every POWER daily parameter the app plays or charts. One request serves the lead melody and the soundscape. */
export const ALL_POWER_PARAMETERS = "T2M,PRECTOTCORR,WS10M,WS2M,ALLSKY_SFC_SW_DWN,RH2M,PS,CLOUD_AMT";

export type PowerRequest = {
  lat: number;
  lon: number;
  /** YYYY-MM-DD or YYYYMMDD. */
  start: string;
  end: string;
  /** Comma-separated POWER names. Defaults to every parameter the app uses. */
  parameters?: string;
};

/** The backend URL for one NASA POWER daily point request. Coordinates are rounded to 4 decimals so caches hit. */
export function powerPath(request: PowerRequest): string {
  const query = new URLSearchParams({
    lat: request.lat.toFixed(4),
    lon: request.lon.toFixed(4),
    start: request.start.replace(/-/g, ""),
    end: request.end.replace(/-/g, ""),
    parameters: request.parameters ?? ALL_POWER_PARAMETERS,
  });
  return `/api/power?${query.toString()}`;
}

export function fetchPower(request: PowerRequest, signal?: AbortSignal): Promise<PowerSeries> {
  return getJson<PowerSeries>(powerPath(request), signal);
}

export type GeocodeResult = { name: string; latitude: number; longitude: number };

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const body = await getJson<{ results: GeocodeResult[] }>(`/api/geocode?${new URLSearchParams({ q: query.trim() })}`, signal);
  return body.results;
}

/** Same-calendar-day statistics from POWER daily 2001–2020 (backend app/history.py). */
export type BaselineStats = {
  n: number;
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
  /** Rain only: mean and sd of ln(1 + P), and the fraction of days with at least 1 mm. */
  log_mean?: number;
  log_sd?: number;
  wet?: number;
};

export type PowerBaseline = {
  latitude: number;
  longitude: number;
  period: [number, number];
  half_window: number;
  request_url: string;
  source: string;
  units: Record<string, string>;
  longnames: Record<string, string>;
  messages: string[];
  /** parameter → MMDD → statistics. A calendar day with no observations is absent. */
  days: Record<string, Record<string, BaselineStats>>;
};

export function baselinePath(lat: number, lon: number, parameters?: string): string {
  const query = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  if (parameters) query.set("parameters", parameters);
  return `/api/power/baseline?${query.toString()}`;
}

export function fetchBaseline(lat: number, lon: number, signal?: AbortSignal, parameters?: string): Promise<PowerBaseline> {
  return getJson<PowerBaseline>(baselinePath(lat, lon, parameters), signal);
}

/** Monthly means (YYYYMM) and annual values (YYYY) from the POWER monthly point API. */
export type PowerMonthly = {
  latitude: number;
  longitude: number;
  start: number;
  end: number;
  request_url: string;
  source: string;
  units: Record<string, string>;
  longnames: Record<string, string>;
  messages: string[];
  monthly: Record<string, PowerPoint[]>;
  annual: Record<string, PowerPoint[]>;
  months: string[];
  years: string[];
};

export function monthlyPath(lat: number, lon: number, start: number, end: number, parameters: string): string {
  const query = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), start: String(start), end: String(end), parameters });
  return `/api/power/monthly?${query.toString()}`;
}

export function fetchMonthly(lat: number, lon: number, start: number, end: number, parameters: string, signal?: AbortSignal): Promise<PowerMonthly> {
  return getJson<PowerMonthly>(monthlyPath(lat, lon, start, end, parameters), signal);
}
