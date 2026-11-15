// Screenshots of the app as it is presented: the three experiences, Earth
// Listening Intelligence, the case study, the Listening Test, and the
// supporting tools, in a real headless Chrome against real NASA POWER data.
// Usage: pnpm dev (in another shell), then: node scripts/capture.mjs
// Writes 1440x900 PNGs (and one 390 px phone shot) to ./artifacts and fails loudly on page errors.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { cursorScript, dragAcross, hideCursor, launchOptions } from "./capture-lib.mjs";

const URL = process.env.APP_URL ?? `http://127.0.0.1:${process.env.SYN_WEB_PORT ?? 4317}`;
const OUT = "artifacts";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript(cursorScript);
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);
const problems = [];
const started = Date.now();
const rendererMb = () => {
  try {
    const rows = execSync("ps -eo rss,args", { encoding: "utf8" }).split("\n").filter((row) => row.includes("--type=renderer"));
    return rows.map((row) => Math.round(Number(row.trim().split(/\s+/)[0]) / 1024)).sort((a, b) => b - a).slice(0, 3).join("/");
  } catch {
    return "?";
  }
};
const step = async (label) => {
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6)).catch(() => "?");
  console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${label} (JS heap ${heap} MB, renderer RSS ${rendererMb()} MB)`);
};
// A crash or close must end the run with a reason, not a later "Target page closed".
page.on("crash", () => {
  console.error(`renderer crashed (renderer RSS ${rendererMb()} MB)`);
  process.exit(2);
});
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) console.log(`  navigated: ${frame.url()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});

const shot = async (name, { cursor = false, fullPage = false } = {}) => {
  if (!cursor) await hideCursor(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  await step(`saved ${OUT}/${name}.png`);
};
// Element shots scroll the page; hide the sticky masthead and dock so they do not cover the element.
const CHROME_HIDDEN = "header.console, .dock { visibility: hidden !important; }";
const elementShot = async (locator, name) => {
  await locator.screenshot({ path: `${OUT}/${name}.png`, style: CHROME_HIDDEN });
  await step(`saved ${OUT}/${name}.png`);
};
const pause = () => page.locator(".dock").getByRole("button", { name: "Pause", exact: true }).click().catch(() => {});
const scrollUnderHeader = async (locator, extra = 16) => {
  await locator.evaluate((element, gap) => {
    const header = document.querySelector(".console");
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight ?? 0) - gap, behavior: "instant" });
  }, extra);
  await page.waitForTimeout(800);
};
const nav = () => page.getByRole("navigation", { name: "Primary sections" });
const more = async (name) => {
  await nav().getByRole("button", { name: "More" }).click();
  await nav().getByRole("link", { name: new RegExp(`^${name}`) }).click();
};

// 01 Landing: one call to action, the three experiences and the bridge.
await page.goto(URL);
await page.waitForTimeout(2600);
await shot("01-landing");

// 20 Landing: a hand across the Blue Marble.
const hero = page.locator(".hero-canvas");
const box = await hero.boundingBox();
await dragAcross(page, box.x + box.width * 0.42, box.y + box.height * 0.62, box.x + box.width * 0.68, box.y + box.height * 0.42, { hold: true });
await shot("20-landing-hand", { cursor: true });
await page.mouse.up();

// 02 Earth Listening Intelligence from the call to action, playing.
await page.getByRole("link", { name: /Try the Indian Ocean/ }).click();
await page.waitForFunction(() => document.querySelector(".listen-player .play")?.getAttribute("aria-pressed") === "true", null, { timeout: 90000 });
await page.waitForTimeout(5000);
await scrollUnderHeader(page.locator(".listen-player"), 8);
await page.waitForTimeout(400);
await shot("02-listen-indian-ocean");

// 03 A finding: click to hear it, its evidence open.
const finding = page.locator(".finding").filter({ has: page.locator(".finding-hear", { hasText: "Hear it ·" }) }).first();
await finding.locator(".finding-hear").click();
await page.waitForTimeout(1200);
await finding.locator("summary").first().click();
await page.waitForTimeout(300);
await scrollUnderHeader(finding, 120);
await page.waitForTimeout(400);
await shot("03-listen-finding-evidence");
await pause();

