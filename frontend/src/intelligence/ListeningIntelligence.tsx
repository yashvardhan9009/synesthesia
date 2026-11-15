import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Pause, Play, Search } from "lucide-react";
import { geocode, type GeocodeResult } from "../api.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { MAPPINGS } from "../audio/mappings.ts";
import { Problem, SoundMap } from "../components/Guide.tsx";
import { useEngineState } from "../ui/audioBus.ts";
import { useRemote } from "../useRemote.ts";
import {
  DRY_NORMAL_MM,
  MIN_RUN,
  NORMAL_PERIOD,
  RUN_Z,
  UNUSUAL_Z,
  WORDS,
  analyseRegion,
  buildFindings,
  signed,
  spatialDepartures,
  summarize,
  type Finding,
  type FindingKind,
  type PointDeparture,
  type RegionAnalysis,
} from "./analysis.ts";
import { BACKGROUND_LABEL, GENERIC_BACKGROUND, REGION_BACKGROUND } from "./background.ts";
import { LISTEN_BPM, buildListenScape, clock, findingStep, findingsAtStep, listenSpans, stepTime, type ListenScape } from "./listenScape.ts";
import { LoadProgress } from "./LoadProgress.tsx";
import { loadRegion, type RegionData, type RegionProgress } from "./regionApi.ts";
import { boxAround, formatCoord, mapToLatLon, regionFromLink, regionLink } from "./regionPick.ts";
import { PRESET_REGIONS, type RegionBox } from "./regions.ts";

type Props = {
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
  /** Start the soundscape as soon as it is ready (the landing button unlocked audio inside its click). */
  autoPlay?: boolean;
  onAutoPlayed?: () => void;
};

const SOURCE = "listen";
const KIND_LABEL: Record<FindingKind, string> = {
  temperature: "Unusual temperature",
  rain: "Rainfall change",
  wind: "Unusual wind",
  humidity: "Humidity",
  trend: "Historical trend",
  record: "Historical record",
  spatial: "Across the box",
};

/**
 * Earth Listening Intelligence. Pick a region; its NASA POWER monthly record,
 * sampled on a grid and area-averaged, becomes a soundscape, and the
 * measurements are searched for unusual temperature, rainfall changes, unusual
 * wind and historical deviations. Each finding is a templated sentence from
 * computed numbers, linked to its data and to the moment it can be heard.
 */
