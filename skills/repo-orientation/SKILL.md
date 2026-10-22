---
name: repo-orientation
description: A designer's first run in an unfamiliar frontend repo. Detects the stack, installs dependencies, gets the dev server running and proves a page renders, or stops with the exact error and the most likely fix. Then maps where tokens, components and routes live and sorts the codebase into safe to change, change with care, and ask an engineer first. Use when the user says "set up this repo", "get this running", "how do I run this locally", "I'm new to this codebase", "onboard me", "where are the components", "where are the design tokens", "what can I safely change", or opens a production repo for the first time before making a UI change.
---

# Repo orientation

This skill takes a designer from a fresh clone to a running app and a map of the codebase. It detects the stack from the files, installs dependencies without changing tracked files, starts the dev server, proves a page renders, and reports where tokens, components and routes live and which parts are safe to change. It owns setup, the map and the safety tiers. It does not write a `DESIGN.md` (hand that to `create-design-md`), measure the reach of one component change (`component-impact`), or review or ship a change (`interface-review`, `reviewable-ui-pr`).

## 1. Read what the team wrote first

Before any detection, read the repo's own instructions: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `docs/` setup or development pages, `CODEOWNERS`, and a `Makefile` or `justfile` with setup targets. A documented setup command beats anything you infer. When the docs and the files disagree (the README says `yarn`, the repo has `pnpm-lock.yaml`), the files win for detection, and you report the drift. A README still holding the framework's starter text (create-next-app, create-vite, listing every package manager) documents nothing; treat it as absent.

Note the current state before touching anything:

```bash
git status --porcelain     # save this output; a dirty tree is fine: report it and do not stash
git rev-parse --is-inside-work-tree && git log -1 --oneline
```

A folder that is not a git repository, or has zero commits (common for a downloaded zip), breaks configs that call `git` and hooks that install on `prepare`. Say so up front and recommend cloning instead.

## 2. Detect the stack, in this order

Most setups do not fail on the framework. They fail on the edges: a Node version the lockfile was not built with, a second package manager, an env var nobody documented, a private package, a login page, a backend that is not running. Work out each answer from files before running anything, and when an edge bites, name it precisely. Each step depends on the one before it. The signals, precedence rules and commands are in [detection.md](detection.md).

1. **Workspace layout.** Is this a monorepo (`pnpm-workspace.yaml`, `workspaces` in the root `package.json`, `turbo.json`, `nx.json`)? Which package is the app the designer means? Installs run at the workspace root; the dev server runs for one app.
2. **Package manager.** The `packageManager` field, then the lockfile at the workspace root. Two lockfiles is a finding, not a coin toss.
3. **Node version.** `.nvmrc`, `.node-version`, `.tool-versions`, `volta.node`, then `engines.node`. Compare with `node -v`.
4. **Framework and dev command.** Next.js (App or Pages Router), Vite, Remix or React Router, CRA. The documented command, else the `dev` script, else `start`.
5. **Styling.** Tailwind (v3 config or v4 `@theme`), CSS variables, CSS Modules, Sass, CSS-in-JS.
6. **Component library.** shadcn (`components.json`), MUI, Chakra, Mantine, Radix, an in-house package, or none.
7. **Tokens.** Where the named values live, and whether they are source or generated.

React-family web apps are the main target. If the app is React Native, Expo, Angular, Svelte, Vue or a server-rendered template stack, say plainly that the map and tiers below are written for React and may not fit, then continue with setup only if the user wants it.

## 3. Install without changing tracked files

Install with the lockfile frozen so the install either reproduces the team's tree or fails loudly:

| Manager | Command |
|---|---|
| npm | `npm ci` |
| pnpm | `pnpm install --frozen-lockfile` |
| Yarn 1 | `yarn install --frozen-lockfile` |
| Yarn 2+ | `yarn install --immutable` |
| Bun | `bun install --frozen-lockfile` |

With no lockfile at all, install without writing one (`npm install --no-package-lock`, `yarn install --no-lockfile` for Yarn 1). Where the manager cannot skip it, say so before running, and tell the user the new lockfile must stay out of their pull request. Either way, versions now resolve fresh and may differ from what teammates run: report that as a question for an engineer.

Install output is noisy. Audit counts and deprecation notices are not blockers: never run `npm audit fix`, which rewrites the lockfile. A list of skipped dependency install scripts (pnpm 10 and newer npm block them by default) is harmless if the server starts; if a native module fails later, that list is the first suspect.

Ask before changing anything outside the repo: installing a Node version, `corepack enable`, a global package, starting Docker or a database. Name the exact command you would run.

If install fails, stop. Find the first error, not the last line of output, and match it against [troubleshooting.md](troubleshooting.md).

