// Walks the app shell in a real browser: every navigation link and dock button,
// playback kept across sections, console errors, and screenshots at several sizes.
// Usage: node scripts/ux-check.mjs http://127.0.0.1:4403 /tmp/ux-shots
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { launchOptions } from "./capture-lib.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:4317";
const out = process.argv[3] ?? "artifacts/ux-check";
mkdirSync(out, { recursive: true });

const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) problems.push(message);
};

const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
page.on("pageerror", (error) => errors.push(String(error)));

await page.goto(`${base}/?intro=1`);
check(await page.getByRole("dialog").isVisible(), "intro shows with ?intro=1");
await page.waitForTimeout(5000);
const scene = await page.locator(".intro").getAttribute("data-scene");
check(scene === "sources", `intro advances on its own (${scene})`);
await page.screenshot({ path: `${out}/intro.png` });
await page.keyboard.press("Escape");
check(!(await page.getByRole("dialog").isVisible().catch(() => false)), "Escape skips the intro");
check(await page.getByRole("heading", { name: /First steps/ }).isVisible(), "onboarding checklist is visible on the landing page");
check(await page.getByRole("link", { name: /Try the Indian Ocean/ }).getAttribute("href") === "#/listen?region=indian-ocean", "landing has the Indian Ocean listening call to action");
check(await page.locator(".experience-card").count() === 3, "landing presents the three core experiences");
check(await page.getByRole("navigation", { name: "Primary sections" }).locator(".mode-tab").count() === 4, "primary navigation has four focused destinations");
check(await page.locator(".bridge").getAttribute("href") === "#/listen?region=indian-ocean", "Listening Intelligence is presented as the bridge between the experiences");
check(await page.locator(".evidence-card[href='#/case']").count() === 1 && await page.locator(".evidence-card[href='#/test']").count() === 1, "landing links to the case study and the Listening Test");

// The More menu: keyboard, Escape and outside click.
const more = page.getByRole("button", { name: "More" });
await more.focus();
await page.keyboard.press("Enter");
check(await more.getAttribute("aria-expanded") === "true", "More opens from the keyboard");
await page.keyboard.press("ArrowDown");
check((await page.evaluate(() => document.activeElement?.textContent ?? "")).startsWith("Case study"), "ArrowDown moves into the More links");
await page.keyboard.press("Escape");
check(await more.getAttribute("aria-expanded") === "false" && await page.evaluate(() => document.activeElement?.textContent?.trim() === "More"), "Escape closes More and returns focus");
await more.click();
await page.mouse.click(700, 700);
check(await more.getAttribute("aria-expanded") === "false", "a click outside closes More");

// Landing globe by keyboard.
await page.locator(".hero-canvas").focus();
await page.waitForTimeout(800);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
const caption = await page.locator(".caption").textContent();
check(/Blue Marble/.test(caption ?? ""), `arrow key on the globe sounds it: ${caption?.slice(0, 70)}`);
await page.screenshot({ path: `${out}/landing-1440.png` });

