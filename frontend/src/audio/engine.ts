import { frequencyToMidi, midiName } from "../science/score.ts";
import type { SonicEvent } from "../types.ts";
import { DEFAULT_CONFIG, type LabConfig, type LayerMix } from "./labConfig.ts";
import type { LayerId } from "./mappings.ts";
import { Mixer, noiseBuffer, outputChain, renderStep, type Track } from "./render.ts";
import { stepSeconds, type LayerTrace, type Soundscape, type SoundStep } from "./soundscape.ts";
import { traceFromEvent, traceFromStep, type TraceRecord } from "./trace.ts";

type Voice = { source: AudioScheduledSourceNode; gain: GainNode; nodes: AudioNode[]; end: number };

/** The note that is sounding now, with where it came from. */
export type NoteEvent = {
  /** Who started the playback, e.g. "lab", "cosmic", "jukebox". */
  source: string;
  index: number;
  label: string;
  frequency: number;
  midi: number;
  name: string;
  caption: string;
  /** Where this note came from, for the trace drawer. */
  trace: TraceRecord | null;
  /** The pitch layer of a soundscape step. Null for event sequences and the hand. */
  layer: LayerTrace | null;
  step: SoundStep | null;
};

/**
 * idle: nothing loaded. playing: sounding. paused: stopped mid-run, resumable.
 * ended: ran to the end; resuming starts again from the top.
 */
export type PlaybackStatus = "idle" | "playing" | "paused" | "ended";

export type EngineState = {
  status: PlaybackStatus;
  /** status === "playing". */
  playing: boolean;
  /** Who owns the current run (playing, paused or ended), e.g. "lab", "cosmic". */
  source: string | null;
  /** What the run is, in words, for the dock. */
  title: string | null;
  index: number | null;
  length: number;
  loop: boolean;
  /** Seconds per step at the current rate. */
  stepSeconds: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** Frequency under a hand moving across a picture, or null. */
  touch: number | null;
};

/** A list of events played one per step (Jukebox, Cosmic Earth by lead, Time Machine). */
export type SequenceOptions = {
  source: string;
  bpm: number;
  title?: string;
  /** Per-step trace. Without one, the trace is the event's label, frequency and flags. */
  trace?: (index: number) => TraceRecord | null;
  /** Anomaly threshold quoted in the fallback trace. */
  threshold?: number;
  startAt?: number;
  onIndex?: (index: number) => void;
  onEnded?: () => void;
};

export type SoundscapeOptions = {
  source?: string;
  title?: string;
  /** Loop without stopping (Earth Heartbeat). */
  loop?: boolean;
  /** Add the heartbeat pulse layer. */
  heartbeat?: boolean;
  startAt?: number;
  onStep?: (step: SoundStep, index: number) => void;
  onEnded?: () => void;
};

/** What a playback is: everything needed to (re)start it from any step. */
type RunSpec = {
  source: string;
  title: string | null;
  length: number;
  loop: boolean;
  duration: () => number;
  schedule: (index: number, time: number, duration: number) => void;
  emit: (index: number) => void;
  onEnded?: () => void;
};

/** The scheduler's position in a sounding run. */
type Cursor = {
  next: number;
  nextTime: number;
  queue: { index: number; time: number; duration: number }[];
  endTime: number;
  /** The step heard now, for animation. */
  current: { index: number; time: number; duration: number } | null;
};

export type PairOptions = {
  source?: string;
  title?: string;
  loop?: boolean;
  heartbeat?: boolean;
  startAt?: number;
  onStep?: (left: SoundStep | null, right: SoundStep | null, index: number) => void;
  onEnded?: () => void;
};

/** How far apart the two places sit in a pair, as stereo pan. */
const PAIR_SPREAD = 0.75;
const LOOKAHEAD = 0.25;
/** Background tabs throttle timers to about once a second, so schedule further ahead there. */
const HIDDEN_LOOKAHEAD = 1.6;
const TICK_MS = 25;

/**
 * The one audio engine of the app. Only one playback exists at a time: starting
 * anything (a sequence, a soundscape, a hand touch) fades out whatever was playing,
 * so switching modes never stacks sounds. Stops fade the gain before the source is
 * cut, so playback does not click. A lookahead scheduler means tempo and playback
 * rate changes apply on the next step, and Earth Heartbeat can loop indefinitely.
 */
