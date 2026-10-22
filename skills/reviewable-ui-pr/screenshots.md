# Screenshots: what to capture and how

## Routes

Map each changed file to a URL where it renders.

| Stack | Route source |
| --- | --- |
| Next.js App Router | `app/**/page.tsx`. The folder path is the URL. Drop `(group)` folders. Fill `[param]` segments with a real value from the app's data |
| Next.js Pages Router | `pages/**`. The file path is the URL |
| Vite or React Router | The router config, `createBrowserRouter` or `<Route path>` |
| Storybook present and the component has stories | `/iframe.html?id=<story-id>&viewMode=story` on both sides. Use this for states the app route cannot show, in addition to the route |

For a leaf component, search for its importers up to the first page. For a shared component, token or global style, list the consumers, capture the two or three most visible, and say how many you did not capture.

**Sign-in walls.** The script fails a capture that redirects. When routes need a session, ask the user to sign in once in a browser window that saves the session to a file outside the repo:

```bash
npx --prefix "$TOOLS" playwright codegen --save-storage="$TOOLS/auth.json" http://localhost:<port>/login
```

Then set `"storageState": "<path>"` in the config. Never commit that file, and never type credentials for the user.

## Breakpoints

Read them from the repo:

| Source | Values |
| --- | --- |
| Tailwind 3 `theme.screens` or `theme.extend.screens` | As configured. Defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 |
| Tailwind 4 `@theme { --breakpoint-*: ... }` | As configured, same defaults |
| MUI `createTheme({ breakpoints: { values } })` | As configured. Defaults: `sm` 600, `md` 900, `lg` 1200, `xl` 1536 |
| CSS `@media (min-width: ...)` in the changed files or their parent layout | As written |

Pick widths:

- 375 for phones, always.
- 1280 for desktop, or the app's max container width when it is wider.
- One width at each breakpoint where the changed element or its parent layout changes, such as a `md:grid-cols-2` on the grid around a changed card.
- Drop widths that produce the same layout as another one. Four at most.

Heights: 812 for phone widths, 1024 for tablet, 800 for desktop.

## Themes

Capture a theme only when a user can reach it.

| Signal in the repo | Reachable | Config |
| --- | --- | --- |
| `next-themes` `ThemeProvider` mounted in a layout | Yes | `{"name":"dark","localStorage":{"theme":"dark"},"colorScheme":"dark"}`. Use the provider's `storageKey` if it sets one |
| MUI `colorSchemes: { dark }`, `CssVarsProvider` or `InitColorSchemeScript` | Yes | `colorScheme: "dark"` when the mode follows the system, or `localStorage: {"mui-mode":"dark"}` |
| `@media (prefers-color-scheme: dark)` in CSS, or Tailwind 3 with no `darkMode` set and `dark:` classes in the rendered tree | Yes, follows the OS | `{"name":"dark","colorScheme":"dark"}` |
| A theme cookie the server reads | Yes | `cookies: {"<name>":"dark"}` |
| A class or attribute set by the app's own toggle before hydration | Yes | Set it the way the toggle stores it (`localStorage` or `cookies`). `htmlClass` is the last resort |
| A `.dark { --tokens }` block that no provider, script or toggle ever applies | No | Do not capture. Report "dark tokens exist, but nothing in the app applies them" |
| `next-themes` installed but never mounted | No | Same as above |

Forcing a class the app never sets fails loudly in the script. If the app removes the class after load, the capture fails. If React reports a hydration mismatch ("Extra attributes from the server", "didn't match the client"), the capture fails with `theme not reachable by forcing ...`. That failure is correct, because users cannot see that theme. Set the theme the way the app's toggle stores it, or drop it. After a dark capture, look at it. If it looks the same as light, the theme does not reach this surface: drop it and say so.

High-contrast or brand themes follow the same rule: capture them only when users can switch to them.

## Running two copies

`$TOOLS` is the tools folder outside the repo that all capture skills in this pack share: `${TMPDIR:-/tmp}/design-engineer-skills-playwright`. `$WT` is a worktree path outside the repo. A worktree inside the repo gets picked up by the main checkout's TypeScript, linter and file watchers.

```bash
git worktree add --detach "$WT" "$BASE"
```

