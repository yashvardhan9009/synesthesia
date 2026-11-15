import { useMemo, useState } from "react";
import { Eye, Pause, Play } from "lucide-react";
import type { SonificationEngine } from "../audio/engine.ts";
import { Problem } from "../components/Guide.tsx";
import { useEngineState } from "../ui/audioBus.ts";
import { useRemote } from "../useRemote.ts";
import { NORMAL_PERIOD, UNUSUAL_Z, WORDS, analyseRegion, monthLabel, plain, signed, type RegionAnalysis } from "./analysis.ts";
import { BACKGROUND_LABEL, GENERIC_BACKGROUND, REGION_BACKGROUND } from "./background.ts";
import {
  CASE_BPM,
  COMPOUND_Z,
  EXTEND_Z,
  caseHeadline,
  compoundStrength,
  earSentence,
  eventPeriod,
  findCompoundEvent,
  measureSentence,
  referencePeriod,
  referenceSentence,
  windowPeriod,
  type CaseEvent,
} from "./caseAnalysis.ts";
import { buildListenScape, clock, stepTime, type ListenScape } from "./listenScape.ts";
import { LoadProgress } from "./LoadProgress.tsx";
import { REGION_PARAMETERS, loadRegion, type RegionData, type RegionParameter, type RegionProgress } from "./regionApi.ts";
import { formatCoord, regionFromLink, regionLink } from "./regionPick.ts";
import { PRESET_REGIONS, type RegionBox } from "./regions.ts";

type Props = { engine: SonificationEngine; onCaption: (caption: string) => void };

const SOURCE = "case";
/** The story region: of the four presets, the one whose record shows the clearest compound event (see docs/ENGINEERING.md). */
const CASE_DEFAULT_REGION = "amazon";
/** Chart order: the four measurements a reader would otherwise line up. */
const CHART_ORDER: readonly RegionParameter[] = ["T2M", "PRECTOTCORR", "RH2M", "WS2M"];
const SOUND_OF: Record<RegionParameter, string> = {
  T2M: "Pitch: higher is warmer than that month's normal",
  PRECTOTCORR: "Percussion: more hits for more rain",
  RH2M: "Noise texture: brighter hiss for more humid air",
  WS2M: "Loudness and brightness of the note",
};

type Piece = { kind: "reference" | "event"; listen: ListenScape; range: { from: number; to: number }; label: string };

/**
 * The case study: three steps, ear first. Hear a data-selected normal
 * reference, hear the strongest compound heat-and-dryness period found in the
 * region's record, then reveal the four charts you would otherwise need beside
 * the one soundscape that carries all four. Every sentence is a template from
 * caseAnalysis.ts filled with computed numbers.
 */
