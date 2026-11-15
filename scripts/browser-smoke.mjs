// Cross-browser smoke test: every page loads; the landing call to action, the
// case study, a Listening Test clip, the Jukebox and a Sonic Lab soundscape sound
// (the analyser level rises); Anomalies lands on the global explorer; the dock
// pauses; and the console stays clean.
// Usage: node scripts/browser-smoke.mjs firefox|webkit|chromium [base] [--no-audio]
// --no-audio checks pages and the console only. For Firefox audio, start a
// PulseAudio null sink before this script so Web Audio has an output device.
import { chromium, firefox, webkit } from "playwright";
import { launchOptions } from "./capture-lib.mjs";

const engines = { chromium, firefox, webkit };
const name = process.argv[2] ?? "firefox";
const base = process.argv[3] ?? "http://127.0.0.1:4317";
const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} [${name}] ${message}`);
  if (!ok) problems.push(message);
};

const options =
  name === "firefox"
    ? { firefoxUserPrefs: { "media.autoplay.default": 0, "media.autoplay.block-webaudio": false, "media.cubeb.backend": "pulse" } }
    : name === "chromium"
      ? launchOptions()
      : {};
const browser = await engines[name].launch(options);
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(String(error)));
const level = () => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")) || 0);
const peak = async (ms) => {
  let best = 0;
  for (let waited = 0; waited < ms; waited += 150) {
    best = Math.max(best, await level());
    await page.waitForTimeout(150);
  }
  return best;
};

for (const route of ["#/", "#/listen?region=indian-ocean", "#/case", "#/test", "#/jukebox", "#/cosmic", "#/soundmap", "#/time", "#/timeline", "#/lab", "#/science"]) {
  await page.goto(`${base}/${route}`);
  await page.waitForTimeout(1200);
  check((await page.locator("main").count()) === 1, `${route} renders`);
}

if (process.argv.includes("--no-audio")) {
  check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem(s)` : "\nall checks passed (audio not exercised)");
  process.exit(problems.length ? 1 : 0);
}

// The three flagship entry points.
await page.goto(`${base}/#/`);
await page.waitForTimeout(800);
await page.getByRole("link", { name: /Try the Indian Ocean/ }).click();
await page.waitForFunction(() => document.querySelector(".listen-player .play")?.getAttribute("aria-pressed") === "true", null, { timeout: 90000 });
check((await peak(2500)) > 0.01, "landing call to action: Indian Ocean output reaches the analyser");
await page.getByRole("navigation", { name: "Primary sections" }).getByRole("link", { name: "Anomalies" }).click();
await page.waitForFunction(() => document.activeElement?.classList.contains("anomaly-explorer"), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500); // the page above keeps loading; the landing follows it
check(await page.evaluate(() => { const top = document.querySelector(".anomaly-explorer")?.getBoundingClientRect().top ?? -1; return top >= 0 && top < 200; }), "Anomalies lands on the global explorer");

await page.goto(`${base}/#/case`);
await page.locator(".case-step button").first().waitFor({ timeout: 120000 });
await page.locator(".case-step").nth(1).getByRole("button").click();
check((await peak(2500)) > 0.01, "case study event piece reaches the analyser");

await page.goto(`${base}/#/test`);
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: /Load the clips/ }).click();
await page.getByRole("button", { name: /Play clip 1/ }).waitFor({ timeout: 180000 });
await page.getByRole("button", { name: /Play clip 1/ }).click();
check((await peak(2500)) > 0.01, "Listening Test practice clip reaches the analyser");

await page.goto(`${base}/#/jukebox`);
const play = page.getByRole("button", { name: "Play this frame" });
await play.waitFor({ timeout: 60000 });
await play.click();
check((await peak(2500)) > 0.01, "Jukebox output reaches the analyser");
await page.getByRole("button", { name: "Pause", exact: true }).first().click();
await page.waitForTimeout(400);
check((await page.locator(".dock").getAttribute("data-status")) === "paused", "dock shows paused");

await page.goto(`${base}/#/lab`);
const labPlay = page.locator(".lab-transport button.play, button:has-text('Play')").first();
await labPlay.waitFor({ timeout: 60000 });
await page.waitForTimeout(3000);
await labPlay.click();
check((await peak(3000)) > 0.005, "Sonic Lab soundscape reaches the analyser");

check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : "\nall checks passed");
process.exit(problems.length ? 1 : 0);
