import { MAPPINGS } from "../../audio/mappings.ts";
import type { LayerTrace, SoundStep } from "../../audio/soundscape.ts";

function rawText(trace: LayerTrace): string {
  if (trace.raw === null) return "missing";
  const digits = trace.variable === "PS" ? 2 : 1;
  return `${trace.raw.toFixed(digits)} ${trace.unit}`;
}

function normText(trace: LayerTrace): string {
  if (trace.normalized === null) return "—";
  if (trace.layer === "anomaly" || trace.layer === "pulse") return `z ${trace.normalized.toFixed(2)}`;
  if (trace.variable === "PS" && trace.layer === "modulation") return `Δ ${trace.normalized >= 0 ? "+" : ""}${trace.normalized.toFixed(2)} kPa`;
  return trace.normalized.toFixed(3);
}

type Props = { step: SoundStep | null; dataset: string; heartbeat: boolean };

/** Where each sound of the current day came from: variable, raw value, normalized value, rule, result. */
export function TracePanel({ step, dataset, heartbeat }: Props) {
  if (!step) {
    return (
      <div className="trace-panel empty">
        <p className="muted tiny">Press play. Each day, this table shows the NASA POWER value behind every layer and the rule that turned it into sound.</p>
      </div>
    );
  }
  const traces = step.traces.filter((trace) => heartbeat || trace.layer !== "pulse");
  return (
    <div className="trace-panel">
      <p className="trace-title">
        <span className="label">Trace</span> <b className="mono">{step.label}</b>
        <span className="muted tiny"> {dataset}</span>
      </p>
      <div className="trace-scroll">
        <table className="trace-table">
          <caption className="sr-only">Source of every sound on {step.label}</caption>
          <thead>
            <tr>
              <th scope="col">Layer</th>
              <th scope="col">Variable</th>
              <th scope="col">Measured</th>
              <th scope="col">Normalized</th>
              <th scope="col">Heard as</th>
              <th scope="col">Rule</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((trace, index) => (
              <tr key={`${trace.layer}-${trace.variable}-${index}`} className={trace.raw === null ? "missing" : trace.layer === "anomaly" ? "flag" : undefined}>
                <th scope="row">{trace.layer}</th>
                <td><abbr title={MAPPINGS[trace.variable].name}>{trace.variable}</abbr></td>
                <td className="mono">{rawText(trace)}</td>
                <td className="mono">{normText(trace)}</td>
                <td>{trace.result}</td>
                <td className="rule">{trace.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
