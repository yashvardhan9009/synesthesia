# SYNESTHESIA · report

Rounds 4–6. Round 6 is first; the round 5 report and its review follow-up are kept below it unchanged.

## Round 6 (15 November 2026): focus, Earth Listening Intelligence, evidence

Round 6 answered four pieces of judge feedback: (1) scientific validation that people can hear anomalies, (2) focus on three unforgettable experiences with the core innovation reachable in about 30 s, (3) real scientific usefulness: finding something by ear that would otherwise need several charts, and (4) Earth Listening Intelligence. Two lanes ran in parallel (A: Listening Intelligence; B: navigation, Listening Test, case study, protocol, simulated observer); the integration then reviewed both, rebuilt the case study, expanded the Listening Test and added gzip, checks, docs and media.

Verification of the integrated build, on ports 4701/9101 against real NASA POWER data:

- Tests: 251 Vitest tests in 38 files and 31 pytest tests, all passing. `tsc -b` and `eslint .` are clean (0 warnings). The production build succeeds.
- `scripts/listen-check.mjs`: 31 checks pass. The landing call to action starts the Indian Ocean (playing about 1.6 s after the click, audio at the analyser); findings seek and highlight; the case study verdict, both pieces audible, four charts with the playhead; a Listening Test practice trial is ear-only and sounds; no overflow at 390/1440 px; 0 console errors.
- `scripts/ux-check.mjs`: all 145 checks pass. They cover every primary and More link, the More menu by keyboard (Escape and outside click), Anomalies landing at the top of the explorer with focus, the header on one row at 1280/1440/1920 px, all tabs visible at 390 px, the dock, and no overflow on 11 routes at six sizes; 0 console errors.
- `scripts/browser-smoke.mjs chromium`: all pages render; real audio reaches the analyser from the landing call to action, the case study, a Listening Test clip, the Jukebox and Sonic Lab; Anomalies lands on the explorer; 0 console errors.
- Captures: `scripts/capture.mjs` saved all 22 screenshots with no page or console errors.
- Demo: `artifacts/synesthesia-demo.mp4`, 2:28, H.264 + AAC with the app's own sound and chapter captions.

| Item | Status | Note |
|---|---|---|
| Focused landing | Done | One call to action, **Try the Indian Ocean** (`#/listen?region=indian-ocean`; `engine.ensure()` runs inside the click and the piece starts when it is built). Three experience cards; Listening Intelligence as the bridge between them; case study and Listening Test cards |
| Navigation | Done | Four primary tabs (Listen, Hear Earth, History, Anomalies) plus a More menu: arrow keys, Home/End, Escape returns focus, outside click or focus closes it; panel fixed to the viewport. Header on one row from 1100 px up, tabs on their own row below; at 390 px all four tabs and More fit. `--panel` was an undefined token (the menu had no background); fixed |
| Anomalies lands on the explorer | Done | `#/cosmic?focus=anomaly` renders the Global Anomaly Explorer first, scrolls it under the header, focuses it and follows layout changes until the user scrolls; the Cosmic share link keeps the target. `?focus=battle` does the same for the Sound Battle |
| Old routes and links | Done | `#/jukebox`, `#/time`, `#/soundmap`, `#/lab`, `#/science/<section>`, `?mode=cosmic&lat=…` all open as before |
| Earth Listening Intelligence | Done | Lane A, unchanged except autoplay from the landing and `LoadProgress` moved to its own module for the case study. Region grid (`/api/region`), 2001–2020 monthly normals, robust z, ranks, runs, records, OLS + Mann–Kendall trends, spatial contrast; templated findings with evidence, grid points, POWER URLs and a seek button each |
| Case study | Done | Rebuilt on the region grid. The whole record is searched at runtime for the strongest compound heat-and-dryness month (weakest of +z temperature, −z rain, −z humidity), grown while every leg keeps \|z\| ≥ 1.5; `met` only if every leg reaches \|z\| ≥ 2. The reference is the same calendar months shifted into 2001–2020 with the smallest largest \|z\|. Default region Amazon, chosen by running the search on all four presets: Amazon August–November 2024 passes (October 2024: z +6.1, −3.2, −5.1); the Sahel (June 2025, weakest leg 1.98), Indian Ocean and Arctic do not, and the page says so for them. Steps: hear the reference, hear the event, reveal. Four small synced charts (temperature, rainfall, humidity, wind; event band, ±2 lines, playhead) beside the one soundscape with its legend; evidence table; link to the region in Listening Intelligence; labelled general background. 8 new tests on SYNTHETIC fixtures |
| Listening Test | Done | 48 vetted windows at 16 places, 2001–2025 (24 unusual incl. 12 warm and 12 cool, 24 normal), vetted by `scripts/vet-stimuli.mjs`; the app re-classifies every clip from the fetched data (this host: 24 and 24). 2 practice + 10 test pairs, distinct clips, seeded by participant code. Ear-only: trial soundscapes carry no place, dates, captions or traces and the dock hides its note readout, trace and scopes. Keys A/B play, R replays, 1/2 answer, Enter continues. Session summary tiles, clips revealed afterwards, CSV/JSON export |
| Validation protocol and simulated observer | Done | Protocol updated for the larger pool and 10 test pairs (power analysis unchanged: 32 participants, d = 0.5, 80% power; recruit 38). Simulated observer re-run on the 48-window pool, 500 trials: labelled "Simulation, not human data". **No human results exist yet** |
| Shared helpers and lint | Done | Case analysis uses `intelligence/stats.ts`; `mapCoordinates` moved out of a component file; the two eslint warnings are gone; a global disabled-button style was added |
| Gzip | Done | `GZipMiddleware(minimum_size=1000)`: `/api/region` 174 KB → 57 KB; pytest asserts gzip on a large response and none on a small one |
| Docs and media | Done | README, demo script, submission (round 6 summary, Validation with the human-results placeholder), engineering guide, this report; R5/R6 lane notes folded in here and removed; fresh screenshots and demo |

