import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Play, RotateCcw } from "lucide-react";
import { fetchBaseline, fetchPower, type PowerBaseline } from "../api.ts";
import type { SonificationEngine } from "../audio/engine.ts";
import { buildSoundscape } from "../audio/soundscape.ts";
import { DEFAULT_CONFIG } from "../audio/labConfig.ts";
import { Problem, Wait } from "../components/Guide.tsx";
import { useEngineState } from "../ui/audioBus.ts";
import { earOnly } from "./earOnly.ts";
import {
  NORMAL_MAX_Z,
  PRACTICE_TRIALS,
  TEST_TRIALS,
  UNUSUAL_MIN_Z,
  classify,
  exportCsv,
  exportJson,
  makeTrials,
  scoreClip,
  scoreResponses,
  seedFor,
  type StudyClip,
  type Trial,
  type TrialResponse,
} from "./study.ts";
import { CANDIDATES } from "./stimuli.ts";

type Props = { engine: SonificationEngine; onCaption: (caption: string) => void };
const SOURCE = "test";
const TEST_KEY = "synesthesia.listening-test.v1";
const STIMULUS_PARAMETERS = "T2M,PRECTOTCORR,WS2M,RH2M,PS,CLOUD_AMT";
type Pool = { unusual: number; normal: number; between: number; failed: number; places: number };

/** Run loaders a few at a time so a cold cache does not flood NASA POWER. */
async function limited<T>(tasks: (() => Promise<T>)[], width: number, onDone: () => void): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < tasks.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
      onDone();
    }
  }));
  return results;
}

/**
 * The Listening Test: a two-alternative forced choice between two real NASA
 * POWER 30-day soundscapes, by ear only. Nothing about a clip (place, dates,
 * values, notes, traces) is shown or announced until the session ends; the
 * answer key is computed from the fetched data with the protocol's cutoffs.
 */
