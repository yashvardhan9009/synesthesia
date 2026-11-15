import { useState, type FormEvent } from "react";
import { Pause, Play } from "lucide-react";
import { fetchPower, geocode, type GeocodeResult } from "../api.ts";
import { eventsFromPower } from "../audio/build.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { DEFAULT_CONFIG } from "../audio/labConfig.ts";
import { POWER_VARIABLES } from "../audio/mappings.ts";
import { buildSoundscape } from "../audio/soundscape.ts";
import { Problem, Wait } from "../components/Guide.tsx";
import { formatMeasure, powerUnit } from "../format.ts";
import { PARAMETERS, PLACES, type Place, type PowerSeries, type SonicSettings } from "../types.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { useRemote } from "../useRemote.ts";
import { ComparisonChart } from "./ComparisonChart.tsx";
import { mapCoordinates } from "./mapCoordinates.ts";

type Props = {
  primary: PowerSeries;
  primaryName: string;
  settings: SonicSettings;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
};

const SOURCE = "cosmic";

function mean(series: PowerSeries, parameter: string): number | null {
  const values = (series.parameters[parameter] ?? [])
    .map((point) => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Regional Sound Battle: a second place over the same days. Either place can be
 * heard alone, or both at once as two Scientific Mode soundscapes, the selected
 * place on the left and the challenger on the right.
 */
export function RegionalComparison({ primary, primaryName, settings, engine, onCaption }: Props) {
  const options = PLACES.filter((place) => place.name !== primaryName);
  const [place, setPlace] = useState<Place>(options[0] ?? PLACES[1]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [mapLat, setMapLat] = useState(0);
  const [mapLon, setMapLon] = useState(0);
  const { start, end } = primary;
  const remote = useRemote(`${place.lat}|${place.lon}|${start}|${end}`, (signal) =>
    fetchPower({ lat: place.lat, lon: place.lon, start, end }, signal),
  );
  const secondary = remote.data;
  const state = useEngineState(engine);
  const bothTitle = `${primaryName} and ${place.name}`;
  const sounding = (title: string) => state.playing && state.source === SOURCE && state.title === title;

  const listen = (name: string, series: PowerSeries) => {
    const events = eventsFromPower(name, series, settings);
    if (!events.length) {
      onCaption(`${name} has no usable ${PARAMETERS[settings.lead].label.toLowerCase()} values for this range.`);
      return;
    }
    void engine
      .play(events, { source: SOURCE, bpm: settings.bpm, title: name, threshold: settings.anomalyZ, onIndex: (index) => onCaption(events[index].caption) })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const listenBoth = () => {
    if (!secondary) return;
    const config = { ...DEFAULT_CONFIG, bpm: settings.bpm };
    const left = buildSoundscape(primary, config, primaryName);
    const right = buildSoundscape(secondary, config, place.name);
    void engine
      .playPair(left, right, {
        source: SOURCE,
        title: bothTitle,
        onStep: (a, b) => onCaption(`Left: ${a?.caption ?? "no day"} Right: ${b?.caption ?? "no day"}`),
      })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const toggle = (title: string, start: () => void) => () => (sounding(title) ? engine.pause() : start());

  const searchPlace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const found = await geocode(query);
      setResults(found);
      if (found.length === 0) setSearchError("No matching place was returned by Open-Meteo.");
    } catch (caught) {
      setResults([]);
      setSearchError(caught instanceof Error ? caught.message : "Place search failed.");
    } finally {
      setSearching(false);
    }
  };

  const choose = (next: Place) => {
    engine.stop(SOURCE);
    setPlace(next);
    setResults([]);
  };

  const pickMap = (clientX: number, clientY: number, bounds: DOMRect) => {
    const point = mapCoordinates(clientX, clientY, bounds);
    setMapLat(point.lat);
    setMapLon(point.lon);
  };

  const chooseMapPoint = () => choose({
    name: `Selected point (${mapLat.toFixed(2)}°, ${mapLon.toFixed(2)}°)`, lat: mapLat, lon: mapLon,
    why: "Coordinates selected on the Regional Sound Battle map; environmental values come from NASA POWER.",
  });

  return (
    <section className="chart-figure battle" aria-label="Regional Sound Battle">
      <div className="section-label">
        <span className="label">Regional Sound Battle</span>
        <span className="mono tiny">NASA POWER · same days, two places</span>
      </div>
      <label className="field field-narrow">
        <span className="label">Challenger</span>
        <select
          value={options.some((option) => option.name === place.name) ? place.name : "custom"}
          onChange={(event) => {
            const next = options.find((candidate) => candidate.name === event.target.value);
            if (next) choose(next);
          }}
        >
          {(!options.some((option) => option.name === place.name)) && <option value="custom">{place.name}</option>}
          {options.map((option) => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <form className="fields battle-search" onSubmit={(event) => { void searchPlace(event); }} aria-label="Search for a challenger location">
        <label className="field field-grow">
          <span className="label">Search any challenger · Open-Meteo</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={100} placeholder="City or region" />
        </label>
        <button className="btn btn-ghost" type="submit" disabled={searching || query.trim().length < 2}>{searching ? "Searching" : "Find"}</button>
      </form>
      {searchError && <p className="warn" role="status">{searchError}</p>}
      {results.length > 0 && <ul className="battle-search-results" aria-label="Place search results">
        {results.map((result) => <li key={`${result.latitude}-${result.longitude}`}><button className="link-button" onClick={() => choose({ name: result.name, lat: result.latitude, lon: result.longitude, why: "Resolved by Open-Meteo Geocoding; environmental values come from NASA POWER." })}>{result.name} · {result.latitude.toFixed(2)}°, {result.longitude.toFixed(2)}°</button></li>)}
      </ul>}
      <div className="battle-map-pick">
        <span className="label">Or click the map to place the challenger</span>
        <svg viewBox="0 0 720 240" role="application" tabIndex={0} aria-label={`World coordinate picker. Current point ${mapLat.toFixed(1)} degrees latitude, ${mapLon.toFixed(1)} degrees longitude. Click to set, then use Choose point.`}
          onClick={(event) => pickMap(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 15 : 5;
            if (event.key === "ArrowLeft") setMapLon((value) => Math.max(-180, value - step));
            else if (event.key === "ArrowRight") setMapLon((value) => Math.min(180, value + step));
            else if (event.key === "ArrowUp") setMapLat((value) => Math.min(90, value + step));
            else if (event.key === "ArrowDown") setMapLat((value) => Math.max(-90, value - step));
            else if (event.key === "Enter") chooseMapPoint();
            else return;
            event.preventDefault();
          }}>
          <rect x="0" y="0" width="720" height="240" rx="8" />
          <image href="/api/gibs/bluemarble" x="0" y="0" width="720" height="240" preserveAspectRatio="none" opacity="0.55" aria-hidden="true" />
          {[0, 1, 2, 3, 4, 5, 6].map((row) => <line key={`lat-${row}`} x1="0" x2="720" y1={row * 40} y2={row * 40} />)}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((column) => <line key={`lon-${column}`} y1="0" y2="240" x1={column * 90} x2={column * 90} />)}
          <circle cx={((mapLon + 180) / 360) * 720} cy={((90 - mapLat) / 180) * 240} r="6" />
          <rect className="battle-map-hit" x="0" y="0" width="720" height="240" rx="8" />
        </svg>
        <div className="fields battle-map-controls">
          <span className="mono tiny">{mapLat.toFixed(1)}° lat · {mapLon.toFixed(1)}° lon</span>
          <button className="btn btn-ghost btn-small" onClick={chooseMapPoint}>Choose point</button>
        </div>
      </div>
      <div className="transport transport-compact">
        <button className="btn btn-ghost btn-small" aria-pressed={sounding(primaryName)} onClick={toggle(primaryName, () => listen(primaryName, primary))}>
          {sounding(primaryName) ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Hear {primaryName}
        </button>
        <button
          className="btn btn-ghost btn-small"
          disabled={!secondary}
          aria-pressed={sounding(place.name)}
          onClick={toggle(place.name, () => secondary && listen(place.name, secondary))}
        >
          {sounding(place.name) ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Hear {place.name}
        </button>
        <button
          className="btn btn-primary btn-small"
          disabled={!secondary}
          aria-pressed={sounding(bothTitle)}
          onClick={toggle(bothTitle, listenBoth)}
          title={`${primaryName} on the left, ${place.name} on the right`}
        >
          {sounding(bothTitle) ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} Hear both · L / R
        </button>
      </div>
      <Wait active={remote.loading} label={`Loading ${place.name} from NASA POWER.`} slow="The challenger is taking longer than usual to arrive from NASA POWER." />
      {remote.error && <Problem message={remote.error} source="NASA POWER" onRetry={remote.retry} />}
      {secondary && (
        <>
          <ComparisonChart
            earlier={primary}
            later={secondary}
            parameter="T2M"
            label={PARAMETERS.T2M.label}
            unit={powerUnit(primary, "T2M")}
            names={[primaryName, place.name]}
          />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>NASA POWER daily mean</th>
                  <th>{primaryName}</th>
                  <th>{place.name}</th>
                </tr>
              </thead>
              <tbody>
                {POWER_VARIABLES.map((parameter) => (
                  <tr key={parameter}>
                    <th scope="row">{PARAMETERS[parameter].label}</th>
                    <td>{formatMeasure(mean(primary, parameter), powerUnit(primary, parameter))}</td>
                    <td>{formatMeasure(mean(secondary, parameter), powerUnit(secondary, parameter))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="muted tiny">
        Means use only the days POWER delivered; a variable with no delivered day reads “missing”. Both places together play
        in Scientific Mode, so the same temperature is the same note on either side.
      </p>
    </section>
  );
}
