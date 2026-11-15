// Records a walkthrough of under three minutes with the app's real sound: the
// landing, "Try the Indian Ocean" (Earth Listening Intelligence, a finding
// clicked to jump the audio), Hear Earth, History, Global anomalies, the case
// study reveal, a Listening Test trial, and the More menu, with chapter captions.
// Usage: pnpm dev (in another shell), then: node scripts/record-demo.mjs
// Output: artifacts/synesthesia-demo.mp4 (H.264 + AAC). Needs ffmpeg on PATH.
//
// Playwright video has no audio track. An init script mirrors whatever the page
// sends to AudioContext.destination into a MediaRecorder; the app is not changed.
// The chapter captions are drawn by this script for the recording only.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cursorScript, dragAcross, launchOptions } from "./capture-lib.mjs";

const URL = process.env.APP_URL ?? `http://127.0.0.1:${process.env.SYN_WEB_PORT ?? 4317}`;
const RAW = "artifacts/raw";
const OUT = "artifacts/synesthesia-demo.mp4";
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const audioTap = () => {
  const Original = window.AudioContext;
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args);
      this.__tap = this.createMediaStreamDestination();
      const recorder = new MediaRecorder(this.__tap.stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks = [];
      recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      recorder.start(250);
      window.__demoAudio = { recorder, chunks, startedAt: Date.now() };
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest);
    if (destination === this.context.destination && this.context.__tap) connect.call(this, this.context.__tap);
    return result;
  };
};

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: RAW, size: { width: 1440, height: 900 } },
});
await context.addInitScript(cursorScript);
await context.addInitScript(audioTap);
const videoStartedAt = Date.now();
const page = await context.newPage();
page.on("pageerror", (error) => console.error("pageerror", error.message));

const wait = (ms) => page.waitForTimeout(ms);
const glide = async (x, y, steps = 30) => page.mouse.move(x, y, { steps });
const scrollBy = async (dy, steps = 12) => {
  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, dy / steps);
    await wait(30);
  }
};
const toTop = async () => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(500);
};
const scrollUnderHeader = async (locator, gap = 16) => {
  await locator.evaluate((element, extra) => {
    const header = document.querySelector(".console");
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight ?? 0) - extra, behavior: "smooth" });
  }, gap);
  await wait(700);
};
const clickLocator = async (locator) => {
  const box = await locator.boundingBox();
  if (box) await glide(box.x + box.width / 2, box.y + box.height / 2, 20);
  await locator.click();
};
const click = (name) => clickLocator(page.getByRole("button", { name, exact: typeof name === "string" }).first());
const primary = () => page.getByRole("navigation", { name: "Primary sections" });
const nav = (name) => clickLocator(primary().getByRole("link", { name, exact: true }));
const more = async (name) => {
  await clickLocator(primary().getByRole("button", { name: "More" }));
  await wait(700);
  await clickLocator(primary().getByRole("link", { name: new RegExp(`^${name}`) }));
};
const pauseIfPlaying = () => page.locator(".dock").getByRole("button", { name: "Pause", exact: true }).click({ timeout: 2000 }).catch(() => {});
const mark = (label) => console.log(`${((Date.now() - videoStartedAt) / 1000).toFixed(1).padStart(6)}s  ${label}`);
/** A chapter caption in the lower third of the recording. */
const chapter = async (title, line) => {
  mark(title);
  await page.evaluate(([heading, text]) => {
    let card = document.querySelector("[data-demo-caption]");
    if (!card) {
      card = document.createElement("div");
      card.dataset.demoCaption = "";
      card.setAttribute("aria-hidden", "true");
      card.style.cssText = "position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:99998;max-width:880px;padding:12px 22px;" +
        "background:rgba(4,8,14,0.9);border:1px solid rgba(111,243,255,0.5);color:#e8f1f6;font:500 18px/1.4 'IBM Plex Sans',sans-serif;" +
        "text-align:center;pointer-events:none;transition:opacity .4s;box-shadow:0 10px 30px rgba(0,0,0,.5)";
      document.body.appendChild(card);
    }
    card.innerHTML = `<div style="font:500 11px 'IBM Plex Mono',monospace;letter-spacing:.18em;text-transform:uppercase;color:#6ff3ff;margin-bottom:4px">${heading}</div>${text}`;
    card.style.opacity = "1";
  }, [title, line]);
};
const hideChapter = () => page.evaluate(() => { const card = document.querySelector("[data-demo-caption]"); if (card) card.style.opacity = "0"; });

// ── 1. Landing ───────────────────────────────────────────
await page.goto(URL);
await wait(2500);
await chapter("SYNESTHESIA · NASA Space Apps 2026", "NASA Earth measurements you can hear: three experiences, one bridge between them.");
const hero = await page.locator(".hero-canvas").boundingBox();
await glide(hero.x + hero.width * 0.4, hero.y + hero.height * 0.62, 25);
await dragAcross(page, hero.x + hero.width * 0.4, hero.y + hero.height * 0.62, hero.x + hero.width * 0.66, hero.y + hero.height * 0.42, { steps: 60, delay: 40 });
await wait(800);
await scrollBy(700);
await wait(3800);
await toTop();

