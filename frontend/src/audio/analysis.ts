/** Pure helpers for the scopes. Byte arrays are what AnalyserNode returns. */

/** Hz at the centre of an FFT bin. */
export function binFrequency(bin: number, sampleRate: number, binCount: number): number {
  return (bin * sampleRate) / (2 * binCount);
}

/** Fractional bin index for a frequency. */
export function frequencyBin(frequency: number, sampleRate: number, binCount: number): number {
  return (frequency * 2 * binCount) / sampleRate;
}

/**
 * Strongest frequency in a byte spectrum, refined by parabolic interpolation.
 * Null when everything is below the floor (silence).
 */
export function peakFrequency(spectrum: ArrayLike<number>, sampleRate: number, floor = 40, minHz = 30): number | null {
  const count = spectrum.length;
  const first = Math.max(1, Math.ceil(frequencyBin(minHz, sampleRate, count)));
  let best = -1;
  let bestValue = floor;
  for (let bin = first; bin < count - 1; bin += 1) {
    if (spectrum[bin] > bestValue) {
      bestValue = spectrum[bin];
      best = bin;
    }
  }
  if (best < 0) return null;
  const left = spectrum[best - 1];
  const right = spectrum[best + 1];
  const denominator = left - 2 * bestValue + right;
  const offset = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
  return binFrequency(best + Math.max(-0.5, Math.min(0.5, offset)), sampleRate, count);
}

/** First rising crossing of the midline, so a steady tone draws still. 0 if none. */
export function triggerIndex(wave: ArrayLike<number>, limit = wave.length / 2): number {
  for (let index = 1; index < Math.min(limit, wave.length); index += 1) {
    if (wave[index - 1] < 128 && wave[index] >= 128) return index;
  }
  return 0;
}

/** Log-spaced band edges in Hz, `bands` + 1 values from low to high. */
export function logBands(bands: number, lowHz: number, highHz: number): number[] {
  const ratio = highHz / lowHz;
  return Array.from({ length: bands + 1 }, (_, index) => lowHz * ratio ** (index / bands));
}
