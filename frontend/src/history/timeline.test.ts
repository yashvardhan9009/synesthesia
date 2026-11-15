import { describe, expect, it } from "vitest";
import type { PowerMonthly } from "../api.ts";
import { buildTimeline, normalBasis, requestYears, slotNormals, slotted, TIMELINE_FULL_SCALE_C } from "./timeline.ts";

// SYNTHETIC monthly record, not NASA observations: 20.0 °C every June of 2001–2020
// except a spread of ±1, and a hot June 2024.
function record(): PowerMonthly {
  const t2m: { date: string; value: number | null }[] = [];
  const rain: { date: string; value: number | null }[] = [];
  for (let year = 2000; year <= 2024; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const date = `${year}${String(month).padStart(2, "0")}`;
      const wobble = year % 2 === 0 ? 1 : -1;
      t2m.push({ date, value: year === 2024 && month === 6 ? 26 : month === 6 ? 20 + wobble : 10 + wobble });
      rain.push({ date, value: year === 2024 && month === 2 ? null : 2 });
    }
  }
  return {
    latitude: 1, longitude: 2, start: 2000, end: 2024, request_url: "https://power.example/monthly", source: "SYNTHETIC",
    units: { T2M: "C" }, longnames: {}, messages: [], monthly: { T2M: t2m, PRECTOTCORR: rain }, annual: {}, months: [], years: [],
  };
}

describe("slotted (SYNTHETIC)", () => {
  it("groups December into the next year's Dec–Feb and leaves incomplete seasons missing", () => {
    const seasons = slotted([
      { date: "200012", value: 1 },
      { date: "200101", value: 2 },
      { date: "200102", value: 3 },
      { date: "200103", value: 4 },
      { date: "200104", value: null },
      { date: "200105", value: 6 },
    ], "season");
    expect(seasons.map((item) => [item.label, item.value])).toEqual([["Dec–Feb 2001", 2], ["Mar–May 2001", null]]);
  });

  it("needs all twelve months for a year", () => {
    const months = Array.from({ length: 11 }, (_, index) => ({ date: `2026${String(index + 1).padStart(2, "0")}`, value: 1 }));
    expect(slotted(months, "year")[0].value).toBeNull();
  });

  it("computes normals only from the normal period", () => {
    const normals = slotNormals(slotted(record().monthly.T2M, "month"), false);
    expect(normals.get(5)!.n).toBe(20);
    expect(normals.get(5)!.mean).toBe(20);
    expect(normalBasis("month", 5)).toBe("the Junes of 2001–2020");
  });
});

describe("buildTimeline (SYNTHETIC)", () => {
  it("plays one step per month, pitch from the departure, bells for the unusual month", () => {
    const timeline = buildTimeline({ place: "Fixture", monthly: record(), resolution: "month", from: 2023, to: 2024 });
    expect(timeline.rows).toHaveLength(24);
    const hot = timeline.rows.find((row) => row.label === "Jun 2024")!;
    expect(hot.departures.T2M!.diff).toBe(6);
    expect(hot.bells.map((bell) => bell.variable)).toContain("T2M");
    const step = timeline.scape.steps[hot.index];
    const normalStep = timeline.scape.steps.find((item) => item.label === "Jun 2023")!;
    expect(step.lead!.frequency).toBeGreaterThan(normalStep.lead!.frequency);
    expect(step.caption).toContain("6.0 °C above normal");
    expect(step.requestUrl).toBe("https://power.example/monthly");
    expect(timeline.referenceNote).toBe("C5");
    expect(TIMELINE_FULL_SCALE_C).toBeGreaterThan(0);
  });

  it("keeps a missing month missing: no hits and the variable listed", () => {
    const timeline = buildTimeline({ place: "Fixture", monthly: record(), resolution: "month", from: 2024, to: 2024 });
    const february = timeline.scape.steps.find((step) => step.label === "Feb 2024")!;
    expect(february.hits).toBe(0);
    expect(february.missing).toContain("PRECTOTCORR");
    expect(timeline.rows[1].values.PRECTOTCORR).toBeNull();
  });

  it("asks POWER for the normal period and the December before", () => {
    expect(requestYears(2015, 2024)).toEqual([2000, 2024]);
    expect(requestYears(1990, 2000)).toEqual([1989, 2020]);
    expect(requestYears(1981, 2026)).toEqual([1981, 2026]);
  });
});
