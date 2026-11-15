import { describe, expect, it } from "vitest";
import { ALL_POWER_PARAMETERS, powerPath } from "./api.ts";

describe("powerPath", () => {
  it("rounds coordinates, strips date dashes and asks for every parameter by default", () => {
    const url = new URL(powerPath({ lat: 28.612345, lon: -77.2, start: "2026-06-01", end: "20260630" }), "http://x");
    expect(url.pathname).toBe("/api/power");
    expect(url.searchParams.get("lat")).toBe("28.6123");
    expect(url.searchParams.get("lon")).toBe("-77.2000");
    expect(url.searchParams.get("start")).toBe("20260601");
    expect(url.searchParams.get("end")).toBe("20260630");
    expect(url.searchParams.get("parameters")).toBe(ALL_POWER_PARAMETERS);
  });
  it("passes an explicit parameter list through", () => {
    const url = new URL(powerPath({ lat: 0, lon: 0, start: "20000101", end: "20000131", parameters: "T2M" }), "http://x");
    expect(url.searchParams.get("parameters")).toBe("T2M");
  });
});
