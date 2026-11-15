# SYNESTHESIA — submission text

**Challenge:** The Earth Information Jukebox, NASA Space Apps Challenge 2026  
**Not an official NASA product.**

## What it is

SYNESTHESIA turns real NASA Earth measurements into sound you can trace back to its source. It is built around three experiences, **Hear Earth**, **Travel through environmental history** and **Discover global anomalies through sound**, joined by **Earth Listening Intelligence**, which plays a region's record and finds, in computed numbers, what was unusual. A case study and a Listening Test show what the sound is good for and how to test whether people can hear it. The nine Earth Information Center visualizations named on the challenge resources tab remain playable in the Jukebox.

Someone can pick an EIC frame and hear it, drag a hand across that frame to play the step under the pointer, or pick a place and a month and hear NASA POWER. Dragging the Blue Marble globe, with Hand switched on, plays the brightness of the pixel under the pointer. That pixel sound is the picture, not a temperature, and the caption says so. A live caption names the value and the note. The chart marker, the table row, and the frame line stay on the step that is sounding. Outliers are marked in sound and in a table, not by color alone.

### Round 4 (15 November 2026)

- **Earth soundscape**: one NASA POWER window becomes a single soundscape, a layer per variable:
  - temperature is pitch, rain is percussion, wind is intensity;
  - humidity is a noise texture, pressure is vibrato, cloud is added voices;
  - anomalies ring a bell.

  Sonic Lab plays it in a reproducible Scientific Mode or an open Artistic Mode, with presets, layer mix and stereo pan, A/B comparison, saved configurations, Earth Heartbeat, WAV postcards and a local archive.
- **Cosmic Earth**:
  - place search, date ranges and all eight POWER channels;
  - a Regional Sound Battle that plays two places at once, left and right;
  - a Global Anomaly Explorer that ranks unusual days across a 48-point global grid and plays them as a timeline;
  - shareable links that reopen the same place, window and sound.
- **Time Machine**: compares two chosen windows. You can hear the earlier one alone, the later one alone, or the difference, with temperature, rain and humidity charts.
- **App-wide**:
  - a persistent dock (play, seek, speed, volume, mute) keeps sound playing across sections;
  - a Trace drawer shows, for the sounding note, the NASA measurement it came from and what was generated;
  - a Science & Methodology page renders the mapping rules from the same module the audio code runs.

### Round 5 (15 November 2026)

- **Earth Sound Map**: the globe as 60 regions, each heard from its NASA POWER day on fixed ranges, with bells where a variable is unusual against that point's 2001–2020 normal. Drag, hover, arrow keys or one of three tours.
- **Environmental Sound Timeline** and a **place history** in Cosmic Earth: a place's POWER monthly record, one note per month, season or year against the 2001–2020 normal, with a synced chart and traces.
- **Anomaly explanations**: what was unusual and by how much against the same calendar days in 2001–2020, in plain words, with clearly labelled general background that never claims a cause.
- **Regional Sound Battle** takes any searched or clicked place; the **Global Anomaly Explorer** covers the whole globe.
- Time Machine pitch is now absolute (no change is always the same note), multi-year windows keep their years, audio nodes are released after each note, and the app loads sections on demand (mobile Lighthouse 66 → 95).

### Round 6 (15 November 2026)

- **Focus**: the landing page has one call to action, **Try the Indian Ocean**, which opens Earth Listening Intelligence already playing (the sound starts inside the click). The three experiences are the primary navigation (Hear Earth, History, Anomalies); Listening Intelligence is presented as the bridge between them; everything else is under a keyboard-operable **More** menu. The Anomalies tab lands on the Global Anomaly Explorer with focus.
- **Earth Listening Intelligence** (`#/listen`): a region (preset, searched place or map box) is sampled as a 9–16 point NASA POWER monthly grid, 1981 to the last complete year, area-averaged with cos-latitude weights. Each month is compared with its 2001–2020 normal (robust z, ranks, runs, records, OLS trend with Mann–Kendall check, spatial contrast). Ranked findings on unusual temperature, rainfall changes, unusual wind and historical deviations are fixed templates filled with these numbers; each links to its evidence, its grid points, its POWER requests and its moment in the soundscape.
- **Case study** (`#/case`): the region record is searched at runtime for its strongest compound heat-and-dryness event (temperature above, rainfall and humidity below normal, each |robust z| ≥ 2 in the peak month), and the quietest same-calendar period in 2001–2020 is chosen as the reference. Three steps: hear the reference, hear the event, reveal four synced anomaly charts beside the one soundscape that carries all four. On the Amazon preset the search finds August–November 2024; where the test is not met the page says so.
- **Listening Test** (`#/test`): 48 vetted 30-day NASA POWER windows at 16 places across climates, 2001–2025 (24 unusual, 24 normal); each session has 2 practice and 10 test pairs of distinct clips. Trials are ear-only and keyboard-operable.
- **Performance**: API responses are gzipped (a region drops from 174 KB to 57 KB).

