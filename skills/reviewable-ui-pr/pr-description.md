# The pull request description

Use this when the repo has no pull request template. When it has one, keep its headings and fit these sections under them. Leave out any section that has nothing in it. Never write "N/A" rows.

Every row comes from something you can point at: a hunk, a capture, a command's output. A reviewer who checks one claim and finds it false stops trusting the rest.

## Template

```markdown
<What users will see change, in one sentence.> <Why, in one sentence, with the issue or design link.>

**Change type:** Styles only | Markup and styles | Copy | Behavior
<!-- Styles only: class names, CSS and tokens, no JSX structure, props, state, handlers or data. -->

## Screenshots

### <Shot name>: <route>
| Width | Before | After |
| --- | --- | --- |
| 375 light | <!-- img: stat-cards--mobile--light--before --> | <!-- img: stat-cards--mobile--light--after --> |
| 1280 light | <!-- img: stat-cards--desktop--light--before --> | <!-- img: stat-cards--desktop--light--after --> |

<One line per side effect seen in the captures, such as "Cards are 8px taller because the pill adds vertical padding.">

## What this touches

| File | What changed |
| --- | --- |
| `src/app/dashboard/page.tsx` | Trend line under each stat becomes a pill |

- **Components:** `Card` (not modified), `Badge` (variant `success` added, used in 14 places)
- **Tokens:** none changed | `--radius` 0.5rem to 0.625rem, global
- **Values outside the system:** `mt-[6px]`: no spacing step between 4px and 8px | none
- **Dependencies:** none | `added clsx@2.1.0`

## States checked

| State | How | Result |
| --- | --- | --- |
| Positive trend | Screenshot at 375, 768, 1280 | Pill renders green |
| Card hover | Screenshot with hover at 1280 | Shadow unchanged |
| Negative trend | Not checked | Seed data has no negative values |
| Dark theme | Not checked | Dark tokens exist, but nothing in the app applies them |

## Out of scope

- <Split off: "Customers page title edit, on branch `ui/customers-title`.">
- <Left alone on purpose: "The fourth stat card uses its own markup and keeps the old style.">
- <Noticed, not fixed: "Stat cards are clickable but not keyboard reachable, as before this change.">

## How to review

- Run `npm run dev` and open `/dashboard` at 375 and 1280 wide.
- `npm run lint`: passed. `npx tsc --noEmit`: 2 errors, both also present on `main` at `a1b2c3d`.
- Not run: unit tests (none cover this page).

## Questions for the reviewer

- <Only real questions the designer cannot answer, such as "Should the success green become a token? The page used raw `green-500` before this change.">
```

## Rules for each section

**The first lines.** Describe what a user sees, not what the code does. Write "Trend under each stat is now a colored pill", not "Updated className on trend div". The why is the user problem or the design decision, with the link. When the user gave no reason, ask for one line instead of inventing it.

**Change type.** Decide it from the diff:

- Only class strings, CSS, token values: Styles only.
- Elements added, removed or reordered: Markup and styles.
- Only text: Copy.
- Any change to props, state, hooks, handlers, conditionals, data fetching or routing: Behavior. List each such change in **What this touches**, because the reviewer reads those lines first.

**Screenshots.** Group by shot, then one row per width and theme. Placeholders are HTML comments named after the file, so the table shows nothing broken before the images are added. When before and after are the same at some width, leave that row out and write one line saying so. Use at most about 12 pairs. With more, put the rest in a `<details>` block.

**Components and tokens.** Use exact names as they appear in code. For each shared component or token, give the number of places it is used (`grep -r` for the import or variable). When the change modifies a shared one, say it plainly at the top, because that is where review time goes. If `component-impact` is installed and ran, link its output.

**Values outside the system.** Search the added lines for arbitrary Tailwind values (`-[`), hex, `rgb(` and `hsl(` literals outside token files, `style={{`, `!important`, and new CSS custom properties. Each one gets a reason. An honest "no token at this size" is fine. A missing reason is what engineers push back on.

**States checked.** Only the states this change can affect. "How" is a screenshot, an interaction you ran, or a test. A state you did not check gets a row saying why, so the reviewer knows what to look at.

**Out of scope.** This section stops the comment "did you mean to leave X?". Name what was split off, what was deliberately not changed, and pre-existing problems you saw. Keep pre-existing problems to three at most.

**How to review.** Give commands and routes the reviewer can paste. Show each check with its result. A check you did not run says so.

**Questions.** Only questions the user could not answer. An empty section is left out.
