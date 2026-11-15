import { useRef, useState, type KeyboardEvent } from "react";
import type { Soundscape } from "../../audio/soundscape.ts";

type Props = {
  scape: Soundscape;
  current: number | null;
  onPick: (index: number) => void;
};

/**
 * One cell per day, height from temperature. Amber ring: an anomaly bell rings.
 * Hatched: temperature is missing. Pressing a day starts playback there.
 * One tab stop for the whole strip; arrow keys, Home and End move between days.
 */
export function DayStrip({ scape, current, onPick }: Props) {
  const [focus, setFocus] = useState(0);
  const list = useRef<HTMLOListElement>(null);
  const focusable = Math.min(current ?? focus, scape.steps.length - 1);
  const onKey = (event: KeyboardEvent<HTMLOListElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let next: number | null = null;
    if (event.key in moves) next = Math.min(scape.steps.length - 1, Math.max(0, focusable + moves[event.key]));
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = scape.steps.length - 1;
    if (next === null) return;
    event.preventDefault();
    setFocus(next);
    list.current?.querySelectorAll<HTMLButtonElement>("button.day")[next]?.focus();
  };
  const midis = scape.steps.map((step) => step.lead?.midi ?? null).filter((value): value is number => value !== null);
  const low = Math.min(...midis);
  const high = Math.max(...midis);
  return (
    <ol ref={list} className="day-strip" aria-label="Days in this window. Arrow keys move between days; Enter plays from the chosen day." onKeyDown={onKey}>
      {scape.steps.map((step, index) => {
        const height = step.lead ? 20 + (high > low ? ((step.lead.midi - low) / (high - low)) * 80 : 50) : 100;
        const words = [step.label, step.lead ? step.lead.name : "temperature missing", step.bells.length ? `${step.bells.length} anomaly bell${step.bells.length === 1 ? "" : "s"}` : "", step.hits ? `${step.hits} rain hits` : ""]
          .filter(Boolean)
          .join(", ");
        return (
          <li key={step.date}>
            <button
              type="button"
              className={`day${step.lead ? "" : " gap"}${step.bells.length ? " flag" : ""}`}
              aria-current={current === index ? "step" : undefined}
              tabIndex={index === focusable ? 0 : -1}
              onFocus={() => setFocus(index)}
              aria-label={words}
              title={words}
              onClick={() => onPick(index)}
            >
              <span className="day-bar" style={{ height: `${height}%` }} />
              {step.hits > 0 && <span className="day-rain" style={{ height: `${step.hits * 3}px` }} />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
