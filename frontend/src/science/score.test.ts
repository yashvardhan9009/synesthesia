import { describe, expect, it } from "vitest";
import { CHANGE_FULL_SCALE_C, SCALES, changeReferenceMidi, changeToMidi, midiName, scoreSample, valueToMidi } from "./score.ts";

describe("valueToMidi", () => {
  it("lands both ends of the range on the tonic", () => {
    expect(valueToMidi(0, "pentatonic", 48, 2)).toBe(48);
    expect(valueToMidi(1, "pentatonic", 48, 2)).toBe(48 + 24);
  });

  it("uses only notes that belong to the scale", () => {
    for (let step = 0; step <= 20; step += 1) {
      const midi = valueToMidi(step / 20, "pentatonic", 60, 2);
      const degree = ((midi - 60) % 12 + 12) % 12;
      expect(SCALES.pentatonic).toContain(degree);
    }
  });
});

describe("scoreSample", () => {
  it("names middle C and concert A", () => {
    expect(midiName(60)).toBe("C4");
    expect(midiName(69)).toBe("A4");
  });

  it("skips a missing sample instead of inventing a note", () => {
    expect(
      scoreSample({
        norm: null,
        z: null,
        scale: "pentatonic",
        rootMidi: 48,
        octaves: 2,
        anomalyZ: 2.5,
      }),
    ).toBeNull();
  });

  it("makes an anomaly louder than the same value in the body of the series", () => {
    const shared = { norm: 0.4, scale: "pentatonic" as const, rootMidi: 48, octaves: 2, anomalyZ: 2.5 };
    const calm = scoreSample({ ...shared, z: 0.2 });
    const flagged = scoreSample({ ...shared, z: 4 });
    expect(flagged!.accent).toBe(true);
    expect(calm!.accent).toBe(false);
    expect(flagged!.gain).toBeGreaterThan(calm!.gain);
    expect(flagged!.frequency).toBeGreaterThan(40);
  });
});

describe("changeToMidi", () => {
  it("plays zero change at the fixed reference tonic", () => {
    expect(changeReferenceMidi(48, 2)).toBe(60);
    expect(changeToMidi(0, "pentatonic", 48, 2)).toBe(60);
    expect(changeToMidi(0, "chromatic", 48, 3)).toBe(changeReferenceMidi(48, 3));
  });

  it("puts warmer above and cooler below, symmetrically", () => {
    for (const delta of [0.8, 2, 4.5, 7]) {
      const up = changeToMidi(delta, "chromatic", 48, 2);
      const down = changeToMidi(-delta, "chromatic", 48, 2);
      expect(up).toBeGreaterThan(60);
      expect(down).toBeLessThan(60);
      expect(up - 60).toBe(60 - down);
    }
  });

  it("does not depend on the other changes and clamps at the full scale", () => {
    expect(changeToMidi(CHANGE_FULL_SCALE_C, "pentatonic", 48, 2)).toBe(72);
    expect(changeToMidi(-CHANGE_FULL_SCALE_C, "pentatonic", 48, 2)).toBe(48);
    expect(changeToMidi(40, "pentatonic", 48, 2)).toBe(72);
    expect(changeToMidi(-40, "pentatonic", 48, 2)).toBe(48);
  });

  it("stays on scale notes", () => {
    for (let delta = -10; delta <= 10; delta += 0.7) {
      const midi = changeToMidi(delta, "major", 50, 2);
      expect(SCALES.major).toContain((((midi - 50) % 12) + 12) % 12);
    }
  });
});
