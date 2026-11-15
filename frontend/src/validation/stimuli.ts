import type { CandidateWindow } from "./study.ts";

/**
 * Fixed 30-day NASA POWER windows for reproducible trials and the simulated
 * observer, vetted by scripts/vet-stimuli.mjs against the real record
 * (16 places, years 2001–2025). The list only says which windows to fetch:
 * the app classifies every clip again from the data it receives, and a window
 * between the cutoffs is never used.
 */
export const CANDIDATES: readonly CandidateWindow[] = [
  // Vetted as unusual: a five-day mean robust z of at least 2.6 in magnitude.
  { id: "buenos-mar23", place: "Buenos Aires", latitude: -34.6, longitude: -58.38, start: "2023-03-01", end: "2023-03-30" },
  { id: "chicago-aug04", place: "Chicago", latitude: 41.88, longitude: -87.63, start: "2004-08-01", end: "2004-08-30" },
  { id: "delhi-jan07", place: "New Delhi", latitude: 28.61, longitude: 77.21, start: "2007-01-01", end: "2007-01-30" },
  { id: "delhi-jul02", place: "New Delhi", latitude: 28.61, longitude: 77.21, start: "2002-07-01", end: "2002-07-30" },
  { id: "delhi-may21", place: "New Delhi", latitude: 28.61, longitude: 77.21, start: "2021-05-01", end: "2021-05-30" },
  { id: "lagos-aug21", place: "Lagos", latitude: 6.52, longitude: 3.38, start: "2021-08-01", end: "2021-08-30" },
  { id: "lagos-jan15", place: "Lagos", latitude: 6.52, longitude: 3.38, start: "2015-01-01", end: "2015-01-30" },
  { id: "manaus-dec15", place: "Manaus", latitude: -3.12, longitude: -60.02, start: "2015-12-01", end: "2015-12-30" },
  { id: "manaus-jul10", place: "Manaus", latitude: -3.12, longitude: -60.02, start: "2010-07-01", end: "2010-07-30" },
  { id: "manaus-jul25", place: "Manaus", latitude: -3.12, longitude: -60.02, start: "2025-07-01", end: "2025-07-30" },
  { id: "moscow-dec12", place: "Moscow", latitude: 55.76, longitude: 37.62, start: "2012-12-01", end: "2012-12-30" },
  { id: "moscow-jan06", place: "Moscow", latitude: 55.76, longitude: 37.62, start: "2006-01-01", end: "2006-01-30" },
  { id: "nairobi-oct24", place: "Nairobi", latitude: -1.29, longitude: 36.82, start: "2024-10-01", end: "2024-10-30" },
  { id: "nuuk-feb08", place: "Nuuk", latitude: 64.18, longitude: -51.72, start: "2008-02-01", end: "2008-03-01" },
  { id: "nuuk-sep22", place: "Nuuk", latitude: 64.18, longitude: -51.72, start: "2022-09-01", end: "2022-09-30" },
  { id: "paris-aug20", place: "Paris", latitude: 48.86, longitude: 2.35, start: "2020-08-01", end: "2020-08-30" },
  { id: "phoenix-jan13", place: "Phoenix", latitude: 33.45, longitude: -112.07, start: "2013-01-01", end: "2013-01-30" },
  { id: "reykjavik-apr15", place: "Reykjavik", latitude: 64.15, longitude: -21.94, start: "2015-04-01", end: "2015-04-30" },
  { id: "reykjavik-aug04", place: "Reykjavik", latitude: 64.15, longitude: -21.94, start: "2004-08-01", end: "2004-08-30" },
  { id: "reykjavik-may25", place: "Reykjavik", latitude: 64.15, longitude: -21.94, start: "2025-05-01", end: "2025-05-30" },
  { id: "sydney-jul07", place: "Sydney", latitude: -33.87, longitude: 151.21, start: "2007-07-01", end: "2007-07-30" },
  { id: "sydney-sep23", place: "Sydney", latitude: -33.87, longitude: 151.21, start: "2023-09-01", end: "2023-09-30" },
  { id: "taman-sep24", place: "Tamanrasset", latitude: 22.79, longitude: 5.52, start: "2024-09-01", end: "2024-09-30" },
  { id: "ulaan-jan01", place: "Ulaanbaatar", latitude: 47.89, longitude: 106.91, start: "2001-01-01", end: "2001-01-30" },
  // Vetted as normal: every five-day mean robust z below 1.25 in magnitude.
  { id: "buenos-apr19", place: "Buenos Aires", latitude: -34.6, longitude: -58.38, start: "2019-04-01", end: "2019-04-30" },
  { id: "buenos-jun14", place: "Buenos Aires", latitude: -34.6, longitude: -58.38, start: "2014-06-01", end: "2014-06-30" },
  { id: "cape-dec16", place: "Cape Town", latitude: -33.93, longitude: 18.42, start: "2016-12-01", end: "2016-12-30" },
  { id: "cape-jan10", place: "Cape Town", latitude: -33.93, longitude: 18.42, start: "2010-01-01", end: "2010-01-30" },
  { id: "chicago-feb10", place: "Chicago", latitude: 41.88, longitude: -87.63, start: "2010-02-01", end: "2010-03-02" },
  { id: "delhi-jul01", place: "New Delhi", latitude: 28.61, longitude: 77.21, start: "2001-07-01", end: "2001-07-30" },
  { id: "lagos-aug25", place: "Lagos", latitude: 6.52, longitude: 3.38, start: "2025-08-01", end: "2025-08-30" },
  { id: "lagos-jul10", place: "Lagos", latitude: 6.52, longitude: 3.38, start: "2010-07-01", end: "2010-07-30" },
  { id: "manaus-aug09", place: "Manaus", latitude: -3.12, longitude: -60.02, start: "2009-08-01", end: "2009-08-30" },
  { id: "manaus-may14", place: "Manaus", latitude: -3.12, longitude: -60.02, start: "2014-05-01", end: "2014-05-30" },
  { id: "moscow-sep11", place: "Moscow", latitude: 55.76, longitude: 37.62, start: "2011-09-01", end: "2011-09-30" },
  { id: "nairobi-jan13", place: "Nairobi", latitude: -1.29, longitude: 36.82, start: "2013-01-01", end: "2013-01-30" },
  { id: "nuuk-mar17", place: "Nuuk", latitude: 64.18, longitude: -51.72, start: "2017-03-01", end: "2017-03-30" },
  { id: "paris-jul20", place: "Paris", latitude: 48.86, longitude: 2.35, start: "2020-07-01", end: "2020-07-30" },
  { id: "paris-jul21", place: "Paris", latitude: 48.86, longitude: 2.35, start: "2021-07-01", end: "2021-07-30" },
  { id: "phoenix-jan22", place: "Phoenix", latitude: 33.45, longitude: -112.07, start: "2022-01-01", end: "2022-01-30" },
  { id: "reykjavik-jan14", place: "Reykjavik", latitude: 64.15, longitude: -21.94, start: "2014-01-01", end: "2014-01-30" },
  { id: "sydney-feb07", place: "Sydney", latitude: -33.87, longitude: 151.21, start: "2007-02-01", end: "2007-03-02" },
  { id: "sydney-may03", place: "Sydney", latitude: -33.87, longitude: 151.21, start: "2003-05-01", end: "2003-05-30" },
  { id: "taman-jan18", place: "Tamanrasset", latitude: 22.79, longitude: 5.52, start: "2018-01-01", end: "2018-01-30" },
  { id: "tokyo-jul02", place: "Tokyo", latitude: 35.68, longitude: 139.69, start: "2002-07-01", end: "2002-07-30" },
  { id: "tokyo-jul21", place: "Tokyo", latitude: 35.68, longitude: 139.69, start: "2021-07-01", end: "2021-07-30" },
  { id: "ulaan-apr16", place: "Ulaanbaatar", latitude: 47.89, longitude: 106.91, start: "2016-04-01", end: "2016-04-30" },
  { id: "ulaan-nov11", place: "Ulaanbaatar", latitude: 47.89, longitude: 106.91, start: "2011-11-01", end: "2011-11-30" },
];
