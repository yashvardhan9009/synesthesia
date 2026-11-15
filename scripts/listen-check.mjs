// Flagship check against real NASA POWER data. Earth Listening Intelligence:
// the landing call to action opens #/listen?region=indian-ocean already
// playing, a finding seeks the audio and is highlighted while it plays, a
// custom box loads from the map, nothing overflows at 390 px or 1440 px. The
// case study finds its event, plays both pieces and reveals four synced charts
// beside the sound legend. The Listening Test plays an ear-only practice clip.
// Usage: node scripts/listen-check.mjs [base] [shot-directory]
import { chromium } from "playwright";
import { launchOptions } from "./capture-lib.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:4317";
const shots = process.argv[3] ?? null;
const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) problems.push(message);
};

const browser = await chromium.launch(launchOptions());
const errors = [];
const open = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  return page;
};
// Overflow of the listening page itself: the widest element inside it against the viewport
// (content inside a horizontally scrolling table box scrolls, so it does not count).
const overflow = (page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return Math.max(0, ...[...document.querySelectorAll(".listen, .listen *")].filter((el) => !el.parentElement?.closest(".table-scroll")).map((el) => el.getBoundingClientRect().right - width));
  });

const page = await open(1440, 900);
const level = () => page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")) || 0);
const peak = async (ms) => {
  let best = 0;
  for (let waited = 0; waited < ms; waited += 150) {
    best = Math.max(best, await level());
    await page.waitForTimeout(150);
  }
  return best;
};

// The landing call to action starts the sound inside its click.
await page.goto(`${base}/#/`);
await page.waitForTimeout(800);
const started = Date.now();
await page.getByRole("link", { name: /Try the Indian Ocean/ }).click();
await page.waitForFunction(() => document.querySelector(".listen-player .play")?.getAttribute("aria-pressed") === "true", null, { timeout: 90000 });
check(page.url().endsWith("#/listen?region=indian-ocean"), "the call to action opens the Indian Ocean");
check(true, `Indian Ocean playing ${((Date.now() - started) / 1000).toFixed(1)} s after the click`);
check((await peak(2500)) > 0.01, "the landing call to action's sound reaches the analyser");
await page.locator(".listen-player .play").click();
const hear = page.locator(".listen-player .play");
await hear.waitFor({ timeout: 90000 });
const findings = page.locator(".finding");
check((await findings.count()) >= 4, `findings listed: ${await findings.count()}`);
const summary = await page.locator(".listen-summary").innerText();
check(/What the measurements say/i.test(summary) && /grid points/.test(summary), "summary built from the measurements");
check((await page.getByText("General background (not an attribution)").count()) === 1, "general background is labelled");
if (shots) await page.screenshot({ path: `${shots}/listen-1440.png`, fullPage: true });
check((await overflow(page)) <= 0, "no horizontal overflow of the page at 1440 px");

await hear.click();
check((await peak(2500)) > 0.01, "the soundscape reaches the analyser");

// A finding with a timestamp: seek there, and it is highlighted while it plays.
const target = page.locator(".finding").filter({ has: page.locator(".finding-hear", { hasText: "Hear it ·" }) }).first();
const label = await target.locator(".finding-hear").innerText();
await target.locator(".finding-hear").click();
await page.waitForTimeout(700);
check((await target.getAttribute("data-current")) !== null, `finding highlighted while heard (${label.trim()})`);
const live = await page.locator(".listen .sr-only[aria-live]").innerText();
check(live.startsWith("Now sounding:"), "live region announces the current finding");
await target.locator("summary").first().click();
check((await target.locator("table tbody tr").count()) >= 1, "evidence table opens");
await target.locator(".finding-urls summary").click();
check((await target.locator(".finding-urls a[href^='https://power.larc.nasa.gov/']").count()) >= 1, "NASA POWER request URLs listed");
await page.getByRole("button", { name: "Pause", exact: false }).first().click();

// Full record by season.
await page.getByRole("button", { name: /by season/ }).click();
await page.waitForTimeout(300);
check(/180 notes/.test(await page.locator(".listen-player .play").innerText()), "full record by season has 180 notes");

