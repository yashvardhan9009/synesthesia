import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { fetchMonthly } from "../api.ts";
import { Problem, SoundMap, Wait } from "../components/Guide.tsx";
import type { SonificationEngine } from "../audio/engine.ts";
import { MAPPINGS } from "../audio/mappings.ts";
import { formatLatLon } from "../format.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { useRemote } from "../useRemote.ts";
import { explainDeparture, mostUnusual, UNUSUAL_Z, type ExplainParameter } from "./anomaly.ts";
import { AnomalyNotes, type AnomalyNote } from "./AnomalyNotes.tsx";
import {
  MONTHLY_FIRST_YEAR,
  NORMAL_PERIOD,
  RESOLUTIONS,
  TIMELINE_FULL_SCALE_C,
  TIMELINE_PARAMETERS,
  buildTimeline,
  normalBasis,
  requestYears,
  type Resolution,
  type TimelineRow,
} from "./timeline.ts";

export type HistoryPlace = { name: string; lat: number; lon: number };

type Props = {
  place: HistoryPlace;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
  /** Engine source that owns this playback ("timeline", or "cosmic" when embedded). */
  source: string;
  initialFrom: number;
  initialTo: number;
  initialResolution: Resolution;
  heading: string;
};

const SAME_SLOT: Record<Resolution, string> = { month: "the same calendar month", season: "the same season", year: "the annual values" };
const RESOLUTION_WORDS: Record<Resolution, string> = { month: "Monthly", season: "Seasonal", year: "Annual" };
const LAST_YEAR = new Date().getFullYear();
const fmt = (value: number, digits = 1) => value.toFixed(digits);

/**
 * A place's NASA POWER monthly record as a playable timeline: one note per
 * month, season or year, pitch from the temperature departure against the
 * 2001–2020 normal, bells for unusual steps, with a synced chart and a trace
 * for every note. Used by the Sound Timeline page and Cosmic Earth's history.
 */
