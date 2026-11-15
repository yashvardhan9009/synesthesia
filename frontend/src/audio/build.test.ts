import { describe, expect, it } from "vitest";
import { compareTemperatures, eventsFromChange, eventsFromPower } from "./build.ts";
import { DEFAULT_SETTINGS } from "../types.ts";
import type { PowerSeries } from "../types.ts";

function series(): PowerSeries {
  const days = ["20260601", "20260602", "20260603", "20260604", "20260605"];
  const temps = [30, 30.2, 29.8, 30.1, 41];
  return {
    latitude: 0,
    longitude: 0,
    start: days[0],
    end: days[4],
    request_url: "synthetic",
    source: "SYNTHETIC fixture, not a NASA observation",
    parameters: {
      T2M: days.map((date, index) => ({ date, value: temps[index] })),
      PRECTOTCORR: days.map((date) => ({ date, value: 0 })),
      WS10M: days.map((date) => ({ date, value: 2 })),
      ALLSKY_SFC_SW_DWN: days.map((date) => ({ date, value: 20 })),
      RH2M: days.map((date) => ({ date, value: 40 })),
    },
    units: { T2M: "C" },
    longnames: {},
    messages: [],
    fill_value: -999,
    header_title: null,
    dates: days,
  };
}

describe("eventsFromPower (SYNTHETIC)", () => {
  it("puts the hot day higher and marks it as an anomaly", () => {
    const events = eventsFromPower("Fixture", series(), DEFAULT_SETTINGS);
    expect(events).toHaveLength(5);
    const hottest = events[4];
    expect(hottest.accent).toBe(true);
    expect(hottest.frequency).toBeGreaterThan(events[0].frequency);
    expect(hottest.caption).toContain("41.0");
    expect(hottest.sourceIndex).toBe(4);
    expect(events[0].caption).toContain("Fixture");
  });

  it("keeps the hot day's source index when an earlier day is missing", () => {
    const data = series();
    data.parameters.T2M[2] = { date: "20260603", value: null };
    const events = eventsFromPower("Fixture", data, DEFAULT_SETTINGS);
    const hot = events.find((event) => event.caption.includes("41.0"));
    expect(hot?.sourceIndex).toBe(4);
    expect(events.map((event) => event.sourceIndex)).not.toContain(2);
  });

  it("hears a warmer calendar day as a higher, flagged note (SYNTHETIC)", () => {
    const base = series();
    const earlier = structuredClone(base);
    const later = structuredClone(base);
    earlier.parameters.T2M = earlier.dates.map((date) => ({ date: date.replace("2026", "2006"), value: 20 }));
    later.parameters.T2M = later.dates.map((date, index) => ({ date, value: index === 4 ? 30 : 22 }));
    const { events, medianDelta, days } = eventsFromChange("Fixture", earlier, later, DEFAULT_SETTINGS);
    expect(days).toHaveLength(5);
    expect(events[4].accent).toBe(true);
    expect(events[4].frequency).toBeGreaterThan(events[0].frequency);
    expect(medianDelta).toBeGreaterThan(0);
    expect(events[4].caption).toContain("warmer");
    expect(events[4].sourceIndex).toBe(4);
  });

  it("subtracts the raw POWER temperatures and takes their median", () => {
    const earlier = series();
    const later = series();
    earlier.parameters.T2M = [
      { date: "20060601", value: 10 },
      { date: "20060602", value: 20 },
      { date: "20060603", value: null },
    ];
    later.parameters.T2M = [
      { date: "20260601", value: 13 },
      { date: "20260602", value: 20 },
      { date: "20260603", value: 30 },
    ];
    const { days, medianDelta } = compareTemperatures(earlier, later);
    expect(days.map((day) => day.delta)).toEqual([3, 0, null]);
    expect(days[0].later! - days[0].earlier!).toBe(3);
    expect(medianDelta).toBe(1.5);
    const played = eventsFromChange("Fixture", earlier, later, DEFAULT_SETTINGS);
    expect(played.days[2].delta).toBeNull();
    expect(played.events.map((event) => event.sourceIndex)).toEqual([0, 1]);
    expect(played.events[0].caption).toContain("13.0");
    expect(played.events[0].caption).toContain("10.0");
  });

  it("does not invent a note for a filled temperature", () => {
    const data = series();
    data.parameters.T2M[2] = { date: "20260603", value: null };
    const events = eventsFromPower("Fixture", data, DEFAULT_SETTINGS);
    expect(events.map((event) => event.label)).not.toContain("3 Jun 2026");
  });
});

function tempSeries(dates: string[], values: (number | null)[]): PowerSeries {
  return {
    latitude: 0,
    longitude: 0,
    start: dates[0],
    end: dates[dates.length - 1],
    request_url: "synthetic",
    source: "SYNTHETIC fixture, not a NASA observation",
    parameters: { T2M: dates.map((date, index) => ({ date, value: values[index] })) },
    units: { T2M: "C" },
    longnames: {},
    messages: [],
    fill_value: -999,
    header_title: null,
    dates,
  };
}

describe("Time Machine change pitch and matching (SYNTHETIC)", () => {
  it("plays zero change at the fixed reference note, whatever the other changes are", () => {
    const earlier = tempSeries(["20060601", "20060602", "20060603"], [20, 20, 20]);
    const small = tempSeries(["20260601", "20260602", "20260603"], [20, 21, 19]);
    const large = tempSeries(["20260601", "20260602", "20260603"], [20, 28, 12]);
    const a = eventsFromChange("Fixture", earlier, small, DEFAULT_SETTINGS).events;
    const b = eventsFromChange("Fixture", earlier, large, DEFAULT_SETTINGS).events;
    expect(a[0].frequency).toBeCloseTo(b[0].frequency, 6);
    expect(a[1].frequency).toBeGreaterThan(a[0].frequency);
    expect(a[2].frequency).toBeLessThan(a[0].frequency);
    expect(b[1].frequency).toBeGreaterThan(a[1].frequency);
    expect(a[0].caption).toContain("no change is C4");
  });

  it("keeps the years of a multi-year window apart instead of collapsing calendar days", () => {
    const earlier = tempSeries(["20051231", "20060101", "20061231", "20070101"], [1, 2, 3, 4]);
    const later = tempSeries(["20251231", "20260101", "20261231", "20270101"], [11, 12, 13, 14]);
    const { days } = compareTemperatures(earlier, later);
    expect(days.map((day) => day.label)).toEqual(["31 Dec 2025", "1 Jan 2026", "31 Dec 2026", "1 Jan 2027"]);
    expect(days.map((day) => day.delta)).toEqual([10, 10, 10, 10]);
  });

  it("scores rain anomalies on ln(1 + P) in the lead melody", () => {
    const data = series();
    data.parameters.PRECTOTCORR = data.dates.map((date, index) => ({ date, value: [0, 1, 2, 3, 6][index] }));
    const rain = eventsFromPower("Fixture", data, { ...DEFAULT_SETTINGS, lead: "PRECTOTCORR" });
    expect(rain.some((event) => event.accent)).toBe(false);
  });
});
