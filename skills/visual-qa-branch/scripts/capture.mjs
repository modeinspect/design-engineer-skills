#!/usr/bin/env node
// Captures every route, width, theme and state on two running sites (base and
// head), then diffs each pair by pixels and by computed style. Capture
// settings and failure checks live in capture-core.mjs and the pixel diff in
// pixel-diff.mjs, both shared with the pack's other capture scripts.
//
// Usage: PLAYWRIGHT_FROM=<dir> node capture.mjs <plan.json>
// Plan format: see ../capture-plan.md
//
// Playwright is resolved from $PLAYWRIGHT_FROM, then from the current
// directory. Nothing is installed by this script.

import fs from "node:fs";
import path from "node:path";
import { capture, launchBrowser, loadPlaywright, waitVisible } from "./capture-core.mjs";
import { compareImages, decodePng, encodePng } from "./pixel-diff.mjs";

const STYLE_PROPS = [
  "color", "background-color", "background-image", "opacity",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "box-shadow", "outline-color", "outline-style", "outline-width", "outline-offset",
  "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "text-decoration-line", "text-transform", "text-align",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "gap", "row-gap", "column-gap", "display", "flex-direction", "grid-template-columns",
  "transform", "visibility",
];

function slug(route) {
  const s = route.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  return s || "root";
}

async function driveStep(page, step, maxTabs) {
  const loc = await waitVisible(page, step.selector, { what: "state selector" });
  if (step.action === "hover") {
    await loc.scrollIntoViewIfNeeded();
    await loc.hover();
  } else if (step.action === "focus") {
    // Reach the element with Tab from wherever focus is, so :focus-visible
    // matches as it does for a keyboard user. A fresh page starts at <body>.
    let reached = false;
    for (let i = 0; i < maxTabs; i++) {
      await page.keyboard.press("Tab");
      reached = await loc.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
      if (reached) break;
    }
    if (!reached) throw new Error(`not reached by keyboard within ${maxTabs} Tab presses: ${step.selector}`);
  } else if (step.action === "click") {
    await loc.scrollIntoViewIfNeeded();
    await loc.click();
  } else {
    throw new Error(`unknown state action: ${step.action}`);
  }
  await page.waitForTimeout(step.settleMs ?? 150);
}

// A state is one step ({ action, selector }) or several ({ steps: [...] }).
// The clip and the style diff cover `target`, else the last step's element.
async function driveState(page, state) {
  const steps = state.steps || [{ action: state.action, selector: state.selector, settleMs: state.settleMs }];
  for (const step of steps) await driveStep(page, step, state.maxTabs || 80);
  return waitVisible(page, state.target || steps[steps.length - 1].selector, { what: "state target" });
}

async function fingerprint(page, props, root, maxY) {
  return page.evaluate(([props, root, maxY]) => {
    const out = {};
    const pathOf = (el) => {
      const parts = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        let i = 1;
        for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
        parts.unshift(`${n.tagName.toLowerCase()}:${i}`);
      }
      return parts.join(">");
    };
    const scope = root ? [root, ...root.querySelectorAll("*")] : document.body.querySelectorAll("*");
    for (const el of scope) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const top = r.y + window.scrollY;
      if (top > maxY) continue;
      const cs = getComputedStyle(el);
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      const style = {};
      for (const p of props) style[p] = cs.getPropertyValue(p);
      const cls = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
      out[pathOf(el)] = {
        tag: el.tagName.toLowerCase(),
        cls: cls.slice(0, 160),
        text: text.slice(0, 120),
        src: el.getAttribute("src") || undefined,
        box: [Math.round(r.x), Math.round(top), Math.round(r.width), Math.round(r.height)],
        style,
      };
    }
    return out;
  }, [props, root || null, maxY]);
}

