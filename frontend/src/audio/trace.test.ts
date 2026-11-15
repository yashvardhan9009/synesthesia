import { describe, expect, it } from "vitest";
import type { SonicEvent } from "../types.ts";
import { describeGenerated, traceFromEvent, traceSentence } from "./trace.ts";

const event: SonicEvent = {
  sourceIndex: 3,
  label: "12 Jun 2026",
  caption: "",
  frequency: 440,
  gain: 0.3,
  filterHz: 1000,
  noise: 0.3,
  accent: true,
  wave: "triangle",
  harmony: 660,
  harmonyGain: 0.05,
};

describe("trace", () => {
  it("lists what the instrument added", () => {
    expect(describeGenerated(event)).toEqual([
      "triangle oscillator (timbre)",
      "octave ping on an outlier",
      "a fifth above, as harmony",
      "filtered noise texture",
    ]);
  });
  it("names the harmony interval it actually used", () => {
    expect(describeGenerated({ ...event, harmony: 880, accent: false, noise: 0 })).toEqual(["triangle oscillator (timbre)", "an octave above, as harmony"]);
    expect(describeGenerated({ ...event, harmony: 220, accent: false, noise: 0 })[1]).toBe("an octave below, as harmony");
  });
  it("falls back to the event when a section gives no trace", () => {
    const trace = traceFromEvent(event, "NASA POWER", 2.5);
    expect(trace.where).toBe("12 Jun 2026");
    expect(trace.outlier).toBe(true);
    expect(trace.measured).toEqual([]);
  });
  it("uses an audio-lane trace when the event carries one", () => {
    const withTrace = { ...event, trace: { measured: [{ name: "T2M", value: "31.2", unit: "°C" }], z: 2.8 } };
    const trace = traceFromEvent(withTrace, "NASA POWER", 2.5);
    expect(trace.measured[0].name).toBe("T2M");
    expect(trace.z).toBe(2.8);
  });
  it("reads as one sentence", () => {
    const sentence = traceSentence({
      ...traceFromEvent(event, "NASA POWER", 2.5),
      measured: [{ name: "T2M", value: "31.2", unit: "°C" }],
      normalized: 0.8,
      z: 2.81,
    });
    expect(sentence).toBe(
      "NASA POWER, 12 Jun 2026. Measured T2M 31.2 °C. Scaled to 0.80 of this series' range. Robust z 2.81, an outlier at |z| ≥ 2.5. Heard as A4, 440.0 Hz.",
    );
  });
});
