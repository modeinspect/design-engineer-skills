// Shared helpers for scan.mjs and propose-tokens.mjs. Node 18+, no dependencies.
import fs from "node:fs";
import path from "node:path";

export const RUBRIC_VERSION = "1.0";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", "dist", "build", "out",
  "coverage", ".turbo", ".vercel", ".cache", "storybook-static", "public", ".output",
  ".design-system", "vendor", "tmp",
]);

export function walk(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.isDirectory() && ![".storybook", ".cursor", ".github", ".claude"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        files.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  return files.sort();
}

export const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
export const exists = (root, rel) => fs.existsSync(path.join(root, rel));

export function readJsonLoose(text) {
  // tsconfig and similar files allow comments and trailing commas.
  const noComments = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? "")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(noComments);
}

// Removes comments from config text and keeps strings whole, so the `//` inside
// a quoted URL survives. "js" covers JS, JSON and JSONC (`//` and `/* */`);
// "yaml" covers `#` comments.
const JS_COMMENTS = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const YAML_COMMENTS = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\n]|'')*')|(^|\s)#[^\n]*/gm;
export function stripComments(text, syntax = "js") {
  if (syntax === "yaml") return text.replace(YAML_COMMENTS, (m, str, lead) => str ?? lead);
  return text.replace(JS_COMMENTS, (m, str) => str ?? "");
}

export function lineOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (index) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ---------- file classes ----------

export const isScript = (f) => /\.(tsx|jsx|ts|js|mjs|cjs)$/.test(f);
export const isMarkupComponent = (f) => /\.(tsx|jsx)$/.test(f);
export const isStyle = (f) => /\.(css|scss|sass|less)$/.test(f);
export const isStory = (f) => /\.stories\.(tsx|jsx|ts|js|mdx)$/.test(f);
export const isTest = (f) => /(\.(test|spec)\.[tj]sx?$)|(^|\/)__tests__\//.test(f);
export const isRootConfig = (f) => /(^|\/)[^/]+\.config\.(ts|js|mjs|cjs)$/.test(f);
export const isNextRouteFile = (f) => /(^|\/)(page|layout|loading|error|not-found|template|default|global-error|route)\.(tsx|jsx|ts|js)$/.test(f);

