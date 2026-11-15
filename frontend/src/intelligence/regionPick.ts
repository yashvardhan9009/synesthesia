import { DEFAULT_REGION_ID, presetRegion, regionFromHash, type RegionBox } from "./regions.ts";

/**
 * Choosing a region other than a preset: a box around a searched place or a
 * clicked map point, and the link that reopens it. Pure helpers.
 */

/** Half-size of a box built around a place: about 1,300 km by 1,800 km at the equator. */
export const PICK_HALF_LAT = 6;
export const PICK_HALF_LON = 8;

const round = (value: number) => Math.round(value * 100) / 100;

/** A box centred on a point, clipped to the globe (a box never crosses the date line or a pole). */
export function boxAround(lat: number, lon: number, name: string, halfLat = PICK_HALF_LAT, halfLon = PICK_HALF_LON): RegionBox {
  const south = Math.max(-90, lat - halfLat);
  const north = Math.min(90, lat + halfLat);
  const west = Math.max(-180, lon - halfLon);
  const east = Math.min(180, lon + halfLon);
  return {
    id: `box:${round(south)},${round(west)},${round(north)},${round(east)}`,
    name,
    south: round(south),
    west: round(west),
    north: round(north),
    east: round(east),
    blurb: `A ${round(north - south)}° by ${round(east - west)}° box centred on ${formatCoord(lat, "N", "S")}, ${formatCoord(lon, "E", "W")}.`,
  };
}

export function formatCoord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`;
}

/** Equirectangular map position (0–1 each way) to latitude and longitude. */
export function mapToLatLon(x: number, y: number): { lat: number; lon: number } {
  const cx = Math.min(1, Math.max(0, x));
  const cy = Math.min(1, Math.max(0, y));
  return { lat: round(90 - cy * 180), lon: round(-180 + cx * 360) };
}

/** #/listen?region=sahel, or #/listen?box=s,w,n,e&name=… for a custom box; `page` picks another page with the same query (#/case?region=…). */
export function regionLink(box: RegionBox, page: "listen" | "case" = "listen"): string {
  if (presetRegion(box.id)) return `#/${page}?region=${encodeURIComponent(box.id)}`;
  const query = new URLSearchParams({ box: [box.south, box.west, box.north, box.east].join(","), name: box.name });
  return `#/${page}?${query.toString()}`;
}

/** The region a hash names: a preset, a valid custom box, or the fallback preset. */
export function regionFromLink(hash: string, fallbackId = DEFAULT_REGION_ID): RegionBox {
  const preset = presetRegion(regionFromHash(hash));
  if (preset) return preset;
  const query = new URLSearchParams(hash.split("?")[1] ?? "");
  const parts = (query.get("box") ?? "").split(",").map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    const [south, west, north, east] = parts;
    if (south >= -90 && north <= 90 && north - south >= 1 && north - south <= 60 && west >= -180 && east <= 180 && east - west >= 1) {
      const name = (query.get("name") ?? "").trim().slice(0, 80) || "Chosen region";
      const box = boxAround((south + north) / 2, (west + east) / 2, name, (north - south) / 2, (east - west) / 2);
      return { ...box, south, west, north, east, id: `box:${south},${west},${north},${east}` };
    }
  }
  return (presetRegion(fallbackId) ?? presetRegion(DEFAULT_REGION_ID)) as RegionBox;
}