export class SonificationEngine {
  protected context: AudioContext | null = null;
  protected master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private mixer: Mixer | null = null;
  private sides: [Mixer, Mixer] | null = null;
  private voices: Voice[] = [];
  private spec: RunSpec | null = null;
  private cursor: Cursor | null = null;
  private timer = 0;
  private touchOsc: OscillatorNode | null = null;
  private touchGain: GainNode | null = null;
  private touchFilter: BiquadFilterNode | null = null;
  private state: EngineState = {
    status: "idle",
    playing: false,
    source: null,
    title: null,
    index: null,
    length: 0,
    loop: false,
    stepSeconds: 0,
    volume: 0.7,
    muted: false,
    rate: 1,
    touch: null,
  };
  private stateListeners = new Set<(state: EngineState) => void>();
  private noteListeners = new Set<(note: NoteEvent | null) => void>();
  private note: NoteEvent | null = null;
  private layers: Record<LayerId, LayerMix> = DEFAULT_CONFIG.layers;

  get playing(): boolean {
    return this.state.playing;
  }

  async ensure(): Promise<void> {
    if (!this.context) {
      const Context =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error("This browser has no Web Audio API.");
      const context = new Context();
      this.context = context;
      this.master = outputChain(context, context.destination, this.outputLevel());
      this.noise = noiseBuffer(context);
      this.mixer = new Mixer(context, this.master, this.layers);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  // ---- Public controls ---------------------------------------------------

  getState(): EngineState {
    return this.state;
  }

  /** Subscribe to play/stop, volume, mute and rate changes. Called once immediately. */
  subscribe(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  /** Subscribe to the sounding note. Null when playback stops. */
  onNote(listener: (note: NoteEvent | null) => void): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  currentNote(): NoteEvent | null {
    return this.note;
  }

  /** 0–1. */
  setVolume(volume: number): void {
    this.setState({ volume: Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.7)) });
    this.applyOutput();
  }

  setMuted(muted: boolean): void {
    this.setState({ muted });
    this.applyOutput();
  }

  /** 0.25–4. Applies from the next step. */
  setRate(rate: number): void {
    this.setState({ rate: Math.min(4, Math.max(0.25, Number.isFinite(rate) ? rate : 1)) });
    if (this.spec) this.setState({ stepSeconds: this.spec.duration() });
  }

  /** Per-layer level, pan and on/off for soundscapes. */
  setLayerMix(layers: Record<LayerId, LayerMix>): void {
    this.layers = layers;
    this.mixer?.update(layers);
    this.sides?.forEach((side) => side.update(layers));
  }

  // ---- Playback ----------------------------------------------------------

  /** Play a list of events, one per step. */
  async play(events: SonicEvent[], options: SequenceOptions): Promise<void> {
    await this.ensure();
    this.stopAll();
    if (!this.context || !this.master || events.length === 0) return;
    const master = this.master;
    const { source, bpm } = options;
    const title = options.title ?? null;
    const trace = options.trace ?? ((index: number) => traceFromEvent(events[index], title ?? source, options.threshold ?? 2.5));
    this.start(
      {
        source,
        title,
        length: events.length,
        loop: false,
        duration: () => stepSeconds(bpm, this.state.rate),
        schedule: (index, time, duration) => this.scheduleLegacy(events[index], time, duration, master),
        emit: (index) => {
          const event = events[index];
          options.onIndex?.(index);
          const midi = frequencyToMidi(event.frequency);
          this.emitNote({
            source,
            index,
            label: event.label,
            frequency: event.frequency,
            midi,
            name: midiName(midi),
            caption: event.caption,
            trace: trace(index),
            layer: null,
            step: null,
          });
        },
        onEnded: options.onEnded,
      },
      options.startAt ?? 0,
    );
  }

  /** Play a soundscape built by buildSoundscape. */
  async playSoundscape(scape: Soundscape, options: SoundscapeOptions = {}): Promise<void> {
    await this.ensure();
    this.stopAll();
    const { context, mixer, noise } = this;
    if (!context || !mixer || !noise || scape.steps.length === 0) return;
    const source = options.source ?? "soundscape";
    const config: LabConfig = scape.config;
    this.start(
      {
        source,
        title: options.title ?? scape.title,
        length: scape.steps.length,
        loop: options.loop ?? false,
        duration: () => stepSeconds(config.bpm, this.state.rate),
        schedule: (index, time, duration) =>
          renderStep({
            context,
            mixer,
            noise,
            config,
            step: scape.steps[index],
            time,
            duration,
            heartbeat: options.heartbeat ?? false,
            track: (node, gain, end, nodes) => this.trackVoice(node, gain, end, nodes),
          }),
        emit: (index) => {
          const step = scape.steps[index];
          options.onStep?.(step, index);
          this.emitNote({
            source,
            index,
            label: step.label,
            frequency: step.lead?.frequency ?? 0,
            midi: step.lead?.midi ?? 0,
            name: step.lead?.name ?? "—",
            caption: step.caption,
            trace: traceFromStep(scape, step),
            layer: step.traces.find((item) => item.layer === "pitch") ?? null,
            step,
          });
        },
        onEnded: options.onEnded,
      },
      options.startAt ?? 0,
    );
  }

  /**
   * Two soundscapes at once, one per side of the stereo field (Regional Sound
   * Battle, two locations). Days are aligned by index and the tempo is the left
   * one's. It is still one playback: anything else started stops both.
   */
  async playPair(left: Soundscape, right: Soundscape, options: PairOptions = {}): Promise<void> {
    await this.ensure();
    this.stopAll();
    const { context, noise, master } = this;
    if (!context || !noise || !master) return;
    const length = Math.max(left.steps.length, right.steps.length);
    if (length === 0) return;
    if (!this.sides) {
      const side = (pan: number) => {
        const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
        const input = context.createGain();
        if (panner) {
          panner.pan.value = pan;
          input.connect(panner);
          panner.connect(master);
        } else {
          input.connect(master);
        }
        return new Mixer(context, input, this.layers);
      };
      this.sides = [side(-PAIR_SPREAD), side(PAIR_SPREAD)];
    }
    const [leftMixer, rightMixer] = this.sides;
    const source = options.source ?? "pair";
    const heartbeat = options.heartbeat ?? false;
    const track: Track = (node, gain, end, nodes) => this.trackVoice(node, gain, end, nodes);
    this.start(
      {
        source,
        title: options.title ?? `${left.place} and ${right.place}`,
        length,
        loop: options.loop ?? false,
        duration: () => stepSeconds(left.config.bpm, this.state.rate),
        schedule: (index, time, duration) => {
          const a = left.steps[index];
          const b = right.steps[index];
          if (a) renderStep({ context, mixer: leftMixer, noise, config: left.config, step: a, time, duration, heartbeat, track });
          if (b) renderStep({ context, mixer: rightMixer, noise, config: right.config, step: b, time, duration, heartbeat, track });
        },
        emit: (index) => {
          const a = left.steps[index] ?? null;
          const b = right.steps[index] ?? null;
          options.onStep?.(a, b, index);
          const step = a?.lead ? a : (b ?? a);
          if (!step) return;
          this.emitNote({
            source,
            index,
            label: step.label,
            frequency: step.lead?.frequency ?? 0,
            midi: step.lead?.midi ?? 0,
            name: step.lead?.name ?? "—",
            caption: [a?.caption, b?.caption].filter(Boolean).join(" "),
            trace: traceFromStep(step === a ? left : right, step),
            layer: step.traces.find((item) => item.layer === "pitch") ?? null,
            step,
          });
        },
        onEnded: options.onEnded,
      },
      options.startAt ?? 0,
    );
  }

  /** Glide one voice to this note. Used when a hand moves across a NASA image. */
  touch(event: Pick<SonicEvent, "frequency" | "gain" | "filterHz">): void {
    if (!this.context || !this.master) return;
    // A hand on a picture pauses whatever was playing, so it can be resumed after.
    this.pause();
    const now = this.context.currentTime;
    if (!this.touchOsc || !this.touchGain || !this.touchFilter) {
      const oscillator = this.context.createOscillator();
      oscillator.type = "sine";
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      const gain = this.context.createGain();
      gain.gain.value = 0.0001;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      oscillator.start();
      oscillator.onended = () => {
        oscillator.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      this.touchOsc = oscillator;
      this.touchFilter = filter;
      this.touchGain = gain;
    }
    const level = Math.max(0.0001, Math.min(0.22, event.gain));
    this.touchOsc.frequency.setTargetAtTime(event.frequency, now, 0.03);
    this.touchFilter.frequency.setTargetAtTime(Math.max(200, event.filterHz), now, 0.04);
    this.touchGain.gain.setTargetAtTime(level, now, 0.03);
    const midi = frequencyToMidi(event.frequency);
    if (this.state.touch !== event.frequency) this.setState({ touch: event.frequency });
    this.emitNote({ source: "touch", index: 0, label: "Hand", frequency: event.frequency, midi, name: midiName(midi), caption: "", trace: null, layer: null, step: null });
  }

  releaseTouch(): void {
    if (!this.context || !this.touchGain || !this.touchOsc) return;
    const now = this.context.currentTime;
    const gain = this.touchGain;
    const oscillator = this.touchOsc;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    oscillator.stop(now + 0.06);
    this.touchOsc = null;
    this.touchGain = null;
    this.touchFilter = null;
    this.setState({ touch: null });
    if (!this.cursor) this.emitNote(null);
  }

  /** Stop the run where it is; resume() carries on from the same step. */
  pause(): void {
    if (!this.spec || !this.cursor) return;
    this.stopVoices();
    this.setState({ status: "paused", playing: false });
  }

  /** Resume a paused run, or start an ended one again from the top. */
  async resume(): Promise<void> {
    const spec = this.spec;
    if (!spec || this.cursor) return;
    await this.ensure();
    if (this.spec !== spec) return;
    this.start(spec, this.state.status === "ended" ? 0 : (this.state.index ?? 0));
  }

  /** Jump to a step. While playing it plays on from there; otherwise it moves the paused position. */
  seek(index: number): void {
    const spec = this.spec;
    if (!spec) return;
    const target = Math.min(spec.length - 1, Math.max(0, Math.round(index)));
    if (this.cursor) {
      this.stopVoices();
      this.start(spec, target);
      return;
    }
    this.setState({ index: target, status: "paused" });
    spec.emit(target);
  }

  /** Fractional step of the sounding run (2.5 = halfway through step 2), for animation. Null when silent. */
  position(): number | null {
    const current = this.cursor?.current;
    if (!this.context || !current) return null;
    const progress = (this.context.currentTime - current.time) / current.duration;
    return current.index + Math.min(1, Math.max(0, progress));
  }

  /**
   * Stop and forget the current run. With a source, only that source's run is
   * stopped: a section resetting itself cannot cut off another section's sound.
   */
  stop(source?: string): void {
    if (source !== undefined && this.spec && this.spec.source !== source) {
      this.releaseTouch();
      return;
    }
    this.stopAll();
  }

  /** Stop everything this engine is sounding. */
  stopAll(): void {
    this.stopVoices();
    this.releaseTouch();
    this.spec = null;
    this.setState({ status: "idle", playing: false, source: null, title: null, index: null, length: 0, loop: false, stepSeconds: 0 });
  }

  // ---- Internals ---------------------------------------------------------

  private outputLevel(): number {
    return this.state.muted ? 0 : this.state.volume;
  }

  private applyOutput(): void {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(this.outputLevel(), this.context.currentTime, 0.03);
  }

  private setState(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.stateListeners) listener(this.state);
  }

  private emitNote(note: NoteEvent | null): void {
    this.note = note;
    for (const listener of this.noteListeners) listener(note);
  }

  private trackVoice(source: AudioScheduledSourceNode, gain: GainNode, end: number, nodes: AudioNode[] = [source, gain]): void {
    const uniqueNodes = [...new Set(nodes)];
    source.onended = () => uniqueNodes.forEach((node) => node.disconnect());
    this.voices.push({ source, gain, nodes: uniqueNodes, end });
  }

  private start(spec: RunSpec, startAt = 0): void {
    const context = this.context;
    if (!context) return;
    const first = Math.min(Math.max(0, Math.floor(startAt)), spec.length - 1);
    this.spec = spec;
    this.cursor = { next: first, nextTime: context.currentTime + 0.06, queue: [], endTime: 0, current: null };
    this.setState({
      status: "playing",
      playing: true,
      source: spec.source,
      title: spec.title,
      index: first,
      length: spec.length,
      loop: spec.loop,
      stepSeconds: spec.duration(),
    });
    this.tick();
    this.timer = window.setInterval(this.tick, TICK_MS);
  }

  private tick = (): void => {
    const context = this.context;
    const spec = this.spec;
    const cursor = this.cursor;
    if (!context || !spec || !cursor) return;
    const now = context.currentTime;
    const hidden = typeof document !== "undefined" && document.hidden;
    while (cursor.nextTime < now + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD) && (spec.loop || cursor.next < spec.length)) {
      const index = cursor.next % spec.length;
      const duration = spec.duration();
      spec.schedule(index, cursor.nextTime, duration);
      cursor.queue.push({ index, time: cursor.nextTime, duration });
      cursor.nextTime += duration;
      cursor.endTime = cursor.nextTime;
      cursor.next = spec.loop ? (cursor.next + 1) % spec.length : cursor.next + 1;
    }
    let current: Cursor["current"] = null;
    while (cursor.queue.length > 0 && cursor.queue[0].time <= now) current = cursor.queue.shift()!;
    if (current) {
      cursor.current = current;
      this.setState({ index: current.index, stepSeconds: current.duration });
      spec.emit(current.index);
    }
    this.voices = this.voices.filter((voice) => voice.end > now);
    if (!spec.loop && cursor.next >= spec.length && cursor.queue.length === 0 && now >= cursor.endTime) {
      this.stopTimer();
      this.setState({ status: "ended", playing: false });
      this.emitNote(null);
      spec.onEnded?.();
    }
  };

