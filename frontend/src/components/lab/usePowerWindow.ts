import { fetchPower } from "../../api.ts";
import { SOUNDSCAPE_PARAMETERS } from "../../audio/mappings.ts";
import { monthWindow } from "../../audio/window.ts";
import type { PowerSeries } from "../../types.ts";
import { useRemote, type Remote } from "../../useRemote.ts";

export type PowerMonth = { lat: number; lon: number; month: string };

/** The six soundscape variables for one month at one point. */
export function usePowerWindow(request: PowerMonth | null): Remote<PowerSeries> {
  const window = request ? monthWindow(request.month) : null;
  const key = request && window ? `${request.lat}|${request.lon}|${request.month}` : null;
  const remote = useRemote(key, (signal) =>
    fetchPower({ lat: request!.lat, lon: request!.lon, start: window!.start, end: window!.end, parameters: SOUNDSCAPE_PARAMETERS }, signal),
  );
  if (request && !window) return { ...remote, error: "Choose a month from January 1981 onward." };
  return remote;
}
