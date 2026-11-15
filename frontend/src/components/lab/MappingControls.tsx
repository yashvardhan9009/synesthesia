import { midiName } from "../../science/score.ts";
import {
  INSTRUMENTS,
  SCALE_LABELS,
  normalizeSteps,
  type InstrumentId,
  type LabConfig,
  type LabScaleName,
  type Normalization,
} from "../../audio/labConfig.ts";
import { Choice, Slider } from "./controls.tsx";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const TONICS = Array.from({ length: 12 }, (_, index) => 48 + index);
const INSTRUMENT_OPTIONS = (Object.keys(INSTRUMENTS) as InstrumentId[]).map((id) => ({ value: id, label: INSTRUMENTS[id].name }));
const SCALE_OPTIONS = (Object.keys(SCALE_LABELS) as LabScaleName[]).map((id) => ({ value: id, label: SCALE_LABELS[id] }));
const NORMALIZATION_OPTIONS: { value: Normalization; label: string }[] = [
  { value: "fixed", label: "Fixed physical ranges" },
  { value: "window", label: "Stretched to this window" },
];

type Props = {
  /** The effective config: locked values when Scientific. */
  config: LabConfig;
  locked: boolean;
  onChange: (patch: Partial<LabConfig>) => void;
};

/** Every mapping parameter. Disabled as a group in Scientific Mode. */
export function MappingControls({ config, locked, onChange }: Props) {
  const toggleStep = (step: number) => {
    const has = config.customSteps.includes(step);
    onChange({ customSteps: normalizeSteps(has ? config.customSteps.filter((item) => item !== step) : [...config.customSteps, step]) });
  };
  const root = config.tonic + config.octave * 12;

  return (
    <fieldset className="rack lab-rack" disabled={locked} aria-describedby={locked ? "lab-lock-note" : undefined}>
      <legend className="sr-only">Mapping parameters{locked ? ", locked by Scientific Mode" : ""}</legend>
      <div className="module">
        <div className="module-head"><span className="label">Voice</span><span className="num">A</span></div>
        <Choice label="Instrument" value={config.instrument} options={INSTRUMENT_OPTIONS} onChange={(instrument) => onChange({ instrument })} />
        <Choice label="Scale" value={config.scale} options={SCALE_OPTIONS} onChange={(scale) => onChange({ scale })} />
        {config.scale === "custom" && (
          <div className="field">
            <span className="label">Custom scale steps</span>
            <div className="step-grid" role="group" aria-label="Notes in the custom scale, relative to the tonic">
              {NOTE_NAMES.map((_, step) => {
                const name = NOTE_NAMES[(((root % 12) + step) % 12 + 12) % 12];
                return (
                  <button
                    key={step}
                    type="button"
                    className="step-cell"
                    aria-pressed={config.customSteps.includes(step)}
                    disabled={step === 0}
                    aria-label={step === 0 ? `${name}, the tonic, always in the scale` : `${name}, ${step} semitones above the tonic`}
                    onClick={() => toggleStep(step)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="module">
        <div className="module-head"><span className="label">Register</span><span className="num">B</span></div>
        <Choice
          label="Tonic"
          value={String(config.tonic)}
          options={TONICS.map((midi) => ({ value: String(midi), label: NOTE_NAMES[midi % 12] }))}
          onChange={(value) => onChange({ tonic: Number(value) })}
        />
        <Slider label="Octave" value={config.octave} min={-2} max={2} display={`${midiName(root)}`} valueText={`Lowest note ${midiName(root)}`} ticks={["−2", "0", "+2"]} onChange={(octave) => onChange({ octave })} />
        <Slider label="Range" value={config.span} min={1} max={4} display={`${config.span} oct`} valueText={`${config.span} octaves`} ticks={["1", "4"]} onChange={(span) => onChange({ span })} />
      </div>

      <div className="module">
        <div className="module-head"><span className="label">Band and clock</span><span className="num">C</span></div>
        <Slider label="Lowest pitch" value={config.lowHz} min={40} max={1000} step={10} display={<>{config.lowHz} <small className="label">Hz</small></>} valueText={`${config.lowHz} hertz`} onChange={(lowHz) => onChange({ lowHz: Math.min(lowHz, config.highHz - 50) })} />
        <Slider label="Highest pitch" value={config.highHz} min={200} max={4000} step={10} display={<>{config.highHz} <small className="label">Hz</small></>} valueText={`${config.highHz} hertz`} onChange={(highHz) => onChange({ highHz: Math.max(highHz, config.lowHz + 50) })} />
        <Slider label="Tempo" value={config.bpm} min={40} max={200} display={<>{config.bpm} <small className="label">bpm</small></>} valueText={`${config.bpm} beats per minute, one day per beat`} onChange={(bpm) => onChange({ bpm })} />
      </div>

      <div className="module">
        <div className="module-head"><span className="label">Response</span><span className="num">D</span></div>
        <Choice label="Normalization" value={config.normalization} options={NORMALIZATION_OPTIONS} onChange={(normalization) => onChange({ normalization })} />
        <Slider label="Sensitivity" value={Math.log2(config.sensitivity)} min={-2} max={2} step={0.25} display={`×${config.sensitivity.toFixed(2)}`} valueText={`Sensitivity ${config.sensitivity.toFixed(2)}`} ticks={["¼", "1", "4"]} onChange={(value) => onChange({ sensitivity: 2 ** value })} />
        <Slider label="Anomaly |z|" value={config.anomalyZ} min={1} max={5} step={0.1} display={config.anomalyZ.toFixed(1)} ticks={["1", "3", "5"]} onChange={(anomalyZ) => onChange({ anomalyZ })} />
      </div>
    </fieldset>
  );
}
