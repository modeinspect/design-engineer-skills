# Rendering before and after

How to get from a usage list to two comparable sets of screenshots: places,
the base worktree, two servers, the capture plan, and the traps that produce
diffs the change did not cause.

## From a usage to a place

A place is a URL plus whatever it takes to make the usage visible: state,
interaction, width and theme. Walk each usage's importers upward until you
reach an entry the framework renders:

| Framework | Entries |
| --- | --- |
| Next.js App Router | `app/**/page.*`; `app/**/layout.*` and `template.*` render on every route below them |
| Next.js Pages Router | `pages/**`, minus `_app`, `_document` and `api/`; `_app` renders on every page |
| Vite with React Router | the route config (`createBrowserRouter`, `<Route element>`), then `main.*` |
| TanStack Router, Remix, React Router 7 | `routes/**` or the generated route tree |
| Storybook | `*.stories.*`, served at `/iframe.html?id=<story-id>&viewMode=story` |

A usage inside a layout appears on every route under it. One route stands for
all of them; name which one in the report.

For each place, record what the URL alone does not give you:

- **Dynamic segments.** `/products/[id]` needs a real id. Take one from the
  seed data, fixtures or a link on a listing page. Never invent one; a 404
  renders no usage.
- **State.** A cart with items, a non-empty table, a feature flag, a signed-in
  user. Prefer the app's own way in: a seed script, a dev login, a query
  parameter, or `localStorage` the app reads on load (the plan's
  `localStorage` field).
- **Interaction.** A tab, a drawer, a dialog, a menu. Usages behind a click are
  the ones an inventory-by-route misses: a tab panel that renders only when
  its tab is active does not exist in the page until then.
- **Paint.** A change to the size or padding of an element with no background
  or border (a ghost button, a transparent wrapper) shows no pixels of its
  own. It shows only when it moves a neighbour, or on hover and focus. Add a
  `hover` or `focus` step for those usages.

### When there is no route

In order of preference:

1. **A story** that renders the usage, if the project runs Storybook. Start it
   in both trees the same way as the app.
2. **A harness page**: a throwaway route that renders the nearest component
   containing the usage, imported from the project and untouched, with props
   that make the usage visible. It inherits the app's layout, fonts and
   providers. Where the framework splits server and client components, make
   it client code (`"use client"` in Next.js) so fixture props survive. Put
   it in one folder with an obvious name, such as `app/__impact/`, create the
   same file in both trees, and delete it from the working tree at the end.
3. **Not rendered**, with the reason. A row with a reason is an honest result.

### Sign-in walls

Use the project's documented dev login, seed user or auth bypass. If there is
none, ask the user for a test account or a session for the local app. Never
sign in to a production service and never use a real customer's account. If
it stays blocked, those places are `Not rendered: needs sign-in`.

## The base worktree

Render the base from a separate worktree, never by switching the user's
checkout. Stashing or checking out rewrites files the user has open, and a
dev server watching them picks up a half-switched tree.

```bash
BASE=$(git rev-parse HEAD)                       # uncommitted change only
BASE=$(git merge-base origin/main HEAD)          # branch with commits; use the real default branch
WT=$(mktemp -d)/base
git worktree add --detach "$WT" "$BASE"
```

Dependencies:

- If `package.json` and the lockfile are identical at `$BASE` and in the
  working tree (`git diff --quiet $BASE package.json <lockfile>`), link the
  installed modules: `ln -s "$PWD/node_modules" "$WT/node_modules"`. In a
  monorepo, link each workspace's `node_modules` as well.
- Otherwise, or if the server fails to resolve modules through the link,
  install in the worktree with the project's package manager and its frozen
  lockfile flag (`npm ci`, `pnpm install --frozen-lockfile`,
  `yarn install --immutable`, `bun install --frozen-lockfile`).

Environment: copy the gitignored env files the app reads (`.env`,
`.env.local`, `.env.development`) into the worktree. Do not print them.

## Two servers

Run the same command in both trees, in the same mode: both dev servers, or
both production builds. Mixing modes produces differences in fonts, CSS order
and hydration that the change did not cause.