export function HistoryPanel({ place, engine, onCaption, source, initialFrom, initialTo, initialResolution, heading }: Props) {
  const playback = useEngineState(engine);
  const [fromText, setFromText] = useState(String(initialFrom));
  const [toText, setToText] = useState(String(initialTo));
  const [span, setSpan] = useState<[number, number]>([initialFrom, initialTo]);
  const [resolution, setResolution] = useState<Resolution>(initialResolution);
  const [formError, setFormError] = useState<string | null>(null);
  const [sounding, setSounding] = useState<number | null>(null);

  const [askFrom, askTo] = requestYears(span[0], span[1]);
  const key = `${place.lat.toFixed(4)},${place.lon.toFixed(4)},${askFrom},${askTo}`;
  const remote = useRemote(key, (signal) => fetchMonthly(place.lat, place.lon, askFrom, askTo, TIMELINE_PARAMETERS, signal));
  const timeline = useMemo(
    () => (remote.data ? buildTimeline({ place: place.name, monthly: remote.data, resolution, from: span[0], to: span[1] }) : null),
    [remote.data, resolution, span, place.name],
  );
  const mine = playback.source === source && playback.title === timeline?.scape.title;
  const playing = playback.playing && mine;

  const apply = () => {
    const from = Number(fromText);
    const to = Number(toText);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < MONTHLY_FIRST_YEAR || to > LAST_YEAR) {
      setFormError(`Choose whole years from ${MONTHLY_FIRST_YEAR} to ${LAST_YEAR}.`);
      return;
    }
    if (from > to) {
      setFormError("The first year must not be after the last year.");
      return;
    }
    setFormError(null);
    if (mine) engine.stopAll();
    setSpan([from, to]);
  };

  const play = (startAt = 0) => {
    if (!timeline || timeline.scape.steps.length === 0) return;
    void engine
      .playSoundscape(timeline.scape, {
        source,
        title: timeline.scape.title,
        startAt,
        onStep: (step, index) => {
          setSounding(index);
          onCaption(step.caption);
        },
        onEnded: () => setSounding(null),
      })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const notes = useMemo<AnomalyNote[]>(() => {
    if (!timeline) return [];
    const all = timeline.rows.flatMap((row) =>
      (Object.values(row.departures).filter(Boolean) as NonNullable<TimelineRow["departures"][ExplainParameter]>[]).map((departure) => ({ row, departure })),
    );
    const ranked = mostUnusual(all.map((item) => ({ ...item.departure, row: item.row })), 6);
    return ranked.map((item) => ({
      id: `${item.parameter}-${item.row.key}`,
      when: item.row.label,
      text: explainDeparture(item, `in ${item.row.label}`, normalBasis(resolution, item.row.slot)),
      departure: item,
    }));
  }, [timeline, resolution]);

  const rows = timeline?.rows ?? [];
  const current = sounding !== null && mine ? rows[sounding] ?? null : null;
  const bellCount = rows.filter((row) => row.bells.length > 0).length;

  return (
    <section className="history-panel" aria-label={heading}>
      <header>
        <p className="meta-row">
          <span><span className="label">Source</span><b>NASA POWER monthly</b></span>
          <span><span className="label">Normal</span><b>{NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}</b></span>
          <span><span className="label">Point</span><b>{formatLatLon(place.lat, place.lon)}</b></span>
        </p>
        <h3 className="deck-title">{heading}</h3>
      </header>
      <form
        className="history-controls"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label className="field">
          <span className="label">From year</span>
          <input inputMode="numeric" aria-label={`${heading}: first year`} value={fromText} onChange={(event) => setFromText(event.target.value)} />
        </label>
        <label className="field">
          <span className="label">To year</span>
          <input inputMode="numeric" aria-label={`${heading}: last year`} value={toText} onChange={(event) => setToText(event.target.value)} />
        </label>
        <button className="btn btn-ghost btn-small" type="submit" disabled={remote.loading}>
          Load years
        </button>
        <div className="chips" role="group" aria-label={`${heading}: one note per`}>
          {RESOLUTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className="chip"
              aria-pressed={resolution === item}
              onClick={() => {
                if (mine) engine.stopAll();
                setResolution(item);
              }}
            >
              {RESOLUTION_WORDS[item]}
            </button>
          ))}
        </div>
      </form>
      {formError && <p className="error" role="alert">{formError}</p>}
      <Wait active={remote.loading} label="Asking NASA POWER for the monthly record." slow="Still waiting on NASA POWER's monthly service. Decades of months come in one answer." />
      {remote.error && <Problem message={remote.error} source="NASA POWER" onRetry={remote.retry} />}
      {timeline && rows.length === 0 && <p className="muted">NASA POWER returned no months for {span[0]}–{span[1]} here.</p>}
      {timeline && rows.length > 0 && (
        <>
          <div className="transport">
            <button className="btn btn-primary btn-small" aria-pressed={playing} onClick={playing ? () => engine.stopAll() : () => play(0)}>
              {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              {playing ? "Stop" : `Play ${rows.length} ${resolution === "month" ? "months" : resolution === "season" ? "seasons" : "years"}`}
            </button>
            <span className="mono tiny strong" aria-live="off">
              {current ? currentLine(current) : `${rows.length} steps, ${bellCount} with a bell. No change from normal is ${timeline.referenceNote}.`}
            </span>
          </div>
          <TimelineChart rows={rows} sounding={mine ? sounding : null} onPick={(index) => play(index)} />
          {!timeline.normalsAvailable && (
            <p className="muted tiny">No normal could be computed for these steps (the {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]} months are missing), so they play without pitch.</p>
          )}
          <div className="columns">
            <div>
              <AnomalyNotes
                heading="What was unusual, against normal"
                notes={notes}
                basis={`Each step is compared with ${SAME_SLOT[resolution]} in ${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]} at this point (mean and standard deviation; rain on ln(1 + P)). Unusual means at least ${UNUSUAL_Z} standard deviations away.`}
                empty={`No step in ${span[0]}–${span[1]} is ${UNUSUAL_Z} or more standard deviations from its normal.`}
              />
              <details>
                <summary>Every step, in numbers</summary>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Temperature</th>
                        <th>vs normal</th>
                        <th>Rain</th>
                        <th>Humidity</th>
                        <th>Bells</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className={[row.bells.length ? "flagged" : "", current?.key === row.key ? "sounding" : ""].filter(Boolean).join(" ") || undefined}>
                          <td>{row.label}</td>
                          <td>{row.values.T2M == null ? "missing" : `${fmt(row.values.T2M)} °C`}</td>
                          <td>{row.departures.T2M ? `${row.departures.T2M.diff >= 0 ? "+" : "−"}${fmt(Math.abs(row.departures.T2M.diff))} °C` : "—"}</td>
                          <td>{row.values.PRECTOTCORR == null ? "missing" : `${fmt(row.values.PRECTOTCORR)} mm/day`}</td>
                          <td>{row.values.RH2M == null ? "missing" : `${fmt(row.values.RH2M, 0)} %`}</td>
                          <td>{row.bells.length ? row.bells.map((bell) => `${MAPPINGS[bell.variable].name.toLowerCase()} z ${fmt(bell.z)}`).join(", ") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <p className="muted tiny">
                {remote.data?.source}. Monthly values are means of daily values; a season or year with a missing month is missing.{" "}
                <a href={remote.data?.request_url} target="_blank" rel="noreferrer">NASA POWER request</a>
              </p>
            </div>
            <div>
              <SoundMap
                rows={[
                  { from: `Temperature minus the ${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]} normal for the same ${resolution}`, hears: `Pitch: no change is ${timeline.referenceNote}; ±${TIMELINE_FULL_SCALE_C} °C reaches the ends of three octaves` },
                  { from: "Rain, monthly mean", hears: "Percussion hits (soundscape rule)" },
                  { from: "Wind at 2 m", hears: "Loudness and brightness" },
                  { from: "Humidity", hears: "Noise texture" },
                  { from: "Cloud amount", hears: "Added chord voices (silent where CERES has no value yet)" },
                  { from: `A variable ${UNUSUAL_Z}+ standard deviations from its normal`, hears: "Its bell" },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function currentLine(row: TimelineRow): string {
  const t = row.departures.T2M;
  const temp = t ? `${fmt(t.value)} °C, ${t.diff >= 0 ? "+" : "−"}${fmt(Math.abs(t.diff))} °C vs normal` : "temperature missing";
  const bells = row.bells.length ? ` · bell: ${row.bells.map((bell) => MAPPINGS[bell.variable].name.toLowerCase()).join(", ")}` : "";
  return `${row.label} · ${temp}${bells}`;
}

const CW = 960;
const TEMP_H = 130;
const RAIN_TOP = TEMP_H + 18;
const RAIN_H = 56;
const BELL_Y = RAIN_TOP + RAIN_H + 16;
const CH = BELL_Y + 22;

/** Temperature departure bars (°C), rain departure bars (z on ln(1 + P)) and bell marks, with the sounding step lit. */
function TimelineChart({ rows, sounding, onPick }: { rows: TimelineRow[]; sounding: number | null; onPick: (index: number) => void }) {
  const tSpan = Math.max(0.5, ...rows.map((row) => Math.abs(row.departures.T2M?.diff ?? 0)));
  const rSpan = Math.max(1, ...rows.map((row) => Math.abs(row.departures.PRECTOTCORR?.z ?? 0)));
  const slot = CW / rows.length;
  const tMid = TEMP_H / 2;
  const rMid = RAIN_TOP + RAIN_H / 2;
  const w = Math.max(1.5, slot * 0.7);
  const tick = Math.max(1, Math.ceil(rows.length / 8));
  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <span className="label">Temperature vs normal · °C (±{tSpan.toFixed(1)}) · rain vs normal · z · bells</span>
        <span className="label">Click a step to play from it; , and . step through notes</span>
      </div>
      <svg
        className="chart delta-chart timeline-chart"
        viewBox={`0 0 ${CW} ${CH + 18}`}
        role="img"
        aria-label={`Timeline of ${rows.length} steps from ${rows[0].label} to ${rows[rows.length - 1].label}. Upper lane: temperature above normal in amber, below in cyan. Middle lane: rain departure. Rings: steps with a bell. The table lists every value.`}
      >
        <text className="lane-label" x={4} y={12}>TEMPERATURE</text>
        <text className="lane-label" x={4} y={RAIN_TOP + 10}>RAIN</text>
        <line className="zero" x1={0} x2={CW} y1={tMid} y2={tMid} />
        <line className="grid" x1={0} x2={CW} y1={rMid} y2={rMid} />
        {rows.map((row, index) => {
          const x0 = index * slot + (slot - w) / 2;
          const t = row.departures.T2M;
          const r = row.departures.PRECTOTCORR;
          const now = sounding === index;
          return (
            <g key={row.key}>
              {t ? (
                <rect
                  className={["bar", t.diff >= 0 ? "warm" : "cool", row.bells.some((bell) => bell.variable === "T2M") ? "flag" : "", now ? "now" : ""].join(" ")}
                  x={x0}
                  y={t.diff >= 0 ? tMid - Math.max(1, (t.diff / tSpan) * (tMid - 6)) : tMid}
                  width={w}
                  height={Math.max(1, (Math.abs(t.diff) / tSpan) * (tMid - 6))}
                />
              ) : (
                <rect className="gap-mark" x={x0} y={tMid - 1} width={w} height={2} />
              )}
              {r && r.z !== null ? (
                <rect
                  className={["bar", r.z >= 0 ? "cool" : "warm", now ? "now" : ""].join(" ")}
                  x={x0}
                  y={r.z >= 0 ? rMid - (Math.abs(r.z) / rSpan) * (RAIN_H / 2 - 2) : rMid}
                  width={w}
                  height={Math.max(1, (Math.abs(r.z) / rSpan) * (RAIN_H / 2 - 2))}
                />
              ) : (
                <rect className="gap-mark" x={x0} y={rMid - 1} width={w} height={2} />
              )}
              {row.bells.length > 0 && <circle className={now ? "bell-mark now" : "bell-mark"} cx={index * slot + slot / 2} cy={BELL_Y} r={Math.min(5, Math.max(2.5, slot / 2.5))} />}
              <rect className="step-hit" x={index * slot} y={0} width={slot} height={CH} onClick={() => onPick(index)}>
                <title>{currentLine(row)}</title>
              </rect>
            </g>
          );
        })}
        {sounding !== null && <line className="now-line" x1={sounding * slot + slot / 2} x2={sounding * slot + slot / 2} y1={0} y2={CH} />}
        {rows.map((row, index) =>
          index % tick === 0 ? (
            <text key={row.key} className="axis-text" x={index * slot + 2} y={CH + 14}>
              {row.label}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="legend-inline">
        <span><i className="swatch warm" /> Warmer than normal (rain lane: drier)</span>
        <span><i className="swatch cool" /> Cooler than normal (rain lane: wetter)</span>
        <span><i className="swatch ring" /> A bell: some variable {UNUSUAL_Z}+ standard deviations from normal</span>
      </figcaption>
    </figure>
  );
}