## 4. Get the dev server running, and prove it

1. **Env vars.** If the app or its config reads env vars, or an example file exists (`.env.example`, `.env.sample`, `.env.template`), copy the example to the local file the framework reads (`.env.local` for Next.js and Vite) only after `git check-ignore` confirms that file is ignored. Keep values the example gives as safe defaults. Never invent a secret, key or URL, never copy one from another project, and never print secret values in chat. List the names still empty, and for each one say which file reads it: a required variable nothing in the source reads is worth an engineer's second look.
2. **Start it in the background** with output going to a log file, using the detected command from the app's directory, or the workspace filter from the root.
3. **Read the URL from the log**, not from the framework default. Vite and recent Next.js move to the next free port when the default is taken; other servers fail with `EADDRINUSE`. Before every page load, confirm your own process owns that port: `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows the listener, which is usually a child of the PID you started (`pgrep -P <pid>` walks the tree). Otherwise you may screenshot someone else's app.
4. **Prove a page renders.** Open the URL in a browser (Playwright, or the agent's browser tool) and check three things: the page shows the app's content, there is no framework error dialog, and the console has no uncaught errors. Dev servers compile a route on its first request, so if the first load fails or hangs on a spinner, wait for the compile to finish in the log and load once more before diagnosing. Wait for entrance animations to settle before the screenshot. Take a screenshot if the tool allows. With no browser available, fetch the HTML and say that the rendered check did not run.

"Running" means step 4 passed. A `ready` line in the log, an open port or an HTTP 200 alone are not running: error overlays and login redirects return 200 too. Detect the error dialog itself, not the overlay host: Next.js 15 and later mount a `nextjs-portal` element in dev even on a healthy page, and an error shows as a dialog inside its shadow root; Vite mounts `vite-error-overlay` only on error. When the starter page is empty by design, the evidence is the root markup in the DOM and a computed style on a real element that comes from the app's styles or theme; say so.

At the end, leave the server running by default, since the user asked for a running app, and give its URL and how to stop it (the PIDs, or the terminal it runs in). Stop it when the user says so. If the process exited on its own, say so. Never leave a process running that you cannot name.

If starting the dev server rewrites a tracked file (Next.js can update `tsconfig.json` or `next-env.d.ts`), that is the framework, not you: report it, and leave it for the user to keep or discard. Do not commit it.

When it does not start, stop and report: the command, the first line that names the cause, verbatim (Vite and Next.js print a generic line first), the most likely cause, and the fix, using [troubleshooting.md](troubleshooting.md). Apply a fix yourself only when it touches no tracked file and nothing outside the repo (copying the env example, using a free port, re-running a frozen install). Everything else is a proposal for the user or a question for an engineer. Never edit source, configs, `package.json` or the lockfile to make the server start. Two failed attempts on the same error is the limit: report it rather than trying a third variation. When the fix is a value only an engineer can give, stop after the first failure.

### When the app runs but a page cannot be reached

A running server is not the end. Note each case in the report:

- **Login wall.** Redirect to `/login`, `/sign-in` or an external identity provider. Look for a documented dev account, seed script, mock mode or a dev auth flag in `.env.example`. Never add a bypass in code and never use production credentials. Ask an engineer for a test account.
- **Backend not running.** The shell renders but data calls fail (`ECONNREFUSED`, `502`, `fetch failed`, empty states everywhere). Look for a mock layer (MSW, fixtures), a documented backend command or a staging API env var. Say which pages degrade.
- **Screens that need an id or state.** `/products/[id]` needs a real id; find one from seed data, fixtures or a list page, do not guess. A cart, a filled dashboard or an onboarding step may need data the user creates first; say how to reach it.

## 5. Map where things live

Find these with file searches, then confirm each by reading the file. Patterns per stack are in [detection.md](detection.md#where-things-live).

- **Tokens.** The file that defines the named values (`@theme` block, `:root` variables, `tailwind.config` `theme.extend`, `createTheme`, a tokens JSON source) and, separately, any generated output that must not be edited by hand. Follow references to their end: a `@theme` value that points at another variable has its source wherever that variable is defined, sometimes a runtime theme object. Then check the tokens are used: when components mostly use raw hex or arbitrary values, or a `.dark` block has nothing that switches it on, say so and list the most repeated raw values. A designer told "colors live in `globals.css`" when the screen ignores that file will edit the wrong thing.
- **Fonts.** `next/font` calls, `@font-face` rules, font files, and where the family is applied.
- **Components.** Shared primitives (`components/ui/`, a `packages/ui` workspace, the library wrappers), feature components, and the page-level files. Find the wrapper rule: when the repo wraps a library component (`@/components/ui/button` over `@mui/material/Button`), new code uses the wrapper. Count importers with a search so the designer sees reach, for primitives and for any file you are about to call safe.
- **Routes.** Map URL to file for the main screens: `app/**/page.tsx` (route groups in parentheses do not appear in the URL), `pages/`, a React Router config, or `routes/`. Mark routes that need auth or an id.
- **Where to preview components in isolation.** Storybook (`.storybook/`, `*.stories.tsx`), a playground app, or none.

## 6. Sort the codebase into three tiers

Use the defaults in [safe-to-touch.md](safe-to-touch.md), then apply the repo's own rules on top: `CODEOWNERS`, contributing docs, "do not edit" headers, lint rules that restrict imports. A repo rule always beats a default.

- **Safe to change.** Copy, page-level layout and styling, leaf components with one or two importers, static assets, stories.
- **Change with care.** Safe to edit, but every screen that uses it changes: shared primitives, tokens and theme, global CSS, root layouts. Check reach first; if `component-impact` is installed, tell the user to run `/component-impact` before the edit. It runs only when the user starts it.
- **Ask an engineer first.** Data fetching, state stores, server actions, API routes, auth and middleware, env and build config, dependencies, lockfiles, generated files, schemas and migrations, analytics and feature flags, CI.

Give real paths from this repo for each tier, not the generic list.

## Before you finish

| Mistake | Fix |
|---|---|
| Reported `Running` from a `ready` log line or a 200 | Load the page and check the content, the error dialog and the console, or say the rendered check did not run |
| `npm install` or `pnpm install` without the frozen flag, and the lockfile changed | Restore the lockfile with `git checkout` on that file, rerun with the frozen flag, report the drift |
| Ran the dev server from the monorepo root and got the wrong app | Run the app's own script, or the workspace filter for that package |
| Filled an empty env var with a placeholder so the server would boot | Leave it empty, report the name, ask for the value |
| Edited a config, `package.json` or source file to get past an error | Revert it, report the error and the proposed fix instead |
| Killed a process on the port that this run did not start | Use another port, or ask the user |
| Screenshotted the URL without checking which process serves it | Match the port to your own PID first |
| Called a token file the source of the colors while components use raw hex | Report both, and the most repeated raw values |
| Flagged an overlay because `nextjs-portal` exists | Look for the error dialog inside it |
| Generic tier lists with no paths from this repo | Replace every bullet with real paths you found |
| A screen called "reachable" behind a login you never passed | Mark it behind auth and name what is needed |

## 7. Report the orientation note

Report in chat, in the shape defined in [orientation-note.md](orientation-note.md). Write it to a file only when the user asks, at the path they name (default `ORIENTATION.md` at the app root). Never overwrite an existing file without asking, and never commit it.

The note always contains:

1. **Status**, one of `Running`, `Running with gaps` (login wall, missing backend, empty env vars) or `Not running`, with the evidence: URL, what rendered, screenshot path, or the exact error. With no browser available, write `Running, not verified in a browser`.
2. **How to run it again**: Node version, install command, dev command, URL.
3. **What changed, and what I assumed**: files created (gitignored only), Node version switched, tools installed with the user's OK, choices made for the user (port, lockfile handling). End with the `git status --porcelain` result compared with the one saved in step 1. It must match it, except for the note file when the user asked for one and a tracked file the framework rewrote on start (step 4), which you name. Anything else new is a change this run made: name it.
4. **Stack**: framework, styling, component library, monorepo or not.
5. **Where things live**: tokens, fonts, components, routes, isolated preview.
6. **The three tiers** with paths.
7. **Blockers and questions** with a ready-to-send question for an engineer for each one ("Could you share a test login for staging, or tell me how to run the app with auth mocked?").
8. **Not checked**: every step of this skill that did not run, and why.
9. **Next**: the skills to run next, named as optional.

A visible defect you notice in passing (a broken layout, a font licence watermark) gets one line under "Seen in passing". Do not audit for more; that is a review skill's job.

## Boundaries

- Never edits tracked files. The only files it creates are gitignored local state: `node_modules`, a local env file copied from the example, framework caches. The note file only on request.
- Never commits, pushes, creates branches or opens pull requests.
- Never invents, guesses or prints secret values, and never uses production credentials.
- Never disables auth, type checks, lint or hooks to get the server running.
- Never kills processes it did not start, and never changes the machine outside the repo without the user's OK.
- Never reports a check as passed that did not run.
- Does not generate `DESIGN.md`, audit the design system, or review UI quality. If `create-design-md`, `component-impact`, `interface-review` or `better-interface` is installed, name it as the next step for the user to run (`/component-impact` runs only when the user starts it).

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