export function isTokenDefinitionFile(f, text) {
  if (/(^|\/)tailwind\.config\.(ts|js|mjs|cjs)$/.test(f)) return true;
  if (/(^|\/)([\w.-]*tokens?)\.(json|ts|js|mjs)$/.test(f)) return true;
  if (isScript(f) && /\b(createTheme|extendTheme|createSystem|defineConfig\(\s*\{\s*theme)\s*\(/.test(text)) return true;
  return false;
}

export function uiFiles(files) {
  return files.filter((f) => (isMarkupComponent(f) || isStyle(f)) && !isStory(f) && !isTest(f) && !isRootConfig(f));
}

const DS_SEGMENT = /^(ui|design-system|designsystem|ds|primitives|atoms|molecules|organisms)$/i;

export function detectDsDirs(files, override) {
  if (override.length) return override.map((d) => d.replace(/\/$/, ""));
  const dirs = new Set();
  for (const f of files) {
    if (!isMarkupComponent(f) || isStory(f) || isTest(f)) continue;
    const segs = f.split("/").slice(0, -1);
    const i = segs.findIndex((s) => DS_SEGMENT.test(s));
    if (i >= 0) dirs.add(segs.slice(0, i + 1).join("/"));
  }
  // Keep the shortest roots only.
  return [...dirs].filter((d) => ![...dirs].some((o) => o !== d && d.startsWith(o + "/"))).sort();
}

export const inDirs = (f, dirs) => dirs.some((d) => f === d || f.startsWith(d + "/"));

// ---------- stack ----------

const UI_LIBRARIES = ["@mui/material", "@mui/joy", "@chakra-ui/react", "antd", "@mantine/core", "@fluentui/react-components", "react-bootstrap", "@radix-ui/themes", "@nextui-org/react", "@heroui/react"];

export function detectStack(root) {
  if (!exists(root, "package.json")) return { error: "no package.json at the repo root" };
  const pkg = JSON.parse(read(root, "package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);
  const tw = deps.tailwindcss ? deps.tailwindcss.replace(/[^\d.]/g, "") : null;
  return {
    pkg,
    deps,
    framework: has("next") ? "next" : has("vite") ? "vite" : has("react-scripts") ? "cra" : has("@remix-run/react") ? "remix" : has("nuxt") ? "nuxt" : has("@sveltejs/kit") ? "sveltekit" : "unknown",
    react: has("react"),
    vue: has("vue") || has("nuxt"),
    svelte: has("svelte"),
    tailwind: tw ? Number(tw.split(".")[0]) : null,
    cva: has("class-variance-authority") || has("tailwind-variants") || has("cva"),
    typescript: has("typescript"),
    storybook: Object.keys(deps).some((d) => d.startsWith("@storybook/") || d === "storybook"),
    codeConnect: has("@figma/code-connect"),
    libraries: UI_LIBRARIES.filter(has),
  };
}

// ---------- imports ----------

export function loadPathAliases(root) {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    if (!exists(root, name)) continue;
    try {
      const cfg = readJsonLoose(read(root, name));
      const co = cfg.compilerOptions || {};
      const base = co.baseUrl || ".";
      return Object.entries(co.paths || {}).map(([k, v]) => ({
        prefix: k.replace(/\*$/, ""),
        wildcard: k.endsWith("*"),
        targets: v.map((t) => path.posix.normalize(path.posix.join(base, t.replace(/\*$/, "")))),
      }));
    } catch (e) {
      throw new Error(`cannot parse ${name}: ${e.message}`);
    }
  }
  return [];
}

const RESOLVE_EXT = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

export function makeResolver(fileSet, aliases) {
  const tryPath = (p) => {
    const norm = path.posix.normalize(p).replace(/^\.\//, "");
    for (const ext of RESOLVE_EXT) if (fileSet.has(norm + ext)) return norm + ext;
    return null;
  };
  return (fromFile, spec) => {
    if (spec.startsWith(".")) return tryPath(path.posix.join(path.posix.dirname(fromFile), spec));
    for (const a of aliases) {
      if (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix) {
        const rest = spec.slice(a.prefix.length);
        for (const t of a.targets) {
          const hit = tryPath(path.posix.join(t, rest));
          if (hit) return hit;
        }
      }
    }
    return null;
  };
}

export function parseImports(text) {
  const out = [];
  const re = /import\s+(type\s+)?([\w$*{}\s,]+?)\s+from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) continue;
    const clause = m[2];
    const bindings = [];
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(,|$)/);
    if (def) bindings.push({ local: def[1], imported: "default" });
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const p = part.trim().replace(/^type\s+/, "");
        if (!p || part.trim().startsWith("type ")) continue;
        const [imp, local] = p.split(/\s+as\s+/);
        bindings.push({ local: (local || imp).trim(), imported: imp.trim() });
      }
    }
    out.push({ spec: m[3], bindings, index: m.index });
  }
  return out;
}

// ---------- components ----------

const pascal = (s) => s.replace(/(^|[-_\s.]+)(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^\w]/g, "");

