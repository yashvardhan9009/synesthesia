import { BACKGROUND_LABEL, backgroundFor, EXPLAIN_WORDS, type Departure } from "./anomaly.ts";

export type AnomalyNote = { id: string; when: string; text: string; departure: Departure };

/**
 * What was unusual, in words computed from the data, each with a separate,
 * labelled general-background note. The background is never phrased as the
 * cause of the day it sits under.
 */
export function AnomalyNotes({ heading, notes, empty, basis }: { heading: string; notes: AnomalyNote[]; empty: string; basis: string }) {
  return (
    <section className="anomaly-notes" aria-label={heading}>
      <h3 className="label">{heading}</h3>
      <p className="muted tiny">{basis}</p>
      {notes.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ol className="anomaly-list">
          {notes.map((note) => (
            <li key={note.id} data-level={note.departure.level}>
              <p className="anomaly-head">
                <span className={note.departure.direction === "above" ? "anomaly-tag warm" : "anomaly-tag cool"}>
                  {EXPLAIN_WORDS[note.departure.parameter].name} · {note.departure.level}
                </span>
                <span className="mono tiny">{note.when}</span>
              </p>
              <p>{note.text}</p>
              <details className="background-note">
                <summary>General background (not an attribution)</summary>
                <p>
                  <span className="label">{BACKGROUND_LABEL}.</span> {backgroundFor(note.departure)}
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
