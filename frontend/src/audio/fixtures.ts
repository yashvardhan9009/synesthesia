import type { PowerSeries } from "../types.ts";

/** SYNTHETIC POWER-shaped series for tests only. Never shown as NASA data. */
export function syntheticSeries(overrides: Partial<Record<string, (number | null)[]>> = {}): PowerSeries {
  const dates = ["20250601", "20250602", "20250603", "20250604", "20250605", "20250606"];
  const columns: Record<string, (number | null)[]> = {
    T2M: [20, 20.5, 19.8, 20.2, 35, 20.1],
    PRECTOTCORR: [0, 0.05, 2, 12, 0, 49],
    WS2M: [0, 3, 6, 9, 12, 15],
    RH2M: [10, 30, 50, 70, 90, 100],
    PS: [100, 100.1, 99.9, 100, 98, 100.05],
    CLOUD_AMT: [0, 20, 40, 60, 80, 100],
    ...overrides,
  };
  return {
    latitude: 1,
    longitude: 2,
    start: dates[0],
    end: dates[dates.length - 1],
    request_url: "synthetic",
    source: "SYNTHETIC fixture, not a NASA observation",
    parameters: Object.fromEntries(
      Object.entries(columns).map(([name, values]) => [name, dates.map((date, index) => ({ date, value: values?.[index] ?? null }))]),
    ),
    units: { T2M: "C", PRECTOTCORR: "mm/day", WS2M: "m/s", RH2M: "%", PS: "kPa", CLOUD_AMT: "%" },
    longnames: {},
    messages: [],
    fill_value: -999,
    header_title: null,
    dates,
  };
}
