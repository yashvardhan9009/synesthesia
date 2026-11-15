import { describe, expect, it } from "vitest";
import { EMPTY, isComplete, loadProgress, markStep, saveProgress, STEPS } from "./onboarding.ts";

describe("onboarding", () => {
  it("ticks a step once", () => {
    const once = markStep(EMPTY, "play");
    expect(once.done).toEqual(["play"]);
    expect(markStep(once, "play")).toBe(once);
  });
  it("is complete when every step is done", () => {
    const all = STEPS.reduce((progress, step) => markStep(progress, step.id), EMPTY);
    expect(isComplete(all)).toBe(true);
    expect(isComplete(markStep(EMPTY, "touch"))).toBe(false);
  });
  it("round-trips and drops unknown steps", () => {
    let stored = "";
    saveProgress({ setItem: (_key, value) => void (stored = value) }, { done: ["trace"], dismissed: true });
    expect(loadProgress({ getItem: () => stored })).toEqual({ done: ["trace"], dismissed: true });
    expect(loadProgress({ getItem: () => JSON.stringify({ done: ["trace", "fly", 3, "trace"] }) })).toEqual({ done: ["trace"], dismissed: false });
    expect(loadProgress({ getItem: () => "{" })).toEqual(EMPTY);
  });
});
