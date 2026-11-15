import { Mixer, noiseBuffer, outputChain, renderStep } from "./render.ts";
import { stepSeconds, type Soundscape } from "./soundscape.ts";
import { encodeWav, normalizePeak, postcardFileName } from "./wav.ts";

/** Longest postcard, in seconds. */
export const POSTCARD_MAX_SECONDS = 30;

export type Postcard = { blob: Blob; fileName: string; seconds: number; steps: number };

/**
 * Render a soundscape offline, with the same nodes as live playback, into a WAV.
 * The noise is seeded, so the same soundscape always gives the same file. The
 * result is peak-normalized to about −1 dBFS so it plays at a useful level.
 */
export async function renderPostcard(scape: Soundscape, options: { sampleRate?: number; heartbeat?: boolean; volume?: number } = {}): Promise<Postcard> {
  const Offline =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error("This browser cannot render audio offline, so a postcard cannot be made here.");
  if (scape.steps.length === 0) throw new Error("This soundscape has no days to render.");
  const sampleRate = options.sampleRate ?? 44100;
  const duration = stepSeconds(scape.config.bpm);
  const steps = Math.min(scape.steps.length, Math.floor(POSTCARD_MAX_SECONDS / duration));
  const seconds = steps * duration + 1.6;
  const context = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
  const master = outputChain(context, context.destination, options.volume ?? 0.8);
  const mixer = new Mixer(context, master, scape.config.layers);
  const noise = noiseBuffer(context);
  for (let index = 0; index < steps; index += 1) {
    renderStep({
      context,
      mixer,
      noise,
      config: scape.config,
      step: scape.steps[index],
      time: 0.05 + index * duration,
      duration,
      heartbeat: options.heartbeat ?? false,
      track: () => undefined,
    });
  }
  const rendered = await context.startRendering();
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, channel) => rendered.getChannelData(channel));
  normalizePeak(channels);
  const wav = encodeWav(channels, rendered.sampleRate);
  return {
    blob: new Blob([wav], { type: "audio/wav" }),
    fileName: postcardFileName(scape.place, scape.start, scape.end),
    seconds,
    steps,
  };
}

/** Trigger a browser download of a postcard. */
export function downloadPostcard(postcard: Postcard): void {
  const url = URL.createObjectURL(postcard.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = postcard.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