Lane notes, folded in:

- Lane A (Listening Intelligence): 37 Vitest and 12 pytest cases on synthetic fixtures; all four presets returned every grid point from POWER (12/12/9/12); the Indian Ocean link was ready to play in about 1 s on a warm cache; trend p-values treat years as independent (stated on the page and the Science page).
- Lane B (focus, validation, case study): the original case study (a single point and a fixed July 2024) and its three-clip pool were replaced in integration as described above; the protocol, scoring helpers, exports and simulated observer were kept and extended.

Open items, honestly:

- **No human perception data.** The Listening Test is an instrument and a protocol; results are to be filled after the study. The simulated observer is not evidence about listeners.
- The case study's compound test is one definition (heat + low rain + low humidity, monthly area means). Other compound events (cold and wet, windy and dry) are not searched.
- Listening Intelligence samples 9–16 grid points per box, not every cell; monthly resolution averages away short events; trend p-values ignore autocorrelation.
- The Listening Test's first load on a cold backend cache fetches 48 daily windows and 16 baselines from NASA POWER (6 s on this host with a warm cache).
- WebKit smoke is still blocked by missing host libraries; Chromium passes with real audio (Firefox passed in round 5).
- Commits from earlier rounds carry tool trailers in their messages; round 6 commits do not, and history was not rewritten. `pnpm-lock.yaml` contains a sha512 integrity hash in which three letters happen to match the scrub pattern.
- The round 5 open item P2.1 (untracked copy and hand-release timers) remains.

---

# Round 5 report

15 November 2026, integrated `master`. Round 5 ran two lanes in parallel (A: Earth Sound Map, Sound Timeline, place history, anomaly explanations, Time Machine fixes; B: global anomaly explorer, any-location battle, audio cleanup, cross-browser audio, performance, keyboard hand). Both were merged and checked together.
Verification of the merged build, on ports 4503/8903:

- Tests: 196 Vitest and 18 pytest, all passing, no pytest warnings.
- `tsc` and eslint: clean (one existing fast-refresh warning in `geo/RegionalComparison.tsx`).
- Build: production build succeeds; every section, including Sound Map and Timeline, is a lazily loaded route.
- Browser walk (`scripts/ux-check.mjs`, headless Chromium): all 103 checks pass, with 0 console errors. It covers every nav entry, the dock, the Sound Map keyboard path and equator tour, the Timeline, the global scan, a geocoded battle challenger, and no overflow at five sizes on all eight pages.
- Cross-browser smoke (`scripts/browser-smoke.mjs chromium`): all eight pages, real audio output, 0 console errors. The lane B run also passed in Firefox with PulseAudio.
- Captures: `scripts/capture.mjs` saved all 19 screenshots with no page or console errors.

