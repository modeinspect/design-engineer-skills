---
name: ai-ready-design-system
description: Scores how ready a design system in code is for AI agents, then fixes what fails. Check mode is read-only and rates six criteria from a published rubric (one import path per component and no duplicates, tokens instead of hard-coded values, typed variants, docs agents read, names that match Figma, lint that enforces it) with a script, so the score repeats between runs and can be shared. Heal mode works on a branch, one commit per criterion, adds agent rules, JSDoc, deprecations and lint rules, and proposes token swaps for review. Use for "is our design system AI-ready", "score our design system", "why does the agent ignore our tokens", "the agent keeps using the wrong Button", "audit our components for Cursor or Claude Code", "make our design system agent friendly", "add DESIGN.md and lint rules for tokens".
---

# AI-ready design system

This skill checks whether a repo's design system in code is ready for AI agents to use, then fixes what fails. It owns the readiness score: a six-criterion rubric in [rubric.md](rubric.md), measured by `scripts/scan.mjs` so that two runs on the same commit agree. Check mode reads only. Heal mode follows [heal.md](heal.md): it writes on a branch, one commit per criterion, and never pushes. It hands off a full `DESIGN.md` for the visual language to `create-design-md` and deep purpose-first token audits to `token-mapping` when those are installed. It does not build a new design system or migrate screens onto one.

## Why agents miss a design system

Agents copy the code next to them. When a repo holds two `Button`s, imports one of them three ways and restyles it with `className` at every call site, the agent picks a button at random and invents one more style. When feature code says `text-gray-600` and `#F0EEED`, so does the agent's output, even with a token file in the repo. A short rules file that names the components and tokens, plus a lint rule that rejects raw values, removes most of this. The rubric measures exactly those things.

## Check mode

1. **Find the repo and stack.** Work from the repo root the user names, else the current one. Read `package.json`, the lockfile and the config files: framework, Tailwind version, `cva`, a UI library (MUI, Chakra, Mantine, Ant), TypeScript, Storybook, Code Connect. The rubric scores React-family repos (`.tsx`, `.jsx`). For Vue, Svelte or anything else, stop and say the stack is out of scope for this rubric version. In a monorepo, ask which app or package to score; with no answer, score the package that holds the shared components and say so.

2. **Find the component layer.** The script looks for `components/ui`, `ui`, `design-system`, `ds`, `primitives` and atomic folders. Open the result and confirm it is the shared layer, not a feature folder. When the shared components live elsewhere (`src/lib/components`, `packages/ui/src`), pass `--ds <dir>`, once per directory. Exclude generated or vendored code with `--exclude <dir>`. Both take a path relative to the repo root (`./src/ui`, `src/ui` and `src/ui/` are the same) or an absolute path inside it. Report every `--ds` and `--exclude` you passed: they change the score, and the user must be able to rerun it.

3. **Check the design file, only with evidence.** If Code Connect files exist, the script reads them. If the agent can read the team's Figma file (a Figma MCP server, the REST API with a token the user provides, or an export the user gives), list the published component names and variable names into a JSON file, `{"components": ["Button", ...], "tokens": ["color/primary", ...]}`, outside the repo, and pass it with `--figma <file>`. Copy names exactly; never write a name you did not read. With no Figma access, criterion 5 is "not checked". Never guess it, and never ask the user to type the names from memory.

4. **Run the scan.**

   ```bash
   node <skill-dir>/scripts/scan.mjs <repo-root> [--ds <dir>]... [--exclude <dir>]... [--figma <file>] [--all]
   ```

   It needs Node 18 or later and nothing else. It prints the criterion table, the overall score, the summary line and the findings with `file:line`. `--json` gives the same data for tooling. Exit code 2 means it could not score (no `package.json`, no React, an unreadable `--figma` file, a `--ds` or `--exclude` path that does not exist or is outside the repo, a `--ds` folder with no `.tsx` or `.jsx` files); report the message as it is and stop.

5. **Read the findings before reporting.** Open a sample of the cited lines for each criterion and confirm they are real. The scan is deterministic, not perfect. When a finding is wrong (a class built at runtime, a component the regexes misread), report the score as the script printed it and list the false positive under "Scan notes". Do not change a score by hand. If a pattern of false positives would move a level, say which level and why.

6. **Explain, briefly.** For each criterion below 3, name the one change that would raise it a level, using the rubric's thresholds and the repo's own files.

When the script prints "not scored", the repo has too little UI to measure. Say so plainly and give the diagnostic table; do not compute a score yourself.

## Heal mode

Run heal only when the user asks for it ("fix it", "heal", "make it AI-ready"). Follow [heal.md](heal.md) step by step. In short:

1. Check mode first. Its table is the "before" column.
2. A clean working tree, a branch `ai-ready-design-system` cut from the default branch, and a baseline run of the typecheck and build.
3. One commit per failing criterion, in order:
   - **1, Discoverable:** `@deprecated` on duplicates pointing to the canonical component, and non-canonical import paths rewritten. Nothing deleted or renamed.
   - **2, Tokens:** `scripts/propose-tokens.mjs` maps each raw value to the nearest token, role first. Only swaps the user approves in the session are applied. Otherwise the table goes into the report and there is no commit.
   - **3, Typed variants:** `string` variant props narrowed to unions. New variants for repeated overrides only with approval.
   - **4, Documented:** a `## Design system` section in the rules file agents already load, and JSDoc taken from the code.
   - **6, Enforced:** lint rules for raw values and imports, proven to fire on a planted violation, at `error` where the code is already clean, else `warn`.
   - **5** never gets a commit. With Figma access, propose a rename table.
4. Typecheck and build after every commit. A commit that breaks them is fixed or dropped.
5. Re-run check mode, report before and after, write the PR description, and stop. The user pushes.

## Report

Check mode returns, in this order:

1. **Scope:** the repo, the commit, the stack, the component layer, and every `--ds`, `--exclude` and `--figma` passed.
2. **The table** exactly as the script printed it: `| # | Criterion | Score | Evidence |`, then the overall line.
3. **Findings** per criterion, worst first, each with `file:line`. At most 8 per kind unless the user asks for all.
4. **Next step per criterion:** the one change that raises it a level.
5. **Scan notes:** false positives found in step 5, and anything not checked with the reason.
6. **The summary line** last, verbatim, ready to share:

   `<repo>: AI-ready design system score 47/100, not ready (rubric v1.0, 5 of 6 criteria checked). Discoverable 2/3, Tokens in code 1/3, ...`

Heal mode adds: the branch name, `git log --oneline` of its commits, a before and after table, the verify commands with their results, the token proposal table, the follow-ups heal did not take, and the PR description.

## Boundaries

- Never edit in check mode. Never edit the default branch, stash the user's changes, push, merge or open a PR.
- Never change a score by judgment, and never report a criterion as checked when it was not. Criterion 5 without evidence is "not checked".
- Never apply raw-to-token swaps or new variants without the user's approval in the session. Never invent a token to close a gap.
- Never delete, rename or move a component. Deprecate it and leave the move to a person.
- Never add a framework lint preset, Storybook or a CI workflow as part of heal. Propose them.
- Never put customer names, internal URLs or secrets into the rules file, commit messages or the summary line.

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
