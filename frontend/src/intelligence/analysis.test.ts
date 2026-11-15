import { describe, expect, it } from "vitest";
import {
  analyseParameter,
  analyseRegion,
  anomalousRuns,
  buildFindings,
  climatologyOf,
  monthSentence,
  periodLabel,
  positionWord,
  rankFindings,
  rankPhrase,
  recordSentence,
  runSentence,
  signed,
  spatialDepartures,
  spatialSentence,
  summarize,
  trendScore,
  trendSentence,
  type Finding,
  type MonthStat,
  type Trend,
} from "./analysis.ts";
import { syntheticRegion } from "./fixtures.ts";

const data = syntheticRegion();
const analysis = analyseRegion(data);
const at = (key: string) => data.months.indexOf(key);

describe("climatology and monthly statistics", () => {
  it("builds the 2001–2020 normal per calendar month, with a floor on the spread", () => {
    const months = ["200101", "200201", "200301", "200401", "200501", "199901", "202101"];
    const values = [10, 10, 10, 10, 10.02, 99, 99];
    const clim = climatologyOf("T2M", months, values)[0]!;
    expect(clim.n).toBe(5); // 1999 and 2021 are outside the normal period
    expect(clim.mean).toBeCloseTo(10.004, 6);
    expect(clim.spread).toBe(0.15);
    expect(clim.floored).toBe(true);
    expect(climatologyOf("T2M", months, values)[1]).toBeNull();
  });

  it("scores anomalies, robust z and ranks", () => {
    const march = analysis.T2M.months[at("202403")]!;
    expect(march.anomaly).toBeGreaterThan(1.5);
    expect(march.z!).toBeGreaterThan(3);
    expect(march.rank).toBe(1);
    expect(march.of).toBe(45);
    const july = analysis.PRECTOTCORR.months[at("201507")]!;
    expect(july.pct!).toBeLessThan(-40);
    expect(july.rankLow).toBe(1);
  });

  it("keeps missing values missing", () => {
    const out = analyseParameter("T2M", ["200101", "200201"], [null, 5]);
    expect(out.months[0]).toBeNull();
    expect(out.years).toEqual([]);
    expect(out.trend).toBeNull();
  });

  it("finds the warming trend with its p-value", () => {
    const trend = analysis.T2M.trend!;
    expect(trend.perDecade).toBeCloseTo(0.2, 1);
    expect(trend.significant).toBe(true);
    expect(trend.ols.p).toBeLessThan(0.001);
    expect(trend.senPerDecade!).toBeCloseTo(0.2, 1);
    expect(analysis.T2M.years).toHaveLength(45);
  });
});

describe("runs", () => {
  it("finds the planted dry season as one run below normal", () => {
    const runs = anomalousRuns(analysis.PRECTOTCORR.months, "PRECTOTCORR");
    const dry = runs.find((run) => run.from === at("201506"))!;
    expect(dry.sign).toBe(-1);
    expect(dry.length).toBe(4);
    expect(dry.to).toBe(at("201509"));
  });

  it("breaks a run at a missing month and at a change of side", () => {
    const stat = (index: number, z: number | null): MonthStat | null => (z === null ? null : { index, key: `2000${String(index + 1).padStart(2, "0")}`, year: 2000, month: index, value: 1, normal: 1, anomaly: z, z, pct: null, rank: 1, rankLow: 1, of: 1 });
    const runs = anomalousRuns([stat(0, 2), stat(1, 2), stat(2, 2), stat(3, null), stat(4, 2), stat(5, 2), stat(6, -2), stat(7, -2), stat(8, -1.6)], "T2M");
    expect(runs.map((run) => [run.from, run.to, run.sign])).toEqual([[0, 2, 1], [6, 8, -1]]);
  });
});

