import type { ArchiveEntry } from "../../audio/archive.ts";

type Props = {
  entries: ArchiveEntry[];
  busy: string | null;
  onPlay: (entry: ArchiveEntry) => void;
  onPostcard: (entry: ArchiveEntry) => void;
  onRemove: (entry: ArchiveEntry) => void;
};

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Earth Sound Archive: soundscapes saved in this browser, with the POWER numbers they came from. */
export function ArchiveShelf({ entries, busy, onPlay, onPostcard, onRemove }: Props) {
  if (entries.length === 0) {
    return <p className="muted tiny">The archive is empty. Save a soundscape and it stays here, with its NASA POWER numbers, so it replays without a network.</p>;
  }
  return (
    <ul className="archive-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div className="archive-meta">
            <span className="archive-title">{entry.title}</span>
            <span className="mono muted tiny">
              {entry.config.mode === "scientific" ? "Scientific" : "Artistic"} · saved {when(entry.savedAt)}
            </span>
          </div>
          <button type="button" className="link-button" onClick={() => onPlay(entry)}>Load and play</button>
          <button type="button" className="link-button" disabled={busy === entry.id} onClick={() => onPostcard(entry)}>
            {busy === entry.id ? "Rendering…" : "WAV"}
          </button>
          <button type="button" className="link-button" aria-label={`Remove ${entry.title} from the archive`} onClick={() => onRemove(entry)}>Remove</button>
        </li>
      ))}
    </ul>
  );
}