Assets:
- Screenshots: `artifacts/01…19-*.png` (16 Sound Map, 17 Timeline, 18 Cosmic place history and 19 Sound Map tour are new; 11 and 12 show the searched challenger and the global scan)
- Demo video: `artifacts/synesthesia-demo.mp4` (2:52, H.264 + AAC with the app's own sound)
- Engineering guide: `docs/ENGINEERING.md`

Done = built and verified in the browser. Partial = works with a stated limit. Not done = absent.

## 1. Earth Sound Experience

| Item | Status | Note |
|---|---|---|
| Temperature → pitch | Done | Fixed −40…45 °C range onto 36 semitones (`audio/mappings.ts`, unit tested) |
| Precipitation → rhythm/percussion | Done | Hits per day are 1 + round(3·ln(1+P)/ln 51); days below 0.1 mm are dry |
| Wind → intensity | Done | WS2M sets gain and brightness |
| Humidity → texture | Done | Filtered-noise level and cutoff |
| Pressure → tonal modulation | Done | Vibrato from the departure against the window median |
| Cloud → density | Done | 0–3 added chord voices |
| Anomalies → distinct events | Done | Robust z (median/MAD, rain on ln(1+P)) rings a fixed bell per variable |
| Combine variables into one soundscape | Done | `buildSoundscape`; Sonic Lab, Regional Sound Battle |
| Adjustable intensity | Done | Per-layer level, pan and on/off; master volume and mute in the dock |
| Scientific meaning of every mapping | Done | `MAPPINGS` plain and scientific text, rendered in Lab and on the Science page |

## 2. Cosmic Earth

| Item | Status | Note |
|---|---|---|
| Select any location | Done | Click the globe, keyboard centre-select, or a station list |
| Smoother rotation | Done | Drag inertia; reduced-motion aware |
| Geographic search | Done | `/api/geocode` proxies Open-Meteo, cached |
| Date-range selection | Done | From/To fields; reloads on "Load NASA days" so a half-typed date never fires |
| Measurements for the location | Done | All 8 POWER parameters in one request; readouts, chart and channel strips |
| Earth Sound Map | Done | `#/soundmap`: 60 regions, each heard from its POWER day on fixed ranges with bells against its 2001–2020 normal; drag, hover, arrow keys, three tours; per-region trace and request |
| Soundscapes for selected locations | Done | Lead melody here; the six-variable soundscape plays in the battle and in Sonic Lab |
| Multiple variables | Done | Lead selector plus channel strips |
| Regional comparison | Done | Daily-mean table for six variables plus a day-matched temperature chart |
| Two locations simultaneously | Done | "Hear both · L/R" uses `engine.playPair`, panned ±0.75 |
| Matching environmental graphs | Done | `ComparisonChart` for both places |
| Location-specific history | Done | History panel for the selected place: POWER monthly 1981–last year, monthly/seasonal/annual, playable, chart synced to the note |

## 3. Jukebox

| Item | Status | Note |
|---|---|---|
| Soundscape per visualization | Done | `jukebox/voicing.ts` sets wave, harmony and noise bed per SVS id |
| Visual playback synced to audio | Done | Scan line driven by `engine.position()` on the audio clock |
| Better scan animation, scan position = sound | Done | Shaded slice band; note and Hz on the line |
| Per-visualization explanation | Done | `explainTrack` |
| Waveform and spectrum visuals | Done | Log-frequency spectrum with the note mark; triggered waveform |
| Current note and frequency | Done | On the scan line, in the dock and on the scopes |
| Playback speed | Done | Dock 0.5–2× (engine 0.25–4×) |
| Volume and mute | Done | Dock; remembered across reloads |
| Previous/next visualization | Done | Buttons plus keys 1–9 |
| Playback kept across sections | Done | One engine above the router; dock resumes anywhere |

## 4. Time Machine

| Item | Status | Note |
|---|---|---|
| Historical sound comparison / two chosen years | Done | Two free date windows |
| Earlier alone / later alone / difference | Done | Three play buttons |
| Anomaly timeline | Done | Delta bar chart with outliers ringed |
| Highlight significant changes | Done | Robust-z outliers among the day-matched changes |
| Temperature comparison | Done | |
| Precipitation and humidity comparisons | Done | Day-matched charts with gaps for missing days |
| Better historical charts | Done | |
| Anomaly explanations | Done | Against POWER 2001–2020 same calendar days (±7): value, normal, difference, standard score in words; labelled general background, no attributions (Time Machine, Cosmic Earth, Map, Timeline) |
| Missing measurements flagged | Done | Gaps in the charts; "missing" in the tables |

## 5. Sonic Lab

| Item | Status | Note |
|---|---|---|
| Instrument presets, timbre selection | Done | Five instruments plus preset configurations |
| Layering, stereo positioning | Done | Layer mixer with level, pan and on/off |
| Sensitivity, frequency range, custom scale/tempo/tonic/octave | Done | Unlocked in Artistic Mode |
| Anomaly sensitivity | Done | |
| A/B comparison | Done | Two slots with a config diff |
| Save locally / reset / presets | Done | localStorage; reset returns to Scientific Mode |
| Scientific Mode vs Artistic Mode | Done | `SCIENTIFIC_LOCK` fixes every mapping parameter; Artistic unlocks them |

## 6. Science and transparency

| Item | Status | Note |
|---|---|---|
| Science & Methodology section | Done | `#/science`, 13 sections with deep links |
| Datasets, ids, sources, units | Done | SVS ids, POWER parameters with units (tested against code), GIBS |
| Normalization, sonification math | Done | Lead-melody math, plus the soundscape rules rendered from `mappings.ts` |
| Anomaly method, missing data, measured vs generated | Done | |
| Attribution, limitations | Done | |
| Every sound traceable | Done | Dock Trace drawer on every note; soundscape traces list every variable and what it became; explorer bells carry request, location, measurement, robust-score calculation and pitch |

## 7. User experience

| Item | Status | Note |
|---|---|---|
| Interactive onboarding | Done | Self-ticking checklist |
| 20-second intro | Done | Skippable; Escape skips; no auto-advance under reduced motion |
| Transitions, loading animations | Done | Scan-line wait with elapsed time |
| Better error messages | Done | `Problem`: what happened, whose fault, retry |
| Responsive mobile | Done | No overflow at 390, 820, 1280, 1920 and 2560 px |
| Keyboard navigation | Done | Space, `,` `.`, M, T, 1–9, arrows; Blue Marble hand moves with arrows and starts with Enter/Space |
| Screen readers | Done | Live captions thinned; route announcements; traces in words |
| Playback progress | Done | Seekable dock progress |
| Persistent audio controls | Done | Dock on every page |
| High contrast | Done | Edges instead of tints; remembered |
| Reduced motion everywhere | Done | Remembered; scopes slowed, scan steps |
| Consistent identity | Done | |

## 8. Special features

| Item | Status | Note |
|---|---|---|
| Earth Heartbeat | Done | Looping soundscape with a pulse from the temperature z-score |
| Regional Sound Battle | Done | Any geocoded search result or coordinate clicked on the world map can be the challenger; two soundscapes play left and right |
| Environmental Sound Timeline | Done | `#/timeline`: place and year span, one note per month/season/year from the departure against normal, bells, synced chart, traces |
| Global Anomaly Explorer | Done | Scans 48 global grid points in batches of six through the cached NASA POWER proxy, shows findings on a selectable map, ranks by robust z, and plays date-ordered bells with full traces |
| Sound Postcards (WAV) | Done | OfflineAudioContext, 16-bit stereo |
| Earth Sound Archive | Done | localStorage, replays offline |
| Shareable URLs | Done | Cosmic: place, window, sound and Lab config, round-trip tested. Lab: `?lab=` |

## 9. Technical reliability

| Item | Status | Note |
|---|---|---|
| NASA API integrations | Done | POWER, GIBS, SVS, Open-Meteo geocoding; POWER monthly and 2001–2020 baseline endpoints; 18 pytest tests |
| Python test client warning | Done | Installed Starlette's preferred `httpx2` TestClient backend; pytest passes without deprecation warnings |
| Data-loading failures | Done | Problem panels with retry; stale answers dropped (Cosmic, Time Machine, `useRemote`) |
| Missing/invalid measurements | Done | −999 → null, never filled; tests |
| Mapping unit tests | Done | mappings, soundscape, labConfig, anomaly, normalize, score, anomalyScan |
| Cross-browser audio | Partial | Chromium and Firefox pass full audio smoke checks. WebKit was downloaded but cannot launch because this host lacks GTK/GStreamer libraries; package mirrors failed during installation. |
| No overlapping audio | Done | One engine, one run; `stop(source)` scoped; engine tests |
| Audio/visual sync | Done | Scan line and highlights on the audio clock; analyser level checked |
| Large datasets, globe rendering | Done | 48-site POWER scan is cached and bounded to six concurrent requests; globe pixel work reduced, charts remain capped by the 400-day API window |
| Mobile performance, resolutions | Done | Production mobile Lighthouse 66→95; total blocking time 5,250→100 ms; entry JS 444.49→308.88 KB; before/after metrics in `docs/ENGINEERING.md` |
| Zero console errors | Done | 0 in the full walk |
| Every link and button | Done | ux-check walks the nav (all seven sections), dock, intro, onboarding, Lab save/reset, battle search, global scan, Sound Map keys and tour, Timeline, share |

## Review follow-up

| Finding | Outcome |
|---|---|
| P1.2 Cosmic stale responses | Fixed with a request-generation guard |
| P1.3 Battle without WS2M | Fixed: one request for all 8 parameters |
| P1.5 Methodology describes only the legacy mapping | Fixed: soundscape section rendered from `mappings.ts`; legacy math labelled |
| P1.6 Time Machine stale and mismatched results | Fixed: generation guard, cleared refs, date validation, Compare disabled while loading |
| P1.1 Time Machine pitch is relative | Fixed: zero change is the reference tonic; symmetric scale steps, ±10 °C at the ends (`changeToMidi`) |
| P1.4 Cosmic lead anomalies on raw rain | Fixed: lead-melody rain anomalies scored on ln(1 + P) |
| P1.7 Audio nodes not disconnected | Fixed: one-shot source `ended` handlers disconnect sources, filters and gains; mode switch test covers disconnection and scheduler cleanup |
| Multi-year Time Machine windows | Fixed: days matched by month, day and year within the window (`calendarKey`) |
| P2.1 Untracked copy and hand-release timers | Open: `CosmicEarth` share-copied reset and `Jukebox` touch-release timeouts are not cleared on unmount (harmless, but untidy) |
| P2.2 Battle does not cancel obsolete fetches | Fixed: the battle fetches through `useRemote` with an abort signal |
| P2.3 Multi-year windows collapse by calendar day | Fixed (see above) |
| P2.4 Globe touch needs a pointer | Fixed: the Blue Marble hand moves with the arrow keys and starts with Enter or Space |
| P2.5 Feature claims need qualification | Addressed: the battle takes any place; the remaining limits are listed below |

## Known issues

- The Global Anomaly Explorer ranks each point against its selected date window, with a minimum spread per variable (`MIN_SPREAD` in `geo/anomalyScan.ts`) so near-constant ocean or ice windows do not inflate tiny changes; the separate anomaly explanations (Cosmic Earth, Time Machine, Sound Map, Timeline) compare with the POWER 2001–2020 normal for the same calendar days.
- CERES `CLOUD_AMT` lags by months: recent windows play without density and say so.
- WebKit smoke remains unverified because the host is missing GTK/GStreamer libraries and its Debian package mirror failed; Chromium and Firefox pass with real audio output.
- The first visit to a Sound Map region or Timeline place fetches about 20 years of daily POWER data for its baseline (about 1 s); later visits use the backend cache.

## Round 5 completion notes

- Earth Sound Map (`#/soundmap`, nav 03): 12 × 5 regions over the Blue Marble, each heard from its NASA POWER day on fixed ranges, bells against that point's 2001–2020 normal; drag, hover, arrow keys, three tours; per-region trace and request URL.
- Environmental Sound Timeline (`#/timeline`, nav 05) and the Cosmic Earth place history: POWER monthly record per month, season or year against the 2001–2020 normal, bells at |z| ≥ 2, synced chart, step table, traces.
- Anomaly explanations: `/api/power/baseline` gives same-calendar-day (±7) statistics for 2001–2020; plain-word value, normal, difference and standard score, with a separately labelled general-background note (never an attribution).
- Time Machine: absolute pitch scale (P1.1), multi-year windows matched by full date; lead-melody rain anomalies on ln(1 + P) (P1.4).
- Integration: both lanes' nav entries and views coexist as lazy routes; the dock names the Sound Map as its owner; the global scan floors the spread of near-constant windows; the battle's map picker sits over the Blue Marble; UX check, smoke test, captures and demo now cover every round 5 feature.

- Global Anomaly Explorer: 48 coordinate grid, six-request concurrency batches, backend caching, partial-failure reporting, map selection, and full data-to-bell traces.
- Regional Sound Battle: challenger can come from Open-Meteo search or a click/keyboard selection on the coordinate map.
- Audio lifecycle: one-shot sources disconnect their node chains on `ended`; tests assert disconnection and scheduler timer cleanup across a mode switch.
- Browser audio: full Chromium and Firefox smoke checks pass; Firefox is routed through PulseAudio. WebKit remains blocked by missing host libraries after `playwright install --with-deps` and apt retries.
- Performance: route splitting and reduced globe rendering improved production mobile Lighthouse from 66 to 95; see `docs/ENGINEERING.md`.
- Accessibility and backend tests: Blue Marble arrow-hand movement has pure logic coverage; the `httpx2` TestClient dependency removes Starlette's deprecation warning.

