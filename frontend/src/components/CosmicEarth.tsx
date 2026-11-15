import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Hand, Pause, Play, Search, Share2 } from "lucide-react";
import { fetchPower, geocode, type GeocodeResult } from "../api.ts";
import { eventsFromPower, formatDay } from "../audio/build.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { robustAnomalies } from "../science/anomaly.ts";
import { blueMarbleTouch } from "../audio/touch.ts";
import { formatLatLon, powerUnit } from "../format.ts";
import { Globe } from "./Globe.tsx";
import { SoundMap, Wait } from "./Guide.tsx";
import { PowerChart } from "../ui/PowerChart.tsx";
import { decodeShareUrl, encodeShareUrl } from "../geo/share.ts";
import { AnomalyExplorer } from "../geo/AnomalyExplorer.tsx";
import { RegionalComparison } from "../geo/RegionalComparison.tsx";
import { DailyAnomalies } from "../history/DailyAnomalies.tsx";
import { HistoryPanel } from "../history/HistoryPanel.tsx";
import { MONTHLY_FIRST_YEAR } from "../history/timeline.ts";

/** The place history starts at the first year of POWER's monthly record and ends at the last complete year. */
const HISTORY_FIRST_YEAR = MONTHLY_FIRST_YEAR;
const LAST_FULL_YEAR = new Date().getFullYear() - 1;
import { useEngineState } from "../ui/audioBus.ts";
import { PARAMETERS, PLACES, type Place, type PowerSeries, type SonicSettings } from "../types.ts";

type Props = {
  settings: SonicSettings;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
  activeIndex: number | null;
  onActiveIndex: (index: number | null) => void;
  requestPlay: number;
  reducedMotion: boolean;
  /** Opened from the Anomalies tab (#/cosmic?focus=anomaly): the global explorer leads the page. */
  focus?: string | null;
};

