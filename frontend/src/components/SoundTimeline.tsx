import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { geocode, type GeocodeResult } from "../api.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { formatLatLon } from "../format.ts";
import { HistoryPanel, type HistoryPlace } from "../history/HistoryPanel.tsx";
import { PLACES } from "../types.ts";

type Props = { engine: SonificationEngine; onCaption: (caption: string) => void };

/** Last complete year in POWER's monthly record (the current year is still filling in). */
const LAST_FULL_YEAR = new Date().getFullYear() - 1;

/**
 * Environmental Sound Timeline: pick a place and a span of years, and hear how
 * its NASA POWER record departs from the 2001–2020 normal, step by step.
 */
export function SoundTimeline({ engine, onCaption }: Props) {
  const [place, setPlace] = useState<HistoryPlace>(PLACES[0]);
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const choose = (next: HistoryPlace) => {
    engine.stop("timeline");
    setPlace(next);
    onCaption(`Sound Timeline: ${next.name}, ${formatLatLon(next.lat, next.lon)}.`);
  };

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const found = await geocode(searchText);
      setResults(found);
      if (found.length === 0) setSearchError("No place by that name. Try a larger town or a region.");
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : "Place search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="deck" aria-label="Environmental Sound Timeline">
      <header>
        <p className="meta-row">
          <span><span className="label">Source</span><b>NASA POWER monthly and daily</b></span>
          <span><span className="label">Place</span><b>{place.name}</b></span>
        </p>
        <h2 className="deck-title">Environmental Sound Timeline</h2>
        <p className="reading reading-spaced">
          Choose a place and a span of years. Each month, season or year becomes one note: its pitch is how far the
          temperature sat from the {`2001–2020`} normal for that time of year, so a warming record climbs. Rain, wind,
          humidity and cloud colour the note, and a bell rings when a variable is unusual against its normal. Every
          note opens its trace in the dock. Nothing is filled in when NASA POWER has no value.
        </p>
      </header>
      <div className="chips" role="group" aria-label="Place">
        {PLACES.map((item) => (
          <button key={item.name} className="chip" aria-pressed={item.name === place.name} onClick={() => choose(item)}>
            {item.name}
          </button>
        ))}
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
      {results.length > 0 && (
        <ul className="stations" aria-label="Place search results">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude}`}>
              <button className="station" type="button" onClick={() => choose({ name: result.name, lat: result.latitude, lon: result.longitude })}>
                <span className="station-name">{result.name}</span>
                <span className="mono">{formatLatLon(result.latitude, result.longitude)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <HistoryPanel
        key={`${place.lat},${place.lon}`}
        place={place}
        engine={engine}
        onCaption={onCaption}
        source="timeline"
        initialFrom={LAST_FULL_YEAR - 9}
        initialTo={LAST_FULL_YEAR}
        initialResolution="month"
        heading={`${place.name}, year by year`}
      />
    </section>
  );
}