// 04 Case study: the reveal, four charts beside one soundscape.
await more("Case study");
await page.locator(".case-step button").first().waitFor({ timeout: 120000 });
await page.locator(".case-step").nth(1).getByRole("button").click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Reveal" }).click();
await page.waitForTimeout(3500);
await scrollUnderHeader(page.locator(".case-compare"), 12);
await page.waitForTimeout(300);
await shot("04-case-study");
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot("04b-case-study-steps");
await pause();

// 05 and 06 Listening Test: a trial screen, then a full session's summary.
await more("Listening Test");
await page.getByRole("checkbox").check();
await page.getByLabel(/Participant code/).fill("capture-demo");
await page.getByRole("button", { name: /Load the clips/ }).click();
await page.getByRole("heading", { name: /Which clip/ }).waitFor({ timeout: 180000 });
await page.getByLabel("Playback speed").selectOption("2");
await page.locator("#trial-heading").focus(); // the speed menu keeps focus otherwise, and the trial keys ignore a focused select
await page.keyboard.press("a");
await page.waitForTimeout(1500);
await scrollUnderHeader(page.locator(".ear-trial"), 12);
await shot("05-listening-test");
// Hear a clip to its end (keys A and B, with one retry if the clip was cut short).
const hearClip = async (index) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.keyboard.press(index === 0 ? "a" : "b");
    const done = await page
      .waitForFunction((i) => document.querySelectorAll(".clip-button")[i]?.textContent?.includes("Heard"), index, { timeout: 40000 })
      .then(() => true, () => false);
    if (done) return;
  }
  throw new Error(`clip ${index + 1} never finished`);
};
for (let trial = 0; trial < 12; trial += 1) {
  if (trial > 0 || !(await page.evaluate(() => document.querySelectorAll(".clip-button")[0]?.textContent?.includes("Heard")))) {
    if (trial > 0) await hearClip(0);
    else await page.waitForFunction(() => document.querySelectorAll(".clip-button")[0]?.textContent?.includes("Heard"), null, { timeout: 40000 }).catch(() => hearClip(0));
  }
  await hearClip(1);
  await page.getByRole("button", { name: String(1 + (trial % 4)), exact: true }).click();
  await page.keyboard.press(trial % 3 === 0 ? "2" : "1");
  if (trial < 2) {
    await page.locator(".study-feedback").waitFor();
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(300);
  await step(`trial ${trial + 1} answered`);
}
await page.locator(".study-results").waitFor({ timeout: 30000 });
await page.locator(".study-results details summary").click();
await scrollUnderHeader(page.locator(".study-results"), 12);
await page.waitForTimeout(300);
await shot("06-listening-test-results");
await page.getByLabel("Playback speed").selectOption("1");

// 07 Global anomalies: the Anomalies tab lands on the explorer; scan and hear the outliers.
await nav().getByRole("link", { name: "Anomalies" }).click();
await page.getByRole("button", { name: /Scan the globe/ }).waitFor({ timeout: 90000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Scan the globe/ }).click();
await page.getByRole("button", { name: /Hear the \d+ anomalies/ }).waitFor({ timeout: 120000 });
await page.getByRole("button", { name: /Hear the \d+ anomalies/ }).click();
await page.waitForTimeout(2500);
await scrollUnderHeader(page.locator(".anomaly-explorer"), 12);
await page.waitForTimeout(300);
await shot("07-global-anomalies");
await page.getByRole("button", { name: "Trace", exact: true }).click();
await page.waitForTimeout(600);
await shot("14-trace-drawer");
await page.getByRole("button", { name: "Trace", exact: true }).click();
await pause();

// 08 Hear Earth: Cosmic Earth playing a place.
await nav().getByRole("link", { name: "Hear Earth" }).click();
await page.waitForSelector(".chart .trace", { timeout: 90000 });
await page.getByRole("button", { name: "Play this place" }).click();
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot("08-hear-earth");

// 21 Cosmic Earth: the place's history against its 2001–2020 normal.
await pause();
const history = page.locator("section.history-panel").first();
await history.scrollIntoViewIfNeeded();
const historyPlay = history.getByRole("button", { name: /^Play \d+ (months|seasons|years)/ });
await historyPlay.waitFor({ timeout: 120000 });
await historyPlay.click();
await page.waitForTimeout(3000);
await scrollUnderHeader(history.locator("header"), 12);
await shot("21-cosmic-history");
await pause();

// 13 Regional Sound Battle with a searched challenger.
await page.locator(".battle").scrollIntoViewIfNeeded();
const battleSearch = page.getByRole("form", { name: "Search for a challenger location" });
await battleSearch.getByPlaceholder("City or region").fill("Reykjavik");
await battleSearch.getByRole("button", { name: "Find" }).click();
const battleResult = page.getByRole("list", { name: "Place search results" }).getByRole("button").first();
await battleResult.waitFor({ timeout: 30000 });
await battleResult.click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Hear both/ }).click();
await page.waitForTimeout(2500);
await elementShot(page.locator(".battle"), "13-sound-battle");
await pause();

