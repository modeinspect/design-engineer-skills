#!/usr/bin/env node
// Scores a repo against the AI-ready design system rubric (rubric.md). Read-only.
// Usage: node scan.mjs [repo-root] [--ds <dir>]... [--exclude <dir>]... [--figma names.json] [--json] [--all]
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  RUBRIC_VERSION, walk, read, exists, lineOf, isScript, isMarkupComponent, isStyle, isStory, isTest,
  isNextRouteFile, isTokenDefinitionFile, uiFiles, detectDsDirs, inDirs, detectStack, loadPathAliases,
  makeResolver, parseImports, exportedComponents, classifyClass, stringLiterals, collectProjectTokens,
  tokenNameSets, stripComments,
} from "./lib.mjs";

// ---------- args ----------
const argv = process.argv.slice(2);
const opts = { root: ".", ds: [], exclude: [], figma: null, json: false, all: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--ds") opts.ds.push(argv[++i]);
  else if (a === "--exclude") opts.exclude.push(argv[++i]);
  else if (a === "--figma") opts.figma = argv[++i];
  else if (a === "--json") opts.json = true;
  else if (a === "--all") opts.all = true;
  else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 3).join("\n")); process.exit(0); }
  else if (a.startsWith("--")) fail(`unknown option ${a}`);
  else opts.root = a;
}
const root = path.resolve(opts.root);

function fail(msg) {
  console.error(`scan.mjs: ${msg}`);
  process.exit(2);
}

// --ds and --exclude take a path relative to the repo root (`./x`, `x`, `x/`)
// or an absolute path inside it, and become the root-relative form the walked
// file list uses. A path that does not exist is an error, never a no-op.
// Both sides go through realpath, so /tmp and /private/tmp compare equal.
function rootRelative(flag, arg) {
  if (!arg) fail(`${flag} needs a path`);
  const abs = path.resolve(root, arg);
  if (!fs.existsSync(abs)) fail(`${flag} ${arg} does not exist (resolved to ${abs})`);
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(abs)).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail(`${flag} ${arg} is outside the repo root ${root}`);
  if (!rel) fail(`${flag} ${arg} is the repo root; name a folder inside it`);
  return rel;
}
opts.ds = opts.ds.map((d) => rootRelative("--ds", d));
opts.exclude = opts.exclude.map((d) => rootRelative("--exclude", d));

// ---------- inputs ----------
const stack = detectStack(root);
if (stack.error) fail(stack.error);
if (!stack.react) fail(`no react dependency in package.json; rubric v${RUBRIC_VERSION} scores React-family repos only${stack.vue ? " (Vue detected)" : stack.svelte ? " (Svelte detected)" : ""}`);

const files = walk(root).filter((f) => !inDirs(f, opts.exclude));
const fileSet = new Set(files);
const resolve = makeResolver(fileSet, loadPathAliases(root));
const texts = new Map();
const text = (f) => { if (!texts.has(f)) texts.set(f, read(root, f)); return texts.get(f); };

const markup = files.filter((f) => isMarkupComponent(f) && !isStory(f) && !isTest(f));
if (!markup.length) fail("no .tsx or .jsx files found");
for (const d of opts.ds) if (!markup.some((f) => inDirs(f, [d]))) fail(`--ds ${d} contains no .tsx or .jsx component files (after --exclude and the ignored build folders)`);
const dsDirs = detectDsDirs(markup, opts.ds);
const isDs = (f) => inDirs(f, dsDirs);
const libraries = stack.libraries;
const layer = dsDirs.length ? "local" : libraries.length ? "library" : "none";

const tokens = collectProjectTokens(root, files);
const tokenNames = tokenNameSets(tokens);