function compareFingerprints(base, head, limit) {
  const style = [];
  const content = [];
  const onlyBase = [];
  const onlyHead = [];
  for (const [key, b] of Object.entries(base)) {
    const h = head[key];
    if (!h) {
      onlyBase.push(key);
      continue;
    }
    if (b.tag !== h.tag) continue;
    if (b.text !== h.text || b.src !== h.src) {
      content.push({ key, tag: b.tag, cls: h.cls, box: h.box, base: b.text || b.src, head: h.text || h.src });
      continue;
    }
    const changed = {};
    for (const p of Object.keys(b.style)) if (b.style[p] !== h.style[p]) changed[p] = [b.style[p], h.style[p]];
    if (Object.keys(changed).length) style.push({ key, tag: b.tag, cls: h.cls, text: b.text, box: h.box, changed });
  }
  for (const key of Object.keys(head)) if (!base[key]) onlyHead.push(key);
  // One root cause usually changes many elements the same way: group identical changes.
  const groups = new Map();
  for (const e of style) {
    const sig = JSON.stringify(e.changed);
    if (!groups.has(sig)) groups.set(sig, { changed: e.changed, count: 0, samples: [] });
    const g = groups.get(sig);
    g.count++;
    if (g.samples.length < 3) g.samples.push({ tag: e.tag, cls: e.cls, text: e.text, box: e.box });
  }
  return {
    styleGroups: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit),
    styleCount: style.length,
    contentCount: content.length,
    onlyBaseCount: onlyBase.length,
    onlyHeadCount: onlyHead.length,
    content: content.slice(0, limit),
    onlyBase: onlyBase.slice(0, 10),
    onlyHead: onlyHead.slice(0, 10),
  };
}


function fail(msg) {
  console.error(`capture.mjs: ${msg}`);
  process.exit(1);
}

const TILE_H = 1200;
const GAP = 24;

// Writes the diff and, for a changed pair, side-by-side tiles: baseline on the
// left, branch on the right. Tall pages are split into 1200px bands so each
// stays legible; only bands with a changed pixel are kept.
function pixelDiff(aPath, bPath, outPath, sidePath, threshold) {
  const a = decodePng(aPath);
  const b = decodePng(bPath);
  const res = compareImages(a, b, { threshold: threshold * 255 });
  const sideFiles = [];
  if (res.changed > 0) {
    fs.writeFileSync(outPath, encodePng(res.width, res.height, res.diff));
    const h = res.height;
    const tw = a.width + GAP + b.width;
    for (let y = 0; y < h; y += TILE_H) {
      const th = Math.min(TILE_H, h - y);
      let hit = false;
      for (let o = y * res.width * 4; o < (y + th) * res.width * 4 && !hit; o += 4) {
        hit = res.diff[o] === 230 && res.diff[o + 1] === 0 && res.diff[o + 2] === 60;
      }
      if (!hit) continue;
      const tile = Buffer.alloc(tw * th * 4);
      for (let i = 0; i < tw * th; i++) tile.set([136, 136, 136, 255], i * 4);
      for (const [img, x0] of [[a, 0], [b, a.width + GAP]]) {
        for (let r = 0; r < th && y + r < img.height; r++) {
          img.rgba.copy(tile, (r * tw + x0) * 4, (y + r) * img.width * 4, (y + r + 1) * img.width * 4);
        }
      }
      const file = h <= TILE_H ? sidePath : sidePath.replace(/\.png$/, `-y${String(y).padStart(4, "0")}.png`);
      fs.writeFileSync(file, encodePng(tw, th, tile));
      sideFiles.push(file);
    }
  }
  return {
    changedPixels: res.changed,
    changedRatio: +(res.changed / (res.width * res.height)).toFixed(5),
    sizeBase: [a.width, a.height],
    sizeHead: [b.width, b.height],
    regionCount: res.regions.length,
    regions: res.regions.slice(0, 12),
    diff: res.changed > 0 ? outPath : null,
    sideBySide: sideFiles,
  };
}

async function captureOne(browser, side, plan, route, width, themeName, state, dir) {
  const url = new URL(route.path, side.url).toString();
  const file = path.join(dir, `${width}-${themeName}-${state ? state.name : "default"}.png`);
  const entry = await capture(browser, {
    url,
    file,
    width,
    height: plan.height || 900,
    theme: plan.themes[themeName],
    storageState: side.storageState,
    timeoutMs: plan.timeoutMs || 90000,
    waitFor: route.waitFor,
    waitMs: route.settleMs ?? plan.settleMs ?? 500,
    hide: route.hide,
    mask: route.mask,
    padding: state ? (state.pad ?? 32) : 0,
    maxHeight: plan.maxHeight || 6000,
    drive: state ? (page) => driveState(page, state) : undefined,
    // A state compares only the driven element and what it contains; the
    // default capture of the same route covers the rest of the page.
    inspect: (page, { locator, clip }) =>
      state
        ? locator.elementHandle().then((el) => fingerprint(page, STYLE_PROPS, el, Infinity))
        : fingerprint(page, STYLE_PROPS, null, clip.height),
  });
  const errors = { pageErrors: entry.pageErrors, consoleErrors: entry.consoleErrors };
  if (!entry.ok) throw Object.assign(new Error(entry.error), errors);
  const meta = { expandedTo: entry.expandedTo ?? null, truncatedAt: entry.truncatedAt ?? null };
  return { file, fp: entry.inspected, url, meta, warnings: entry.warnings, ...errors };
}