describe("templates", () => {
  const march: MonthStat = { index: 0, key: "202403", year: 2024, month: 2, value: 29.1, normal: 27.7, anomaly: 1.4, z: 3.1, pct: null, rank: 1, rankLow: 45, of: 45 };

  it("fills the unusual-month templates", () => {
    expect(monthSentence("T2M", march)).toBe("Temperature: March 2024 was 1.4 °C above its 2001–2020 March normal (robust z = 3.1), the warmest March in 45 years.");
    const july: MonthStat = { index: 0, key: "201507", year: 2015, month: 6, value: 4.1, normal: 8.6, anomaly: -4.5, z: -2.4, pct: -52.3, rank: 44, rankLow: 2, of: 45 };
    expect(monthSentence("PRECTOTCORR", july)).toBe("Rainfall: July 2015 was 52% below its 2001–2020 July normal (4.1 against 8.6 mm/day; robust z = −2.4), the 2nd driest July of 45 years.");
    expect(rankPhrase({ ...march, rank: 9 }, true, "T2M")).toBe("");
  });

  it("fills the trend templates", () => {
    const trend: Trend = {
      ols: { n: 45, slope: 0.021, intercept: 0, se: 0.002, t: 10, df: 43, p: 0.00001, r2: 0.7 },
      mk: { n: 45, s: 500, variance: 10000, z: 5, p: 0.00002, senSlope: 0.02 },
      perDecade: 0.21,
      senPerDecade: 0.2,
      from: 1981,
      to: 2025,
      significant: true,
    };
    expect(trendSentence("T2M", trend, 27)).toBe("Trend: temperature rose by 0.21 °C per decade over 1981–2025 (OLS on 45 annual means, p < 0.001; Sen's slope +0.20 °C per decade, Mann–Kendall p < 0.001).");
    const flat: Trend = { ...trend, perDecade: -0.004, senPerDecade: 0, significant: false, ols: { ...trend.ols, p: 0.42 }, mk: { ...trend.mk!, p: 0.5 } };
    expect(trendSentence("WS2M", flat, 6)).toBe("Trend: no significant change in wind at 2 m over 1981–2025 (0.00 m/s per decade, OLS p = 0.42; Sen's slope 0.00 m/s per decade, Mann–Kendall p = 0.50).");
  });

  it("fills the run, record and spatial templates", () => {
    const dry = anomalousRuns(analysis.PRECTOTCORR.months, "PRECTOTCORR").find((run) => run.from === at("201506"))!;
    expect(runSentence(dry)).toMatch(/^Rainfall: June–September 2015 was 4\d% below normal, 4 consecutive months with robust z ≤ −1\.5 each month \(\d\.\d against a normal of \d\.\d mm\/day; most unusual: .+\)\.$/);
    expect(recordSentence("T2M", { year: 2024, value: 28.1, anomaly: 0.6, rank: 1, rankLow: 45, of: 45 }, true, 27.5)).toBe("Record: 2024 was the warmest year in the 45-year record, at 28.1 °C: 0.6 °C above the 2001–2020 annual normal.");
    expect(recordSentence("PRECTOTCORR", { year: 2019, value: 5.4, anomaly: 1.3, rank: 1, rankLow: 45, of: 45 }, true, 4.1)).toBe("Record: 2019 was the wettest year in the 45-year record, 32% above the 2001–2020 annual normal (5.4 mm/day against 4.1 mm/day).");
    expect(signed(-0.04, 1)).toBe("0.0"); // a rounded zero carries no sign
    expect(periodLabel("202306", "202512")).toBe("June 2023 to December 2025");
  });
});

describe("spatial contrast", () => {
  it("names the grid point that departed most", () => {
    const points = spatialDepartures(data, "T2M", [at("202403")]);
    expect(points).toHaveLength(4);
    const sentence = spatialSentence("T2M", "March 2024", points)!;
    expect(sentence).toMatch(/^Across the box: during March 2024, the north-west \(5\.0° N, 60\.0° E\) departed most/);
    expect(sentence).toContain("4 grid points compared");
  });

  it("describes positions, or coordinates for a box around the pole", () => {
    expect(positionWord({ row: 1, column: 1, lat: 0, lon: 75 }, 3, 3, false)).toBe("the centre (0.0° N, 75.0° E)");
    expect(positionWord({ row: 2, column: 0, lat: -15, lon: 60 }, 3, 4, false)).toBe("the south-west (15.0° S, 60.0° E)");
    expect(positionWord({ row: 0, column: 5, lat: 81.25, lon: 150 }, 2, 6, true)).toBe("the point at 81.3° N, 150.0° E");
  });
});

