import { useMemo } from "react";
import { fetchBaseline } from "../api.ts";
import { Problem, Wait } from "../components/Guide.tsx";
import { formatDay } from "../audio/build.ts";
import type { PowerSeries } from "../types.ts";
import { useRemote } from "../useRemote.ts";
import { dailyDepartures, explainDay, mostUnusual, UNUSUAL_Z } from "./anomaly.ts";
import { AnomalyNotes, type AnomalyNote } from "./AnomalyNotes.tsx";

/**
 * Anomaly explanations for a daily POWER window: every day against the same
 * calendar days (±7) of NASA POWER 2001–2020 at the same point.
 */
export function DailyAnomalies({ series, place, limit = 6, heading }: { series: PowerSeries; place: string; limit?: number; heading?: string }) {
  const key = `${series.latitude.toFixed(4)},${series.longitude.toFixed(4)}`;
  const baseline = useRemote(key, (signal) => fetchBaseline(series.latitude, series.longitude, signal));
  const notes = useMemo<AnomalyNote[]>(() => {
    if (!baseline.data) return [];
    const base = baseline.data;
    return mostUnusual(dailyDepartures(series, base), limit).map((item) => ({
      id: `${item.parameter}-${item.date}`,
      when: formatDay(item.date),
      text: explainDay(item, base),
      departure: item,
    }));
  }, [baseline.data, series, limit]);
  const title = heading ?? `What was unusual at ${place}, against normal`;
  if (baseline.loading) return <Wait active label="Asking NASA POWER for the 2001–2020 baseline at this point." slow="Still loading twenty years of NASA POWER days for the baseline. The first request at a point takes a few seconds; later ones are cached." />;
  if (baseline.error) return <Problem message={baseline.error} source="NASA POWER" onRetry={baseline.retry} />;
  if (!baseline.data) return null;
  return (
    <AnomalyNotes
      heading={title}
      notes={notes}
      basis={`Each day is compared with the same calendar days (±${baseline.data.half_window}) of NASA POWER ${baseline.data.period[0]}–${baseline.data.period[1]} at this point; unusual means at least ${UNUSUAL_Z} standard deviations from that normal (rain on ln(1 + P)). ${baseline.data.source}.`}
      empty={`No day in ${formatDay(series.start)} – ${formatDay(series.end)} is ${UNUSUAL_Z} or more standard deviations from normal for its calendar days.`}
    />
  );
}