1. Pick two ports that are free. Check first, for example
   `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Common ports such as 3000, 3001 and
   5173 are often held by another project's server, and a request to it
   returns a page that looks plausible and is not yours.
2. Start each server with an explicit port and, where the tool supports it, a
   strict flag so it fails instead of moving to the next port: `next dev -p
   <port>`, `vite --port <port> --strictPort`.
3. Confirm each server is yours: its own log shows the port and the tree it
   was started from.
4. If either server fails to start, stop and report the error. There is no
   impact report with one side missing.

Point both at the same backend or seed. A live API whose data changes between
captures produces differences; the repeat capture below exposes them.

## The capture plan

`scripts/capture.mjs` reads a JSON plan:

```json
{
  "widths": [375, 1280],
  "height": 900,
  "maxHeight": 6000,
  "themes": {
    "light": { "colorScheme": "light", "localStorage": { "theme": "light" } },
    "dark": { "colorScheme": "dark", "localStorage": { "theme": "dark" } }
  },
  "localStorage": {},
  "mask": [],
  "places": [
    { "id": "settings", "path": "/settings" },
    { "id": "pricing-dialog", "path": "/pricing",
      "steps": [{ "click": "text=Compare plans" }, { "waitFor": "[role=dialog]" }],
      "selector": "[role=dialog]" },
    { "id": "card-hover", "path": "/projects", "widths": [1280],
      "steps": [{ "hover": "[data-testid=project-card] button" }], "fullPage": false },
    { "id": "checkout-filled", "path": "/products/42",
      "steps": [{ "click": "text=Add to cart" }, { "goto": "/checkout" }, { "waitFor": "text=Order summary" }] }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `widths` | Viewport widths. Default `[375, 1280]`; add the breakpoints the changed code uses, such as 768 for an `md:` class |
| `themes` | Theme name to setup, default `{"light": {"colorScheme": "light"}}`. See [Themes](#themes). With more than one theme, each file name ends in `-<theme>` |
| `maxHeight` | Longest full-page shot, default 6000. Also the limit for growing the viewport to fit an app shell's inner scroller. A cut is recorded in the manifest |
| `localStorage` | Keys set before every page load, for state the app restores on load |
| `mask` | Selectors painted over in every shot: clocks, live counters, ads, video |
| `places[].steps` | In order: `goto`, `click`, `hover`, `focus`, `fill: [selector, value]`, `press`, `waitFor`, `wait: ms`. Steps act on the first visible match, since responsive layouts often keep a hidden copy of the same control |
| `places[].selector` | Shoot one element instead of the page |
| `places[].fullPage` | Default `true`; set `false` for open overlays, which are fixed to the viewport |
| `places[].widths` | Override the widths for one place, such as a mobile-only drawer |

Selectors are Playwright selectors: CSS, `text=...`, `role=button[name="Save"]`.

### Themes

Each theme takes the same keys as the other capture skills in this pack:

| Key | Effect |
| --- | --- |
| `colorScheme` | Emulates the OS setting, `prefers-color-scheme`. Enough only for apps whose dark mode follows the OS |
| `localStorage` | Set before any page script runs. Class-based dark mode reads a stored preference: next-themes uses `{"theme": "dark"}`, or its `storageKey`; MUI uses `{"mui-mode": "dark"}` |
| `cookies` | Name to value, for a theme cookie the server reads |
| `htmlClass`, `htmlAttr` | Put on `<html>` before the app's scripts run. Last resort, only for an app whose own toggle does exactly that and stores nothing |

Drive dark the way a user reaches it. With next-themes, `colorScheme` alone leaves the dark row light unless the provider follows the system; set the stored key as well. A forced `htmlClass` or `htmlAttr` fails the place when the app removes it after load, or when React reports a hydration mismatch ("Extra attributes from the server", "didn't match the client"): the theme is not reachable that way, so set it the way the toggle stores it or drop it. After the first dark capture, look at it. A dark shot that looks light means the theme was not applied.

### Full-page shots of app shells

An app shell that fixes the page to the viewport and scrolls an inner element
(`h-screen` with `overflow-auto` on the content area) stops a full-page shot at
the viewport. When the page itself does not scroll, the script grows the
viewport until the inner scroller fits, up to `maxHeight`, and records
`expandedTo` in the manifest. A page or shell taller than `maxHeight` is cut
there and the entry records `truncatedAt`. Report a cut place as covered only
down to that height.

### Running it

Run it three times, into three folders:

```bash
export PLAYWRIGHT_FROM="${TMPDIR:-/tmp}/design-engineer-skills-playwright"   # only when the project has no Playwright
node <this-skill>/scripts/capture.mjs --plan plan.json --url http://localhost:<base-port> --out "$OUT/before"
node <this-skill>/scripts/capture.mjs --plan plan.json --url http://localhost:<base-port> --out "$OUT/before-repeat"
node <this-skill>/scripts/capture.mjs --plan plan.json --url http://localhost:<head-port> --out "$OUT/after"
```

The script freezes CSS animations and transitions, sets reduced motion,
hides the Next.js dev badge, waits for fonts, network idle and images,
scrolls the page once so lazy and in-view content loads, and shoots until two
consecutive frames match. A place fails with its error when it returns HTTP
400 or above, redirects to another path, shows a framework error overlay,
renders blank, has no visible match for its `selector`, or is still changing
after 10 seconds (`never settled`). It also fails a place on any uncaught
page error, even when no overlay shows it, and on a forced theme the app
removes or that breaks hydration. It writes `manifest.json` with each shot's
HTTP status, theme, `expandedTo`, `truncatedAt`, warnings, uncaught page
errors and console errors, and exits 1 if any place failed. A failed place
is a `Not rendered` row with that error, never a silent gap.

Playwright is required. The script looks in `$PLAYWRIGHT_FROM` first, then in
the current directory, so run it from the project root when the project has
its own copy. Otherwise install it outside the project, in the tools folder
all capture skills in this pack share, and point `PLAYWRIGHT_FROM` at it:

```bash
TOOLS="${TMPDIR:-/tmp}/design-engineer-skills-playwright"
npm install --prefix "$TOOLS" playwright
npx --prefix "$TOOLS" playwright install chromium   # or pass --channel chrome
PLAYWRIGHT_FROM="$TOOLS" node <this-skill>/scripts/capture.mjs ...
```

`capture.mjs` imports `capture-core.mjs`, which other skills in this pack
share. `pixel-diff.mjs` imports nothing. Leave the three files together.

If Playwright cannot be installed, use the agent's own browser tool at the
same viewport sizes and save PNGs under the same names. Say in the report that
the capture settings were not controlled and the noise check did not run.

## Noise

Differences between two captures of the same tree are noise: JavaScript
animations that ignore the CSS freeze, carousels that autoplay, timestamps,
random sample data, live API responses. Passing the repeat folder to
`pixel-diff.mjs` excludes those pixels from the count and paints them yellow.

When a place fails with `never settled` or reports a large `noisePixels`
count, mask the moving element and capture that place again on both sides. A change that sits
inside a noisy region needs the human look before it counts.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Every shot differs by a few pixels across the whole page | Different fonts or font loading: both servers must run in the same mode from the same dependencies |
| After is identical to before at the place the change targets | The after server is not serving the working tree, a build cache is stale, or every usage there overrides the changed property. Check the server log and the rendered class list |
| Page width in the after shot is larger than the viewport | Horizontal overflow caused by the change. This is a finding, not a capture error |
| The dark shot looks like the light one | The theme setup does not reach the app's mechanism. Set the stored key or cookie the app reads ([Themes](#themes)) |
| A full-page shot of an app shell stops at the viewport height | The script grows the viewport only for an inner scroller at least half the viewport tall; `expandedTo` is `null` when it did not. Shoot the scrolled content as its own place with `selector`, or say what the shot leaves out |
| `uncaught page error` on both sides | A pre-existing error on that page. Report the place as `Not rendered` with the error; the page is broken before and after |
| A step times out, or `selector not visible` | The selector matches a hidden element, or the content is behind another interaction. Open the page and check the selector against the visible element |
| `redirected to /...` | A sign-in wall or a locale or trailing-slash redirect. Put the final path in the plan, or sign in as described above |
| HTTP 404 or 500 on one side only | A route the change added or broke. Report it on that row |
