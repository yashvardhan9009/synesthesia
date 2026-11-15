import { useMemo, useState } from "react";
import { Pause, Play, Radar } from "lucide-react";
import { fetchPower } from "../api.ts";
import { formatDay } from "../audio/build.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { MAPPINGS, SOUNDSCAPE_PARAMETERS } from "../audio/mappings.ts";
import { anomalyBasis } from "../audio/soundscape.ts";
import type { TraceRecord } from "../audio/trace.ts";
import { Problem, Wait } from "../components/Guide.tsx";
import type { Place, PowerSeries } from "../types.ts";
import { median } from "../science/anomaly.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { useRemote } from "../useRemote.ts";
import { anomalyTimeline, departureWord, globalGrid, scanAnomalies } from "./anomalyScan.ts";

type Props = {
  /** YYYYMMDD, the window Cosmic Earth has loaded. */
  start: string;
  end: string;
  threshold: number;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
  onOpen: (place: Place) => void;
};

const SOURCE = "cosmic";
const TITLE = "Global anomaly timeline";
const SHOWN = 12;
const GRID = globalGrid();
const BATCH_SIZE = 6;

type Scan = { entries: { place: Place; series: PowerSeries }[]; failed: string[] };

async function scanStations(start: string, end: string, signal: AbortSignal): Promise<Scan> {
  const entries: Scan["entries"] = [];
  const failed: string[] = [];
  for (let offset = 0; offset < GRID.length; offset += BATCH_SIZE) {
    if (signal.aborted) throw new DOMException("The scan was cancelled.", "AbortError");
    const batch = GRID.slice(offset, offset + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((place) => fetchPower({ lat: place.lat, lon: place.lon, start, end, parameters: SOUNDSCAPE_PARAMETERS }, signal)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") entries.push({ place: batch[index], series: result.value });
      else if (!signal.aborted) failed.push(batch[index].name);
    });
  }
  if (entries.length === 0) throw new Error("NASA POWER did not return any station for this window.");
  return { entries, failed };
}

/**
 * Global Anomaly Explorer: a global grid over the loaded window, every day
 * where a soundscape variable leaves its own station's normal range, ranked by
 * robust z. The findings can be heard in date order as anomaly bells.
 */
