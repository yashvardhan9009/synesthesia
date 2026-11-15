import { mkdirSync, writeFileSync } from "node:fs";
import { fetchBaseline, fetchPower } from "../src/api.ts";
import { buildSoundscape } from "../src/audio/soundscape.ts";
import { DEFAULT_CONFIG } from "../src/audio/labConfig.ts";
import { classify, scoreClip, makeTrials, seededRandom, scoreResponses } from "../src/validation/study.ts";
import { CANDIDATES } from "../src/validation/stimuli.ts";

const api = `http://127.0.0.1:${process.env.SYN_API_PORT ?? "8741"}`;
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => nativeFetch(new URL(input, api), init);
const random = seededRandom(20261115);
const normalNoise = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
const feature = (clip, baseline) => {
  const actual = buildSoundscape(clip.series, DEFAULT_CONFIG, clip.place);
  const expectedSeries = {
    ...clip.series,
    parameters: {
      ...clip.series.parameters,
      T2M: clip.series.dates.map((date) => ({ date, value: baseline.days.T2M?.[date.slice(4, 8)]?.p50 ?? null })),
    },
  };
  const expected = buildSoundscape(expectedSeries, DEFAULT_CONFIG, `${clip.place} calendar normal`);
  const deltas = actual.steps.map((step, index) => {
    const observedMidi = step.lead?.midi;
    const normalMidi = expected.steps[index]?.lead?.midi;
    return observedMidi == null || normalMidi == null ? null : observedMidi - normalMidi;
  });
  const evidence = [];
  for (let index = 0; index <= deltas.length - 5; index += 1) {
    const window = deltas.slice(index, index + 5);
    if (window.every((value) => value !== null)) {
      const noisy = window.reduce((sum, value) => sum + Math.abs(value + normalNoise() * 0.45), 0) / window.length;
      evidence.push(noisy);
    }
  }
  return evidence.length ? Math.max(...evidence) : 0;
};

const candidates = await Promise.all(CANDIDATES.map(async (candidate) => {
  const baseline = await fetchBaseline(candidate.latitude, candidate.longitude, undefined, "T2M");
  const series = await fetchPower({ lat: candidate.latitude, lon: candidate.longitude, start: candidate.start, end: candidate.end, parameters: "T2M,PRECTOTCORR,WS2M,RH2M,PS,CLOUD_AMT" });
  return { candidate, baseline, clip: scoreClip(candidate, series, baseline) };
}));
const unusual = candidates.filter((item) => classify(item.clip) === "unusual");
const normal = candidates.filter((item) => classify(item.clip) === "normal");
const places = new Set(candidates.map((item) => item.candidate.place)).size;
const years = candidates.map((item) => Number(item.candidate.start.slice(0, 4)));
if (!unusual.length || !normal.length) throw new Error(`Insufficient qualifying real clips: ${unusual.length} unusual, ${normal.length} normal.`);
const features = new Map(candidates.map((item) => [item.clip.id, feature(item.clip, item.baseline)]));
const trials = makeTrials(unusual.map((item) => item.clip), normal.map((item) => item.clip), 381729, 0, 500);
const responses = trials.map((trial) => {
  const a = features.get(trial.clips[0].id) ?? 0;
  const b = features.get(trial.clips[1].id) ?? 0;
  const response = a === b ? (random() < 0.5 ? 0 : 1) : a > b ? 0 : 1;
  return { trialId: trial.id, response, rtMs: 1, confidence: 2, correct: response === trial.correct ? 1 : 0 };
});
const score = scoreResponses(trials, responses);
const report = {
  title: "Simulation, not human data",
  generatedAt: new Date().toISOString(),
  dataSource: "NASA POWER daily through the local cached API proxy",
  trials: trials.length,
  qualifyingStimuli: { unusual: unusual.length, normal: normal.length, candidates: candidates.length, places, years: `${Math.min(...years)}–${Math.max(...years)}` },
  mapping: "Scientific Mode buildSoundscape pitch sequence compared with a second sequence built from same-calendar-day POWER baseline medians.",
  observer: "Maximum five-day mean absolute pitch deviation; independent zero-mean Gaussian noise with 0.45 semitone standard deviation added per day; larger evidence chooses the unusual clip.",
  metrics: { accuracy: score.accuracy, hitRate: score.hitRate, falseAlarmRate: score.falseAlarmRate, dPrime: score.dPrime },
  stimulusFeatures: candidates.map(({ candidate, clip }) => ({ id: candidate.id, place: candidate.place, start: candidate.start, end: candidate.end, classification: classify(clip) === "between" ? "not selected" : classify(clip), maxAbsFiveDayRobustZ: clip.maxAbsZ, pitchEvidence: features.get(clip.id) ?? null })),
};
mkdirSync(new URL("../../docs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../docs/simulated-observer.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(new URL("../../docs/simulated-observer.md", import.meta.url), `# Simulation, not human data\n\nGenerated ${report.generatedAt}. This is a software sanity check on real NASA POWER inputs, not a participant study or evidence about human perception.\n\n- Trials simulated: ${report.trials}\n- Qualifying NASA POWER stimuli: ${unusual.length} unusual, ${normal.length} normal, of ${candidates.length} curated windows at ${places} places (${report.qualifyingStimuli.years})\n- Algorithm: ${report.observer}\n- Mapping: ${report.mapping}\n- Pair accuracy: ${(score.accuracy * 100).toFixed(1)}%\n- Hit rate: ${(score.hitRate * 100).toFixed(1)}%\n- False-alarm rate: ${(score.falseAlarmRate * 100).toFixed(1)}%\n- d′: ${score.dPrime.toFixed(3)}\n\nThese values describe only the algorithm and chosen noise level. They are not human study results. The raw stimulus classifications and features are in [simulated-observer.json](simulated-observer.json).\n`);
console.log(JSON.stringify(report, null, 2));