let sha = null;
try { sha = execFileSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { sha = null; }

const pct = (n) => (n == null ? "n/a" : `${Math.round(n * 1000) / 10}%`);
const loc = (f, t, i) => `${f}:${lineOf(t)(i)}`;

// ---------- inventory ----------
const defs = [];
for (const f of markup) {
  const t = text(f);
  for (const [name, index] of exportedComponents(f, t)) defs.push({ name, file: f, index, ds: isDs(f), route: isNextRouteFile(f) });
}
const dsDefs = defs.filter((d) => d.ds);
const dsNames = new Set(dsDefs.map((d) => d.name));

// imports: DS module -> specifier counts; per file: local binding -> component
const importsInto = new Map();
const bindingsByFile = new Map();
for (const f of files) {
  if (!isScript(f) || isTest(f)) continue;
  const t = text(f);
  const local = new Map();
  for (const imp of parseImports(t)) {
    const target = resolve(f, imp.spec);
    const lib = libraries.find((l) => imp.spec === l || imp.spec.startsWith(l + "/"));
    if (target && isDs(target) && !isDs(f)) {
      if (!importsInto.has(target)) importsInto.set(target, new Map());
      const specs = importsInto.get(target);
      if (!specs.has(imp.spec)) specs.set(imp.spec, []);
      specs.get(imp.spec).push(loc(f, t, imp.index));
    }
    for (const b of imp.bindings) {
      if (target && isDs(target)) local.set(b.local, { kind: "ds", target, name: b.imported === "default" ? b.local : b.imported });
      else if (lib && /^[A-Z]/.test(b.local) && !/Provider$|^(CssBaseline|GlobalStyles|ScopedCssBaseline)$/.test(b.imported === "default" ? b.local : b.imported)) local.set(b.local, { kind: "library", target: imp.spec, name: b.imported === "default" ? b.local : b.imported });
    }
  }
  bindingsByFile.set(f, local);
}

function tagAt(t, start) {
  let depth = 0, quote = null;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (quote) { if (c === quote && t[i - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { if (depth > 0 || c !== "`") quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return t.slice(start, i + 1);
  }
  return t.slice(start);
}

function attrValue(tag, attr) {
  const re = new RegExp(`\\s${attr}=(\\{|"|')`);
  const m = re.exec(tag);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (m[1] !== "{") return tag.slice(i, tag.indexOf(m[1], i));
  let depth = 1;
  for (let j = i; j < tag.length; j++) {
    if (tag[j] === "{") depth++;
    else if (tag[j] === "}" && --depth === 0) return tag.slice(i, j);
  }
  return tag.slice(i);
}

// ---------- criterion 1: discoverable ----------
const PREFIX = /^(Primary|Secondary|Base|Custom|New|Old|My|Shared|Common|Styled|Default|Simple|Basic|App)(?=[A-Z])/;
const SUFFIX = /(V\d+|New|Old|Legacy|Copy|Component|Wrapper|\d+)$/;
const ALIAS = { Btn: "Button", Modal: "Dialog", TextField: "Input", TextInput: "Input", Spinner: "Loader", TextArea: "Textarea" };
const normalizeName = (n) => { let x = n; for (let k = 0; k < 3; k++) x = x.replace(PREFIX, "").replace(SUFFIX, "") || x; return ALIAS[x] || x; };
const deprecatedAt = (d) => { const t = text(d.file); return /@deprecated/.test(t.slice(Math.max(0, d.index - 600), d.index)) || /@deprecated/.test(t.slice(0, 300)); };

const COPY_FILE = /(\scopy(\s?\d+)?|[-_.]copy\d*|\s\(\d+\)|\s\d+|[-_.]old|[-_.]bak|[-_.]backup|[-_.]v\d+)\.(tsx|jsx)$/i;
const candidates = defs.filter((d) => !d.route && !COPY_FILE.test(d.file));
const byName = new Map();
for (const d of candidates) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }
const dupGroups = [];
for (const [name, list] of byName) {
  const filesOf = [...new Set(list.map((d) => d.file))];
  if (filesOf.length > 1) dupGroups.push({ type: "same name", label: name, members: list });
}
const byNorm = new Map();
for (const d of candidates) { const n = normalizeName(d.name); if (!byNorm.has(n)) byNorm.set(n, []); byNorm.get(n).push(d); }
for (const [n, list] of byNorm) {
  const names = [...new Set(list.map((d) => d.name))];
  if (names.length > 1 && (list.some((d) => d.ds) || dsNames.has(n))) dupGroups.push({ type: "near name", label: names.join(" / "), members: list });
}
for (const f of markup.filter((x) => COPY_FILE.test(x))) {
  const members = defs.filter((d) => d.file === f);
  dupGroups.push({ type: "copy file", label: f, members: members.length ? members : [{ name: path.basename(f), file: f, index: 0 }] });
}
for (const g of dupGroups) g.resolved = g.members.some(deprecatedAt) && (g.type !== "copy file" || g.members.every(deprecatedAt));
const unresolved = dupGroups.filter((g) => !g.resolved);

let importTotal = 0, importDominant = 0;
const mixedPaths = [];
for (const [target, specs] of importsInto) {
  // Canonical: the most used non-relative specifier, since it reads the same from every file; else the most used one.
  const counts = [...specs.entries()].map(([s, l]) => [s, l.length]).sort((a, b) => (a[0].startsWith(".") - b[0].startsWith(".")) || b[1] - a[1]);
  const total = counts.reduce((a, [, c]) => a + c, 0);
  importTotal += total; importDominant += counts[0][1];
  if (counts.length > 1) mixedPaths.push({ target, canonical: counts[0][0], others: counts.slice(1).map(([s, c]) => ({ spec: s, count: c, at: specs.get(s).slice(0, 3) })) });
}
const importConsistency = importTotal ? importDominant / importTotal : null;

const RAW_EQUIV = { button: ["Button"], input: ["Input"], select: ["Select"], textarea: ["Textarea"], dialog: ["Dialog"] };
const LIB_EQUIV = { button: "Button", input: "TextField|Input", select: "Select", textarea: "TextField|Textarea|TextArea", dialog: "Dialog|Modal" };
let rawEls = 0, dsEls = 0;
const rawElAt = [];
for (const f of markup.filter((x) => !isDs(x))) {
  const t = text(f);
  const bindings = bindingsByFile.get(f) || new Map();
  for (const [el, eq] of Object.entries(RAW_EQUIV)) {
    const available = layer === "local" ? eq.some((n) => dsNames.has(n)) : layer === "library";
    if (!available) continue;
    const re = new RegExp(`<${el}[\\s>/]`, "g");
    let m;
    while ((m = re.exec(t))) { rawEls++; rawElAt.push(`${loc(f, t, m.index)} <${el}>`); }
    for (const [localName, b] of bindings) {
      const matches = layer === "local" ? eq.includes(normalizeName(b.name)) : new RegExp(`^(${LIB_EQUIV[el]})$`).test(b.name);
      if (!matches) continue;
      dsEls += (t.match(new RegExp(`<${localName}[\\s>/]`, "g")) || []).length;
    }
  }
}
const bypassShare = rawEls + dsEls ? rawEls / (rawEls + dsEls) : 0;
const deprecatedCount = files.filter((f) => isScript(f)).reduce((a, f) => a + (text(f).match(/@deprecated/g) || []).length, 0);

function scoreDiscoverable() {
  if (layer === "none") return 0;
  const c = importConsistency ?? 1;
  if (unresolved.length === 0 && c >= 0.95 && bypassShare <= 0.1) return 3;
  if (unresolved.length <= 2 && c >= 0.85 && bypassShare <= 0.25) return 2;
  return 1;
}

// ---------- criterion 2: tokens in code ----------
const usage = { color: { token: 0, palette: 0, raw: 0, unknown: 0 }, spacing: { token: 0, raw: 0, unknown: 0 }, radius: { token: 0, raw: 0, unknown: 0 }, type: { token: 0, raw: 0, unknown: 0 } };
const rawHits = [];
const unknownClasses = new Map();
const layerCounts = { ds: { raw: 0, total: 0 }, other: { raw: 0, total: 0 } };
const COLOR_IN_TEXT = /(^|[\s(,:"'=])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))(?![\w-])|\b((?:rgba?|hsla?)\(\s*\d[^)]*\))/g;

function record(f, t, index, cat, kind, value) {
  usage[cat][kind] = (usage[cat][kind] || 0) + 1;
  if (kind === "unknown") { unknownClasses.set(value, (unknownClasses.get(value) || 0) + 1); return; }
  const bucket = isDs(f) ? layerCounts.ds : layerCounts.other;
  bucket.total++;
  if (kind === "raw" || kind === "palette") bucket.raw++;
  if (kind === "raw" || kind === "palette") rawHits.push({ at: loc(f, t, index), category: cat, kind, value });
}

const scanned = uiFiles(files).filter((f) => !isTokenDefinitionFile(f, text(f)));
for (const f of scanned) {
  const t = text(f);
  if (isStyle(f)) {
    const body = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    const decl = /(^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)(?=[;}])/g;
    let m;
    while ((m = decl.exec(body))) {
      const [prop, value] = [m[2], m[3].trim()];
      const at = m.index + m[1].length;
      if (prop.startsWith("--")) continue;
      let cat = null;
      if (/^(color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-decoration-color|caret-color|accent-color)$/.test(prop)) cat = "color";
      else if (/^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/.test(prop)) cat = "spacing";
      else if (/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)) cat = "radius";
      else if (/^(font-size|line-height|letter-spacing)$/.test(prop)) cat = "type";
      if (!cat) continue;
      const noVar = value.replace(/var\([^)]*\)/g, "");
      if (cat === "color") {
        if (/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch)\(\s*\d/i.test(noVar)) record(f, body, at, cat, "raw", `${prop}: ${value}`);
        else if (/var\(/.test(value)) record(f, body, at, cat, "token", value);
      } else if (/var\(|theme\(/.test(value)) record(f, body, at, cat, "token", value);
      else if (/\d*\.?\d+(px|rem|em)\b/.test(noVar) && !/^0(px)?$/.test(noVar.trim())) record(f, body, at, cat, "raw", `${prop}: ${value}`);
    }
    const apply = /@apply\s+([^;]+);/g;
    while ((m = apply.exec(body))) for (const cls of m[1].split(/\s+/)) {
      const c = classifyClass(cls, tokenNames);
      if (c) record(f, body, m.index, c.category, c.kind, c.value);
    }
    continue;
  }
  const code = t.replace(/^\s*import\s[^;]*;?$/gm, (m) => m.replace(/[^\n]/g, " "));
  for (const lit of stringLiterals(code)) {
    let rest = lit.value;
    for (const cls of lit.value.split(/\s+/)) {
      if (!cls) continue;
      const c = classifyClass(cls, tokenNames);
      if (c) { record(f, code, lit.index, c.category, c.kind, c.value); rest = rest.replace(cls, " "); }
    }
    let m;
    COLOR_IN_TEXT.lastIndex = 0;
    while ((m = COLOR_IN_TEXT.exec(rest))) record(f, code, lit.index, "color", "raw", m[2] || m[3]);
  }
  const blockRe = /\b(style|sx)=\{\{/g;
  let bm;
  while ((bm = blockRe.exec(code))) {
    let depth = 2, j = bm.index + bm[0].length;
    for (; j < code.length && depth > 0; j++) { if (code[j] === "{") depth++; else if (code[j] === "}") depth--; }
    const block = code.slice(bm.index + bm[0].length, j);
    const prop = /\b([a-zA-Z]+)\s*:\s*(-?\d*\.?\d+\b(?!\s*[%*/+])|["'][^"']*["'])/g;
    let pm;
    while ((pm = prop.exec(block))) {
      const [name, val] = [pm[1], pm[2]];
      let cat = null;
      if (/^(padding|margin)(Top|Right|Bottom|Left|Inline|Block|X|Y)?$|^(gap|rowGap|columnGap)$/.test(name) || (bm[1] === "sx" && /^[pm][trblxy]?$/.test(name))) cat = "spacing";
      else if (name === "borderRadius") cat = "radius";
      else if (/^(fontSize|lineHeight|letterSpacing)$/.test(name)) cat = "type";
      else if (bm[1] === "sx" && /^(color|bgcolor|backgroundColor|borderColor)$/.test(name) && /^["'][a-z]+\.[a-z]+["']$/i.test(val)) { record(f, code, bm.index, "color", "token", val); continue; }
      if (!cat) continue;
      const quoted = /^["']/.test(val);
      const v = quoted ? val.slice(1, -1) : val;
      if (/var\(|theme/.test(v)) record(f, code, bm.index, cat, "token", `${name}: ${v}`);
      else if (!quoted && bm[1] === "sx" && cat !== "type") record(f, code, bm.index, cat, "token", `${name}: ${v}`);
      else if (!quoted && Number(v) !== 0 && !(cat === "type" && name === "lineHeight")) record(f, code, bm.index, cat, "raw", `${bm[1]} ${name}: ${v}`);
      else if (quoted && /\d*\.?\d+(px|rem|em)$/.test(v) && !/^0(px)?$/.test(v)) record(f, code, bm.index, cat, "raw", `${bm[1]} ${name}: ${v}`);
    }
  }
}
const totals = Object.values(usage).reduce((a, u) => ({ token: a.token + u.token, palette: a.palette + (u.palette || 0), raw: a.raw + u.raw }), { token: 0, palette: 0, raw: 0 });
const scoredTotal = totals.token + totals.palette + totals.raw;
const categoryShares = {};
for (const [cat, u] of Object.entries(usage)) {
  const n = u.token + (u.palette || 0) + u.raw;
  if (n) categoryShares[cat] = (u.raw + (u.palette || 0)) / n;
}
const shareList = Object.values(categoryShares);
// Each category weighs the same, so a large spacing count cannot hide off-token colors.
const untokenizedShare = shareList.length ? shareList.reduce((a, b) => a + b, 0) / shareList.length : null;
const hardcodedShare = scoredTotal ? totals.raw / scoredTotal : null;
const colorTokenCount = tokens.color.size;

function scoreTokens() {
  if (untokenizedShare == null) return 0;
  if (untokenizedShare <= 0.05 && colorTokenCount >= 4) return 3;
  if (untokenizedShare <= 0.15 && colorTokenCount >= 4) return 2;
  if (untokenizedShare <= 0.4 || colorTokenCount >= 4) return 1;
  return 0;
}

// ---------- criterion 3: typed variants ----------
const VARIANT_PROP = /^\s*(?:readonly\s+)?(variant|size|color|tone|intent|kind|appearance|shape|emphasis|density|status)\??\s*:\s*([^;\n]+)/gm;
const dsFiles = [...new Set(dsDefs.map((d) => d.file))];
let variantApiFiles = 0;
const untypedProps = [];
for (const f of dsFiles) {
  const t = text(f);
  let has = /\b(cva|tv)\s*\(|VariantProps\s*</.test(t);
  let m;
  VARIANT_PROP.lastIndex = 0;
  while ((m = VARIANT_PROP.exec(t))) {
    const type = m[2].trim();
    if (/^string\b(?!\s*\|)/.test(type) || /^any\b/.test(type)) untypedProps.push(`${loc(f, t, m.index)} ${m[1]}: ${type.replace(/[;,]$/, "")}`);
    else if (/["'][^"']+["']\s*\|/.test(type) || /^[A-Z]\w*/.test(type)) has = true;
  }
  if (has) variantApiFiles++;
}
let callSites = 0, overrides = 0;
const overrideAt = [];
for (const f of markup.filter((x) => !isDs(x))) {
  const t = text(f);
  for (const [localName, b] of bindingsByFile.get(f) || []) {
    if (b.kind === "ds" && !dsNames.has(b.name)) continue;
    const re = new RegExp(`<${localName.replace(/\$/g, "\\$")}(?=[\\s/>])`, "g");
    let m;
    while ((m = re.exec(t))) {
      callSites++;
      const tag = tagAt(t, m.index);
      const cls = attrValue(tag, "className");
      let visual = [];
      if (cls) for (const lit of stringLiterals(cls.startsWith('"') ? cls : `"${cls.replace(/"/g, " ")}"`).concat(stringLiterals(cls))) {
        for (const c of lit.value.split(/\s+/)) {
          const k = classifyClass(c, tokenNames);
          if (k && (k.category !== "spacing" || /^-?p[trblxyse]?-/.test(c.split(":").pop()))) visual.push(c);
        }
      }
      const inline = ["sx", "style"].some((a) => { const v = attrValue(tag, a); return v && /\b(color|bgcolor|background\w*|border\w*|padding\w*|p[trblxy]?|font\w*|borderRadius)\s*:/.test(v); });
      if (visual.length || inline) { overrides++; overrideAt.push(`${loc(f, t, m.index)} <${localName}> ${[...new Set(visual)].slice(0, 6).join(" ")}${inline ? " (inline style)" : ""}`); }
    }
  }
}
const overrideShare = callSites ? overrides / callSites : null;
const hasVariantApi = layer === "library" || variantApiFiles > 0;

function scoreVariants() {
  if (layer === "none") return 0;
  if (callSites === 0) return 1;
  if (untypedProps.length === 0 && hasVariantApi && overrideShare <= 0.1) return 3;
  if (untypedProps.length <= 1 && hasVariantApi && overrideShare <= 0.25) return 2;
  return 1;
}

// ---------- criterion 4: documented for agents ----------
const RULES_RE = /^(DESIGN\.md|AGENTS\.md|CLAUDE\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.cursor\/rules\/.+\.(md|mdc)|\.claude\/(rules|skills)\/.+\.md|docs\/.*design.*\.(md|mdx))$/i;
const codeSpansOf = (t) => (t.match(/`[^`\n]+`|```[\s\S]*?```/g) || []).join(" ");
const wordIn = (n, t) => new RegExp(`\\b${n.replace(/[$]/g, "\\$")}\\b`).test(t);
const tokenIn = (n, spans) => new RegExp(`(^|[^\\w-])(--)?(color-)?${n.replace(/[-.]/g, (c) => "\\" + c)}(?![\\w-])`).test(spans);
const libNamesUsed = new Set();
for (const m of bindingsByFile.values()) for (const b of m.values()) if (b.kind === "library") libNamesUsed.add(b.name);
const docComponents = layer === "local" ? [...dsNames] : [...libNamesUsed];
const colorNames = [...tokens.color.keys()];

// Agent skills installed into the repo (.claude/skills, .cursor/skills,
// .github/skills) are mostly third-party and talk about tokens in general. A
// skill file counts as the repo's own rules only when it names one of this
// repo's components (by word) or color tokens (in a code span). Skills from
// this pack never count.
const SKILL_DIR = /^((?:.*\/)?\.(?:claude|cursor|github)\/skills)\/([^/]+)/;
const PACK_MARK = "Modeinspect design engineer skills";
const skillFolderOf = (f) => { const m = SKILL_DIR.exec(f); return m ? `${m[1]}/${m[2]}` : null; };
const isPackSkill = (folder) => {
  const skillMd = fileSet.has(`${folder}/SKILL.md`) ? `${folder}/SKILL.md` : fileSet.has(folder) ? folder : null;
  return Boolean(skillMd && text(skillMd).includes(PACK_MARK));
};
// Color tokens only, as below: spacing and radius keys (`sm`, `lg`, `4`) appear in any skill.
const namesRepo = (t) => docComponents.some((n) => wordIn(n, t)) || colorNames.some((n) => tokenIn(n, codeSpansOf(t)));
const ruleCandidates = files.filter((f) => RULES_RE.test(f) || (/\.(md|mdx)$/i.test(f) && isDs(f)) || /(^|\/)(AGENTS|CLAUDE|DESIGN)\.md$/.test(f));
const excludedRules = { pack: [], generic: [] };
const rulesFiles = ruleCandidates.filter((f) => {
  const folder = skillFolderOf(f);
  if (!folder) return true;
  if (isPackSkill(folder)) { excludedRules.pack.push(f); return false; }
  if (!namesRepo(text(f))) { excludedRules.generic.push(f); return false; }
  return true;
});
const rulesText = rulesFiles.map((f) => text(f)).join("\n");
const codeSpans = codeSpansOf(rulesText);
const mentioned = docComponents.filter((n) => wordIn(n, rulesText));
const tokenMentioned = colorNames.filter((n) => tokenIn(n, codeSpans));
const tokenNeeded = Math.min(10, Math.ceil(colorNames.length * 0.5));
const rulesPass = rulesFiles.length > 0 && docComponents.length > 0 && mentioned.length / docComponents.length >= 0.5 && tokenMentioned.length >= tokenNeeded;

let jsdocItems = 0, jsdocDone = 0;
const undocumented = [];
const precededByJsdoc = (t, i) => /\*\/\s*$/.test(t.slice(Math.max(0, i - 400), i).replace(/\s*(export\s+)?$/, ""));
for (const d of dsDefs) {
  const t = text(d.file);
  jsdocItems++;
  if (precededByJsdoc(t, d.index)) jsdocDone++; else undocumented.push(`${loc(d.file, t, d.index)} ${d.name}`);
}
for (const f of dsFiles) {
  const t = text(f);
  const re = /(interface\s+\w*Props\b[^{]*\{|type\s+\w*Props\s*=\s*(?:[^{;=]*&\s*)?\{)/g;
  let m;
  while ((m = re.exec(t))) {
    let depth = 1, j = m.index + m[0].length;
    const start = j;
    for (; j < t.length && depth > 0; j++) { if (t[j] === "{") depth++; else if (t[j] === "}") depth--; }
    const body = t.slice(start, j - 1);
    let d = 0, lineStart = 0;
    const lines = body.split("\n");
    let prev = "";
    for (const line of lines) {
      if (d === 0 && /^\s*(readonly\s+)?["']?[\w-]+["']?\??\s*:/.test(line)) {
        jsdocItems++;
        if (/\*\/\s*$/.test(prev)) jsdocDone++; else undocumented.push(`${loc(f, t, start + lineStart)} prop ${line.trim().split(/[?:]/)[0]}`);
      }
      for (const c of line) { if (c === "{") d++; else if (c === "}") d--; }
      if (line.trim()) prev = line;
      lineStart += line.length + 1;
    }
  }
}
const jsdocShare = layer === "library" && !dsDefs.length ? (libNamesUsed.size ? 1 : 0) : jsdocItems ? jsdocDone / jsdocItems : 0;

const exampleFiles = files.filter((f) => isStory(f) || /\.(examples?|demo)\.(tsx|jsx|mdx)$/.test(f));
const covered = new Set();
for (const f of exampleFiles) for (const imp of parseImports(text(f))) { const tgt = resolve(f, imp.spec); if (tgt && isDs(tgt)) covered.add(tgt); }
const exampleShare = layer === "library" && !dsFiles.length ? (libNamesUsed.size ? 1 : 0) : dsFiles.length ? dsFiles.filter((f) => covered.has(f)).length / dsFiles.length : 0;
const docPoints = { rules: rulesPass ? 1 : 0, jsdoc: jsdocShare >= 0.5 ? 1 : 0, examples: exampleShare >= 0.5 ? 1 : 0 };

// ---------- criterion 5: matches the design file ----------
const codeConnectFiles = files.filter((f) => /\.figma\.(tsx|ts|jsx|js)$/.test(f) || /(^|\/)figma\.config\.json$/.test(f));
let figma = null;
if (opts.figma) {
  try { figma = JSON.parse(fs.readFileSync(path.resolve(opts.figma), "utf8")); } catch (e) { fail(`cannot read --figma ${opts.figma}: ${e.message}`); }
  if (!Array.isArray(figma.components)) fail("--figma file needs a components array (and optionally tokens)");
}
const norm = (s) => String(s).split(/[/=,]/)[0].toLowerCase().replace(/^(color|colors)[-/.]?/, "").replace(/[^a-z0-9]/g, "");
const normToken = (s) => String(s).toLowerCase().replace(/^(color|colors)[-/.]?/, "").replace(/[^a-z0-9]/g, "");
let figmaComponentShare = null, figmaTokenShare = null;
const figmaMissing = { components: [], tokens: [] };
if (codeConnectFiles.length) {
  const linked = new Set();
  for (const f of codeConnectFiles) if (isScript(f)) for (const imp of parseImports(text(f))) { const tgt = resolve(f, imp.spec); if (tgt && isDs(tgt)) linked.add(tgt); }
  figmaComponentShare = dsFiles.length ? dsFiles.filter((f) => linked.has(f)).length / dsFiles.length : null;
}
if (figma) {
  const fc = new Set(figma.components.map(norm));
  const pool = layer === "local" ? [...dsNames] : [...libNamesUsed];
  const hits = pool.filter((n) => fc.has(norm(n)));
  figmaMissing.components = pool.filter((n) => !fc.has(norm(n)));
  const share = pool.length ? hits.length / pool.length : null;
  figmaComponentShare = figmaComponentShare == null ? share : Math.max(figmaComponentShare, share ?? 0);
  if (Array.isArray(figma.tokens) && colorNames.length) {
    const ft = new Set(figma.tokens.map(normToken));
    const th = colorNames.filter((n) => ft.has(normToken(n)));
    figmaMissing.tokens = colorNames.filter((n) => !ft.has(normToken(n)));
    figmaTokenShare = th.length / colorNames.length;
  }
}
function scoreFigma() {
  const shares = [figmaComponentShare, figmaTokenShare].filter((s) => s != null);
  if (!shares.length) return null;
  const s = Math.min(...shares);
  return s >= 0.9 ? 3 : s >= 0.7 ? 2 : s >= 0.4 ? 1 : 0;
}

// ---------- criterion 6: enforced ----------
const LINT_FILE = /(^|\/)(\.eslintrc(\.(json|js|cjs|yml|yaml))?|eslint\.config\.(js|mjs|cjs|ts)|\.stylelintrc(\.(json|js|cjs|yml|yaml))?|stylelint\.config\.(js|mjs|cjs)|biome\.jsonc?|\.oxlintrc\.json)$/;
const lintFiles = files.filter((f) => LINT_FILE.test(f) && !f.includes("/node_modules/") && f.split("/").length <= 3);
// Comments are stripped first, so a commented-out rule does not count as active.
const lintText = lintFiles.map((f) => stripComments(text(f), /\.ya?ml$/.test(f) ? "yaml" : "js")).join("\n") + (stack.pkg.eslintConfig ? JSON.stringify(stack.pkg.eslintConfig) : "") + (stack.pkg.stylelint ? JSON.stringify(stack.pkg.stylelint) : "");
const RAW_RULES = ["tailwindcss/no-arbitrary-value", "tailwindcss/no-custom-classname", "better-tailwindcss/no-unregistered-classes", "better-tailwindcss/no-restricted-classes", "better-tailwindcss/enforce-consistent-variable-syntax", "color-no-hex", "color-named", "declaration-property-value-disallowed-list", "scale-unlimited/declaration-strict-value", "declaration-strict-value", "function-disallowed-list"];
const IMPORT_RULES = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports", "import/no-restricted-paths", "no-restricted-modules", "noRestrictedImports"];
function ruleLevel(name) {
  const re = new RegExp(`["']?${name.replace(/[/@.-]/g, (c) => "\\" + c)}["']?\\s*[:=]\\s*(\\[?\\s*)(["']?)(error|warn|off|2|1|0)\\2`, "g");
  let m, best = null;
  while ((m = re.exec(lintText))) {
    const lvl = { error: "error", 2: "error", warn: "warn", 1: "warn", off: "off", 0: "off" }[m[3]];
    if (lvl === "error" || (lvl === "warn" && best !== "error") || (!best)) best = lvl;
  }
  if (!best && name === "noRestrictedImports" && new RegExp(name).test(lintText)) best = "error";
  return best;
}
const rawRuleFound = RAW_RULES.map((r) => [r, ruleLevel(r)]).filter(([, l]) => l && l !== "off");
const restrictedSyntax = ruleLevel("no-restricted-syntax");
if (restrictedSyntax && restrictedSyntax !== "off" && /#\[0-9a-f|\\\[|\[#|px|hex/i.test(lintText.slice(lintText.indexOf("no-restricted-syntax")))) rawRuleFound.push(["no-restricted-syntax (raw values)", restrictedSyntax]);
const importRuleFound = IMPORT_RULES.map((r) => [r, ruleLevel(r)]).filter(([, l]) => l && l !== "off");
const scripts = stack.pkg.scripts || {};
const lintScript = Object.entries(scripts).find(([, v]) => /\b(eslint|next lint|stylelint|biome (lint|check|ci)|oxlint)\b/.test(v));
const ciFiles = files.filter((f) => /^\.github\/workflows\/.+\.ya?ml$|^\.gitlab-ci\.yml$|^\.circleci\/config\.yml$|^(\.husky\/.+|lefthook\.ya?ml|\.lintstagedrc.*)$/.test(f));
const ciLint = ciFiles.filter((f) => /\blint\b|eslint|stylelint|biome/.test(text(f)));
let nextBuildLints = false;
if (stack.framework === "next" && lintFiles.some((f) => /eslint/.test(f)) && /\bnext build\b/.test(scripts.build || "")) {
  const nc = files.find((f) => /^next\.config\.(js|mjs|ts|cjs)$/.test(f));
  const major = Number(String(stack.deps.next || "").replace(/[^\d.]/g, "").split(".")[0]);
  nextBuildLints = major > 0 && major < 16 && !(nc && /ignoreDuringBuilds\s*:\s*true/.test(text(nc)));
}
const wired = ciLint.length > 0 || nextBuildLints;
function scoreEnforced() {
  if (!rawRuleFound.length && !importRuleFound.length) return 0;
  if (!rawRuleFound.length || !importRuleFound.length) return 1;
  const allError = rawRuleFound.some(([, l]) => l === "error") && importRuleFound.some(([, l]) => l === "error");
  return allError && wired ? 3 : 2;
}

// ---------- assemble ----------
const N = opts.all ? Infinity : 8;
const take = (arr) => arr.slice(0, N);
const criteria = [
  {
    id: 1, name: "Discoverable", score: scoreDiscoverable(),
    evidence: layer === "none"
      ? "No design system directory and no UI library found. Pass --ds <dir> if shared components live elsewhere."
      : `${layer === "local" ? `${dsNames.size} components in ${dsDirs.join(", ")}` : `library ${libraries.join(", ")}`}; ${unresolved.length} unresolved duplicate groups; import consistency ${pct(importConsistency)}; raw HTML bypass ${pct(bypassShare)} (${rawEls} raw vs ${dsEls} component uses); ${deprecatedCount} @deprecated tags`,
    findings: [
      ...take(unresolved).map((g) => `Duplicate (${g.type}): ${g.label} in ${[...new Set(g.members.map((d) => d.file))].join(", ")}, none marked @deprecated`),
      ...take(mixedPaths).map((p) => `Mixed import paths for ${p.target}: canonical "${p.canonical}", also ${p.others.map((o) => `"${o.spec}" x${o.count} (${o.at.join(", ")})`).join("; ")}`),
      ...take(rawElAt).map((r) => `Raw element where a component exists: ${r}`),
    ],
    metrics: { layer, dsDirs, components: dsNames.size, duplicateGroups: dupGroups.length, unresolvedDuplicates: unresolved.length, importConsistency, rawElements: rawEls, componentElements: dsEls, bypassShare, deprecatedCount },
  },
  {
    id: 2, name: "Tokens in code", score: scoreTokens(),
    evidence: `${colorTokenCount} color, ${tokens.spacing.size} spacing, ${tokens.radius.size} radius, ${tokens.type.size} type tokens defined; ${scoredTotal} styling values in ${scanned.length} UI files: ${pct(hardcodedShare)} hard-coded, ${pct(totals.palette / (scoredTotal || 1))} framework palette. Not from project tokens, by category: ${Object.entries(categoryShares).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}; mean ${pct(untokenizedShare)}`,
    findings: [
      ...take(rawHits.filter((h) => h.kind === "raw")).map((h) => `Hard-coded ${h.category}: ${h.value} at ${h.at}`),
      ...take(rawHits.filter((h) => h.kind === "palette")).map((h) => `Framework palette color: ${h.value} at ${h.at}`),
    ],
    metrics: { tokenSources: tokens.sources, colorTokens: colorTokenCount, usage, hardcodedShare, categoryShares, untokenizedShare, dsLayer: layerCounts.ds, otherLayer: layerCounts.other, unclassified: [...unknownClasses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15), hits: opts.json ? rawHits : undefined },
  },
  {
    id: 3, name: "Typed variants", score: scoreVariants(),
    evidence: layer === "none" ? "No component layer to expose variants." : `${layer === "local" ? `${variantApiFiles} of ${dsFiles.length} component files expose cva or union-typed variants` : "library components are typed"}; ${untypedProps.length} variant props typed as string; ${overrides} of ${callSites} call sites restyle with className or inline style (${pct(overrideShare)})`,
    findings: [...take(untypedProps).map((p) => `Untyped variant prop: ${p}`), ...take(overrideAt).map((o) => `Style override: ${o}`)],
    metrics: { variantApiFiles, componentFiles: dsFiles.length, untypedProps: untypedProps.length, callSites, overrides, overrideShare },
  },
  {
    id: 4, name: "Documented for agents", score: docPoints.rules + docPoints.jsdoc + docPoints.examples,
    evidence: `${rulesFiles.length ? `rules: ${rulesFiles.join(", ")}` : "no DESIGN.md or agent rules file"}${excludedRules.pack.length + excludedRules.generic.length ? ` (${excludedRules.pack.length + excludedRules.generic.length} skill files not counted, listed below)` : ""}; names ${mentioned.length} of ${docComponents.length} components and ${tokenMentioned.length} color tokens (needs ${tokenNeeded}); JSDoc ${pct(jsdocShare)}${layer === "library" && !dsDefs.length ? " (vendor docs)" : ` of ${jsdocItems} components and props`}; examples cover ${pct(exampleShare)} of component files (${exampleFiles.length} story or example files)`,
    findings: [
      ...(rulesPass ? [] : [`Rules file ${rulesFiles.length ? "incomplete" : "missing"}: ${docComponents.length ? `components not named: ${docComponents.filter((n) => !mentioned.includes(n)).slice(0, 12).join(", ") || "none"}` : "no shared components to name"}; ${tokenMentioned.length} of ${tokenNeeded} required color token names in code spans`]),
      ...(excludedRules.pack.length ? [`Not counted as rules, skills from the Modeinspect design engineer skills pack: ${excludedRules.pack.join(", ")}`] : []),
      ...(excludedRules.generic.length ? [`Not counted as rules, skill files that name none of this repo's components or color tokens: ${excludedRules.generic.join(", ")}`] : []),
      ...take(undocumented).map((u) => `No JSDoc: ${u}`),
      ...(docPoints.examples ? [] : take(dsFiles.filter((f) => !covered.has(f))).map((f) => `No story or example: ${f}`)),
    ],
    metrics: { rulesFiles, excludedSkillFiles: excludedRules, componentsNamed: mentioned.length, components: docComponents.length, tokensNamed: tokenMentioned.length, tokensNeeded: tokenNeeded, jsdocShare, exampleShare, points: docPoints },
  },
  {
    id: 5, name: "Matches the design file", score: scoreFigma(),
    evidence: scoreFigma() == null
      ? "Not checked: no Code Connect files and no Figma names supplied (--figma)."
      : `${codeConnectFiles.length} Code Connect files; component match ${pct(figmaComponentShare)}; token match ${pct(figmaTokenShare)}`,
    findings: [...take(figmaMissing.components).map((n) => `No Figma component named like ${n}`), ...take(figmaMissing.tokens).map((n) => `No Figma variable named like ${n}`)],
    metrics: { codeConnectFiles: codeConnectFiles.length, figmaComponentShare, figmaTokenShare },
  },
  {
    id: 6, name: "Enforced", score: scoreEnforced(),
    evidence: `${lintFiles.length ? `lint config: ${lintFiles.join(", ")}` : "no lint config"}; raw-value rules: ${rawRuleFound.map(([r, l]) => `${r} (${l})`).join(", ") || "none"}; import rules: ${importRuleFound.map(([r, l]) => `${r} (${l})`).join(", ") || "none"}; runs in ${[...ciLint, nextBuildLints ? "next build" : null].filter(Boolean).join(", ") || "no CI, hook or build step"}`,
    findings: [
      ...(rawRuleFound.length ? [] : ["No lint rule blocks raw colors or arbitrary values"]),
      ...(importRuleFound.length ? [] : ["No lint rule blocks banned or deprecated imports"]),
      ...(wired ? [] : [`Lint is not run in CI, a hook or the build${lintScript ? ` (script "${lintScript[0]}" exists)` : ""}`]),
    ],
    metrics: { lintFiles, rawRules: rawRuleFound, importRules: importRuleFound, wired },
  },
];

// No evidence, no score: a near-empty app would otherwise pass on absence of violations.
const MIN_USES = 10, MIN_VALUES = 50;
const rawInteractive = markup.filter((x) => !isDs(x)).reduce((a, f) => a + (text(f).match(/<(button|input|select|textarea|dialog|a)[\s>/]/g) || []).length, 0);
const componentUses = callSites + rawInteractive;
const insufficient = componentUses < MIN_USES || scoredTotal < MIN_VALUES;
const checked = criteria.filter((c) => c.score != null);
const overall = insufficient ? null : Math.round((100 * checked.reduce((a, c) => a + c.score, 0)) / (3 * checked.length));
const band = overall == null ? "not scored" : overall >= 85 ? "ready" : overall >= 60 ? "partly ready" : "not ready";
const repoName = stack.pkg.name || path.basename(root);
const perCriterion = criteria.map((c) => `${c.name} ${c.score == null ? "not checked" : `${c.score}/3`}`).join(", ");
const summary = insufficient
  ? `${repoName}: not scored, too little UI to measure (${componentUses} component uses and ${scoredTotal} styling values; rubric v${RUBRIC_VERSION} needs ${MIN_USES} and ${MIN_VALUES}).`
  : `${repoName}: AI-ready design system score ${overall}/100, ${band} (rubric v${RUBRIC_VERSION}, ${checked.length} of 6 criteria checked). ${perCriterion}.`;

const result = {
  rubric: RUBRIC_VERSION, repo: repoName, commit: sha, scannedFiles: scanned.length,
  stack: { framework: stack.framework, tailwind: stack.tailwind, cva: stack.cva, typescript: stack.typescript, storybook: stack.storybook, libraries },
  overall, band, insufficient, componentUses, stylingValues: scoredTotal, summary, criteria,
};

if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const out = [];
  out.push(`# AI-ready design system check: ${repoName}`, "");
  out.push(`Commit ${sha ?? "(not a git repo)"}, rubric v${RUBRIC_VERSION}, ${scanned.length} UI files scanned.`);
  out.push(`Stack: ${stack.framework}${stack.tailwind ? `, Tailwind ${stack.tailwind}` : ""}${stack.cva ? ", cva" : ""}${stack.typescript ? ", TypeScript" : ""}${libraries.length ? `, ${libraries.join(", ")}` : ""}${stack.storybook ? ", Storybook" : ""}. Component layer: ${layer === "local" ? dsDirs.join(", ") : layer}.`, "");
  out.push("| # | Criterion | Score | Evidence |", "|---|---|---|---|");
  for (const c of criteria) out.push(`| ${c.id} | ${c.name} | ${c.score == null ? "not checked" : `${c.score}/3`} | ${c.evidence.replace(/\|/g, "\\|")} |`);
  out.push("", overall == null ? `**Overall: not scored.** Too little UI to measure: ${componentUses} component uses (needs ${MIN_USES}) and ${scoredTotal} styling values (needs ${MIN_VALUES}). The table above is diagnostic only.` : `**Overall: ${overall}/100, ${band}.**`, "", `Summary: ${summary}`, "");
  for (const c of criteria) {
    if (!c.findings.length) continue;
    out.push(`## ${c.id}. ${c.name}`, "", ...c.findings.map((f) => `- ${f}`), "");
  }
  if (!opts.all) out.push("Lists are capped at 8 items per kind. Run with --all for every item.");
  console.log(out.join("\n"));
}
