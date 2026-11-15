import { describe, expect, it } from "vitest";
import type { PowerSeries } from "../types.ts";
import { alignMeasurement, measurementRange } from "./comparison.ts";

function series(values: [string, number | null][]): PowerSeries {
  const points = values.map(([date, value]) => ({ date, value }));
  return {
    latitude: 0, longitude: 0, start: "", end: "", request_url: "", source: "NASA POWER",
    parameters: { T2M: points }, units: {}, longnames: {}, messages: [], fill_value: -999,
    header_title: null, dates: points.map((point) => point.date),
  };
}

describe("historical measurement alignment", () => {
  it("matches calendar days and retains NASA missing values", () => {
    const rows = alignMeasurement(
      series([["20060101", 12], ["20060102", null], ["20060104", 8]]),
      series([["20260101", 15], ["20260102", 11], ["20260103", 99]]),
      "T2M",
    );
    expect(rows).toEqual([
      { day: "000101", label: "01/01/2026", earlier: 12, later: 15 },
      { day: "000102", label: "01/02/2026", earlier: null, later: 11 },
    ]);
  });

  it("keeps the years of a window longer than a year apart, in calendar order", () => {
    const rows = alignMeasurement(
      series([["20061215", 1], ["20070115", 2], ["20071215", 3]]),
      series([["20261215", 4], ["20270115", 5], ["20271215", 6]]),
      "T2M",
    );
    expect(rows.map((row) => [row.label, row.earlier, row.later])).toEqual([
      ["12/15/2026", 1, 4],
      ["01/15/2027", 2, 5],
      ["12/15/2027", 3, 6],
    ]);
  });

  it("returns a safe range for empty and constant data", () => {
    expect(measurementRange([])).toEqual([0, 1]);
    expect(measurementRange([{ date: "20260101", value: 4 }])).toEqual([3, 5]);
  });
});
