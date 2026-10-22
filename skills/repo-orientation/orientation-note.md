# Orientation note

The report shape for step 7 of [SKILL.md](SKILL.md). Write it for a designer: plain words, real paths, commands they can paste. Keep prose short so it scans; the tables carry the detail.

## Shape

```markdown
## Orientation: <repo or app name>

**Status:** Running | Running with gaps | Not running
<One line of evidence: "Home page rendered at http://localhost:3000, no error dialog, no console errors, screenshot at /tmp/orientation-home.png", or the first error line verbatim.>

### Run it again
| | |
|---|---|
| Node | 20.11.1 (from `.nvmrc`), active: 20.11.1 |
| Package manager | pnpm 9.12.0 (from `packageManager`) |
| Install | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm --filter web dev` |
| URL | http://localhost:3000 |

### What changed, and what I assumed
- Created `.env.local` from `.env.example` (gitignored). Still empty: `STRIPE_SECRET_KEY`, `AUTH_SECRET`.
- Installed dependencies (`node_modules`, gitignored).
- Port 3000 was taken by another app, so the server is on 3001.
- `git status --porcelain`: same as at the start (clean).
- The dev server is still running (started as PID 41822, listener PID 41860). Stop it with Ctrl+C in its terminal, or `kill 41860 41822`.

### Stack
Next.js 15 (App Router), Tailwind v4, shadcn primitives with `cva`, CSS variables for tokens. Monorepo: no.

### Where things live
| What | Where | Notes |
|---|---|---|
| Tokens | `src/app/globals.css` (`@theme`, `:root`, `.dark`) | Source; nothing generated. Most components use them; 6 raw hex values remain |
| Fonts | `src/app/layout.tsx` (`next/font/google`, Inter) | Applied on `<body>` |
| Primitives | `src/components/ui/` | `button.tsx` 48 importers, `card.tsx` 21, `dialog.tsx` 9 |
| Feature components | `src/components/<feature>/` | |
| Routes | see below | |
| Isolated preview | none | No Storybook |

| URL | File | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | |
| `/shop` | `src/app/shop/page.tsx` | |
| `/product/[id]` | `src/app/product/[id]/page.tsx` | Needs an id, `1` works |
| `/account` | `src/app/(auth)/account/page.tsx` | Behind login |

### What is safe to change
- **Safe to change:** copy and layout in `src/app/**/page.tsx`; `src/components/home/*` (one importer each).
- **Change with care:** `src/components/ui/*`, `src/app/globals.css`, `src/app/layout.tsx`. Check every route that uses them.
- **Ask an engineer first:** `src/lib/api/`, `src/app/api/`, `middleware.ts`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`.
- Repo rules applied: `CODEOWNERS` gives `src/components/ui/` to @design-system.

### Blockers and questions
1. `/account` needs a login. Question for an engineer: "Is there a test account for local development, or a way to run with auth mocked?"

### Not checked
- `/checkout`: needs items in the cart; not reached.

### Seen in passing
- The footer overlaps the last product row at the home page's default height.

### Next
- To write a DESIGN.md from these tokens: `create-design-md`, if installed.
- Before editing a primitive: run `/component-impact`, if installed.
```

## Rules

- **Status** comes from what rendered, never from a log line. `Running with gaps` lists each gap under Blockers.
- **Not running** puts the failing command, the first error verbatim, the cause and the fix directly under the status, and still gives the map, since files can be read without a running server.
- Every path in the note exists in this repo. Every count comes from a search you ran.
- Name the file that settled each detection answer (`from .nvmrc`, `from packageManager`). When an answer is an assumption, write "assumed".
- Never include secret values, tokens or credentials, even ones the user typed.
- Keep route tables to the main screens (about ten). Say how many routes you left out. When screens are views switched by state on one URL, map each screen to its file and line range and say how to reach it.
- **Not running** leaves the URL row as "not reached".
- "Blockers and questions" and "Not checked" are required. Empty ones say "None" and "Nothing skipped". "Seen in passing" is optional.
- "Not checked" covers the steps of this skill. Dark mode and narrow widths are review work, not orientation; mention a dark theme only as a map fact (it exists, and what switches it).
- When a row has nothing (no primitives, no tokens), write "none" and what the repo does instead ("raw hex in `App.css`, `#667eea` 7 times").

## When the user asks for a file

Write the same content to the path the user names. Without a path, use `ORIENTATION.md` at the app root. It is the one file allowed to show in `git status`. Before writing:

- If the file exists, ask before overwriting.
- Tell the user whether the path is gitignored. If it is not, say the file will show up in `git status` and should only be committed if the team wants it.
- Do not commit it.