async function main() {
  const planPath = process.argv[2];
  if (!planPath) fail("usage: node capture.mjs <plan.json>");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  for (const k of ["out", "sides", "widths", "themes", "routes"]) if (!plan[k]) fail(`plan is missing "${k}"`);
  if (!plan.sides.base?.url || !plan.sides.head?.url) fail(`plan.sides needs base.url and head.url`);
  let playwright;
  try {
    playwright = loadPlaywright({ usage: "node capture.mjs <plan.json>" });
  } catch (error) {
    fail(error.message);
  }
  const browser = await launchBrowser(playwright);
  const report = { plan: path.resolve(planPath), base: plan.sides.base.url, head: plan.sides.head.url, shots: [], errors: [] };
  const threshold = plan.threshold ?? 0.1;

  for (const route of plan.routes) {
    const states = [null, ...(route.states || [])];
    for (const width of plan.widths) {
      for (const themeName of Object.keys(plan.themes)) {
        for (const state of states) {
          const label = `${route.path} ${width} ${themeName} ${state ? state.name : "default"}`;
          const shot = { route: route.path, width, theme: themeName, state: state ? state.name : "default" };
          let sideName;
          try {
            const res = {};
            for (sideName of ["base", "head"]) {
              const dir = path.join(plan.out, sideName, slug(route.path));
              fs.mkdirSync(dir, { recursive: true });
              res[sideName] = await captureOne(browser, plan.sides[sideName], plan, route, width, themeName, state, dir);
            }
            sideName = null;
            const diffDir = path.join(plan.out, "diff", slug(route.path));
            fs.mkdirSync(diffDir, { recursive: true });
            const diffFile = path.join(diffDir, path.basename(res.head.file));
            const sideDir = path.join(plan.out, "side-by-side", slug(route.path));
            fs.mkdirSync(sideDir, { recursive: true });
            const sideFile = path.join(sideDir, path.basename(res.head.file));
            Object.assign(shot, {
              base: res.base.file,
              head: res.head.file,
              pixels: pixelDiff(res.base.file, res.head.file, diffFile, sideFile, threshold),
              dom: compareFingerprints(res.base.fp, res.head.fp, plan.maxEntries || 40),
              notes: { base: res.base.meta, head: res.head.meta },
              warnings: { base: res.base.warnings, head: res.head.warnings },
              pageErrors: { base: res.base.pageErrors, head: res.head.pageErrors },
              consoleErrors: { base: res.base.consoleErrors, head: res.head.consoleErrors },
            });
            report.shots.push(shot);
            const p = shot.pixels, d = shot.dom;
            const cut = shot.notes.head.truncatedAt ? `, cut at ${shot.notes.head.truncatedAt}px` : "";
            console.log(`${label}: ${(p.changedRatio * 100).toFixed(2)}% px, ${p.regionCount} regions, height ${p.sizeBase[1]}->${p.sizeHead[1]}${cut}, style ${d.styleCount} in ${d.styleGroups.length} groups, content ${d.contentCount}, only-base ${d.onlyBaseCount}, only-head ${d.onlyHeadCount}`);
            for (const side of ["base", "head"]) {
              const r = res[side];
              if (r.warnings.length) console.log(`  ${side} warnings: ${r.warnings.join("; ")}`);
              if (r.consoleErrors.length) console.log(`  ${side} console errors: ${r.consoleErrors.length}, first: ${r.consoleErrors[0].split("\n")[0]}`);
            }
          } catch (err) {
            const message = String(err.message || err);
            report.errors.push({
              ...shot,
              ...(sideName ? { side: sideName } : {}),
              error: sideName ? `${sideName}: ${message}` : message,
              pageErrors: err.pageErrors ?? [],
              consoleErrors: err.consoleErrors ?? [],
            });
            console.error(`${label}: FAILED ${sideName ? `${sideName}: ` : ""}${message}`);
          }
        }
      }
    }
  }
  await browser.close();
  fs.mkdirSync(plan.out, { recursive: true });
  const reportPath = path.join(plan.out, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nreport: ${reportPath}`);
  console.log(`shots: ${report.shots.length}, failed: ${report.errors.length}`);
  if (report.errors.length) process.exit(1);
}

main().catch((err) => fail(err.stack || String(err)));