  private stopTimer(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.cursor = null;
  }

  private stopVoices(): void {
    const hadRun = this.cursor !== null;
    this.stopTimer();
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        voice.source.stop(now + 0.045);
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
    if (hadRun) this.emitNote(null);
  }

  private scheduleLegacy(event: SonicEvent, time: number, step: number, master: GainNode): void {
    const context = this.context;
    if (!context) return;
    const release = time + step * 1.02;
    const peak = Math.max(0.001, Math.min(0.22, event.gain * 0.55));
    this.voice(event.wave, event.frequency, peak, event.filterHz, time, release, master);
    if (event.noise > 0.08 && this.noise) {
      const source = context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 900;
      const gain = context.createGain();
      const level = Math.max(0.001, Math.min(0.06, event.noise * 0.08));
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(level, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, release);
      source.connect(highpass);
      highpass.connect(gain);
      gain.connect(master);
      source.start(time);
      source.stop(release + 0.02);
      this.trackVoice(source, gain, release + 0.02, [source, highpass, gain]);
    }
    if (event.accent) {
      this.voice("sine", event.frequency * 2, Math.min(0.1, peak), 4000, time, time + 0.14, master);
    }
    if (event.harmony && event.harmonyGain > 0) {
      this.voice("sine", event.harmony, Math.min(0.06, event.harmonyGain), 2200, time, release, master);
    }
  }

