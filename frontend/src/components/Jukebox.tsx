import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Hand, Pause, Play } from "lucide-react";
import { getJson } from "../api.ts";
import { eventsFromFrames } from "../audio/build.ts";
import { ScanLine } from "../jukebox/ScanLine.tsx";
import { jukeboxTracer } from "../jukebox/trace.ts";
import { applyVoicing, explainTrack, voicingFor } from "../jukebox/voicing.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { noteLabel } from "../science/score.ts";
import { useEngineState } from "../ui/audioBus.ts";
import { Trace } from "../shell/Trace.tsx";
import type { PitchFrom, SonicSettings, TrackDetail, TrackSummary } from "../types.ts";
import { Problem, SoundMap, Wait } from "./Guide.tsx";

type Props = {
  settings: SonicSettings;
  engine: SonificationEngine;
  onCaption: (caption: string) => void;
  activeIndex: number | null;
  onActiveIndex: (index: number | null) => void;
  requestPlay: number;
  /** The selected SVS id lives above the section switch, so it survives navigation. */
  selected: number;
  onSelect: (svsId: number) => void;
  reducedMotion: boolean;
  /** Set once by the landing page's "Play the night lights": play as soon as the frame loads. */
  autoPlay?: boolean;
  onAutoPlayed?: () => void;
  onPlayed?: () => void;
};

// Detail responses are measurements of fixed NASA files; keep them for the visit
// so returning to the jukebox does not re-download a movie.
const detailCache = new Map<number, TrackDetail>();
let trackCache: TrackSummary[] | null = null;

const SOURCE = "jukebox";

const PITCH_WORD: Record<PitchFrom, string> = { luminance: "Brightness", warmth: "Warmth", contrast: "Contrast" };

