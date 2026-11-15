import type { PowerSeries } from "../types.ts";
import { sanitizeConfig, type KeyValueStore, type LabConfig } from "./labConfig.ts";
import { POWER_VARIABLES } from "./mappings.ts";

/**
 * Earth Sound Archive. A saved soundscape keeps the NASA POWER numbers it was
 * built from plus the config, so it replays offline and rebuilds to exactly the
 * same sound. Nothing is stored except what POWER returned.
 */

export const ARCHIVE_KEY = "synesthesia.archive.v1";
export const ARCHIVE_LIMIT = 24;

export type ArchiveEntry = {
  id: string;
  title: string;
  place: string;
  savedAt: string;
  config: LabConfig;
  series: PowerSeries;
};

/** Keep only the variables the soundscape uses, to stay small in localStorage. */
export function compactSeries(series: PowerSeries): PowerSeries {
  const keep = (record: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(record).filter(([key]) => (POWER_VARIABLES as readonly string[]).includes(key)));
  return {
    ...series,
    parameters: keep(series.parameters) as PowerSeries["parameters"],
    units: keep(series.units) as PowerSeries["units"],
    longnames: keep(series.longnames) as PowerSeries["longnames"],
  };
}

function isSeries(value: unknown): value is PowerSeries {
  if (!value || typeof value !== "object") return false;
  const series = value as Partial<PowerSeries>;
  return Array.isArray(series.dates) && !!series.parameters && typeof series.parameters === "object" && typeof series.start === "string";
}

export function listArchive(store: KeyValueStore): ArchiveEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(ARCHIVE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .filter((item) => typeof item.id === "string" && isSeries(item.series))
    .map((item) => ({
      id: item.id as string,
      title: typeof item.title === "string" ? item.title : "Untitled soundscape",
      place: typeof item.place === "string" ? item.place : "",
      savedAt: typeof item.savedAt === "string" ? item.savedAt : "",
      config: sanitizeConfig(item.config),
      series: item.series as PowerSeries,
    }));
}

/** Newest first. Drops the oldest beyond the limit, and keeps trying smaller if storage is full. */
export function saveToArchive(
  store: KeyValueStore,
  entry: Omit<ArchiveEntry, "id" | "savedAt">,
  now = new Date(),
): { entries: ArchiveEntry[]; saved: boolean } {
  const item: ArchiveEntry = {
    ...entry,
    series: compactSeries(entry.series),
    id: `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    savedAt: now.toISOString(),
  };
  let entries = [item, ...listArchive(store)].slice(0, ARCHIVE_LIMIT);
  while (entries.length > 0) {
    try {
      store.setItem(ARCHIVE_KEY, JSON.stringify(entries));
      return { entries, saved: true };
    } catch {
      if (entries.length === 1) break;
      entries = entries.slice(0, -1);
    }
  }
  return { entries: listArchive(store), saved: false };
}

export function removeFromArchive(store: KeyValueStore, id: string): ArchiveEntry[] {
  const entries = listArchive(store).filter((entry) => entry.id !== id);
  try {
    store.setItem(ARCHIVE_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable: the list in memory is still correct */
  }
  return entries;
}
