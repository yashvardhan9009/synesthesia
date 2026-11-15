import { ANOMALY_MAPPING, MAPPINGS, MISSING_DATA_RULE, POWER_VARIABLES, PULSE_MAPPING } from "../../audio/mappings.ts";
import "./lab.css";

/**
 * Every mapping with its plain and scientific explanation, straight from
 * audio/mappings.ts. Reusable by the Science page.
 */
export function MappingTable({ showRules = true }: { showRules?: boolean }) {
  return (
    <dl className="mapping-table">
      {POWER_VARIABLES.map((variable) => {
        const mapping = MAPPINGS[variable];
        return (
          <div key={variable} className="mapping-row">
            <dt>
              <span className="mono mapping-id">{variable}</span>
              <span className="mapping-name">{mapping.name}</span>
              <span className="mapping-sound">{mapping.sound}</span>
            </dt>
            <dd>
              <p>{mapping.plain}</p>
              <p className="muted tiny">{mapping.science}</p>
              {showRules && <p className="mono rule tiny">{mapping.rule}</p>}
            </dd>
          </div>
        );
      })}
      {[
        { id: "|z|", name: "Anomalies", entry: ANOMALY_MAPPING },
        { id: "pulse", name: "Earth Heartbeat", entry: PULSE_MAPPING },
      ].map(({ id, name, entry }) => (
        <div key={name} className="mapping-row">
          <dt>
            <span className="mono mapping-id" aria-hidden="true">{id}</span>
            <span className="mapping-name">{name}</span>
            <span className="mapping-sound">{entry.sound}</span>
          </dt>
          <dd>
            <p>{entry.plain}</p>
            <p className="muted tiny">{entry.science}</p>
            {showRules && <p className="mono rule tiny">{entry.rule}</p>}
          </dd>
        </div>
      ))}
      <div className="mapping-row">
        <dt>
          <span className="mono mapping-id">−999</span>
          <span className="mapping-name">Missing data</span>
        </dt>
        <dd>
          <p>{MISSING_DATA_RULE}</p>
        </dd>
      </div>
    </dl>
  );
}
