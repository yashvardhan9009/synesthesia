import { useState } from "react";
import { LAB_PRESETS, configDiff, type LabConfig, type SavedConfig } from "../../audio/labConfig.ts";

export type Slot = "A" | "B";

type Props = {
  config: LabConfig;
  saved: SavedConfig[];
  slots: Record<Slot, LabConfig | null>;
  playingSlot: Slot | null;
  canPlay: boolean;
  onApply: (config: LabConfig, label: string) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
  onReset: () => void;
  onStore: (slot: Slot) => void;
  onPlaySlot: (slot: Slot) => void;
};

const DIFF_WORDS: Record<string, string> = {
  mode: "mode",
  instrument: "instrument",
  scale: "scale",
  customSteps: "custom steps",
  tonic: "tonic",
  octave: "octave",
  span: "range",
  bpm: "tempo",
  sensitivity: "sensitivity",
  lowHz: "lowest pitch",
  highHz: "highest pitch",
  anomalyZ: "anomaly |z|",
  normalization: "normalization",
};

function diffWords(keys: string[]): string {
  return keys.map((key) => (key.startsWith("layers.") ? `${key.slice(7)} mix` : (DIFF_WORDS[key] ?? key))).join(", ");
}

/** Presets, saved configurations, reset, and the A/B comparison. */
export function ConfigShelf({ config, saved, slots, playingSlot, canPlay, onApply, onSave, onDelete, onReset, onStore, onPlaySlot }: Props) {
  const [name, setName] = useState("");
  const diff = slots.A && slots.B ? configDiff(slots.A, slots.B) : null;

  return (
    <div className="shelf">
      <section className="shelf-block" aria-labelledby="lab-presets">
        <h3 id="lab-presets" className="label">Presets</h3>
        <ul className="preset-list">
          {LAB_PRESETS.map((preset) => (
            <li key={preset.id}>
              <button type="button" className="preset" onClick={() => onApply(preset.config, preset.name)}>
                <span className="preset-name">{preset.name}</span>
                <span className="muted tiny">{preset.note}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-small" onClick={onReset}>
          Reset to Scientific reference
        </button>
      </section>

      <section className="shelf-block" aria-labelledby="lab-saved">
        <h3 id="lab-saved" className="label">Saved on this device</h3>
        <form
          className="save-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(name);
            setName("");
          }}
        >
          <label className="field">
            <span className="sr-only">Name for this configuration</span>
            <input value={name} maxLength={60} placeholder="Name this configuration" onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-ghost btn-small">Save</button>
        </form>
        {saved.length === 0 ? (
          <p className="muted tiny">Nothing saved yet. Configurations are kept in this browser only.</p>
        ) : (
          <ul className="saved-list">
            {saved.map((item) => (
              <li key={item.name}>
                <span className="saved-name">{item.name}</span>
                <span className="mono muted tiny">{item.config.mode === "scientific" ? "Scientific" : "Artistic"}</span>
                <button type="button" className="link-button" onClick={() => onApply(item.config, item.name)}>Load</button>
                <button type="button" className="link-button" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item.name)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="shelf-block" aria-labelledby="lab-ab">
        <h3 id="lab-ab" className="label">A/B comparison</h3>
        <p className="muted tiny">Store the current settings in A, change something, store in B, then hear both on the same NASA data.</p>
        <div className="ab-grid">
          {(["A", "B"] as const).map((slot) => (
            <div key={slot} className="ab-slot">
              <span className="ab-letter" aria-hidden="true">{slot}</span>
              <span className="tiny">{slots[slot] ? (slots[slot]!.mode === "scientific" ? "Scientific" : `Artistic, ${slots[slot]!.instrument}, ${slots[slot]!.scale}`) : "Empty"}</span>
              <button type="button" className="link-button" onClick={() => onStore(slot)}>Store current in {slot}</button>
              <button type="button" className="chip" aria-pressed={playingSlot === slot} disabled={!slots[slot] || !canPlay} onClick={() => onPlaySlot(slot)}>
                {playingSlot === slot ? `Stop ${slot}` : `Play ${slot}`}
              </button>
              {slots[slot] && (
                <button type="button" className="link-button" onClick={() => onApply(slots[slot]!, `slot ${slot}`)}>Edit {slot}</button>
              )}
            </div>
          ))}
        </div>
        {diff && (
          <p className="tiny" aria-live="polite">
            {diff.length === 0 ? "A and B are identical." : `A and B differ in: ${diffWords(diff)}.`}
          </p>
        )}
        {config.mode === "scientific" && slots.A && slots.B && configDiff(slots.A, slots.B).every((key) => key.startsWith("layers.")) && (
          <p className="muted tiny">Both are Scientific, so only the mix can differ.</p>
        )}
      </section>
    </div>
  );
}
