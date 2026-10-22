#!/usr/bin/env node
// Captures before and after screenshots of the same shots, viewports and themes
// from two running servers, then writes a manifest the PR description is built from.
// Capture settings and failure checks live in capture-core.mjs, shared with
// the pack's other capture scripts.
//
//   PLAYWRIGHT_FROM=<dir> node capture.mjs <config.json>
//
// Playwright is resolved from PLAYWRIGHT_FROM (a directory with node_modules/playwright),
// then from the current directory. The script never installs anything.
// Exit code 1 means at least one capture failed; the manifest still lists every result.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { capture, launchBrowser, loadPlaywright, visible } from "./capture-core.mjs";

const MASK_COLOR = "#a1a1aa"; // neutral grey, reads as "hidden on purpose"
const MAX_BYTES = 10 * 1024 * 1024; // GitHub's image attachment limit

function fail(msg) {
  console.error(`capture.mjs: ${msg}`);
  process.exit(2);
}

function readConfig(file) {
  if (!file) fail("usage: node capture.mjs <config.json>");
  const cfg = JSON.parse(readFileSync(file, "utf8"));
  for (const key of ["out", "sides", "viewports", "shots"]) {
    if (!cfg[key]) fail(`config is missing "${key}"`);
  }
  for (const side of ["before", "after"]) {
    if (!cfg.sides[side]) fail(`config.sides is missing "${side}"`);
  }
  cfg.themes = cfg.themes?.length ? cfg.themes : [{ name: "light" }];
  cfg.scale = cfg.scale ?? 2;
  return cfg;
}

async function applyActions(page, actions = []) {
  for (const a of actions) {
    if (a.hover) await visible(page, a.hover).hover();
    else if (a.focus) await visible(page, a.focus).focus();
    else if (a.click) await visible(page, a.click).click();
    else if (a.fill) await visible(page, a.fill[0]).fill(a.fill[1]);
    else if (a.press) await page.keyboard.press(a.press);
    else if (a.waitFor) await visible(page, a.waitFor).waitFor({ state: "visible" });
    else throw new Error(`unknown action ${JSON.stringify(a)}`);
  }
}

async function captureOne(browser, cfg, side, shot, vp, theme) {
  const file = path.join(cfg.out, `${shot.name}--${vp.name}--${theme.name}--${side}.png`);
  const result = { shot: shot.name, viewport: vp.name, width: vp.width, theme: theme.name, side, file };
  const elementOnly = shot.selector && !(side === "before" && shot.before === "page");
  const entry = await capture(browser, {
    url: new URL(shot.path, cfg.sides[side]).toString(),
    file,
    width: vp.width,
    height: vp.height ?? 900,
    scale: cfg.scale,
    theme,
    storageState: cfg.storageState,
    timeoutMs: 120_000,
    mask: shot.mask ?? cfg.mask ?? [],
    maskColor: MASK_COLOR,
    selector: elementOnly ? shot.selector : undefined,
    padding: shot.padding ?? 16,
    fullPage: shot.fullPage ?? false,
    drive: shot.actions?.length ? (page) => applyActions(page, shot.actions) : undefined,
  });
  Object.assign(result, { url: entry.url, ok: entry.ok, status: entry.status });
  if (entry.ok && entry.bytes > MAX_BYTES) {
    Object.assign(result, { ok: false, error: `${entry.bytes} bytes is over GitHub's 10 MB image limit; lower "scale" or crop` });
  } else if (!entry.ok) {
    const isNew = side === "before" && entry.error.startsWith("selector not visible");
    result.error = entry.error + (isNew ? ' (new element? set "before": "page")' : "");
  } else if (shot.selector && !elementOnly) {
    result.note = "element is new in this change; before shows the whole viewport";
  }
  Object.assign(result, { warnings: entry.warnings, consoleErrors: [...entry.pageErrors, ...entry.consoleErrors] });
  return result;
}

async function main() {
  const cfg = readConfig(process.argv[2]);
  cfg.out = path.resolve(cfg.out);
  mkdirSync(cfg.out, { recursive: true });
  const playwright = loadPlaywright({ usage: "node capture.mjs <config.json>" });
  const browser = await launchBrowser(playwright);
  const results = [];
  try {
    for (const shot of cfg.shots) {
      for (const vp of shot.viewports ? cfg.viewports.filter((v) => shot.viewports.includes(v.name)) : cfg.viewports) {
        for (const theme of cfg.themes) {
          const pair = {};
          for (const side of ["before", "after"]) {
            const r = await captureOne(browser, cfg, side, shot, vp, theme);
            results.push(r);
            pair[side] = r;
            const status = r.ok ? "ok" : `FAILED: ${r.error}`;
            console.log(`${side.padEnd(6)} ${shot.name} ${vp.name} ${theme.name}: ${status}`);
          }
          if (pair.before.ok && pair.after.ok) {
            const same = readFileSync(pair.before.file).equals(readFileSync(pair.after.file));
            pair.after.identicalToBefore = same;
            if (same) console.log(`       ${shot.name} ${vp.name} ${theme.name}: before and after are pixel-identical`);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  const manifest = { capturedAt: new Date().toISOString(), sides: cfg.sides, scale: cfg.scale, results };
  writeFileSync(path.join(cfg.out, "manifest.json"), JSON.stringify(manifest, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  const identical = results.filter((r) => r.identicalToBefore).length;
  const withErrors = results.filter((r) => r.consoleErrors.length).length;
  console.log(
    `\n${results.length - failed}/${results.length} captured, ${failed} failed, ${identical} identical pairs, ` +
      `${withErrors} captures logged console errors. Manifest: ${path.join(cfg.out, "manifest.json")}`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