export function CosmicEarth({
  settings,
  engine,
  onCaption,
  activeIndex,
  onActiveIndex,
  requestPlay,
  reducedMotion,
  focus = null,
}: Props) {
  const playback = useEngineState(engine);
  const [shared] = useState(() => decodeShareUrl(window.location.search));
  const initialLat = shared.lat ?? PLACES[0].lat;
  const initialLon = shared.lon ?? PLACES[0].lon;
  const [place, setPlace] = useState<Place>(() => shared.lat !== undefined || shared.lon !== undefined
    ? { name: "Shared location", lat: initialLat, lon: initialLon, why: "Opened from a shared Earth sound experience." }
    : PLACES[0]);
  const [lat, setLat] = useState(initialLat);
  const [lon, setLon] = useState(initialLon);
  const [start, setStart] = useState(shared.start ?? "2026-06-01");
  const [end, setEnd] = useState(shared.end ?? "2026-06-30");
  const [series, setSeries] = useState<PowerSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hand, setHand] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [leadChoice, setLeadChoice] = useState(shared.lead ?? settings.lead);
  const playSettings = useMemo(() => ({
    ...settings,
    lead: leadChoice,
    bpm: shared.bpm ?? settings.bpm,
    scale: shared.scale ?? settings.scale,
    rootMidi: shared.rootMidi ?? settings.rootMidi,
  }), [settings, shared, leadChoice]);

  useEffect(() => {
    const url = encodeShareUrl({ lat, lon, start, end, sound: "lead", lead: playSettings.lead, bpm: playSettings.bpm, scale: playSettings.scale, rootMidi: playSettings.rootMidi, config: null }, window.location.href);
    // Keep an in-page target (#/cosmic?focus=anomaly) so the Anomalies link stays shareable.
    const next = new URL(url);
    if (window.location.hash.startsWith("#/cosmic")) next.hash = window.location.hash;
    window.history.replaceState(null, "", next.toString());
  }, [lat, lon, start, end, playSettings]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const results = await geocode(searchText);
      setSearchResults(results);
      if (results.length === 0) setSearchError("No matching place was returned by Open-Meteo.");
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "Place search failed.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const chooseSearchResult = (result: GeocodeResult) => {
    setPlace({ name: result.name, lat: result.latitude, lon: result.longitude, why: "Location resolved by Open-Meteo Geocoding; environmental values come from NASA POWER." });
    setLat(result.latitude);
    setLon(result.longitude);
    setSearchResults([]);
    setSearchText(result.name);
  };

  const copyShareLink = async () => {
    const url = encodeShareUrl({ lat, lon, start, end, sound: "lead", lead: leadChoice, bpm: playSettings.bpm, scale: playSettings.scale, rootMidi: playSettings.rootMidi, config: null }, window.location.href);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable. Copy the address bar URL instead.");
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "Could not copy the link.");
    }
  };

  const requestGeneration = useRef(0);
  useEffect(() => () => void (requestGeneration.current += 1), []);

  const load = useCallback(
    async (nextLat: number, nextLon: number, nextStart: string, nextEnd: string) => {
      // Only the newest request may write: a slow answer for an earlier place is dropped.
      const generation = ++requestGeneration.current;
      const placeName = place.name;
      setLoading(true);
      setError(null);
      onActiveIndex(null);
      try {
        const body = await fetchPower({ lat: nextLat, lon: nextLon, start: nextStart, end: nextEnd });
        if (generation !== requestGeneration.current) return;
        setSeries(body);
        const temps = body.parameters.T2M ?? [];
        const usable = temps.filter((point) => point.value !== null).length;
        onCaption(
          usable
            ? `${placeName}. ${usable} days of NASA POWER temperature are ready. Press play.`
            : "NASA POWER returned no usable temperature values for this window.",
        );
      } catch (caught) {
        if (generation !== requestGeneration.current) return;
        const message = caught instanceof Error ? caught.message : "NASA POWER failed.";
        setSeries(null);
        setError(message);
        onCaption(message);
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    },
    [onActiveIndex, onCaption, place.name],
  );

  useEffect(() => {
    void load(lat, lon, start, end);
    // Reload when the chosen point changes. Dates reload from the form button
    // so a half-typed date does not fire a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, attempt]);

  // The chart, table and anomaly marks follow the lead parameter, the same series the sound plays.
  const leadName = leadChoice;
  const leadPoints = useMemo(() => series?.parameters[leadName] ?? [], [series, leadName]);
  const anomalies = useMemo(
    () => robustAnomalies(leadPoints.map((point) => point.value), settings.anomalyZ),
    [leadPoints, settings.anomalyZ],
  );

  const playing = playback.playing && playback.source === "cosmic" && playback.title === place.name;

  const play = () => {
    if (!series) return;
    const events = eventsFromPower(place.name, series, playSettings);
    if (events.length === 0) {
      onCaption("There is no usable temperature in this NASA POWER window.");
      return;
    }
    void engine.play(events, { source: "cosmic", bpm: playSettings.bpm, title: place.name, onIndex: (index) => {
      const event = events[index];
      if (!event) return;
      onActiveIndex(event.sourceIndex);
      onCaption(event.caption);
    } }).catch((caught: Error) => {
      onCaption(caught.message);
    });
  };

  useEffect(() => {
    if (requestPlay > 0) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestPlay]);

  const finite = leadPoints.map((point) => point.value).filter((value): value is number => value !== null);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const leadUnit = powerUnit(series, leadName);
  const flaggedCount = anomalies.filter((point) => point.flagged).length;
  const ROLES: Record<string, string> = {
    T2M: "named in the caption",
    PRECTOTCORR: "noise",
    WS10M: "filter",
    WS2M: "filter",
    ALLSKY_SFC_SW_DWN: "loudness",
    RH2M: "a fifth above",
    PS: "tonal modulation",
    CLOUD_AMT: "sound density",
  };
  const strips = series
    ? (Object.keys(PARAMETERS) as (keyof typeof PARAMETERS)[])
        .filter((name) => name !== leadName && series.parameters[name])
        .map((name) => ({
          name: PARAMETERS[name].label,
          unit: powerUnit(series, name),
          role: ROLES[name],
          points: series.parameters[name],
          lead: false,
        }))
    : [];
  const activePoint = activeIndex !== null ? leadPoints[activeIndex] : null;
  const activeZ = activeIndex !== null ? anomalies[activeIndex]?.z : null;

  const choosePlace = useCallback((next: Place) => {
    setPlace(next);
    setLat(next.lat);
    setLon(next.lon);
  }, []);

  const pick = useCallback((nextLat: number, nextLon: number) => {
    setPlace({
      name: "Selected point",
      lat: nextLat,
      lon: nextLon,
      why: "Chosen on the globe.",
    });
    setLat(nextLat);
    setLon(nextLon);
  }, []);


  const anomalyExplorer = series ? (
    <AnomalyExplorer start={series.start} end={series.end} threshold={settings.anomalyZ} engine={engine} onCaption={onCaption} onOpen={choosePlace} />
  ) : null;

  return (
    <div className="workspace workspace-cosmic">
      <aside className="rail observatory" aria-label="Globe and places">
        <div className="rail-head rail-head-flush">
          <span className="label">Observatory</span>
          <span className="label">Arrows rotate</span>
        </div>
        <div className="globe-slot">
          <Globe
            marker={{ lat, lon }}
            onPick={pick}
            reducedMotion={reducedMotion}
            hand={hand}
            onHand={(sample) => {
              if (!sample) {
                engine.releaseTouch();
                return;
              }
              const { note, caption } = blueMarbleTouch(sample, playSettings);
              onCaption(caption);
              if (note) void engine.ensure().then(() => engine.touch(note));
            }}
          />
        </div>
        <form className="fields" onSubmit={(event) => { void search(event); }} aria-label="Search for a place">
          <label className="field field-grow">
            <span className="label">Find a place · Open-Meteo</span>
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} minLength={2} maxLength={100} placeholder="City or region" />
          </label>
          <button className="btn btn-ghost" type="submit" disabled={searching || searchText.trim().length < 2} aria-label="Search places">
            <Search size={15} aria-hidden="true" /> {searching ? "Searching" : "Find"}
          </button>
        </form>
        {searchError && <p className="error" role="status">{searchError}</p>}
        {searchResults.length > 0 && (
          <ul className="stations" aria-label="Place search results">
            {searchResults.map((result) => (
              <li key={`${result.latitude},${result.longitude}`}>
                <button className="station" type="button" onClick={() => chooseSearchResult(result)}>
                  <span className="station-name">{result.name}</span>
                  <span className="mono">{formatLatLon(result.latitude, result.longitude)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="hand-switch" aria-pressed={hand} onClick={() => { setHand((value) => !value); engine.releaseTouch(); }}>
          <span>
            <Hand size={16} aria-hidden="true" strokeWidth={1.75} />
            {hand ? "Hand is on: drag to play" : "Drag the globe to play it"}
          </span>
          <span className="toggle" aria-hidden="true" />
        </button>
        <ul className="stations" aria-label="Places">
          {PLACES.map((item) => (
            <li key={item.name}>
              <button
                className="station"
                aria-pressed={item.name === place.name}
                onClick={() => choosePlace(item)}
              >
                <span className="station-name">{item.name}</span>
                <span className="mono">
                  {formatLatLon(item.lat, item.lon)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="deck" aria-label="NASA POWER at this point">
        <header>
          <p className="meta-row">
            <span><span className="label">Source</span><b>NASA POWER daily</b></span>
            <span><span className="label">Model</span><b>MERRA-2</b></span>
            <span><span className="label">Lead</span><b>{PARAMETERS[leadName].label.toLowerCase()}</b></span>
          </p>
          <h2 className="deck-title">{place.name}</h2>
          <p className="place-coords">
            {formatLatLon(lat, lon)}
          </p>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => { void copyShareLink(); }}>
            <Share2 size={14} aria-hidden="true" /> {shareCopied ? "Link copied" : "Copy sound link"}
          </button>
        </header>
        <p className="reading">{place.why}</p>
        <form
          className="fields"
          onSubmit={(event) => {
            event.preventDefault();
            void load(lat, lon, start, end);
          }}
        >
          <label className="field">
            <span className="label">From</span>
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">Sound lead</span>
            <select value={leadChoice} onChange={(event) => setLeadChoice(event.target.value as typeof leadChoice)}>
              {(Object.keys(PARAMETERS) as (keyof typeof PARAMETERS)[]).map((key) => <option key={key} value={key}>{PARAMETERS[key].label}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="label">To</span>
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <button className="btn btn-ghost" type="submit">
            Load NASA days
          </button>
        </form>
        <Wait active={loading} label="Asking NASA POWER." slow="Still waiting on NASA POWER. If this stays blank, the service did not answer. No stand-in series will be played." />
        {error && (
          <>
            <p className="error">{error}</p>
            <button className="btn btn-primary btn-small" type="button" onClick={() => setAttempt((value) => value + 1)}>Try NASA POWER again</button>
          </>
        )}
        {series && (
          <>
            {focus === "global-anomalies" && anomalyExplorer}
            {series.messages.length > 0 && <p className="warn">{series.messages.join(" ")}</p>}
            <div className="transport">
              <button
                className="play"
                aria-pressed={playing}
                onClick={playing ? () => engine.pause() : play}
              >
                <span className="play-disc">
                  {playing ? <Pause size={18} aria-hidden="true" fill="currentColor" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
                </span>
                {playing ? "Pause" : "Play this place"}
              </button>
            </div>
            <dl className="readouts">
              <div>
                <dt className="label">Day</dt>
                <dd>{activePoint ? formatDay(activePoint.date) : "—"}</dd>
              </div>
              <div>
                <dt className="label">{PARAMETERS[leadName].label}</dt>
                <dd>
                  {activePoint ? (activePoint.value === null ? "missing" : activePoint.value.toFixed(1)) : "—"}
                  <small>{leadUnit}</small>
                </dd>
              </div>
              <div>
                <dt className="label">Robust z</dt>
                <dd className={activeIndex !== null && anomalies[activeIndex]?.flagged ? "hot" : undefined}>
                  {activeZ === null || activeZ === undefined ? "—" : activeZ.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="label">Window</dt>
                <dd>
                  {finite.length}
                  <small>days · {flaggedCount} flagged</small>
                </dd>
              </div>
            </dl>
            <PowerChart
              label={PARAMETERS[leadName].label}
              unit={leadUnit}
              points={leadPoints}
              flagged={anomalies.map((point) => point.flagged)}
              activeIndex={activeIndex}
              strips={strips}
            />
            <p className="muted tiny">
              {PARAMETERS[leadName].label} {min.toFixed(1)}–{max.toFixed(1)} {leadUnit}.{" "}
              {flaggedCount === 0
                ? `No day in this window crosses |z| ${settings.anomalyZ}.`
                : `${flaggedCount} ${flaggedCount === 1 ? "day crosses" : "days cross"} |z| ${settings.anomalyZ} and ${flaggedCount === 1 ? "is" : "are"} ringed in amber.`}{" "}
              Pitch uses the 5th–95th percentile of this window. Rain adds noise, wind opens the filter, humidity adds a fifth.
            </p>
            <div className="columns">
              <div>
                <details>
                  <summary>Days and anomalies, in words</summary>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Day</th>
                          <th>{PARAMETERS[leadName].label}</th>
                          <th>Robust z</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leadPoints.map((point, index) => (
                          <tr key={point.date} className={[anomalies[index]?.flagged ? "flagged" : "", index === activeIndex ? "sounding" : ""].filter(Boolean).join(" ") || undefined}>
                            <td>{formatDay(point.date)}</td>
                            <td>{point.value === null ? "missing" : `${point.value.toFixed(1)} ${leadUnit}`}</td>
                            <td>
                              {anomalies[index]?.z === null || anomalies[index]?.z === undefined
                                ? "—"
                                : `${anomalies[index].z!.toFixed(1)}${anomalies[index].flagged ? " anomaly" : ""}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <p className="muted tiny">
                  {series.source}. {series.header_title}. Fill value {series.fill_value} is treated as missing.
                </p>
              </div>
              <div>
                <SoundMap
                  rows={[
                    { from: `${PARAMETERS[leadName].label} of this NASA POWER window`, hears: "Pitch. The chart marker is the day you hear." },
                    { from: "Rain", hears: "Noise, louder on wetter days" },
                    { from: "Wind", hears: "Filter opening" },
                    { from: "Sunlight", hears: "Loudness" },
                    { from: "Humidity", hears: "A fifth above the lead note" },
                    { from: "Blue Marble pixel under your hand", hears: "A live pitch from that pixel's brightness" },
                  ]}
                />
              </div>
            </div>
            <DailyAnomalies series={series} place={place.name} />
            <HistoryPanel
              key={`${series.latitude},${series.longitude}`}
              place={{ name: place.name, lat: series.latitude, lon: series.longitude }}
              engine={engine}
              onCaption={onCaption}
              source="cosmic"
              initialFrom={HISTORY_FIRST_YEAR}
              initialTo={LAST_FULL_YEAR}
              initialResolution="year"
              heading={`History of ${place.name}`}
            />
            <RegionalComparison primary={series} primaryName={place.name} settings={playSettings} engine={engine} onCaption={onCaption} />
            {focus !== "global-anomalies" && anomalyExplorer}
          </>
        )}
      </section>
    </div>
  );
}
