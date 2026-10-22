---
name: visual-qa-branch
disable-model-invocation: true
description: Visual QA of a branch before review. Works out which routes the branch changed, opens each one on localhost and on a baseline (the production URL the user gives, or the default branch run locally from a worktree), drives hover, focus, dark mode and narrow widths, and reports every difference with before, after and diff screenshots. Separates style changes the branch made from content that differs only because the data differs, and flags changed lines that show no visible difference at all. Use when the user says "visual QA", "QA my branch", "compare my branch to production", "compare with main", "did I break anything visually", "check it in dark mode and on mobile", "before and after screenshots", or before opening a UI pull request.
---

# Visual QA of a branch

This skill checks what a branch changes on screen. It maps the diff to the routes it reaches, renders each route on the branch and on a baseline, drives the states a plain screenshot misses (hover, keyboard focus, dark mode, narrow widths), and sorts every difference into intended, unintended, not visible, content or noise, with a screenshot for each. It owns the comparison and the report. It hands off the full list of a shared component's consumers to `component-impact`, interface-quality judgement to `interface-review`, accessibility regressions to `accessibility-diff`, and the pull request itself to `reviewable-ui-pr`. Each of those is optional: when one is not installed, say so in one line and keep going. `component-impact` and `reviewable-ui-pr` run only when the user starts them, so hand off to them by telling the user to run them.

## The rule this skill exists for

A check you did not render is not a result. Agents often report a mobile fix as working without ever loading the page at a mobile width, or report "no visual changes" from reading the diff. Every row in the report points to a screenshot on disk. When a capture fails, the row says so with the error.

The second rule: a changed line that produces no visible difference in any capture is a finding, not a pass. It usually means the change landed on the wrong breakpoint, a more specific rule overrides it, or the class never reaches the stylesheet.

## Steps

### 1. Resolve the branch and the baseline

Find the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else ask) and the merge base: `BASE=$(git merge-base origin/<default> HEAD)`. The head is the current checkout, including uncommitted changes. State both SHAs and the count of commits and uncommitted files.

If nothing is ahead of the merge base and the tree is clean, there is nothing to QA. Say so and ask what to compare. Never fall back to the last commit on your own.

Pick the baseline:

- **Production**, only when the user gave the URL in this conversation. Never guess it from `package.json`, `vercel.json`, the README or a domain that looks right. Production runs whatever was last deployed, not `BASE`, and serves different data. Expect content differences and possibly drift.
- **The default branch, locally**, in every other case. Check out `BASE` in a worktree so the user's checkout is never switched. This baseline has the same data and the same environment, so almost every difference is the branch.

When the user gives a production URL, also offer the local baseline as a control for differences the production comparison cannot explain (step 7).

### 2. Detect the stack

Read the files before acting: framework and router, styling (Tailwind version and config, CSS variables, CSS modules, MUI, styled-components), component library, package manager (from the lockfile), the dev script and its port, the breakpoints and the dark mode mechanism ([states.md](states.md)). React-family apps on Next.js (app and pages routers) or Vite with React Router are in scope. For other frameworks the capture still works, but you need the user to name the routes: say so plainly. Native mobile apps are out of scope.

### 3. Map the diff to routes

Follow [routes.md](routes.md). The output is a route table: route, the changed file that brings it in, and how (a route file, an importer chain, a shared component, a global file). Check at most six routes per run and name every route you skipped. A dynamic segment needs a real value that exists on both sides, never an invented id.

When a changed file is a shared component, a token or a global stylesheet, its reach is wider than the routes the user had in mind. Sample as [routes.md](routes.md) describes and say how many consumers you did not check. If `component-impact` is installed, tell the user to run `/component-impact` on that file for every usage; it runs only when the user starts it.

### 4. Choose widths, themes and states

Follow [states.md](states.md). In short:

- Widths 375, 768 and 1280, plus a width on each side of every breakpoint the changed lines use.
- Light, plus dark driven the way the repo implements it. Detect the mechanism; do not assume a `.dark` class.
- Hover and keyboard focus on the interactive elements the diff touched, at most three per route. Focus is reached with Tab so `:focus-visible` matches.

### 5. Start both sides

