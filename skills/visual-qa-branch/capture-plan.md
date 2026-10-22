# Running the capture script

[scripts/capture.mjs](scripts/capture.mjs) takes one plan file and captures every route, width, theme and state on both sides. For each pair it writes the two screenshots, a pixel diff, a side-by-side image and a computed-style diff, then a `report.json` that covers the whole run.

## Playwright

The script needs the `playwright` package and a Chromium build. It looks in `$PLAYWRIGHT_FROM` first, then in the current directory. If the repo already depends on `playwright` or `@playwright/test`, run the script from the repo root. Otherwise install it outside the repo, never into it, in the tools folder all capture skills in this pack share:

```bash
TOOLS="${TMPDIR:-/tmp}/design-engineer-skills-playwright"
npm i --prefix "$TOOLS" playwright
npx --prefix "$TOOLS" playwright install chromium
```

When the install fails (no network, no Node), say so with the error and fall back to the manual path at the end of this file.

The script imports `capture-core.mjs` and `pixel-diff.mjs` from its own folder, which it shares with other skills in this pack. Leave the three files together.

## The plan

```json
{
  "out": "/tmp/visual-qa/feature-pricing-a1b2c3d",
  "sides": {
    "base": { "url": "http://localhost:3101" },
    "head": { "url": "http://localhost:3100" }
  },
  "widths": [375, 768, 1280],
  "themes": {
    "light": { "colorScheme": "light" },
    "dark": { "colorScheme": "dark", "localStorage": { "theme": "dark" } }
  },
  "routes": [
    {
      "path": "/pricing",
      "waitFor": "h1",
      "mask": ["[data-testid=countdown]"],
      "states": [
        { "name": "hover-cta", "action": "hover", "selector": "a:has-text('Start trial')" },
        { "name": "focus-cta", "action": "focus", "selector": "a:has-text('Start trial')" }
      ]
    },
    { "path": "/settings/billing", "waitFor": "table tbody tr" }
  ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `out` | yes | Capture directory, outside the repo |
| `sides.base.url`, `sides.head.url` | yes | Origins of the baseline and the branch. Route paths are joined to them |
| `sides.*.storageState` | no | Path to a Playwright storage state file for routes behind a login, one per side |
| `widths` | yes | Viewport widths in CSS pixels |
| `height` | no | Viewport height, default 900 |
| `maxHeight` | no | Longest page captured, default 6000. Longer pages are cut and the cut is recorded |
| `themes` | yes | Name to setup. `colorScheme` emulates the OS setting. `localStorage` entries are set before any page script runs. `htmlClass` and `htmlAttr` are set on `<html>` before any page script runs, only for apps whose own toggle does exactly that. If the app removes them, or React reports a hydration mismatch, the capture fails: the theme is not reachable that way |
| `routes[].path` | yes | Path, query and hash as a user would type them |
| `routes[].waitFor` | no | Selector that is visible once the page has its data. Use it on every route that loads data after the first paint |
| `routes[].mask` | no | Selectors painted over in screenshots: clocks, random avatars, live counters |
| `routes[].hide` | no | Selectors hidden with `visibility: hidden` before capture: cookie banners, chat widgets. Each entry is hidden on its own. An invalid selector fails the capture; one that matches nothing is recorded in `warnings` |
| `routes[].settleMs` | no | Extra wait for this route only, after load, fonts and lazy content |
| `routes[].states[]` | no | `name`, `action` (`hover`, `focus` or `click`) and `selector`. Optional `maxTabs` (default 80), `pad` around the clip (default 32) and `settleMs` |
| `routes[].states[].steps` | no | For a state that takes several actions, a list of `{ action, selector }` run in order, in place of `action` and `selector`. `target` names the element to clip and compare, default the last step's element. Example: click the row menu, click "View details", target `[role=dialog]` |
| `threshold` | no | Per-channel difference, 0 to 1, below which pixels count as equal. Default 0.1 |
| `settleMs` | no | Extra wait after load, fonts and lazy content, default 500 |

Selectors are Playwright selectors, so `:has-text()` and `text=` work.

## Run it

```bash
PLAYWRIGHT_FROM="$TOOLS" node <skill-dir>/scripts/capture.mjs /tmp/visual-qa/plan.json
```

Each pair prints one line: changed pixel share, region count, page height on both sides, style changes and how many groups they form, content changes and elements present on one side only. Warnings and console errors follow on their own lines. The script exits with 1 when any capture failed, after capturing the rest. Report every failure; do not rerun until the failures disappear by dropping routes.

Expect about four seconds per pair on a dev server. Three routes at three widths in two themes with two states each is 54 pairs: each route, width and theme gets the default capture plus one per state.

## What it does to every page

- Opens a fresh browser context per capture at the given width, scale factor 1, with reduced motion emulated and the theme applied.
- Sets CSS transitions and animations to zero duration so they sit at their end state, and hides the Next.js dev badge. Waits for `waitFor`, network idle, fonts and images, scrolls once through the page so lazy and in-view content loads, then waits `settleMs`.
- Hides each `hide` entry, then fails the capture, with the error in `errors`, when the page returns HTTP 400 or above, redirects to another path, shows a framework error overlay or error toast, throws an uncaught page error (even with no overlay), renders blank, has no visible match for `waitFor` or a state selector, has an invalid `hide` selector, loses the theme class, or breaks hydration because of a forced `htmlClass` or `htmlAttr`.
- Shoots until two consecutive frames are identical. JavaScript-driven animation (chart libraries, spring physics, carousels) ignores the CSS freeze; a page still changing after 10 seconds fails with `never settled`. Mask or hide the moving element.
- App shells that scroll an inner element (a full-height layout with `overflow: auto` on the content area) stop a full-page screenshot at the viewport. The script grows the viewport until the inner scroller fits, up to `maxHeight`, and records `expandedTo`.
- For a state, it drives the element, then captures a clip around it and compares only that element and its children. The default capture of the same route covers the rest of the page. The clip includes `pad` pixels of surroundings, so a pixel change in a state clip with no style change usually means a neighbour moved; the default capture explains it.

## Output

```
<out>/base/<route>/<width>-<theme>-<state>.png
<out>/head/<route>/<width>-<theme>-<state>.png
<out>/diff/<route>/...           changed pixels in red over a faded copy of the branch
<out>/side-by-side/<route>/...   baseline on the left, branch on the right
<out>/report.json
```

Diff and side-by-side files exist only for pairs with a changed pixel. Pages taller than 1200px get side-by-side tiles named `<width>-<theme>-<state>-y<offset>.png`, one per 1200px band that contains a change, so each stays legible when you open it. `pixels.sideBySide` in the report lists them.

## Reading report.json

Each entry in `shots` has:

- `pixels`: `changedRatio`, both image sizes and up to 12 `regions` (`x`, `y`, `w`, `h`), largest first. A height change means something above the fold grew or shrank, so everything below it shifts and the pixel diff below that point says little. Use the side-by-side there.
- `dom.styleGroups`: computed-style changes on elements matched by their position in the tree, grouped when many elements changed the same way. Each group lists the properties as `[before, after]`, the count, and samples with the element's tag, class list, text and box. The class list is how you match a group to a changed line.
- `dom.content`: elements whose own text or image source differs. These are content differences unless the branch changed that text.
- `dom.onlyBase`, `dom.onlyHead`: elements present on one side only. The branch added or removed markup, or a content difference changed the number of rows. Near a cut (`notes.*.truncatedAt`), some are just rows that moved across the cut.
- `notes`: `expandedTo` and `truncatedAt` per side.
- `warnings`, `pageErrors`, `consoleErrors`: per side. Warnings include `hide` entries that matched nothing. Console errors that appear on head and not on base point at the branch.

`errors` lists every capture that failed, with its route, width, theme, state, the `side` that failed, the message, and that side's `pageErrors` and `consoleErrors`.

Matching by tree position is exact when the branch only changes styles. When the branch inserts or removes an element, everything after it in the same parent shifts and the style diff for that parent's later children turns noisy. Fall back to the side-by-side image for those.

## Checking for noise

Copy the plan, set `sides.head.url` to the baseline's URL, point `out` at a new directory and keep only the routes in question. Every difference in that run is noise. Mask or hide it in the real plan and capture again.

- Mask the smallest element that changes. A mask over an element clipped by a scroll container is painted where the element would be, over whatever is visible there.
- Noise that changes layout cannot be masked away: random text in an auto-sized table column resizes every column on each load. The style diff still separates it, since those elements show only content and geometry changes. Classify that route from the style diff and say its pixel diff is unreliable.
- The script hides the Next.js dev badge. An error overlay or an uncaught page error on either side is a failed capture, not noise.

## Without the script

When the script cannot run but you have a browser tool, follow the same matrix by hand: one fresh page per capture, the same widths, the same theme setup, Tab to reach focus, real hover. Save the files under the same layout, look at each pair side by side, and say in the report that the comparison was manual and has no pixel or style diff.