// Another preset and a box from the map (keyboard).
await page.getByRole("button", { name: "Sahel", exact: true }).click();
await page.getByRole("button", { name: /^Hear Sahel/ }).waitFor({ timeout: 90000 });
check(page.url().includes("region=sahel"), "the link follows the chosen region");
const map = page.locator(".listen-map svg");
await map.focus();
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("Enter");
await page.getByRole("button", { name: /^Hear Box at/ }).waitFor({ timeout: 120000 });
check(page.url().includes("box="), "a box built from the map keyboard loads");

// Case study: the event is searched, both pieces play, the reveal shows four synced charts and the sound legend.
await page.goto(`${base}/#/case`);
await page.locator(".case-verdict").waitFor({ timeout: 120000 });
const verdict = await page.locator(".case-verdict").innerText();
check(/Event found|No compound event/.test(verdict), `case study verdict: ${verdict}`);
await page.locator(".case-step").nth(0).getByRole("button").click();
check((await peak(2500)) > 0.01, "the case study's reference piece reaches the analyser");
await page.locator(".case-step").nth(1).getByRole("button").click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Reveal" }).click();
check((await page.locator(".case-mini-chart").count()) === 4, "four charts revealed: temperature, rainfall, humidity, wind");
check((await page.locator(".case-legend tbody tr").count()) === 5, "the sound legend names each measurement's sound");
await page.waitForTimeout(800);
check((await page.locator(".case-mini-chart .now-line").count()) === 4, "the playhead moves on all four charts");
const headline = await page.locator(".case-headline").innerText();
check(/robust z|robust standard deviations/.test(headline), `headline filled from computed numbers: ${headline.slice(0, 90)}…`);
check((await page.getByText("General background (not an attribution)").count()) === 1, "case background is labelled");
check((await page.locator(".case-hear a[href^='#/listen?region=']").count()) === 1, "case links to its region in Listening Intelligence");
check((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "case study: no overflow at 1440 px");
if (shots) await page.screenshot({ path: `${shots}/case-1440.png`, fullPage: true });
await page.locator(".dock").getByRole("button", { name: "Pause", exact: true }).click().catch(() => {});

// Listening Test: a practice trial is ear-only and sounds.
await page.goto(`${base}/#/test`);
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: /Load the clips/ }).click();
await page.getByRole("heading", { name: /Which clip/ }).waitFor({ timeout: 180000 });
const footnote = await page.locator(".validation-footnote").innerText();
const pool = footnote.match(/(\d+) unusual and (\d+) normal/);
check(pool && Number(pool[1]) >= 12 && Number(pool[2]) >= 12, `session pool from the fetched data: ${pool?.[0]}`);
await page.keyboard.press("a");
check((await peak(2500)) > 0.01, "a practice clip reaches the analyser (key A)");
const trialText = await page.locator(".ear-trial").innerText();
check(!/\d{4}-\d{2}|°C|mm\/day|NASA POWER/.test(trialText) && !(await page.locator(".dock-note").isVisible()), "the trial shows no place, date, value or note name");
await page.waitForFunction(() => document.querySelectorAll(".clip-button")[0]?.textContent?.includes("Heard"), null, { timeout: 60000 });
await page.keyboard.press("b");
await page.waitForFunction(() => document.querySelectorAll(".clip-button")[1]?.textContent?.includes("Heard"), null, { timeout: 60000 });
await page.keyboard.press("1");
check((await page.locator(".study-feedback").count()) === 1, "practice answers by key and gets feedback");

const phone = await open(390, 844);
await phone.goto(`${base}/#/listen?region=arctic`);
await phone.getByRole("button", { name: /^Hear Arctic/ }).waitFor({ timeout: 90000 });
await phone.waitForTimeout(500);
check((await overflow(phone)) <= 0, "no horizontal overflow at 390 px");
await phone.locator(".finding summary").first().click();
check((await overflow(phone)) <= 0, "no overflow at 390 px with evidence open");
if (shots) await phone.screenshot({ path: `${shots}/listen-390.png`, fullPage: true });

check(errors.length === 0, `console errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : "\nall checks passed");
process.exit(problems.length ? 1 : 0);
