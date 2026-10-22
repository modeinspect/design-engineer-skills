// Generated from shared/capture-core.mjs. Edit the master and run node scripts/sync-shared.mjs.
// Shared screenshot core for the capture scripts in this pack. Each skill's
// capture.mjs keeps its own plan format and command line and calls this file
// for everything that must behave the same everywhere: resolving Playwright,
// browser settings, load-failure checks, theme setup, settling, and the shot.
//
// A capture fails loudly. An HTTP error, a redirect, a framework error overlay
// or toast, an uncaught page error, a blank page, a missing selector, a theme
// the app removed or that breaks hydration, or a page that never stops
// changing is an error on that capture, never a silent screenshot.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const FREEZE_CSS =
  "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;" +
  "transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;" +
  "scroll-behavior:auto!important}";

// Dev-only chrome that is not part of the UI under review: the Next.js dev
// badge and build watcher, and the Vite checker overlay. Hiding them never
// hides an error: checkRendered reads the overlay's DOM, not the pixels, and
// any uncaught page error fails the capture on its own.
export const DEV_CHROME_CSS =
  "nextjs-portal,#__next-build-watcher,#vite-plugin-checker-error-overlay{display:none!important}";

const OVERLAYS = ["nextjs-portal", "vite-error-overlay", "#webpack-dev-server-client-overlay", "#vite-plugin-checker-error-overlay"];
const SELECTOR_TIMEOUT = 15_000;
const STABLE_TIMEOUT = 10_000;
const STABLE_INTERVAL = 250;

// One tools folder for every capture skill in the pack, so Playwright is
// installed once. Printed for a shell, so the variable expands there.
export const TOOLS_DIR = '"${TMPDIR:-/tmp}/design-engineer-skills-playwright"';

// Playwright comes from $PLAYWRIGHT_FROM (a folder with node_modules/playwright),
// then from the current directory. Nothing is installed here.
export function loadPlaywright({ toolsDir = TOOLS_DIR, usage = "node capture.mjs ..." } = {}) {
  const dirs = [process.env.PLAYWRIGHT_FROM, process.cwd()].filter(Boolean);
  for (const dir of dirs) {
    const req = createRequire(path.join(path.resolve(dir), "noop.js"));
    for (const name of ["playwright", "@playwright/test", "playwright-core"]) {
      try {
        return req(name);
      } catch {}
    }
  }
  throw new Error(
    `Playwright not found in ${dirs.join(" or ")}. Install it outside the repo and point PLAYWRIGHT_FROM at it:\n` +
      `  npm install --prefix ${toolsDir} playwright\n` +
      `  npx --prefix ${toolsDir} playwright install chromium\n` +
      `  PLAYWRIGHT_FROM=${toolsDir} ${usage}`,
  );
}

export async function launchBrowser(playwright, { channel } = {}) {
  return playwright.chromium.launch(channel ? { channel } : {});
}

// Responsive layouts often render a hidden copy of the same control; act on the visible one.
export function visible(page, selector) {
  return page.locator(`${selector} >> visible=true`).first();
}

export async function waitVisible(page, selector, { timeout = SELECTOR_TIMEOUT, what = "selector" } = {}) {
  const loc = visible(page, selector);
  try {
    await loc.waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(`${what} not visible after ${timeout / 1000}s: ${selector}`);
  }
  return loc;
}

const trimSlash = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

// Navigates and fails on anything that is not the requested page rendering.
// Use it for every navigation, including ones inside a skill's own steps.
export async function gotoChecked(page, url, log, { timeout = 90_000 } = {}) {
  const requested = new URL(url);
  const response = await page.goto(requested.href, { waitUntil: "load", timeout });
  if (!response) throw new Error(`${requested.href}: no response (is the server running?)`);
  log.status = response.status();
  if (response.status() >= 400) throw new Error(`${requested.pathname}: HTTP ${response.status()}`);
  const landed = new URL(page.url());
  if (trimSlash(landed.pathname) !== trimSlash(requested.pathname)) {
    throw new Error(`${requested.pathname}: redirected to ${landed.pathname} (sign-in wall? use the final path or a session)`);
  }
  await page.addStyleTag({ content: FREEZE_CSS + DEV_CHROME_CSS });
}

