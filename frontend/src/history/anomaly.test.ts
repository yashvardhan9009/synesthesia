import { describe, expect, it } from "vitest";
import type { PowerBaseline } from "../api.ts";
import type { PowerSeries } from "../types.ts";
import {
  BACKGROUND,
  BACKGROUND_LABEL,
  EXPLAIN_PARAMETERS,
  baselineWindowLabel,
  dailyDepartures,
  departure,
  explainDay,
  explainDeparture,
  levelOf,
  mostUnusual,
  statsOf,
} from "./anomaly.ts";

// SYNTHETIC statistics and values, not NASA observations.
const warmNormal = { n: 300, mean: 30, sd: 2, p10: 27.5, p50: 30, p90: 32.5 };
const rainNormal = { n: 300, mean: 4, sd: 8, p10: 0, p50: 1.2, p90: 12, log_mean: 1, log_sd: 0.8, wet: 0.55 };

describe("departure against a baseline (SYNTHETIC)", () => {
  it("measures the difference and z from the baseline mean and sd", () => {
    const found = departure("T2M", 35, warmNormal)!;
    expect(found.diff).toBe(5);
    expect(found.z).toBe(2.5);
    expect(found.level).toBe("unusual");
    expect(found.direction).toBe("above");
    expect(departure("T2M", 23.5, warmNormal)!.level).toBe("very unusual");
    expect(departure("T2M", 31, warmNormal)!.level).toBe("normal");
  });

  it("scores rain on ln(1 + P)", () => {
    const found = departure("PRECTOTCORR", 20, rainNormal)!;
    expect(found.z).toBeCloseTo((Math.log1p(20) - 1) / 0.8, 6);
    expect(found.level).toBe("unusual");
  });

  it("never invents a departure for a missing value or a missing baseline", () => {
    expect(departure("T2M", null, warmNormal)).toBeNull();
    expect(departure("T2M", 30, undefined)).toBeNull();
    expect(departure("T2M", 30, { ...warmNormal, n: 1 })).toBeNull();
  });

  it("gives no z when the baseline has no spread", () => {
    const flat = departure("T2M", 31, { ...warmNormal, sd: 0 })!;
    expect(flat.z).toBeNull();
    expect(levelOf(flat.z)).toBe("normal");
  });
});

describe("plain-word explanations (SYNTHETIC)", () => {
  it("says what was unusual, by how much, and against which normal", () => {
    const text = explainDeparture(departure("T2M", 35, warmNormal)!, "on 14 Jun 2026", "7 Jun – 21 Jun in 2001–2020");
    expect(text).toContain("Air temperature 35.0 °C on 14 Jun 2026 was 5.0 °C warmer than normal");
    expect(text).toContain("30.0 °C");
    expect(text).toContain("27.5 and 32.5");
    expect(text).toContain("2.5 standard deviations above normal: unusual");
  });

  it("describes rain with the median, the wet share and the log score", () => {
    const text = explainDeparture(departure("PRECTOTCORR", 20, rainNormal)!, "on 1 Jul 2026", "the baseline");
    expect(text).toContain("median was 1.2 mm/day");
    expect(text).toContain("55% of those days had at least 1 mm");
    expect(text).toContain("more than 9 in 10");
    expect(text).toContain("ln(1 + rain)");
  });

  it("labels the window of calendar days, wrapping New Year", () => {
    expect(baselineWindowLabel("0614", 7, [2001, 2020])).toBe("7 Jun – 21 Jun in 2001–2020");
    expect(baselineWindowLabel("0103", 7, [2001, 2020])).toBe("27 Dec – 10 Jan in 2001–2020");
  });

  it("keeps a labelled general-background note for every parameter and direction", () => {
    expect(BACKGROUND_LABEL).toMatch(/not computed from this data/);
    for (const parameter of EXPLAIN_PARAMETERS) {
      expect(BACKGROUND[parameter].above.length).toBeGreaterThan(40);
      expect(BACKGROUND[parameter].below.length).toBeGreaterThan(40);
    }
  });
});

describe("daily departures of a POWER series (SYNTHETIC)", () => {
  const series = {
    latitude: 0, longitude: 0, start: "20260613", end: "20260615", request_url: "", source: "SYNTHETIC",
    parameters: { T2M: [{ date: "20260613", value: 30 }, { date: "20260614", value: 37 }, { date: "20260615", value: null }] },
    units: {}, longnames: {}, messages: [], fill_value: -999, header_title: null, dates: ["20260613", "20260614", "20260615"],
  } as PowerSeries;
  const baseline = {
    latitude: 0, longitude: 0, period: [2001, 2020], half_window: 7, request_url: "", source: "SYNTHETIC", units: {}, longnames: {}, messages: [],
    days: { T2M: { "0613": warmNormal, "0614": warmNormal, "0615": warmNormal } },
  } as PowerBaseline;

  it("matches each day with the same calendar day and ranks the unusual ones", () => {
    const all = dailyDepartures(series, baseline);
    expect(all.map((item) => item.date)).toEqual(["20260613", "20260614"]);
    const top = mostUnusual(all);
    expect(top).toHaveLength(1);
    expect(top[0].date).toBe("20260614");
    expect(explainDay(top[0], baseline)).toContain("on 14 Jun 2026");
  });
});

describe("statsOf", () => {
  it("matches the backend statistics and skips missing values", () => {
    const stats = statsOf([1, 2, 3, null, 4], true)!;
    expect(stats.n).toBe(4);
    expect(stats.mean).toBe(2.5);
    expect(stats.sd).toBeCloseTo(Math.sqrt(5 / 3), 9);
    expect(stats.p50).toBe(2.5);
    expect(stats.log_mean).toBeCloseTo((Math.log(2) + Math.log(3) + Math.log(4) + Math.log(5)) / 4, 9);
    expect(stats.wet).toBeUndefined();
    expect(statsOf([null])).toBeUndefined();
  });
});