// ── 2. Earth Listening Intelligence: the Indian Ocean ────
await chapter("Earth Listening Intelligence", "One click: the Indian Ocean's NASA POWER record, a note per month. Higher = warmer than normal; bells = unusual.");
await clickLocator(page.getByRole("link", { name: /Try the Indian Ocean/ }));
await page.waitForFunction(() => document.querySelector(".listen-player .play")?.getAttribute("aria-pressed") === "true", null, { timeout: 90000 });
await wait(7000);
await chapter("Found from the measurements", "Unusual temperature, rainfall changes, wind and history, each a sentence filled from computed numbers. Click one to hear it.");
await scrollUnderHeader(page.locator(".listen-summary"), 8);
await wait(4000);
const finding = page.locator(".finding").filter({ has: page.locator(".finding-hear", { hasText: "Hear it ·" }) }).first();
await scrollUnderHeader(finding, 160);
await clickLocator(finding.locator(".finding-hear"));
await wait(3500);
await clickLocator(finding.locator("summary").first());
await wait(5500);
await pauseIfPlaying();
await toTop();

// ── 3. Hear Earth ────────────────────────────────────────
await chapter("01 · Hear Earth", "Cosmic Earth: one place's NASA POWER days as a soundscape. Every note traces back to its request.");
await nav("Hear Earth");
await page.waitForSelector(".chart .trace", { timeout: 90000 });
await wait(800);
await click("Play this place");
await wait(6500);
await click("Trace");
await wait(3000);
await click("Trace");
await pauseIfPlaying();

// ── 4. History ───────────────────────────────────────────
await chapter("02 · Travel through environmental history", "A place's record since 1981, one note per step, against its 2001–2020 normal.");
await nav("History");
const timelinePlay = page.getByRole("button", { name: /^Play \d+ (months|seasons|years)/ });
await timelinePlay.waitFor({ timeout: 120000 });
await wait(1000);
await click(/^Play \d+ (months|seasons|years)/);
await wait(5000);
await scrollUnderHeader(page.locator("section.history-panel").first(), 12);
await wait(6000);
await pauseIfPlaying();

// ── 5. Global anomalies ──────────────────────────────────
await chapter("03 · Discover global anomalies through sound", "48 points around the globe; the outliers ring as bells. Each bell opens its measurement.");
await nav("Anomalies");
await page.getByRole("button", { name: /Scan the globe/ }).waitFor({ timeout: 90000 });
await wait(1500);
await click(/Scan the globe/);
await page.getByRole("button", { name: /Hear the \d+ anomalies/ }).waitFor({ timeout: 120000 });
await wait(800);
await click(/Hear the \d+ anomalies/);
await wait(8500);
await pauseIfPlaying();
await toTop();

// ── 6. Case study ────────────────────────────────────────
await chapter("Case study · found by ear", "The record is searched for its strongest compound heat-and-dryness event. Hear a quiet year, then the event.");
await more("Case study");
await page.locator(".case-step button").first().waitFor({ timeout: 120000 });
await wait(2500);
await clickLocator(page.locator(".case-step").nth(0).getByRole("button"));
await wait(5500);
await clickLocator(page.locator(".case-step").nth(1).getByRole("button"));
await wait(6000);
await chapter("Four charts, or one sound", "Reveal: temperature, rain, humidity and wind on four synced charts, all heard together in one soundscape.");
await click("Reveal");
await wait(1500);
await scrollUnderHeader(page.locator(".case-finding"), 12);
await wait(4500);
await scrollUnderHeader(page.locator(".case-compare"), 12);
await wait(6500);
await pauseIfPlaying();
await toTop();

// ── 7. Listening Test ────────────────────────────────────
await chapter("Listening Test · can people hear it?", "Two real 30-day clips, ear only: which one holds the unusual event? The answer key is computed from the data.");
await more("Listening Test");
await clickLocator(page.getByRole("checkbox"));
await wait(500);
await click(/Load the clips/);
await page.getByRole("heading", { name: /Which clip/ }).waitFor({ timeout: 180000 });
await scrollUnderHeader(page.locator(".ear-trial"), 12);
await clickLocator(page.getByRole("button", { name: /Play clip 1/ }));
await wait(7000);
await clickLocator(page.getByRole("button", { name: /Play clip 2/ }));
await wait(7000);
await pauseIfPlaying();
await toTop();

// ── 8. More ──────────────────────────────────────────────
await chapter("And more", "Science and methods, Sound Map, Time Machine, Sound Battle, Jukebox and Sonic Lab support the three experiences.");
await clickLocator(primary().getByRole("button", { name: "More" }));
await wait(4500);
await page.keyboard.press("Escape");
await wait(600);
await chapter("SYNESTHESIA", "Real NASA data. Every sentence computed. Every note traceable.");
await clickLocator(page.getByRole("button", { name: /Back to the start/ }));
await wait(4000);
await hideChapter();
mark("end");

// Collect the audio, then close (which finalises the video file).
const audio = await page.evaluate(async () => {
  const tap = window.__demoAudio;
  if (!tap) return null;
  await new Promise((resolve) => {
    tap.recorder.onstop = resolve;
    tap.recorder.stop();
  });
  const blob = new Blob(tap.chunks, { type: "audio/webm" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { base64: btoa(binary), startedAt: tap.startedAt };
});
await context.close();
await browser.close();

const video = readdirSync(RAW).find((name) => name.endsWith(".webm"));
renameSync(join(RAW, video), join(RAW, "screen.webm"));
const args = ["-y", "-loglevel", "error", "-i", join(RAW, "screen.webm")];
if (audio) {
  writeFileSync(join(RAW, "sound.webm"), Buffer.from(audio.base64, "base64"));
  const delay = Math.max(0, audio.startedAt - videoStartedAt);
  console.log(`audio starts ${delay} ms into the video`);
  args.push("-i", join(RAW, "sound.webm"), "-filter_complex", `[1:a]adelay=${delay}|${delay},apad[a]`, "-map", "0:v", "-map", "[a]", "-shortest", "-c:a", "aac", "-b:a", "160k");
} else {
  console.warn("No audio was captured; the mp4 will be silent.");
}
args.push("-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
console.log(`wrote ${OUT}`);
