# Classifying differences and writing the report

## The six kinds

Give every difference exactly one kind. Decide per route: the same change can be intended on the route it was made for and unintended on another.

| Kind | What it means | How you know |
| --- | --- | --- |
| **Intended** | The branch changed this on purpose | A style group's class list or property matches a changed line. `rounded-lg` added in `Card.tsx` and radius `12px` to `8px` on every card |
| **Unintended** | The branch caused it, but no changed line asked for it | It appears against the local baseline (or survives the local-baseline control in SKILL.md step 7) and no changed line targets that element, width, theme or state. Typical: a shared component changing another route, a wrap or overflow at one width, a hover rule losing to a `dark:` rule |
| **Not visible** | A changed line shows no difference in any capture | Search the style groups of every shot for the changed class or property. None found means the change does nothing where you looked |
| **Content** | Data differs, the branch did not | Only text, image source or item count differs, in markup the branch did not touch. Layout shifts caused only by that (a longer name wraps, more rows push the footer) are content too |
| **Baseline drift** | Production is not at the merge base | Production baseline only: a style difference in a component the branch did not touch, which the local baseline does not show |
| **Noise** | It changes between two loads of the same side | It shows up in the noise check: clocks, random data, carousels, ads, third-party widgets |

### Content or style

Content and style mix most against a production baseline. Separate them in this order:

1. **Same element, same text, different style**: style. The branch or drift.
2. **Different text or image, nothing else**: content.
3. **Different text and only geometry changed** (width, height, position, wrapping): content. The longer text moved things.
4. **Different text and a non-geometric property changed** (color, font size, weight, radius, padding, shadow): both. Report the style change; mention the content difference only if it hides the style change.
5. **Still unsure**: capture the route from the local baseline. If the local baseline matches the branch, the difference is production's data or deploy, not the branch.

### Not visible: what to check

For each changed line that shows nothing, check before reporting:

- Does a capture sit on the side of the breakpoint the line targets? If not, add the width and capture again.
- Is the element present and visible on that route? Behind a closed menu or tab, it needs a `click` state.
- Does a more specific or later rule override it? Compare the computed value on the branch with the class you expected to win.
- Is the class generated at all? A class name built at runtime (`` `bg-${color}-500` ``) is often missing from the compiled Tailwind CSS.

Report the line with what you found. "Overridden by `xl:gap-6` on the same element" is a finding. "Not visible" with no cause is a question for the author.

## Report format

```markdown
## Visual QA: `feature/pricing-cards` against `main`

| Field | Value |
| --- | --- |
| Branch | `feature/pricing-cards` at `e4f5a6b`, 3 commits, 1 uncommitted file |
| Baseline | `main` at merge base `a1b2c3d`, run from a worktree on port 3101 |
| Routes | `/pricing` (changed page), `/settings/billing` and `/checkout` (render the changed `Card`) |
| Skipped | 4 more `Card` consumers: `/team`, `/usage`, `/invoices`, `/onboarding` |
| Widths | 375, 767, 768, 1280 (767 added for the `md:` change) |
| Themes | light; dark through `next-themes` (`localStorage.theme = "dark"`, attribute `class`) |
| States | hover and focus on "Start trial"; hover on plan cards |
| Captures | 48 pairs in `/tmp/visual-qa/feature-pricing-cards-e4f5a6b/`, 0 failed |

### Findings

| # | Kind | Route | Element | Shows at | Before → after | Screenshots |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Unintended | `/pricing` | "Start trial" button | all widths, dark, hover | Background `#27272a` became `#f4f4f5` under white text: the new `hover:bg-primary` loses to the variant's `dark:hover:bg-accent` | `side-by-side/pricing/1280-dark-hover-cta.png` |
| 2 | Unintended | `/checkout` | Order summary card | 375, light and dark | Summary overflows its column by 12px | `side-by-side/checkout/375-light-default.png` |
| 3 | Intended | all 3 routes | `Card` | all | Radius `12px` → `8px` on 9 cards | `side-by-side/pricing/1280-light-default.png` |
| 4 | Intended | `/pricing` | Plan grid | 375, 767 | One column → two columns | `side-by-side/pricing/375-light-default.png` |

### Changed lines with no visible difference

- `src/components/PlanCard.tsx:41` adds `lg:gap-8`. Captured at 1280, the gap is still `24px`: `xl:gap-6` on the same element wins.

### Content differences

None: the local baseline shares the branch's data.

### Pre-existing

- `/pricing` "Compare plans" link: `tabindex="-1"` on both sides, so keyboard users cannot reach it.

### Could not check

- `/pricing` focus on "Compare plans": not reached in 80 Tab presses (see Pre-existing).
- Loading state of `/settings/billing`: renders only before data arrives.

### Hand-offs

- `component-impact`: not installed; the 4 `Card` consumers above were not captured.
- `interface-review`: installed; run it on the diff to judge findings 1 and 2.
- `accessibility-diff`: not installed. Finding 1 is a contrast failure on hover.
```

Keep the findings table to what a reviewer acts on: unintended first, then intended, so the author sees their change rendered as they meant it. Group one root cause into one row with every route and width it reaches. With no unintended findings, write "No unintended differences in the captured routes, widths, themes and states" and keep the scope block, so the reader sees exactly what that covers.

Paths in the table are relative to the capture directory named in the scope block. Show the side-by-side images inline for unintended findings when your interface can display images.
