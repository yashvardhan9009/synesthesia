import { describe, expect, it } from "vitest";
import { shouldAnnounce } from "./announce.ts";

describe("spoken captions", () => {
  it("speaks anything new when nothing is playing", () => {
    expect(shouldAnnounce("Jukebox.", "", 0, 0, false)).toBe(true);
    expect(shouldAnnounce("Jukebox.", "Jukebox.", 0, 0, false)).toBe(false);
  });
  it("thins per-note captions while playing", () => {
    expect(shouldAnnounce("Step 2 is heard as C4.", "Step 1", 1000, 0, true)).toBe(false);
    expect(shouldAnnounce("Step 6 is heard as C4.", "Step 1", 3200, 0, true)).toBe(true);
  });
  it("never holds back an outlier or an error", () => {
    expect(shouldAnnounce("This step is an outlier among the others.", "Step 1", 100, 0, true)).toBe(true);
    expect(shouldAnnounce("NASA POWER could not be reached: error", "Step 1", 100, 0, true)).toBe(true);
  });
});
