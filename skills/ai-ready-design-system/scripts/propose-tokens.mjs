#!/usr/bin/env node
// Proposes the nearest project token for every hard-coded or palette value scan.mjs finds. Never edits files.
// Usage: node propose-tokens.mjs [repo-root] [scan.mjs options] [--limit N]
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { walk, collectProjectTokens, parseColor, deltaEOK, toPx } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let limit = Infinity;
const li = argv.indexOf("--limit");
if (li >= 0) { limit = Number(argv[li + 1]); argv.splice(li, 2); }
const rootArg = argv.find((a, i) => !a.startsWith("--") && !["--ds", "--exclude", "--figma"].includes(argv[i - 1])) || ".";
const root = path.resolve(rootArg);

let scan;
try {
  scan = JSON.parse(execFileSync(process.execPath, [path.join(here, "scan.mjs"), ...argv, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.error(`propose-tokens.mjs: scan.mjs failed: ${(e.stderr || e.message).toString().trim()}`);
  process.exit(2);
}
const hits = scan.criteria.find((c) => c.id === 2).metrics.hits;
const tokens = collectProjectTokens(root, walk(root));

// Tailwind default scales, used only when the project has no tokens of that kind.
const TW_SPACING = { "0.5": 2, 1: 4, "1.5": 6, 2: 8, "2.5": 10, 3: 12, "3.5": 14, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 20: 80, 24: 96, 28: 112, 32: 128 };
const TW_RADIUS = { sm: 2, DEFAULT: 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24 };
const TW_TEXT = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const PALETTE_HEX = { black: "#000000", white: "#ffffff" };

const colorTokens = [...tokens.color.entries()].map(([name, v]) => ({ name, rgb: parseColor(v) })).filter((t) => t.rgb);
const lengthScale = (cat, fallback) => {
  const own = [...tokens[cat].entries()].map(([name, v]) => ({ name, px: toPx(String(v ?? "").replace(/^calc\(.*$/, "")) })).filter((t) => t.px != null);
  if (cat === "radius") {
    // shadcn style: lg = var(--radius), md = calc(var(--radius) - 2px), sm = calc(var(--radius) - 4px)
    const base = tokens.radius.get("base") ?? tokens.radius.get("");
    const basePx = toPx(base);
    if (basePx != null) for (const [k, v] of tokens.radius) {
      const m = String(v ?? "").match(/^calc\(var\(--radius\)\s*-\s*(\d+)px\)$/);
      if (m) own.push({ name: k, px: basePx - Number(m[1]) });
      else if (/^var\(--radius\)$/.test(String(v))) own.push({ name: k, px: basePx });
    }
  }
  const merged = new Map(Object.entries(fallback).map(([name, px]) => [name, { name, px, framework: true }]));
  for (const t of own) merged.set(t.name, t);
  return [...merged.values()];
};
const TW_LEADING = { 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 9: 36, 10: 40 };
const scales = { spacing: lengthScale("spacing", TW_SPACING), radius: lengthScale("radius", TW_RADIUS), type: lengthScale("type", TW_TEXT), leading: Object.entries(TW_LEADING).map(([name, px]) => ({ name, px, framework: true })) };

// `bg-[#f0f0f0]/50` -> `bg-secondary/50`; anything that is not a class gets the bare token name.
function asClass(current, token) {
  const variants = current.slice(0, current.length - current.split(":").pop().length);
  const last = current.split(":").pop();
  const m = last.match(/^(!?-?[a-z]+(?:-[a-z]+)*?-)(\[[^\]]+\]|[a-z]+(?:-\d+)?)(\/[\w.[\]%]+)?$/);
  if (!m) return token;
  const name = token === "DEFAULT" ? m[1].slice(0, -1) : m[1] + token;
  return variants + name + (m[3] || "");
}

const ROLE = {
  text: /foreground|text|fg|content/i,
  bg: /^(?!.*foreground).*(background|bg|surface|card|popover|primary|secondary|muted|accent|destructive|panel|base)/i,
  border: /border|input|ring|outline|divider|stroke/i,
};
const roleOf = (value) => {
  const p = value.split(":").pop().replace(/^!/, "");
  if (/^text-/.test(p)) return "text";
  if (/^bg-/.test(p)) return "bg";
  if (/^(border|ring|outline|divide)/.test(p)) return "border";
  return null;
};

const rows = [];
for (const h of hits) {
  const value = h.value;
  if (h.category === "color") {
    const literal = (value.match(/#[0-9a-f]{3,8}\b|(rgba?|hsla?)\([^)]*\)/i) || [])[0]?.replace(/_/g, " ");
    const paletteName = h.kind === "palette" ? value.split(":").pop().replace(/^!?-?[a-z]+(-[trblxyse])?-/, "").split("/")[0] : null;
    const rgb = parseColor(literal) || (paletteName && parseColor(PALETTE_HEX[paletteName]));
    if (!rgb) { rows.push({ ...h, proposal: null, note: "no exact value (framework palette shade); map by role by hand" }); continue; }
    const role = roleOf(value);
    let pool = role ? colorTokens.filter((t) => ROLE[role].test(t.name)) : colorTokens;
    let note = role ? `role ${role}` : "role unclear, check by hand";
    if (!pool.length) { pool = colorTokens; note = `no ${role} token, nearest by value only`; }
    if (!pool.length) { rows.push({ ...h, proposal: null, note: "no project color tokens to map to" }); continue; }
    const best = pool.map((t) => ({ t, d: deltaEOK(rgb, t.rgb) })).sort((a, b) => a.d - b.d)[0];
    const verdict = best.d < 0.5 ? "exact" : best.d <= 2 ? "within tolerance" : "gap";
    rows.push({ ...h, proposal: /^[\w:!-]+-(\[|[a-z])/.test(value) && !/^[a-z-]+:\s/.test(value) ? asClass(value, best.t.name) : best.t.name, difference: `dE OK ${best.d.toFixed(1)}`, verdict, note });
  } else {
    const inner = (value.match(/\[([^\]]+)\]/) || [])[1] || (value.match(/:\s*([\d.]+(px|rem|em)?)/) || [])[1];
    const px = toPx(inner?.replace(/_/g, ""));
    if (px == null) { rows.push({ ...h, proposal: null, note: "value not a single length" }); continue; }
    const last = value.split(":").pop();
    if (/^-?tracking-|letter-spacing/.test(last)) { rows.push({ ...h, proposal: null, note: "letter-spacing has no length scale; set a type token by hand" }); continue; }
    const scale = /^leading-|line-height/.test(last) ? scales.leading : scales[h.category];
    const best = scale.map((t) => ({ t, d: Math.abs(t.px - px) })).sort((a, b) => a.d - b.d)[0];
    const verdict = best.d === 0 ? "exact" : best.d <= 2 ? "within tolerance" : "gap";
    rows.push({ ...h, proposal: asClass(value, best.t.name), difference: `${best.d}px (${px}px vs ${best.t.px}px)`, verdict, note: best.t.framework ? "framework scale step" : "project token" });
  }
}

const count = (v) => rows.filter((r) => r.verdict === v).length;
const out = [];
out.push(`# Token swap proposals: ${scan.repo} at ${scan.commit}`, "");
out.push(`${rows.length} values: ${count("exact")} exact, ${count("within tolerance")} within tolerance (colors dE OK 2, lengths 2px), ${count("gap")} gaps, ${rows.filter((r) => !r.proposal).length} need a person. Nothing was changed.`, "");
out.push("| Location | Category | Current | Proposed token | Difference | Verdict | Note |", "|---|---|---|---|---|---|---|");
const order = { exact: 0, "within tolerance": 1, gap: 2, undefined: 3 };
for (const r of rows.sort((a, b) => order[a.verdict] - order[b.verdict] || a.at.localeCompare(b.at)).slice(0, limit)) {
  out.push(`| ${r.at} | ${r.category} | \`${r.value}\` | ${r.proposal ? `\`${r.proposal}\`` : "none"} | ${r.difference ?? ""} | ${r.verdict ?? "manual"} | ${r.note ?? ""} |`);
}
if (rows.length > limit) out.push("", `${rows.length - limit} more rows not shown (--limit).`);
console.log(out.join("\n"));
