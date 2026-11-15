# SYNESTHESIA engineering guide

This guide consolidates the audio, geospatial, and shell lane handoffs. The application is a React/Vite frontend backed by a Python API; NASA POWER provides environmental measurements, Open-Meteo provides geocoding, and NASA SVS/GIBS provide imagery and metadata.

## Runtime structure

- `frontend/src/App.tsx` owns route selection, the single `TappedEngine`, shared sonic settings, captions, and the persistent audio dock. Hash routes are defined in `frontend/src/shell/route.ts`.
- `frontend/src/audio/engine.ts` is the one playback authority. Sequences use `play(events, { source, bpm, title, trace, onIndex, onEnded })`; soundscapes use `playSoundscape`; two-location battles use `playPair`. Each start replaces the prior run. `stopAll`, `pause`, `resume`, `seek`, `setVolume`, `setMuted`, and `setRate` are shared by every view.
- `frontend/src/ui/audioBus.ts` taps the master output with an analyser. Visual scopes read this shared output, while engine state and notes are exposed through `useEngineState` and `useCurrentNote`.
- `frontend/src/audio/soundscape.ts` and `labConfig.ts` contain deterministic data-to-sound mapping and validated Sonic Lab configuration. `mappings.ts` is the source of truth for scientific mapping explanations. `postcard.ts`, `wav.ts`, and `archive.ts` provide offline audio export and local archive storage.
- `frontend/src/history/` holds the long-record features: `anomaly.ts` (departures from the 2001–2020 normal and their plain-word explanations), `timeline.ts` (monthly/seasonal/annual steps for the Sound Timeline and the Cosmic Earth history panel), `soundMap.ts` (the 12 × 5 region grid, keyboard moves, tours, per-region soundscape steps). Steps may carry their own `source`/`requestUrl` so a soundscape can join several POWER requests and still trace each note.
- `frontend/src/intelligence/` is Earth Listening Intelligence (`#/listen?region=<id>`, or `?box=s,w,n,e&name=…` for a searched or clicked box). `regionApi.ts` loads a region with progress (`/api/region/grid` for the plan, the uncached points through `/api/power/monthly`, then `/api/region`). `stats.ts` (median/MAD, robust z, ranks, OLS with a t-test, Mann–Kendall, Sen's slope), `analysis.ts` (climatology, anomalies, runs, records, spatial contrast, finding templates, ranking, summary) and `listenScape.ts` (the soundscape and finding → step → second mapping) are pure and tested on SYNTHETIC fixtures (`fixtures.ts`). `regionPick.ts` builds boxes and links; `background.ts` holds the labelled general-background notes. Findings are template sentences filled from computed numbers; add a new finding kind by adding a template and a test with fixed numbers.
- The case study (`intelligence/CaseStudy.tsx`, `#/case?region=<id>`, default `amazon`) loads the same region grid and analysis. `caseAnalysis.ts` scores every month by its weakest leg, min(z temperature, −z rain, −z humidity) (rain months in the dry season are not scored), takes the strongest month as the peak, grows it while all legs keep |z| ≥ 1.5 (up to six months), centres a 12-month window on it, and chooses the reference as the same calendar months shifted by whole years into 2001–2020 with the smallest largest |z| over all four variables. `met` is true only when every leg reaches |z| ≥ 2 in the peak month; the headline template says plainly when it is not. Both pieces are built by `buildListenScape` with a month range and 72 bpm (`ListenSpan.months`, `ListenSpan.bpm`). Amazon was chosen as the default after running the search on all four presets: only its record passes the test (October 2024: z +6.1, −3.2, −5.1); the Sahel's June 2025 falls just short (weakest leg 1.98), the Indian Ocean and Arctic are far from it.
- `frontend/src/validation/` is the Listening Test. `stimuli.ts` lists 48 30-day windows at 16 places (2001–2025), vetted by `scripts/vet-stimuli.mjs` against the running backend; `study.ts` classifies a fetched clip (`scoreClip`, `classify`: unusual at five-day mean |z| ≥ 2.5, normal below 1.5), builds seeded trials with distinct clips (`makeTrials`, `seedFor`), scores sessions (log-linear d′) and exports CSV/JSON; `earOnly.ts` strips place, dates, captions and traces from a trial soundscape, and the `html.ear-only` class hides the dock's note readout, trace drawer and scopes during a trial. `frontend/scripts/simulated-observer.mjs` writes `docs/simulated-observer.*` (simulation, not human data).
- `backend/app/region.py` holds the grid, area-mean and assembly logic for `/api/region`; the endpoints at the end of `main.py` reuse `power_monthly`, so each grid point shares the on-disk cache with the Sound Timeline.
- `frontend/src/geo/` contains share URL validation, historical comparisons, and anomaly discovery. `CosmicEarth` and `TimeMachine` use the shared engine and provide source-tagged traces. Cosmic share URLs encode route, coordinates, date window, selected sound, lead, and musical settings.
- Navigation: four primary tabs (Listen, Hear Earth, History, Anomalies) and `shell/MoreMenu.tsx`, a disclosure button whose panel is fixed to the viewport (so the scrolling tab row on phones cannot clip it); arrow keys, Home and End move through its links, Escape closes it and returns focus, and a click or focus outside closes it. `#/cosmic?focus=anomaly` and `#/cosmic?focus=battle` are in-page targets: `App.tsx` waits for the section, scrolls it under the header, focuses it and follows layout changes until the user scrolls; with `focus=anomaly` Cosmic Earth also renders the Global Anomaly Explorer first. The landing button calls `engine.ensure()` inside the click and sets `autoPlay`, which `ListeningIntelligence` honours once the region's piece is built.
- `frontend/src/shell/` contains the audio dock, route helpers, onboarding, intro, keyboard behavior, announcements, and playback math. `science-page/` documents sources and methods; `jukebox/` provides frame scans and track voicing.

## Data and state conventions

Fetch POWER through `fetchPower` / `powerPath` in `api.ts` (one request returns all eight parameters, so the lead melody and the soundscape always share data) and geocoding through `geocode`. For a component that loads on a key, use `useRemote(key, loader)`: it aborts the older request, so a stale answer can never overwrite a fresh one. Handwritten loaders (Cosmic Earth, Time Machine) use a request-generation ref for the same guarantee. Show `Wait` while loading and `Problem` (with retry) on failure. Display units through `format.ts` (`powerUnit`, `formatMeasure`, `formatLatLon`), and storage through `storage.ts#browserStore`. Keep derived scores and charts pure where possible, and preserve missing POWER values as `null`; never interpolate them silently. Share URL parsers validate ranges and enum values before returning state.

Keep audio ownership in the engine rather than duplicating “playing” state in views. Give each sequence a stable source (`jukebox`, `cosmic`, `time`, `lab`, or a lab slot), pass trace metadata when available, and use engine callbacks to synchronize captions and visual indexes. A new play replaces existing voices; use `stopAll()` for explicit global stop actions.

Prefer existing CSS tokens and component patterns. Buttons need accessible names and state, data tables retain units and missing markers, and loading/error states should remain visible. Honor `prefers-reduced-motion` and the high-contrast preference. Avoid storing NASA responses beyond the session unless the feature explicitly saves an archive entry.

## Verification and local development

The root package scripts are authoritative:

- `pnpm dev` starts the web and API processes; use `SYN_WEB_PORT=4317 SYN_API_PORT=8741` for the integration browser check.
- `pnpm test` runs frontend Vitest and backend pytest.
- `pnpm --dir frontend build` runs TypeScript project checks and the production Vite build.
- `pnpm --dir frontend lint` runs ESLint.
- `node scripts/ux-check.mjs <base-url> <artifact-directory>` exercises the shell and responsive layouts in Playwright/Chromium.
- `node scripts/browser-smoke.mjs chromium|firefox|webkit [base] [--no-audio]` is the cross-browser smoke test. Firefox audio runs with the available PulseAudio null sink (`media.cubeb.backend=pulse`); WebKit needs the system GTK/GStreamer libraries installed.
- `node scripts/capture.mjs` refreshes screenshots; `node scripts/record-demo.mjs` records the captioned product tour.

- `node scripts/listen-check.mjs <base> [shot-directory]` checks the flagship paths against real data: the landing call to action (audio started by the click), Listening Intelligence (finding seek and highlight, the live region, evidence and request URLs, map keyboard picking), the case study (verdict, both pieces audible, four charts with the playhead, legend, labelled background), a Listening Test practice trial (pool size, ear-only screen, keys A/B/1), overflow at 390 and 1440 px, and console errors.
- `node scripts/vet-stimuli.mjs [--write]` re-vets the Listening Test windows; `node --experimental-strip-types frontend/scripts/simulated-observer.mjs` regenerates the simulated-observer report (both need the backend on `SYN_API_PORT`).
- The API gzips responses over 1 KB (`GZipMiddleware`); `/api/region` drops from about 174 KB to 57 KB.

The Playwright scripts require the backend to be reachable and use deterministic or cached fixtures where possible. Confirm the active ports and stop both processes after browser verification. Chromium and Firefox pass the full audio smoke check. Playwright WebKit is downloaded, but this host cannot launch it because GTK/GStreamer libraries are missing and the Debian package mirror is unavailable.

## Known product limits

- Lead-melody and soundscape anomalies describe the selected window. Anomaly explanations, the Sound Map bells and the Sound Timeline compare with NASA POWER 2001–2020 (`/api/power/baseline`: same calendar days ±7; `/api/power/monthly`: same month/season/year). The general-background notes in `history/anomaly.ts` are textbook context, labelled as such, never attributions.
- CERES cloud amount is delayed relative to MERRA-2. Recent windows can lack the soundscape density layer; missingness is reported.
- `CLOUD_AMT` and some extended POWER variables can be absent for a response. Keep that absence explicit in charts and sound.
- Browser audio requires a user gesture. Audio preference persistence is best-effort when local storage is available.
- The Global Anomaly Explorer samples 48 global grid points in batches of six through the cached NASA POWER proxy (rain below 1 mm/day is never called a wet anomaly, because a dry window has zero MAD; each variable has a minimum spread, `MIN_SPREAD` in `geo/anomalyScan.ts`, so near-constant ocean or ice windows do not inflate tiny changes).
- Regional Sound Battle challengers can be selected from presets, geocoded searches, or any coordinate clicked on its world map.
- Review items P1.1, P1.4 and P1.7 are fixed: Time Machine pitch is absolute (zero change = reference tonic, `science/score.ts#changeToMidi`); lead-melody rain anomalies use ln(1 + P); multi-year windows are matched by `geo/comparison.ts#calendarKey`; one-shot audio nodes disconnect on `ended`.

- Earth Listening Intelligence samples a region at 9–12 grid points of POWER's MERRA-2 monthly record, not every cell; the first visit to a new box takes one POWER request per point (well under a second each when POWER is responsive), after which it comes from the backend cache. Trend p-values treat years as independent.

## Round 5 performance profile

Measured with Lighthouse 13.6.0 against production builds on the local system Chrome, using mobile emulation and simulated throttling. The same route (`#/`) and Lighthouse flags were used before and after the change. The entry JavaScript file shrank from 444.49 KB (141.71 KB gzip) to 308.88 KB (99.12 KB gzip) after route splitting; route code now loads on demand. The Blue Marble landing globe draws at a capped 30 frames per second and 0.75 render scale, and the Cosmic globe uses a 300-pixel drawing buffer.

| Measure | Before | After |
|---|---:|---:|
| Lighthouse performance | 66 | 95 |
| First Contentful Paint | 0.9 s | 0.9 s |
| Largest Contentful Paint | 2.8 s | 2.8 s |
| Speed Index | 1.2 s | 1.1 s |
| Total Blocking Time | 5,250 ms | 100 ms |
| Time to Interactive | 13.0 s | 2.8 s |
| Cumulative Layout Shift | 0.000 | 0.047 |
| Longest Chrome animation-frame callback in saved Lighthouse trace | 69.4 ms | 23.8 ms |

The changes address the two measured hot spots: all route modules had been in the entry chunk, and the continuously animated globe was re-rendering a larger pixel buffer at display refresh rate. Lighthouse traces were captured with `--save-assets`; they are local measurement artifacts, not application assets.