// Waits for network, fonts and images, and scrolls once through the page so
// lazy images and in-view content load. Problems are recorded as warnings;
// the stable-frame check in shoot() decides whether the page is capturable.
export async function settle(page, warnings) {
  const idle = async () => {
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      if (!warnings.includes("network never went idle")) warnings.push("network never went idle");
    }
  };
  await idle();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, 0);
  });
  await idle();
  await page.evaluate(() =>
    Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => (i.onload = i.onerror = r)))),
  );
}

// Next.js always mounts <nextjs-portal> in dev; it only matters when it shows an
// error. The error dialog, and the collapsed error toast: Next.js 14 renders the
// toast as class="nextjs-toast-errors-parent", later versions as a data attribute.
const NEXT_ERROR_UI = "[data-nextjs-dialog], [data-nextjs-toast-errors-parent], .nextjs-toast-errors-parent, [data-issues]";
async function nextHasErrors(page) {
  return page.evaluate((sel) => {
    const root = document.querySelector("nextjs-portal")?.shadowRoot;
    if (!root) return false;
    return Boolean(root.querySelector(sel));
  }, NEXT_ERROR_UI);
}

const firstLine = (s) => s.split("\n")[0];

// An uncaught error fails the capture even when no overlay shows it: the page
// a user gets is broken, whatever the pixels look like.
export function checkPageErrors(log) {
  if (log.pageErrors?.length) throw new Error(`uncaught page error: ${firstLine(log.pageErrors[0])}`);
}

export async function checkRendered(page, log) {
  for (const sel of OVERLAYS) {
    if (!(await page.locator(sel).count())) continue;
    if (sel === "nextjs-portal" && !(await nextHasErrors(page))) continue;
    const first = [...log.pageErrors, ...log.consoleErrors][0];
    throw new Error(`framework error overlay visible (${sel})${first ? `: ${firstLine(first)}` : ""}`);
  }
  checkPageErrors(log);
  const blank = await page.evaluate(
    () => !document.body || (!document.body.innerText.trim() && !document.querySelector("img,svg,canvas,video")),
  );
  if (blank) throw new Error("page rendered blank");
}

// Theme: { colorScheme, localStorage, cookies, htmlClass, htmlAttr }.
// colorScheme emulates prefers-color-scheme. localStorage and cookies are set
// before any page script runs. htmlClass and htmlAttr are put on <html> before
// the app's scripts run; if the app removes them, or forcing them breaks
// hydration, the capture fails, because users cannot reach that theme either.
async function applyTheme(context, theme, origin) {
  if (theme.cookies) {
    await context.addCookies(Object.entries(theme.cookies).map(([name, value]) => ({ name, value, url: origin })));
  }
  if (theme.htmlClass || theme.htmlAttr) {
    await context.addInitScript(({ cls, attrs }) => {
      // <html> may not exist yet when init scripts run; set it again once it does.
      const set = () => {
        const el = document.documentElement;
        if (!el) return;
        if (cls) el.classList.add(cls);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      };
      set();
      document.addEventListener("DOMContentLoaded", set);
    }, { cls: theme.htmlClass, attrs: theme.htmlAttr ?? {} });
  }
}

async function verifyTheme(page, theme) {
  const missing = await page.evaluate(({ cls, attrs }) => {
    const el = document.documentElement;
    if (cls && !el.classList.contains(cls)) return `class "${cls}"`;
    for (const [k, v] of Object.entries(attrs)) if (el.getAttribute(k) !== v) return `attribute ${k}="${v}"`;
    return null;
  }, { cls: theme.htmlClass, attrs: theme.htmlAttr ?? {} });
  if (missing) throw new Error(`theme ${missing} on <html> was removed by the app after load`);
}

// React reports a server/client mismatch as a console error (React 18:
// "Extra attributes from the server", "Prop `className` did not match"; React 19:
// "A tree hydrated but some attributes ... didn't match") or throws on a
// "Hydration failed". With a forced htmlClass or htmlAttr, that means the app
// never renders that theme on the server, so the theme is not reachable this way.
const HYDRATION = /Extra attributes from the server|did not match\. Server|Hydration failed|hydrated but some attributes|hydration mismatch|didn't match the client/i;
function checkForcedThemeHydration(theme, log) {
  if (!theme.htmlClass && !theme.htmlAttr) return;
  const hit = [...log.pageErrors, ...log.consoleErrors].find((m) => HYDRATION.test(m));
  if (!hit) return;
  const forced = [theme.htmlClass && `htmlClass "${theme.htmlClass}"`, theme.htmlAttr && `htmlAttr ${JSON.stringify(theme.htmlAttr)}`].filter(Boolean).join(" and ");
  throw new Error(
    `theme not reachable by forcing ${forced} on <html>: it caused a hydration mismatch (${firstLine(hit).slice(0, 160)}). ` +
      "Set the theme the way the app's own toggle stores it (localStorage or a cookie), or drop it",
  );
}

