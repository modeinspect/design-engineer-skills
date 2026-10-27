# Design engineer skills: authoring rules

Agent skills for designers and design engineers who change UI in an existing
production codebase with an AI agent (Claude Code, Cursor, Codex and others).
Published by Modeinspect.

The pack fills one gap: taking a designer from a change in a real codebase to
a pull request an engineer can review. UI polish, motion, accessibility,
Figma-to-code and state coverage are already well served by other skills; hand
off to them instead of re-implementing them.

## Layout

```
skills/<name>/SKILL.md      required, one per skill
skills/<name>/*.md          optional reference files the SKILL.md links to
skills/<name>/scripts/      optional, only when a step cannot be done reliably in prose
shared/*.mjs                master copies of code that several skills' scripts use
scripts/sync-shared.mjs     copies each shared file into the skills that use it
```

`npx skills add modeinspect/<repo>` discovers everything under `skills/`.
The repo is also a Claude Code plugin and its own marketplace
(`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`), which load
the same `skills/` folder. Plugin users stay on the `version` in
`plugin.json` until it changes: bump it in any change a user should receive,
then run `claude plugin validate .`.
Each skill owns its own directory and nothing else. `README.md`, `AGENTS.md`,
`LICENSE` and other skills' directories are maintained by the pack owner.

The README's skill table is mirrored on
[modeinspect.com/design-engineer/skills](https://modeinspect.com/design-engineer/skills)
(`components/guide/skills.ts` in the `modeinspect/web` repo). A skill added,
renamed or re-described here is changed there in the same sitting.

A skill can be installed alone, so code that several skills share is copied
into each one's `scripts/` folder. `shared/capture-core.mjs` (Playwright
setup, settling, load-failure checks, the screenshot) and
`shared/pixel-diff.mjs` (dependency-free PNG diff) are the masters. The list
of which skills get which file is declared at the top of
`scripts/sync-shared.mjs`.

- Edit the master in `shared/`, then run `node scripts/sync-shared.mjs`.
- Never edit a generated copy. Its first line reads
  `// Generated from shared/<file>. ...`; the next sync overwrites it.
- `node scripts/sync-shared.mjs --check` exits 1 and lists every copy that
  differs from its master. Run it before calling a change done.

## SKILL.md format

Frontmatter:

```yaml
---
name: <name>            # equals the directory name, kebab-case
description: <what it does and when to use it, with the phrases a user would type; one paragraph, under 1024 characters>
disable-model-invocation: true   # only for skills that run multi-page screenshot captures (two dev servers, many pages); they run when the user asks, never on their own
---
```

Body, in this order:

1. One paragraph: what the skill does, what it owns, what it hands off.
2. The steps or principles, numbered where order matters.
3. What the agent must report back, and in what shape.
4. Boundaries: what the skill never does.
5. The closing line, verbatim:
   `Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).`

Keep SKILL.md under about 250 lines. Move long checklists, rubrics and
examples into reference files and link them.

## Behavior rules every skill follows

- **Works in the user's existing repo.** Detect the stack (framework, styling,
  component library, tokens, package manager) from the files before acting.
  React-family frontends (Next.js, Vite; Tailwind, CSS variables, shadcn and
  `cva`, MUI) are the main target. Say plainly when a stack is out of scope.
- **Fails loudly.** If the dev server will not start, a screenshot cannot be
  taken or a check cannot run, stop and say so with the error. Never report a
  check as passed that did not run, and never invent results.
- **Read-only unless the skill's job is to write.** Skills that write work on
  a branch off the default branch, never on it. No skill pushes, merges or
  force-pushes without the user asking.
- **Agent-agnostic.** Write "the agent", not a specific product's tool names.
  Name a concrete tool (Playwright, `git`, `gh`) only where the step needs it,
  and say what to do when it is missing.
- **Hands off instead of duplicating.** Where another published skill owns a
  job, name it as optional ("if `interface-review` is installed, run it on the
  diff") and keep going without it. A skill with `disable-model-invocation`
  cannot be started by another skill, so hand off to one by telling the user
  to run it ("run `/component-impact` on this token change").
- **No product pitch.** Skills never promote Modeinspect. The closing line is
  the only mention.

## Writing rules

- Plain English, short sentences, active voice. Address the agent directly.
- No em dashes, no en dashes, no ` -- `. Use commas, colons, or two sentences.
- No marketing words ("seamless", "powerful", "leverage"), no filler intros.
- Examples use generic code (`Button`, `Card`, `--color-primary`), never
  customer code, customer names or anything copied from internal transcripts.

## Testing

Test every skill on at least one real codebase before calling it done, on a
clone in a scratch directory, never on the original. Maintainers keep their
local list of test beds in `TESTBEDS.local.md`, which is not published.
Record what ran, on which codebase, and the result.
