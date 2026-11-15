import { Check, X } from "lucide-react";
import { isComplete, STEPS, type Progress } from "./onboarding.ts";

type Props = {
  progress: Progress;
  onDismiss: () => void;
  onReplayIntro: () => void;
  onOpenScience: () => void;
};

/** First steps, ticked as the visitor does them. Hidden once dismissed or complete. */
export function Onboarding({ progress, onDismiss, onReplayIntro, onOpenScience }: Props) {
  if (progress.dismissed || isComplete(progress)) return null;
  const count = progress.done.length;
  return (
    <aside className="onboarding" aria-labelledby="onboarding-title">
      <div className="onboarding-head">
        <h2 id="onboarding-title" className="label">
          First steps · {count} of {STEPS.length}
        </h2>
        <button className="dock-icon" onClick={onDismiss} aria-label="Hide first steps">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <ol className="onboarding-list">
        {STEPS.map((step) => {
          const done = progress.done.includes(step.id);
          return (
            <li key={step.id} className={done ? "done" : undefined}>
              <span className="onboarding-tick" aria-hidden="true">
                {done && <Check size={12} strokeWidth={2.5} />}
              </span>
              <span>
                {step.id === "science" ? (
                  <button className="link-button" onClick={onOpenScience}>
                    {step.label}
                  </button>
                ) : (
                  step.label
                )}
                <span className="sr-only">{done ? ", done" : ", not yet"}</span>
                <small>{step.hint}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <button className="link-button tiny" onClick={onReplayIntro}>
        Watch the 20-second introduction
      </button>
    </aside>
  );
}
