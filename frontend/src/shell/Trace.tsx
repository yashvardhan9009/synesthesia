import { ArrowUpRight } from "lucide-react";
import { noteLabel } from "../science/score.ts";
import { traceSentence, type TraceRecord } from "../audio/trace.ts";

type Props = {
  trace: TraceRecord | null;
  /** Shown when nothing is sounding yet. */
  empty?: string;
  compact?: boolean;
};

/**
 * Where the current sound came from, top to bottom: the NASA source, the
 * measured value, how it was scaled, the anomaly test, the note. What the
 * instrument added (and which carries no data) is listed apart from it.
 */
export function Trace({ trace, empty = "Play or drag to trace a note back to its measurement.", compact = false }: Props) {
  if (!trace) {
    return (
      <div className="trace trace-empty">
        <p className="label">Trace</p>
        <p className="muted tiny">{empty}</p>
      </div>
    );
  }
  const note = noteLabel(trace.frequency);
  return (
    <figure className={compact ? "trace trace-compact" : "trace"} aria-label="Trace of the current note">
      <figcaption className="trace-head">
        <span className="label">Trace</span>
        <span className="sr-only">{traceSentence(trace)}</span>
      </figcaption>
      <ol className="trace-chain" aria-hidden="true">
        <li>
          <span className="trace-kind label">Source</span>
          <span className="trace-value">
            {trace.sourceUrl ? (
              <a className="trace-source" href={trace.sourceUrl} target="_blank" rel="noreferrer">
                {trace.source} <ArrowUpRight size={12} aria-hidden="true" className="inline-icon" />
              </a>
            ) : (
              trace.source
            )}
            <small>{trace.where}</small>
          </span>
        </li>
        <li>
          <span className="trace-kind label">Measured</span>
          <span className="trace-value">
            {trace.measured.length ? (
              trace.measured.map((item) => (
                <span key={item.name} className="trace-measure">
                  {item.name} <b>{item.value}</b>
                  {item.unit && <small> {item.unit}</small>}
                  {item.heard && <small className="trace-heard"> → {item.heard}</small>}
                </span>
              ))
            ) : (
              <span className="muted">Described in the caption for this section.</span>
            )}
          </span>
        </li>
        {trace.normalized !== null && (
          <li>
            <span className="trace-kind label">Scaled</span>
            <span className="trace-value">
              <b>{trace.normalized.toFixed(3)}</b>
              {trace.window && (
                <small>
                  0–1 between p5 {trace.window.low.toFixed(3)} and p95 {trace.window.high.toFixed(3)}
                </small>
              )}
            </span>
          </li>
        )}
        {trace.z !== null && (
          <li>
            <span className="trace-kind label">Anomaly</span>
            <span className={trace.outlier ? "trace-value hot" : "trace-value"}>
              <b>z {trace.z.toFixed(2)}</b>
              <small>
                {trace.outlier ? "outlier" : "within range"} at |z| ≥ {trace.threshold}
              </small>
            </span>
          </li>
        )}
        <li>
          <span className="trace-kind label">Heard</span>
          <span className="trace-value">
            <b>{note?.note ?? "—"}</b>
            <small>{note?.hz}</small>
          </span>
        </li>
      </ol>
      {!compact && (
        <p className="trace-generated tiny">
          <span className="label">Generated, not measured</span> {trace.generated.join(" · ")}
        </p>
      )}
    </figure>
  );
}
