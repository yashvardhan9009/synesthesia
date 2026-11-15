import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../audio/labConfig.ts";
import { decodeShareUrl, encodeShareUrl, type ShareState } from "./share.ts";

const state: ShareState = {
  lat: 64.1466,
  lon: -21.9426,
  start: "2020-01-01",
  end: "2020-01-31",
  sound: "lead",
  lead: "RH2M",
  bpm: 112,
  scale: "dorian",
  rootMidi: 53,
  config: null,
};

describe("shareable Earth sound links", () => {
  it("round trips place, window and sound, and opens Cosmic Earth", () => {
    const url = new URL(encodeShareUrl(state, "https://example.test/?lab=zzz#/jukebox"));
    expect(decodeShareUrl(url.search)).toEqual({ lat: 64.1466, lon: -21.9426, start: "2020-01-01", end: "2020-01-31", sound: "lead", lead: "RH2M", bpm: 112, scale: "dorian", rootMidi: 53 });
    expect(url.searchParams.get("mode")).toBe("cosmic");
    expect(url.searchParams.has("lab")).toBe(false);
    expect(url.hash).toBe("#/cosmic");
  });

  it("carries the Sonic Lab configuration of a soundscape", () => {
    const config = { ...DEFAULT_CONFIG, mode: "artistic" as const, bpm: 130 };
    const url = new URL(encodeShareUrl({ ...state, sound: "soundscape", config }, "https://example.test/"));
    expect(decodeShareUrl(url.search).config).toMatchObject({ mode: "artistic", bpm: 130 });
  });

  it("drops invalid or out-of-range values", () => {
    expect(decodeShareUrl("?mode=cosmic&lat=100&lon=0&start=2026-02-31&end=2026-02-28&lead=FAKE&bpm=400&scale=purple&root=90&sound=loud&cfg=%%%")).toEqual({ lon: 0, end: "2026-02-28" });
  });

  it("ignores a query that is not a Cosmic Earth link", () => {
    expect(decodeShareUrl("?lat=10&lon=10")).toEqual({});
  });
});
