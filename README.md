# SYNESTHESIA

**Earth, heard.** An Earth sonification app for the NASA Space Apps Challenge 2026 challenge **The Earth Information Jukebox**. Real NASA measurements become sound you can trace back, note by note, to the request that produced them.

This is not an official NASA product.

## Three experiences, one bridge

1. **Hear Earth** (`#/cosmic`, nav 01): touch the Blue Marble on the landing page or pick any point on Cosmic Earth and hear its NASA POWER days as one soundscape (temperature is pitch, rain percussion, wind loudness, humidity texture, bells for unusual values).
2. **Travel through environmental history** (`#/timeline`, nav 02): a place's NASA POWER monthly record since 1981, one note per month, season or year against its 2001–2020 normal, with a synced chart.
3. **Discover global anomalies through sound** (`#/cosmic?focus=anomaly`, nav 03): 48 points around the globe scanned for unusual days; the outliers ring as bells, each traced to its measurement.

**Earth Listening Intelligence** (`#/listen?region=indian-ocean`, nav 00) joins them. Pick a region (four presets, a searched place, or a box clicked on the map); its NASA POWER record is sampled on a grid, area-averaged, played one note per month, and searched for unusual temperature, rainfall changes, unusual wind and historical deviations. Each finding is a fixed sentence template filled with computed numbers (no generated text), with its evidence table, grid points, POWER request URLs and a "Hear it" button that jumps the audio to its moment. The landing page's one call to action, **Try the Indian Ocean**, opens it already playing.

**Evidence that it is useful and that people can hear it:**

- **Case study** (`#/case`): the region grid is searched at runtime for its strongest compound heat-and-dryness event (temperature above, rainfall and humidity below normal, each |robust z| ≥ 2). Hear a data-selected quiet reference year, hear the event year, then reveal the four synced charts you would otherwise need beside the one soundscape that carries all four. On the Amazon preset the search finds August–November 2024; on regions where the test is not met, the page says so.
- **Listening Test** (`#/test`): an ear-only two-clip task on 48 vetted NASA POWER 30-day windows from 16 places (2001–2025); answer keys are computed from the fetched data. The protocol, sample size and analysis plan are in [docs/validation-protocol.md](docs/validation-protocol.md). No human results exist yet; a simulated observer ([docs/simulated-observer.md](docs/simulated-observer.md)) is a labelled mapping check, not human data.

Everything else (Science & Methodology, Earth Sound Map, Time Machine, Sound Battle, Jukebox of the nine EIC visualizations, Sonic Lab) is under **More** and supports these.

## Run it

Requirements: Node 22, pnpm 9, Python 3.12, and ffmpeg on your PATH. NASA SVS, POWER, and GIBS must be reachable. There is no API key.

macOS or Linux:

```bash
pnpm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
pnpm dev
```

Windows (PowerShell), from the repository root:

```powershell
pnpm install
python -m venv backend\.venv
backend\.venv\Scripts\pip install -r backend\requirements.txt
pnpm dev
```

`pnpm dev` starts the page and the data proxy. It runs `python -m uvicorn` from the virtualenv, using `backend\.venv\Scripts\python.exe` on Windows and `backend/.venv/bin/python` elsewhere.

- App: http://127.0.0.1:4317
- Data proxy: http://127.0.0.1:8741 (`pnpm backend` if you want it alone)

```bash
pnpm test
```

Frontend tests use Vitest. Backend tests use pytest. Both use clearly labelled synthetic fixtures. They do not call NASA.

## Screenshots and demo video

`artifacts/` holds 1440×900 screenshots named for the structure above (`01-landing`, `02-listen-indian-ocean`, `03-listen-finding-evidence`, `04-case-study`, `05-listening-test`, `06-listening-test-results`, `07-global-anomalies`, `08-hear-earth`, `09-timeline`, `10-more-menu`, `11-science-listening`, `12-phone-listen` at 390 px, then the supporting tools), `artifacts/synesthesia-demo.mp4`, a captioned walkthrough under three minutes with the app's own sound, and `artifacts/REPORT.md`, the status of every round's items. With `pnpm dev` running:

```bash
npx playwright install ffmpeg   # once; Playwright's video encoder
node scripts/capture.mjs        # checks every mode in headless Chrome, writes the PNGs
node scripts/record-demo.mjs    # records the walkthrough and muxes its audio with ffmpeg
```