export function Jukebox({
  settings,
  engine,
  onCaption,
  activeIndex,
  onActiveIndex,
  requestPlay,
  selected,
  onSelect,
  reducedMotion,
  autoPlay = false,
  onAutoPlayed,
  onPlayed,
}: Props) {
  const [tracks, setTracks] = useState<TrackSummary[] | null>(trackCache);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrackDetail | null>(detailCache.get(selected) ?? null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!detailCache.has(selected));
  const [listAttempt, setListAttempt] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pendingPlay = useRef(autoPlay);
  const mounted = useRef(true);
  const playback = useEngineState(engine);
  // Width-to-height of the SVS picture, so a tall frame can be scaled to fit the screen
  // with the image, playhead, score strip and drag area all keeping one width.
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.metaKey || event.ctrlKey || event.altKey) return;
      const number = Number(event.key);
      if (!tracks || !Number.isInteger(number) || number < 1 || number > 9) return;
      const track = tracks[number - 1];
      if (track) onSelect(track.svs_id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tracks, onSelect]);

  useEffect(() => {
    if (trackCache && listAttempt === 0) return;
    const controller = new AbortController();
    setTracks(null);
    setListError(null);
    getJson<{ tracks: TrackSummary[] }>("/api/jukebox")
      .then((body) => {
        if (controller.signal.aborted) return;
        trackCache = body.tracks;
        setTracks(body.tracks);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setListError(error.message);
      });
    return () => controller.abort();
  }, [listAttempt]);

  useEffect(() => {
    const cached = detailAttempt === 0 ? detailCache.get(selected) : undefined;
    const current = engine.getState();
    const stillSounding = cached !== undefined && current.source === SOURCE && current.title === cached.title;
    if (!stillSounding) {
      // A different frame: this section's run (only) stops, and the highlight resets.
      engine.stop(SOURCE);
      onActiveIndex(null);
    }
    if (cached) {
      setDetail(cached);
      setDetailError(null);
      setLoading(false);
      if (!stillSounding) onCaption(`${cached.title}. ${cached.reading} Press play to hear it.`);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setDetail(null);
    setDetailError(null);
    getJson<TrackDetail>(`/api/jukebox/${selected}`)
      .then((body) => {
        if (controller.signal.aborted) return;
        detailCache.set(body.svs_id, body);
        setDetail(body);
        setLoading(false);
        onCaption(`${body.title}. ${body.reading} Press play to hear it.`);
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setDetailError(error.message);
        setLoading(false);
        onCaption(`${error.message} Nothing will play from this frame until it loads.`);
      });
    return () => controller.abort();
    // The engine and caption callbacks are stable enough for a selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, detailAttempt]);

  const pitchFrom: PitchFrom | null = detail ? (settings.pitchFrom === "track" ? detail.pitch_from : settings.pitchFrom) : null;
  const voicing = voicingFor(selected);
  const prepared = useMemo(() => {
    if (!detail || !pitchFrom) return [];
    return applyVoicing(eventsFromFrames(detail.title, detail.samples, pitchFrom, settings), voicing);
  }, [detail, pitchFrom, settings, voicing]);
  const tracer = useMemo(
    () => (detail && pitchFrom ? jukeboxTracer(detail, pitchFrom, prepared, settings.anomalyZ) : null),
    [detail, pitchFrom, prepared, settings.anomalyZ],
  );
  const preparedRef = useRef(prepared);
  preparedRef.current = prepared;

  const mine = detail !== null && playback.source === SOURCE && playback.title === detail.title;
  const playing = mine && playback.playing;
  const position = tracks ? tracks.findIndex((track) => track.svs_id === selected) : -1;
  const neighbour = (offset: number): TrackSummary | null => {
    if (!tracks || tracks.length === 0) return null;
    const base = position < 0 ? 0 : position;
    return tracks[(base + offset + tracks.length) % tracks.length];
  };

  const play = () => {
    const events = preparedRef.current;
    if (!detail || !tracer) return;
    if (events.length === 0) {
      onCaption("This frame produced no measurable samples, so there is nothing to play.");
      return;
    }
    // The same run already paused here: carry on from where it stopped.
    if (mine && (playback.status === "paused" || playback.status === "ended")) {
      void engine.resume();
      return;
    }
    onPlayed?.();
    void engine
      .play(events, {
        source: SOURCE,
        bpm: settings.bpm,
        title: detail.title,
        trace: tracer,
        onIndex: (index) => {
          const event = events[index];
          if (!event) return;
          onActiveIndex(event.sourceIndex);
          onCaption(event.caption);
        },
        onEnded: () => {
          if (!continuous || !mounted.current) return;
          const next = neighbour(1);
          if (!next) return;
          pendingPlay.current = true;
          onSelect(next.svs_id);
        },
      })
      .catch((error: Error) => onCaption(error.message));
  };

  const handAt = (index: number) => {
    if (!detail) return;
    const clamped = Math.min(detail.samples.length - 1, Math.max(0, index));
    const event = preparedRef.current.find((item) => item.sourceIndex === clamped);
    if (!event) return;
    engine.touch(event);
    onActiveIndex(clamped);
    onCaption(`${event.caption} Your hand is on this step.`);
  };

  const handAtX = (clientX: number) => {
    const stage = stageRef.current;
    if (!detail || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    handAt(Math.floor(fraction * detail.samples.length));
  };

  useEffect(() => {
    if (requestPlay > 0) play();
    // play closes over the latest detail; the counter is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestPlay]);

  useEffect(() => {
    if (!detail || !pendingPlay.current) return;
    pendingPlay.current = false;
    onAutoPlayed?.();
    play();
    // play reads the freshly prepared events through preparedRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const current = detail && activeIndex !== null ? detail.samples[activeIndex] : null;
  const bySource = useMemo(() => new Map(prepared.map((event) => [event.sourceIndex, event])), [prepared]);
  const eventIndex = activeIndex !== null ? prepared.findIndex((event) => event.sourceIndex === activeIndex) : -1;
  const currentEvent = eventIndex >= 0 ? prepared[eventIndex] : undefined;
  const values = detail && pitchFrom ? detail.samples.map((sample) => sample[pitchFrom]) : [];
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pitchWord = pitchFrom ? PITCH_WORD[pitchFrom] : "Brightness";
  const note = noteLabel(currentEvent?.frequency);
  const outliers = prepared.filter((event) => event.accent).length;
  const trace = tracer && eventIndex >= 0 ? tracer(eventIndex) : null;
  const previous = neighbour(-1);
  const next = neighbour(1);
  const steps = detail?.samples.length ?? 0;

  return (
    <div className="workspace workspace-jukebox">
      <aside className="rail" aria-label="Frames">
        <div className="rail-head">
          <span className="label">EIC frames</span>
          <span className="label">Keys 1–9</span>
        </div>
        {listError && (
          <div className="rail-problem">
            <Problem message={listError} source="NASA SVS" onRetry={() => setListAttempt((value) => value + 1)} retryLabel="Try the list again" />
          </div>
        )}
        {!tracks && !listError && (
          <>
            <div className="rail-wait">
              <Wait active label="Loading the nine EIC frames from NASA SVS." slow="Still waiting on NASA SVS. The list is titles only; nothing is being filled in." />
            </div>
            {Array.from({ length: 9 }, (_, index) => <div key={index} className="skeleton" />)}
          </>
        )}
        <div className="track-list" role="listbox" aria-label="EIC jukebox frames">
          {tracks?.map((track, index) => {
            const sounding = playback.source === SOURCE && playback.playing && detailCache.get(track.svs_id)?.title === playback.title;
            return (
              <button
                key={track.svs_id}
                role="option"
                aria-selected={track.svs_id === selected}
                className={sounding ? "track sounding" : "track"}
                onClick={() => onSelect(track.svs_id)}
              >
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <span className="track-title">
                  {track.title}
                  {sounding && <span className="sr-only">, now playing</span>}
                </span>
                <span className="track-meta">
                  SVS {track.svs_id} · {track.kind === "video" ? "movie" : "still"} · {voicingFor(track.svs_id).name}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="deck" aria-label="Selected frame">
        <Wait
          active={loading}
          label="Measuring the SVS file."
          slow="Still waiting on NASA SVS. A movie can take a minute the first time. The sound will not start from invented frames."
        />
        {loading && <div className="frame-skeleton" aria-hidden="true" />}
        {detailError && (
          <Problem message={detailError} source="NASA SVS" onRetry={() => setDetailAttempt((value) => value + 1)} retryLabel="Try this frame again" />
        )}
        {detail && (
          <>
            <header>
              <p className="meta-row">
                <span><span className="label">SVS</span><b>{detail.svs_id}</b></span>
                {detail.release_date && <span><span className="label">Released</span><b>{detail.release_date.slice(0, 10)}</b></span>}
                <span><span className="label">Read as</span><b>{detail.method === "temporal-frames" ? "sampled movie frames" : "west-to-east scan of a still"}</b></span>
                <span><span className="label">Pitch from</span><b>{pitchWord.toLowerCase()}</b></span>
                <span><span className="label">Soundscape</span><b>{voicing.name}</b></span>
              </p>
              <h2 className="deck-title">{detail.title}</h2>
            </header>
            {detail.warning && <p className="warn">{detail.warning}</p>}

            <div className="deck-body">
              <div className="deck-stage">
                <div className="frame" style={aspect ? { maxWidth: `calc(var(--frame-h) * ${aspect.toFixed(4)})` } : undefined}>
                  <div
                    className="frame-stage hand"
                    ref={stageRef}
                    tabIndex={0}
                    role="slider"
                    aria-label={`Play ${detail.title} by hand. Left and right arrows move one step.`}
                    aria-valuemin={1}
                    aria-valuemax={steps}
                    aria-valuenow={activeIndex === null ? 1 : activeIndex + 1}
                    aria-valuetext={currentEvent ? currentEvent.caption : "No step selected"}
                    onKeyDown={(key) => {
                      const step = key.key === "ArrowRight" ? 1 : key.key === "ArrowLeft" ? -1 : key.key === "Home" ? -steps : key.key === "End" ? steps : 0;
                      if (step !== 0) {
                        key.preventDefault();
                        void engine.ensure().then(() => handAt((activeIndex ?? (step > 0 ? -1 : steps)) + step));
                      } else if (key.key === "Escape") engine.releaseTouch();
                    }}
                    onKeyUp={(key) => {
                      if (key.key.startsWith("Arrow") || key.key === "Home" || key.key === "End") window.setTimeout(() => engine.releaseTouch(), 380);
                    }}
                    onBlur={() => engine.releaseTouch()}
                    onPointerDown={(event) => {
                      dragging.current = true;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      void engine.ensure().then(() => handAtX(event.clientX));
                    }}
                    onPointerMove={(event) => {
                      if (!dragging.current) return;
                      handAtX(event.clientX);
                    }}
                    onPointerUp={() => {
                      dragging.current = false;
                      engine.releaseTouch();
                    }}
                    onPointerCancel={() => {
                      dragging.current = false;
                      engine.releaseTouch();
                    }}
                  >
                    <div className="frame-img">
                      <img
                        src={current?.image_url || detail.poster_url}
                        alt={`${detail.title}. ${current?.label ?? "Official NASA SVS preview."}`}
                        onLoad={(event) => {
                          const image = event.currentTarget;
                          if (image.naturalHeight > 0) setAspect(image.naturalWidth / image.naturalHeight);
                        }}
                      />
                      {detail.method === "spatial-scan" && (
                        <ScanLine
                          engine={engine}
                          events={prepared}
                          samples={steps}
                          active={mine}
                          restingSource={activeIndex}
                          still={reducedMotion}
                          note={note}
                          outlier={currentEvent?.accent ?? false}
                        />
                      )}
                      {detail.method === "temporal-frames" && note && (
                        <span className="frame-note" aria-hidden="true">
                          <b>{note.note}</b> {note.hz}
                        </span>
                      )}
                      <span className="frame-tag">
                        <Hand size={14} aria-hidden="true" strokeWidth={1.75} />
                        <span className="label">Drag or use arrows</span>
                      </span>
                    </div>
                    <div className="strip-wrap">
                      <svg
                        className="score-strip"
                        viewBox={`0 0 ${Math.max(1, values.length) * 10} 64`}
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`${pitchWord} of each of the ${values.length} steps, measured from the SVS file. ${outliers} ${outliers === 1 ? "step is an outlier" : "steps are outliers"}.`}
                      >
                        {values.map((value, index) => {
                          const h = 4 + ((value - lo) / (hi - lo || 1)) * 58;
                          const event = bySource.get(index);
                          const cls = [
                            "bar",
                            index === activeIndex ? "now" : event?.accent ? "out" : activeIndex !== null && index < activeIndex ? "past" : "",
                          ].join(" ");
                          return <rect key={index} className={cls} x={index * 10 + 1} y={64 - h} width={8} height={h} />;
                        })}
                      </svg>
                      <ScanLine
                        engine={engine}
                        events={prepared}
                        samples={steps}
                        active={mine}
                        restingSource={activeIndex}
                        still={reducedMotion}
                        note={null}
                        outlier={false}
                        variant="cursor"
                      />
                    </div>
                  </div>
                  <div className="score-axis">
                    <span className="label">{detail.method === "spatial-scan" ? "West" : "Frame 1"}</span>
                    <span className="label">
                      {pitchWord} per step · measured from the SVS file · amber = outlier
                    </span>
                    <span className="label">{detail.method === "spatial-scan" ? "East" : `Frame ${steps}`}</span>
                  </div>
                </div>

                <div className="transport">
                  <button
                    className="dock-icon transport-skip"
                    onClick={() => previous && onSelect(previous.svs_id)}
                    disabled={!previous}
                    aria-label={previous ? `Previous visualization: ${previous.title}` : "Previous visualization"}
                  >
                    <ChevronLeft size={18} aria-hidden="true" strokeWidth={1.75} />
                  </button>
                  <button className="play" aria-pressed={playing} onClick={playing ? () => engine.pause() : play}>
                    <span className="play-disc">
                      {playing ? <Pause size={18} aria-hidden="true" fill="currentColor" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
                    </span>
                    {playing ? "Pause" : mine && playback.status === "paused" ? "Resume" : "Play this frame"}
                  </button>
                  <button
                    className="dock-icon transport-skip"
                    onClick={() => next && onSelect(next.svs_id)}
                    disabled={!next}
                    aria-label={next ? `Next visualization: ${next.title}` : "Next visualization"}
                  >
                    <ChevronRight size={18} aria-hidden="true" strokeWidth={1.75} />
                  </button>
                  <label className="check">
                    <input type="checkbox" checked={continuous} onChange={(change) => setContinuous(change.currentTarget.checked)} />
                    Continue to the next frame
                  </label>
                  <a className="ext-link" href={detail.page_url} target="_blank" rel="noreferrer">
                    Open on NASA SVS <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>

                {detail.method === "temporal-frames" && (
                  <div className="film" role="group" aria-label="Sampled frames">
                    {detail.samples.map((sample) => (
                      <button
                        key={sample.index}
                        className={sample.index === activeIndex ? "film-frame on" : "film-frame"}
                        onClick={() => {
                          void engine.ensure().then(() => {
                            handAt(sample.index);
                            window.setTimeout(() => engine.releaseTouch(), 420);
                          });
                        }}
                        aria-label={`${sample.label}, hear its note`}
                        aria-current={sample.index === activeIndex ? "true" : undefined}
                      >
                        <img src={sample.image_url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="deck-side">
                <dl className="readouts">
                  <div>
                    <dt className="label">Step</dt>
                    <dd>
                      {activeIndex === null ? "—" : String(activeIndex + 1).padStart(2, "0")}
                      <small>/ {steps}</small>
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Note</dt>
                    <dd>
                      {note?.note ?? "—"}
                      {note && <small>{note.hz}</small>}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">{pitchWord}</dt>
                    <dd>{current && pitchFrom ? current[pitchFrom].toFixed(3) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="label">Outlier</dt>
                    <dd className={currentEvent?.accent ? "hot" : undefined}>{currentEvent ? (currentEvent.accent ? "Yes" : "No") : "—"}</dd>
                  </div>
                </dl>
                <Trace trace={trace} compact={false} empty="Press play, drag across the picture, or focus it and use the arrow keys. Each note is traced back to its slice here." />
              </div>
            </div>

            <div className="columns">
              <div>
                <p className="section-label label">How this frame sounds</p>
                <ol className="explain">
                  {pitchFrom && explainTrack(detail, pitchFrom).map((line) => <li key={line}>{line}</li>)}
                </ol>
                <SoundMap
                  rows={[
                    { from: `${pitchWord} of the SVS picture (measured)`, hears: "Pitch, on the scale chosen in Sonic Lab" },
                    { from: `${pitchWord}, again (measured)`, hears: "Loudness and filter brightness" },
                    { from: "A step that is an outlier in this frame", hears: "Triangle tone and a short octave ping" },
                    { from: `Soundscape “${voicing.name}” (generated)`, hears: "Timbre, harmony and texture; no data" },
                  ]}
                />
              </div>
              <div>
                <p className="section-label label">Reading</p>
                <p className="reading">{detail.reading}</p>
                {detail.nasa_description && <p className="nasa">{detail.nasa_description}</p>}
                {detail.description_error && <p className="warn">{detail.description_error}</p>}
                <p className="muted tiny">{detail.measured}</p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
