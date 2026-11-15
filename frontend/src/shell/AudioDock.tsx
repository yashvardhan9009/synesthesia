import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { NoteEvent, SonificationEngine } from "../audio/engine.ts";
import { noteLabel } from "../science/score.ts";
import { useCurrentNote, useEngineState } from "../ui/audioBus.ts";
import { Scope } from "../ui/Scope.tsx";
import { shouldAnnounce } from "./announce.ts";
import { formatDuration, formatRate, progressOf, RATES } from "./playbackMath.ts";
import { isTypingTarget } from "./keys.ts";
import { Trace } from "./Trace.tsx";

type Props = {
  engine: SonificationEngine;
  caption: string;
  /** Section names by source id, for "Live · Jukebox". */
  sections: Record<string, string>;
  /** Start the current section's own piece when nothing has played yet. Null on pages with no piece. */
  onStart: (() => void) | null;
  /** Called when the trace drawer opens, for onboarding. */
  onTraceOpened?: () => void;
};

/**
 * The persistent transport: play and pause, step, position, current note,
 * volume, mute, speed and the trace of the sounding note. It lives above the
 * section switch, so it keeps working whichever section is open.
 */
export function AudioDock({ engine, caption, sections, onStart, onTraceOpened }: Props) {
  const state = useEngineState(engine);
  const sounding = useCurrentNote(engine);
  const [traceOpen, setTraceOpen] = useState(false);
  const { status, index, length: total, rate, volume, muted } = state;
  const hasRun = total > 0;
  const playing = status === "playing";

  // While paused the engine is silent, but the dock keeps showing the note it paused on.
  const lastNote = useRef<NoteEvent | null>(null);
  if (sounding && sounding.source !== "touch") lastNote.current = sounding;
  if (!hasRun) lastNote.current = null;
  const note = sounding ?? lastNote.current;
  const heard = noteLabel(state.touch ?? note?.frequency);
  const owner = state.source ? (sections[state.source] ?? state.source) : null;
  const trace = note?.trace ?? null;
  const canToggle = playing || hasRun || onStart !== null;

  // The visible caption follows every note; the spoken one is thinned (announce.ts).
  const [spoken, setSpoken] = useState(caption);
  const spokenAt = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (shouldAnnounce(caption, spoken, now, spokenAt.current, playing)) {
      spokenAt.current = now;
      setSpoken(caption);
    }
  }, [caption, spoken, playing]);

  const toggle = () => {
    if (playing) engine.pause();
    else if (hasRun) void engine.resume();
    else onStart?.();
  };

  useEffect(() => {
    const onKey = (key: KeyboardEvent) => {
      if (isTypingTarget(key.target) || key.metaKey || key.ctrlKey || key.altKey) return;
      if (key.key === "m" || key.key === "M") engine.setMuted(!muted);
      else if (key.key === "," && hasRun) engine.seek((index ?? 0) - 1);
      else if (key.key === "." && hasRun) engine.seek((index ?? -1) + 1);
      else if (key.key === "t" || key.key === "T") setTraceOpen((open) => !open);
      else return;
      key.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, hasRun, index, muted]);

  useEffect(() => {
    if (traceOpen) onTraceOpened?.();
  }, [traceOpen, onTraceOpened]);

  const progress = progressOf(index, total);
  const position = index === null ? "Not started" : `Step ${index + 1} of ${total}${note ? `, ${note.label}` : ""}`;
  const bpm = state.stepSeconds > 0 ? 60 / state.stepSeconds : 0;

  return (
    <div className="dock" role="region" aria-label="Audio controls and live caption" data-status={status}>
      {traceOpen && (
        <div className="dock-trace" id="dock-trace">
          <Trace trace={trace} />
        </div>
      )}
      <div className="dock-transport">
        <button
          className="dock-play"
          onClick={toggle}
          disabled={!canToggle}
          aria-label={playing ? "Pause" : hasRun ? (status === "ended" ? "Play again" : "Resume") : "Play this section"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? <Pause size={18} aria-hidden="true" fill="currentColor" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
        </button>
        <button className="dock-icon" onClick={() => engine.seek((index ?? 0) - 1)} disabled={!hasRun || !index} aria-label="Previous note" title="Previous note (,)">
          <SkipBack size={15} aria-hidden="true" strokeWidth={1.75} />
        </button>
        <button
          className="dock-icon"
          onClick={() => engine.seek((index ?? -1) + 1)}
          disabled={!hasRun || index === total - 1}
          aria-label="Next note"
          title="Next note (.)"
        >
          <SkipForward size={15} aria-hidden="true" strokeWidth={1.75} />
        </button>
      </div>

      <div className="dock-now">
        <div className="dock-now-head">
          <span className="label">
            <span className="live-dot" aria-hidden="true" /> {playing ? "Live" : status === "paused" ? "Paused" : status === "ended" ? "Ended" : "Ready"}
            {owner && <span className="dock-owner"> · {owner}</span>}
          </span>
          <span className="dock-note" aria-label={heard ? `Current note ${heard.note}, ${heard.hz}` : "No note"}>
            <b>{heard?.note ?? "—"}</b>
            <small>{heard?.hz ?? "Hz"}</small>
          </span>
        </div>
        <input
          className="dock-progress"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={index ?? 0}
          disabled={!hasRun}
          onChange={(change) => engine.seek(Number(change.currentTarget.value))}
          aria-label="Playback position"
          aria-valuetext={position}
          style={{ "--fill": `${(progress * 100).toFixed(2)}%` } as CSSProperties}
        />
        <div className="dock-now-foot label">
          <span>{index === null ? "—" : `${String(index + 1).padStart(2, "0")} / ${total}`}</span>
          <span>{hasRun ? `${formatDuration((index ?? 0) + 1, state.stepSeconds)} / ${formatDuration(total, state.stepSeconds)} · ${Math.round(bpm)} bpm` : "—"}</span>
        </div>
      </div>

      <div className="dock-caption">
        <span className="label">Live caption</span>
        <p className="caption" aria-hidden="true">
          {caption}
        </p>
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
      </div>

      <div className="dock-levels">
        <button
          className="dock-icon"
          aria-pressed={muted}
          onClick={() => engine.setMuted(!muted)}
          aria-label={muted ? "Unmute" : "Mute"}
          title="Mute (M)"
        >
          {muted ? <VolumeX size={16} aria-hidden="true" strokeWidth={1.75} /> : <Volume2 size={16} aria-hidden="true" strokeWidth={1.75} />}
        </button>
        <input
          className="dock-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(change) => {
            engine.setVolume(Number(change.currentTarget.value) / 100);
            engine.setMuted(false);
          }}
          aria-label="Volume"
          aria-valuetext={muted ? "Muted" : `${Math.round(volume * 100)} percent`}
          style={{ "--fill": `${muted ? 0 : Math.round(volume * 100)}%` } as CSSProperties}
        />
        <label className="dock-rate">
          <span className="sr-only">Playback speed</span>
          <select value={rate} onChange={(change) => engine.setRate(Number(change.currentTarget.value))}>
            {RATES.map((option) => (
              <option key={option} value={option}>
                {formatRate(option)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="dock-trace-toggle"
          aria-expanded={traceOpen}
          aria-controls="dock-trace"
          onClick={() => setTraceOpen((open) => !open)}
          title="Trace the sounding note to its source (T)"
        >
          Trace
        </button>
      </div>

      <div className="dock-scopes" aria-hidden="true">
        <Scope kind="wave" label="Live waveform of the output" width={120} height={22} />
        <Scope kind="spectrum" label="Live spectrum of the output" width={120} height={22} />
      </div>
    </div>
  );
}
