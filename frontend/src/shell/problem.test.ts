import { describe, expect, it } from "vitest";
import { explainProblem } from "./problem.ts";

describe("problem messages", () => {
  it("recognises a stopped backend", () => {
    expect(explainProblem("The data service did not answer (Failed to fetch). Is the backend running on port 8741?").kind).toBe("offline");
  });
  it("blames NASA for upstream failures, by name", () => {
    const problem = explainProblem("NASA POWER could not be reached: timeout", "NASA POWER");
    expect(problem.kind).toBe("upstream");
    expect(problem.title).toBe("NASA POWER did not deliver this data");
    expect(explainProblem("Request failed (502).").kind).toBe("upstream");
  });
  it("recognises a bad request", () => {
    expect(explainProblem("The end date is before the start date.").kind).toBe("request");
    expect(explainProblem("Request failed (404).").kind).toBe("request");
  });
  it("falls back plainly", () => {
    expect(explainProblem("boom").kind).toBe("unknown");
  });
});
