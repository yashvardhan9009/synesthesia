import { describe, expect, it } from "vitest";
import type { PowerBaseline } from "../api.ts";
import type { PowerSeries } from "../types.ts";
import { cellAt, cellCenter, cellName, MAP_COLS, MAP_ROWS, mapSoundscape, moveCell, regionSound, TOURS } from "./soundMap.ts";

// SYNTHETIC day and baseline, not NASA observations.
function day(t2m: number | null): PowerSeries {
  const date = "20260715";
  const point = (value: number | null) => [{ date, value }];
  return {
    latitude: 0, longitude: 15, start: date, end: date, request_url: "https://power.example/day", source: "SYNTHETIC",
    parameters: { T2M: point(t2m), PRECTOTCORR: point(0), WS2M: point(3), RH2M: point(50), PS: point(99), CLOUD_AMT: point(40) },
    units: { T2M: "C" }, longnames: {}, messages: [], fill_value: -999, header_title: null, dates: [date],
  };
}
const normal = (mean: number, sd: number) => ({ n: 300, mean, sd, p10: mean - sd, p50: mean, p90: mean + sd });
const baseline = {
  latitude: 0, longitude: 15, period: [2001, 2020], half_window: 7, request_url: "", source: "SYNTHETIC", units: {}, longnames: {}, messages: [],
  days: { T2M: { "0715": normal(25, 1.5) }, PS: { "0715": normal(100, 0.5) }, WS2M: { "0715": normal(3, 1) } },
} as PowerBaseline;

describe("map geometry", () => {
  it("samples the centre of each region", () => {
    expect(cellCenter({ row: 0, col: 0 })).toEqual({ lat: 72, lon: -165 });
    expect(cellCenter({ row: 2, col: 6 })).toEqual({ lat: 0, lon: 15 });
    expect(cellName({ row: 4, col: 11 })).toBe("72°S 165°E");
  });

  it("finds the region under a point and clamps the edges", () => {
    expect(cellAt(0.5, 0.5)).toEqual({ row: 2, col: 6 });
    expect(cellAt(1, 1)).toEqual({ row: MAP_ROWS - 1, col: MAP_COLS - 1 });
    expect(cellAt(-0.2, 0)).toEqual({ row: 0, col: 0 });
  });

  it("moves with the arrow keys, wrapping east–west and stopping at the poles", () => {
    expect(moveCell({ row: 2, col: 0 }, "ArrowLeft")).toEqual({ row: 2, col: 11 });
    expect(moveCell({ row: 2, col: 11 }, "ArrowRight")).toEqual({ row: 2, col: 0 });
    expect(moveCell({ row: 0, col: 3 }, "ArrowUp")).toEqual({ row: 0, col: 3 });
    expect(moveCell({ row: 4, col: 3 }, "ArrowDown")).toEqual({ row: 4, col: 3 });
    expect(moveCell({ row: 1, col: 3 }, "End")).toEqual({ row: 1, col: 11 });
    expect(moveCell({ row: 1, col: 3 }, "a")).toBeNull();
  });

  it("tours visit real regions", () => {
    expect(TOURS.equator.cells()).toHaveLength(12);
    expect(TOURS.globe.cells()).toHaveLength(60);
    expect(new Set(TOURS.globe.cells().map((cell) => `${cell.row}-${cell.col}`)).size).toBe(60);
    expect(TOURS.meridian.cells()[0]).toEqual({ row: 0, col: 6 });
  });
});

describe("regionSound (SYNTHETIC)", () => {
  it("plays fixed-range pitch, so a warmer region sounds higher", () => {
    const cool = regionSound({ row: 2, col: 6 }, day(10), baseline)!;
    const warm = regionSound({ row: 2, col: 6 }, day(30), baseline)!;
    expect(warm.step.lead!.frequency).toBeGreaterThan(cool.step.lead!.frequency);
  });

  it("rings bells against the point's normal and sets vibrato from the pressure departure", () => {
    const region = regionSound({ row: 2, col: 6 }, day(30), baseline)!;
    expect(region.step.bells.map((bell) => bell.variable).sort()).toEqual(["PS", "T2M"]);
    expect(region.step.vibrato!.depthCents).toBeGreaterThan(0);
    expect(region.step.caption).toContain("Unusual against normal");
    expect(region.step.caption).toContain("1.00 kPa below normal");
    expect(region.step.traces.some((trace) => trace.layer === "pulse")).toBe(false);
    expect(region.step.requestUrl).toBe("https://power.example/day");
    expect(region.basis).toBe("8 Jul – 22 Jul in 2001–2020");
  });

  it("without a baseline rings no bell and says so", () => {
    const region = regionSound({ row: 2, col: 6 }, day(30), null)!;
    expect(region.step.bells).toHaveLength(0);
    expect(region.step.vibrato).toBeNull();
    expect(region.step.caption).toContain("No 2001–2020 baseline");
  });

  it("keeps a missing temperature silent", () => {
    const region = regionSound({ row: 2, col: 6 }, day(null), baseline)!;
    expect(region.step.lead).toBeNull();
    expect(region.step.missing).toContain("T2M");
  });

  it("joins regions into one tour in order", () => {
    const a = regionSound({ row: 2, col: 0 }, day(20), baseline)!;
    const b = regionSound({ row: 2, col: 1 }, day(25), baseline)!;
    const scape = mapSoundscape([a, b], "Tour");
    expect(scape.steps.map((step) => step.index)).toEqual([0, 1]);
    expect(scape.steps[1].label).toContain("0°N 135°W");
  });
});
