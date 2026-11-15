import { MODIFIER_LAYERS } from "../../audio/render.ts";
import { LAYERS, MAPPINGS, POWER_VARIABLES, type LayerId } from "../../audio/mappings.ts";
import type { LayerMix } from "../../audio/labConfig.ts";
import { fill } from "./fill.ts";

const LAYER_NAMES: Record<LayerId, string> = {
  pitch: "Pitch",
  rhythm: "Rhythm",
  intensity: "Intensity",
  texture: "Texture",
  modulation: "Modulation",
  density: "Density",
  anomaly: "Anomaly bells",
  pulse: "Heartbeat",
};

function sourceOf(layer: LayerId): string {
  if (layer === "anomaly") return "any variable, |z|";
  if (layer === "pulse") return "temperature |z|";
  const variable = POWER_VARIABLES.find((name) => MAPPINGS[name].layer === layer);
  return variable ? MAPPINGS[variable].name.toLowerCase() : "";
}

function panWords(pan: number): string {
  if (Math.abs(pan) < 0.05) return "C";
  return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
}

type Props = {
  layers: Record<LayerId, LayerMix>;
  /** The layer that sounded most recently, for the meter lamp. */
  active: ReadonlySet<LayerId>;
  onChange: (layers: Record<LayerId, LayerMix>) => void;
};

/** One strip per layer: on/off, level, stereo position. Allowed in both modes. */
export function LayerMixer({ layers, active, onChange }: Props) {
  const set = (layer: LayerId, patch: Partial<LayerMix>) => onChange({ ...layers, [layer]: { ...layers[layer], ...patch } });
  return (
    <div className="mixer" role="group" aria-label="Layer mixer">
      {LAYERS.map((layer) => {
        const mix = layers[layer];
        const modifier = MODIFIER_LAYERS.includes(layer);
        const name = LAYER_NAMES[layer];
        return (
          <div key={layer} className={`strip${mix.on ? "" : " off"}${active.has(layer) && mix.on ? " lit" : ""}`}>
            <div className="strip-head">
              <span className="strip-lamp" aria-hidden="true" />
              <span className="strip-name">{name}</span>
              <span className="strip-source">{sourceOf(layer)}</span>
            </div>
            <button type="button" className="chip strip-on" aria-pressed={mix.on} aria-label={`${name} layer ${mix.on ? "on" : "off"}`} onClick={() => set(layer, { on: !mix.on })}>
              {mix.on ? "On" : "Off"}
            </button>
            <label className="strip-control">
              <span className="label">{modifier ? "Depth" : "Level"}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={mix.level}
                style={fill(mix.level, 0, 1)}
                aria-label={`${name} ${modifier ? "depth" : "level"}`}
                aria-valuetext={`${Math.round(mix.level * 100)} percent`}
                onChange={(event) => set(layer, { level: Number(event.target.value) })}
              />
              <span className="mono strip-value">{Math.round(mix.level * 100)}</span>
            </label>
            {modifier ? (
              <p className="strip-note">Acts on the pitch voice</p>
            ) : (
              <label className="strip-control">
                <span className="label">Pan</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={mix.pan}
                  style={fill(mix.pan, -1, 1)}
                  aria-label={`${name} stereo position`}
                  aria-valuetext={panWords(mix.pan) === "C" ? "centre" : `${Math.round(Math.abs(mix.pan) * 100)} percent ${mix.pan < 0 ? "left" : "right"}`}
                  onChange={(event) => set(layer, { pan: Number(event.target.value) })}
                />
                <span className="mono strip-value">{panWords(mix.pan)}</span>
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
