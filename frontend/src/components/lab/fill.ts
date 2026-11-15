import type { CSSProperties } from "react";

/** Sets --fill so the range track shows the value as a filled bar. */
export const fill = (value: number, low: number, high: number) =>
  ({ "--fill": `${((value - low) / (high - low)) * 100}%` }) as CSSProperties;
