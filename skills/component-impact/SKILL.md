---
name: component-impact
disable-model-invocation: true
description: Before a shared component, variant or design token change goes into a pull request, finds every place it is used, renders each place before and after the change, and flags what changed and what broke. Use when someone asks "where is this component used", "what uses this token", "will changing the Button break anything", "what else does this affect", "check the blast radius", or edits a shared UI primitive, a cva variant, a CSS variable or a Tailwind or MUI theme value. Works on React-family frontends (Next.js, Vite; Tailwind, CSS variables, shadcn and cva, MUI).
---

# Component impact

This skill answers one question about a change to something shared: where does it show up, and what does it look like there now? It finds every usage of a component, variant or token in source, maps each usage to a place that renders it, screenshots each place from the base commit and from the working tree, diffs the pairs and looks at every difference. It owns the usage search, the before and after renders and the impact report. Deciding whether a shared change is the right move belongs to `design-system-evolution`, mapping raw values onto tokens to `token-mapping`, rule-based review of the diff to `interface-review`, stress-testing one component with hostile content to `break`, a whole branch compared against production to `visual-qa-branch`, and the pull request itself to `reviewable-ui-pr`. Name the owner when its job comes up and keep going without it.

## 1. Name the target and the change

Restate the target in one sentence, with its file. It is one of:

| Target | Example | A usage is |
| --- | --- | --- |
| Component | `Card` in `components/ui/card.tsx` | Every render, directly or through a wrapper |
| Variant or size | `variant: outline` in `buttonVariants` | Every render that resolves to it, including the default when the prop is omitted |
| Base styles | The first argument to `cva`, a component's root class | Every render of every variant |
| Token | `--color-primary`, `colors.primary`, `palette.primary.main` | Every class, `var()`, theme lookup or alias that resolves to it |

Then resolve the change:

- **Uncommitted edits.** The base is `HEAD`.
- **A branch with commits.** The base is `git merge-base origin/<default-branch> HEAD`. Include uncommitted edits on top.
- **No change yet.** Run steps 2 to 4 and hand over the usage table. It is the most useful input to the decision. If making the edit is part of this session's job, make it, then continue at step 5.

Record the base SHA as `$BASE`. Detect the stack from the files: framework and router, styling, component library, where tokens are defined (a CSS file, `tailwind.config.*`, a Tailwind v4 `@theme`, `createTheme`), the package manager and whether Storybook exists. For a stack outside React-family web frontends, say so, deliver the usage inventory and stop before rendering.

Ask what the change is for when it is not obvious from the request. Severity depends on intent: the same pixels are `OK` where the change was meant to land and `MEDIUM` where it was not.

## 2. Find every usage

Search by module and by every syntax that consumes the token, not by name. [finding-usages.md](finding-usages.md) holds the searches. The patterns agents miss:

1. **Relative imports.** `../ui/button` next to `@/components/ui/button`. An alias-only search finds most importers and silently skips the neighbours.
2. **Barrels and re-exports.** Every file that re-exports the target becomes a module to search, until a pass finds none.
3. **Local names.** Renamed, default and namespace imports, and second exports such as `buttonVariants` applied to a link.
4. **Wrappers.** A component that renders the target passes the change on to its own usages. Record the hop and the props it pins.
5. **The default variant.** A render with no `variant` prop gets the default. A search for `variant="default"` never finds it.
6. **Overrides.** A `className` merged through `cn` or `tailwind-merge` beats the variant's value for the same property, so that usage should not change.
7. **Token syntaxes.** `var(--x)`, every Tailwind utility generated from the key (`bg-primary`, `hover:bg-primary/90`), theme lookups and other tokens that alias it. Each theme block (`.dark`, `[data-theme]`) is a separate value.

Run the searches on the working tree, then again at `$BASE` for usages the change deleted. Use the language server's find-references when the agent has one, together with the text search, since it does not see class names.

