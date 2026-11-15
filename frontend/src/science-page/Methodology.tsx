import { MappingTable } from "../components/lab/MappingTable.tsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { getJson } from "../api.ts";
import { Problem, Wait } from "../components/Guide.tsx";
import { voicingFor } from "../jukebox/voicing.ts";
import { MAD_TO_SIGMA } from "../science/anomaly.ts";
import { POWER_FILL } from "../science/normalize.ts";
import { CHANGE_FULL_SCALE_C, SCALES, changeReferenceMidi, midiName } from "../science/score.ts";
import type { SonicSettings, TrackSummary } from "../types.ts";
import {
  ATTRIBUTION,
  CHALLENGE,
  GIBS_WMS,
  LIMITATIONS,
  POWER_DOCS,
  POWER_ENDPOINT,
  POWER_PARAMETERS,
  POWER_PARAMS_DOCS,
  PROVENANCE,
  SVS_API,
  SVS_GALLERY,
} from "./sources.ts";
import { workedExample } from "./worked.ts";
import { ALPHA, DRY_NORMAL_MM, MIN_RUN, NORMAL_PERIOD, RUN_Z, UNUSUAL_Z, Z_FLOOR } from "../intelligence/analysis.ts";
import { LISTEN_BPM } from "../intelligence/listenScape.ts";

type Props = {
  settings: SonicSettings;
  /** Section id from the URL (#/science/anomalies), to scroll to. */
  anchor: string | null;
};