export function ListeningIntelligence({ engine, onCaption, autoPlay = false, onAutoPlayed }: Props) {
  const [region, setRegion] = useState<RegionBox>(() => regionFromLink(window.location.hash));
  const [progress, setProgress] = useState<RegionProgress | null>(null);
  const [spanId, setSpanId] = useState("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const playback = useEngineState(engine);

  const remote = useRemote(region.id, (signal) => {
    setProgress(null);
    return loadRegion(region, setProgress, signal);
  });
  const data = remote.data;
  const analysis = useMemo(() => (data ? analyseRegion(data) : null), [data]);
  const firstYear = data ? Number(data.months[0]?.slice(0, 4)) : null;
  const lastYear = data ? Number(data.months[data.months.length - 1]?.slice(0, 4)) : null;
  const spans = useMemo(() => (firstYear && lastYear ? listenSpans(firstYear, lastYear) : []), [firstYear, lastYear]);
  const span = spans.find((item) => item.id === spanId) ?? spans[0] ?? null;
  const listen = useMemo(() => (data && analysis && span ? buildListenScape(region.name, data, analysis, span) : null), [data, analysis, span, region.name]);
  const findings = useMemo(() => (data && analysis && span ? buildFindings(data, analysis, { focus: [span.from, span.to] }) : []), [data, analysis, span]);
  const summary = useMemo(() => (data ? summarize(region.name, data, findings) : null), [data, findings, region.name]);

  const mine = !!listen && playback.source === SOURCE && playback.title === listen.scape.title;
  const step = mine ? playback.index : null;
  const current = useMemo(() => (listen && step !== null ? findingsAtStep(listen, findings, step) : []), [listen, findings, step]);
  const currentIds = new Set(current.map((item) => item.id));
  const focusFinding = (mine && current[0]) || findings.find((item) => item.id === selected) || findings[0] || null;

  const choose = (next: RegionBox) => {
    engine.stop(SOURCE);
    setRegion(next);
    setSpanId("recent");
    setSelected(null);
    window.history.replaceState(null, "", regionLink(next));
    onCaption(`Earth Listening Intelligence: ${next.name}. Loading its NASA POWER grid.`);
  };

  const play = (startAt: number) => {
    if (!listen) return;
    if (mine && playback.status !== "idle") {
      engine.seek(startAt);
      if (!playback.playing) void engine.resume();
      return;
    }
    void engine
      .playSoundscape(listen.scape, { source: SOURCE, title: listen.scape.title, startAt, onStep: (item) => onCaption(item.caption) })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const hear = (finding: Finding) => {
    if (!listen) return;
    setSelected(finding.id);
    const at = findingStep(listen, finding);
    if (at !== null) play(at);
  };

  // After switching span from a finding outside it, start once the new piece is built.
  useEffect(() => {
    if (pendingStart === null || !listen) return;
    play(pendingStart);
    setPendingStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen]);

  // Arriving from the landing button: play once the region's piece is built.
  useEffect(() => {
    if (!autoPlay || !listen) return;
    onAutoPlayed?.();
    play(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, listen]);

  const toggle = () => {
    if (mine && playback.playing) engine.pause();
    else if (mine && playback.status === "paused") void engine.resume();
    else play(0);
  };

  const rate = playback.rate || 1;
  const duration = listen ? stepTime(listen.scape.steps.length, LISTEN_BPM, rate) : 0;
  const live = mine && playback.playing && current[0] ? `Now sounding: ${current[0].sentence}` : "";

  return (
    <section className="deck listen" aria-label="Earth Listening Intelligence">
      <div className="listen-top">
        <div className="listen-intro">
          <p className="meta-row">
            <span><span className="label">Source</span><b>NASA POWER monthly, MERRA-2</b></span>
            <span><span className="label">Normal</span><b>{NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}</b></span>
          </p>
          <h2 className="deck-title">Earth Listening Intelligence</h2>
          <p className="reading reading-spaced">
            Choose a region. Its NASA POWER record is sampled on a grid, averaged over the area and played one note per
            month: higher is warmer than that month's {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]} normal, and a bell rings when
            a variable is unusual. Alongside the sound, the measurements are searched for unusual temperature, rainfall
            changes, unusual wind and historical deviations. Each sentence is filled in from computed numbers.
          </p>
          <div className="chips listen-presets" role="group" aria-label="Preset regions">
            {PRESET_REGIONS.map((item) => (
              <button key={item.id} type="button" className="chip" aria-pressed={item.id === region.id} onClick={() => choose(item)}>
                {item.name}
              </button>
            ))}
          </div>
          <PlaceSearch onChoose={choose} />
        </div>
        <RegionMap region={region} data={data} finding={focusFinding} onChoose={choose} />
      </div>

      <div className="listen-region-line">
        <span className="label">Region</span>
        <b className="mono">{region.name}</b>
        <span className="mono tiny muted">
          {formatCoord(region.south, "N", "S")} to {formatCoord(region.north, "N", "S")}, {formatCoord(region.west, "E", "W")} to {formatCoord(region.east, "E", "W")}
        </span>
        <span className="tiny muted">{region.blurb}</span>
      </div>

      {remote.loading && <LoadProgress progress={progress} />}
      {remote.error && <Problem message={remote.error} source="NASA POWER" onRetry={remote.retry} />}

      {data && analysis && listen && span && summary && (
        <>
          <div className="listen-player">
            <button className="play" aria-pressed={mine && playback.playing} onClick={toggle}>
              <span className="play-disc">{mine && playback.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</span>
              <span>
                {mine && playback.playing ? "Pause" : mine && playback.status === "paused" ? "Resume" : `Hear ${region.name}`}
                <span className="mono tiny muted listen-duration"> · {listen.scape.steps.length} notes · {clock(duration)}</span>
              </span>
            </button>
            <div className="chips" role="group" aria-label="What to play">
              {spans.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip"
                  aria-pressed={item.id === span.id}
                  onClick={() => {
                    if (mine) engine.stopAll();
                    setSpanId(item.id);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="listen-now mono tiny" aria-hidden="true">
              {mine && step !== null ? (
                <>
                  <b>{listen.scape.steps[step]?.label}</b> · {clock(stepTime(step, LISTEN_BPM, rate))} / {clock(duration)}
                  {current[0] ? <> · finding {findings.indexOf(current[0]) + 1}</> : null}
                </>
              ) : (
                <>No change from normal is {listen.referenceNote}; ±{listen.fullScale} °C reaches the ends of the range.</>
              )}
            </p>
          </div>
          <p className="sr-only" aria-live="polite">{live}</p>

          <section className="listen-summary" aria-labelledby="listen-summary-title">
            <h3 id="listen-summary-title" className="label">What the measurements say · {span.from}–{span.to}</h3>
            <p className="listen-lead">{summary.lead}</p>
            <ul>
              {summary.points.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </section>

          <RegionStrip listen={listen} analysis={analysis} findings={findings} step={step} onPick={play} />

          <section aria-labelledby="listen-findings-title" className="listen-findings">
            <h3 id="listen-findings-title" className="section-label label">Findings, ranked · {findings.length}</h3>
            {findings.length === 0 && <p className="muted">No month in {span.from}–{span.to} departs from its normal by {UNUSUAL_Z} or more robust standard deviations, and no trend or record falls in this span.</p>}
            <ol className="finding-list">
              {findings.map((finding, rank) => (
                <FindingItem
                  key={finding.id}
                  finding={finding}
                  rank={rank + 1}
                  data={data}
                  listen={listen}
                  rate={rate}
                  current={currentIds.has(finding.id)}
                  onHear={() => hear(finding)}
                  onSelect={() => setSelected(finding.id)}
                  onFull={() => {
                    const full = spans.find((item) => item.id === "full-month");
                    if (!full) return;
                    if (mine) engine.stopAll();
                    setSpanId(full.id);
                    setPendingStart(finding.span.from - data.months.findIndex((key) => Number(key.slice(0, 4)) >= full.from));
                  }}
                />
              ))}
            </ol>
          </section>

          <div className="columns listen-notes">
            <div>
              <SoundMap
                rows={[
                  { from: `Area-mean temperature minus its ${NORMAL_PERIOD[0]}–${NORMAL_PERIOD[1]} normal for the calendar month`, hears: `Pitch: no change is ${listen.referenceNote}; ±${listen.fullScale} °C (95th percentile of this region's departures) reaches the ends` },
                  { from: "Rain, area-mean monthly mm/day", hears: "Percussion hits (the soundscape's fixed rule)" },
                  { from: "Wind at 2 m", hears: "Loudness and brightness" },
                  { from: "Relative humidity", hears: "Noise texture" },
                  { from: `A variable with |robust z| ≥ ${UNUSUAL_Z} against its normal`, hears: "Its bell (temperature, rain, wind, humidity each have a pitch)" },
                ]}
              />
              <p className="tiny muted">
                {span.resolution === "season" ? "By season: each note averages three months; its bell uses the most unusual month inside it. " : ""}
                {listen.scape.steps.length} notes at {LISTEN_BPM} per minute. Every note opens its trace in the dock.
              </p>
            </div>
            <div className="listen-limits">
              <h3 className="label">Honest limits</h3>
              <ul className="tiny">
                <li>NASA POWER here is MERRA-2 reanalysis: a model constrained by observations, not a direct measurement at each point.</li>
                <li>The region is {data.points.length} grid point{data.points.length === 1 ? "" : "s"} ({describeGrid(data)}), not every cell of the box. Each point is a POWER cell value (about 0.5° × 0.625°).</li>
                {data.failed.length > 0 && <li className="warn">{data.failed.length} of {data.requested} grid points failed and are left out of the mean: {data.failed.map((item) => `${formatCoord(item.lat, "N", "S")}, ${formatCoord(item.lon, "E", "W")} (${item.error})`).join("; ")}.</li>}
                <li>Monthly resolution: a short event inside one month is averaged away.</li>
                <li>Robust z uses the 20 values of each calendar month in {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}; rain is scored on ln(1 + P), and months whose rain normal is below {DRY_NORMAL_MM} mm/day are not scored. Runs need {MIN_RUN}+ months at |z| ≥ {RUN_Z}.</li>
                <li>Trend p-values treat years as independent; year-to-year persistence can make them look stronger than they are.</li>
                <li>Findings describe what the numbers show. They do not say why.</li>
              </ul>
              <div className="listen-background">
                <h3 className="label">{BACKGROUND_LABEL}</h3>
                <p className="tiny muted">{REGION_BACKGROUND[region.id] ?? GENERIC_BACKGROUND}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function describeGrid(data: RegionData): string {
  const rows = Math.max(0, ...data.points.map((point) => point.row), ...data.failed.map((point) => point.row)) + 1;
  const columns = Math.max(0, ...data.points.map((point) => point.column), ...data.failed.map((point) => point.column)) + 1;
  return `${rows} × ${columns} cell centres, weighted by cos(latitude)`;
}

function PlaceSearch({ onChoose }: { onChoose: (box: RegionBox) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const found = await geocode(text);
      setResults(found);
      if (found.length === 0) setError("No place by that name. Try a larger town or a region.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Place search failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="listen-search">
      <form className="fields" onSubmit={(event) => void submit(event)} aria-label="Search for a place to build a region around">
        <label className="field field-grow">
          <span className="label">Or find a place · a 12° × 16° box around it</span>
          <input value={text} onChange={(event) => setText(event.target.value)} minLength={2} maxLength={100} placeholder="City, country or sea" />
        </label>
        <button className="btn btn-ghost" type="submit" disabled={busy || text.trim().length < 2}>
          <Search size={15} aria-hidden="true" /> {busy ? "Searching" : "Find"}
        </button>
      </form>
      {error && <p className="warn" role="status">{error}</p>}
      {results.length > 0 && (
        <ul className="battle-search-results" aria-label="Place search results">
          {results.map((result) => (
            <li key={`${result.latitude},${result.longitude}`}>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setResults([]);
                  onChoose(boxAround(result.latitude, result.longitude, result.name.split(",")[0]));
                }}
              >
                {result.name} · {formatCoord(result.latitude, "N", "S")}, {formatCoord(result.longitude, "E", "W")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MW = 720;
const MH = 360;
const mx = (lon: number) => ((lon + 180) / 360) * MW;
const my = (lat: number) => ((90 - lat) / 180) * MH;

/** Which month indices a finding covers. */
function spanIndices(finding: Finding): number[] {
  const out: number[] = [];
  for (let i = finding.span.from; i <= finding.span.to; i += 1) out.push(i);
  return out;
}

/** The world map: preset boxes, the chosen box, its grid points coloured by the focused finding; click or keys to choose a box. */
function RegionMap({ region, data, finding, onChoose }: { region: RegionBox; data: RegionData | null; finding: Finding | null; onChoose: (box: RegionBox) => void }) {
  const [cursor, setCursor] = useState({ lat: (region.north + region.south) / 2, lon: (region.east + region.west) / 2 });
  const departures: PointDeparture[] = useMemo(() => {
    if (!data || !finding) return [];
    return finding.spatial ?? spatialDepartures(data, finding.parameter, spanIndices(finding));
  }, [data, finding]);
  const parameter = finding?.parameter ?? "T2M";
  const measure = (item: PointDeparture) => (parameter === "PRECTOTCORR" ? item.pct ?? 0 : item.anomaly);
  const biggest = Math.max(1e-9, ...departures.map((item) => Math.abs(measure(item))));
  const pick = (lat: number, lon: number) => onChoose(boxAround(lat, lon, `Box at ${formatCoord(lat, "N", "S")}, ${formatCoord(lon, "E", "W")}`));

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const by = event.shiftKey ? 15 : 5;
    if (event.key === "ArrowLeft") setCursor((c) => ({ ...c, lon: Math.max(-180, c.lon - by) }));
    else if (event.key === "ArrowRight") setCursor((c) => ({ ...c, lon: Math.min(180, c.lon + by) }));
    else if (event.key === "ArrowUp") setCursor((c) => ({ ...c, lat: Math.min(84, c.lat + by) }));
    else if (event.key === "ArrowDown") setCursor((c) => ({ ...c, lat: Math.max(-84, c.lat - by) }));
    else if (event.key === "Enter" || event.key === " ") pick(cursor.lat, cursor.lon);
    else return;
    event.preventDefault();
  };

  const w = WORDS[parameter];
  return (
    <figure className="listen-map">
      <svg
        viewBox={`0 0 ${MW} ${MH}`}
        role="application"
        tabIndex={0}
        aria-label={`World map. Chosen region: ${region.name}. Arrow keys move the cross to ${cursor.lat.toFixed(0)} degrees latitude, ${cursor.lon.toFixed(0)} degrees longitude; Enter builds a region there. Click anywhere to build one.`}
        onKeyDown={onKey}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const { lat, lon } = mapToLatLon((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
          setCursor({ lat, lon });
          pick(Math.max(-84, Math.min(84, lat)), lon);
        }}
      >
        <rect className="listen-map-sea" x={0} y={0} width={MW} height={MH} />
        <image href="/api/gibs/bluemarble" x={0} y={0} width={MW} height={MH} preserveAspectRatio="none" aria-hidden="true" />
        {PRESET_REGIONS.map((item) => (
          <rect key={item.id} className="listen-map-preset" x={mx(item.west)} y={my(item.north)} width={mx(item.east) - mx(item.west)} height={my(item.south) - my(item.north)} />
        ))}
        <rect className="listen-map-box" x={mx(region.west)} y={my(region.north)} width={mx(region.east) - mx(region.west)} height={my(region.south) - my(region.north)} />
        {data?.points.map((point) => {
          const found = departures.find((item) => item.point === point);
          const value = found ? measure(found) : null;
          const above = value !== null && value >= 0;
          const tone = value === null ? "none" : parameter === "PRECTOTCORR" ? (above ? "cool" : "warm") : above ? "warm" : "cool";
          const r = value === null ? 3 : 3 + 6 * Math.sqrt(Math.abs(value) / biggest);
          return (
            <circle key={`${point.lat},${point.lon}`} className={`listen-map-point ${tone}`} cx={mx(point.lon)} cy={my(point.lat)} r={r}>
              <title>{`${formatCoord(point.lat, "N", "S")}, ${formatCoord(point.lon, "E", "W")}${found ? `: ${parameter === "PRECTOTCORR" && found.pct !== null ? `${signed(found.pct, 0)}%` : `${signed(found.anomaly, w.digits)} ${w.unit}`}` : ""}`}</title>
            </circle>
          );
        })}
        {data?.failed.map((point) => <circle key={`f${point.lat},${point.lon}`} className="listen-map-failed" cx={mx(point.lon)} cy={my(point.lat)} r={4} />)}
        <g className="listen-map-cursor" aria-hidden="true">
          <line x1={mx(cursor.lon) - 8} x2={mx(cursor.lon) + 8} y1={my(cursor.lat)} y2={my(cursor.lat)} />
          <line x1={mx(cursor.lon)} x2={mx(cursor.lon)} y1={my(cursor.lat) - 8} y2={my(cursor.lat) + 8} />
        </g>
      </svg>
      <figcaption className="tiny muted">
        {finding && departures.length > 0
          ? `Dots: each grid point's ${w.lower} against its own normal for finding ${finding.kind === "trend" ? "period (the whole span)" : "months"}; amber ${parameter === "PRECTOTCORR" ? "drier" : "above"}, cyan ${parameter === "PRECTOTCORR" ? "wetter" : "below"}, size by magnitude.`
          : "Click the map or use the arrow keys and Enter to build a region anywhere."}
      </figcaption>
    </figure>
  );
}

const SW = 960;
const TH = 120;
const RT = TH + 14;
const RH = 44;
const PIN = RT + RH + 18;
const SH = PIN + 16;

/** Temperature departure per note, rain z, and numbered finding pins; click to play from a note. */
function RegionStrip({ listen, analysis, findings, step, onPick }: { listen: ListenScape; analysis: RegionAnalysis; findings: Finding[]; step: number | null; onPick: (step: number) => void }) {
  const lanes = useMemo(
    () =>
      listen.stepIndices.map((indices) => {
        const temps = indices.map((i) => analysis.T2M.months[i]?.anomaly).filter((v): v is number => v !== undefined);
        const rains = indices.map((i) => analysis.PRECTOTCORR.months[i]).filter((m) => m && m.pct !== null && m.z !== null).map((m) => m!.z as number);
        return {
          t: temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : null,
          r: rains.length ? rains.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), rains[0]) : null,
        };
      }),
    [listen, analysis],
  );
  const n = lanes.length;
  const slot = SW / Math.max(1, n);
  const tSpan = Math.max(0.5, ...lanes.map((lane) => Math.abs(lane.t ?? 0)));
  const rSpan = Math.max(2, ...lanes.map((lane) => Math.abs(lane.r ?? 0)));
  const tMid = TH / 2;
  const rMid = RT + RH / 2;
  const bar = Math.max(1, slot * 0.72);
  const pins = findings.map((finding, rank) => ({ finding, rank, at: findingStep(listen, finding) })).filter((pin) => pin.at !== null && pin.finding.kind !== "trend");
  const tick = Math.max(1, Math.ceil(n / 8));
  const bells = listen.scape.steps.map((s) => s.bells.length > 0);
  return (
    <figure className="chart-figure listen-strip">
      <div className="chart-head">
        <span className="label">Temperature vs normal · °C (±{tSpan.toFixed(1)}) · rain vs normal · robust z · numbered findings</span>
        <span className="label">Click to play from a note</span>
      </div>
      <svg
        className="chart delta-chart timeline-chart"
        viewBox={`0 0 ${SW} ${SH + 16}`}
        role="img"
        aria-label={`${n} notes from ${listen.scape.steps[0]?.label} to ${listen.scape.steps[n - 1]?.label}. Upper lane: temperature above normal in amber, below in cyan. Lower lane: rain departure. Numbered pins mark where each finding is heard; the findings list has the same links.`}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const index = Math.floor(((event.clientX - bounds.left) / bounds.width) * n);
          onPick(Math.max(0, Math.min(n - 1, index)));
        }}
      >
        <text className="lane-label" x={4} y={12}>TEMPERATURE</text>
        <text className="lane-label" x={4} y={RT + 10}>RAIN</text>
        <line className="zero" x1={0} x2={SW} y1={tMid} y2={tMid} />
        <line className="grid" x1={0} x2={SW} y1={rMid} y2={rMid} />
        {lanes.map((lane, index) => {
          const x = index * slot + (slot - bar) / 2;
          const now = step === index;
          return (
            <g key={index}>
              {lane.t !== null ? (
                <rect className={["bar", lane.t >= 0 ? "warm" : "cool", bells[index] ? "flag" : "", now ? "now" : ""].join(" ")} x={x} y={lane.t >= 0 ? tMid - Math.max(1, (lane.t / tSpan) * (tMid - 4)) : tMid} width={bar} height={Math.max(1, (Math.abs(lane.t) / tSpan) * (tMid - 4))} />
              ) : (
                <rect className="gap-mark" x={x} y={tMid - 1} width={bar} height={2} />
              )}
              {lane.r !== null && (
                <rect className={["bar", lane.r >= 0 ? "cool" : "warm", now ? "now" : ""].join(" ")} x={x} y={lane.r >= 0 ? rMid - (Math.abs(lane.r) / rSpan) * (RH / 2 - 2) : rMid} width={bar} height={Math.max(1, (Math.abs(lane.r) / rSpan) * (RH / 2 - 2))} />
              )}
            </g>
          );
        })}
        {pins.map((pin) => (
          <g key={pin.finding.id} className="listen-pin">
            <circle cx={(pin.at as number) * slot + slot / 2} cy={PIN} r={8} />
            <text x={(pin.at as number) * slot + slot / 2} y={PIN + 3.5} textAnchor="middle">{pin.rank + 1}</text>
          </g>
        ))}
        {step !== null && <line className="now-line" x1={step * slot + slot / 2} x2={step * slot + slot / 2} y1={0} y2={SH} />}
        {listen.scape.steps.map((s, index) =>
          index % tick === 0 ? (
            <text key={s.date} className="axis-text" x={index * slot + 2} y={SH + 12}>{s.label}</text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}

function FindingItem({ finding, rank, data, listen, rate, current, onHear, onSelect, onFull }: {
  finding: Finding;
  rank: number;
  data: RegionData;
  listen: ListenScape;
  rate: number;
  current: boolean;
  onHear: () => void;
  onSelect: () => void;
  onFull: () => void;
}) {
  const at = findingStep(listen, finding);
  const urls = finding.spatial ? finding.spatial.map((item) => item.point.request_url) : data.request_urls;
  return (
    <li className="finding" data-current={current || undefined} data-kind={finding.kind} aria-current={current ? "true" : undefined}>
      <div className="finding-head">
        <span className="finding-rank mono" aria-hidden="true">{String(rank).padStart(2, "0")}</span>
        <span className="label finding-kind">{KIND_LABEL[finding.kind]} · {MAPPINGS[finding.parameter].name}</span>
        {at !== null ? (
          <button className="btn btn-ghost btn-small finding-hear" onClick={onHear} aria-label={`Hear finding ${rank} from ${clock(stepTime(at, LISTEN_BPM, rate))}`}>
            <Play size={13} aria-hidden="true" /> {finding.kind === "trend" ? "Hear the span" : "Hear it"} · {clock(stepTime(at, LISTEN_BPM, rate))}
          </button>
        ) : (
          <button className="btn btn-ghost btn-small finding-hear" onClick={onFull}>
            <Play size={13} aria-hidden="true" /> Hear it in the full record
          </button>
        )}
      </div>
      <p className="finding-sentence">{finding.sentence}</p>
      <details onToggle={(event) => (event.currentTarget.open ? onSelect() : undefined)}>
        <summary className="tiny">The measurements behind this</summary>
        <p className="tiny muted">How: {finding.method}.</p>
        <div className="table-scroll" tabIndex={0} aria-label={`Evidence for finding ${rank}`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{finding.kind === "spatial" ? "Grid point" : finding.evidenceUnit === "years" ? "Year" : "Month"}</th>
                {finding.kind !== "spatial" && <th>Area mean</th>}
                {finding.kind !== "spatial" && <th>Normal</th>}
                <th>Departure</th>
                {finding.kind !== "spatial" && finding.evidenceUnit === "months" && <th>Robust z</th>}
                {finding.kind !== "spatial" && <th>Rank</th>}
              </tr>
            </thead>
            <tbody>
              {finding.evidence.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {finding.kind !== "spatial" && <td>{row.value}</td>}
                  {finding.kind !== "spatial" && <td>{row.normal}</td>}
                  <td>{row.anomaly}</td>
                  {finding.kind !== "spatial" && finding.evidenceUnit === "months" && <td>{row.z}</td>}
                  {finding.kind !== "spatial" && <td>{row.rank}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted">
          Grid points ({data.points.length}, weight = cos latitude): {data.points.map((point) => `${formatCoord(point.lat, "N", "S")} ${formatCoord(point.lon, "E", "W")} (${point.weight.toFixed(2)})`).join(" · ")}
        </p>
        <details className="finding-urls">
          <summary className="tiny">NASA POWER requests ({urls.length})</summary>
          <ul className="tiny mono">
            {urls.map((url) => (
              <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>
            ))}
          </ul>
        </details>
      </details>
    </li>
  );
}