Write the inventory down before rendering anything: one line per usage with `path:line`, the hop, and the props that matter for this change (variant, size, an override of the changed property, a dynamic value). List what cannot be resolved, such as string-built class names or content from a CMS, as unresolved. Never drop it.

## 3. Map usages to places

A place is a URL plus what it takes to make the usage visible: route params, state, an interaction, a width and a theme. Walk each usage's importers up to a route entry, a layout or a story. [rendering.md](rendering.md#from-a-usage-to-a-place) lists the entries per framework.

Prefer a real route, then an existing story, then a harness page that renders the containing component with props. A usage with none of these is `Not rendered`, with the reason. Behind-a-click usages (tabs, drawers, dialogs, menus) need steps, and unpainted elements such as a ghost button need a hover or focus step, since a size change to a transparent box shows only when it moves a neighbour.

Group usages into **kinds**: usages that reach the change through the same path with the same relevant props. Seven buttons that all override the changed colour are one kind.

## 4. Decide what to render, and say what you skipped

Render every place when there are up to about 15. Beyond that, sample with a rule a reader can check:

1. At least one place per kind.
2. Every dynamic or unresolved-prop usage gets its own place.
3. Within a kind: routes before stories before harness pages; then the pages the user named, layouts and entry pages; then by importer count.
4. Spread the rest across product areas, never fifteen from one folder.

State the coverage in numbers: usages found, kinds, places rendered, usages those places cover, and the kinds not rendered by name. With 200 usages, "Rendered 15 places covering 18 of 18 kinds and 47 of 212 usages" is a complete result. "Checked all usages" after rendering 15 is a false one.

## 5. Stand up before and after

Render the base from a git worktree outside the repository, never by stashing or switching the user's checkout. Link or install dependencies, copy the env files, and start one server per tree on two free ports, both in the same mode. [rendering.md](rendering.md#the-base-worktree) has the commands.

Confirm each server is yours before capturing: a busy common port answers with another project's page, which looks plausible. If either server fails to start, stop and report the error. There is no impact report with one side missing.

## 6. Capture three times

