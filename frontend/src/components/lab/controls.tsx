import type { ReactNode } from "react";
import { fill } from "./fill.ts";

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Readout text; defaults to the value. */
  display?: ReactNode;
  /** Spoken value for screen readers when the readout is not plain. */
  valueText?: string;
  ticks?: string[];
  disabled?: boolean;
  onChange: (value: number) => void;
};

/** A labelled range input in the house style. */
export function Slider({ label, value, min, max, step = 1, display, valueText, ticks, disabled, onChange }: SliderProps) {
  return (
    <label className="field">
      <span className="field-row">
        <span className="label">{label}</span>
        <span className="value-readout">{display ?? value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        style={fill(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {ticks && (
        <span className="ticks" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </span>
      )}
    </label>
  );
}

type ChoiceProps<T extends string> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
};

export function Choice<T extends string>({ label, value, options, disabled, onChange }: ChoiceProps<T>) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A row of pressable chips acting as a single choice. */
export function Segmented<T extends string>({ label, value, options, onChange }: Omit<ChoiceProps<T>, "disabled">) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="chip" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
