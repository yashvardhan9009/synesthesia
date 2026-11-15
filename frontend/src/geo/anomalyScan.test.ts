import { describe, expect, it } from "vitest";
import { ANOMALY_BELL_HZ } from "../audio/mappings.ts";
import { syntheticSeries } from "../audio/fixtures.ts";
import { PLACES } from "../types.ts";
import { anomalyTimeline, departureWord, globalGrid, scanAnomalies } from "./anomalyScan.ts";

describe("globalGrid", () => {
  it("covers 48 globally distributed in-range coordinates", () => {
    const grid = globalGrid();
    expect(grid).toHaveLength(48);
    expect(new Set(grid.map(({ lat }) => lat))).toHaveLength(6);
    expect(Math.min(...grid.map(({ lat }) => lat))).toBeLessThan(-60);
    expect(Math.max(...grid.map(({ lat }) => lat))).toBeGreaterThan(60);
    expect(Math.min(...grid.map(({ lon }) => lon))).toBe(-180);
    expect(Math.max(...grid.map(({ lon }) => lon))).toBeLessThanOrEqual(180);
  });
});

describe("scanAnomalies", () => {
  it("finds the hot day in the synthetic fixture and ranks by |z|", () => {
    const findings = scanAnomalies([{ place: PLACES[0], series: syntheticSeries() }], 2.5);
    const hot = findings.find((finding) => finding.variable === "T2M");
    expect(hot).toMatchObject({ place: PLACES[0].name, date: "20250605", value: 35, unit: "°C" });
    for (let index = 1; index < findings.length; index += 1) {
      expect(Math.abs(findings[index - 1].z)).toBeGreaterThanOrEqual(Math.abs(findings[index].z));
    }
  });

  it("skips missing values instead of filling them", () => {
    const series = syntheticSeries({ T2M: [20, 20.5, 19.8, 20.2, null, 20.1] });
    expect(scanAnomalies([{ place: PLACES[0], series }], 2.5).some((finding) => finding.variable === "T2M" && finding.date === "20250605")).toBe(false);
  });

  it("does not call drizzle in a dry window a wet anomaly", () => {
    const series = syntheticSeries({ PRECTOTCORR: [0, 0, 0, 0, 0.4, 0] });
    expect(scanAnomalies([{ place: PLACES[3], series }], 2.5).some((finding) => finding.variable === "PRECTOTCORR")).toBe(false);
  });

  it("does not let a near-constant window turn a small change into an extreme score", () => {
    const series = syntheticSeries({ RH2M: [80, 80, 80, 80, 81.5, 80] });
    expect(scanAnomalies([{ place: PLACES[0], series }], 2.5).some((finding) => finding.variable === "RH2M")).toBe(false);
  });

  it("judges each place against itself", () => {
    const calm = syntheticSeries({ T2M: [35, 35, 35, 35, 35, 35] });
    const findings = scanAnomalies([{ place: PLACES[1], series: calm }], 2.5);
    expect(findings.some((finding) => finding.variable === "T2M")).toBe(false);
  });
});

describe("anomalyTimeline", () => {
  it("plays findings in date order on the variable's bell an octave down", () => {
    const findings = scanAnomalies([{ place: PLACES[0], series: syntheticSeries() }], 2.5);
    const events = anomalyTimeline(findings);
    expect(events).toHaveLength(findings.length);
    const hot = events.find((event) => event.caption.includes("warm"));
    expect(hot?.frequency).toBeCloseTo(ANOMALY_BELL_HZ.T2M / 2);
    expect(events.every((event) => event.accent)).toBe(true);
  });

  it("names the direction", () => {
    expect(departureWord({ variable: "PRECTOTCORR", z: 3 })).toBe("wet");
    expect(departureWord({ variable: "T2M", z: -3 })).toBe("cold");
  });
});