// The primary navigation stays focused; secondary tools remain in More.
for (const [name, hash, primary] of [
  ["Listen", "#/listen?region=indian-ocean", true],
  ["Hear Earth", "#/cosmic", true],
  ["History", "#/timeline", true],
  ["Anomalies", "#/cosmic?focus=anomaly", true],
  ["Case study", "#/case", false],
  ["Listening Test", "#/test", false],
  ["Jukebox", "#/jukebox", false],
  ["Sonic Lab", "#/lab", false],
  ["Sound Map", "#/soundmap", false],
  ["Time Machine", "#/time", false],
  ["Science", "#/science", false],
]) {
  const nav = page.getByRole("navigation", { name: "Primary sections" });
  if (!primary) await nav.getByRole("button", { name: "More" }).click();
  await nav.getByRole("link", { name: primary ? name : new RegExp(`^${name}`), exact: primary }).click();
  if (name === "Anomalies") {
    await page.locator(".anomaly-explorer").waitFor({ timeout: 60000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains("anomaly-explorer"), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(400);
  check(page.url().endsWith(hash), `${name} navigation goes to ${hash}`);
  if (name === "Anomalies") {
    const top = await page.locator(".anomaly-explorer").evaluate((element) => element.getBoundingClientRect().top);
    check(top >= 0 && top < 160, `Anomalies lands on the global explorer at the top of the page (${Math.round(top)} px)`);
    check(await page.evaluate(() => document.activeElement?.classList.contains("anomaly-explorer")), "the global explorer has focus");
  }
  if (primary) check((await page.locator("[aria-current=page]").textContent())?.includes(name), `${name} is current`);
}
await page.goBack();
check(page.url().endsWith("#/time"), "Back returns to the previous section");

// Science table of contents.
await page.goto(`${base}/#/science`);
await page.getByRole("link", { name: /Anomaly detection/ }).click();
await page.waitForTimeout(300);
check(page.url().endsWith("#/science/anomalies"), "methodology contents link deep-links");
check(await page.locator("#m-anomalies").isVisible(), "anomaly section visible");
await page.locator(".worked-inputs input").first().fill("40");
check((await page.locator(".worked li b").first().textContent()) === "1.000", "worked example recomputes");
await page.screenshot({ path: `${out}/science-1440.png`, fullPage: false });

// Jukebox: play, then go elsewhere and confirm the sound carries on.
await page.goto(`${base}/#/jukebox`);
await page.locator(".deck-title").waitFor({ timeout: 90000 });
await page.getByRole("button", { name: "Play this frame", exact: true }).click();
await page.waitForTimeout(1600);
check((await page.locator(".dock").getAttribute("data-status")) === "playing", "jukebox plays");
const outputLevel = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")));
check(outputLevel > 0.01, `analyser detects audible output (${outputLevel.toFixed(2)})`);
const note = await page.locator(".dock-note b").textContent();
check(/^[A-G]#?\d$/.test(note ?? ""), `dock shows the note: ${note}`);
check(await page.locator(".playhead-note").isVisible(), "scan line carries the note");
await page.screenshot({ path: `${out}/jukebox-playing-1440.png` });
await page.getByRole("button", { name: "Trace" }).click();
check(await page.locator("#dock-trace .trace-chain").isVisible(), "trace drawer opens");
await page.screenshot({ path: `${out}/trace-1440.png` });
await page.getByRole("button", { name: "Trace" }).click();

await page.getByRole("navigation", { name: "Primary sections" }).getByRole("link", { name: "Hear Earth" }).click();
await page.waitForTimeout(1500);
check((await page.locator(".dock").getAttribute("data-status")) === "playing", "playback continues in Cosmic Earth");
check((await page.locator(".dock-owner").textContent())?.includes("Jukebox"), "dock says the jukebox is sounding");

// Dock buttons.
await page.getByRole("button", { name: "Pause", exact: true }).first().click();
check((await page.locator(".dock").getAttribute("data-status")) === "paused", "dock pauses");
await page.getByRole("button", { name: "Next note" }).click();
await page.getByRole("button", { name: "Previous note" }).click();
await page.getByRole("button", { name: "Mute" }).click();
check((await page.getByRole("button", { name: "Unmute" }).getAttribute("aria-pressed")) === "true", "mute toggles");
await page.getByRole("button", { name: "Unmute" }).click();
const volume = page.getByLabel("Volume");
await volume.fill("63");
check(await volume.inputValue() === "63", "dock volume changes");
await page.getByLabel("Playback speed").selectOption("1.5");
await page.getByRole("button", { name: "Resume" }).click();
await page.waitForTimeout(500);
check((await page.locator(".dock").getAttribute("data-status")) === "playing", "dock resumes");
await page.getByLabel("Playback position").fill("3");
await page.waitForTimeout(200);
await page.goto(`${base}/#/jukebox`);
await page.locator(".deck-title").waitFor({ timeout: 90000 });
await page.getByRole("button", { name: /Next visualization/ }).click();
await page.waitForTimeout(500);
check((await page.locator(".track[aria-selected=true] .num").textContent()) === "02", "next visualization");
await page.getByRole("button", { name: /Previous visualization/ }).click();
await page.waitForTimeout(300);
check((await page.locator(".track[aria-selected=true] .num").textContent()) === "01", "previous visualization");

// A movie track: frames follow the sound.
await page.keyboard.press("2");
await page.locator(".film").waitFor({ timeout: 120000 });
await page.getByRole("button", { name: "Play this frame", exact: true }).click();
await page.waitForTimeout(1800);
check(await page.locator(".film-frame.on").count() === 1, "movie track highlights the sounding frame");
check(await page.locator(".frame-note").isVisible(), "movie track shows the note on the frame");
await page.screenshot({ path: `${out}/jukebox-movie-1440.png` });

// Other sections drive the same dock.
await page.goto(`${base}/#/lab`);
await page.getByRole("button", { name: "Play the soundscape" }).waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Play the soundscape" }).click();
await page.waitForTimeout(1000);
check((await page.locator(".dock-owner").textContent())?.includes("Sonic Lab"), "Sonic Lab plays through the dock");
const labLevel = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")));
check(labLevel > 0.01, `soundscape output reaches the analyser (${labLevel.toFixed(2)})`);
await page.getByRole("button", { name: "Stop all" }).click();
check((await page.locator(".dock").getAttribute("data-status")) === "idle", "Lab stop all silences the shared engine");
await page.getByRole("button", { name: "Artistic", exact: true }).click();
await page.getByPlaceholder("Name this configuration").fill("Integration check");
await page.getByRole("button", { name: "Save", exact: true }).click();
check(await page.getByText("Integration check", { exact: true }).isVisible(), "Sonic Lab saves a named configuration");
await page.getByRole("button", { name: "Reset to Scientific reference" }).click();
check(await page.getByText(/Reset to the Scientific reference/).isVisible(), "Sonic Lab reset returns to Scientific mode");
await page.getByRole("button", { name: "Earth Heartbeat" }).click();
await page.waitForTimeout(500);
check((await page.locator(".dock-owner").textContent())?.includes("Sonic Lab"), "Earth Heartbeat plays through the shared engine");
await page.getByRole("button", { name: "Stop all" }).click();

// The historical comparison uses the same engine API and its own source id.
await page.goto(`${base}/#/time`);
await page.getByRole("button", { name: "Compare", exact: true }).click();
await page.getByRole("button", { name: "Hear difference" }).waitFor({ timeout: 90000 });
await page.getByRole("button", { name: "Hear difference" }).click();
await page.waitForTimeout(700);
check((await page.locator(".dock-owner").textContent())?.includes("Time Machine"), "Time Machine plays through the dock");
await page.getByRole("button", { name: "Pause", exact: true }).first().click();
check((await page.locator(".dock").getAttribute("data-status")) === "paused", "Time Machine can be paused from the dock");
await page.getByRole("button", { name: "Hear earlier alone" }).click();
check((await page.locator(".dock-owner").textContent())?.includes("Time Machine"), "Time Machine plays the earlier period alone");
await page.getByRole("button", { name: "Hear later alone" }).click();
check((await page.locator(".dock-owner").textContent())?.includes("Time Machine"), "Time Machine plays the later period alone");
await page.getByRole("button", { name: "Hear difference" }).click();
check((await page.locator(".dock-owner").textContent())?.includes("Time Machine"), "Time Machine plays the difference");

await page.goto(`${base}/#/cosmic`);
const cosmicPlay = page.getByRole("button", { name: "Play this place" });
try {
  await cosmicPlay.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector(".wait"), null, { timeout: 60000 });
  await cosmicPlay.click();
  await page.waitForTimeout(1200);
  check((await page.locator(".dock-owner").textContent())?.includes("Cosmic Earth"), "Cosmic Earth plays through the dock");
  await page.getByRole("button", { name: "Pause", exact: true }).last().click();
  await page.getByRole("navigation", { name: "Primary sections" }).getByRole("link", { name: "Hear Earth" }).click();
  await page.getByRole("button", { name: /Hear both/ }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /Hear both/ }).click();
  await page.waitForTimeout(900);
  check((await page.locator(".dock-owner").textContent())?.includes("Cosmic Earth"), "regional sound battle uses the shared stereo engine");
  const battleLevel = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")));
  check(battleLevel > 0.01, `both places reach the analyser (${battleLevel.toFixed(2)})`);
  await page.getByRole("button", { name: /Scan the globe/ }).click();
  const hearAnomalies = page.getByRole("button", { name: /Hear the \d+ anomalies/ });
  await hearAnomalies.waitFor({ timeout: 90000 });
  check((await page.locator(".anomaly-explorer tbody tr").count()) > 0, "anomaly explorer lists unusual days across stations");
  await hearAnomalies.click();
  await page.waitForTimeout(1500);
  check((await page.locator(".dock-now-head").textContent())?.includes("Live"), "anomaly timeline plays through the dock");
  await page.screenshot({ path: `${out}/anomaly-explorer.png`, fullPage: true });
  await page.getByRole("button", { name: /Hear both/ }).click();
  await page.waitForTimeout(600);
  const shareUrl = page.url();
  check(new URL(shareUrl).searchParams.get("mode") === "cosmic", "Cosmic Earth writes a shareable route");
  await page.reload();
  await page.waitForTimeout(1000);
  check(page.url().includes("#/cosmic") && new URL(page.url()).searchParams.get("lat") !== null, "Cosmic share URL round-trips to the selected location");
  await page.getByRole("button", { name: "Trace" }).click();
  await page.screenshot({ path: `${out}/cosmic-trace-1440.png` });
  await page.getByRole("button", { name: "Trace" }).click();
} catch (error) {
  check(false, `Cosmic Earth did not become playable: ${String(error).slice(0, 120)}`);
}
// Round 5: Earth Sound Map (keyboard and a tour), Sound Timeline, any-location battle.
await page.goto(`${base}/#/soundmap`);
const firstCell = page.locator(".sound-map-grid [tabindex='0']").first();
await firstCell.waitFor({ timeout: 60000 });
await firstCell.focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".dock-owner")?.textContent?.includes("Sound Map"), null, { timeout: 90000 }).catch(() => {});
check((await page.locator(".dock-owner").textContent())?.includes("Sound Map"), "Sound Map plays a region from the keyboard");
await page.getByRole("button", { name: "Around the equator" }).click();
await page.waitForFunction(() => !document.querySelector(".wait"), null, { timeout: 180000 });
await page.waitForTimeout(1500);
const mapLevel = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--level")));
check(mapLevel > 0.005, `Sound Map tour reaches the analyser (${mapLevel.toFixed(2)})`);
await page.screenshot({ path: `${out}/soundmap-1440.png` });
await page.locator(".dock").getByRole("button", { name: "Pause", exact: true }).first().click().catch(() => {});