export function exportedComponents(file, text) {
  const names = new Map(); // name -> index of declaration
  const add = (n, i) => { if (/^[A-Z]/.test(n) && !/Props$|Context$|Variants$|Type$|Schema$/.test(n) && !names.has(n)) names.set(n, i); };
  let m;
  const r1 = /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z][\w$]*)/g;
  while ((m = r1.exec(text))) add(m[1], m.index);
  const r2 = /export\s+(?:const|let)\s+([A-Z][\w$]*)\s*[:=]/g;
  while ((m = r2.exec(text))) add(m[1], m.index);
  const r3 = /export\s*\{([^}]*)\}(\s*from\s*["'])?/g;
  while ((m = r3.exec(text))) {
    if (m[2]) continue; // re-export from another module
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p || p.startsWith("type ")) continue;
      const [local, alias] = p.split(/\s+as\s+/).map((x) => x.trim());
      const decl = new RegExp(`(?:const|let|function|class)\\s+${local.replace(/\$/g, "\\$")}\\b`).exec(text);
      add(alias || local, decl ? decl.index : m.index);
    }
  }
  const r4 = /export\s+default\s+([A-Z][\w$]*)\s*;?\s*$/gm;
  while ((m = r4.exec(text))) {
    const decl = new RegExp(`(?:const|let|function|class)\\s+${m[1]}\\b`).exec(text);
    add(m[1], decl ? decl.index : m.index);
  }
  if (/export\s+default\s+(?:async\s+)?(?:function\s*\(|\(|class\s*\{)/.test(text)) {
    add(pascal(path.posix.basename(file).replace(/\.[^.]+$/, "")), text.search(/export\s+default/));
  }
  return names;
}

// ---------- class tokens ----------

export const PALETTE = ["slate", "gray", "grey", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose", "black", "white"];
const NEUTRAL_KEYWORDS = new Set(["inherit", "current", "transparent", "currentColor", "auto", "none"]);
const TEXT_SIZES = new Set(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"]);
const NON_COLOR = {
  bg: /^(fixed|local|scroll|clip-.*|origin-.*|repeat.*|no-repeat|cover|contain|center|top|bottom|left|right|(left|right)-(top|bottom)|gradient-.*|blend-.*|linear-.*|radial.*|conic.*|none|auto)$/,
  text: /^(left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/,
  border: /^(\d+|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.*|x|y|t|r|b|l|s|e)$/,
  ring: /^(\d+|inset)$/,
  "ring-offset": /^\d+$/,
  outline: /^(none|dashed|dotted|double|solid|hidden|\d+|offset-.*)$/,
  fill: /^(none|\d+)$/,
  stroke: /^(none|\d+)$/,
  divide: /^(x|y|x-\d+|y-\d+|x-reverse|y-reverse|solid|dashed|dotted|double|none)$/,
  from: /^\d+%$/, via: /^\d+%$/, to: /^\d+%$/,
  decoration: /^(solid|double|dotted|dashed|wavy|auto|from-font|clone|slice|\d+)$/,
  accent: /^auto$/, caret: /^auto$/, placeholder: /^(shown)$/,
};

const isColorLiteral = (v) => /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) || /^(rgba?|hsla?|oklch|oklab|lab|lch|color)\(/i.test(v);
const isLength = (v) => /^-?\d*\.?\d+(px|rem|em|%|vh|vw|dvh|svh|ch|ex|pt)?$/.test(v) && !/^0+$/.test(v);

function lastSegment(cls) {
  let depth = 0, cut = 0;
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i + 1;
  }
  return cls.slice(cut).replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
}

// Returns null when the class is not about color, spacing, radius or type.
// Otherwise { category, kind: "token" | "palette" | "raw" | "unknown", value }.
export function classifyClass(rawCls, projectTokens) {
  const cls = lastSegment(rawCls);
  if (!cls || /[^\w\-[\]#().,%/:'"!]/.test(cls)) return null;
  const bracket = (v) => (v.startsWith("[") && v.endsWith("]") ? v.slice(1, -1).replace(/^(color|length):/, "") : null);
  const nameOf = (v) => v.split("/")[0];

  // radius
  let m = cls.match(/^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-(.+))?$/);
  if (m) {
    const v = m[1];
    if (!v || /^(none|sm|md|lg|xl|2xl|3xl|4xl|full|DEFAULT|xs)$/.test(v)) return { category: "radius", kind: "token", value: cls };
    const b = bracket(v);
    if (b !== null) return b.includes("var(") ? { category: "radius", kind: "token", value: cls } : isLength(b) ? { category: "radius", kind: "raw", value: cls } : null;
    return { category: "radius", kind: projectTokens.radius.has(v) ? "token" : "unknown", value: cls };
  }

  // spacing
  m = cls.match(/^(p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(.+)$/);
  if (m) {
    const v = m[2];
    if (v === "reverse") return null;
    if (/^(\d+(\.\d+)?|px|auto|full|\d+\/\d+)$/.test(v)) return { category: "spacing", kind: "token", value: cls };
    const b = bracket(v);
    if (b !== null) return b.includes("var(") || b.includes("theme(") ? { category: "spacing", kind: "token", value: cls } : isLength(b) ? { category: "spacing", kind: "raw", value: cls } : null;
    return { category: "spacing", kind: projectTokens.spacing.has(v) ? "token" : "unknown", value: cls };
  }

  // type: leading, tracking, font
  m = cls.match(/^(leading|tracking)-(.+)$/);
  if (m) {
    const b = bracket(m[2]);
    if (b === null) return { category: "type", kind: "token", value: cls };
    return b.includes("var(") ? { category: "type", kind: "token", value: cls } : isLength(b) ? { category: "type", kind: "raw", value: cls } : null;
  }
  m = cls.match(/^font-(.+)$/);
  if (m) {
    const b = bracket(m[1]);
    if (b === null) return null; // weights and families are not scored
    return b.includes("var(") ? { category: "type", kind: "token", value: cls } : /^\d+$/.test(b) ? { category: "type", kind: "raw", value: cls } : null;
  }

  // color, and text size
  m = cls.match(/^(bg|text|border(?:-[trblxyse])?|ring-offset|ring|outline|fill|stroke|divide|from|via|to|accent|caret|decoration|placeholder)-(.+)$/);
  if (!m) return null;
  const prefix = m[1].startsWith("border") ? "border" : m[1];
  const v = m[2];
  if (prefix === "text") {
    const size = v.split("/")[0];
    if (TEXT_SIZES.has(size) || projectTokens.type.has(size)) return { category: "type", kind: "token", value: cls };
  }
  if (NON_COLOR[prefix] && NON_COLOR[prefix].test(v)) return null;
  const b = bracket(v.replace(/\/[\w.[\]%]+$/, ""));
  if (b !== null) {
    if (b.includes("var(")) return { category: "color", kind: "token", value: cls };
    if (isColorLiteral(b)) return { category: "color", kind: "raw", value: cls };
    if (prefix === "text" && isLength(b.split("/")[0])) return { category: "type", kind: "raw", value: cls };
    return null;
  }
  const name = nameOf(v);
  if (NEUTRAL_KEYWORDS.has(name)) return null;
  const first = name.split("-")[0];
  if (projectTokens.color.has(name) || projectTokens.color.has(first) || projectTokens.color.has(name.replace(/-\d+$/, ""))) return { category: "color", kind: "token", value: cls };
  if (PALETTE.includes(first)) return { category: "color", kind: "palette", value: cls };
  return { category: "color", kind: "unknown", value: cls };
}

// Every string literal in a script file, with its start index.
export function stringLiterals(text) {
  const out = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(text))) {
    const value = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, " ");
    out.push({ value, index: m.index });
  }
  return out;
}

// ---------- project tokens ----------

function blockAfter(text, keyRe) {
  const m = keyRe.exec(text);
  if (!m) return null;
  let i = text.indexOf("{", m.index + m[0].length - 1);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") { depth--; if (depth === 0) return text.slice(i + 1, j); }
  }
  return null;
}

// Flattens object keys of a JS object literal body: { card: { DEFAULT, foreground } } -> card, card-foreground
function flattenKeys(body) {
  const names = new Map(); // name -> raw value string or null
  const stack = [];
  const re = /(["']?)([\w-]+)\1\s*:\s*(\{|["'`]([^"'`]*)["'`]|[^,}\n]+)|\}/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[0] === "}") { stack.pop(); continue; }
    const key = m[2];
    const full = [...stack, key].filter((k) => k !== "DEFAULT").join("-");
    if (m[3] === "{") { stack.push(key); if (full) names.set(full, null); continue; }
    names.set(full || key, m[4] ?? m[3].trim());
  }
  return names;
}

