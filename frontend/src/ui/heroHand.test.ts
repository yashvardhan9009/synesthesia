import { describe, expect, it } from "vitest";
import { HERO_CANVAS_SIZE, HERO_GLOBE_RADIUS, stepHeroHand } from "./heroHand.ts";

describe("stepHeroHand", () => {
  it("starts from the center and moves one or more accessible arrow steps", () => {
    const center = HERO_CANVAS_SIZE / 2;
    expect(stepHeroHand(null, "ArrowRight")).toEqual({ x: center + 12, y: center });
    expect(stepHeroHand(null, "ArrowUp", true)).toEqual({ x: center, y: center - 36 });
    expect(stepHeroHand({ x: center, y: center }, "ArrowDown")).toEqual({ x: center, y: center + 12 });
  });

  it("keeps the crosshair within the visible globe and selects its center with Enter", () => {
    const center = HERO_CANVAS_SIZE / 2;
    const edge = stepHeroHand({ x: center + HERO_GLOBE_RADIUS - 6, y: center }, "ArrowRight", true)!;
    expect(Math.hypot(edge.x - center, edge.y - center)).toBeCloseTo(HERO_GLOBE_RADIUS - 4);
    expect(stepHeroHand(null, "Enter")).toEqual({ x: center, y: center });
    expect(stepHeroHand(null, "Escape")).toBeNull();
  });
});
