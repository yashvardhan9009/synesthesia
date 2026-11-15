import { describe, expect, it } from "vitest";
import { boxAround, mapToLatLon, regionFromLink, regionLink } from "./regionPick.ts";
import { presetRegion } from "./regions.ts";

describe("region picking", () => {
  it("builds a clipped box around a place", () => {
    const box = boxAround(10, 20, "Somewhere");
    expect([box.south, box.west, box.north, box.east]).toEqual([4, 12, 16, 28]);
    const polar = boxAround(87, 178, "Pole");
    expect(polar.north).toBe(90);
    expect(polar.east).toBe(180);
  });

  it("maps a click to coordinates", () => {
    expect(mapToLatLon(0.5, 0.5)).toEqual({ lat: 0, lon: 0 });
    expect(mapToLatLon(0, 0)).toEqual({ lat: 90, lon: -180 });
    expect(mapToLatLon(2, -1)).toEqual({ lat: 90, lon: 180 });
  });

  it("round-trips presets and custom boxes through the link", () => {
    expect(regionLink(presetRegion("sahel")!)).toBe("#/listen?region=sahel");
    expect(regionFromLink("#/listen?region=indian-ocean").id).toBe("indian-ocean");
    const box = boxAround(-1.29, 36.82, "Nairobi, Kenya");
    const back = regionFromLink(regionLink(box));
    expect([back.south, back.west, back.north, back.east, back.name]).toEqual([box.south, box.west, box.north, box.east, "Nairobi, Kenya"]);
  });

  it("falls back to the default for unknown or invalid links", () => {
    expect(regionFromLink("#/listen").id).toBe("indian-ocean");
    expect(regionFromLink("#/listen?region=atlantis").id).toBe("indian-ocean");
    expect(regionFromLink("#/listen?box=10,0,5,10").id).toBe("indian-ocean");
  });
});