export function CaseStudy({ engine, onCaption }: Props) {
  const [region, setRegion] = useState<RegionBox>(() => regionFromLink(window.location.hash, CASE_DEFAULT_REGION));
  const [progress, setProgress] = useState<RegionProgress | null>(null);
  const [heard, setHeard] = useState<Set<Piece["kind"]>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const playback = useEngineState(engine);

  const remote = useRemote(region.id, (signal) => {
    setProgress(null);
    return loadRegion(region, setProgress, signal);
  });
  const data = remote.data;
  const analysis = useMemo(() => (data ? analyseRegion(data) : null), [data]);
  const event = useMemo(() => (data && analysis ? findCompoundEvent(data, analysis) : null), [data, analysis]);
  const pieces = useMemo(() => (data && analysis && event ? buildPieces(region.name, data, analysis, event) : null), [data, analysis, event, region.name]);

  const choose = (next: RegionBox) => {
    if (next.id === region.id) return;
    engine.stop(SOURCE);
    setRegion(next);
    setHeard(new Set());
    setRevealed(false);
    window.history.replaceState(null, "", regionLink(next, "case"));
    onCaption(`Case study: searching the ${next.name} record for its strongest compound heat-and-dryness event.`);
  };

  const playingPiece = pieces && playback.source === SOURCE ? [pieces.reference, pieces.event].find((piece) => piece.listen.scape.title === playback.title) ?? null : null;
  const position = playingPiece ? playback.index : null;

  const play = (piece: Piece) => {
    if (playingPiece === piece && playback.playing) {
      engine.pause();
      return;
    }
    if (playingPiece === piece && playback.status === "paused") {
      void engine.resume();
      return;
    }
    void engine
      .playSoundscape(piece.listen.scape, {
        source: SOURCE,
        title: piece.listen.scape.title,
        onStep: (step) => onCaption(step.caption),
        onEnded: () => setHeard((current) => new Set(current).add(piece.kind)),
      })
      .catch((caught: Error) => onCaption(caught.message));
  };

  const period = data && event ? eventPeriod(data, event) : "";
  const refPeriod = data && event ? referencePeriod(data, event) : "";

  return (
    <section className="deck case-study" aria-labelledby="case-title">
      <header className="case-head">
        <p className="meta-row">
          <span><span className="label">Worked data story</span><b>NASA POWER monthly, region grid</b></span>
          <span><span className="label">Normal</span><b>{NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}</b></span>
          <span><span className="label">Test</span><b>hot + dry + low humidity, each |z| ≥ {COMPOUND_Z}</b></span>
        </p>
        <h1 className="deck-title" id="case-title">Find it by ear: one event, four measurements, one sound</h1>
        <p className="reading">
          The page searches a region's whole NASA POWER record for the month when temperature was most above normal while
          rainfall and humidity were most below, all at once. Listen to a quiet reference year first, then the event year.
          Then reveal the four charts it would otherwise take to see the same thing.
        </p>
        <div className="chips case-regions" role="group" aria-label="Region to search">
          {PRESET_REGIONS.map((item) => (
            <button key={item.id} type="button" className="chip" aria-pressed={item.id === region.id} onClick={() => choose(item)}>
              {item.name}
            </button>
          ))}
        </div>
        <p className="mono tiny muted">
          {region.name} · {formatCoord(region.south, "N", "S")} to {formatCoord(region.north, "N", "S")}, {formatCoord(region.west, "E", "W")} to {formatCoord(region.east, "E", "W")}
        </p>
      </header>

      {remote.loading && <LoadProgress progress={progress} />}
      {remote.error && <Problem message={remote.error} source="NASA POWER" onRetry={remote.retry} />}
      {data && analysis && !event && (
        <Problem message={`The ${region.name} record has no month where temperature, rainfall and humidity can all be scored against a 2001–2020 reference, so there is no case to show.`} source="NASA POWER" />
      )}

      {data && analysis && event && pieces && (
        <>
          <p className={`case-verdict${event.met ? "" : " case-verdict-unmet"}`} role="status">
            {event.met ? `Event found: ${period}.` : `No compound event in this record by the |z| ≥ ${COMPOUND_Z} test; the closest month is shown for comparison.`}
          </p>
          <ol className="case-steps" aria-label="Case study steps">
            {[pieces.reference, pieces.event].map((piece, index) => {
              const active = playingPiece === piece;
              return (
                <li key={piece.kind} className="case-step" data-active={active || undefined}>
                  <span className="case-step-num mono" aria-hidden="true">{index + 1}</span>
                  <div>
                    <p className="label">{piece.kind === "reference" ? "Hear a normal period" : event.met ? "Hear the event period" : "Hear the closest period"}</p>
                    <p className="case-step-title">{piece.label}</p>
                    <p className="tiny muted">
                      12 months · {clock(stepTime(piece.listen.scape.steps.length, CASE_BPM))}
                      {heard.has(piece.kind) ? " · heard" : ""}
                    </p>
                  </div>
                  <button className="btn btn-primary" onClick={() => play(piece)} aria-pressed={active && playback.playing}>
                    {active && playback.playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                    {active && playback.playing ? "Pause" : active && playback.status === "paused" ? "Resume" : "Play"}
                  </button>
                </li>
              );
            })}
            <li className="case-step">
              <span className="case-step-num mono" aria-hidden="true">3</span>
              <div>
                <p className="label">Reveal</p>
                <p className="case-step-title">What the measurements say</p>
                <p className="tiny muted">{heard.size < 2 ? "Listen to both first, or reveal now." : "You have heard both."}</p>
              </div>
              <button className={`btn ${revealed ? "btn-ghost" : "btn-primary"}`} onClick={() => setRevealed((value) => !value)} aria-expanded={revealed} aria-controls="case-reveal">
                <Eye size={15} aria-hidden="true" /> {revealed ? "Hide" : "Reveal"}
              </button>
            </li>
          </ol>
          <p className="case-listen-hint tiny muted">
            Listen for pitch (temperature), the rain percussion, the hiss of humidity and the loudness of wind, and for bells, which ring when a measurement is unusual. Which year sounds different, and when?
          </p>

          <div id="case-reveal" hidden={!revealed}>
            {revealed && (
              <>
                <section className="case-finding" aria-labelledby="case-finding-title">
                  <h2 id="case-finding-title" className="label">What the measurements say</h2>
                  <p className="case-headline">{caseHeadline(region.name, data, event)}</p>
                  <ul className="case-measures">
                    {CHART_ORDER.map((parameter) => {
                      const measure = event.measures.find((item) => item.parameter === parameter)!;
                      return <li key={parameter}>{measureSentence(measure, period, refPeriod)}</li>;
                    })}
                  </ul>
                  <p className="tiny muted">{referenceSentence(data, event)}</p>
                </section>

                <div className="case-compare">
                  <section aria-labelledby="case-charts-title" className="case-charts">
                    <h2 id="case-charts-title">What you’d need: 4 charts</h2>
                    <p className="muted tiny">
                      Robust z per month against each calendar month's {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]} normal, on one shared scale.
                      Bars: {windowPeriod(data, pieces.event.range)}. Dots: the reference, {windowPeriod(data, pieces.reference.range)}. Amber bars lean toward heat and dryness, cyan away from it. The band marks {period}; dashed lines are ±{UNUSUAL_Z}.
                    </p>
                    <CaseCharts data={data} analysis={analysis} event={event} pieces={pieces} position={position} />
                  </section>
                  <section aria-labelledby="case-hear-title" className="case-hear">
                    <h2 id="case-hear-title">What you hear: 1 soundscape</h2>
                    <p>All four measurements sound in the same note, so their timing and co-occurrence are heard in one pass.</p>
                    <table className="map case-legend">
                      <caption className="label">Which sound carries which measurement</caption>
                      <thead><tr><th>Measurement</th><th>Heard as</th></tr></thead>
                      <tbody>
                        {CHART_ORDER.map((parameter) => (
                          <tr key={parameter}><td>{WORDS[parameter].name}</td><td>{SOUND_OF[parameter]}</td></tr>
                        ))}
                        <tr><td>Any of them at |z| ≥ {UNUSUAL_Z}</td><td>A bell with that measurement's own pitch</td></tr>
                      </tbody>
                    </table>
                    <p className="case-ear">{earSentence(notesOf(pieces.event), notesOf(pieces.reference), event.peak - pieces.event.range.from)}</p>
                    <div className="case-hear-actions">
                      {[pieces.reference, pieces.event].map((piece) => (
                        <button key={piece.kind} className="btn btn-ghost btn-small" onClick={() => play(piece)}>
                          <Play size={13} aria-hidden="true" /> {piece.kind === "reference" ? "Reference" : "Event"} · {piece.label}
                        </button>
                      ))}
                    </div>
                    <p className="tiny muted">
                      Playhead: {playingPiece && position !== null ? `${playingPiece.kind === "event" ? "event" : "reference"}, ${playingPiece.listen.scape.steps[position]?.label}` : "not playing"}. It moves on all four charts.
                    </p>
                    <a className="btn btn-primary" href={regionLink(region)}>Open {region.name} in Listening Intelligence</a>
                  </section>
                </div>

                <details className="case-evidence">
                  <summary className="tiny">The monthly numbers behind the charts</summary>
                  <EvidenceTable data={data} analysis={analysis} range={pieces.event.range} event={event} />
                </details>

                <div className="listen-background">
                  <h3 className="label">{BACKGROUND_LABEL}</h3>
                  <p className="tiny muted">{REGION_BACKGROUND[region.id] ?? GENERIC_BACKGROUND}</p>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <p className="validation-footnote">
        Method: NASA POWER monthly MERRA-2 values on the region's grid ({data ? `${data.points.length} points` : "9–16 points"}), cos-latitude area mean, robust z = (x − median) / max(1.4826 · MAD, floor)
        against the same calendar month in {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}, rain on ln(1 + P). Every month of the record is scored by its weakest leg, min(z temperature, −z rain, −z humidity); the event is the strongest month,
        grown while all three stay at |z| ≥ {EXTEND_Z} (up to 6 months). The reference is the same calendar months, shifted by whole years into {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}, with the smallest largest |z|. No cause is inferred.
      </p>
    </section>
  );
}

function buildPieces(regionName: string, data: RegionData, analysis: RegionAnalysis, event: CaseEvent): { reference: Piece; event: Piece } {
  const make = (kind: Piece["kind"], range: { from: number; to: number }): Piece => {
    const label = windowPeriod(data, range);
    const listen = buildListenScape(regionName, data, analysis, {
      id: `case-${kind}`,
      label: `${kind === "event" ? "case event" : "case reference"}, ${label}`,
      from: Number(data.months[range.from].slice(0, 4)),
      to: Number(data.months[range.to].slice(0, 4)),
      resolution: "month",
      months: range,
      bpm: CASE_BPM,
    });
    return { kind, listen, range, label };
  };
  return { reference: make("reference", { from: event.reference.from, to: event.reference.to }), event: make("event", event.window) };
}

function notesOf(piece: Piece): { label: string; note: string | null; bells: number }[] {
  return piece.listen.scape.steps.map((step) => ({ label: step.label, note: step.lead?.name ?? null, bells: step.bells.length }));
}

const CW = 320;
const CH = 120;
const PAD_L = 26;
const PAD_T = 8;
const PAD_B = 18;

/** Four small multiples, one per measurement, on a shared robust-z scale, with the playhead of whichever piece is sounding. */
function CaseCharts({ data, analysis, event, pieces, position }: { data: RegionData; analysis: RegionAnalysis; event: CaseEvent; pieces: { reference: Piece; event: Piece }; position: number | null }) {
  const n = pieces.event.range.to - pieces.event.range.from + 1;
  const zAt = (parameter: RegionParameter, index: number) => {
    const item = analysis[parameter].months[index];
    if (!item || item.z === null || (parameter === "PRECTOTCORR" && item.pct === null)) return null;
    return item.z;
  };
  const all = REGION_PARAMETERS.flatMap((parameter) =>
    Array.from({ length: n }, (_, i) => [zAt(parameter, pieces.event.range.from + i), zAt(parameter, pieces.reference.range.from + i)]).flat(),
  ).filter((value): value is number => value !== null);
  const span = Math.max(3, Math.ceil(Math.max(...all.map(Math.abs))));
  const plotH = CH - PAD_T - PAD_B;
  const y = (z: number) => PAD_T + plotH / 2 - (Math.max(-span, Math.min(span, z)) / span) * (plotH / 2);
  const slot = (CW - PAD_L) / n;
  const x = (i: number) => PAD_L + i * slot;
  const bandFrom = event.from - pieces.event.range.from;
  const bandTo = event.to - pieces.event.range.from;
  const monthInitial = (i: number) => monthLabel(data.months[pieces.event.range.from + i]).slice(0, 1);
  return (
    <div className="case-chart-grid">
      {CHART_ORDER.map((parameter) => {
        const w = WORDS[parameter];
        const legSide = parameter === "T2M" ? "high" : parameter === "WS2M" ? null : "low";
        return (
          <figure className="case-mini-chart" key={parameter}>
            <figcaption>
              <span>{w.name}</span>
              <span className="tiny muted">{legSide ? `test: ${legSide}` : "not in the test"}</span>
            </figcaption>
            <svg
              viewBox={`0 0 ${CW} ${CH}`}
              role="img"
              aria-label={`${w.name} robust z by month, ${windowPeriod(data, pieces.event.range)} as bars and the reference as dots. Peak in the event: ${event.measures.find((item) => item.parameter === parameter)?.peak?.z != null ? plain(event.measures.find((item) => item.parameter === parameter)!.peak!.z as number, 1) : "none"}. The table below has every value.`}
            >
              <rect className="case-band" x={x(bandFrom)} y={PAD_T} width={(bandTo - bandFrom + 1) * slot} height={plotH} />
              <line className="zero" x1={PAD_L} x2={CW} y1={y(0)} y2={y(0)} />
              <line className="case-threshold" x1={PAD_L} x2={CW} y1={y(UNUSUAL_Z)} y2={y(UNUSUAL_Z)} />
              <line className="case-threshold" x1={PAD_L} x2={CW} y1={y(-UNUSUAL_Z)} y2={y(-UNUSUAL_Z)} />
              <text className="axis-text" x={PAD_L - 4} y={y(span) + 4} textAnchor="end">+{span}</text>
              <text className="axis-text" x={PAD_L - 4} y={y(0) + 3} textAnchor="end">0</text>
              <text className="axis-text" x={PAD_L - 4} y={y(-span)} textAnchor="end">−{span}</text>
              {Array.from({ length: n }, (_, i) => {
                const z = zAt(parameter, pieces.event.range.from + i);
                const refZ = zAt(parameter, pieces.reference.range.from + i);
                const bar = slot * 0.62;
                const hot = parameter === "PRECTOTCORR" || parameter === "RH2M" ? (z ?? 0) < 0 : (z ?? 0) >= 0;
                const eventKey = data.months[pieces.event.range.from + i];
                const refKey = data.months[pieces.reference.range.from + i];
                return (
                  <g key={i}>
                    {z !== null ? (
                      <rect className={`case-bar ${hot ? "warm" : "cool"}${Math.abs(z) >= UNUSUAL_Z ? " flag" : ""}`} x={x(i) + (slot - bar) / 2} y={Math.min(y(0), y(z))} width={bar} height={Math.max(1, Math.abs(y(z) - y(0)))} rx={1.5}>
                        <title>{`${monthLabel(eventKey)}: ${w.lower} z ${plain(z, 1)}`}</title>
                      </rect>
                    ) : (
                      <rect className="gap-mark" x={x(i) + (slot - bar) / 2} y={y(0) - 1} width={bar} height={2}><title>{`${monthLabel(eventKey)}: not scored`}</title></rect>
                    )}
                    {refZ !== null && (
                      <circle className="case-ref" cx={x(i) + slot / 2} cy={y(refZ)} r={3}>
                        <title>{`${monthLabel(refKey)} (reference): ${w.lower} z ${plain(refZ, 1)}`}</title>
                      </circle>
                    )}
                    <text className="axis-text" x={x(i) + slot / 2} y={CH - 4} textAnchor="middle">{monthInitial(i)}</text>
                  </g>
                );
              })}
              {position !== null && <line className="now-line" x1={x(position) + slot / 2} x2={x(position) + slot / 2} y1={PAD_T} y2={PAD_T + plotH} />}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}

function EvidenceTable({ data, analysis, range, event }: { data: RegionData; analysis: RegionAnalysis; range: { from: number; to: number }; event: CaseEvent }) {
  const rows: number[] = [];
  for (let index = range.from; index <= range.to; index += 1) rows.push(index);
  const cell = (parameter: RegionParameter, index: number) => {
    const item = analysis[parameter].months[index];
    if (!item) return "missing";
    const w = WORDS[parameter];
    return `${plain(item.value, w.digits)} (${signed(item.anomaly, w.digits)}; z ${item.z === null || (parameter === "PRECTOTCORR" && item.pct === null) ? "—" : plain(item.z, 1)})`;
  };
  return (
    <div className="table-scroll" tabIndex={0} aria-label="Monthly values for the event window">
      <table className="data-table">
        <thead>
          <tr>
            <th>Month</th>
            {CHART_ORDER.map((parameter) => <th key={parameter}>{WORDS[parameter].name} ({WORDS[parameter].unit})</th>)}
            <th>Weakest leg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((index) => (
            <tr key={index} className={index >= event.from && index <= event.to ? "flagged" : undefined}>
              <td>{monthLabel(data.months[index])}</td>
              {CHART_ORDER.map((parameter) => <td key={parameter}>{cell(parameter, index)}</td>)}
              <td>{(() => {
                const strength = compoundStrength(analysis, index);
                return strength === null ? "—" : plain(strength, 2);
              })()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny muted">Value (departure from normal; robust z). Weakest leg = min(z temperature, −z rain, −z humidity). Highlighted rows are the event months. Area means of {data.points.length} NASA POWER grid points.</p>
    </div>
  );
}
