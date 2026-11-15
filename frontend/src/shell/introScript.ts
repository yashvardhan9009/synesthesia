/**
 * The twenty-second introduction. Each scene is plain text plus one visual
 * idea; nothing in it is a measurement, and it says so.
 */
export type Scene = {
  id: string;
  ms: number;
  kicker: string;
  line: string;
  detail: string;
};

export const INTRO_SCENES: Scene[] = [
  {
    id: "listen",
    ms: 4000,
    kicker: "SYNESTHESIA",
    line: "Earth, heard.",
    detail: "Hear Earth, travel through environmental history, and discover global anomalies through sound.",
  },
  {
    id: "sources",
    ms: 4000,
    kicker: "The sources",
    line: "One planet, three ways to listen.",
    detail: "NASA Earth Information Center visualizations, NASA POWER records, and the GIBS Blue Marble.",
  },
  {
    id: "mapping",
    ms: 4500,
    kicker: "The mapping",
    line: "A higher value is a higher note.",
    detail: "Each series is scaled between its own 5th and 95th percentiles, then placed on a musical scale.",
  },
  {
    id: "anomaly",
    ms: 4000,
    kicker: "The outliers",
    line: "A day far from its neighbours rings out.",
    detail: "Robust z-score from the median and MAD. Missing days stay silent; nothing is filled in.",
  },
  {
    id: "trace",
    ms: 3500,
    kicker: "The trace",
    line: "Every note leads back to its number.",
    detail: "Open Trace in the dock at any time.",
  },
];

export const INTRO_MS = INTRO_SCENES.reduce((sum, scene) => sum + scene.ms, 0);

/** Which scene is showing at `elapsed` ms, and how far through it (0–1). Past the end: the last scene, complete. */
export function sceneAt(elapsed: number): { index: number; within: number; done: boolean } {
  let start = 0;
  for (let index = 0; index < INTRO_SCENES.length; index += 1) {
    const scene = INTRO_SCENES[index];
    if (elapsed < start + scene.ms) {
      return { index, within: Math.max(0, (elapsed - start) / scene.ms), done: false };
    }
    start += scene.ms;
  }
  return { index: INTRO_SCENES.length - 1, within: 1, done: true };
}

/** Elapsed time at the start of a scene, for Next / Back. */
export function sceneStart(index: number): number {
  return INTRO_SCENES.slice(0, Math.max(0, index)).reduce((sum, scene) => sum + scene.ms, 0);
}

const SEEN = "synesthesia.intro.seen";

/** Show on a first visit, unless the URL says otherwise or a test browser is driving. */
export function shouldShowIntro(search: string, storage: Pick<Storage, "getItem"> | null, automated: boolean): boolean {
  const params = new URLSearchParams(search);
  if (params.get("intro") === "1") return true;
  if (params.get("intro") === "0" || automated) return false;
  try {
    return storage?.getItem(SEEN) !== "1";
  } catch {
    return false;
  }
}

export function rememberIntroSeen(storage: Pick<Storage, "setItem"> | null): void {
  try {
    storage?.setItem(SEEN, "1");
  } catch {
    /* storage unavailable */
  }
}