  private voice(type: OscillatorType, frequency: number, peak: number, filterHz: number, time: number, release: number, master: GainNode): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.max(120, filterHz), time);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(release, time + 0.05));
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscillator.start(time);
    oscillator.stop(release + 0.02);
    this.trackVoice(oscillator, gain, release + 0.02, [oscillator, filter, gain]);
  }
}

export const ENGINE_PREFS_KEY = "synesthesia.engine.v1";

type PrefStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Restore volume, mute and playback rate from storage and keep them saved.
 * Returns the unsubscribe function.
 */
export function persistEnginePrefs(engine: SonificationEngine, store: PrefStore): () => void {
  try {
    const saved = JSON.parse(store.getItem(ENGINE_PREFS_KEY) ?? "null") as Partial<EngineState> | null;
    if (saved && typeof saved === "object") {
      if (typeof saved.volume === "number") engine.setVolume(saved.volume);
      if (typeof saved.muted === "boolean") engine.setMuted(saved.muted);
      if (typeof saved.rate === "number") engine.setRate(saved.rate);
    }
  } catch {
    /* corrupt or blocked storage: keep the defaults */
  }
  let last = "";
  return engine.subscribe((state) => {
    const text = JSON.stringify({ volume: state.volume, muted: state.muted, rate: state.rate });
    if (text === last) return;
    last = text;
    try {
      store.setItem(ENGINE_PREFS_KEY, text);
    } catch {
      /* storage full or disabled */
    }
  });
}