Write the places into a capture plan and run `scripts/capture.mjs` from this skill three times: base, base again, working tree. The plan format and settings are in [rendering.md](rendering.md#the-capture-plan). Widths default to 375 and 1280, plus any breakpoint the changed code uses. Add a `dark` theme when the token has a dark value, set up the way the app switches to dark: the OS setting, a stored preference such as next-themes' `localStorage` key, or a cookie ([rendering.md](rendering.md#themes)).

The script freezes animation, waits for fonts, network and images, scrolls once for lazy content and shoots until two consecutive frames match. Full-page shots of an app shell that scrolls an inner element grow the viewport to fit it, up to `maxHeight`. Any place that fails to load, settle or capture comes back as a failure with its error, including an uncaught page error and a forced theme that breaks hydration: report it as `Not rendered`, never as unchanged. With no way to run Playwright, follow the fallback in [rendering.md](rendering.md#the-capture-plan) and say the capture settings were not controlled.

## 7. Compare, then look

```bash
node <this-skill>/scripts/pixel-diff.mjs "$OUT/before" "$OUT/after" --repeat "$OUT/before-repeat" --out "$OUT/diff"
```

It has no dependencies and prints one JSON line per screenshot: `unchanged` or `changed`, the changed pixel count, the bounding box, both sizes, and pixels excluded as noise because they also differed between the two base captures. It writes a diff image per changed pair, changed pixels red and noise yellow.

The numbers locate a change, they do not judge it. Open the before, after and diff images for every changed pair, crop to the bounding box on long pages, and say what a person sees: "Page numbers grew from 36 to 44px; Previous and Next stayed 36px, so the row no longer shares a baseline."

Three results need attention beyond the red pixels:

- **An after shot wider than the viewport** is horizontal overflow the change caused. It is `HIGH`.
- **A place that fails on after with `uncaught page error` or an error overlay, and captured on before,** means the change throws. Report it as `HIGH` with the error, not as `Not rendered`.
- **No change where the change was aimed** means the after server is not serving the edit, a cache is stale, or every usage there overrides it. Find out which before reporting anything else.

## 8. Classify every row

**Changed** is `Yes`, `No`, `Noise` (the difference also appears between the two base captures and survived masking) or `Not rendered`.

**Severity**, for `Yes` only:

- `HIGH`: the change broke the place. Overflow past the viewport or a container, clipped or overlapping text or controls, a control hidden or out of reach, text that became unreadable against its background, a page error. Where `better-accessibility` or `better-colors` is installed, use it to confirm a contrast or reachability call.
- `MEDIUM`: a visible change the user did not intend at this place. Misalignment with neighbours, surrounding content shifting, a component no longer matching its siblings.
- `LOW`: unintended and minor, such as a corner radius on an image inside a padded frame.
- `OK`: the intended change, landing as intended.

A changed shared component outranks the same symptom in one leaf: when one cause produces findings at several places, report it once against the cause, with every place listed.

## 9. Clean up

Stop both servers, remove the worktree this skill created with `git worktree remove --force <path>`, and delete any harness page from the working tree. The force is needed because git refuses to remove a worktree with untracked files, and the harness page is one, as is a symlinked `node_modules` when the ignore rule is `node_modules/` (a directory rule does not match a symlink). Never force-remove a worktree this skill did not create. Check that `git status` shows the same files as before the run. Keep the screenshots in a scratch folder outside the repository and give its path.

## Before you finish

| Mistake | Fix |
| --- | --- |
| The inventory came from one alias search | Add relative paths, barrels, renamed imports and wrappers |
| A bare `<Button>` missing from a default-variant change | Renders without the prop get the default variant |
| A token searched only as `var(--x)` | Search every utility the theme key generates, and every alias |
| A tab, drawer or dialog usage marked unchanged after loading the page | It was never on screen; add the step that opens it |
| A ghost or transparent element marked unchanged | Check a neighbour moved, or capture it on hover or focus |
| The base rendered by `git stash` or `git checkout` | Use a worktree outside the repository |
| Screenshots taken against a port nobody checked | Confirm both servers are yours from their logs |
| "No visual changes" with no repeat capture | Run the base twice so noise is separated from change |
| A changed pair reported from the numbers alone | Look at before, after and diff, and describe what a person sees |
| "All usages checked" after sampling | State usages found, kinds, places rendered and usages covered |
| A failed capture missing from the table | It is a `Not rendered` row with its error |
| A harness page or the worktree left behind | Remove both; `git status` matches the start |

## Report

The format lives in [output-format.md](output-format.md): scope, coverage, the usage table, findings with image paths, what was not rendered, pre-existing issues and a closing line. The usage table has one row per usage or kind:

| # | Usage | Location | Rendered at | Changed | Severity | What changed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `PaginationLink`, via `buttonVariants`, size `icon` | `src/components/ui/pagination.tsx:55` | `/shop` @375 | Yes | HIGH | Row 3px wider than the viewport; the page scrolls sideways |

Close with the count of `HIGH` findings and what it means for the pull request, the folder holding the screenshots, and the next step. If `reviewable-ui-pr` is installed, tell the user to run `/reviewable-ui-pr` and point it at the before and after pairs for the changed rows. It runs only when the user starts it.

## Boundaries

- Never edit the target or its usages to fix a finding. Report it with options. On a request to fix, follow the user's choice, then capture and compare the affected places again.
- Never stash, check out, switch, reset or otherwise rewrite the user's working tree. The only file this skill adds to it is a harness page, removed at the end.
- Never commit, push or open a pull request.
- Never report a place as unchanged that was not rendered, and never claim full coverage after sampling.
- Never invent a screenshot, a pixel count or a server that started. A step that could not run is reported with its error.
- Never sign in to a production service or use a real customer's account to reach a place.
- Never decide whether the shared change is the right design-system call. Show its impact; the decision is the user's, or `design-system-evolution`'s.

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
