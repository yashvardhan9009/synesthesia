import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Ear, Pause, Play } from "lucide-react";
import { fetchBaseline, fetchPower } from "../api.ts";
import { formatDay } from "../audio/build.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { MAPPINGS } from "../audio/mappings.ts";
import { explainDeparture, mostUnusual, UNUSUAL_Z } from "../history/anomaly.ts";
import { AnomalyNotes } from "../history/AnomalyNotes.tsx";
import {
  MAP_COLS,
  MAP_PARAMETERS,
  MAP_ROWS,
  TOURS,
  cellAt,
  cellCenter,
  cellId,
  cellName,
  mapSoundscape,
  moveCell,
  regionSound,
  type Cell,
  type RegionSound,
  type TourId,
} from "../history/soundMap.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { Problem, SoundMap, Wait } from "./Guide.tsx";

type Props = { engine: SonificationEngine; onCaption: (caption: string) => void };

type Entry = { status: "loading" } | { status: "ready"; region: RegionSound; baselineError: string | null } | { status: "error"; error: string };

const SOURCE = "soundmap";
/** A summer day with every POWER layer published, including the delayed CERES cloud amount. */
const DEFAULT_DATE = "2026-07-15";
const PARALLEL = 3;
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Earth Sound Map: sweep across the globe (drag, hover with sound on, arrow
 * keys) or take a tour, and hear each region's NASA POWER day. Every note
 * carries its own request and trace.
 */