// Each hide entry is a Playwright selector, hidden on its own, so one bad
// entry cannot void the others. An invalid selector fails the capture; one
// that matches nothing is recorded as a warning.
async function hideAll(page, selectors, warnings) {
  for (const sel of selectors) {
    let count;
    try {
      count = await page.locator(sel).evaluateAll((els) => {
        for (const el of els) el.style.setProperty("visibility", "hidden", "important");
        return els.length;
      });
    } catch (error) {
      throw new Error(`hide selector is invalid: ${sel} (${firstLine(String(error.message))})`);
    }
    if (count === 0) warnings.push(`hide matched nothing: ${sel}`);
  }
}

// Shoots until two consecutive frames are identical, the rule Playwright's own
// visual assertions use. JavaScript animation ignores the CSS freeze; a page
// still changing at the timeout is a failed capture, not a noisy one.
export async function shootStable(page, shoot, { timeout = STABLE_TIMEOUT } = {}) {
  const deadline = Date.now() + timeout;
  let previous = await shoot();
  let frames = 1;
  while (Date.now() < deadline) {
    await page.waitForTimeout(STABLE_INTERVAL);
    const next = await shoot();
    frames++;
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw new Error(`never settled: still changing after ${timeout / 1000}s (${frames} frames); mask or hide the moving element`);
}

// App shells often scroll an inner element (h-screen plus overflow-auto), so a
// full-page screenshot stops at the viewport. Grow the viewport to show it.
async function expandInnerScroller(page, width, height, maxHeight) {
  const inner = await page.evaluate(() => {
    if (document.documentElement.scrollHeight > window.innerHeight + 1) return 0;
    let best = 0;
    for (const el of document.querySelectorAll("*")) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.clientHeight >= window.innerHeight * 0.5) {
        best = Math.max(best, el.scrollHeight - el.clientHeight);
      }
    }
    return best;
  });
  if (inner <= 0) return { expandedTo: null, cut: false };
  const expandedTo = Math.min(maxHeight, height + inner);
  await page.setViewportSize({ width, height: expandedTo });
  await page.waitForTimeout(100);
  return { expandedTo, cut: height + inner > maxHeight };
}

// Clip around one element plus padding. Inside the viewport when it fits there
// (fixed dialogs and menus stay where they are), else in page coordinates.
async function elementClip(page, loc, padding, viewport) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  if (!box) throw new Error("target has no box (not rendered)");
  const x0 = box.x - padding, y0 = box.y - padding, x1 = box.x + box.width + padding, y1 = box.y + box.height + padding;
  if (y0 >= -padding && y1 <= viewport.height + padding) {
    const x = Math.max(0, x0), y = Math.max(0, y0);
    return { fullPage: false, clip: { x, y, width: Math.min(viewport.width, x1) - x, height: Math.min(viewport.height, y1) - y } };
  }
  const doc = await page.evaluate(() => ({
    sx: window.scrollX, sy: window.scrollY,
    w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight,
  }));
  const x = Math.max(0, x0 + doc.sx), y = Math.max(0, y0 + doc.sy);
  return {
    fullPage: true,
    clip: { x, y, width: Math.min(doc.w, x1 + doc.sx) - x, height: Math.min(doc.h, y1 + doc.sy) - y },
  };
}

