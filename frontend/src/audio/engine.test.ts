import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SonificationEngine, persistEnginePrefs, type NoteEvent } from "./engine.ts";
import { FakeAudioContext } from "./fakeAudio.ts";
import { syntheticSeries } from "./fixtures.ts";
import { DEFAULT_CONFIG } from "./labConfig.ts";
import { buildSoundscape } from "./soundscape.ts";
import type { SonicEvent } from "../types.ts";

const event = (frequency: number): SonicEvent => ({
  sourceIndex: 0,
  label: "x",
  caption: "x",
  frequency,
  gain: 0.3,
  filterHz: 1000,
  noise: 0,
  accent: false,
  wave: "sine",
  harmony: null,
  harmonyGain: 0,
});

function advance(context: FakeAudioContext, seconds: number) {
  const ticks = Math.ceil(seconds / 0.025);
  for (let tick = 0; tick < ticks; tick += 1) {
    context.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { AudioContext: FakeAudioContext, setInterval, clearInterval });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SonificationEngine (fake Web Audio)", () => {
  it("keeps a single active playback: starting another stops every earlier voice", async () => {
    const engine = new SonificationEngine();
    const scape = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture");
    await engine.playSoundscape(scape, { source: "lab" });
    const context = FakeAudioContext.last!;
    advance(context, 0.5);
    const before = context.sources.length;
    expect(before).toBeGreaterThan(0);
    expect(engine.getState().source).toBe("lab");

    await engine.play([event(220), event(330)], { source: "jukebox", bpm: 120 });
    const now = context.currentTime;
    for (const source of context.sources.slice(0, before)) {
      expect(source.stopAt).not.toBeNull();
      expect(source.stopAt!).toBeLessThanOrEqual(now + 0.05);
    }
    expect(engine.getState().source).toBe("jukebox");
  });

  it("disconnects one-shot nodes when a mode switch ends their sources and clears its scheduler", async () => {
    const engine = new SonificationEngine();
    await engine.ensure();
    const context = FakeAudioContext.last!;
    const baseline = context.nodes.length;
    await engine.play([event(220)], { source: "cosmic", bpm: 60 });
    const firstVoiceNodes = context.nodes.slice(baseline);
    expect(vi.getTimerCount()).toBe(1);

    await engine.play([event(330)], { source: "jukebox", bpm: 60 });
    expect(vi.getTimerCount()).toBe(1);
    context.sources[0].finish();
    expect(firstVoiceNodes.every((node) => node.disconnectCount === 1)).toBe(true);

    engine.stopAll();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("emits note events with the trace, and null when it ends", async () => {
    const engine = new SonificationEngine();
    const notes: (NoteEvent | null)[] = [];
    engine.onNote((note) => notes.push(note));
    const scape = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture");
    const ended = vi.fn();
    await engine.playSoundscape(scape, { onEnded: ended });
    advance(FakeAudioContext.last!, 6 * 0.625 + 0.5);
    const sounded = notes.filter((note): note is NoteEvent => note !== null);
    expect(sounded.map((note) => note.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sounded[0].layer).toMatchObject({ variable: "T2M", raw: 20 });
    expect(sounded[0].trace?.source).toBe("NASA POWER daily · Fixture");
    expect(sounded[0].trace?.measured.find((item) => item.name.startsWith("Temperature"))?.value).toBe("20.0");
    expect(sounded[0].name).toBe(scape.steps[0].lead!.name);
    expect(notes[notes.length - 1]).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
    expect(engine.playing).toBe(false);
  });

  it("loops for Earth Heartbeat until stopped", async () => {
    const engine = new SonificationEngine();
    const indices: number[] = [];
    const scape = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Fixture");
    await engine.playSoundscape(scape, { loop: true, heartbeat: true, onStep: (_step, index) => indices.push(index) });
    advance(FakeAudioContext.last!, 9 * 0.625);
    expect(indices.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 0, 1]);
    expect(engine.playing).toBe(true);
    engine.stopAll();
    expect(engine.playing).toBe(false);
  });

  it("playback rate shortens the step", async () => {
    const engine = new SonificationEngine();
    engine.setRate(2);
    const times: number[] = [];
    await engine.play([event(220), event(330), event(440)], { source: "test", bpm: 60, onIndex: () => times.push(FakeAudioContext.last!.currentTime) });
    advance(FakeAudioContext.last!, 2);
    expect(times.length).toBe(3);
    expect(times[1] - times[0]).toBeCloseTo(0.5, 1);
  });

  it("volume and mute set the master gain", async () => {
    const engine = new SonificationEngine();
    await engine.ensure();
    const master = FakeAudioContext.last!.gains[0];
    engine.setVolume(0.4);
    expect(master.gain.value).toBeCloseTo(0.4);
    engine.setMuted(true);
    expect(master.gain.value).toBe(0);
    engine.setMuted(false);
    expect(master.gain.value).toBeCloseTo(0.4);
    engine.setVolume(7);
    expect(engine.getState().volume).toBe(1);
  });
});

describe("transport (fake Web Audio)", () => {
  const three = () => [event(220), event(330), event(440)];

  it("pauses and resumes on the same step", async () => {
    const engine = new SonificationEngine();
    const heard: number[] = [];
    await engine.play(three(), { source: "jukebox", bpm: 60, onIndex: (index) => heard.push(index) });
    advance(FakeAudioContext.last!, 1.2);
    engine.pause();
    expect(engine.getState()).toMatchObject({ status: "paused", source: "jukebox", index: 1 });
    await engine.resume();
    advance(FakeAudioContext.last!, 3);
    expect(heard).toEqual([0, 1, 1, 2]);
    expect(engine.getState().status).toBe("ended");
    await engine.resume();
    expect(engine.getState()).toMatchObject({ status: "playing", index: 0 });
  });

  it("seeks while playing and while paused", async () => {
    const engine = new SonificationEngine();
    const heard: number[] = [];
    await engine.play(three(), { source: "cosmic", bpm: 60, onIndex: (index) => heard.push(index) });
    advance(FakeAudioContext.last!, 0.1);
    engine.seek(2);
    advance(FakeAudioContext.last!, 0.1);
    expect(heard).toEqual([0, 2]);
    engine.pause();
    engine.seek(-5);
    expect(engine.getState()).toMatchObject({ status: "paused", index: 0 });
    expect(heard[heard.length - 1]).toBe(0);
  });

  it("stop(source) only stops that source's run", async () => {
    const engine = new SonificationEngine();
    await engine.play(three(), { source: "jukebox", bpm: 60 });
    engine.stop("cosmic");
    expect(engine.getState()).toMatchObject({ playing: true, source: "jukebox" });
    engine.stop("jukebox");
    expect(engine.getState()).toMatchObject({ status: "idle", source: null });
  });

  it("reports a fractional position on the audio clock", async () => {
    const engine = new SonificationEngine();
    await engine.play(three(), { source: "jukebox", bpm: 60 });
    expect(engine.position()).toBeNull();
    advance(FakeAudioContext.last!, 1.6);
    const position = engine.position()!;
    expect(position).toBeGreaterThan(1);
    expect(position).toBeLessThan(2);
  });

  it("a hand touch pauses the run and records the frequency", async () => {
    const engine = new SonificationEngine();
    await engine.play(three(), { source: "jukebox", bpm: 60 });
    advance(FakeAudioContext.last!, 0.2);
    engine.touch({ frequency: 523, gain: 0.1, filterHz: 1200 });
    expect(engine.getState()).toMatchObject({ status: "paused", touch: 523 });
    engine.releaseTouch();
    expect(engine.getState().touch).toBeNull();
  });
});

describe("playPair (fake Web Audio)", () => {
  it("plays two places at once as one playback, aligned by day", async () => {
    const engine = new SonificationEngine();
    const left = buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "Left");
    const right = buildSoundscape(syntheticSeries({ T2M: [0, 1, 2, 3, 4, 5] }), DEFAULT_CONFIG, "Right");
    const seen: [string | undefined, string | undefined][] = [];
    await engine.playPair(left, right, { onStep: (a, b) => seen.push([a?.lead?.name, b?.lead?.name]) });
    advance(FakeAudioContext.last!, 1.5);
    expect(seen[0]).toEqual([left.steps[0].lead!.name, right.steps[0].lead!.name]);
    expect(engine.getState().source).toBe("pair");
    engine.stopAll();
    expect(engine.playing).toBe(false);
  });
});

describe("persistEnginePrefs", () => {
  it("restores and saves volume, mute and rate", () => {
    const data = new Map<string, string>([["synesthesia.engine.v1", JSON.stringify({ volume: 0.3, muted: true, rate: 2 })]]);
    const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
    const engine = new SonificationEngine();
    const stop = persistEnginePrefs(engine, store);
    expect(engine.getState()).toMatchObject({ volume: 0.3, muted: true, rate: 2 });
    engine.setVolume(0.9);
    expect(JSON.parse(data.get("synesthesia.engine.v1")!).volume).toBe(0.9);
    stop();
  });
  it("ignores corrupt storage", () => {
    const engine = new SonificationEngine();
    persistEnginePrefs(engine, { getItem: () => "{oops", setItem: () => undefined });
    expect(engine.getState().volume).toBe(0.7);
  });
});
