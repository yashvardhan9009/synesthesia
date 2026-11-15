# Listening Test protocol

## Research question and hypothesis

Can listeners identify which of two real NASA POWER soundscapes contains a temperature event that departs from its same-calendar-day 2001–2020 normal? H1: listener sensitivity is above chance, expressed as d′ > 0. The primary outcome is each participant’s d′ across test trials. This is a protocol; no human results are reported here.

## Design

The browser presents two 30-day clips per trial in a two-alternative forced-choice task. One clip contains at least one unusual temperature episode and the other stays below the normal-variation threshold. Participants hear each clip in either seeded order, then choose clip 1 or 2. Two practice trials provide correctness feedback; ten test trials do not. While the pools last (they do: 24 of each against 12 pairs), every pair in a session uses clips the participant has not heard before in that session. An optional 1–4 confidence response and the reaction time from the end of the most recently finished clip are recorded. During a trial the clips are ear-only: no place, date, chart, measurement, note name, trace or audio scope is shown or announced (the clip soundscapes are stripped of those fields and the audio dock hides its note readout, trace drawer and scopes). Keyboard support: `A`/`B` play clip 1 or 2, `R` replays the last clip, `1`/`2` answer once both clips have been heard, `Enter` continues after practice feedback; every control is also a focusable button.

## Stimuli and selection

Every stimulus is fetched from NASA POWER through the app’s cached backend proxy. The fixed, curated candidate list (`frontend/src/validation/stimuli.ts`) contains 48 30-day windows at 16 places across climates (New Delhi, Manaus, Nuuk, Cape Town, Tamanrasset, Moscow, Chicago, Sydney, Lagos, Buenos Aires, Ulaanbaatar, Reykjavik, Phoenix, Paris, Nairobi and Tokyo), starting in years from 2001 to 2025. The list was vetted by `scripts/vet-stimuli.mjs`, which scored every month-start window in ten years per place against the real record and kept 24 windows clearly above the unusual cutoff (z ≥ 2.6; 12 warm and 12 cool events) and 24 clearly below the normal cutoff (z < 1.25), at most three per place. The vetting only chooses which windows to fetch. Each candidate is scored against the NASA POWER `/api/power/baseline` endpoint’s same-calendar-day 2001–2020 temperature percentiles. The robust spread estimate is `(P90 − P10) / 2.563`, and the daily robust score is `(temperature − P50) / robust spread`. The stimulus feature is the largest absolute five-day mean of those daily scores; missing values break a five-day window and are never filled. An unusual clip has a maximum absolute five-day score of at least 2.5. A normal clip has a maximum below 1.5. Candidate windows between these cutoffs are not used.

The app recomputes every classification and the answer key from the retrieved data at runtime, with the same function, and displays no result numbers during the test; a window that lands between the cutoffs is not used. On the local cached backend all 48 windows qualified as vetted (24 unusual, 24 normal). The curated candidate dates and a participant-code-derived seed make the order reproducible; the seed is saved with the session. This instrument currently tests temperature events through the complete multi-variable scientific soundscape, so rain, wind and humidity remain audible covariates. It does not establish which layer caused a response.

## Procedure and recording

1. Read the consent statement and optionally enter a participant code that contains no personal information.
2. Load the curated NASA POWER clips and listen to two practice pairs.
3. Complete ten test pairs. Replay is allowed and is not treated as a new trial.
4. Review the exploratory session summary and export CSV or JSON if desired.

Responses are stored in this browser’s local storage. No name, email, demographic details, IP address or free-text response is collected by this page. The participant can clear browser storage to remove a session. Exports include participant code, seed, place, dates, computed scores, answer key, response, reaction time and confidence.

## Sample size and analysis plan

The planned sample is 32 complete participants. For a one-sample, two-sided t-test of participant-level d′ against zero, this gives approximately 80% power at α = .05 for a moderate standardized effect of d = 0.5 (assumptions: independent participants, approximately normal participant-level d′, and a true mean d′ of 0.5 standard deviations above zero). Recruit 38 participants to allow roughly 15% incomplete or excluded sessions. The effect assumption is a planning value, not a measured result. If participant-level d′ is strongly non-normal, report the distribution and use a preregistered one-sample permutation or Wilcoxon sensitivity analysis alongside the primary test.

Calculate per participant, over the ten test pairs: pair accuracy, hit rate, false-alarm rate and d′. Convert each clip choice into one signal-present response and one signal-absent response. Apply the log-linear correction `(count + 0.5) / (N + 1)` to hit and false-alarm rates before the inverse-normal transform. Report mean response time and confidence descriptively, with test trials only. Report results by place and event direction as exploratory breakdowns. The primary test is the one-sample t-test of participant d′ against zero, with a 95% confidence interval and effect size.

## Exclusion criteria

Exclude a session from the primary analysis if it has fewer than eight valid test responses (of ten), the participant reports that audio did not play, or stored trial records are structurally incomplete. Exclude practice trials from all primary outcomes. Do not exclude participants based on their score or whether they support H1. Report how many sessions were excluded and each reason after the study.

## Ethics and consent

Participation is optional. The page asks the participant to confirm adulthood, explains local storage and reminds them not to enter a name or contact details. Stop at any point by leaving the page. Before recruiting for a formal study, the team should obtain any review or approval required by its host institution and present an accessible contact and data-retention notice. This prototype has no remote submission endpoint; participants must export and share a file deliberately for researchers to receive it.

## Limitations

This is a small, convenience-sample listening task, not evidence of general accessibility or scientific validity by itself. Stimuli are a fixed set of 48 windows (16 places) and may differ in more than one meteorological layer. Their baseline is a fixed 2001–2020 period; NASA POWER values are gridded estimates, not local station observations. The five-day averaging rule and thresholds define this task’s stimulus labels, not universal event definitions. Browser speakers, headphones, hearing ability, volume and playback environment vary. Simulation results are a mapping sanity check only and are not human data.

## Simulated-observer check

Run `node --experimental-strip-types frontend/scripts/simulated-observer.mjs` with the backend available on `SYN_API_PORT` (default 8741). The script requests the same curated data, generates clips with `buildSoundscape`, derives noisy deviations from the actual mapped pitch track against a baseline-mapped pitch track, and reports synthetic accuracy and d′. Its output is recorded in [`simulated-observer.md`](simulated-observer.md) and [`simulated-observer.json`](simulated-observer.json), explicitly marked as simulation, not human data. The current run uses the 48-window pool (24 unusual, 24 normal) and 500 simulated trials.
