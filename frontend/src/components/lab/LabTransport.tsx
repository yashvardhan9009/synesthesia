import { Archive, Download, HeartPulse, Link2, Play, Square, Volume2, VolumeX } from "lucide-react";
import type { EngineState, SonificationEngine } from "../../audio/engine.ts";
import { Choice, Slider } from "./controls.tsx";

const RATES = [0.5, 0.75, 1, 1.5, 2];

type Props = {
  engine: SonificationEngine;
  state: EngineState;
  canPlay: boolean;
  /** The Lab's own soundscape is playing (not an A/B slot). */
  playing: boolean;
  heartbeat: boolean;
  rendering: boolean;
  canShare: boolean;
  onPlay: () => void;
  onStop: () => void;
  onHeartbeat: () => void;
  onPostcard: () => void;
  onArchive: () => void;
  onShare: () => void;
};

/** Play, Heartbeat, stop all, master volume, mute, speed, and the export actions. */
export function LabTransport(props: Props) {
  const { engine, state, canPlay, playing, heartbeat, rendering } = props;
  return (
    <div className="lab-transport" role="group" aria-label="Lab transport">
      <button className="play" aria-pressed={playing} disabled={!canPlay} onClick={playing ? props.onStop : props.onPlay}>
        <span className="play-disc">
          {playing ? <Square size={16} aria-hidden="true" fill="currentColor" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
        </span>
        {playing ? "Stop" : "Play the soundscape"}
      </button>
      <button type="button" className="switch" aria-pressed={heartbeat} disabled={!canPlay} onClick={props.onHeartbeat}>
        <HeartPulse size={15} aria-hidden="true" strokeWidth={1.75} />
        Earth Heartbeat
      </button>
      <button type="button" className="switch" disabled={!state.playing} onClick={props.onStop}>
        <Square size={13} aria-hidden="true" strokeWidth={1.75} />
        Stop all
      </button>
      <div className="transport-group">
        <Slider
          label="Master"
          value={state.volume}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(state.volume * 100)}`}
          valueText={`${Math.round(state.volume * 100)} percent`}
          onChange={(volume) => engine.setVolume(volume)}
        />
        <button type="button" className="switch" aria-pressed={state.muted} onClick={() => engine.setMuted(!state.muted)}>
          {state.muted ? <VolumeX size={15} aria-hidden="true" strokeWidth={1.75} /> : <Volume2 size={15} aria-hidden="true" strokeWidth={1.75} />}
          Mute
        </button>
        <Choice
          label="Speed"
          value={String(state.rate)}
          options={RATES.map((rate) => ({ value: String(rate), label: `${rate}×` }))}
          onChange={(value) => engine.setRate(Number(value))}
        />
      </div>
      <div className="transport-group">
        <button type="button" className="btn btn-ghost btn-small" disabled={!canPlay || rendering} onClick={props.onPostcard}>
          <Download size={15} aria-hidden="true" strokeWidth={1.75} />
          {rendering ? "Rendering…" : "Sound postcard (WAV)"}
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!canPlay} onClick={props.onArchive}>
          <Archive size={15} aria-hidden="true" strokeWidth={1.75} />
          Save to archive
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!props.canShare} onClick={props.onShare}>
          <Link2 size={15} aria-hidden="true" strokeWidth={1.75} />
          Copy link
        </button>
      </div>
    </div>
  );
}