export function AnomalyExplorer({ start, end, threshold, engine, onCaption, onOpen }: Props) {
  const [requested, setRequested] = useState(false);
  const remote = useRemote(requested ? `${start}|${end}` : null, (signal) => scanStations(start, end, signal));
  const findings = useMemo(() => (remote.data ? scanAnomalies(remote.data.entries, threshold) : []), [remote.data, threshold]);
  const state = useEngineState(engine);
  const playing = state.playing && state.source === SOURCE && state.title === TITLE;

  const play = () => {
    if (playing) {
      engine.pause();
      return;
    }
    const events = anomalyTimeline(findings);
    if (events.length === 0) return;
    void engine
      .play(events, {
        source: SOURCE, bpm: 72, title: TITLE, threshold,
        trace: (index): TraceRecord | null => {
          const ordered = [...findings].sort((a, b) => a.date.localeCompare(b.date) || Math.abs(b.z) - Math.abs(a.z));
          const finding = ordered[index];
          if (!finding) return null;
          const variable = MAPPINGS[finding.variable];
          const entry = remote.data?.entries.find((item) => item.place.name === finding.place);
          const rawValues = (entry?.series.parameters[finding.variable] ?? []).map((point) => point.value);
          const basis = anomalyBasis(finding.variable, rawValues);
          const usable = basis.filter((value): value is number => value !== null && Number.isFinite(value));
          const center = median(usable);
          const mad = center === null ? null : median(usable.map((value) => Math.abs(value - center)));
          const scoredValue = basis[finding.dayIndex];
          const rainBasis = finding.variable === "PRECTOTCORR";
          const raw = finding.value.toFixed(1);
          const statistic = `${rainBasis ? `ln(1 + ${raw} mm/day)` : `${raw} ${finding.unit}`} = ${scoredValue?.toFixed(3) ?? "missing"}; median ${center?.toFixed(3) ?? "missing"}; MAD ${mad?.toFixed(3) ?? "missing"}`;
          return {
            source: "NASA POWER daily point", sourceUrl: finding.requestUrl,
            where: `${finding.date} · ${finding.place} (${finding.latitude.toFixed(2)}°, ${finding.longitude.toFixed(2)}°)`,
            measured: [{ name: variable.name, value: raw, unit: finding.unit, heard: `${statistic} → robust z ${finding.z.toFixed(2)} → fixed ${variable.name} bell at ${events[index].frequency.toFixed(1)} Hz` }],
            normalized: null, window: null, z: finding.z, threshold, outlier: true,
            frequency: events[index].frequency,
            generated: [`Scoring basis: ${rainBasis ? "ln(1 + precipitation in mm/day)" : variable.name}; robust z uses date-window median and MAD.`, `Bell pitch is fixed at ${events[index].frequency.toFixed(1)} Hz for this POWER variable.`],
          };
        },
        onIndex: (index) => onCaption(events[index].caption),
      })
      .catch((caught: Error) => onCaption(caught.message));
  };

  return (
    <section className="chart-figure anomaly-explorer" aria-label="Global Anomaly Explorer">
      <div className="section-label">
        <span className="label">Global Anomaly Explorer</span>
        <span className="mono tiny">
          {GRID.length} global grid points · {formatDay(start)} to {formatDay(end)} · |z| ≥ {threshold}
        </span>
      </div>
      {!requested ? (
        <button className="btn btn-ghost btn-small" onClick={() => setRequested(true)}>
          <Radar size={14} aria-hidden="true" /> Scan the globe for unusual days
        </button>
      ) : (
        <>
          <Wait active={remote.loading} label={`Asking NASA POWER for up to ${GRID.length} global grid points.`} slow="The scan is sent in small batches; successful NASA POWER answers are cached for later scans." />
          {remote.error && <Problem message={remote.error} source="NASA POWER" onRetry={remote.retry} />}
          {remote.data && (
            <>
              {remote.data.failed.length > 0 && <p className="warn">Not scanned, NASA POWER did not answer: {remote.data.failed.join(", ")}.</p>}
              <div className="global-scan-map" role="group" aria-label="Global scan map. Select a sampled point to open its location.">
                <svg viewBox="0 0 720 240" role="img" aria-labelledby="global-map-title global-map-desc">
                  <title id="global-map-title">NASA POWER global anomaly sampling map</title>
                  <desc id="global-map-desc">Equirectangular map of sampled points. Amber circles mark points with detected anomalies.</desc>
                  <rect x="0" y="0" width="720" height="240" rx="8" />
                  {[0, 1, 2, 3, 4, 5, 6].map((row) => <line key={`lat-${row}`} x1="0" x2="720" y1={row * 40} y2={row * 40} />)}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((column) => <line key={`lon-${column}`} y1="0" y2="240" x1={column * 90} x2={column * 90} />)}
                  {remote.data.entries.map(({ place }) => {
                    const magnitude = findings.filter((finding) => finding.place === place.name).reduce((max, finding) => Math.max(max, Math.abs(finding.z)), 0);
                    const x = ((place.lon + 180) / 360) * 720;
                    const y = ((90 - place.lat) / 180) * 240;
                    return <circle key={place.name} cx={x} cy={y} r={magnitude ? 5 : 3} className={magnitude ? "anomaly-point" : "sample-point"} />;
                  })}
                </svg>
                <div className="global-map-picks">
                  {remote.data.entries.map(({ place }) => {
                    const magnitude = findings.filter((finding) => finding.place === place.name).reduce((max, finding) => Math.max(max, Math.abs(finding.z)), 0);
                    return <button key={place.name} className="link-button" onClick={() => onOpen(place)} aria-label={`Open ${place.name}, ${place.lat} degrees latitude, ${place.lon} degrees longitude${magnitude ? `, strongest robust z ${magnitude.toFixed(1)}` : ", no flagged anomaly"}`}>
                      {place.name}{magnitude ? ` · |z| ${magnitude.toFixed(1)}` : ""}
                    </button>;
                  })}
                </div>
              </div>
              {findings.length === 0 ? (
                <p className="muted">No station has a day beyond |z| {threshold} in this window.</p>
              ) : (
                <>
                  <div className="transport transport-compact">
                    <button className="btn btn-primary btn-small" aria-pressed={playing} onClick={play}>
                      {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Hear the {findings.length} anomalies in date order
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <caption className="sr-only">Most unusual days, largest robust z first</caption>
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>Station</th>
                          <th>Measurement</th>
                          <th>Robust z</th>
                          <th>
                            <span className="sr-only">Open</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.slice(0, SHOWN).map((finding) => {
                          const place: Place = { name: finding.place, lat: finding.latitude, lon: finding.longitude, why: "NASA POWER global scan grid point." };
                          return (
                            <tr key={`${finding.place}-${finding.variable}-${finding.date}`} className="flagged">
                              <td>{formatDay(finding.date)}</td>
                              <td>{finding.place}</td>
                              <td>
                                {MAPPINGS[finding.variable].name} {finding.value.toFixed(1)} {finding.unit} · {departureWord(finding)}
                              </td>
                              <td className="mono">{finding.z.toFixed(1)}</td>
                              <td>
                                {place && (
                                  <button className="link-button" onClick={() => onOpen(place)}>
                                    Open {place.name}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {findings.length > SHOWN && <p className="muted tiny">Showing the {SHOWN} largest of {findings.length}; all of them play.</p>}
                </>
              )}
            </>
          )}
        </>
      )}
      <p className="muted tiny">
        Each station is judged against its own days in this window (median and MAD; rain on ln(1 + P), and only days with at least 1 mm count as wet), not a long-term
        climatology. Missing POWER values are skipped, never filled. Bells are the soundscape&apos;s fixed anomaly pitches.
      </p>
    </section>
  );
}
