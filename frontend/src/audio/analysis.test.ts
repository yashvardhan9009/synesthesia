import { describe, expect, it } from "vitest";
import { binFrequency, frequencyBin, logBands, peakFrequency, triggerIndex } from "./analysis.ts";

describe("spectrum helpers", () => {
  it("converts between bins and Hz", () => {
    expect(binFrequency(1024, 48000, 1024)).toBe(24000);
    expect(frequencyBin(binFrequency(37, 44100, 1024), 44100, 1024)).toBeCloseTo(37, 10);
  });

  it("finds the peak and refines it between bins", () => {
    const spectrum = new Uint8Array(1024);
    const bin = Math.round(frequencyBin(440, 48000, 1024));
    spectrum[bin - 1] = 180;
    spectrum[bin] = 240;
    spectrum[bin + 1] = 180;
    expect(peakFrequency(spectrum, 48000)).toBeCloseTo(binFrequency(bin, 48000, 1024), 6);
    spectrum[bin + 1] = 230;
    expect(peakFrequency(spectrum, 48000)!).toBeGreaterThan(binFrequency(bin, 48000, 1024));
  });

  it("returns null for silence", () => {
    expect(peakFrequency(new Uint8Array(1024), 48000)).toBeNull();
  });

  it("makes log-spaced bands", () => {
    const bands = logBands(2, 100, 10000);
    expect(bands[0]).toBeCloseTo(100);
    expect(bands[1]).toBeCloseTo(1000);
    expect(bands[2]).toBeCloseTo(10000);
  });
});

describe("triggerIndex", () => {
  it("finds the first rising midline crossing", () => {
    expect(triggerIndex([140, 120, 110, 130, 150], 5)).toBe(3);
    expect(triggerIndex([128, 128, 128])).toBe(0);
  });
});
