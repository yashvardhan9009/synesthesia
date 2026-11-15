/** First-visit checklist. Each step is ticked by doing it, not by reading about it. */
export const STEPS = [
  { id: "touch", label: "Press and drag across the planet", hint: "Or focus it and use the arrow keys." },
  { id: "play", label: "Hear a NASA Earth soundscape", hint: "Listen, Hear Earth, or the environmental timeline." },
  { id: "trace", label: "Trace a note to its measurement", hint: "Trace in the dock, or press T." },
  { id: "science", label: "Read how the sound is made", hint: "Science & Methodology." },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
export type Progress = { done: StepId[]; dismissed: boolean };

const KEY = "synesthesia.onboarding";
export const EMPTY: Progress = { done: [], dismissed: false };

const IDS = new Set<string>(STEPS.map((step) => step.id));

export function loadProgress(storage: Pick<Storage, "getItem"> | null): Progress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const done = Array.isArray(parsed.done) ? parsed.done.filter((id): id is StepId => typeof id === "string" && IDS.has(id)) : [];
    return { done: [...new Set(done)], dismissed: parsed.dismissed === true };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(storage: Pick<Storage, "setItem"> | null, progress: Progress): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable */
  }
}

export function markStep(progress: Progress, id: StepId): Progress {
  return progress.done.includes(id) ? progress : { ...progress, done: [...progress.done, id] };
}

export function isComplete(progress: Progress): boolean {
  return STEPS.every((step) => progress.done.includes(step.id));
}
