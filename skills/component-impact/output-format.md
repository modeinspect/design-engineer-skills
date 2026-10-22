# Output format

The impact report answers two questions for the person opening the pull
request and the engineer reviewing it: where does this change show up, and is
any of it wrong. Every row is backed by a screenshot pair or by a stated
reason it has none.

## 1. Scope

| Field | Value |
| --- | --- |
| Target | `Button`, `size: icon` in `src/components/ui/button.tsx` |
| Change | `h-9 w-9` to `h-11 w-11`, uncommitted |
| Intent | Larger touch targets for icon buttons |
| Base | `HEAD` at `a1b2c3d`, rendered from a worktree |
| After | working tree |
| Stack | Next.js 14 App Router, Tailwind 3, shadcn with `cva` |
| Servers | both `next dev`, ports 4101 and 4102 |
| Widths and themes | 375, 1280; light |

## 2. Coverage

One paragraph, numbers with units, no adjectives:

> Found 14 usages in 11 files: 9 direct, 5 through 2 wrappers (`CarouselNext`,
> `PaginationLink`), 0 unresolved. 6 kinds. Rendered 7 places covering 6 of 6
> kinds and 13 of 14 usages, at 2 widths. Not rendered: 1 usage (below).

When the inventory was sampled, say how: "Rendered 15 of 212 usages, at least
one per kind, chosen by the rule in **Decide what to render**." Never write
"all usages" or "full coverage" unless every usage was rendered.

## 3. Usage table

One row per usage, or per kind when a kind holds many identical usages (say
how many in the Usage cell). Order: `HIGH`, `MEDIUM`, `LOW`, `OK`, then
unchanged, then not rendered.

| # | Usage | Location | Rendered at | Changed | Severity | What changed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `PaginationLink` page numbers, via `buttonVariants`, size `icon` | `src/components/ui/pagination.tsx:55` | `/shop` @375 | Yes | HIGH | Row is 3px wider than the viewport; Next is pushed past the content edge and the page scrolls sideways |
| 2 | same | same | `/shop` @1280 | Yes | MEDIUM | Page numbers 44px tall, Previous and Next still 36px; the row no longer shares a baseline |
| 3 | `ReviewCard` action, ghost `icon` | `src/components/common/ReviewCard.tsx:41` | `/product/1`, Reviews tab | Yes | MEDIUM | The unpainted button grew; every review card is 8px taller |
| 4 | `CarouselPrevious`, `CarouselNext` | `src/components/ui/carousel.tsx:204` | `/` @375, @1280 | Yes | OK | Arrows larger as intended; they sit 12px further left |
| 5 | `QuantityStepper` buttons, 2 usages, override `h-5 w-5` | `src/components/ui/stepper.tsx:49` | `/cart` with an item | No | | Override wins, as expected |
| 6 | Banner close, overrides `w-fit h-fit` | `src/components/layout/Banner.tsx:16` | `/` @1280 | No | | Hidden below `sm`, unchanged above |
| 7 | Admin export button | `src/app/admin/export/page.tsx:30` | | Not rendered | | Needs an admin sign-in; the project has no dev login |

- **Usage** names the component the user would recognise, the hop, and the
  props that matter for this change.
- **Location** is `path:line` of the render, in the working tree.
- **Rendered at** is the place: path, the state or step that made the usage
  visible, the width.
- **Changed** is `Yes`, `No`, `Noise` or `Not rendered`.
- **Severity** is filled only for `Yes`.
- **What changed** is what a person sees, in numbers where possible. "Gap
  shrank from 16 to 12px", never "spacing feels off".

## 4. Findings

For each `HIGH` and `MEDIUM` row, a short block:

- the before, after and diff image paths, cropped to the changed region when
  the page is long;
- one or two sentences on the cause, tied to the change: "The page number
  links take `size: icon`; five 44px links and two labelled buttons no longer
  fit in 343px";
- the options, cheapest first, without applying any: override at the usage,
  give the usage its own size, or narrow the change to a new variant. Choosing
  between them is a design-system decision; name `design-system-evolution` if
  it is installed.

## 5. Not rendered and unresolved

List every usage without a screenshot and why: needs sign-in, needs data that
does not exist locally, behind a flag, string-built class, another
repository. These are open risks for the reviewer, not passes.

## 6. Pre-existing issues

At most three things visibly wrong on both sides, stated as not this change's
responsibility. Omit the section when there are none.

## 7. Close

One line with the count of `HIGH` findings and what it means for the pull
request: "1 HIGH finding: fix before opening the pull request" or "No HIGH
findings. 2 MEDIUM findings for the author to accept or fix." Then the folder
holding the screenshots, and the next step: if `reviewable-ui-pr` is
installed, tell the user to run `/reviewable-ui-pr` with the before and after
pairs for the changed rows. It runs only when the user starts it.
