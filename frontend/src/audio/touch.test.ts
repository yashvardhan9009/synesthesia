import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../types.ts";
import { blueMarbleTouch } from "./touch.ts";

describe("blueMarbleTouch", () => {
  it("waits for the image", () => {
    const result = blueMarbleTouch({ lat: 10, lon: -20, luminance: null }, DEFAULT_SETTINGS);
    expect(result.note).toBeNull();
    expect(result.caption).toContain("still loading");
  });
  it("plays brighter pixels higher and says it is an image value", () => {
    const dark = blueMarbleTouch({ lat: 0, lon: 0, luminance: 0.1 }, DEFAULT_SETTINGS).note!;
    const bright = blueMarbleTouch({ lat: 0, lon: 0, luminance: 0.9 }, DEFAULT_SETTINGS);
    expect(bright.note!.frequency).toBeGreaterThan(dark.frequency);
    expect(bright.caption).toContain("not a temperature");
    expect(bright.caption).toContain("0.0°N 0.0°E");
  });
});
