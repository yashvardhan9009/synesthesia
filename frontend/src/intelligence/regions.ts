/**
 * Regions for Earth Listening Intelligence. A region is a lat/lon box that is
 * sampled as a grid of NASA POWER points, not a single point. Shared by the
 * landing page, the listening view and the case study, so a preset id in a
 * link (#/listen?region=indian-ocean) means the same box everywhere.
 */
export type RegionBox = {
  id: string;
  name: string;
  /** South, west, north, east in degrees. West may exceed east only if never used; keep boxes within -180..180. */
  south: number;
  west: number;
  north: number;
  east: number;
  /** One line on what the box covers, geography only, no claims about the data. */
  blurb: string;
};

export const PRESET_REGIONS: readonly RegionBox[] = [
  { id: "indian-ocean", name: "Indian Ocean", south: -20, west: 55, north: 10, east: 95, blurb: "The open tropical Indian Ocean between East Africa, India and Sumatra." },
  { id: "sahel", name: "Sahel", south: 10, west: -15, north: 18, east: 35, blurb: "The semi-arid belt south of the Sahara, from Senegal to Sudan." },
  { id: "amazon", name: "Amazon", south: -12, west: -72, north: 2, east: -50, blurb: "The Amazon basin rainforest of Brazil, Peru and Colombia." },
  { id: "arctic", name: "Arctic", south: 70, west: -180, north: 85, east: 180, blurb: "The Arctic Ocean and the northern rim of the continents above 70° N." },
];

export const DEFAULT_REGION_ID = "indian-ocean";

export function presetRegion(id: string | null | undefined): RegionBox | undefined {
  return PRESET_REGIONS.find((region) => region.id === id);
}

/** Read ?region=… from a hash such as #/listen?region=sahel. */
export function regionFromHash(hash: string): string | null {
  const query = hash.split("?")[1];
  return query ? new URLSearchParams(query).get("region") : null;
}

export function listenHash(regionId: string): string {
  return `#/listen?region=${encodeURIComponent(regionId)}`;
}
