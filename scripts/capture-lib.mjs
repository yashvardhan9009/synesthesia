// Shared helpers for capture.mjs and record-demo.mjs.
import { existsSync } from "node:fs";

/** Use the system Chrome when present (no download needed); otherwise Playwright's Chromium. */
export function launchOptions() {
  const chrome = ["/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
  return {
    ...(chrome ? { channel: "chrome" } : {}),
    args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
  };
}

/**
 * Headless screenshots and videos have no mouse pointer. This draws one, for
 * the recording only; it is injected by the capture scripts, not shipped in the app.
 */
export const cursorScript = () => {
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.setAttribute("aria-hidden", "true");
    dot.dataset.cursor = "";
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "border:2px solid #fff;background:rgba(255,255,255,0.18);box-shadow:0 0 0 1px rgba(0,0,0,0.6);" +
      "pointer-events:none;z-index:99999;transition:transform 0.12s, background 0.12s;opacity:0";
    document.body.appendChild(dot);
    window.addEventListener("pointermove", (event) => {
      dot.style.opacity = "1";
      dot.style.left = `${event.clientX}px`;
      dot.style.top = `${event.clientY}px`;
    }, true);
    window.addEventListener("pointerdown", () => { dot.style.transform = "scale(0.7)"; dot.style.background = "rgba(255,179,71,0.6)"; }, true);
    window.addEventListener("pointerup", () => { dot.style.transform = "none"; dot.style.background = "rgba(255,255,255,0.18)"; }, true);
  });
};

/** Press, then glide the pointer from one point to another. Leaves the button held if hold is set. */
export async function dragAcross(page, x1, y1, x2, y2, { steps = 40, delay = 25, hold = false } = {}) {
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.down();
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    await page.mouse.move(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    await page.waitForTimeout(delay);
  }
  if (!hold) await page.mouse.up();
}

/** Hide the drawn pointer until the next move (for still screenshots of a button state). */
export async function hideCursor(page) {
  await page.evaluate(() => {
    const dot = document.querySelector("[data-cursor]");
    if (dot) dot.style.opacity = "0";
  });
}
