import { describe, expect, it } from "vitest";
import { midiToFrequency, scoreSample } from "../science/score.ts";
import { DEFAULT_SETTINGS, PARAMETERS } from "../types.ts";
import { POWER_PARAMETERS, PROVENANCE } from "./sources.ts";
import { workedExample } from "./worked.ts";

describe("documented datasets", () => {
  it("documents every POWER parameter the instrument plays, with the same unit", () => {
    for (const [id, meta] of Object.entries(PARAMETERS)) {
      const documented = POWER_PARAMETERS.find((parameter) => parameter.id === id);
      expect(documented, id).toBeDefined();
      expect(documented?.unit).toBe(meta.unit);
    }
  });
  it("separates measured, derived and generated", () => {
    const kinds = new Set(PROVENANCE.map((row) => row.kind));
    expect(kinds).toEqual(new Set(["measured", "derived", "generated"]));
  });
});

describe("worked example", () => {
  it("matches the instrument's own score", () => {
    const steps = workedExample(31.2, 22, 34, 2.9, DEFAULT_SETTINGS);
    const norm = (31.2 - 22) / 12;
    const scored = scoreSample({ norm, z: 2.9, ...DEFAULT_SETTINGS });
    expect(steps[0].result).toBe(norm.toFixed(3));
    expect(steps[2].result.startsWith(String(scored?.midi))).toBe(true);
    expect(steps[3].result).toBe(`${midiToFrequency(scored!.midi).toFixed(2)} Hz`);
    expect(steps[4].result.startsWith("yes")).toBe(true);
    expect(steps[5].result).toBe(scored!.gain.toFixed(3));
  });
  it("puts a flat series in the middle", () => {
    expect(workedExample(5, 5, 5, 0, DEFAULT_SETTINGS)[0].result).toBe("0.500");
  });
});

describe("soundscape documentation", () => {
  it("says how every soundscape variable is heard, from the mapping module", async () => {
    const { MAPPINGS, POWER_VARIABLES } = await import("../audio/mappings.ts");
    for (const variable of POWER_VARIABLES) {
      const documented = POWER_PARAMETERS.find((parameter) => parameter.id === variable);
      expect(documented?.heard.toLowerCase(), variable).toContain(MAPPINGS[variable].sound.toLowerCase());
    }
  });
});
