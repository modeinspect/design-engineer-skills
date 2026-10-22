# Widths, themes and states

Every capture is one route at one width, in one theme, in one state. Choose each axis from the repo and the diff, not from habit.

## Widths

Start with 375, 768 and 1280, at a height of 900. Then read the breakpoints the repo actually uses:

| Where | What to read |
| --- | --- |
| Tailwind v3 | `theme.screens` in `tailwind.config.*`; defaults are `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 |
| Tailwind v4 | `--breakpoint-*` variables in the CSS `@theme` block; same defaults |
| MUI | `theme.breakpoints.values`; defaults are `sm` 600, `md` 900, `lg` 1200, `xl` 1536 |
| CSS, CSS modules, styled-components | `@media (min-width: ...)` and `(max-width: ...)` in the changed files |
| JavaScript | `useMediaQuery`, `matchMedia` and window-width checks in the changed files |

For every breakpoint a changed line uses (`md:grid-cols-4`, `@media (min-width: 900px)`, `theme.breakpoints.up("md")`), make sure one capture sits below it and one at or above it. Add `breakpoint - 1` when no default width falls below it. A layout change written for one breakpoint is invisible at every width on the wrong side of it, and the developer's own wide screen is almost always on the wrong side of a mobile change.

Container queries (`@container`, Tailwind `@md:`) respond to the container's width, not the viewport. Pick viewport widths that put the container on both sides of its breakpoint and say so.

Keep the list to four widths. More rarely finds more.

## Themes

### Find the mechanism

Read how the repo switches to dark before choosing how to drive it:

| Signal in the repo | Mechanism | How to drive dark |
| --- | --- | --- |
| Tailwind v3 with no `darkMode` key, or `darkMode: "media"` | `dark:` utilities follow the OS setting | Emulate `prefers-color-scheme: dark` |
| Tailwind v3 `darkMode: "class"` or `"selector"`, or a custom selector array | `dark:` utilities follow a class on an ancestor | Find what sets the class (rows below) |
| Tailwind v4 with no `@custom-variant dark` | OS setting | Emulate `prefers-color-scheme: dark` |
| Tailwind v4 `@custom-variant dark (&:where(.dark, .dark *))` or a `[data-theme=dark]` variant | Class or attribute | Find what sets it (rows below) |
| `next-themes` `ThemeProvider` | A script sets `attribute` (default `data-theme`, shadcn uses `class`) on `<html>` from `localStorage[storageKey]` (default `theme`), falling back to the OS when `enableSystem` is on | Set `localStorage[storageKey] = "dark"` before load and emulate the OS setting |
| MUI `colorSchemes` or `CssVarsProvider` | Mode stored in `localStorage["mui-mode"]`, falling back to the OS | Set `mui-mode` to `dark` before load and emulate the OS setting |
| MUI `createTheme({ palette: { mode } })` fed by `useMediaQuery("(prefers-color-scheme: dark)")` | OS setting through JavaScript | Emulate the OS setting |
| Plain CSS `@media (prefers-color-scheme: dark)` | OS setting | Emulate the OS setting |
| A custom toggle (`classList.add("dark")`, `dataset.theme = ...`) | Usually a stored preference | Read the toggle for its storage key and set it; otherwise set the class or attribute after load |

Drive dark the way a user reaches it, through the same storage key or OS setting the app reads. Set a class directly only when the app's own toggle does exactly that and stores nothing. If the forced class or attribute makes React report a hydration mismatch, the capture fails with `theme not reachable by forcing ...`: users cannot reach that theme this way, so use the storage key or drop the theme.

### Check it took effect

After the first dark capture, confirm the theme applied: the `<html>` class or attribute is present where the mechanism needs one, and the body background or a primary token differs from the light capture. If light and dark look the same on the baseline, one of two things is true:

- The theme was not applied. Fix the plan before going further.
- Dark mode is not reachable on that route. A common case: `.dark` token overrides exist in the CSS, but nothing in the app ever sets the class, while Tailwind's `dark:` utilities still follow the OS setting. Users with a dark OS then get light tokens with a few dark utilities mixed in. Report that once as a pre-existing observation, keep capturing with the OS setting (that is what users see) and do not force the class.

Run both sides with the identical theme setup.

### Other themes

When the repo ships more than light and dark (brand themes, high contrast), capture only the themes the changed files reference, and list the rest as not captured.

## States

### Which elements

Pick interactive elements the diff touched:

- Lines with `hover:`, `focus:`, `focus-visible:`, `group-hover:`, `peer-*`, `active:`, `data-[state=...]`, `aria-*` variants.
- CSS `:hover`, `:focus-visible`, `:focus-within`, `:active` rules in changed files.
- `onMouseEnter`, `onFocus`, `whileHover` and similar handlers.
- Interactive elements inside a changed component, even when only their default style changed. A new background breaks hover more often than the hover rule itself, especially in dark mode.

At most three per route. Write a selector that finds the same element on both sides. Prefer text or role (`button:has-text('Export')`), then a `data-testid` or `data-slot`, then structure. If the branch changes the text, use something that did not change.

### How to drive them

- **Hover**: move the real pointer over the element. Do not force `:hover` through developer tools: that skips JavaScript hover handlers and parent `group-hover` rules.
- **Focus**: press Tab from the top of the page until the element has focus. `element.focus()` after a mouse interaction often does not match `:focus-visible`, so the ring a keyboard user sees never renders. If the element is not reached within 80 presses, either the selector is wrong or the element is not keyboard reachable. Check which before reporting.
- **Open, pressed, selected**: click it. Use this for menus, popovers, tabs and accordions the diff changed. When reaching the element takes more than one action (open a row menu, then choose "View details" to open a dialog), use a state with several steps.
- **Disabled, loading, empty, error**: reach them only when a URL or a click produces them on both sides. Rendering every state of a component with mock data belongs to a state coverage skill such as `state-machine`; name it and move on.

Capture states at every width and theme where the element is visible. A hover change that is fine in light mode can be unreadable in dark mode.

### Motion

Captures freeze CSS motion: transitions and animations jump to their end state and reduced motion is emulated, so both sides settle the same way. JavaScript-driven animation, such as a chart drawing itself in, keeps running; the script waits until two consecutive frames match and fails the capture if the page never settles. Mask or hide the moving element ([capture-plan.md](capture-plan.md)). A screenshot cannot show a change in timing or easing. When the diff changes motion, list it under "Could not check" and hand it to a motion skill if one is installed.
