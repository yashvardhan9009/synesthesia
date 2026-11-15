import { describe, expect, it } from "vitest";
import { formatLatLon, formatMeasure, powerUnit } from "./format.ts";
import type { PowerSeries } from "./types.ts";

describe("format", () => {
  it("writes hemispheres", () => {
    expect(formatLatLon(28.61, 77.21)).toBe("28.61°N 77.21°E");
    expect(formatLatLon(-3.1, -60.02, 1)).toBe("3.1°S 60.0°W");
  });
  it("writes POWER Celsius with a degree sign and falls back to the catalogue unit", () => {
    const series = { units: { T2M: "C", RH2M: "%" } } as unknown as PowerSeries;
    expect(powerUnit(series, "T2M")).toBe("°C");
    expect(powerUnit(series, "RH2M")).toBe("%");
    expect(powerUnit(null, "PS")).toBe("kPa");
  });
  it("says missing for a fill value", () => {
    expect(formatMeasure(null, "°C")).toBe("missing");
    expect(formatMeasure(21.456, "°C")).toBe("21.5 °C");
  });
});