// One capture: fresh context, load, checks, the skill's own steps, the shot.
//
// spec: {
//   url, file, width, height = 900, scale = 1, theme = {}, storageState,
//   locale = "en-US", timezoneId = "UTC", localStorage = {},
//   waitFor,           selector that must be visible before anything else
//   waitMs,            extra wait after settling
//   hide, mask,        Playwright selectors hidden with visibility:hidden (each
//                      on its own; no match is a warning), or painted over
//   maskColor,
//   selector,          shoot this element (first visible match) ...
//   padding = 0,       ... plus this many pixels around it
//   fullPage = true,   when there is no selector
//   maxHeight,         cut full-page shots at this height and record it; also
//                      grows the viewport to fit an app shell's inner scroller
//   drive,             async (page, entry) => locator | undefined: the skill's
//                      steps; a returned locator replaces `selector` as the target
//   inspect,           async (page, { locator, clip }) => called after the shot
// }
//
// Returns the manifest entry: { url, file, ok, status, error, warnings,
// consoleErrors, pageErrors, bytes, expandedTo, truncatedAt, inspected }.
export async function capture(browser, spec) {
  const height = spec.height ?? 900;
  const theme = spec.theme ?? {};
  const entry = { url: spec.url, file: spec.file, ok: false, status: null, warnings: [], consoleErrors: [], pageErrors: [] };
  const context = await browser.newContext({
    viewport: { width: spec.width, height },
    deviceScaleFactor: spec.scale ?? 1,
    reducedMotion: "reduce",
    colorScheme: theme.colorScheme ?? "light",
    locale: spec.locale ?? "en-US",
    timezoneId: spec.timezoneId ?? "UTC",
    ...(spec.storageState ? { storageState: spec.storageState } : {}),
  });
  try {
    const storage = { ...(spec.localStorage ?? {}), ...(theme.localStorage ?? {}) };
    if (Object.keys(storage).length) {
      await context.addInitScript((items) => {
        for (const [k, v] of Object.entries(items)) window.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
      }, storage);
    }
    await applyTheme(context, theme, new URL(spec.url).origin);
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && entry.consoleErrors.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => entry.pageErrors.push(String(e.message).slice(0, 300)));

    await gotoChecked(page, spec.url, entry, { timeout: spec.timeoutMs });
    if (spec.waitFor) await waitVisible(page, spec.waitFor, { timeout: 30_000, what: "waitFor" });
    await settle(page, entry.warnings);
    if (spec.waitMs) await page.waitForTimeout(spec.waitMs);
    checkForcedThemeHydration(theme, entry);
    await checkRendered(page, entry);
    await verifyTheme(page, theme);
    if (spec.hide?.length) await hideAll(page, spec.hide, entry.warnings);

    let locator = spec.drive ? await spec.drive(page, entry) : undefined;
    if (spec.drive) await checkRendered(page, entry);
    if (!locator && spec.selector) locator = await waitVisible(page, spec.selector);

    const mask = (spec.mask ?? []).map((s) => page.locator(s));
    const options = { animations: "disabled", caret: "hide", mask, timeout: 15_000, ...(spec.maskColor ? { maskColor: spec.maskColor } : {}) };
    let shot;
    if (locator) {
      shot = await elementClip(page, locator, spec.padding ?? 0, page.viewportSize());
    } else if (spec.fullPage ?? true) {
      // Growing the viewport needs a cap: an app shell with a long inner list
      // can be tens of thousands of pixels tall, which Chromium cannot shoot.
      if (spec.maxHeight) {
        const { expandedTo, cut } = await expandInnerScroller(page, spec.width, height, spec.maxHeight);
        entry.expandedTo = expandedTo;
        if (cut) entry.truncatedAt = spec.maxHeight;
      }
      const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      const shotHeight = Math.min(doc.h, spec.maxHeight ?? Infinity);
      if (doc.h > shotHeight) entry.truncatedAt = spec.maxHeight;
      // The clip keeps horizontal overflow in the shot: a page wider than the viewport is a finding.
      shot = { fullPage: true, clip: { x: 0, y: 0, width: Math.max(spec.width, doc.w), height: shotHeight } };
    } else {
      shot = { fullPage: false };
    }
    const png = await shootStable(page, () => page.screenshot({ ...options, ...shot }));
    // An error thrown while the steps ran or the frames settled still fails it.
    checkPageErrors(entry);
    fs.mkdirSync(path.dirname(spec.file), { recursive: true });
    fs.writeFileSync(spec.file, png);
    entry.bytes = png.length;
    if (spec.inspect) entry.inspected = await spec.inspect(page, { locator, clip: shot.clip });
    entry.ok = true;
  } catch (error) {
    entry.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  return entry;
}
