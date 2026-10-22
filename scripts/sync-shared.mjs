#!/usr/bin/env node
// Copies each master file in shared/ into the scripts/ folder of every skill
// that uses it, so each skill still works when installed alone.
//
//   node scripts/sync-shared.mjs           write the copies
//   node scripts/sync-shared.mjs --check   exit 1 and list every copy that differs from its master

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Which skills get which shared file.
const TARGETS = {
  "capture-core.mjs": ["component-impact", "visual-qa-branch", "reviewable-ui-pr"],
  "pixel-diff.mjs": ["component-impact", "visual-qa-branch"],
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const drifted = [];

for (const [file, skills] of Object.entries(TARGETS)) {
  const master = fs.readFileSync(path.join(root, "shared", file), "utf8");
  const expected = `// Generated from shared/${file}. Edit the master and run node scripts/sync-shared.mjs.\n${master}`;
  for (const skill of skills) {
    const dir = path.join(root, "skills", skill, "scripts");
    if (!fs.existsSync(path.join(root, "skills", skill))) throw new Error(`TARGETS names skill "${skill}", which does not exist`);
    const copy = path.join(dir, file);
    const rel = path.relative(root, copy);
    const current = fs.existsSync(copy) ? fs.readFileSync(copy, "utf8") : null;
    if (current === expected) continue;
    if (check) {
      drifted.push(`${rel}: ${current === null ? "missing" : `differs from shared/${file}`}`);
    } else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(copy, expected);
      console.log(`wrote ${rel}`);
    }
  }
}

if (check) {
  if (drifted.length) {
    console.error(`Generated copies out of date. Edit the master in shared/, then run node scripts/sync-shared.mjs:\n  ${drifted.join("\n  ")}`);
    process.exit(1);
  }
  console.log("All shared copies match their masters.");
}
