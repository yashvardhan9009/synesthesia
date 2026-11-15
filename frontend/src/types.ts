export type PitchFrom = "luminance" | "warmth" | "contrast";
export const SCALE_NAMES = ["pentatonic", "major", "dorian", "chromatic"] as const;
export type ScaleName = (typeof SCALE_NAMES)[number];
export type LeadParameter = "T2M" | "PRECTOTCORR" | "WS10M" | "WS2M" | "ALLSKY_SFC_SW_DWN" | "RH2M" | "PS" | "CLOUD_AMT";

export type SonicSettings = {
  scale: ScaleName;
  rootMidi: number;
  octaves: number;
  bpm: number;
  anomalyZ: number;
  /** "track" keeps each EIC frame's own mapping. */
  pitchFrom: PitchFrom | "track";
  /** POWER parameter that sets pitch in Cosmic Earth. */
  lead: LeadParameter;
};

export const DEFAULT_SETTINGS: SonicSettings = {
  scale: "pentatonic",
  rootMidi: 48,
  octaves: 2,
  bpm: 96,
  anomalyZ: 2.5,
  pitchFrom: "track",
  lead: "T2M",
};

export type TrackSummary = {
  svs_id: number;
  title: string;
  page_url: string;
  poster_url: string;
  kind: "image" | "video";
  pitch_from: PitchFrom;
  reading: string;
  nasa_description: string | null;
  description_error: string | null;
  release_date: string | null;
};

export type FrameSample = {
  index: number;
  label: string;
  image_url: string;
  playhead: number | null;
  luminance: number;
  warmth: number;
  contrast: number;
  red: number;
  green: number;
  blue: number;
};

export type TrackDetail = TrackSummary & {
  method: "spatial-scan" | "temporal-frames";
  warning: string | null;
  source_url: string;
  measured: string;
  samples: FrameSample[];
};

export type PowerPoint = { date: string; value: number | null };

export type PowerSeries = {
  latitude: number;
  longitude: number;
  start: string;
  end: string;
  request_url: string;
  source: string;
  parameters: Record<string, PowerPoint[]>;
  units: Record<string, string>;
  longnames: Record<string, string>;
  messages: string[];
  fill_value: number;
  header_title: string | null;
  dates: string[];
};

export type SonicEvent = {
  /** Index into the source series, so the highlight matches the sounding step when days are skipped. */
  sourceIndex: number;
  label: string;
  caption: string;
  frequency: number;
  gain: number;
  filterHz: number;
  noise: number;
  accent: boolean;
  wave: OscillatorType;
  harmony: number | null;
  harmonyGain: number;
};

export type Place = {
  name: string;
  lat: number;
  lon: number;
  why: string;
};

export const PLACES: Place[] = [
  {
    name: "New Delhi",
    lat: 28.61,
    lon: 77.21,
    why: "Pre-monsoon heat, then the sharp onset of rain.",
  },
  {
    name: "Manaus",
    lat: -3.12,
    lon: -60.02,
    why: "Equatorial rainforest: heavy rain, a small temperature range.",
  },
  {
    name: "Nuuk",
    lat: 64.18,
    lon: -51.72,
    why: "Arctic coast, where a warm day stands out.",
  },
  {
    name: "Tamanrasset",
    lat: 22.79,
    lon: 5.52,
    why: "Sahara: dry air, strong sun, large thermal swings.",
  },
  {
    name: "Equatorial Pacific",
    lat: 0,
    lon: -140,
    why: "Open ocean, the kind of grid cell behind sea-surface stories.",
  },
  {
    name: "Cape Town",
    lat: -33.93,
    lon: 18.42,
    why: "Southern winter rainfall, opposite the northern calendar.",
  },
];

export const PARAMETERS = {
  T2M: { label: "Air temperature", unit: "°C" },
  PRECTOTCORR: { label: "Precipitation", unit: "mm/day" },
  WS10M: { label: "Wind speed", unit: "m/s" },
  WS2M: { label: "Wind speed at 2 m", unit: "m/s" },
  ALLSKY_SFC_SW_DWN: { label: "Sunlight", unit: "MJ/m²/day" },
  RH2M: { label: "Humidity", unit: "%" },
  PS: { label: "Surface pressure", unit: "kPa" },
  CLOUD_AMT: { label: "Cloud amount", unit: "%" },
} as const;
