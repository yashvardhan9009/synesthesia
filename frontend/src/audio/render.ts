import { INSTRUMENTS, type LabConfig, type LayerMix } from "./labConfig.ts";
import { LAYERS, type LayerId } from "./mappings.ts";
import type { SoundStep } from "./soundscape.ts";

/**
 * Turns one soundscape step into Web Audio nodes. It takes any BaseAudioContext,
 * so live playback and the offline WAV render share exactly the same sound.
 */

export type Track = (source: AudioScheduledSourceNode, gain: GainNode, end: number, nodes?: AudioNode[]) => void;

type Bus = { input: GainNode; pan: StereoPannerNode | null };

/** Intensity and modulation are not sounds of their own: their level is how strongly the data acts. */
export const MODIFIER_LAYERS: readonly LayerId[] = ["intensity", "modulation"];

export function layerGain(mix: LayerMix): number {
  return mix.on ? Math.min(1, Math.max(0, mix.level)) : 0;
}

/** Wind's effect, scaled by the intensity layer's level: 0 leaves the gain at 1. */
export function scaledEffect(effect: number, mix: LayerMix): number {
  return 1 - layerGain(mix) * (1 - effect);
}

export class Mixer {
  private buses = new Map<LayerId, Bus>();
  private layers: Record<LayerId, LayerMix>;

  constructor(private context: BaseAudioContext, destination: AudioNode, layers: Record<LayerId, LayerMix>) {
    this.layers = layers;
    for (const layer of LAYERS) {
      const input = context.createGain();
      let pan: StereoPannerNode | null = null;
      if (typeof context.createStereoPanner === "function") {
        pan = context.createStereoPanner();
        input.connect(pan);
        pan.connect(destination);
      } else {
        input.connect(destination);
      }
      this.buses.set(layer, { input, pan });
    }
    this.update(layers, 0);
  }

  /** Change levels and pans; live playback hears it within ~50 ms. */
  update(layers: Record<LayerId, LayerMix>, glide = 0.05): void {
    this.layers = layers;
    const now = this.context.currentTime;
    for (const layer of LAYERS) {
      const bus = this.buses.get(layer);
      if (!bus) continue;
      const mix = layers[layer];
      const level = MODIFIER_LAYERS.includes(layer) ? 1 : layerGain(mix);
      if (glide > 0) bus.input.gain.setTargetAtTime(level, now, glide);
      else bus.input.gain.value = level;
      if (bus.pan) {
        if (glide > 0) bus.pan.pan.setTargetAtTime(mix.pan, now, glide);
        else bus.pan.pan.value = mix.pan;
      }
    }
  }

  mix(layer: LayerId): LayerMix {
    return this.layers[layer];
  }

  input(layer: LayerId): GainNode {
    return this.buses.get(layer)!.input;
  }

  disconnect(): void {
    for (const bus of this.buses.values()) {
      bus.input.disconnect();
      bus.pan?.disconnect();
    }
  }
}

/** Seeded white noise, so a rendered postcard is identical every time. */
export function noiseBuffer(context: BaseAudioContext, seconds = 1, seed = 0x5eed): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let index = 0; index < length; index += 1) {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    channel[index] = (state / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

type Env = { attack: number; peak: number; end: number };

function envelope(gain: GainNode, time: number, env: Env): void {
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, env.peak), time + Math.max(0.002, env.attack));
  gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(env.end, time + env.attack + 0.02));
}

export type StepOptions = {
  context: BaseAudioContext;
  mixer: Mixer;
  noise: AudioBuffer;
  config: LabConfig;
  step: SoundStep;
  time: number;
  duration: number;
  heartbeat: boolean;
  track: Track;
};

function tone(
  { context, track }: Pick<StepOptions, "context" | "track">,
  destination: AudioNode,
  wave: OscillatorType,
  frequency: number,
  time: number,
  env: Env,
  cutoffHz = 8000,
): OscillatorNode {
  const oscillator = context.createOscillator();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, time);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(16000, Math.max(120, cutoffHz)), time);
  const gain = context.createGain();
  envelope(gain, time, env);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  oscillator.start(time);
  oscillator.stop(env.end + 0.03);
  track(oscillator, gain, env.end + 0.03, [oscillator, filter, gain]);
  return oscillator;
}