export function EarthSoundMap({ engine, onCaption }: Props) {
  const playback = useEngineState(engine);
  const [dateText, setDateText] = useState(DEFAULT_DATE);
  const [date, setDate] = useState(DEFAULT_DATE);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [current, setCurrent] = useState<Cell>({ row: 2, col: 6 });
  const [hoverSound, setHoverSound] = useState(false);
  const [tour, setTour] = useState<{ id: TourId; loaded: number; total: number } | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const pending = useRef(new Map<string, Promise<RegionSound | null>>());
  const generation = useRef(0);
  const wanted = useRef<string | null>(null);
  const dragging = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const ours = playback.source === SOURCE;
  const touring = ours && playback.playing && (playback.length ?? 0) > 1;

  const load = useCallback(
    (cell: Cell): Promise<RegionSound | null> => {
      const id = cellId(cell);
      const known = pending.current.get(id);
      if (known) return known;
      const mine = generation.current;
      const { lat, lon } = cellCenter(cell);
      setEntries((old) => ({ ...old, [id]: { status: "loading" } }));
      const job = (async () => {
        try {
          const [series, baseline] = await Promise.all([
            fetchPower({ lat, lon, start: date, end: date, parameters: MAP_PARAMETERS }),
            fetchBaseline(lat, lon).then(
              (value) => ({ value, error: null as string | null }),
              (caught: unknown) => ({ value: null, error: caught instanceof Error ? caught.message : String(caught) }),
            ),
          ]);
          const region = regionSound(cell, series, baseline.value);
          if (mine !== generation.current) return null;
          if (!region) throw new Error(`NASA POWER returned no day for ${cellName(cell)} on ${date}.`);
          setEntries((old) => ({ ...old, [id]: { status: "ready", region, baselineError: baseline.error } }));
          return region;
        } catch (caught) {
          if (mine !== generation.current) return null;
          pending.current.delete(id);
          setEntries((old) => ({ ...old, [id]: { status: "error", error: caught instanceof Error ? caught.message : String(caught) } }));
          return null;
        }
      })();
      pending.current.set(id, job);
      return job;
    },
    [date],
  );

  // A new date is a new map: forget the old regions and stop their sound.
  useEffect(
    () => () => {
      generation.current += 1;
      pending.current = new Map();
    },
    [date],
  );

  const playOne = useCallback(
    (region: RegionSound) => {
      const scape = mapSoundscape([region], `Earth Sound Map · ${cellName(region.cell)}`);
      void engine
        .playSoundscape(scape, { source: SOURCE, title: scape.title, onStep: (step) => onCaption(step.caption) })
        .catch((caught: Error) => onCaption(caught.message));
    },
    [engine, onCaption],
  );

  const select = useCallback(
    (cell: Cell, sound: boolean) => {
      setCurrent(cell);
      const id = cellId(cell);
      wanted.current = id;
      void load(cell).then((region) => {
        if (region && sound && wanted.current === id) playOne(region);
      });
    },
    [load, playOne],
  );

  const pointerCell = (event: PointerEvent<HTMLDivElement>): Cell => {
    const box = event.currentTarget.getBoundingClientRect();
    return cellAt((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const cell = pointerCell(event);
    if (cellId(cell) === cellId(current)) return;
    // Hovering without sound only points; it does not ask NASA for anything.
    if (dragging.current || hoverSound) select(cell, true);
    else setCurrent(cell);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = moveCell(current, event.key);
    if (!next) return;
    event.preventDefault();
    buttons.current.get(cellId(next))?.focus();
    select(next, true);
  };

  const runTour = async (id: TourId) => {
    const cells = TOURS[id].cells();
    const mine = generation.current;
    setTour({ id, loaded: 0, total: cells.length });
    const regions: (RegionSound | null)[] = new Array(cells.length).fill(null);
    let next = 0;
    let loaded = 0;
    const worker = async () => {
      while (next < cells.length) {
        const index = next++;
        regions[index] = await load(cells[index]);
        loaded += 1;
        if (mine === generation.current) setTour({ id, loaded, total: cells.length });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    if (mine !== generation.current) return;
    setTour(null);
    const ready = regions.filter((region): region is RegionSound => region !== null);
    if (ready.length === 0) {
      onCaption("NASA POWER did not answer for any region on this tour.");
      return;
    }
    const scape = mapSoundscape(ready, `Earth Sound Map · ${TOURS[id].name} · ${formatDay(date.replace(/-/g, ""))}`);
    void engine
      .playSoundscape(scape, {
        source: SOURCE,
        title: scape.title,
        onStep: (step, index) => {
          setCurrent(ready[index].cell);
          onCaption(step.caption);
        },
      })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const applyDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || dateText < "2001-01-01" || dateText > TODAY) {
      setDateError(`Choose a day from 2001-01-01 to ${TODAY}.`);
      return;
    }
    setDateError(null);
    if (ours) engine.stopAll();
    setEntries({});
    setDate(dateText);
  };

  const entry = entries[cellId(current)];
  const region = entry?.status === "ready" ? entry.region : null;
  const notes = useMemo(
    () =>
      region && region.basis
        ? mostUnusual(region.departures, 6).map((item) => ({
            id: `${item.parameter}`,
            when: formatDay(region.date),
            text: explainDeparture(item, `on ${formatDay(region.date)}`, region.basis ?? ""),
            departure: item,
          }))
        : [],
    [region],
  );
  const loadedCount = Object.values(entries).filter((item) => item.status === "ready").length;

  return (
    <section className="deck" aria-label="Earth Sound Map">
      <header>
        <p className="meta-row">
          <span><span className="label">Source</span><b>NASA POWER daily, one point per region</b></span>
          <span><span className="label">Day</span><b>{formatDay(date.replace(/-/g, ""))}</b></span>
          <span><span className="label">Regions</span><b>{MAP_COLS} × {MAP_ROWS}</b></span>
        </p>
        <h2 className="deck-title">Earth Sound Map</h2>
        <p className="reading reading-spaced">
          The globe in {MAP_COLS * MAP_ROWS} regions, each heard through the NASA POWER day at its centre point. Drag
          across the map, turn on sound on hover, use the arrow keys, or take a tour. Pitch, rhythm and texture use
          fixed physical ranges, so the same note means the same temperature anywhere. A bell rings where a variable is
          unusual against that point's own 2001–2020 normal for the time of year.
        </p>
      </header>

      <div className="history-controls">
        <form
          className="fields"
          onSubmit={(event) => {
            event.preventDefault();
            applyDate();
          }}
        >
          <label className="field">
            <span className="label">Day</span>
            <input type="date" aria-label="Map day" min="2001-01-01" max={TODAY} value={dateText} onChange={(event) => setDateText(event.target.value)} />
          </label>
          <button className="btn btn-ghost btn-small" type="submit">Load day</button>
        </form>
        <button
          className="btn btn-ghost btn-small"
          aria-pressed={hoverSound}
          onClick={() => {
            void engine.ensure();
            setHoverSound((value) => !value);
          }}
        >
          <Ear size={14} aria-hidden="true" /> Sound on hover
        </button>
        <div className="transport-actions" role="group" aria-label="Tours">
          {(Object.keys(TOURS) as TourId[]).map((id) => (
            <button key={id} className="btn btn-ghost btn-small" disabled={tour !== null} title={TOURS[id].describe} onClick={() => void runTour(id)}>
              <Play size={14} aria-hidden="true" /> {TOURS[id].name}
            </button>
          ))}
          {ours && playback.playing && (
            <button className="btn btn-ghost btn-small" onClick={() => engine.stopAll()}>
              <Pause size={14} aria-hidden="true" /> Stop
            </button>
          )}
        </div>
      </div>
      {dateError && <p className="error" role="alert">{dateError}</p>}
      <Wait
        active={tour !== null}
        label={tour ? `Loading the tour: ${tour.loaded} of ${tour.total} regions from NASA POWER.` : ""}
        slow={tour ? `Still loading: ${tour.loaded} of ${tour.total} regions. Each new region also fetches its 2001–2020 baseline once; later visits are cached.` : ""}
      />

      <div className="sound-map">
        <img src="/api/gibs/bluemarble" alt="" aria-hidden="true" />
        <div
          className="sound-map-grid"
          role="group"
          aria-label={`Map regions, ${MAP_ROWS} rows from north to south and ${MAP_COLS} columns from 180° west. Arrow keys move and play; Home and End jump along a row.`}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            void engine.ensure();
            select(pointerCell(event), true);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          {Array.from({ length: MAP_ROWS }, (_, row) =>
            Array.from({ length: MAP_COLS }, (_, col) => {
              const cell = { row, col };
              const id = cellId(cell);
              const item = entries[id];
              const ready = item?.status === "ready" ? item.region : null;
              const temp = ready?.step.traces.find((trace) => trace.variable === "T2M" && trace.layer === "pitch")?.raw;
              const selected = cellId(current) === id;
              return (
                <button
                  key={id}
                  ref={(node) => {
                    if (node) buttons.current.set(id, node);
                    else buttons.current.delete(id);
                  }}
                  type="button"
                  className="map-cell"
                  tabIndex={selected ? 0 : -1}
                  aria-current={selected ? "true" : undefined}
                  data-state={item?.status ?? "idle"}
                  data-unusual={ready && ready.step.bells.length > 0 ? "true" : undefined}
                  aria-label={`${cellName(cell)}${ready ? `, ${temp == null ? "temperature missing" : `${temp.toFixed(1)} °C`}${ready.step.bells.length ? `, ${ready.step.bells.length} unusual` : ""}` : ""}`}
                  onClick={(event) => {
                    // Pointer presses are handled on the grid; this is Enter or Space.
                    if (event.detail === 0) select(cell, true);
                  }}
                >
                  {ready && temp != null && <span className="cell-temp">{Math.round(temp)}°</span>}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <p className="muted tiny">
        {loadedCount} of {MAP_COLS * MAP_ROWS} regions loaded for {formatDay(date.replace(/-/g, ""))}. Map image: NASA GIBS Blue Marble (for orientation only; the sound is from POWER).
        Ringed regions have at least one variable {UNUSUAL_Z}+ standard deviations from normal.
        {touring ? " Tour playing: the lit region is the one you hear." : ""}
      </p>

      <div className="columns">
        <div className="map-readout">
          <h3 className="label">{cellName(current)} · centre point {cellCenter(current).lat.toFixed(0)}°, {cellCenter(current).lon.toFixed(0)}°</h3>
          {!entry && <p className="muted">Press or drag across the map, press an arrow key or Enter, or turn on sound on hover to hear this region.</p>}
          {entry?.status === "loading" && <Wait active label="Asking NASA POWER for this region's day and its 2001–2020 baseline." slow="Still waiting on NASA POWER. The first visit to a region loads twenty years for its baseline." />}
          {entry?.status === "error" && <Problem message={entry.error} source="NASA POWER" onRetry={() => select(current, false)} />}
          {region && (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Measured</th>
                    <th>Value</th>
                    <th>Heard as</th>
                  </tr>
                </thead>
                <tbody>
                  {region.step.traces
                    .filter((trace) => trace.layer !== "anomaly")
                    .map((trace) => (
                      <tr key={`${trace.variable}-${trace.layer}`}>
                        <td>{MAPPINGS[trace.variable].name}</td>
                        <td>{trace.raw === null ? "missing" : `${trace.raw.toFixed(trace.variable === "PS" ? 2 : 1)} ${trace.unit}`}</td>
                        <td>{trace.result}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {entry?.status === "ready" && entry.baselineError && (
                <p className="muted tiny">The 2001–2020 baseline did not load ({entry.baselineError}), so this region plays without bells.</p>
              )}
              {region.basis && (
                <AnomalyNotes
                  heading="What was unusual here, against normal"
                  notes={notes}
                  basis={`Compared with ${region.basis} at this point (NASA POWER daily). Unusual means at least ${UNUSUAL_Z} standard deviations from that normal (rain on ln(1 + P)).`}
                  empty="Every variable this day is within two standard deviations of its normal for the time of year."
                />
              )}
              <p className="muted tiny">
                <a href={region.step.requestUrl} target="_blank" rel="noreferrer">NASA POWER request for this region</a>. Press <kbd>T</kbd> while it sounds to open the full trace.
              </p>
            </>
          )}
        </div>
        <div>
          <SoundMap
            rows={[
              { from: "Temperature at the region's centre point", hears: "Pitch, on the fixed −40…45 °C range: the same note means the same temperature anywhere" },
              { from: "Rain", hears: "Percussion hits; dry days are silent" },
              { from: "Wind at 2 m", hears: "Loudness and brightness" },
              { from: "Humidity", hears: "Noise texture" },
              { from: "Surface pressure minus the point's 2001–2020 normal", hears: "Vibrato" },
              { from: "Cloud amount", hears: "Added chord voices" },
              { from: `A variable ${UNUSUAL_Z}+ standard deviations from its normal`, hears: "Its bell; the region is ringed on the map" },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