describe("findings", () => {
  const findings = buildFindings(data, analysis, { focus: [1981, 2025] });

  it("detects temperature, rain, wind and history, ranked by score", () => {
    const kinds = new Set(findings.map((item) => item.kind));
    for (const kind of ["temperature", "rain", "wind", "trend"]) expect(kinds.has(kind as Finding["kind"])).toBe(true);
    for (let i = 1; i < findings.length; i += 1) expect(findings[i - 1].score).toBeGreaterThanOrEqual(findings[i].score);
    expect(findings.length).toBeLessThanOrEqual(10);
    const windy = findings.find((item) => item.id === "WS2M-month-202001")!;
    expect(windy.sentence).toMatch(/^Wind: January 2020 was 1\.\d\d m\/s above its 2001–2020 January normal \(robust z = \d+\.\d\), the windiest January in 45 years\.$/);
    expect(findings.some((item) => item.sentence.startsWith("Record: 2024 was the warmest year"))).toBe(true);
    expect(findings.some((item) => item.kind === "spatial" && item.parameter === "T2M")).toBe(true);
  });

  it("only reports events inside the focus years", () => {
    const recent = buildFindings(data, analysis, { focus: [2018, 2025] });
    expect(recent.some((item) => item.id.startsWith("PRECTOTCORR-run-2015"))).toBe(false);
    expect(recent.some((item) => item.id === "T2M-trend")).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildFindings(data, analyseRegion(data), { focus: [1981, 2025] }).map((item) => item.sentence)).toEqual(findings.map((item) => item.sentence));
  });

  it("keeps the best of each kind before the rest", () => {
    const make = (id: string, kind: Finding["kind"], score: number): Finding => ({ id, kind, parameter: "T2M", score, sentence: id, span: { from: 0, to: 0 }, method: "", evidence: [], evidenceUnit: "months" });
    const ranked = rankFindings([make("t1", "temperature", 9), make("t2", "temperature", 8), make("w", "wind", 1)], 2);
    expect(ranked.map((item) => item.id)).toEqual(["t1", "w"]);
  });

  it("caps trends at two, and breaks ties by variable", () => {
    const make = (id: string, kind: Finding["kind"], score: number, parameter: Finding["parameter"] = "T2M"): Finding => ({ id, kind, parameter, score, sentence: id, span: { from: 0, to: 0 }, method: "", evidence: [], evidenceUnit: "years" });
    const ranked = rankFindings([make("a", "trend", 6, "RH2M"), make("b", "trend", 6, "T2M"), make("c", "trend", 6, "WS2M"), make("d", "rain", 1, "PRECTOTCORR")], 10);
    expect(ranked.map((item) => item.id)).toEqual(["b", "c", "d"]);
  });

  it("scales a trend's score by its size against year-to-year spread", () => {
    const trend = { ...analysis.T2M.trend! };
    const strong = trendScore(trend, analysis.T2M.years.map((item) => item.value));
    expect(strong).toBeGreaterThan(5);
    const noisy = trendScore(trend, analysis.T2M.years.map((item, i) => item.value + (i % 2 ? 10 : -10)));
    expect(noisy).toBeLessThan(strong / 2);
    expect(trendScore({ ...trend, significant: false }, [])).toBe(0.3);
  });

  it("summarizes from the top findings", () => {
    const summary = summarize("Test box", data, findings);
    expect(summary.lead).toBe("Test box: NASA POWER monthly records at 4 grid points, 1981 to December 2025, area-averaged with cos-latitude weights and compared with each calendar month's 2001–2020 normal.");
    expect(summary.points).toEqual(findings.slice(0, 3).map((item) => item.sentence));
  });
});
