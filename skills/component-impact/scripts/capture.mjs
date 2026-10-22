#!/usr/bin/env node
// Screenshots every place in a capture plan against one running app. The
// capture settings and failure checks live in capture-core.mjs, shared with
// the pack's other capture scripts.
//
// Usage:
//   PLAYWRIGHT_FROM=<dir containing node_modules/playwright> \
//   node capture.mjs --plan plan.json --url http://localhost:3101 --out shots/before [--channel chrome]
//
// Plan format: see rendering.md in this skill. Writes <out>/<place>@<width>[-<theme>].png
// and <out>/manifest.json (merged across runs into the same folder).
// Exits 1 if any place failed to load or capture, 2 on a usage error.

import fs from "node:fs";
import path from "node:path";
import { capture, gotoChecked, launchBrowser, loadPlaywright, settle, visible } from "./capture-core.mjs";

const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const planFile = get("--plan");
const baseUrl = get("--url");
const outDir = get("--out");
const channel = get("--channel");
if (!planFile || !baseUrl || !outDir) {
  console.error("Usage: node capture.mjs --plan plan.json --url <base-url> --out <dir> [--channel chrome]");
  process.exit(2);
}

const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
const widths = plan.widths ?? [375, 1280];
if (!Array.isArray(plan.places) || plan.places.length === 0) {
  console.error(`${planFile}: "places" must be a non-empty array`);
  process.exit(2);
}
if (plan.colorSchemes) {
  console.error(`${planFile}: "colorSchemes" was replaced by "themes", for example {"light": {"colorScheme": "light"}, "dark": {"colorScheme": "dark"}}. See rendering.md`);
  process.exit(2);
}
// Theme name -> { colorScheme, localStorage, cookies, htmlClass, htmlAttr }, as capture-core.mjs applies it.
const themes = plan.themes ?? { light: { colorScheme: "light" } };
const themeNames = Object.keys(themes);
if (!themeNames.length) {
  console.error(`${planFile}: "themes" must name at least one theme`);
  process.exit(2);
}

async function runStep(page, step) {
  const timeout = 10000;
  if (step.goto) await gotoChecked(page, new URL(step.goto, baseUrl).href, {}, { timeout: 60000 });
  else if (step.click) await visible(page, step.click).click({ timeout });
  else if (step.hover) await visible(page, step.hover).hover({ timeout });
  else if (step.focus) await visible(page, step.focus).focus({ timeout });
  else if (step.fill) await visible(page, step.fill[0]).fill(step.fill[1], { timeout });
  else if (step.press) await page.keyboard.press(step.press);
  else if (step.waitFor) await visible(page, step.waitFor).waitFor({ timeout });
  else if (step.wait) await page.waitForTimeout(step.wait);
  else throw new Error(`Unknown step ${JSON.stringify(step)}`);
}

let playwright;
try {
  playwright = loadPlaywright({ usage: "node capture.mjs --plan ... --url ... --out ..." });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser(playwright, { channel });
const manifestFile = path.join(outDir, "manifest.json");
const manifest = { url: baseUrl, capturedAt: new Date().toISOString(), shots: [] };
const earlier = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")).shots : [];
let failures = 0;

for (const place of plan.places) {
  for (const width of place.widths ?? widths) {
    for (const themeName of themeNames) {
      const suffix = themeNames.length > 1 ? `-${themeName}` : "";
      const file = `${place.id}@${width}${suffix}.png`;
      const steps = place.steps ?? [];
      const result = await capture(browser, {
        url: new URL(place.path, baseUrl).href,
        file: path.join(outDir, file),
        width,
        height: plan.height ?? 900,
        theme: themes[themeName],
        locale: plan.locale,
        timezoneId: plan.timezone,
        localStorage: { ...(plan.localStorage ?? {}), ...(place.localStorage ?? {}) },
        mask: [...(plan.mask ?? []), ...(place.mask ?? [])],
        selector: place.selector,
        fullPage: place.fullPage ?? true,
        // App shells scroll an inner element; grow the viewport to show it, up to this height.
        maxHeight: plan.maxHeight ?? 6000,
        drive: steps.length
          ? async (page, entry) => {
              for (const step of steps) await runStep(page, step);
              await settle(page, entry.warnings);
            }
          : undefined,
      });
      const entry = {
        place: place.id, width, theme: themeName, file, ok: result.ok, status: result.status,
        ...(result.error ? { error: result.error } : {}),
        expandedTo: result.expandedTo ?? null, truncatedAt: result.truncatedAt ?? null,
        warnings: result.warnings, pageErrors: result.pageErrors, consoleErrors: result.consoleErrors,
      };
      if (!entry.ok) failures++;
      const cut = entry.truncatedAt ? `, cut at ${entry.truncatedAt}px` : "";
      console.log(entry.ok
        ? `ok   ${file}${entry.expandedTo ? `  (viewport grown to ${entry.expandedTo}px${cut})` : cut ? `  (${cut.slice(2)})` : ""}${entry.warnings.length ? `  (${entry.warnings.join("; ")})` : ""}`
        : `FAIL ${file}  ${entry.error}`);
      if (entry.pageErrors.length) console.log(`     page errors: ${entry.pageErrors.length}, first: ${entry.pageErrors[0]}`);
      manifest.shots.push(entry);
    }
  }
}

await browser.close();
const written = new Set(manifest.shots.map((s) => s.file));
const merged = { ...manifest, shots: [...earlier.filter((s) => !written.has(s.file)), ...manifest.shots] };
fs.writeFileSync(manifestFile, JSON.stringify(merged, null, 2));
console.log(`${manifest.shots.length - failures} captured, ${failures} failed. Manifest: ${manifestFile}`);
process.exit(failures ? 1 : 0);
