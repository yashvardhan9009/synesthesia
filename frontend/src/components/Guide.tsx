import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { explainProblem } from "../shell/problem.ts";

/**
 * Waiting on NASA. A scan line, not a spinner; after a few seconds the label
 * says why it is slow and how long it has been.
 */
export function Wait({ active, label, slow }: { active: boolean; label: string; slow: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!active) return null;
  const late = seconds >= 3;
  return (
    <p className="wait" role="status">
      <span>{late ? slow : label}</span>
      {late && <span className="wait-time label" aria-hidden="true">{seconds}s</span>}
    </p>
  );
}

/** A failure, said plainly: what happened, what to do, and the service's own words. */
export function Problem({ message, source, onRetry, retryLabel = "Try again" }: { message: string; source?: string; onRetry?: () => void; retryLabel?: string }) {
  const explained = explainProblem(message, source);
  return (
    <div className="problem" role="alert" data-kind={explained.kind}>
      <p className="problem-title">{explained.title}</p>
      <p className="problem-advice">{explained.advice}</p>
      <p className="problem-raw mono">{message}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-small" onClick={onRetry}>
          <RotateCcw size={14} aria-hidden="true" strokeWidth={1.75} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function SoundMap({ rows }: { rows: { from: string; hears: string }[] }) {
  return (
    <table className="map">
      <caption className="label">How this sound is made</caption>
      <thead>
        <tr>
          <th>Measurement</th>
          <th>Heard as</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.from}>
            <td>{row.from}</td>
            <td>{row.hears}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