// 09 History: the Environmental Sound Timeline.
await nav().getByRole("link", { name: "History" }).click();
const timelinePlay = page.getByRole("button", { name: /^Play \d+ (months|seasons|years)/ });
await timelinePlay.waitFor({ timeout: 120000 });
await timelinePlay.click();
await page.waitForTimeout(4000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot("09-timeline");
await pause();

// 10 The More menu, open.
await nav().getByRole("button", { name: "More" }).click();
await page.waitForTimeout(400);
await shot("10-more-menu");
await page.keyboard.press("Escape");

// 15 Time Machine.
await more("Time Machine");
await page.getByRole("button", { name: "Compare", exact: true }).click();
await page.waitForSelector(".delta-chart", { timeout: 90000 });
await page.getByRole("button", { name: "Hear difference" }).click();
await page.waitForTimeout(3500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await shot("15-time-machine");
await pause();

// 16 Earth Sound Map, an equator tour.
await more("Sound Map");
await page.locator(".sound-map-grid").waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Around the equator" }).click();
await page.waitForFunction(() => !document.querySelector(".wait"), null, { timeout: 180000 });
await page.waitForTimeout(3500);
await page.evaluate(() => window.scrollTo(0, 0));
await shot("16-sound-map");
await pause();

// 17 Jukebox playing an EIC frame.
await more("Jukebox");
await page.waitForSelector(".deck-title", { timeout: 90000 });
await page.getByRole("button", { name: "Play this frame", exact: true }).click();
await page.waitForTimeout(5000);
await page.evaluate(() => window.scrollTo(0, 0));
await shot("17-jukebox");
await pause();

// 18 Sonic Lab.
await more("Sonic Lab");
await page.waitForFunction(() => {
  const button = document.querySelector(".lab-transport button.play");
  return button && !button.hasAttribute("disabled");
}, null, { timeout: 90000 });
await page.getByRole("button", { name: "Play the soundscape" }).click();
await page.waitForTimeout(3500);
await shot("18-sonic-lab");
await page.getByRole("button", { name: "Stop", exact: true }).click();

// 11 Science: how Listening Intelligence computes its findings.
await page.goto(`${URL}/#/science/intelligence`);
await page.waitForTimeout(2000);
await shot("11-science-listening");

// 19 High contrast, on Listening Intelligence.
await page.goto(`${URL}/#/listen?region=sahel`);
await page.locator(".listen-player .play").waitFor({ timeout: 90000 });
await page.getByRole("button", { name: "High contrast" }).click();
await page.waitForTimeout(800);
await shot("19-high-contrast");
await page.getByRole("button", { name: "High contrast" }).click();

// 12 Phone: Listening Intelligence at 390 px.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${URL}/#/listen?region=indian-ocean`);
await page.locator(".listen-player .play").waitFor({ timeout: 90000 });
await page.waitForTimeout(800);
await page.locator(".listen-player").evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 140 }));
await page.waitForTimeout(300);
await shot("12-phone-listen");

await browser.close();
if (problems.length) {
  console.error("\nProblems:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nAll screenshots saved.");
