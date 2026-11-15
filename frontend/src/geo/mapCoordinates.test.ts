import { describe, expect, it } from "vitest";
import { mapCoordinates } from "./mapCoordinates.ts";

describe("mapCoordinates", () => {
  const bounds = { left: 10, top: 20, width: 720, height: 240 };

  it("maps map corners to geographic coordinate limits", () => {
    expect(mapCoordinates(10, 20, bounds)).toEqual({ lat: 90, lon: -180 });
    expect(mapCoordinates(730, 260, bounds)).toEqual({ lat: -90, lon: 180 });
  });

  it("clamps points to the map boundary", () => {
    expect(mapCoordinates(1000, -100, bounds)).toEqual({ lat: 90, lon: 180 });
  });
});