## Validation

The Listening Test is a two-clip, ear-only perception task built from real NASA POWER 30-day records and same-calendar 2001–2020 baselines. The candidate pool is 48 windows at 16 places (2001–2025), vetted against the real record by `scripts/vet-stimuli.mjs`; the app re-classifies every clip from the data it fetches, so trial labels and answer keys are computed from a five-day robust temperature departure (unusual at |z| ≥ 2.5, normal below 1.5), not assigned by hand. A session is 2 practice and 10 test pairs, each clip heard once. It includes practice, confidence ratings, response times, local session storage and CSV/JSON export. The study design, planned analysis and limitations are in [the validation protocol](validation-protocol.md).

The simulated-observer check runs the same NASA POWER stimuli through the Scientific Mode soundscape mapping, then applies a noisy pitch-deviation detector. It is a mapping sanity check only, labelled **Simulation, not human data** in [its report](simulated-observer.md). It does not stand in for listeners. The planned study is 32 complete participants (38 recruited), with participant-level d′ tested against zero.

**Human study status:** no human results yet. The study is designed and pre-specified in the validation protocol; the simulated-observer check above is not human data.

## What it looks like

SYNESTHESIA is designed as a scientific instrument rather than a dashboard: an observatory console with the restraint of NASA mission graphics and the controls of a synthesizer. The palette is deep ocean and space, with two accents taken from Earth data: sea-surface cyan for the signal (the trace, the playhead, the live sound) and thermal amber for anomalies, warming and the transport. Instrument Serif carries the titles; IBM Plex Mono carries every label, number and readout; both are bundled with the app, so it works offline.

The landing page is a Blue Marble globe inside a setting circle whose outer ring is the live spectrum. Pressing and dragging across the planet plays the brightness of the picture under the pointer, so Earth and sound are connected in the first seconds. A dock along the bottom of every screen holds the live caption between a waveform and a spectrum drawn from the real audio output; when nothing sounds they are flat. Under each jukebox picture a strip of bars shows the measured value of every step, with outliers in amber. Cosmic Earth draws the lead POWER series with its anomalies and, beneath it, every other POWER channel labelled with what it does to the sound. Time Machine shows the median change as one large number above a diverging bar chart. Sonic Lab shows the scale as a keyboard.

Motion is limited to mode transitions, staggered reveals and the playhead. Reduce motion, or the operating-system setting, stops all of it, including the turning globes. High contrast switches to pure black, white, yellow and cyan. Every control is reachable from the keyboard with a visible focus ring, and text meets WCAG AA contrast.

## How the sound is made

The jukebox measures the official SVS image or a sample of its frames: luminance, warmth (red minus blue), and contrast. Each frame’s page says which of those leads the pitch, and why. Stills are read west to east. Three movies were small enough to sample (ECCO2 currents, DYAMOND carbon dioxide, GEDI forest height). The Perpetual Ocean, air-quality, lightning, and atmospheric-river masters are too large to pull in a demo; those tracks say so and scan the official preview still instead.

Cosmic Earth and Time Machine do not use pixels. They request the NASA POWER daily point service and play those numbers. Time Machine aligns two windows on month and day and plays the temperature change. POWER’s fill value, −999, is shown as missing.

Scaled values sit on a musical scale, pentatonic by default, so the result is listenable without hiding the data. Sonic Lab is its own mode: scale, tonic, range, tempo, anomaly threshold, which picture measurement leads a jukebox frame, and which POWER parameter leads Cosmic Earth. Its scale check is labelled as the instrument, not Earth data. Each mode has a short table of what is measured and what that becomes in sound. Anomalies are a robust z-score (median and median absolute deviation) on the raw values. The threshold starts at 2.5. Time Machine’s change for a day is the later temperature minus the earlier one, and the reported median is the median of those raw differences. Tests check both against hand-computed numbers. Notes fade out instead of being cut, and a compressor keeps stacked voices from clipping.

## Why it meets the challenge

The desired outcome is a way to select an EIC visualization and hear a soundscape made from it. The jukebox is that, for every visualization the resources tab names, with the SVS page one click away. Accessibility is part of the challenge, so the sound is also a sentence, the page works from the keyboard, and contrast and motion can be turned up or down.

## How to run

See the repository README. `pnpm install`, create the Python virtualenv, `pnpm dev`. The app is http://127.0.0.1:4317 (start at `#/listen?region=indian-ocean`) and the data proxy is http://127.0.0.1:8741. `pnpm test` runs the synthetic unit tests.

## How AI tools were used

AI coding assistants helped with parts of the code, testing and documentation, while the idea, design direction, data choices and final decisions were the team's.
