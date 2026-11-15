/** 16-bit PCM WAV. Pure, so the byte layout is unit-tested. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const channelCount = Math.max(1, channels.length);
  const frames = channels.reduce((most, channel) => Math.max(most, channel.length), 0);
  const blockAlign = channelCount * 2;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channels[channel]?.[frame] ?? 0;
      const clamped = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
      view.setInt16(offset, clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff), true);
      offset += 2;
    }
  }
  return buffer;
}

/** A file name from a place and dates, safe on every OS. */
export function postcardFileName(place: string, start: string, end: string): string {
  const slug = place
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  return `synesthesia-${slug || "earth"}-${start}-${end}.wav`;
}

/**
 * Scale every channel by one factor so the loudest sample reaches `target`.
 * One factor for all channels keeps the stereo balance. Silence is left alone,
 * and quiet material is boosted by at most `maxGain`.
 */
export function normalizePeak(channels: readonly Float32Array[], target = 0.89, maxGain = 8): number {
  let peak = 0;
  for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (peak < 1e-6) return 1;
  const gain = Math.min(maxGain, target / peak);
  for (const channel of channels) for (let index = 0; index < channel.length; index += 1) channel[index] *= gain;
  return gain;
}
