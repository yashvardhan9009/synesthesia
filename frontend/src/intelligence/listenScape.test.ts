import { describe, expect, it } from "vitest";
import { analyseRegion, buildFindings } from "./analysis.ts";
import { syntheticRegion } from "./fixtures.ts";
import { buildListenScape, clock, findingStep, findingsAtStep, listenSpans, LISTEN_BPM, pitchFullScale, stepMonths, stepOfMonth, stepTime } from "./listenScape.ts";

const data = syntheticRegion();
const analysis = analyseRegion(data);
const spans = listenSpans(1981, 2025);
const at = (key: string) => data.months.indexOf(key);

describe("spans and steps", () => {
  it("offers a compact default under a minute, and the full record", () => {
    expect(spans.map((span) => span.id)).toEqual(["recent", "full-season", "full-month"]);
    expect(spans[0]).toMatchObject({ from: 2014, to: 2025, resolution: "month" });
    const recent = buildListenScape("Box", data, analysis, spans[0]);
    expect(recent.scape.steps).toHaveLength(144);
    expect(stepTime(recent.scape.steps.length)).toBeLessThanOrEqual(60);
    expect(stepTime(recent.scape.steps.length)).toBeGreaterThanOrEqual(30);
  });

  it("groups months into meteorological seasons, December with the next year", () => {
    const seasons = stepMonths(data.months, 1982, 1982, "season");
    expect(seasons.map((season) => season.label)).toEqual(["Dec–Feb 1982", "Mar–May 1982", "Jun–Aug 1982", "Sep–Nov 1982"]);
    expect(seasons[0].indices).toEqual([at("198112"), at("198201"), at("198202")]);
  });
});

describe("the soundscape", () => {
  const listen = buildListenScape("Box", data, analysis, spans[0]);

  it("plays temperature departure as pitch and rings a bell at the planted anomaly", () => {
    const march = listen.scape.steps[stepOfMonth(listen, at("202403"))!];
    expect(march.label).toBe("March 2024");
    expect(march.lead!.midi).toBeGreaterThan(listen.scape.steps[stepOfMonth(listen, at("201403"))!].lead!.midi);
    expect(march.bells.some((bell) => bell.variable === "T2M")).toBe(true);
    expect(march.traces.find((trace) => trace.layer === "pitch")!.rule).toContain(`±${listen.fullScale} °C`);
    expect(march.caption).toMatch(/^Box, March 2024\. Temperature/);
    expect(listen.scape.config.bpm).toBe(LISTEN_BPM);
  });

  it("chooses the pitch range from the record", () => {
    expect(pitchFullScale(analysis)).toBeGreaterThanOrEqual(1);
    expect(pitchFullScale(analysis)).toBeLessThanOrEqual(6);
    expect(pitchFullScale(analysis) * 2).toBe(Math.round(pitchFullScale(analysis) * 2));
  });
});

describe("finding → timestamp", () => {
  const findings = buildFindings(data, analysis, { focus: [2014, 2025] });
  const listen = buildListenScape("Box", data, analysis, spans[0]);

  it("maps a finding to the step and second where it is heard", () => {
    const windy = findings.find((item) => item.id === "WS2M-month-202001")!;
    const step = findingStep(listen, windy)!;
    expect(step).toBe(at("202001") - at("201401"));
    expect(stepTime(step)).toBeCloseTo(step * (60 / LISTEN_BPM), 9);
    expect(findingsAtStep(listen, findings, step).map((item) => item.id)).toContain("WS2M-month-202001");
  });

  it("returns null for months outside the played span", () => {
    expect(stepOfMonth(listen, at("199001"))).toBeNull();
    expect(findingStep(listen, { span: { from: at("199001"), to: at("199003") } })).toBeNull();
    expect(findingStep(listen, { span: { from: at("201312"), to: at("201402") } })).toBe(0);
  });

  it("maps months to seasons in the seasonal piece", () => {
    const seasonal = buildListenScape("Box", data, analysis, spans[1]);
    const step = stepOfMonth(seasonal, at("202403"))!;
    expect(seasonal.scape.steps[step].label).toBe("Mar–May 2024");
  });

  it("formats clock times", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.4)).toBe("1:05");
    expect(clock(162)).toBe("2:42");
  });
});