`node scripts/ux-check.mjs http://127.0.0.1:4317 artifacts/ux-check` walks every navigation link and dock control, checks that playback survives a change of page, fails on any browser-console error, checks the header at 1280, 1440 and 1920 px and the More menu by keyboard, and screenshots six screen sizes from 390 px phones to 2560 px ultrawide.

`node scripts/listen-check.mjs [base]` checks the flagship paths against real data: the landing call to action, Listening Intelligence findings and seeking, the case study reveal and a Listening Test practice trial, each with real audio at the analyser.

`node scripts/browser-smoke.mjs chromium|firefox [base] [--no-audio]` is a short cross-browser check: every page, analyser level and console.

`node scripts/vet-stimuli.mjs --write` re-vets the Listening Test candidate windows against the running backend; `node --experimental-strip-types frontend/scripts/simulated-observer.mjs` regenerates the simulated-observer report.

All of them use the system Google Chrome when it is installed, otherwise Playwright's Chromium (`npx playwright install chromium`).

## Design

Every colour, typeface and easing curve is a token in the single `@theme` block at the top of `frontend/src/index.css`. Sea-surface cyan is the signal; thermal amber marks anomalies, warming and the transport. Fonts (Instrument Serif, IBM Plex Sans, IBM Plex Mono) are self-hosted through `@fontsource`, so the page makes no third-party requests. The waveform, spectrum and playhead glow read a listening-only analyser attached in `frontend/src/ui/audioBus.ts`; the audio engine itself is unchanged.

## What you can do

- **Landing.** One call to action, **Try the Indian Ocean**, which starts the sound inside the click. Press and drag across the Blue Marble globe to hear the brightness of the picture under your hand. Below: the three experiences, Listening Intelligence as the bridge, and the case study and Listening Test.
- **Earth Listening Intelligence.** Region presets (Indian Ocean, Sahel, Amazon, Arctic), place search or a box on the map (keyboard: arrows and Enter). Ranked findings with evidence, a strip chart with numbered pins, the last 12 years by month or the full record by season or month, an honest limits list and a labelled "General background (not an attribution)". Links: `#/listen?region=sahel` or `#/listen?box=s,w,n,e&name=…`.
- **Case study.** Three steps (normal period, event period, reveal), four small synced anomaly charts beside the sound legend, the playhead on every chart, a month-by-month evidence table and a link to the region in Listening Intelligence. `#/case?region=amazon` (default), or any preset or box.
- **Listening Test.** Consent, optional participant code, 2 practice + 10 test pairs with distinct clips; keys A/B play, R replays, 1/2 answer, Enter continues. Clips are stripped of place, dates, captions and traces, and the dock hides note names during a trial. Session summary, the clips revealed afterwards, CSV/JSON export.
- **Cosmic Earth.** A NASA GIBS Blue Marble globe; NASA POWER daily data for any point and window; place history; Regional Sound Battle; Global Anomaly Explorer; shareable links.
- **Sound Timeline, Sound Map, Time Machine, Jukebox, Sonic Lab.** The supporting instruments (under More), unchanged in behaviour from round 5.
- **Science & Methodology.** Every dataset, formula and limitation, including the Listening Intelligence statistics (`#/science/intelligence`).
- **Audio dock.** Play/pause, previous/next note, seek, volume, mute, speed and **Trace**, which walks the sounding note back to its NASA source. Playback carries on when you change page. High contrast and reduced motion are in the header; every page has its own URL.

## Data rules

Real NASA files only. POWER’s fill value (−999) stays missing. If a request fails, the page shows NASA’s error and does not substitute a fake series. Several official movies are hundreds of megabytes or more; those tracks say so and scan the official preview still instead.

The jukebox measures the SVS picture (brightness, warmth, contrast). It does not pretend those pixel statistics are the underlying geophysical archive. Cosmic Earth, Time Machine, the Timeline, Listening Intelligence, the case study and the Listening Test play the POWER numbers themselves. Findings and case-study sentences are fixed templates filled with computed values; they never name a cause.

Sources and the nine SVS ids are in [docs/data-sources.md](docs/data-sources.md). A three-minute demo is in [docs/demo-script.md](docs/demo-script.md). Submission text is in [docs/submission.md](docs/submission.md).