await page.goto(`${base}/#/timeline`);
const timelinePlay = page.getByRole("button", { name: /^Play \d+ (months|seasons|years)/ });
await timelinePlay.waitFor({ timeout: 120000 });
await timelinePlay.click();
await page.waitForTimeout(1500);
check((await page.locator(".dock").getAttribute("data-status")) === "playing", "Sound Timeline plays");
await page.screenshot({ path: `${out}/timeline-1440.png` });
await page.getByRole("button", { name: "Stop all" }).click().catch(() => {});

await page.goto(`${base}/#/cosmic`);
const battleSearch = page.getByRole("form", { name: "Search for a challenger location" });
await battleSearch.waitFor({ timeout: 60000 });
await battleSearch.getByPlaceholder("City or region").fill("Reykjavik");
await battleSearch.getByRole("button", { name: "Find" }).click();
const battleResult = page.getByRole("list", { name: "Place search results" }).getByRole("button").first();
await battleResult.waitFor({ timeout: 30000 });
await battleResult.click();
await page.waitForTimeout(1000);
check((await page.locator(".battle").textContent())?.includes("Reykjav"), "battle challenger comes from a geocoded search");

await page.goto(`${base}/#/jukebox`);
await page.locator(".deck-title").waitFor({ timeout: 90000 });

