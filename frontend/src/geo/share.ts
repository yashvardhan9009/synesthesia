import { decodeConfig, encodeConfig, type LabConfig } from "../audio/labConfig.ts";
import { PARAMETERS, SCALE_NAMES, type LeadParameter, type ScaleName } from "../types.ts";

/** How Cosmic Earth voices a place: the six-variable soundscape, or one parameter as a melody. */
export type CosmicSound = "soundscape" | "lead";

/** Everything a Cosmic Earth link reproduces. */
export type ShareState = {
  lat: number;
  lon: number;
  /** YYYY-MM-DD. */
  start: string;
  end: string;
  sound: CosmicSound;
  lead: LeadParameter;
  bpm: number;
  scale: ScaleName;
  rootMidi: number;
  /** The Sonic Lab configuration the soundscape was heard with. */
  config: LabConfig | null;
};

const LEADS = Object.keys(PARAMETERS) as LeadParameter[];

/** A link that reopens Cosmic Earth on this place, window and sound. The hash route is kept. */
export function encodeShareUrl(state: ShareState, base: string): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "#/cosmic";
  const params = url.searchParams;
  params.set("mode", "cosmic");
  params.set("lat", state.lat.toFixed(4));
  params.set("lon", state.lon.toFixed(4));
  params.set("start", state.start);
  params.set("end", state.end);
  params.set("sound", state.sound);
  params.set("lead", state.lead);
  params.set("bpm", String(state.bpm));
  params.set("scale", state.scale);
  params.set("root", String(state.rootMidi));
  if (state.config) params.set("cfg", encodeConfig(state.config));
  return url.toString();
}

/** Read a Cosmic Earth link. Anything missing, malformed or out of range is left out. */
export function decodeShareUrl(search: string): Partial<ShareState> {
  const params = new URLSearchParams(search);
  if (params.get("mode") !== "cosmic") return {};
  const number = (name: string) => (params.has(name) ? Number(params.get(name)) : Number.NaN);
  const lat = number("lat");
  const lon = number("lon");
  const bpm = number("bpm");
  const rootMidi = number("root");
  const lead = params.get("lead");
  const scale = params.get("scale");
  const sound = params.get("sound");
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";
  const config = params.has("cfg") ? decodeConfig(params.get("cfg") ?? "") : null;
  return {
    ...(Number.isFinite(lat) && lat >= -90 && lat <= 90 ? { lat } : {}),
    ...(Number.isFinite(lon) && lon >= -180 && lon <= 180 ? { lon } : {}),
    ...(isDay(start) ? { start } : {}),
    ...(isDay(end) ? { end } : {}),
    ...(sound === "soundscape" || sound === "lead" ? { sound } : {}),
    ...(lead && (LEADS as string[]).includes(lead) ? { lead: lead as LeadParameter } : {}),
    ...(Number.isInteger(bpm) && bpm >= 48 && bpm <= 200 ? { bpm } : {}),
    ...(scale && (SCALE_NAMES as readonly string[]).includes(scale) ? { scale: scale as ScaleName } : {}),
    ...(Number.isInteger(rootMidi) && rootMidi >= 24 && rootMidi <= 84 ? { rootMidi } : {}),
    ...(config ? { config } : {}),
  };
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
