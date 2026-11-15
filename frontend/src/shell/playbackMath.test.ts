import { describe, expect, it } from "vitest";
import { noteLabel } from "../science/score.ts";
import { formatDuration, formatRate, progressOf } from "./playbackMath.ts";

describe("dock readouts", () => {
  it("reports progress with the sounding step reached", () => {
    expect(progressOf(null, 10)).toBe(0);
    expect(progressOf(0, 10)).toBeCloseTo(0.1);
    expect(progressOf(9, 10)).toBe(1);
    expect(progressOf(3, 0)).toBe(0);
  });
  it("names a frequency", () => {
    expect(noteLabel(440)).toEqual({ note: "A4", hz: "440.0 Hz" });
    expect(noteLabel(261.63)?.note).toBe("C4");
    expect(noteLabel(null)).toBeNull();
    expect(noteLabel(0)).toBeNull();
  });
  it("formats speed and duration", () => {
    expect(formatRate(1)).toBe("1×");
    expect(formatRate(0.75)).toBe("0.75×");
    expect(formatDuration(24, 60 / 96)).toBe("0:15");
    expect(formatDuration(200, 1)).toBe("3:20");
  });
});