1. Head: reuse a dev server that is already running only if it serves this checkout (check the process's working directory). Otherwise start the repo's dev script on a free port. A dev server writes its build cache into the checkout (`.next/`, `next-env.d.ts`, `node_modules/.vite`). Compare `git status --short` before and after the run and report anything new that git does not ignore.
2. Local baseline: `git worktree add --detach "${TMPDIR:-/tmp}/visual-qa-base-<short-sha>" $BASE`. If `package.json` and the lockfile are unchanged between `BASE` and `HEAD`, symlink the checkout's `node_modules` into the worktree; otherwise install with the repo's package manager inside the worktree. Copy untracked env files (`.env`, `.env.local`, `.env.development.local`) into it without printing them. Start it on another free port.
3. Run both sides in the same mode, dev against dev. Against production you are comparing a dev build to a production build; note it in the report.
4. Request every route on both sides and wait for a 200. If a server will not start or a route errors, stop and report the command and the last 20 lines of its log. Do not compare against an error page.

### 6. Capture

Run [scripts/capture.mjs](scripts/capture.mjs) with a plan file, as [capture-plan.md](capture-plan.md) describes. It captures every route, width, theme and state on both sides with CSS motion frozen, then writes for each pair: both screenshots, a pixel diff, a side-by-side image and a computed-style diff of the elements on the page. It needs Playwright, which it resolves from the repo or from a directory outside it; it never installs into the repo.

Without Node or Playwright, use whatever browser tool you have and follow the same matrix by hand, saving files under the same names. With no browser at all, stop: say visual QA could not run and hand over the URLs and the matrix. Never fill the report from reading code.

Write captures outside the repo, for example `${TMPDIR:-/tmp}/visual-qa/<branch>-<short-sha>/`, unless the user names a directory.

### 7. Separate the branch from everything else

Look at every side-by-side image yourself before you classify anything. The numbers in `report.json` say where to look; they do not replace looking.

Then sort each difference with [classify.md](classify.md):

- Style groups whose element and property match a changed line are **Intended**.
- Branch-caused differences no changed line asked for are **Unintended**: a shared component changing other routes, a wrap or overflow at one width, a hover that breaks in dark mode.
- Changed lines with no difference anywhere are **Not visible**.
- Text, image or item-count differences in markup the branch did not touch are **Content**, as are layout shifts they cause.
- With a production baseline, style differences in untouched components are **Baseline drift**.
- Anything that changes between two loads of the same side is **Noise**. When a difference appears where the diff cannot reach, rerun that route with both sides pointed at the baseline. What still differs is noise: mask or hide it in the plan and capture again.

When a production difference stays ambiguous, capture the same route from the local baseline. If the local baseline matches the branch, the difference comes from production's data or deploy, not from the branch.

### 8. Report, then clean up

Report in the shape below. Then stop the servers you started and remove the baseline worktree this skill created with `git worktree remove --force <path>`. The force is needed because git refuses to remove a worktree with untracked files, and a symlinked `node_modules` is one when the ignore rule is `node_modules/` (a directory rule does not match a symlink). Never force-remove a worktree this skill did not create. Leave the captures in place and say where they are. Offer to fix unintended findings; do not fix them unasked.

## Before you finish

| You notice | Fix |
| --- | --- |
| A production URL in the scope block that the user never gave | Remove it; use the local baseline |
| A shared component changed but only one route captured | Expand to its consumers or say how many you skipped |
| Dark captures identical to light on the baseline | The theme was not applied, or dark mode is unreachable; say which |
| A width list without a capture on each side of a breakpoint the diff uses | Add the missing width |
| Focus captured with a mouse click or `focus()` | Reach it with Tab so `:focus-visible` matches |
| A difference classified from `report.json` without opening the image | Open the side-by-side |
| A changed line that appears in no finding and no "not visible" row | Find its capture or list it as not visible |
| Random data or timestamps in the findings | Mask them and capture again |
| A finding with no screenshot path | Capture it or move it to "Could not check" |
| A worktree or dev server still running | Remove the worktree and stop the servers you started |

## Report back

Use the full format and the worked example in [classify.md](classify.md). The parts, in order:

1. **Scope block**: branch and head SHA, baseline (production URL, or default branch at the merge-base SHA from a worktree), routes checked and how each was reached, routes skipped, widths, themes and how dark mode was driven, states, capture directory, pairs captured and failed.
2. **Findings**, unintended first: kind, route, element, the width, theme and state where it shows, what changed as property before and after, and the side-by-side and diff paths. Show the side-by-side images inline for unintended findings when your interface can display images.
3. **Changed lines with no visible difference**, each with the file and line and the captures that should have shown it.
4. **Content differences**, summarised in one line per route with a count. They are not the branch's fault and need no action.
5. **Pre-existing**: at most three problems you saw on both sides, such as unreachable dark mode. Not the branch's to fix; omit the section when there are none.
6. **Could not check**: every capture that failed, with the side and the error (an uncaught page error, an error overlay or a theme that broke hydration included), and every state or route you dropped, with the reason. A failure on head only, with base captured, is the branch breaking the page: list it under findings as well.
7. **Hand-offs**: which optional skills would add to this and whether they are installed.

Never write "no visual regressions" for a route, width, theme or state you did not capture.

## Boundaries

- Never edits source files, commits, pushes or opens a pull request. Fixing a finding is a separate request.
- Never switches, stashes or resets the user's checkout. The baseline runs from a worktree.
- Never guesses a production URL, never types credentials into a login form and never toggles feature flags in production. For routes behind a login, ask for a saved browser session (a Playwright storage state file) or skip them and say so.
- Never reports a check that did not run, and never infers a visual result from code alone.
- Does not judge whether a change looks good, audit accessibility, or review motion. It shows what changed; the hand-off skills judge it.
- Does not write captures into the repo unless the user names a directory there.

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
