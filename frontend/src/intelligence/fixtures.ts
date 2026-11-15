import type { RegionData, RegionParameter, SampledPoint } from "./regionApi.ts";

/**
 * SYNTHETIC region data for tests: deterministic arithmetic, not NASA
 * observations. 1981–2025, with a steady warming, a seasonal cycle, small
 * wiggles and three planted events: March 2024 is 1.5 °C warm, June–September
 * 2015 has half its usual rain, January 2020 is 1.5 m/s windy.
 */
export function syntheticRegion(): RegionData {
  const months: string[] = [];
  for (let year = 1981; year <= 2025; year += 1) for (let month = 1; month <= 12; month += 1) months.push(`${year}${String(month).padStart(2, "0")}`);
  const wiggle = (i: number, k: number) => Math.sin(i * k) * 0.5 + Math.sin(i * k * 2.3) * 0.5;
  const series = (shift: number): Record<RegionParameter, (number | null)[]> => {
    const T2M = months.map((key, i) => {
      const year = Number(key.slice(0, 4));
      const month = Number(key.slice(4, 6));
      let value = 26 + 0.02 * (year - 1981) + 1.5 * Math.cos(((month - 3) / 12) * 2 * Math.PI) + 0.12 * wiggle(i, 1.7) + shift;
      if (key === "202403") value += 1.5 + shift;
      return Math.round(value * 100) / 100;
    });
    const PRECTOTCORR = months.map((key, i) => {
      const month = Number(key.slice(4, 6));
      let value = 5 + 2 * Math.sin((month / 12) * 2 * Math.PI) + 0.3 * wiggle(i, 2.1);
      if (["201506", "201507", "201508", "201509"].includes(key)) value *= 0.5;
      return Math.round(value * 100) / 100;
    });
    const WS2M = months.map((key, i) => Math.round((6 + 0.15 * wiggle(i, 1.3) + (key === "202001" ? 1.5 : 0)) * 100) / 100);
    const RH2M = months.map((_, i) => Math.round((80 + 1.5 * wiggle(i, 0.9)) * 100) / 100);
    return { T2M, PRECTOTCORR, WS2M, RH2M };
  };
  const point = (row: number, column: number, lat: number, lon: number, shift: number): SampledPoint => ({
    row, column, lat, lon, weight: Math.cos((lat * Math.PI) / 180), request_url: `https://power.larc.nasa.gov/api/temporal/monthly/point?latitude=${lat}&longitude=${lon}`, series: series(shift),
  });
  const points = [point(0, 0, 5, 60, 0.4), point(0, 1, 5, 90, 0), point(1, 0, -15, 60, 0), point(1, 1, -15, 90, 0)];
  return {
    box: { south: -20, west: 55, north: 10, east: 95 },
    start: 1981,
    end: 2025,
    parameters: ["T2M", "PRECTOTCORR", "WS2M", "RH2M"],
    units: { T2M: "C", PRECTOTCORR: "mm/day", WS2M: "m/s", RH2M: "%" },
    months,
    points,
    failed: [],
    requested: 4,
    mean: series(0),
    coverage: { T2M: [], PRECTOTCORR: [], WS2M: [], RH2M: [] },
    weighting: "cos(latitude)",
    request_urls: points.map((item) => item.request_url),
    source: "SYNTHETIC fixture",
  };
}