function burst(
  { context, noise, track }: Pick<StepOptions, "context" | "noise" | "track">,
  destination: AudioNode,
  time: number,
  env: Env,
  filterType: BiquadFilterType,
  cutoffHz: number,
  q = 0.8,
): void {
  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(cutoffHz, time);
  filter.Q.value = q;
  const gain = context.createGain();
  envelope(gain, time, env);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  // A different offset per call, so overlapping beds do not phase-cancel.
  source.start(time, (time * 0.618) % Math.max(0.01, noise.duration - 0.01));
  source.stop(env.end + 0.03);
  track(source, gain, env.end + 0.03, [source, filter, gain]);
}

/** Schedule every layer of one step. */
export function renderStep(options: StepOptions): void {
  const { context, mixer, config, step, time, duration } = options;
  const instrument = INSTRUMENTS[config.instrument];
  const intensity = scaledEffect(step.intensity.gain, mixer.mix("intensity"));
  const brightness = scaledEffect(step.intensity.brightness, mixer.mix("intensity"));
  const noteEnd = time + duration * instrument.sustain;

  if (step.lead) {
    const peak = 0.2 * intensity;
    const cutoff = (900 + step.lead.frequency * 3) * brightness * instrument.brightness;
    const lead = tone(options, mixer.input("pitch"), instrument.wave, step.lead.frequency, time, { attack: instrument.attack, peak, end: noteEnd }, cutoff);
    const depth = step.vibrato ? step.vibrato.depthCents * layerGain(mixer.mix("modulation")) : 0;
    if (step.vibrato && depth > 0.5) {
      const lfo = context.createOscillator();
      lfo.frequency.setValueAtTime(step.vibrato.rateHz, time);
      const amount = context.createGain();
      amount.gain.setValueAtTime(depth, time);
      lfo.connect(amount);
      amount.connect(lead.detune);
      lfo.start(time);
      lfo.stop(noteEnd + 0.03);
      options.track(lfo, amount, noteEnd + 0.03, [lfo, amount]);
    }
    if (instrument.partial) {
      tone(options, mixer.input("pitch"), "sine", step.lead.frequency * instrument.partial, time, { attack: 0.003, peak: peak * 0.18, end: time + Math.min(duration, 0.35) });
    }
    for (const frequency of step.voices) {
      tone(options, mixer.input("density"), "triangle", frequency, time, { attack: Math.max(0.03, instrument.attack), peak: 0.05 * intensity, end: noteEnd }, 2400 * brightness);
    }
  }

  for (let hit = 0; hit < step.hits; hit += 1) {
    const at = time + (hit * duration) / Math.max(1, step.hits);
    burst(options, mixer.input("rhythm"), at, { attack: 0.002, peak: 0.16, end: at + 0.07 }, "bandpass", 2400, 1.4);
    tone(options, mixer.input("rhythm"), "sine", 170, at, { attack: 0.002, peak: 0.12, end: at + 0.09 });
  }

  if (step.texture) {
    burst(options, mixer.input("texture"), time, { attack: duration * 0.3, peak: step.texture.level, end: time + duration * 1.15 }, "lowpass", step.texture.cutoffHz, 0.5);
  }

  for (const bell of step.bells) {
    const peak = 0.06 + 0.1 * bell.level;
    tone(options, mixer.input("anomaly"), "sine", bell.frequency, time, { attack: 0.003, peak, end: time + 1.4 });
    tone(options, mixer.input("anomaly"), "sine", bell.frequency * 2.76, time, { attack: 0.002, peak: peak * 0.3, end: time + 0.5 });
  }

  if (options.heartbeat) {
    const peak = 0.3 * step.pulse;
    tone(options, mixer.input("pulse"), "sine", 55, time, { attack: 0.006, peak, end: time + 0.16 });
    tone(options, mixer.input("pulse"), "sine", 49, time + 0.2, { attack: 0.006, peak: peak * 0.7, end: time + 0.36 });
  }
}

/** The output chain both renderers use: master gain into a gentle compressor. */
export function outputChain(context: BaseAudioContext, destination: AudioNode, level: number): GainNode {
  const master = context.createGain();
  master.gain.value = level;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.12;
  master.connect(compressor);
  compressor.connect(destination);
  return master;
}
