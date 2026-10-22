# Design engineer skills

Six agent skills for designers who ship UI changes in a real production
codebase: from the first run in an unfamiliar repo to a pull request an
engineer can review. They work in Claude Code, Cursor, Codex and any agent
that reads `SKILL.md` files, on your own repository, with no account and no
product in the loop.

They are the practical companion to
[the guide to becoming a design engineer](https://modeinspect.com/design-engineer):
the guide explains the job, the skills do its repetitive parts with your agent.
The page for the pack is
[modeinspect.com/design-engineer/skills](https://modeinspect.com/design-engineer/skills).

## Install

```bash
npx skills add modeinspect/design-engineer-skills
```

The [skills CLI](https://github.com/vercel-labs/skills) puts each skill where
your agents look for it and asks which agents to install to. One skill at a
time: `npx skills add modeinspect/design-engineer-skills --skill reviewable-ui-pr`.
Every skill works on its own. Without the CLI, copy a folder from `skills/`
into the directory your agent reads skills from, such as `.claude/skills/`
for Claude Code.

Then open your repository in the agent and ask in plain words. "Get this
running" starts `repo-orientation`. The three screenshot skills
(`component-impact`, `visual-qa-branch`, `reviewable-ui-pr`) start only when
you name them, because they run two copies of the app.

## The skills

In the order a designer needs them. Each one belongs to a chapter of the guide.

| Skill | What it does | In the guide |
|---|---|---|
| [`repo-orientation`](skills/repo-orientation/SKILL.md) | A designer's first run in an unfamiliar repo: gets the dev server running or stops with the exact error and fix, maps tokens, components and routes, and sorts the code into safe to change, change with care, and ask an engineer first. | [Your first pull request](https://modeinspect.com/design-engineer/your-first-pull-request), step 3 |
| [`component-impact`](skills/component-impact/SKILL.md) | Before a shared component or token changes, finds every place it is used, renders each one before and after, and flags what broke. | [Your first pull request](https://modeinspect.com/design-engineer/your-first-pull-request), step 5 |
| [`visual-qa-branch`](skills/visual-qa-branch/SKILL.md) | Compares a branch against production or the main branch, route by route, across hover, focus, dark mode and narrow widths, with before and after screenshots. | [Design QA in code](https://modeinspect.com/design-engineer/design-qa-in-code) |
| [`reviewable-ui-pr`](skills/reviewable-ui-pr/SKILL.md) | Turns a designer's UI change into a scoped draft pull request: splits off unrelated edits, captures before and after screenshots per width and theme, and writes a description engineers can review. | [Your first pull request](https://modeinspect.com/design-engineer/your-first-pull-request), step 6 |
| [`review-as-designer`](skills/review-as-designer/SKILL.md) | Helps a designer review an engineer's UI pull request: opens the preview, walks the states it touches, and drafts comments that say what is wrong, where, why and whether it blocks. | [Design QA in code](https://modeinspect.com/design-engineer/design-qa-in-code), steps 2 to 4 |
| [`ai-ready-design-system`](skills/ai-ready-design-system/SKILL.md) | Scores how ready a design system in code is for AI agents against a published six-criterion rubric, then fixes what fails on a branch, one commit per criterion. | [Building a design engineering team](https://modeinspect.com/design-engineer/building-a-design-engineering-team), step 5 |

## What they need

- **A React-family web frontend.** Next.js or Vite, styled with Tailwind, CSS
  variables, shadcn and `cva`, or MUI. Each skill detects the stack from the
  files and says plainly when a repo is out of scope.
- **Node 18 or later** for the scripts. They have no dependencies of their own.
- **Playwright**, for the three screenshot skills. They use the copy your
  repo already has, or install one once outside the repo, never into its
  `package.json`.
- **The GitHub CLI (`gh`)**, signed in as you, for `review-as-designer` to
  read and post a review and for `reviewable-ui-pr` to open the draft.

## What they promise

- **Nothing is reported that did not run.** Every check points to a screenshot
  on disk or a command and its output. A capture that failed stays failed in
  the report.
- **Read-only unless the job is to write.** Four skills only read and report.
  `reviewable-ui-pr` commits on a branch after you approve the file list, and
  the heal mode of `ai-ready-design-system` commits on its own branch. No skill
  touches the default branch, and none pushes, merges or opens a pull request
  without being asked.
- **Your checkout is never switched.** Before-and-after captures come from a
  git worktree outside the repo, never from `git stash` or `git checkout`.
- **No product pitch.** The credit line at the end of each skill is the only
  mention of Modeinspect.

## Contributing

The authoring rules, layout and testing requirements are in
[AGENTS.md](AGENTS.md). Test a change on a real codebase before opening a
pull request, and run `node scripts/sync-shared.mjs --check` when you touch
anything under `shared/`.

## License

MIT. Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
