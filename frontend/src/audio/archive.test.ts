import { describe, expect, it } from "vitest";
import { ARCHIVE_LIMIT, listArchive, removeFromArchive, saveToArchive } from "./archive.ts";
import { syntheticSeries } from "./fixtures.ts";
import { DEFAULT_CONFIG, type KeyValueStore } from "./labConfig.ts";
import { buildSoundscape } from "./soundscape.ts";

function memoryStore(limit = Infinity): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > limit) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => void data.delete(key),
  };
}

describe("Earth Sound Archive (SYNTHETIC)", () => {
  it("saves, lists newest first, rebuilds the same sound, and removes", () => {
    const store = memoryStore();
    const series = syntheticSeries();
    series.parameters.EXTRA = [];
    saveToArchive(store, { title: "First", place: "A", config: DEFAULT_CONFIG, series }, new Date("2026-01-01"));
    const { entries } = saveToArchive(store, { title: "Second", place: "B", config: DEFAULT_CONFIG, series }, new Date("2026-01-02"));
    expect(entries.map((entry) => entry.title)).toEqual(["Second", "First"]);
    const listed = listArchive(store);
    expect(listed[0].series.parameters.EXTRA).toBeUndefined();
    expect(buildSoundscape(listed[0].series, listed[0].config, "B")).toEqual(buildSoundscape(syntheticSeries(), DEFAULT_CONFIG, "B"));
    expect(removeFromArchive(store, listed[0].id).map((entry) => entry.title)).toEqual(["First"]);
  });

  it("caps the archive", () => {
    const store = memoryStore();
    for (let index = 0; index < ARCHIVE_LIMIT + 3; index += 1) {
      saveToArchive(store, { title: `n${index}`, place: "", config: DEFAULT_CONFIG, series: syntheticSeries() });
    }
    expect(listArchive(store)).toHaveLength(ARCHIVE_LIMIT);
  });

  it("drops the oldest entries when storage is full", () => {
    const one = JSON.stringify([{ id: "x", config: DEFAULT_CONFIG, series: syntheticSeries() }]).length;
    const store = memoryStore(one * 2.5);
    for (let index = 0; index < 5; index += 1) {
      const result = saveToArchive(store, { title: `n${index}`, place: "", config: DEFAULT_CONFIG, series: syntheticSeries() });
      expect(result.saved).toBe(true);
    }
    const titles = listArchive(store).map((entry) => entry.title);
    expect(titles[0]).toBe("n4");
    expect(titles.length).toBeLessThan(5);
  });

  it("ignores corrupt storage", () => {
    const store = memoryStore();
    store.setItem("synesthesia.archive.v1", "[{\"id\": 3}, null, \"x\"]");
    expect(listArchive(store)).toEqual([]);
  });
});