const CONTENTS = [
  { id: "principle", title: "Measured and generated" },
  { id: "datasets", title: "Datasets" },
  { id: "pixels", title: "Reading a picture" },
  { id: "scaling", title: "Normalization" },
  { id: "mapping", title: "Sonification math" },
  { id: "soundscape", title: "Earth soundscape" },
  { id: "worked", title: "Worked example" },
  { id: "anomalies", title: "Anomaly detection" },
  { id: "intelligence", title: "Listening Intelligence" },
  { id: "missing", title: "Missing data" },
  { id: "trace", title: "Tracing a note" },
  { id: "attribution", title: "Attribution" },
  { id: "limits", title: "Known limitations" },
] as const;

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={12} aria-hidden="true" className="inline-icon" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function Methodology({ settings, anchor }: Props) {
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [example, setExample] = useState({ value: 31.2, low: 22, high: 34, z: 2.9 });

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    getJson<{ tracks: TrackSummary[] }>("/api/jukebox")
      .then((body) => !controller.signal.aborted && setTracks(body.tracks))
      .catch((caught: Error) => !controller.signal.aborted && setError(caught.message));
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!anchor) return;
    document.getElementById(`m-${anchor}`)?.scrollIntoView({ block: "start" });
  }, [anchor]);

  const steps = useMemo(
    () => workedExample(example.value, example.low, example.high, example.z, settings),
    [example, settings],
  );

  const field = (key: keyof typeof example, label: string, step: number) => (
    <label className="field">
      <span className="label">{label}</span>
      <input
        type="number"
        step={step}
        value={example[key]}
        onChange={(change) => {
          const value = Number(change.currentTarget.value);
          if (Number.isFinite(value)) setExample((current) => ({ ...current, [key]: value }));
        }}
      />
    </label>
  );

  return (
    <div className="method">
      <header className="method-head">
        <p className="label">05 · Science &amp; Methodology</p>
        <h1 className="method-title">How a measurement becomes a note</h1>
        <p className="method-lede">
          Every sound in SYNESTHESIA is a fixed, reproducible function of a NASA number or a NASA picture. This page
          lists each dataset, each formula, what is measured and what is the instrument's own design, and where the
          method falls short.
        </p>
      </header>

      <nav className="method-toc" aria-label="On this page">
        <ol>
          {CONTENTS.map((item, index) => (
            <li key={item.id}>
              <a href={`#/science/${item.id}`} aria-current={anchor === item.id ? "location" : undefined}>
                <span className="num">{String(index + 1).padStart(2, "0")}</span> {item.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="method-body">
        <section id="m-principle" aria-labelledby="h-principle">
          <h2 id="h-principle">Measured, derived and generated</h2>
          <p>
            Three kinds of thing make up every note. <b className="tag tag-measured">Measured</b> values are NASA's,
            unchanged. <b className="tag tag-derived">Derived</b> values are computed from them by the formulas below.
            <b className="tag tag-generated">Generated</b> choices are the instrument's: they shape the sound and carry
            no data. Nothing is ever invented to stand in for a missing or failed measurement.
          </p>
          <table className="map method-table">
            <caption className="sr-only">Provenance of each part of the sound</caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Kind</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {PROVENANCE.map((row) => (
                <tr key={row.what}>
                  <td>{row.what}</td>
                  <td>
                    <span className={`tag tag-${row.kind}`}>{row.kind}</span>
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="m-datasets" aria-labelledby="h-datasets">
          <h2 id="h-datasets">Datasets</h2>
          <h3>NASA Scientific Visualization Studio · Earth Information Center</h3>
          <p>
            The nine visualizations named on the <External href={CHALLENGE}>Space Apps 2026 challenge</External>{" "}
            resources tab, from the <External href={SVS_GALLERY}>EIC gallery</External>. Titles and descriptions come
            from the <External href={SVS_API}>SVS API</External> (<code>/api/&#123;id&#125;/</code>); the media file
            measured is listed on each jukebox page.
          </p>
          {!tracks && !error && <Wait active label="Loading the catalogue from the SYNESTHESIA service." slow="Still waiting on the catalogue." />}
          {error && <Problem message={error} source="NASA SVS" onRetry={() => setAttempt((value) => value + 1)} />}
          {tracks && (
            <div className="table-scroll" role="region" aria-label="The nine EIC visualizations" tabIndex={0}>
              <table className="map method-table">
                <thead>
                  <tr>
                    <th scope="col">SVS id</th>
                    <th scope="col">Title</th>
                    <th scope="col">File read</th>
                    <th scope="col">Pitch from</th>
                    <th scope="col">Soundscape (generated)</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((track) => (
                    <tr key={track.svs_id}>
                      <td className="mono">
                        <External href={track.page_url}>{track.svs_id}</External>
                      </td>
                      <td>{track.title}</td>
                      <td>{track.kind === "video" ? "24 frames of the movie" : "24 west-to-east slices of the still"}</td>
                      <td>{track.pitch_from === "luminance" ? "brightness" : track.pitch_from}</td>
                      <td>{voicingFor(track.svs_id).name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>NASA POWER · daily point data</h3>
          <p>
            <code>{POWER_ENDPOINT}</code>, community <code>AG</code>, no key (
            <External href={POWER_DOCS}>API documentation</External>,{" "}
            <External href={POWER_PARAMS_DOCS}>parameter dictionary</External>). Used by Cosmic Earth and the Time
            Machine. Units below are those POWER returns for this community; the page always shows the unit from the
            response itself.
          </p>
          <div className="table-scroll" role="region" aria-label="NASA POWER parameters" tabIndex={0}>
            <table className="map method-table">
              <thead>
                <tr>
                  <th scope="col">Parameter</th>
                  <th scope="col">Name</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Heard as</th>
                </tr>
              </thead>
              <tbody>
                {POWER_PARAMETERS.map((parameter) => (
                  <tr key={parameter.id}>
                    <td className="mono">{parameter.id}</td>
                    <td>{parameter.name}</td>
                    <td className="mono">{parameter.unit}</td>
                    <td>{parameter.heard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>NASA GIBS · Blue Marble</h3>
          <p>
            Web Map Service <code>{GIBS_WMS}</code>, layer <code>BlueMarble_NextGeneration</code>, EPSG:4326,
            1024×512 JPEG. Drawn on the landing globe and sampled under your pointer as brightness.
          </p>
        </section>

        <section id="m-pixels" aria-labelledby="h-pixels">
          <h2 id="h-pixels">Reading a picture</h2>
          <p>
            A still is resized (box filter) to 24 columns × 64 rows; each column is one slice, read west to east. A
            movie is sampled as 24 evenly spaced frames, each resized to 64 × 36. For each slice or frame, over its
            pixels with channels in 0–1:
          </p>
          <dl className="formulas">
            <div>
              <dt>Brightness</dt>
              <dd><code>L = mean(0.2126 R + 0.7152 G + 0.0722 B)</code> (Rec. 709 luminance)</dd>
            </div>
            <div>
              <dt>Warmth</dt>
              <dd><code>W = clamp((mean R − mean B + 1) ÷ 2)</code>, how warm the palette runs</dd>
            </div>
            <div>
              <dt>Contrast</dt>
              <dd><code>C = clamp(σ(L) ÷ 0.5)</code>, the spread of brightness in the slice</dd>
            </div>
          </dl>
          <p className="muted">Which of the three sets pitch is chosen per visualization (listed above) and can be overridden in Sonic Lab.</p>
        </section>

        <section id="m-scaling" aria-labelledby="h-scaling">
          <h2 id="h-scaling">Normalization</h2>
          <p>
            Each series is scaled on its own: <code>n = clamp((x − p5) ÷ (p95 − p5), 0, 1)</code>, with p5 and p95 its
            5th and 95th percentiles (linear interpolation). One extreme day therefore cannot flatten every other day
            into one note. A perfectly flat series becomes 0.5. Missing values are left out of the percentiles and stay
            missing.
          </p>
        </section>

        <section id="m-mapping" aria-labelledby="h-mapping">
          <h2 id="h-mapping">Sonification math: pictures and the lead melody</h2>
          <p className="muted">These rules play Jukebox frames and the single-lead melody in Cosmic Earth and Time Machine. The six-variable soundscape has its own rules, in the next section.</p>
          <dl className="formulas">
            <div>
              <dt>Degree</dt>
              <dd>
                <code>d = round(n × octaves × k)</code>, k notes per octave of the scale (pentatonic {SCALES.pentatonic.length}, major{" "}
                {SCALES.major.length}, dorian {SCALES.dorian.length}, chromatic {SCALES.chromatic.length})
              </dd>
            </div>
            <div>
              <dt>Pitch</dt>
              <dd><code>midi = tonic + 12 ⌊d ÷ k⌋ + scale[d mod k]</code>; both ends land on the tonic</dd>
            </div>
            <div>
              <dt>Frequency</dt>
              <dd><code>f = 440 × 2^((midi − 69) ÷ 12)</code> Hz, equal temperament, A4 = 440 Hz</dd>
            </div>
            <div>
              <dt>Loudness</dt>
              <dd><code>g = min(0.85, 0.18 + 0.32 n + 0.22·outlier)</code></dd>
            </div>
            <div>
              <dt>Brightness</dt>
              <dd><code>cutoff = 420 + 2800 n + 700·outlier</code> Hz, low-pass</dd>
            </div>
            <div>
              <dt>POWER days</dt>
              <dd>
                Rain adds noise <code>+0.45 n_rain</code>; wind sets the cutoff <code>380 + 3400 n_wind</code> Hz; sun scales loudness{" "}
                <code>× (0.75 + 0.5 n_sun)</code>; humidity adds a fifth at <code>0.04 + 0.08 n_rh</code>.
              </dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>One step per beat, <code>60 ÷ bpm</code> seconds, bpm clamped to 48–200 after the speed control.</dd>
            </div>
          </dl>
          <p className="muted">
            Current settings: {settings.scale}, tonic MIDI {settings.rootMidi}, {settings.octaves} octaves, {settings.bpm} bpm, outlier at |z| ≥ {settings.anomalyZ}.
          </p>
        </section>

        <section id="m-soundscape" aria-labelledby="h-soundscape">
          <h2 id="h-soundscape">Earth soundscape: six variables, one sound</h2>
          <p>
            Sonic Lab, Cosmic Earth and the Regional Sound Battle can play a NASA POWER window as one soundscape, a layer per
            variable. In Scientific Mode every rule below uses a fixed physical range, so the same measurement always makes
            the same sound at any place. Artistic Mode may change instrument, scale, tempo, range and normalization; the
            trace then quotes the rule actually applied. These are the rules the code runs, rendered from the same module.
          </p>
          <MappingTable />
        </section>

        <section id="m-worked" aria-labelledby="h-worked">
          <h2 id="h-worked">Worked example</h2>
          <p>
            Type a value and the 5th and 95th percentiles of its series. The steps below use the same functions the
            instrument plays with, at your current Sonic Lab settings. The default numbers are an illustration, not a
            measurement.
          </p>
          <div className="worked-inputs">
            {field("value", "Value", 0.1)}
            {field("low", "p5", 0.1)}
            {field("high", "p95", 0.1)}
            {field("z", "Robust z", 0.1)}
          </div>
          <ol className="worked" aria-live="polite">
            {steps.map((step) => (
              <li key={step.label}>
                <span className="label">{step.label}</span>
                <code>{step.formula}</code>
                <b>{step.result}</b>
              </li>
            ))}
          </ol>
        </section>

        <section id="m-anomalies" aria-labelledby="h-anomalies">
          <h2 id="h-anomalies">Anomaly detection</h2>
          <p>
            A robust z-score against the series' own median and median absolute deviation:{" "}
            <code>z = {MAD_TO_SIGMA.toFixed(4)} × (x − median) ÷ MAD</code>. The constant makes MAD comparable to a
            standard deviation for normally distributed data. Unlike a mean and standard deviation, one spike cannot
            hide itself by inflating the spread. If MAD is zero (a flat series), any value off the median scores ±10.
            A step with <code>|z| ≥ {settings.anomalyZ}</code> (set in Sonic Lab, default 2.5) is an outlier.
          </p>
          <p>
            The Time Machine scores each day's change (later minus earlier, same calendar day) against the changes in
            the window being compared. Its pitch is not percentile-scaled: zero change is always the reference tonic{" "}
            <code>{midiName(changeReferenceMidi(settings.rootMidi, settings.octaves))}</code>, and a change of{" "}
            <code>Δ</code> moves <code>round(|Δ| ÷ {CHANGE_FULL_SCALE_C} × ⌈octaves × k ÷ 2⌉)</code> scale steps up
            (warmer) or down (cooler), clamped at ±{CHANGE_FULL_SCALE_C} °C. Days are matched by month, day and year
            within the window, so a window longer than a year does not fold its years together. The lead melody and
            the anomalies above are relative to the window played; the Anomaly explanations in Cosmic Earth and the
            Sound Timeline compare with the NASA POWER 2001–2020 same-calendar-days baseline instead.
          </p>
        </section>

        <section id="m-intelligence" aria-labelledby="h-intelligence">
          <h2 id="h-intelligence">Earth Listening Intelligence: how findings are computed</h2>
          <p>
            A region is a latitude/longitude box. The backend samples it at the centres of a grid of cells (about one
            per 10°, three or four a side; six around a latitude circle for the Arctic) and fetches each point's NASA
            POWER monthly record (T2M, PRECTOTCORR, WS2M, RH2M, 1981 to the last complete year), four points at a time
            through the cached proxy. A point that fails is listed and left out. Everything below is arithmetic on those
            values; every sentence on the page is a fixed template filled with the results.
          </p>
          <dl className="formulas">
            <div>
              <dt>Area mean</dt>
              <dd><code>x̄(t) = Σ wᵢ xᵢ(t) ÷ Σ wᵢ</code>, <code>wᵢ = cos(latᵢ)</code>, over the points with a value; missing if those carry under half the weight</dd>
            </div>
            <div>
              <dt>Normal</dt>
              <dd><code>N(m)</code> = mean of the same calendar month <code>m</code> in {NORMAL_PERIOD[0]}–{NORMAL_PERIOD[1]}; anomaly <code>a = x − N(m)</code></dd>
            </div>
            <div>
              <dt>Robust z</dt>
              <dd><code>z = (s(x) − median) ÷ max(1.4826 · MAD, floor)</code> over the {NORMAL_PERIOD[1] - NORMAL_PERIOD[0] + 1} values of month <code>m</code>; <code>s(P) = ln(1 + P)</code> for rain, <code>s(x) = x</code> otherwise. Floors: {Z_FLOOR.T2M} °C, {Z_FLOOR.PRECTOTCORR} on ln(1 + P), {Z_FLOOR.WS2M} m/s, {Z_FLOOR.RH2M} % RH</dd>
            </div>
            <div>
              <dt>Rain change</dt>
              <dd><code>100 × (P − N) ÷ N</code>; months whose normal is under {DRY_NORMAL_MM} mm/day are not scored</dd>
            </div>
            <div>
              <dt>Rank</dt>
              <dd>Position of a month among the same calendar month of every year (“the warmest March in 45 years”), or of a complete-year annual mean among all complete years (records)</dd>
            </div>
            <div>
              <dt>Unusual month</dt>
              <dd><code>|z| ≥ {UNUSUAL_Z}</code>: listed, and its variable's bell rings in the soundscape</dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>At least {MIN_RUN} consecutive months on one side of normal with <code>|z| ≥ {RUN_Z}</code>; a gap ends it. Severity <code>mean|z| + log₂(length)</code></dd>
            </div>
            <div>
              <dt>Trend</dt>
              <dd>OLS of annual means on year, <code>b = Sxy ÷ Sxx</code>, <code>t = b ÷ √(SSE ÷ (n − 2) ÷ Sxx)</code>, two-sided p from Student's t with n − 2 degrees of freedom; significant at p &lt; {ALPHA}. Checked with Mann–Kendall (<code>S = Σ sign(xⱼ − xᵢ)</code>, tie-corrected variance, normal approximation) and Sen's slope (median pairwise slope). Reported per decade</dd>
            </div>
            <div>
              <dt>Across the box</dt>
              <dd>Each grid point against its own normal over the strongest event's months: mean anomaly, or rain as a percentage of the total normal</dd>
            </div>
            <div>
              <dt>Ranking</dt>
              <dd>Score = |z| for a month, run severity for a run, <code>(3 + min(3, −log₁₀ p)) × min(1, |b| × years ÷ σ(annual))</code> for a significant trend, 4 / 3 / 2.5 for a temperature / rain / wind record year, 2–3 for the spatial contrast. The best of each kind (temperature, rain, wind, history, humidity, spatial) is kept, then the rest by score, at most ten</dd>
            </div>
          </dl>
          <p>
            The soundscape plays the area mean one note per month (or per season for the full record) at {LISTEN_BPM} notes a minute: pitch is the
            temperature anomaly around the reference tonic, with the region's 95th-percentile |anomaly| (rounded up to 0.5 °C, 1–6 °C) at the ends of
            the range; rain, wind and humidity use the soundscape's fixed rules; bells ring at <code>|z| ≥ {UNUSUAL_Z}</code>. Each finding knows its
            months, so it can seek the audio to the first note that contains them, and the note playing highlights the findings it belongs to.
          </p>
          <p className="muted">
            Limits: MERRA-2 is reanalysis, not a station record; a few grid points stand for a whole box; monthly means hide short events; trend
            p-values treat years as independent. Background notes about a region are textbook context, labelled “General background (not an
            attribution)”, and never explain a finding.
          </p>
        </section>

        <section id="m-missing" aria-labelledby="h-missing">
          <h2 id="h-missing">Missing data</h2>
          <ul>
            <li>POWER marks missing days with its fill value <code>{POWER_FILL}</code>. The backend turns it into <code>null</code>; the page shows “missing”.</li>
            <li>A missing day makes no note. The step is skipped and the highlight follows the real day, not a renumbered one.</li>
            <li>Missing values are excluded from percentiles, medians and MAD.</li>
            <li>A failed download is an error with the service's own message. No synthetic or cached stand-in is substituted; synthetic data exists only in unit tests and is labelled so.</li>
          </ul>
        </section>

        <section id="m-trace" aria-labelledby="h-trace">
          <h2 id="h-trace">Tracing a note</h2>
          <p>
            Open <b>Trace</b> in the audio dock (or press <kbd>T</kbd>) while anything plays. It walks back from the
            note you hear to its source: the NASA dataset and page, the measured value, its scaled value and the
            percentile window, its robust z and whether that made it an outlier, and finally the note and frequency.
            What the instrument added is listed apart, as generated.
          </p>
        </section>

        <section id="m-attribution" aria-labelledby="h-attribution">
          <h2 id="h-attribution">Attribution</h2>
          <ul className="attribution">
            {ATTRIBUTION.map((item) => (
              <li key={item.name}>
                <b>{item.name}.</b> {item.text} <External href={item.url}>Source</External>
              </li>
            ))}
          </ul>
          <p className="muted">SYNESTHESIA is a NASA Space Apps 2026 project. It is not an official NASA product and is not endorsed by NASA.</p>
        </section>

        <section id="m-limits" aria-labelledby="h-limits">
          <h2 id="h-limits">Known limitations</h2>
          <ul>
            {LIMITATIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
