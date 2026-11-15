import { describe, expect, it } from "vitest";
import { analyseRegion } from "./analysis.ts";
import { COMPOUND_Z, WINDOW_MONTHS, caseHeadline, compoundStrength, earSentence, findCompoundEvent, measureSentence, referenceSentence } from "./caseAnalysis.ts";
import { syntheticRegion } from "./fixtures.ts";
import type { RegionData } from "./regionApi.ts";

/** SYNTHETIC: the fixture region with a planted compound event, August–October 2023 hot, dry and less humid. */
function withCompoundEvent(): RegionData {
  const data = syntheticRegion();
  const plant = (key: string, t: number, rainFactor: number, rh: number) => {
    const index = data.months.indexOf(key);
    data.mean.T2M[index] = (data.mean.T2M[index] as number) + t;
    data.mean.PRECTOTCORR[index] = (data.mean.PRECTOTCORR[index] as number) * rainFactor;
    data.mean.RH2M[index] = (data.mean.RH2M[index] as number) + rh;
  };
  plant("202308", 1.2, 0.5, -6);
  plant("202309", 1.8, 0.3, -9);
  plant("202310", 1.1, 0.5, -6);
  return data;
}

describe("case study event search (SYNTHETIC fixtures)", () => {
  it("scores a month by its weakest leg", () => {
    const data = withCompoundEvent();
    const analysis = analyseRegion(data);
    const september = data.months.indexOf("202309");
    const strength = compoundStrength(analysis, september) as number;
    expect(strength).toBeGreaterThan(COMPOUND_Z);
    const t = analysis.T2M.months[september]!.z as number;
    const r = analysis.PRECTOTCORR.months[september]!.z as number;
    const h = analysis.RH2M.months[september]!.z as number;
    expect(strength).toBeCloseTo(Math.min(t, -r, -h), 10);
    // March 2024 is only warm: its weakest leg is far from the test.
    expect(compoundStrength(analysis, data.months.indexOf("202403")) as number).toBeLessThan(COMPOUND_Z);
  });

  it("finds the planted event, grows it into its neighbours and centres a 12-month window", () => {
    const data = withCompoundEvent();
    const event = findCompoundEvent(data, analyseRegion(data))!;
    expect(event.met).toBe(true);
    expect(data.months[event.peak]).toBe("202309");
    expect(data.months[event.from]).toBe("202308");
    expect(data.months[event.to]).toBe("202310");
    expect(event.window.to - event.window.from + 1).toBe(WINDOW_MONTHS);
    expect(event.window.from).toBeLessThanOrEqual(event.from);
    expect(event.window.to).toBeGreaterThanOrEqual(event.to);
    expect(event.measures.map((item) => item.parameter)).toEqual(["T2M", "PRECTOTCORR", "WS2M", "RH2M"]);
    expect(event.measures.find((item) => item.parameter === "WS2M")?.leg).toBe(false);
  });

  it("picks the quietest same-calendar reference inside 2001–2020", () => {
    const data = withCompoundEvent();
    const analysis = analyseRegion(data);
    const event = findCompoundEvent(data, analysis)!;
    const year = Number(data.months[event.reference.eventFrom].slice(0, 4));
    expect(year).toBeGreaterThanOrEqual(2001);
    expect(Number(data.months[event.reference.eventTo].slice(0, 4))).toBeLessThanOrEqual(2020);
    expect(data.months[event.reference.eventFrom].slice(4)).toBe("08");
    expect(event.reference.eventFrom - event.from).toBe(event.reference.shift * 12);
    // No other shift into the normal period is quieter.
    for (let shift = -22; shift <= -3; shift += 1) {
      let worst = 0;
      for (let index = event.from + shift * 12; index <= event.to + shift * 12; index += 1) {
        for (const parameter of ["T2M", "PRECTOTCORR", "WS2M", "RH2M"] as const) worst = Math.max(worst, Math.abs(analysis[parameter].months[index]?.z ?? 0));
      }
      expect(worst).toBeGreaterThanOrEqual(event.reference.maxAbsZ - 1e-9);
    }
  });

  it("says honestly when no month meets the compound test", () => {
    const data = syntheticRegion();
    const event = findCompoundEvent(data, analyseRegion(data))!;
    expect(event.met).toBe(false);
    expect(event.from).toBe(event.peak);
    const text = caseHeadline("Test box", data, event);
    expect(text).toContain("no compound heat-and-dryness event by this test");
    expect(text).toContain("not as an event");
  });
});

describe("case study templates (SYNTHETIC fixtures)", () => {
  const data = withCompoundEvent();
  const event = findCompoundEvent(data, analyseRegion(data))!;

  it("fills the headline from the computed z-scores", () => {
    const text = caseHeadline("Test box", data, event);
    expect(text).toContain("Test box, August–October 2023: heat and dryness at the same time.");
    expect(text).toContain("the strongest was September 2023");
    expect(text).toContain(`temperature +${(event.peakZ.T2M as number).toFixed(1)}`);
    expect(text).toContain(`rainfall −${Math.abs(event.peakZ.PRECTOTCORR as number).toFixed(1)}`);
    expect(text).toContain("so the event spans 3 months");
  });

  it("writes one measured sentence per variable, with the reference and the wind caveat", () => {
    const rain = event.measures.find((item) => item.parameter === "PRECTOTCORR")!;
    const text = measureSentence(rain, "August–October 2023", "August–October 2010");
    expect(text).toMatch(/^Rainfall: August–October 2023 averaged \d+% below normal \(/);
    expect(text).toContain(`${Math.abs(rain.event.pct as number).toFixed(0)}% below normal`);
    expect(text).toContain("Reference August–October 2010:");
    const wind = event.measures.find((item) => item.parameter === "WS2M")!;
    expect(measureSentence(wind, "x", "y")).toContain("Wind is not part of the test");
  });

  it("explains the reference choice with its own numbers", () => {
    const text = referenceSentence(data, event);
    expect(text).toContain(`${Math.abs(event.reference.shift)} years earlier`);
    expect(text).toContain(event.reference.maxAbsZ.toFixed(1));
  });

  it("describes the sound from the notes themselves", () => {
    const notes = (note: string, bells: number) => Array.from({ length: 12 }, (_, index) => ({ label: `M${index}`, note, bells: index === 4 ? bells : 0 }));
    expect(earSentence(notes("G5", 3), notes("C5", 0), 4)).toBe("At note 5, M4 plays G5 where M4 plays C5. The event piece rings 3 anomaly bells over its 12 notes; the reference rings 0.");
  });
});
