import { useState } from "react";
import { formatDay } from "../audio/build.ts";
import type { PowerPoint } from "../types.ts";

const W = 760;
const PLOT_LEFT = 44;
const PLOT_RIGHT = 12;
const MAIN_TOP = 14;
const MAIN_H = 168;

type Strip = { name: string; unit: string; role: string; points: PowerPoint[]; lead: boolean };

type Props = {
  label: string;
  unit: string;
  points: PowerPoint[];
  flagged: boolean[];
  activeIndex: number | null;
  strips: Strip[];
};

function x(index: number, count: number): number {
  return PLOT_LEFT + (index / Math.max(1, count - 1)) * (W - PLOT_LEFT - PLOT_RIGHT);
}

/** Polyline segments that break at missing days, so a gap is drawn as a gap. */
function segments(points: PowerPoint[], y: (value: number) => number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) out.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${x(index, points.length).toFixed(1)},${y(point.value).toFixed(1)}`);
  });
  if (current.length) out.push(current.join(" "));
  return out;
}

function range(points: PowerPoint[]): [number, number] {
  const finite = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (!finite.length) return [0, 1];
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

export function PowerChart({ label, unit, points, flagged, activeIndex, strips }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const count = points.length;
  const [lo, hi] = range(points);
  const pad = (hi - lo) * 0.08;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (value: number) => MAIN_TOP + MAIN_H - ((value - yMin) / (yMax - yMin)) * MAIN_H;
  const stripTop = MAIN_TOP + MAIN_H + 40;
  const stripH = 30;
  const stripGap = 10;
  const height = stripTop + strips.length * (stripH + stripGap) + 4;
  const ticks = [lo, (lo + hi) / 2, hi];
  const xTicks = count > 2 ? [0, Math.floor((count - 1) / 2), count - 1] : [0, Math.max(0, count - 1)];
  const marker = hover ?? activeIndex;
  const markerPoint = marker !== null ? points[marker] : null;
  const leadSegments = segments(points, y);
  const areaPath = leadSegments
    .map((segment) => {
      const coords = segment.split(" ");
      const first = coords[0].split(",")[0];
      const last = coords[coords.length - 1].split(",")[0];
      return `M${first},${MAIN_TOP + MAIN_H} L${coords.join(" L")} L${last},${MAIN_TOP + MAIN_H} Z`;
    })
    .join(" ");

  return (
    <figure className="chart-figure">
      <div className="chart-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <span className="label">
          {label} · {unit} · daily
        </span>
        <span className="mono tiny" aria-hidden="true" style={{ color: "var(--text)" }}>
          {markerPoint
            ? `${formatDay(markerPoint.date)} · ${markerPoint.value === null ? "missing" : `${markerPoint.value.toFixed(1)} ${unit}`}`
            : `${count} days`}
        </span>
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`${label} for the loaded window, ${lo.toFixed(1)} to ${hi.toFixed(1)} ${unit}. ${flagged.filter(Boolean).length} anomalies. The table below lists every day.`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * W;
          const index = Math.round(((px - PLOT_LEFT) / (W - PLOT_LEFT - PLOT_RIGHT)) * (count - 1));
          setHover(index >= 0 && index < count ? index : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trace-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="grid" x1={PLOT_LEFT} x2={W - PLOT_RIGHT} y1={y(tick)} y2={y(tick)} />
            <text className="axis-text" x={PLOT_LEFT - 8} y={y(tick) + 4} textAnchor="end">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((index) =>
          points[index] ? (
            <text
              key={index}
              className="axis-text"
              x={x(index, count)}
              y={MAIN_TOP + MAIN_H + 20}
              textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
            >
              {formatDay(points[index].date)}
            </text>
          ) : null,
        )}
        <path className="area" d={areaPath} />
        {leadSegments.map((segment) => (
          <polyline key={segment} className="trace" points={segment} />
        ))}
        {points.map((point, index) =>
          point.value === null ? (
            <rect key={point.date} className="missing" x={x(index, count) - 1} y={MAIN_TOP + MAIN_H - 6} width={2} height={6} />
          ) : null,
        )}
        {points.map((point, index) =>
          flagged[index] && point.value !== null ? (
            <circle key={point.date} className="anomaly" cx={x(index, count)} cy={y(point.value)} r={5} />
          ) : null,
        )}

        {strips.map((strip, row) => {
          const top = stripTop + row * (stripH + stripGap);
          const [slo, shi] = range(strip.points);
          const sy = (value: number) => top + stripH - 3 - ((value - slo) / (shi - slo)) * (stripH - 6);
          return (
            <g key={strip.name}>
              <line className="strip-base" x1={PLOT_LEFT} x2={W - PLOT_RIGHT} y1={top + stripH} y2={top + stripH} />
              {segments(strip.points, sy).map((segment) => (
                <polyline key={segment} className={strip.lead ? "strip-trace lead" : "strip-trace"} points={segment} />
              ))}
              <text className="strip-name" x={PLOT_LEFT} y={top - 1}>
                {strip.name}
                <tspan className="strip-role" dx={10}>
                  {strip.unit} → {strip.role.toUpperCase()}
                </tspan>
              </text>
            </g>
          );
        })}

        {marker !== null && points[marker] && (
          <g>
            <line className="now-line" x1={x(marker, count)} x2={x(marker, count)} y1={MAIN_TOP - 6} y2={height} />
            {points[marker].value !== null && (
              <circle className="now-dot" cx={x(marker, count)} cy={y(points[marker].value as number)} r={6} />
            )}
          </g>
        )}
      </svg>
      <figcaption className="legend-inline">
        <span><i className="swatch" /> {label}, the lead: pitch</span>
        <span><i className="swatch ring" /> Robust anomaly</span>
        <span>Thin traces: the other POWER channels and what they do to the sound</span>
      </figcaption>
    </figure>
  );
}