const CSS_COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|color)\(|\d+(\.\d+)?(deg)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%)/i;

export function collectProjectTokens(root, files) {
  const tokens = { color: new Map(), spacing: new Map(), radius: new Map(), type: new Map(), sources: [] };
  const cssVars = new Map(); // --name -> value (first definition, light mode)
  for (const f of files) {
    if (!isStyle(f)) continue;
    const text = read(root, f);
    const re = /(--[\w-]+)\s*:\s*([^;}]+)[;}]/g;
    let m, count = 0;
    while ((m = re.exec(text))) {
      count++;
      if (!cssVars.has(m[1])) cssVars.set(m[1], { value: m[2].trim(), file: f });
    }
    if (count) tokens.sources.push(`${f} (${count} custom properties)`);
  }
  const resolveVar = (v, depth = 0) => {
    const m = v.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);
    if (!m || depth > 5) return v;
    const hit = cssVars.get(m[1]);
    return hit ? resolveVar(hit.value, depth + 1) : m[2] || v;
  };
  for (const [name, { value }] of cssVars) {
    const v = resolveVar(value);
    let n = name.slice(2);
    if (/^tw-/.test(n)) continue;
    if (/^(breakpoint|screen|container|z|ease|animate|duration|shadow|overlay)-/.test(n)) continue;
    const prefixed = n.match(/^(color|spacing|space|radius|rounded|text|font-size|font|leading|letter-spacing|tracking)-(.+)$/);
    if (prefixed) {
      const cat = { color: "color", spacing: "spacing", space: "spacing", radius: "radius", rounded: "radius", text: "type", "font-size": "type", font: "type", leading: "type", "letter-spacing": "type", tracking: "type" }[prefixed[1]];
      tokens[cat].set(prefixed[2], v);
      continue;
    }
    if (CSS_COLOR_VALUE.test(v)) tokens.color.set(n, v);
    else if (/radius|rounded/.test(n)) tokens.radius.set(n.replace(/^radius-?/, "") || "base", v);
    else if (/space|spacing|gap|gutter/.test(n)) tokens.spacing.set(n, v);
    else if (/font-size|text-size|^text-|leading|line-height/.test(n)) tokens.type.set(n, v);
  }
  for (const f of files) {
    if (!/(^|\/)tailwind\.config\.(ts|js|mjs|cjs)$/.test(f)) continue;
    const text = read(root, f);
    tokens.sources.push(f);
    const groups = { color: /\bcolors\s*:\s*\{/, spacing: /\bspacing\s*:\s*\{/, radius: /\bborderRadius\s*:\s*\{/, type: /\bfontSize\s*:\s*\{/ };
    for (const [cat, re] of Object.entries(groups)) {
      // Prefer the block inside `extend` when both exist; collect both.
      const all = [];
      let rest = text, guard = 0;
      while (guard++ < 4) {
        const body = blockAfter(rest, new RegExp(re.source));
        if (body === null) break;
        all.push(body);
        rest = rest.slice(rest.indexOf(body) + body.length);
      }
      for (const body of all) for (const [k, v] of flattenKeys(body)) {
        if (v === null && cat === "color") { tokens.color.set(k, null); continue; }
        const resolved = v ? resolveVar(v.replace(/^hsl\(var\((--[\w-]+)\)\)$/, (_, n) => `hsl(${cssVars.get(n)?.value ?? n})`)) : v;
        tokens[cat].set(k, resolved);
      }
    }
  }
  for (const f of files) {
    if (!isScript(f)) continue;
    const text = read(root, f);
    if (!/\b(createTheme|extendTheme)\s*\(/.test(text)) continue;
    tokens.sources.push(f);
    const palette = blockAfter(text, /\bpalette\s*:\s*\{/);
    if (palette) for (const [k, v] of flattenKeys(palette)) if (v && CSS_COLOR_VALUE.test(v)) tokens.color.set(k, v);
    if (/\bspacing\s*:/.test(text)) tokens.spacing.set("theme.spacing", null);
    if (/\bshape\s*:\s*\{[^}]*borderRadius/.test(text)) tokens.radius.set("shape.borderRadius", null);
    const typo = blockAfter(text, /\btypography\s*:\s*\{/);
    if (typo) for (const [k, v] of flattenKeys(typo)) if (/fontSize|^h\d|body|caption|subtitle|button|overline/.test(k)) tokens.type.set(k, v);
  }
  return tokens;
}

export function tokenNameSets(tokens) {
  const sets = {};
  for (const cat of ["color", "spacing", "radius", "type"]) sets[cat] = new Set(tokens[cat].keys());
  return sets;
}

// ---------- color math (sRGB -> OKLab) ----------

export function parseColor(v) {
  if (!v) return null;
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  m = v.match(/^(?:hsla?\()?\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return [f(0), f(8), f(4)].map(Math.round);
  }
  if (/^white$/i.test(v)) return [255, 255, 255];
  if (/^black$/i.test(v)) return [0, 0, 0];
  return null;
}

export function oklab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

export const deltaEOK = (a, b) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
};

export function toPx(v) {
  if (v == null) return null;
  const m = String(v).trim().match(/^(-?\d*\.?\d+)(px|rem|em)?$/);
  if (!m) return null;
  return m[2] === "rem" || m[2] === "em" ? +m[1] * 16 : +m[1];
}
