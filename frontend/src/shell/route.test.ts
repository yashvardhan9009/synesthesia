import { describe, expect, it } from "vitest";
import { initialView, parseView, viewHash, VIEWS } from "./route.ts";

describe("routes", () => {
  it("round-trips every view", () => {
    for (const view of VIEWS) expect(parseView(viewHash(view))).toBe(view);
  });
  it("defaults to home on anything else", () => {
    expect(parseView("")).toBe("home");
    expect(parseView("#")).toBe("home");
    expect(parseView("#/nowhere")).toBe("home");
  });
  it("tolerates case, a missing slash and trailing parts", () => {
    expect(parseView("#Science")).toBe("science");
    expect(parseView("#/cosmic?lat=1")).toBe("cosmic");
    expect(parseView("#/listen?region=indian-ocean")).toBe("listen");
    expect(parseView("#/time/2001")).toBe("time");
  });
});

describe("first page of a shared link", () => {
  it("opens the page named by the query when there is no hash", () => {
    expect(initialView("", "?mode=cosmic&lat=10")).toBe("cosmic");
    expect(initialView("", "?lab=abc")).toBe("lab");
    expect(initialView("#/", "?mode=time")).toBe("time");
    expect(initialView("", "")).toBe("home");
  });
  it("lets the hash win", () => {
    expect(initialView("#/science", "?mode=cosmic")).toBe("science");
  });
});
