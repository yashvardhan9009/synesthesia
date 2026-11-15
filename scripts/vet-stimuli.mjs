// Vets Listening Test candidates against real NASA POWER data through the local API.
//
//   SYN_API_PORT=9101 node scripts/vet-stimuli.mjs [--write]
//
// For each place it fetches daily temperature, one year at a time, for a spread
// of years from 2001 to the last complete year, scores every 30-day window that
// starts on the 1st of a month with the app's own scoreClip (five-day mean of the
// robust same-calendar-day z), and keeps clearly unusual (≥ 2.5) and clearly
// normal (< 1.5) windows, spread over places, years and seasons. With --write it
// rewrites frontend/src/validation/stimuli.ts. The app still classifies every
// clip from the data it fetches; this list only chooses which windows to fetch.
import { writeFileSync } from "node:fs";
import { fetchBaseline, fetchPower } from "../frontend/src/api.ts";
import { NORMAL_MAX_Z, UNUSUAL_MIN_Z, scoreClip } from "../frontend/src/validation/study.ts";

const api = `http://127.0.0.1:${process.env.SYN_API_PORT ?? "8741"}`;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => nativeFetch(new URL(input, api), init);

/** Places across climates: monsoon, rainforest, polar, Mediterranean, desert, continental, oceanic, highland. */
const PLACES = [
  { key: "delhi", place: "New Delhi", latitude: 28.61, longitude: 77.21 },
  { key: "manaus", place: "Manaus", latitude: -3.12, longitude: -60.02 },
  { key: "nuuk", place: "Nuuk", latitude: 64.18, longitude: -51.72 },
  { key: "cape", place: "Cape Town", latitude: -33.93, longitude: 18.42 },
  { key: "taman", place: "Tamanrasset", latitude: 22.79, longitude: 5.52 },
  { key: "moscow", place: "Moscow", latitude: 55.76, longitude: 37.62 },
  { key: "chicago", place: "Chicago", latitude: 41.88, longitude: -87.63 },
  { key: "sydney", place: "Sydney", latitude: -33.87, longitude: 151.21 },
  { key: "lagos", place: "Lagos", latitude: 6.52, longitude: 3.38 },
  { key: "buenos", place: "Buenos Aires", latitude: -34.6, longitude: -58.38 },
  { key: "ulaan", place: "Ulaanbaatar", latitude: 47.89, longitude: 106.91 },
  { key: "reykjavik", place: "Reykjavik", latitude: 64.15, longitude: -21.94 },
  { key: "phoenix", place: "Phoenix", latitude: 33.45, longitude: -112.07 },
  { key: "paris", place: "Paris", latitude: 48.86, longitude: 2.35 },
  { key: "nairobi", place: "Nairobi", latitude: -1.29, longitude: 36.82 },
  { key: "tokyo", place: "Tokyo", latitude: 35.68, longitude: 139.69 },
];
const LAST_YEAR = new Date().getUTCFullYear() - 1;
/** Ten years per place, rotated so that together the places cover every year from 2001. */
const yearsFor = (index) => [...new Set(Array.from({ length: 10 }, (_, k) => 2001 + ((index * 3 + k * 5 + Math.floor(k / 5)) % (LAST_YEAR - 2000))))];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

async function limited(tasks, width = 4) {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < tasks.length) {
      const index = next++;
      out[index] = await tasks[index]();
    }
  }));
  return out;
}

const unusual = [];
const normal = [];
await limited(PLACES.map((place, index) => async () => {
  const baseline = await fetchBaseline(place.latitude, place.longitude, undefined, "T2M");
  for (const year of yearsFor(index)) {
    const series = await fetchPower({ lat: place.latitude, lon: place.longitude, start: `${year}-01-01`, end: `${year}-12-31`, parameters: "T2M" });
    for (let month = 1; month <= 12; month += 1) {
      const start = `${year}${pad(month)}01`;
      const from = series.dates.indexOf(start);
      if (from < 0 || from + 30 > series.dates.length) continue;
      const dates = series.dates.slice(from, from + 30);
      const window = { id: `${place.key}-${MONTHS[month - 1].toLowerCase()}${String(year).slice(2)}`, place: place.place, latitude: place.latitude, longitude: place.longitude, start: `${year}-${pad(month)}-01`, end: `${dates[29].slice(0, 4)}-${dates[29].slice(4, 6)}-${dates[29].slice(6)}` };
      const clip = scoreClip(window, { ...series, dates, parameters: { T2M: series.parameters.T2M.slice(from, from + 30) } }, baseline);
      if (clip.maxAbsZ >= UNUSUAL_MIN_Z + 0.1) unusual.push({ window, z: clip.peakZ, max: clip.maxAbsZ, year });
      else if (clip.maxAbsZ < NORMAL_MAX_Z - 0.25) normal.push({ window, z: clip.peakZ, max: clip.maxAbsZ, year });
    }
  }
  console.error(`${place.place}: done`);
}));

/** Spread the pick: at most three per place (one each before any second), one per place-year, alternating warm and cool events where possible. */
function pick(list, count, order) {
  const sorted = [...list].sort(order);
  const chosen = [];
  const perPlace = new Map();
  const usedYear = new Set();
  for (const pass of [1, 2, 3]) {
    for (const item of sorted) {
      if (chosen.length >= count) break;
      if (chosen.includes(item)) continue;
      const placed = perPlace.get(item.window.place) ?? 0;
      if (placed >= pass || usedYear.has(`${item.window.place}${item.year}`)) continue;
      chosen.push(item);
      perPlace.set(item.window.place, placed + 1);
      usedYear.add(`${item.window.place}${item.year}`);
    }
  }
  return chosen;
}
const warm = pick(unusual.filter((item) => item.z > 0), 12, (a, b) => b.max - a.max);
const cool = pick(unusual.filter((item) => item.z < 0), 12, (a, b) => b.max - a.max);
const chosenUnusual = [...warm, ...cool].slice(0, 24);
const chosenNormal = pick(normal, 24, (a, b) => a.max - b.max);
console.error(`Found ${unusual.length} unusual (${warm.length} warm, ${cool.length} cool kept) and ${normal.length} normal (${chosenNormal.length} kept) windows.`);

const line = (item) => `  { id: "${item.window.id}", place: "${item.window.place}", latitude: ${item.window.latitude}, longitude: ${item.window.longitude}, start: "${item.window.start}", end: "${item.window.end}" },`;
const body = `import type { CandidateWindow } from "./study.ts";

/**
 * Fixed 30-day NASA POWER windows for reproducible trials and the simulated
 * observer, vetted by scripts/vet-stimuli.mjs against the real record
 * (${PLACES.length} places, years 2001–${LAST_YEAR}). The list only says which windows to fetch:
 * the app classifies every clip again from the data it receives, and a window
 * between the cutoffs is never used.
 */
export const CANDIDATES: readonly CandidateWindow[] = [
  // Vetted as unusual: a five-day mean robust z of at least ${UNUSUAL_MIN_Z + 0.1} in magnitude.
${[...chosenUnusual].sort((a, b) => a.window.id.localeCompare(b.window.id)).map(line).join("\n")}
  // Vetted as normal: every five-day mean robust z below ${NORMAL_MAX_Z - 0.25} in magnitude.
${[...chosenNormal].sort((a, b) => a.window.id.localeCompare(b.window.id)).map(line).join("\n")}
];
`;
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../frontend/src/validation/stimuli.ts", import.meta.url), body);
  console.error("Wrote frontend/src/validation/stimuli.ts");
} else process.stdout.write(body);
