import { powerUnit } from "../format.ts";
import { useRef, useState } from "react";
import { ArrowRight, Pause, Play } from "lucide-react";
import { fetchPower } from "../api.ts";
import { eventsFromChange, eventsFromPower, type ChangeDay } from "../audio/build.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { PLACES, type Place, type PowerSeries, type SonicSettings } from "../types.ts";
import { SoundMap, Wait } from "./Guide.tsx";
import { ComparisonChart } from "../geo/ComparisonChart.tsx";
import type { LeadParameter } from "../types.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { DailyAnomalies } from "../history/DailyAnomalies.tsx";
import { CHANGE_FULL_SCALE_C, changeReferenceMidi, midiName } from "../science/score.ts";

/** Time Machine compares the variables with long, gap-free POWER records. */
const TIME_PARAMETERS = "T2M,PRECTOTCORR,RH2M";

type Props = {
  settings: SonicSettings;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
};

export function TimeMachine({ settings, engine, onCaption }: Props) {
  const playback = useEngineState(engine);
  const playing = playback.playing && playback.source === "time";
  const [place, setPlace] = useState<Place>(PLACES[0]);
  const [earlyStart, setEarlyStart] = useState("2006-06-01");
  const [earlyEnd, setEarlyEnd] = useState("2006-06-30");
  const [lateStart, setLateStart] = useState("2026-06-01");
  const [lateEnd, setLateEnd] = useState("2026-06-30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sounding, setSounding] = useState<number | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [rows, setRows] = useState<ChangeDay[]>([]);
  const [median, setMedian] = useState<number | null>(null);
  const [earlierData, setEarlierData] = useState<PowerSeries | null>(null);
  const [laterData, setLaterData] = useState<PowerSeries | null>(null);
  const [playMode, setPlayMode] = useState<"difference" | "earlier" | "later">("difference");
  const earlierRef = useRef<PowerSeries | null>(null);
  const laterRef = useRef<PowerSeries | null>(null);

  const requestGeneration = useRef(0);
  const referenceNote = midiName(changeReferenceMidi(settings.rootMidi, settings.octaves));

  const compare = async () => {
    if (earlyStart > earlyEnd || lateStart > lateEnd) {
      setError("Each window must start before it ends: choose a start date before the end date.");
      return;
    }
    // Only the newest comparison may write; old rows are cleared so they cannot be played as the new ones.
    const generation = ++requestGeneration.current;
    earlierRef.current = null;
    laterRef.current = null;
    setRows([]);
    setLoading(true);
    setError(null);
    setSounding(null);
    setMedian(null);
    engine.stopAll();
    try {
      const [earlier, later] = await Promise.all([
        fetchPower({ lat: place.lat, lon: place.lon, start: earlyStart, end: earlyEnd, parameters: TIME_PARAMETERS }),
        fetchPower({ lat: place.lat, lon: place.lon, start: lateStart, end: lateEnd, parameters: TIME_PARAMETERS }),
      ]);
      if (generation !== requestGeneration.current) return;
      setEarlierData(earlier);
      setLaterData(later);
      setPlayMode("difference");
      earlierRef.current = earlier;
      laterRef.current = later;
      const { events, days, medianDelta } = eventsFromChange(place.name, earlier, later, settings);
      setRows(days);
      setMedian(medianDelta);
      if (events.length === 0 || medianDelta === null) {
        const message = "NASA POWER did not return overlapping temperature days for these two windows.";
        setSummary(message);
        onCaption(message);
        return;
      }
      const outliers = days.filter((day) => day.flagged).length;
      const outlierText =
        outliers === 1 ? "1 day-to-day change is an outlier" : `${outliers} day-to-day changes are outliers`;
      const line = `${place.name}: the later window runs ${medianDelta.toFixed(1)}°C ${medianDelta >= 0 ? "warmer" : "cooler"} at the median calendar day. ${outlierText}.`;
      setSummary(line);
      onCaption(`${line} Press play to hear the change.`);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setEarlierData(null);
      setLaterData(null);
      const message = caught instanceof Error ? caught.message : "NASA POWER failed.";
      setError(message);
      onCaption(message);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  const play = (mode: "difference" | "earlier" | "later" = "difference") => {
    if (!earlierRef.current || !laterRef.current) {
      onCaption("Load two windows before playing the change.");
      return;
    }
    const events = mode === "difference"
      ? eventsFromChange(place.name, earlierRef.current, laterRef.current, settings).events
      : eventsFromPower(`${place.name}, ${mode} window`, mode === "earlier" ? earlierRef.current : laterRef.current, settings);
    if (events.length === 0) {
      onCaption("These windows have no overlapping temperature days to play.");
      return;
    }
    setPlayMode(mode);
    void engine.play(events, { source: "time", bpm: settings.bpm, title: `${place.name} comparison`, onIndex: (index) => {
      const event = events[index];
      if (!event) return;
      setSounding(event.sourceIndex);
      onCaption(event.caption);
    } }).catch((caught: Error) => {
      onCaption(caught.message);
    });
  };

  const span = Math.max(0.5, ...rows.map((row) => (row.delta === null ? 0 : Math.abs(row.delta))));
  const CW = 960;
  const CH = 150;
  const mid = CH / 2;
  const slot = rows.length ? CW / rows.length : CW;
  const current = sounding !== null ? rows[sounding] : null;

  return (
    <section className="deck time-machine" aria-label="Time Machine">
      <div className="time-head">
        <header>
          <p className="meta-row">
            <span><span className="label">Source</span><b>NASA POWER daily</b></span>
            <span><span className="label">Parameter</span><b>T2M air temperature</b></span>
          </p>
          <h2 className="deck-title">Hear the change</h2>
          <p className="reading reading-spaced">
            Two real windows at the same place. Each calendar day in the later window is compared with the same month
            and day earlier (in a window longer than a year, the same day of the same year of the window). Pitch
            follows that difference on a fixed scale: no change is always {referenceNote}, warmer is higher, cooler is
            lower, ±{CHANGE_FULL_SCALE_C} °C at the ends. Nothing is filled in when a day is missing.
          </p>
        </header>
        <div className="headline-stat" aria-hidden={median === null}>
          {median === null && summary ? (
            <p>{summary}</p>
          ) : median !== null ? (
            <>
              <span className={median >= 0 ? "big warm" : "big cool"}>
                {median > 0 ? "+" : median < 0 ? "−" : ""}
                {Math.abs(median).toFixed(1)}°
              </span>
              <p>
                <span className="label">Median calendar-day change · °C</span>
                <br />
                {summary}
              </p>
            </>
          ) : (
            <>
              <span className="big big-empty">±0.0°</span>
              <p>
                <span className="label">Median calendar-day change</span>
                <br />
                Press Compare to ask NASA POWER for both windows.
              </p>
            </>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="transport">
            <div className="transport-actions" role="group" aria-label="Historical playback">
              {(["earlier", "later", "difference"] as const).map((mode) => (
                <button key={mode} className="btn btn-ghost btn-small" aria-pressed={playing && playMode === mode} onClick={playing && playMode === mode ? () => engine.stopAll() : () => { void play(mode); }}>
                  {playing && playMode === mode ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                  {mode === "difference" ? "Hear difference" : `Hear ${mode} alone`}
                </button>
              ))}
            </div>
            <span className="mono tiny strong">
              {current
                ? `${current.label} · ${current.earlier?.toFixed(1) ?? "missing"} → ${current.later?.toFixed(1) ?? "missing"} °C · ${current.delta === null ? "—" : `${current.delta > 0 ? "+" : ""}${current.delta.toFixed(1)} °C`}`
                : `${rows.length} matched calendar days`}
            </span>
          </div>
          <figure className="chart-figure">
            <div className="chart-head">
              <span className="label">Later minus earlier · °C per calendar day</span>
              <span className="label">±{span.toFixed(1)} °C</span>
            </div>
            <svg
              className="chart delta-chart"
              viewBox={`0 0 ${CW} ${CH + 24}`}
              role="img"
              aria-label={`Day-by-day temperature change for ${rows.length} matched days. Warmer days rise in amber, cooler days fall in cyan. The table lists every value.`}
            >
              <line className="grid" x1={0} x2={CW} y1={4} y2={4} />
              <line className="grid" x1={0} x2={CW} y1={CH - 4} y2={CH - 4} />
              {rows.map((row, index) => {
                const x0 = index * slot + slot * 0.18;
                const w = Math.max(2, slot * 0.64);
                if (row.delta === null) {
                  return <rect key={row.key} className="gap-mark" x={x0} y={mid - 1} width={w} height={2} />;
                }
                const h = Math.max(1.5, (Math.abs(row.delta) / span) * (mid - 8));
                const cls = ["bar", row.delta >= 0 ? "warm" : "cool", row.flagged ? "flag" : "", sounding === index ? "now" : ""].join(" ");
                return (
                  <rect key={row.key} className={cls} x={x0} y={row.delta >= 0 ? mid - h : mid} width={w} height={h} rx={1}>
                    <title>{`${row.label}: ${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)} °C${row.flagged ? ", anomaly" : ""}`}</title>
                  </rect>
                );
              })}
              <line className="zero" x1={0} x2={CW} y1={mid} y2={mid} />
              {sounding !== null && (
                <line className="now-line" x1={sounding * slot + slot / 2} x2={sounding * slot + slot / 2} y1={0} y2={CH} />
              )}
              <text className="axis-text" x={0} y={CH + 18}>{rows[0]?.label}</text>
              <text className="axis-text" x={CW} y={CH + 18} textAnchor="end">{rows[rows.length - 1]?.label}</text>
            </svg>
            <figcaption className="legend-inline">
              <span><i className="swatch warm" /> Warmer than the same day in window A</span>
              <span><i className="swatch cool" /> Cooler</span>
              <span><i className="swatch ring swatch-square" /> Outlier among these changes</span>
            </figcaption>
          </figure>
          {earlierData && laterData && ( [
            ["T2M", "Air temperature"],
            ["PRECTOTCORR", "Precipitation"],
            ["RH2M", "Relative humidity"],
          ] as [LeadParameter, string][]).map(([parameter, label]) => (
            <ComparisonChart key={parameter} earlier={earlierData} later={laterData} parameter={parameter} label={label} unit={powerUnit(earlierData, parameter)} />
          ))}
          {earlierData && laterData && (
            <div className="columns">
              <DailyAnomalies series={laterData} place={place.name} limit={5} heading="B · What was unusual in the later window, against normal" />
              <DailyAnomalies series={earlierData} place={place.name} limit={5} heading="A · What was unusual in the earlier window, against normal" />
            </div>
          )}
        </>
      )}

      <div className="chips" role="group" aria-label="Place">
        {PLACES.map((item) => (
          <button key={item.name} className="chip" aria-pressed={item.name === place.name} onClick={() => setPlace(item)}>
            {item.name}
          </button>
        ))}
      </div>
      <form
        className="windows"
        onSubmit={(event) => {
          event.preventDefault();
          void compare();
        }}
      >
        <fieldset className="window">
          <legend className="label">A · Earlier window</legend>
          <div className="fields">
            <label className="field">
              <span className="label">From</span>
              <input type="date" aria-label="Earlier from" value={earlyStart} onChange={(event) => setEarlyStart(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">To</span>
              <input type="date" aria-label="Earlier to" value={earlyEnd} onChange={(event) => setEarlyEnd(event.target.value)} />
            </label>
          </div>
        </fieldset>
        <div className="window-arrow" aria-hidden="true">
          <ArrowRight size={18} strokeWidth={1.5} />
        </div>
        <fieldset className="window">
          <legend className="label">B · Later window</legend>
          <div className="fields">
            <label className="field">
              <span className="label">From</span>
              <input type="date" aria-label="Later from" value={lateStart} onChange={(event) => setLateStart(event.target.value)} />
            </label>
            <label className="field">
              <span className="label">To</span>
              <input type="date" aria-label="Later to" value={lateEnd} onChange={(event) => setLateEnd(event.target.value)} />
            </label>
          </div>
        </fieldset>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          Compare
        </button>
      </form>
      <Wait active={loading} label="Asking NASA POWER for both windows." slow="Still waiting on NASA POWER. Both windows have to answer before a comparison is shown." />
      {error && <p className="error">{error}</p>}

      <div className="columns">
        <div>
          {rows.length > 0 && (
            <details open>
              <summary>Day-matched temperatures</summary>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Later day</th>
                      <th>Earlier</th>
                      <th>Later</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className={[row.flagged ? "flagged" : "", sounding !== null && rows[sounding]?.key === row.key ? "sounding" : ""].filter(Boolean).join(" ") || undefined}>
                        <td>{row.label}</td>
                        <td>{row.earlier === null ? "missing" : `${row.earlier.toFixed(1)}°C`}</td>
                        <td>{row.later === null ? "missing" : `${row.later.toFixed(1)}°C`}</td>
                        <td>
                          {row.delta === null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}°C`}
                          {row.flagged ? " anomaly" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
        <div>
          <SoundMap
            rows={[
              { from: "Later temperature minus earlier temperature, same month and day", hears: `Pitch around a fixed reference: no change is ${referenceNote}; warmer sits higher, cooler the same number of steps lower; ±${CHANGE_FULL_SCALE_C} °C reaches the ends.` },
              { from: "A change that is an outlier among these days", hears: "Louder note, and the word anomaly in the table" },
              { from: "A day missing in either window", hears: "Silence. The row stays, with no invented number." },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
