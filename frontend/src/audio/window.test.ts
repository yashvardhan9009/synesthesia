import { describe, expect, it } from "vitest";
import { defaultSoundscapeMonth, latestCompleteMonth, monthWindow } from "./window.ts";

describe("monthWindow", () => {
  it("covers the whole month, leap years included", () => {
    expect(monthWindow("2024-02")).toEqual({ start: "20240201", end: "20240229" });
    expect(monthWindow("2025-02")).toEqual({ start: "20250201", end: "20250228" });
    expect(monthWindow("2025-12")).toEqual({ start: "20251201", end: "20251231" });
  });
  it("rejects bad input and months before POWER begins", () => {
    expect(monthWindow("2025-13")).toBeNull();
    expect(monthWindow("June")).toBeNull();
    expect(monthWindow("1975-01")).toBeNull();
  });
});

describe("latestCompleteMonth", () => {
  it("is two months back, across a year boundary", () => {
    expect(latestCompleteMonth(new Date("2026-11-15T00:00:00Z"))).toBe("2026-09");
    expect(latestCompleteMonth(new Date("2026-01-10T00:00:00Z"))).toBe("2025-11");
  });
});

describe("defaultSoundscapeMonth", () => {
  it("is five months back", () => {
    expect(defaultSoundscapeMonth(new Date("2026-11-15T00:00:00Z"))).toBe("2026-06");
  });
});
