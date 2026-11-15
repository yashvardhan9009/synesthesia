import { describe, expect, it } from "vitest";
import { eventsFromFrames } from "../audio/build.ts";
import { DEFAULT_SETTINGS, type FrameSample, type SonicEvent, type TrackDetail } from "../types.ts";
import { scanPoint } from "./scan.ts";
import { jukeboxTracer } from "./trace.ts";
import { applyVoicing, explainTrack, voicingFor } from "./voicing.ts";

function sample(index: number, luminance: number): FrameSample {
  return {
    index,
    label: `West-to-east slice ${index + 1} of 6`,
    image_url: "",
    playhead: (index + 0.5) / 6,
    luminance,
    warmth: 0.5,
    contrast: 0.2,
    red: luminance,
    green: luminance,
    blue: luminance,
  };
}

// SYNTHETIC samples for unit tests only.
const samples = [0.1, 0.2, 0.15, 0.18, 0.95, 0.2].map((value, index) => sample(index, value));
const detail: TrackDetail = {
  svs_id: 5313,
  title: "Test frame",
  page_url: "https://svs.gsfc.nasa.gov/5313/",
  poster_url: "",
  kind: "image",
  pitch_from: "luminance",
  reading: "",
  nasa_description: null,
  description_error: null,
  release_date: null,
  method: "spatial-scan",
  warning: null,
  source_url: "",
  measured: "",
  samples,
};
const events = eventsFromFrames(detail.title, samples, "luminance", DEFAULT_SETTINGS);

describe("voicing", () => {
  it("gives every EIC frame its own soundscape", () => {
    const names = [5313, 3912, 5669, 5533, 5425, 5196, 5011, 4960, 4950].map((id) => voicingFor(id).name);
    expect(new Set(names).size).toBe(9);
    expect(voicingFor(1).name).toBe("Plain");
  });
  it("never changes what was measured", () => {
    const voiced = applyVoicing(events, voicingFor(5011));
    voiced.forEach((event, index) => {
      expect(event.frequency).toBe(events[index].frequency);
      expect(event.gain).toBe(events[index].gain);
      expect(event.filterHz).toBe(events[index].filterHz);
      expect(event.accent).toBe(events[index].accent);
      expect(event.sourceIndex).toBe(events[index].sourceIndex);
    });
  });
  it("keeps outliers distinct and adds harmony by ratio", () => {
    const voiced = applyVoicing(events, voicingFor(5313));
    const outlier = voiced.find((event) => event.accent);
    expect(outlier?.wave).toBe("triangle");
    expect(voiced[0].wave).toBe("sine");
    expect(voiced[0].harmony).toBeCloseTo(voiced[0].frequency * 2);
  });
  it("explains the sound in four parts, naming the soundscape", () => {
    const lines = explainTrack(detail, "luminance");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("6 vertical slices");
    expect(lines[3]).toContain("Night choir");
    expect(lines[3]).toContain("carries no data");
  });
});

describe("scan line", () => {
  const evts: SonicEvent[] = events;
  it("sweeps across the slice that is sounding", () => {
    expect(scanPoint(0, evts, 6, false)).toEqual({ source: 0, x: 0, band: { from: 0, to: 1 / 6 } });
    expect(scanPoint(2.5, evts, 6, false)?.x).toBeCloseTo(2.5 / 6);
  });
  it("rests mid-slice with reduced motion", () => {
    expect(scanPoint(2.9, evts, 6, true)?.x).toBeCloseTo(2.5 / 6);
  });
  it("clamps at the end and refuses empty input", () => {
    expect(scanPoint(99, evts, 6, false)?.source).toBe(5);
    expect(scanPoint(1, [], 6, false)).toBeNull();
  });
});

describe("jukebox trace", () => {
  it("leads from the note back to the slice and its scaling", () => {
    const tracer = jukeboxTracer(detail, "luminance", events, DEFAULT_SETTINGS.anomalyZ);
    const spike = events.findIndex((event) => event.sourceIndex === 4);
    const trace = tracer(spike);
    expect(trace?.where).toBe("West-to-east slice 5 of 6");
    expect(trace?.measured[0]).toEqual({ name: "Brightness", value: "0.950", unit: "0–1" });
    expect(trace?.normalized).toBe(1);
    expect(trace?.outlier).toBe(true);
    expect(trace?.z ?? 0).toBeGreaterThan(DEFAULT_SETTINGS.anomalyZ);
    expect(trace?.frequency).toBe(events[spike].frequency);
    expect(tracer(99)).toBeNull();
  });
});
