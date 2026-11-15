import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { SonificationEngine, persistEnginePrefs, type EngineState, type NoteEvent } from "../audio/engine.ts";

/**
 * A SonificationEngine with a read-only analyser beside its master bus.
 * The analyser is a listener only: nothing in the sound path changes. The
 * visuals read this, so every glow and trace on screen is the real output,
 * and silence draws as a flat line.
 */
export class TappedEngine extends SonificationEngine {
  private tap: AnalyserNode | null = null;
  private tapStream: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    super();
    // Volume, mute and speed survive a reload. Storage may be blocked; then they just do not persist.
    try {
      persistEnginePrefs(this, window.localStorage);
    } catch {
      /* no storage */
    }
  }

  override async ensure(): Promise<void> {
    await super.ensure();
    if (this.tap) return;
    const { context, master } = this;
    if (!context || !master) return;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    master.connect(analyser);
    this.tap = analyser;
  }

  analyser(): AnalyserNode | null {
    return this.tap;
  }

  sampleRate(): number {
    return this.context?.sampleRate ?? 48000;
  }

  /** Recording hook used only by the demo-capture script. Reads the same master bus. */
  async captureStream(): Promise<MediaStream | null> {
    await this.ensure();
    const { context, master } = this;
    if (!context || !master) return null;
    if (!this.tapStream) {
      this.tapStream = context.createMediaStreamDestination();
      master.connect(this.tapStream);
    }
    return this.tapStream.stream;
  }
}

export type AudioFrame = {
  wave: Uint8Array;
  spectrum: Uint8Array;
  /** 0–1 RMS of the output, 0 when silent or before audio starts. */
  level: number;
  live: boolean;
  /** The note the engine says is sounding, with its trace. */
  note: NoteEvent | null;
  sampleRate: number;
};

type Listener = (frame: AudioFrame) => void;

/** One requestAnimationFrame loop shared by every scope on the page. */
export class AudioBus {
  private listeners = new Set<Listener>();
  private raf = 0;
  private wave = new Uint8Array(1024);
  private spectrum = new Uint8Array(1024);
  private last = 0;
  slow = false;

  constructor(readonly engine: TappedEngine) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
    };
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    // Reduced motion: still drawn (it is information), but at a calm rate.
    if (this.slow && now - this.last < 160) return;
    this.last = now;
    const analyser = this.engine.analyser();
    let level = 0;
    if (analyser) {
      if (this.wave.length !== analyser.fftSize) this.wave = new Uint8Array(analyser.fftSize);
      if (this.spectrum.length !== analyser.frequencyBinCount) this.spectrum = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(this.wave);
      analyser.getByteFrequencyData(this.spectrum);
      let sum = 0;
      for (let index = 0; index < this.wave.length; index += 1) {
        const value = (this.wave[index] - 128) / 128;
        sum += value * value;
      }
      level = Math.min(1, Math.sqrt(sum / this.wave.length) * 4);
    } else {
      this.wave.fill(128);
      this.spectrum.fill(0);
    }
    const frame: AudioFrame = {
      wave: this.wave,
      spectrum: this.spectrum,
      level,
      live: level > 0.01,
      note: this.engine.currentNote(),
      sampleRate: this.engine.sampleRate(),
    };
    for (const listener of this.listeners) listener(frame);
  };
}

export const AudioBusContext = createContext<AudioBus | null>(null);

export function useAudioFrame(onFrame: Listener): void {
  const bus = useContext(AudioBusContext);
  const ref = useRef(onFrame);
  ref.current = onFrame;
  useEffect(() => {
    if (!bus) return;
    return bus.subscribe((frame) => ref.current(frame));
  }, [bus]);
}

/** Playing, source, step index, volume, mute and rate of the engine, as React state. */
export function useEngineState(engine: SonificationEngine): EngineState {
  const subscribe = useCallback((notify: () => void) => engine.subscribe(notify), [engine]);
  return useSyncExternalStore(subscribe, () => engine.getState());
}

/** The note the engine is sounding now, with its trace. Null when silent. */
export function useCurrentNote(engine: SonificationEngine): NoteEvent | null {
  const subscribe = useCallback((notify: () => void) => engine.onNote(notify), [engine]);
  return useSyncExternalStore(subscribe, () => engine.currentNote());
}