- **Dependencies.** When `git diff --quiet $BASE HEAD -- package.json <lockfile>` succeeds, symlink the main checkout's `node_modules` into the worktree (`ln -s "$PWD/node_modules" "$WT/node_modules"`). When dependencies differ, or the repo is a workspace monorepo, run the repo's frozen install in the worktree (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`). If the dev server fails over a symlinked `node_modules`, switch to the install.
- **Env files.** Copy the gitignored env files the app reads into the worktree: `git ls-files -o -i --exclude-standard -- '.env*'`, and the same inside the app folder in a monorepo. Never commit or print their contents.
- **Ports.** Pick two free ports. Pass them the way the dev script accepts: `next dev -p <port>`, `vite --port <port> --strictPort`, or `PORT=<port>`. With npm, extra arguments follow `--`: `npm run dev -- -p 4101`.
- **Start and wait.** Start each server in the background with output to a log file and keep its process ID. Poll the route with `curl -s -o /dev/null -w '%{http_code}'` until it answers. If the process exits or nothing answers within two minutes, print the log's last 30 lines and stop.
- **Reuse.** A dev server the user already runs from a checkout that matches the branch head can serve the after side.
- **Clean up.** Stop the servers you started. Run `git worktree remove --force "$WT"`. Keep `.reviewable-ui-pr/`.

## The capture config

```bash
PLAYWRIGHT_FROM="$TOOLS" node <skill-dir>/scripts/capture.mjs capture.json
```

The script resolves Playwright from `PLAYWRIGHT_FROM`, then from the repo. When neither has it, install it into `$TOOLS` with `npm install --prefix "$TOOLS" playwright` and `npx --prefix "$TOOLS" playwright install chromium`. If the browser download fails, report the error. Do not switch to a different capture method without saying so.

```json
{
  "out": ".reviewable-ui-pr/ui-kpi-pills",
  "sides": { "before": "http://localhost:4101", "after": "http://localhost:4102" },
  "viewports": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "desktop", "width": 1280, "height": 800 }
  ],
  "themes": [{ "name": "light" }, { "name": "dark", "colorScheme": "dark", "localStorage": { "theme": "dark" } }],
  "mask": ["[data-testid=last-updated]"],
  "shots": [
    { "name": "stat-cards", "path": "/dashboard", "selector": "div.grid:has(> [data-slot=card])", "padding": 16 },
    { "name": "stat-card-hover", "path": "/dashboard", "selector": "[data-slot=card]", "actions": [{ "hover": "[data-slot=card]" }], "viewports": ["desktop"] },
    { "name": "new-banner", "path": "/dashboard", "selector": "[data-slot=banner]", "before": "page" },
    { "name": "dashboard", "path": "/dashboard", "viewports": ["desktop"] }
  ]
}
```

| Key | Meaning |
| --- | --- |
| `selector` | Crop to this element plus `padding` (default 16). Without it, the shot is the viewport, or the full page with `"fullPage": true` |
| `before: "page"` | The element is new, so before is the whole viewport. Without it, a selector missing on before is an error |
| `actions` | Run in order before the capture: `hover`, `focus`, `click`, `fill: [selector, text]`, `press`, `waitFor` |
| `viewports` on a shot | Limit that shot to the named widths |
| `mask` | Selectors painted grey on both sides, globally or per shot |
| `scale` | Device pixel ratio, default 2. Lower it if a file goes over GitHub's 10 MB image limit |
| `storageState` | Session file for routes behind a sign-in |

Animations and transitions are frozen, fonts and images are awaited, lazy content is scrolled in, and the Next.js dev badge is hidden. The script shoots until two consecutive frames match. It fails a capture on an HTTP error, a redirect, a blank page, a framework error overlay or error toast, an uncaught page error (even when no overlay shows it), a `selector` with no visible match, a theme class the app removed, a forced theme that breaks hydration, or a page still changing after 10 seconds (`never settled`: mask the moving element). It flags pixel-identical pairs and records console errors, uncaught page errors and warnings per capture. Output files are named `<shot>--<viewport>--<theme>--<before|after>.png`.

The script imports `capture-core.mjs` from its own folder, which it shares with other skills in this pack. Keep the two files together.

The script automates the steps where agents most often drift: two servers, identical settings on both sides, waiting for the page to settle, and failing on error pages. If the repo already has a visual test setup that renders the same surfaces, such as Storybook with Chromatic, mention it in the description. Keep these captures anyway, because the reviewer sees them without opening another tool.
