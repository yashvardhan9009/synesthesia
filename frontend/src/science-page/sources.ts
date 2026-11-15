import { MAPPINGS } from "../audio/mappings.ts";

/**
 * The datasets and formulas the Science & Methodology page documents.
 * Kept beside the page as data so a test can hold it to the code it describes.
 */
export type PowerParameter = {
  id: string;
  name: string;
  unit: string;
  heard: string;
};

export const POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_DOCS = "https://power.larc.nasa.gov/docs/services/api/temporal/daily/";
export const POWER_PARAMS_DOCS = "https://power.larc.nasa.gov/parameters/";
export const SVS_GALLERY = "https://svs.gsfc.nasa.gov/gallery/earth-information-center/";
export const SVS_API = "https://svs.gsfc.nasa.gov/api/";
export const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
export const GIBS_DOCS = "https://nasa-gibs.github.io/gibs-api-docs/";
export const CHALLENGE = "https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/";

/** Parameters the backend proxy accepts (backend/app/power.py ALLOWED_PARAMETERS). */
export const POWER_PARAMETERS: PowerParameter[] = [
  { id: "T2M", name: "Temperature at 2 metres", unit: "°C", heard: `Soundscape: ${MAPPINGS.T2M.sound.toLowerCase()}. Lead melody: pitch (the default lead). Time Machine: day-matched change, later minus earlier, on a fixed pitch scale (zero change is the reference tonic).` },
  { id: "PRECTOTCORR", name: "Precipitation, bias-corrected", unit: "mm/day", heard: `Soundscape: ${MAPPINGS.PRECTOTCORR.sound.toLowerCase()}. Lead melody: filtered-noise texture, or pitch when chosen as lead.` },
  { id: "WS10M", name: "Wind speed at 10 metres", unit: "m/s", heard: "Lead melody: low-pass filter opening, windier days sound brighter." },
  { id: "WS2M", name: "Wind speed at 2 metres", unit: "m/s", heard: `Soundscape: ${MAPPINGS.WS2M.sound.toLowerCase()}.` },
  { id: "ALLSKY_SFC_SW_DWN", name: "All-sky surface shortwave downward irradiance", unit: "MJ/m²/day", heard: "Lead melody: loudness scaling, sunnier days are a little louder." },
  { id: "RH2M", name: "Relative humidity at 2 metres", unit: "%", heard: `Soundscape: ${MAPPINGS.RH2M.sound.toLowerCase()}. Lead melody: a quiet fifth above the note.` },
  { id: "PS", name: "Surface pressure", unit: "kPa", heard: `Soundscape: ${MAPPINGS.PS.sound.toLowerCase()}.` },
  { id: "CLOUD_AMT", name: "Cloud amount", unit: "%", heard: `Soundscape: ${MAPPINGS.CLOUD_AMT.sound.toLowerCase()}.` },
];

export type Provenance = { what: string; kind: "measured" | "derived" | "generated"; note: string };

/** What is NASA data, what is computed from it, and what the instrument makes up. */
export const PROVENANCE: Provenance[] = [
  { what: "POWER daily values (T2M, rain, wind, sun, humidity…)", kind: "measured", note: "As returned by the POWER API for the grid cell, unchanged. −999 becomes missing." },
  { what: "SVS picture statistics: brightness, warmth, contrast, mean RGB", kind: "derived", note: "Computed from the NASA file's pixels. They describe the visualization's colours, not physical units." },
  { what: "Blue Marble brightness under the pointer", kind: "derived", note: "Luminance of the GIBS image pixel. It is an image, not a temperature." },
  { what: "0–1 scaled value", kind: "derived", note: "Percentile scaling within the series being played." },
  { what: "Robust z and the outlier flag", kind: "derived", note: "Median and MAD of the same series (Time Machine: of the change)." },
  { what: "Note, frequency, loudness, filter", kind: "derived", note: "Fixed formulas from the scaled value and flag. Reproducible." },
  { what: "Scale, tonic, tempo, octaves, speed, volume", kind: "generated", note: "Your settings. They change how it sounds, not the data." },
  { what: "Timbre, harmony ratios, noise beds, the outlier ping", kind: "generated", note: "The instrument's design. Each jukebox frame's soundscape carries no data." },
];

export const LIMITATIONS: string[] = [
  "SVS visualizations are pictures. Brightness and warmth follow each visualization's colour palette; they are not calibrated physical quantities, and two frames' pitches cannot be compared as measurements.",
  "Large SVS movies (over 50 MB) are not downloaded; those tracks scan the official preview still instead, and the page says so.",
  "Each frame is read as 24 slices or 24 sampled frames. Fine structure between samples is not heard.",
  "Scaling is per series (5th–95th percentile), so the highest note always means “high for this series”, not a global absolute.",
  "Anomalies are relative to the window being played, not to a long-term climatology. A 30-day window can only flag days unusual within those 30 days.",
  "NASA POWER is a gridded reanalysis and satellite product (MERRA-2 / GEOS meteorology, CERES / GEWEX solar), not a station record. A grid cell is about half a degree across; recent days arrive after a delay.",
  "The Blue Marble image on the landing globe is a 2004 composite at 1024×512. It is for orientation and touch, not analysis.",
  "Browser audio timing can drift by a few milliseconds. The scan line follows the audio clock, so picture and sound stay together.",
];

export const ATTRIBUTION: { name: string; text: string; url: string }[] = [
  {
    name: "NASA Scientific Visualization Studio",
    text: "Visualizations from the Earth Information Center gallery, courtesy of NASA's Scientific Visualization Studio. Each frame links to its SVS page and credits.",
    url: SVS_GALLERY,
  },
  {
    name: "NASA POWER",
    text: "These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.",
    url: "https://power.larc.nasa.gov/",
  },
  {
    name: "NASA GIBS",
    text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
    url: GIBS_DOCS,
  },
];
