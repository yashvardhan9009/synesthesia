import { alignMeasurement, measurementRange } from "./comparison.ts";
import type { PowerSeries } from "../types.ts";

type Props = {
  earlier: PowerSeries;
  later: PowerSeries;
  parameter: string;
  label: string;
  unit: string;
  /** Legend names of the two series. */
  names?: [string, string];
};
const WIDTH = 960;
const LEFT = 40;
const RIGHT = 10;
const TOP = 20;
const HEIGHT = 118;

export function ComparisonChart({ earlier, later, parameter, label, unit, names = ["Earlier", "Later"] }: Props) {
  const rows = alignMeasurement(earlier, later, parameter);
  const count = rows.length;
  const range = measurementRange([
    ...(earlier.parameters[parameter] ?? []),
    ...(later.parameters[parameter] ?? []),
  ]);
  const [minimum, maximum] = range;
  const x = (index: number) => LEFT + index / Math.max(1, count - 1) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => TOP + HEIGHT - (value - minimum) / (maximum - minimum) * HEIGHT;
  const path = (get: (row: (typeof rows)[number]) => number | null) => {
    let current: string[] = [];
    const paths: string[] = [];
    rows.forEach((row, index) => {
      const value = get(row);
      if (value === null) {
        if (current.length) paths.push(current.join(" "));
        current = [];
      } else current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
    });
    if (current.length) paths.push(current.join(" "));
    return paths;
  };
  const before = path((row) => row.earlier);
  const after = path((row) => row.later);
  const usable = rows.filter((row) => row.earlier !== null && row.later !== null).length;

  return (
    <figure className="chart-figure">
      <div className="chart-head">
        <span className="label">{label} · {unit} · day-matched</span>
        <span className="mono tiny">{usable} paired days · {minimum.toFixed(1)} to {maximum.toFixed(1)} {unit}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${TOP + HEIGHT + 20}`} role="img" aria-label={`${label}: ${names[0]} against ${names[1]}. Missing days are gaps. ${usable} days have both measurements.`}>
        {[0, 0.5, 1].map((fraction) => {
          const tick = minimum + (maximum - minimum) * fraction;
          const yy = y(tick);
          return <g key={fraction}><line className="grid" x1={LEFT} x2={WIDTH - RIGHT} y1={yy} y2={yy} /><text className="axis-text" x={LEFT - 7} y={yy + 4} textAnchor="end">{tick.toFixed(1)}</text></g>;
        })}
        {before.map((points) => <polyline key={`a-${points}`} className="strip-trace trace-earlier" points={points} />)}
        {after.map((points) => <polyline key={`b-${points}`} className="trace" points={points} />)}
        {rows.map((row, index) => row.earlier === null || row.later === null
          ? <rect key={row.day} className="missing" x={x(index) - 1} y={TOP + HEIGHT - 5} width={2} height={5} />
          : null)}
        {count > 0 && <><text className="axis-text" x={LEFT} y={TOP + HEIGHT + 16}>{rows[0].day.slice(0, 2)}/{rows[0].day.slice(2, 4)}</text><text className="axis-text" x={WIDTH - RIGHT} y={TOP + HEIGHT + 16} textAnchor="end">{rows[count - 1].day.slice(0, 2)}/{rows[count - 1].day.slice(2, 4)}</text></>}
      </svg>
      <figcaption className="legend-inline"><span><i className="swatch ring" /> {names[0]}</span><span><i className="swatch" /> {names[1]}</span><span>Gaps mark missing NASA POWER measurements</span></figcaption>
    </figure>
  );
}
