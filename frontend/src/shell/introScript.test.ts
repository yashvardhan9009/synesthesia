import { describe, expect, it } from "vitest";
import { INTRO_MS, INTRO_SCENES, sceneAt, sceneStart, shouldShowIntro } from "./introScript.ts";

describe("intro timing", () => {
  it("lasts twenty seconds", () => {
    expect(INTRO_MS).toBe(20000);
  });
  it("walks the scenes in order", () => {
    expect(sceneAt(0)).toEqual({ index: 0, within: 0, done: false });
    expect(sceneAt(2000).within).toBeCloseTo(0.5);
    expect(sceneAt(4000).index).toBe(1);
    expect(sceneAt(INTRO_MS - 1).index).toBe(INTRO_SCENES.length - 1);
    expect(sceneAt(INTRO_MS).done).toBe(true);
  });
  it("finds scene starts", () => {
    expect(sceneStart(0)).toBe(0);
    expect(sceneStart(2)).toBe(8000);
    expect(sceneAt(sceneStart(3)).index).toBe(3);
  });
});

describe("intro visibility", () => {
  const unseen = { getItem: () => null };
  const seen = { getItem: () => "1" };
  it("shows once", () => {
    expect(shouldShowIntro("", unseen, false)).toBe(true);
    expect(shouldShowIntro("", seen, false)).toBe(false);
  });
  it("stays out of automated runs unless asked", () => {
    expect(shouldShowIntro("", unseen, true)).toBe(false);
    expect(shouldShowIntro("?intro=1", seen, true)).toBe(true);
    expect(shouldShowIntro("?intro=0", unseen, false)).toBe(false);
  });
});
