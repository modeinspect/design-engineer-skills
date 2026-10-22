---
name: reviewable-ui-pr
disable-model-invocation: true
description: Turns a UI change you made in an existing codebase into a pull request an engineer can review. Scopes a branch to the change and splits off unrelated edits. Captures before and after screenshots per breakpoint and theme from two running copies of the app. Writes a description for engineers listing the components and tokens touched, the states checked and what is out of scope. Use when the user says "make this a PR", "open a PR for my UI change", "get this ready for review", "add before and after screenshots", "write the PR description", "split my changes" or "hand this to engineering". Opens a pull request only when asked, as a draft by default.
---

# Reviewable UI PR

This skill turns a UI change in an existing codebase into a pull request an engineer can review in one pass. The reviewer asks five questions: what changed and why, whether anything other than styling is touched, where it renders, what it looks like at each width and theme, and what was checked. The skill owns the scope of the branch, the before and after screenshots and the description that answer them. Every answer comes from the diff, a capture you looked at or a command that ran. It does not judge or fix the design. Interface quality belongs to `interface-review` and the `better-*` skills, the reach of a shared component or token to `component-impact`, a full route-by-route sweep to `visual-qa-branch`, and states the app cannot reach on demand to `state-machine`. Run them when they are installed, except `component-impact` and `visual-qa-branch`: those run only when the user starts them, so tell the user to run them. This skill works without them.

## 1. Read the repo first

Collect these before any git command that writes:

| What | Where to look |
| --- | --- |
| Default branch and host | `git symbolic-ref refs/remotes/origin/HEAD`, `git remote -v` |
| Package manager | The lockfile present: `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lock` |
| Framework, app directory, dev command | `package.json` scripts, `next.config.*`, `vite.config.*`; in a monorepo, the package the changed files live in |
| Styling, components, tokens | Tailwind config or `@theme`, CSS custom properties, `components.json`, MUI `createTheme` |
| Themes and breakpoints | [Themes](screenshots.md#themes) and [Breakpoints](screenshots.md#breakpoints) |
| Visual tooling already present | Playwright, Storybook, Chromatic, Percy, screenshot tests |
| Conventions | `.github/pull_request_template.md` or `PULL_REQUEST_TEMPLATE/`, `CONTRIBUTING.md`, commitlint config, the last 30 commit subjects, remote branch names |

Then run `git fetch origin`. React-family web frontends are in scope. For native apps, email templates or anything without a dev server, say that screenshots are out of scope, then do steps 2, 3 and 8 only.

## 2. Resolve the change

Set `BASE=$(git merge-base origin/<default> HEAD)` and name it by short SHA in everything you report.

The change is the commits in `$BASE..HEAD`, plus staged, unstaged and untracked files from `git status --porcelain`. Read the whole diff before classifying any of it.

- **Nothing in either.** There is no change to open a pull request for. Say so and ask. Never fall back to the last commit.
- **The branch's pull request is already merged.** Check with `gh pr view --json state` when `gh` is available. New work goes on a fresh branch off the updated default branch. Say so before moving anything.
- **The branch is behind the default branch and upstream touched the same files.** Check with `git diff --name-only $BASE origin/<default>`. Say which files overlap and offer a rebase. Never rebase unasked.

Put every changed file in one of four classes: the change, needed by the change, unrelated work, or noise. [scope.md](scope.md) defines each class and how to detect noise from git alone.

## 3. Agree the scope, then cut the branch

Show the inventory and one proposal, then wait. This is the one question the skill always asks, because a wrong guess either ships someone's unfinished work or throws it away.

| File | Class | Proposal |
| --- | --- | --- |
| `src/components/Card.tsx` | The change | This PR |
| `src/app/settings/page.tsx` | Unrelated: copy edit on another page | Own branch `ui/settings-title` |
| `package-lock.json` | Noise: lockfile changed, `package.json` did not | Revert |

By default, the PR holds the change the user described. When they did not describe it, propose the largest group of UI files that share one purpose and ask them to name it. Each unrelated group goes on its own branch off `$BASE`. Noise is reverted.

On the user's yes, follow [scope.md](scope.md#cutting-the-branch). Write a backup patch first, then revert the noise, create the branches and commit. Never commit on the default branch. Name branches and write commit messages by the repo's convention ([scope.md](scope.md#conventions)). Let hooks run. Never pass `--no-verify`. If a hook fails or rewrites files, report what it did.

## 4. Plan the captures

Write the plan down before starting anything. [screenshots.md](screenshots.md) covers each line:

- **Routes.** Find where each changed file renders. Follow imports from the changed file up to a page, one hop for a leaf component. For a shared component or a token, capture at most three routes and say how many you skipped. When `component-impact` is installed, tell the user to run `/component-impact` for the full reach; it runs only when the user starts it.
- **Widths.** A narrow width, a desktop width, and one width per breakpoint where the changed element's layout changes. At most four.
- **Themes.** Only themes a user can reach. A `.dark` block that nothing in the app ever applies is not a theme.
- **States.** The states the change touches: hover, focus, open, selected, error, empty, long text. Reach them with actions on the real route. A state the route cannot reach goes to `state-machine` on a throwaway page that is never committed, or is listed as not checked.
- **Framing.** Crop to the changed element with some margin, at every width and theme. Add one full-viewport shot at desktop for context.
- **Masks.** Mask what changes by itself, such as timestamps, random data and live counters, so the only difference left is the change.

## 5. Capture before and after from commits

Screenshots show commits, never a working tree that differs from them. After is the branch head. Before is `$BASE`.

1. Check out `$BASE` in a git worktree outside the repo. Never stash, switch or reset the user's checkout to get the before state. When the branch head differs from the working tree, check it out in a second worktree.
2. Give each worktree dependencies and env files, then start each dev server on a free port. [screenshots.md](screenshots.md#running-two-copies) has the exact steps.
3. Wait until each server answers. If a server exits or never answers, show the last lines of its log and stop. Do not capture against a broken server.
4. Run [scripts/capture.mjs](scripts/capture.mjs) with a config built from the plan. It takes every shot from both servers with identical settings, refuses blank pages, error overlays, uncaught page errors, HTTP errors, redirects and forced themes that break hydration, and writes a `manifest.json`. Playwright comes from the repo when it has it, or from a tools folder outside the repo. Never add it to the repo's `package.json`.
5. Save output to `.reviewable-ui-pr/<branch>/` in the repo root, listed in `.git/info/exclude` so it can never be committed.

A failed capture stays failed in the report. If you change a setting to make a capture pass, say which setting and why.

## 6. Look at every pair

Open every image before you use it. The script checks the page loaded. Only you can check that it shows the right thing.

| You see | It means | Do |
| --- | --- | --- |
| After shows the change and before does not, and nothing else differs | A usable pair | Keep it |
| The script reports a pixel-identical pair | The change does not show at this width, theme or state, or the plan aimed at the wrong element | Fix the plan, or drop the pair and say why |
| A difference outside the change | Data that moves by itself, or the change reaches further than the diff suggests | Mask it, or name the extra reach in the description |
| A dark capture that looks light | That theme does not reach this surface | Drop the theme and say so |
| A capture that fails with an uncaught page error or an error overlay on after only, or console errors on after that are absent on before | The change broke something | Stop and report it before writing anything |
| A side effect, such as a card 8px taller or a wrapped label | Something the reviewer would otherwise find | Name it in the description |

## 7. Run the repo's checks

Run the lint, typecheck and test scripts the repo defines, scoped to changed files where the tool allows it. Record each exact command and its result. A failure in a changed file is reported, not hidden. A failure that also happens on `$BASE` is pre-existing, and the report says so. A check you did not run is listed as not run.

If `interface-review` is installed, run it on the branch. Its `Introduced` and `Regression` findings go to the user before the description is written. Fixing them is the user's call.

## 8. Write the description

Fill the repo's pull request template when it has one, and fit these sections into it. Otherwise use [pr-description.md](pr-description.md). Save it as `.reviewable-ui-pr/<branch>/description.md`.

- The first line says what users will see change. The second says why, with the issue or design link when there is one.
- **Change type**, from the diff: styles only, markup, copy, or behavior. Engineers review a styles-only change differently from one that touches logic.
- **Components and tokens touched**, by exact name. Each shared one comes with its number of consumers.
- **Values outside the system**: arbitrary values, raw colors, inline styles and new tokens, each with its reason. Report them. Do not fix them unasked.
- **States checked**: each state, how it was checked, and the ones that were not checked.
- **Out of scope**: what was split off, deliberately left alone, or noticed but not fixed.
- **How to review**: the route, the widths, and the checks that ran with their results.

Write for an engineer: file paths, token names, commands. Leave out design rationale beyond one line.

## 9. Open the pull request, only when asked

Stop after step 8 unless the user asks for the pull request. "Open the PR" means push the branch and create a draft. Create a ready-for-review pull request only when the user says so.

The `gh` CLI cannot upload images, and GitHub has no public API for pull request attachments. [images-in-pr.md](images-in-pr.md) covers the honest options. By default, the agent uploads the screenshots through a browser where the user is already signed in to GitHub, then puts each image in its table cell with `gh`. Without such a browser, it tells the user how to drop the folder into the draft in one move and does the placement after.

## Before you finish

| Mistake | Fix |
| --- | --- |
| After captured from a working tree with uncommitted leftovers | Capture after from the branch head, in a worktree if the checkout differs |
| `git stash` or `git checkout <base>` in the command log | Use `git worktree add` outside the repo |
| A lockfile or whitespace-only file in the PR | Classify it as noise and revert it |
| `style:` as the commit type for a visual change under Conventional Commits | `style` means formatting. Use `feat` or `fix` |
| Two pairs that look the same, both in the description | Drop identical pairs or fix the plan |
| A dark column for an app whose dark tokens nothing applies | Drop it and state why in the report |
| A timestamp that differs between before and after | Mask it and recapture |
| The Next.js dev badge or an error overlay in a shot | The script hides the badge and fails on overlays. If you see either, the capture did not use the script |
| "Lint passed" with no command shown | Show the command, or list it as not run |
| A ready-for-review PR the user did not ask for | Draft by default |
| Images committed to the branch to get them into the PR | Use a flow from [images-in-pr.md](images-in-pr.md) |
| Worktree or dev servers left running | Stop the servers you started and remove the worktree |

## Report back

End with this, in this order:

1. **Scope.** The base ref and SHA, the branch, the commit count and the files in the PR. Then what was split off and where it went, and what was reverted, with the backup patch path.
2. **Captures.** A table with one row per pair: shot, width, theme, state, before path, after path, and a note (identical, masked, side effect). Then the planned captures that failed, with their errors, and the themes or states not captured, with reasons.
3. **Checks.** Each command and its result. Not-run checks are named.
4. **Description.** The path, plus any question the reviewer will need answered that only the user can answer.
5. **Next step.** What the user does now: read the description, then say "open the PR" or name changes.

## Boundaries

- Never commits on the default branch. Never pushes, opens a pull request, marks one ready, merges or force-pushes without the user asking.
- Never stashes, switches or resets the user's checkout to capture screenshots. The before state comes from a worktree.
- Never commits screenshots, scratch pages, fixtures, backups or env files to the change branch. Never edits `package.json` or a lockfile to install capture tools.
- Never uploads screenshots of unreleased UI to a third-party image host.
- Never types, asks for or fills in the user's GitHub password or two-factor code.
- Never reverts or moves the user's work without showing the inventory and getting a yes.
- Never fixes design, accessibility or code issues it notices. It reports them for the user to decide on.
- Never reports a capture, check or state as done when it did not run.

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