// High contrast and reduced motion switches.
await page.getByRole("button", { name: "High contrast" }).click();
check(await page.locator("html").evaluate((element) => element.classList.contains("contrast")), "high contrast preference applies");
await page.screenshot({ path: `${out}/jukebox-contrast-1440.png` });
await page.getByRole("button", { name: "High contrast" }).click();
await page.getByRole("button", { name: "Reduce motion" }).click();
check(await page.locator("html").evaluate((element) => element.classList.contains("still")), "reduced motion preference applies");
await page.getByRole("button", { name: "Reduce motion" }).click();

// The header fits on one row at desktop widths.
for (const width of [1280, 1440, 1920]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/#/listen?region=indian-ocean`);
  await page.waitForTimeout(500);
  const header = await page.locator(".console").evaluate((element) => ({ over: element.scrollWidth - element.clientWidth, height: element.getBoundingClientRect().height, tabs: element.querySelector(".modes").scrollWidth - element.querySelector(".modes").clientWidth }));
  check(header.over <= 0 && header.tabs <= 0 && header.height < 80, `${width} px header: one row, nothing clipped (${JSON.stringify(header)})`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#/`);
await page.waitForTimeout(500);
const phoneTabs = await page.locator(".modes").evaluate((element) => element.scrollWidth - element.clientWidth);
check(phoneTabs <= 1, `390 px: all four tabs and More are visible without scrolling (${phoneTabs}px)`);
await page.setViewportSize({ width: 1440, height: 900 });

// Screen sizes.
for (const [width, height, label] of [
  [390, 844, "phone"],
  [820, 1180, "tablet"],
  [1280, 720, "laptop"],
  [1440, 900, "wide"],
  [1920, 1080, "desktop"],
  [2560, 1080, "ultrawide"],
]) {
  await page.setViewportSize({ width, height });
  for (const hash of ["#/", "#/listen?region=indian-ocean", "#/case", "#/test", "#/jukebox", "#/cosmic", "#/soundmap", "#/time", "#/timeline", "#/lab", "#/science"]) {
    await page.goto(`${base}/${hash}`);
    await page.waitForTimeout(hash === "#/jukebox" ? 1500 : 600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const culprits = overflow > 1
      ? await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((element) => !element.closest(".modes, .track-list, .film, .table-scroll") && element.getBoundingClientRect().right > window.innerWidth + 1)
            .slice(0, 4)
            .map((element) => `${element.tagName.toLowerCase()}.${element.getAttribute("class")}`)
            .join(", "))
      : "";
    check(overflow <= 1, `${label} ${hash}: no horizontal overflow (${overflow}px) ${culprits}`);
    await page.screenshot({ path: `${out}/${label}-${hash.replace(/[#/]/g, "") || "home"}.png` });
  }
}

check(errors.length === 0, `console errors: ${errors.length}${errors.length ? `\n  ${errors.join("\n  ")}` : ""}`);
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s)` : "\nall checks passed");
process.exit(problems.length ? 1 : 0);