export function ListeningTest({ engine, onCaption }: Props) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [responses, setResponses] = useState<TrialResponse[]>([]);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<number[]>([]);
  const [lastClip, setLastClip] = useState<0 | 1 | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);
  const [participant, setParticipant] = useState("");
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [pool, setPool] = useState<Pool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const endedAt = useRef(0);
  const trialHeading = useRef<HTMLHeadingElement>(null);
  const playback = useEngineState(engine);
  const trial = trials[index];
  const answered = !!trial && responses.some((item) => item.trialId === trial.id);
  const done = trials.length > 0 && responses.filter((item) => trials.some((t) => t.id === item.trialId)).length === trials.length;
  const testTrials = useMemo(() => trials.filter((item) => !item.practice), [trials]);
  const score = useMemo(() => scoreResponses(testTrials, responses), [testTrials, responses]);
  const inTrial = !!trial && !done;
  const playingClip = playback.source === SOURCE && playback.playing ? lastClip : null;

  // While a trial runs, the dock shows no note names, traces or scopes.
  useEffect(() => {
    document.documentElement.classList.toggle("ear-only", inTrial);
    return () => document.documentElement.classList.remove("ear-only");
  }, [inTrial]);
  useEffect(() => () => engine.stop(SOURCE), [engine]);
  useEffect(() => {
    if (trials.length) trialHeading.current?.focus();
  }, [index, trials.length, done]);

  const prepare = async () => {
    setLoading(true);
    setError(null);
    setLoaded(0);
    try {
      const baselines = new Map<string, Promise<PowerBaseline>>();
      const baselineFor = (lat: number, lon: number) => {
        const key = `${lat},${lon}`;
        if (!baselines.has(key)) baselines.set(key, fetchBaseline(lat, lon, undefined, "T2M"));
        return baselines.get(key) as Promise<PowerBaseline>;
      };
      const settled = await limited(
        CANDIDATES.map((window) => async () => {
          const [baseline, series] = await Promise.all([
            baselineFor(window.latitude, window.longitude),
            fetchPower({ lat: window.latitude, lon: window.longitude, start: window.start, end: window.end, parameters: STIMULUS_PARAMETERS }),
          ]);
          return scoreClip(window, series, baseline);
        }),
        6,
        () => setLoaded((count) => count + 1),
      );
      const clips = settled.filter((item): item is PromiseFulfilledResult<StudyClip> => item.status === "fulfilled").map((item) => item.value);
      const unusual = clips.filter((clip) => classify(clip) === "unusual");
      const normal = clips.filter((clip) => classify(clip) === "normal");
      setPool({ unusual: unusual.length, normal: normal.length, between: clips.length - unusual.length - normal.length, failed: settled.length - clips.length, places: new Set(clips.map((clip) => clip.place)).size });
      const seed = seedFor(`${participant.trim() || "anonymous"}:${CANDIDATES.map((item) => item.id).join("|")}`);
      const built = makeTrials(unusual, normal, seed);
      if (built.length === 0) throw new Error(`NASA POWER returned ${unusual.length} unusual and ${normal.length} normal clips from the curated set; a session needs at least one of each.`);
      setTrials(built);
      setResponses([]);
      setIndex(0);
      setHeard([]);
      setLastClip(null);
      setConfidence(null);
      setFeedback(null);
      try {
        localStorage.setItem(TEST_KEY, JSON.stringify({ participant: participant.trim(), consent: true, seed, startedAt: new Date().toISOString(), responses: [] }));
      } catch {
        /* storage may be disabled */
      }
      onCaption("Listening Test ready. Practice 1: play both clips, then choose the unusual one.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "NASA POWER could not prepare the listening trials.");
    } finally {
      setLoading(false);
    }
  };

  const playClip = async (clipIndex: 0 | 1) => {
    if (!trial || answered) return;
    const clip = trial.clips[clipIndex];
    setLastClip(clipIndex);
    onCaption(`Clip ${clipIndex + 1} playing.`);
    const scape = earOnly(buildSoundscape(clip.series, DEFAULT_CONFIG, "Listening Test clip"), `Clip ${clipIndex + 1}`);
    try {
      await engine.playSoundscape(scape, {
        source: SOURCE,
        title: scape.title,
        onEnded: () => {
          setHeard((current) => (current.includes(clipIndex) ? current : [...current, clipIndex]));
          endedAt.current = performance.now();
          onCaption(`Clip ${clipIndex + 1} ended. Play the other clip, or answer with 1 or 2.`);
        },
      });
    } catch (caught) {
      onCaption(caught instanceof Error ? caught.message : "Audio could not start.");
    }
  };

  const advance = () => {
    engine.stop(SOURCE);
    setIndex((value) => value + 1);
    setHeard([]);
    setLastClip(null);
    setConfidence(null);
    setFeedback(null);
  };

  const answer = (choice: 0 | 1) => {
    if (!trial || heard.length < 2 || answered) return;
    engine.stop(SOURCE);
    const response: TrialResponse = { trialId: trial.id, response: choice, rtMs: Math.max(0, Math.round(performance.now() - endedAt.current)), confidence: confidence ?? 2, correct: choice === trial.correct ? 1 : 0 };
    const updated = [...responses, response];
    setResponses(updated);
    try {
      const saved = JSON.parse(localStorage.getItem(TEST_KEY) ?? "{}");
      localStorage.setItem(TEST_KEY, JSON.stringify({ ...saved, responses: updated }));
    } catch {
      /* storage may be disabled */
    }
    if (trial.practice) {
      setFeedback(response.correct ? `Correct: clip ${trial.correct + 1} was the unusual one.` : `Not this time: clip ${trial.correct + 1} was the unusual one.`);
      return;
    }
    if (index + 1 < trials.length) {
      advance();
      onCaption(`Answer saved. Trial ${index + 2 - PRACTICE_TRIALS} of ${testTrials.length}.`);
    } else onCaption("Session complete. Your summary is below.");
  };

  useEffect(() => {
    if (!inTrial) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      const key = event.key.toLowerCase();
      if (key === "r" && lastClip !== null && !answered) {
        event.preventDefault();
        void playClip(lastClip);
      } else if ((key === "a" || key === "b") && !answered) {
        event.preventDefault();
        void playClip(key === "a" ? 0 : 1);
      } else if ((key === "1" || key === "2") && heard.length >= 2) {
        event.preventDefault();
        answer(key === "1" ? 0 : 1);
      } else if (key === "enter" && feedback && answered) {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const download = (kind: "csv" | "json") => {
    const body = kind === "csv" ? exportCsv(trials, responses) : exportJson(trials, responses);
    const url = URL.createObjectURL(new Blob([body], { type: kind === "csv" ? "text/csv" : "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `listening-test-${kind}.${kind}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const trialLabel = trial ? (trial.practice ? `Practice ${index + 1} of ${PRACTICE_TRIALS}` : `Trial ${index + 1 - PRACTICE_TRIALS} of ${testTrials.length}`) : "";

  return (
    <section className="deck validation-page" aria-labelledby="test-title">
      <header>
        <p className="meta-row">
          <span><span className="label">Perception study</span><b>NASA POWER daily, 30-day clips</b></span>
          <span><span className="label">Task</span><b>Two clips · which is unusual · ear only</b></span>
          <span><span className="label">Session</span><b>{PRACTICE_TRIALS} practice + {TEST_TRIALS} test pairs</b></span>
        </p>
        <h1 className="deck-title" id="test-title">Listening Test</h1>
        <p className="reading">
          Can you hear which of two real NASA POWER soundscapes contains an unusual temperature event? Each pair has one clip
          with a five-day stretch at least {UNUSUAL_MIN_Z} robust standard deviations from its 2001–2020 normal and one that
          stays within {NORMAL_MAX_Z}. During a trial nothing about the clips is shown: no place, date, chart, value or note name.
        </p>
      </header>

      {!trials.length && (
        <div className="validation-consent">
          <ul className="test-facts">
            <li><b>{CANDIDATES.length}</b> curated 30-day windows</li>
            <li><b>{new Set(CANDIDATES.map((item) => item.place)).size}</b> places on six continents</li>
            <li><b>2001–{CANDIDATES.reduce((max, item) => Math.max(max, Number(item.start.slice(0, 4))), 2001)}</b> years sampled</li>
            <li><b>About 6 min</b> with headphones</li>
          </ul>
          <label className="field">
            <span className="label">Participant code (optional, no names)</span>
            <input value={participant} onChange={(event) => setParticipant(event.target.value.slice(0, 40))} autoComplete="off" />
          </label>
          <label className="consent-line">
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
            I am 18 or older, understand this is an optional research activity, and agree to save my answers in this browser. Do not enter your name or contact details.
          </label>
          <div className="consent-actions">
            <button className="btn btn-primary" disabled={!consented || loading} onClick={() => void prepare()}>
              <Play size={16} aria-hidden="true" /> Load the clips and start
            </button>
            <span className="tiny muted">Keys in a trial: <kbd>A</kbd> <kbd>B</kbd> play clip 1 or 2 · <kbd>R</kbd> replay · <kbd>1</kbd> <kbd>2</kbd> answer · <kbd>Enter</kbd> continue</span>
          </div>
        </div>
      )}
      {loading && (
        <div className="listen-progress">
          <Wait active label="Loading the curated NASA POWER clips and their 2001–2020 baselines." slow="The daily NASA POWER requests are still running." />
          <progress max={CANDIDATES.length} value={loaded} aria-label="Clips loaded" />
          <p className="mono tiny muted">{loaded} of {CANDIDATES.length} clips</p>
        </div>
      )}
      {error && <Problem message={error} source="NASA POWER" onRetry={() => void prepare()} />}

      {inTrial && trial && (
        <section className="ear-trial" aria-labelledby="trial-heading">
          <div className="trial-progress" aria-hidden="true">
            {trials.map((item, position) => (
              <span key={item.id} className={["trial-dot", item.practice ? "practice" : "", position < index ? "done" : "", position === index ? "now" : ""].join(" ")} />
            ))}
          </div>
          <p className="label">{trialLabel} · {trial.practice ? "feedback after your answer" : "no feedback"}</p>
          <h2 id="trial-heading" ref={trialHeading} tabIndex={-1}>Which clip contains the unusual event?</h2>
          <div className="clip-pair" role="group" aria-label="Clips">
            {trial.clips.map((clip, position) => {
              const clipIndex = position as 0 | 1;
              const playingThis = playingClip === clipIndex;
              return (
                <button
                  key={clip.id}
                  className="clip-button"
                  data-playing={playingThis || undefined}
                  disabled={answered}
                  onClick={() => void playClip(clipIndex)}
                  aria-label={`${heard.includes(clipIndex) ? "Replay" : "Play"} clip ${clipIndex + 1}${playingThis ? ", playing" : ""}`}
                >
                  <span className="clip-letter mono" aria-hidden="true">{clipIndex === 0 ? "A" : "B"}</span>
                  <span className="clip-name">Clip {clipIndex + 1}</span>
                  <span className="tiny muted">{playingThis ? "Playing…" : heard.includes(clipIndex) ? "Heard · replay" : "Not heard yet"}</span>
                </button>
              );
            })}
          </div>
          <fieldset className="confidence" disabled={answered}>
            <legend>How confident are you? <span className="muted tiny">(optional, 1 = guessing, 4 = sure)</span></legend>
            {([1, 2, 3, 4] as const).map((value) => (
              <button key={value} type="button" className="chip" aria-pressed={confidence === value} onClick={() => setConfidence(value)}>{value}</button>
            ))}
          </fieldset>
          <div className="answer-row" role="group" aria-label="Choose the unusual clip">
            {([0, 1] as const).map((choice) => (
              <button key={choice} className="btn btn-primary" disabled={heard.length < 2 || answered} onClick={() => answer(choice)}>
                <kbd>{choice + 1}</kbd> Clip {choice + 1} was unusual
              </button>
            ))}
          </div>
          <p className="muted tiny" aria-live="polite">{heard.length < 2 && !answered ? `Play both clips to answer (${heard.length} of 2 heard).` : ""}</p>
          {feedback && (
            <div className="study-feedback">
              <p role="status">{feedback}</p>
              <button className="btn btn-primary" onClick={advance}>Continue <kbd>Enter</kbd></button>
            </div>
          )}
        </section>
      )}

      {done && (
        <section className="study-results" aria-labelledby="results-title">
          <h2 id="results-title" ref={trialHeading} tabIndex={-1}>Session summary</h2>
          <p className="muted tiny">Your own session only. It is not a study result: results come from many participants analysed under the protocol.</p>
          <dl className="result-tiles">
            <div><dt>Pairs correct</dt><dd>{Math.round(score.accuracy * testTrials.length)} / {testTrials.length}</dd></div>
            <div><dt>Accuracy</dt><dd>{Math.round(score.accuracy * 100)}%</dd></div>
            <div><dt>d′</dt><dd>{score.dPrime.toFixed(2)}</dd></div>
            <div><dt>Mean response time</dt><dd>{(score.meanRtMs / 1000).toFixed(1)} s</dd></div>
          </dl>
          <ul className="tiny">
            {Object.entries(score.byCondition).map(([condition, values]) => (
              <li key={condition}>{condition === "warm-anomaly" ? "Pairs with a warm event" : "Pairs with a cool event"}: {values.n}, {Math.round(values.accuracy * 100)}% correct</li>
            ))}
          </ul>
          <details>
            <summary className="tiny">What you heard: the clips, now revealed</summary>
            <div className="table-scroll" tabIndex={0} aria-label="Revealed test clips">
              <table className="data-table">
                <thead><tr><th>Trial</th><th>Unusual clip</th><th>Peak five-day z</th><th>Normal clip</th><th>Your answer</th></tr></thead>
                <tbody>
                  {testTrials.map((item, position) => {
                    const unusual = item.clips[item.correct];
                    const usual = item.clips[item.correct === 0 ? 1 : 0];
                    const response = responses.find((r) => r.trialId === item.id);
                    return (
                      <tr key={item.id}>
                        <td>{position + 1}</td>
                        <td>{unusual.place}, {unusual.start} to {unusual.end}</td>
                        <td>{unusual.peakZ >= 0 ? "+" : "−"}{Math.abs(unusual.peakZ).toFixed(1)}</td>
                        <td>{usual.place}, {usual.start} to {usual.end}</td>
                        <td>{response ? (response.correct ? "correct" : "missed") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
          <div className="consent-actions">
            <button className="btn btn-ghost" onClick={() => download("csv")}><Download size={15} aria-hidden="true" /> Export CSV</button>
            <button className="btn btn-ghost" onClick={() => download("json")}><Download size={15} aria-hidden="true" /> Export JSON</button>
            <button className="btn btn-ghost" onClick={() => { setTrials([]); setResponses([]); setPool(null); }}><RotateCcw size={15} aria-hidden="true" /> New session</button>
          </div>
        </section>
      )}

      <p className="validation-footnote">
        Stimuli: NASA POWER daily temperature, rain, wind, humidity and pressure for {CANDIDATES.length} curated windows, played
        with the fixed scientific mapping. The answer key is computed in your browser from the fetched data: a robust z
        against the same calendar day in 2001–2020 ((T − P50) / ((P90 − P10) / 2.563)), averaged over five days.
        {pool ? ` This session's pool: ${pool.unusual} unusual and ${pool.normal} normal clips from ${pool.places} places${pool.between ? `, ${pool.between} between the cutoffs and unused` : ""}${pool.failed ? `, ${pool.failed} not returned by NASA POWER` : ""}.` : ""}{" "}
        Protocol: docs/validation-protocol.md. No human results are reported yet.
      </p>
    </section>
  );
}
