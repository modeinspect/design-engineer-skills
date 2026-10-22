# AI-ready design system rubric, v1.0

Six criteria, each scored 0 to 3. `scripts/scan.mjs` measures every number below, so two runs on the same commit give the same score. Judgment never changes a score. It only explains one.

A criterion's score is the highest level whose conditions all hold. The overall score is `round(100 × points / (3 × criteria checked))`. Criterion 5 counts only when it was checked. Bands: 85 and up is **ready**, 60 to 84 is **partly ready**, below 60 is **not ready**.

## Terms

- **Component layer.** The repo's own design system directories, found by name (`components/ui`, `ui`, `design-system`, `ds`, `primitives`, `atoms`, `molecules`, `organisms`) or passed with `--ds <dir>`. With none, an installed UI library (`@mui/material`, `@chakra-ui/react`, `antd`, `@mantine/core` and others) is the layer. With neither, the layer is `none`.
- **Feature code.** Every `.tsx` or `.jsx` file outside the component layer, minus stories and tests.
- **UI files.** Every `.tsx`, `.jsx`, `.css`, `.scss`, `.sass` and `.less` file, minus stories, tests, root `*.config.*` files and token definition files (Tailwind config, `createTheme` files, `*tokens.json`). In CSS, custom property definitions (`--x: ...`) are token definitions and are never counted as raw values.
- **Project token.** A name the repo defines: a CSS custom property, a key under `colors`, `spacing`, `borderRadius` or `fontSize` in the Tailwind config, a Tailwind v4 `@theme` variable, or a `createTheme` palette, spacing, shape or typography entry.
- **Hard-coded value.** A literal where a token could be: hex, `rgb()` or `hsl()` colors, Tailwind arbitrary values (`p-[13px]`, `bg-[#F0EEED]`, `text-[32px]`, `rounded-[20px]`), CSS declarations with literal lengths or colors, and numeric `style` values.
- **Framework palette.** Tailwind's built-in color scales and `black` and `white` (`text-gray-600`, `bg-black/10`). They name a value, not a role, so an agent cannot tell which one body text should use. They count against criterion 2. The framework's spacing, radius and type scales (`p-4`, `rounded-lg`, `text-sm`) are a constrained scale and count as tokens.

## Minimum evidence

A repo with almost no UI would pass by having nothing to violate. When feature code has fewer than **10 component or interactive element uses** (`<Button>`, `<button>`, `<input>`, `<a>` and the like), or UI files hold fewer than **50 styling values**, the overall score is **not scored**. The table is still printed as a diagnostic.

## 1. Discoverable

An agent asked for a button must find exactly one, at one import path, and know which neighbours are retired.

Measured:

- **Duplicate groups.** Components exported from two files under one name (`ProductCard` in two folders); names that match after stripping `Primary`, `Base`, `Custom`, `New`, `Old`, `V2`, `Copy`, `Wrapper` and the like, and mapping `Btn` to `Button`, `Modal` to `Dialog`, `TextField` and `TextInput` to `Input`, where one side is in the component layer; and copy files (`slider copy.tsx`, `card-old.tsx`, `button (1).tsx`). A group is **resolved** when one member carries `@deprecated` (a copy file must carry it itself). Next.js route files are skipped.
- **Import consistency.** For each component module, the share of imports that use its canonical specifier: the most used non-relative one (`@/components/ui/button`), else the most used.
- **Raw element bypass.** In feature code, raw `<button>`, `<input>`, `<select>`, `<textarea>` and `<dialog>` where the layer has the matching component, as a share of all such uses.

| Level | Conditions |
|---|---|
| 3 | 0 unresolved duplicate groups, import consistency 95% or more, bypass 10% or less |
| 2 | 2 or fewer unresolved groups, consistency 85% or more, bypass 25% or less |
| 1 | A component layer exists |
| 0 | No component layer |

## 2. Tokens in code

An agent copies what it sees. If the code around it holds `#F0EEED` and `text-gray-600`, so will its output.

Measured: every styling value in UI files, sorted into color, spacing, radius and type, and classed as project token, framework palette (color only) or hard-coded. Classes the scan cannot place (a plugin's utilities) are listed as unclassified and left out of every share. For each category, the **off-token share** is `(hard-coded + palette) / all`. The criterion uses the **mean of the category shares**, so a thousand spacing classes cannot hide off-token colors. The report also gives the plain hard-coded share across all values.

| Level | Conditions |
|---|---|
| 3 | Mean off-token share 5% or less, and 4 or more project color tokens |
| 2 | Mean 15% or less, and 4 or more project color tokens |
| 1 | Mean 40% or less, or 4 or more project color tokens |
| 0 | Neither |

## 3. Typed variants

When the only way to get a pill button is `className="rounded-full bg-black"`, an agent invents a new pill every time.

Measured:

- **Variant API.** Component files using `cva`, `tv` or `VariantProps`, or declaring a variant-like prop (`variant`, `size`, `color`, `tone`, `intent`, `kind`, `appearance`, `shape`, `emphasis`, `density`, `status`) as a string literal union or a named type. A library layer counts as typed.
- **Untyped variant props.** The same prop names typed as `string` or `any`.
- **Override share.** In feature code, the share of component call sites whose `className` sets color, radius, type or padding, or whose `style` or `sx` sets those. Margins and layout classes (`mt-4`, `w-full`, `flex`) are placement and do not count.

| Level | Conditions |
|---|---|
| 3 | 0 untyped variant props, a variant API exists, override share 10% or less |
| 2 | 1 or fewer untyped props, a variant API exists, override share 25% or less |
| 1 | A component layer exists (also the cap when it has no call sites) |
| 0 | No component layer |

## 4. Documented for agents

One point each, so the score is 0 to 3.

- **Rules file.** One of `DESIGN.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, `.windsurfrules`, `.github/copilot-instructions.md`, `.claude/rules/*`, `.claude/skills/*`, `docs/*design*.md`, or a Markdown file in the component layer, which together name **at least half of the components** (by word) and **at least half of the color tokens, up to 10**, written in code spans (`` `bg-primary` ``, `` `--primary` ``). Prose about "our primary color" does not count; a token name the agent can paste does.
- **JSDoc.** 50% or more of the layer's exported components and their declared props have a `/** */` comment directly above them. A library layer with call sites counts as vendor-documented.
- **Examples.** Story, `*.example.tsx`, `*.examples.tsx` or `*.demo.tsx` files import 50% or more of the layer's component files. A library layer with call sites counts as covered.

**Skill files.** A file inside an agent skill folder (`.claude/skills/`, `.cursor/skills/`, `.github/skills/`) is usually a third-party skill installed into the repo that talks about tokens in general. It counts as a rules file only when it names at least one of the repo's own components (by word) or color tokens (in a code span), as the scan found them. A skill folder whose `SKILL.md` contains `Modeinspect design engineer skills` (this pack) never counts. The report lists every skill file left out, with the reason.

## 5. Matches the design file

Names that match let an agent move from a Figma frame to the right component and token without guessing.

Checked only from evidence, never guessed:

- **Code Connect.** `*.figma.tsx` files or `figma.config.json`. The share of component files a Code Connect file imports.
- **Figma names.** When the agent can read the Figma file (an MCP server or an export), it writes `{"components": [...], "tokens": [...]}` with the published component and variable names and passes it with `--figma`. Names are compared case-insensitively without separators, Figma variant suffixes (`Button/Primary`) are cut, and a leading `color/` is dropped. Shares: layer components with a Figma match, and project color tokens with a Figma variable match.

The criterion uses the lower of the available shares.

| Level | Conditions |
|---|---|
| 3 | 90% or more |
| 2 | 70% or more |
| 1 | 40% or more |
| 0 | Below 40% |
| not checked | No Code Connect files and no Figma names. Left out of the overall score, and the summary says so. |

## 6. Enforced

Docs drift. A rule that fails the build does not.

Measured from the lint config (ESLint, Stylelint, Biome, oxlint):

- **Raw-value rule.** `tailwindcss/no-arbitrary-value`, `tailwindcss/no-custom-classname`, `better-tailwindcss/no-unregistered-classes` or `no-restricted-classes`, Stylelint `color-no-hex`, `color-named`, `declaration-property-value-disallowed-list` or `declaration-strict-value`, or `no-restricted-syntax` with a selector that matches hex colors or arbitrary values.
- **Import rule.** `no-restricted-imports`, `@typescript-eslint/no-restricted-imports`, `import/no-restricted-paths`, or Biome `noRestrictedImports`.
- **Wired.** Lint runs in CI (`.github/workflows`, GitLab, CircleCI), a hook (Husky, lefthook, lint-staged), or the build (Next.js 15 and earlier run ESLint during `next build` unless `ignoreDuringBuilds` is set).

| Level | Conditions |
|---|---|
| 3 | Both rule kinds at `error`, and wired |
| 2 | Both rule kinds present, at any level other than `off` |
| 1 | One rule kind present |
| 0 | Neither |

## Report shape

```
| # | Criterion | Score | Evidence |
|---|---|---|---|
| 1 | Discoverable | 1/3 | 69 components in src/components/ui; 3 unresolved duplicate groups; ... |
...
Overall: 20/100, not ready.

<repo>: AI-ready design system score 20/100, not ready (rubric v1.0, 5 of 6 criteria checked). Discoverable 1/3, Tokens in code 1/3, Typed variants 1/3, Documented for agents 0/3, Matches the design file not checked, Enforced 0/3.
```

The last line is the shareable summary. It always carries the rubric version and the number of criteria checked, so two scores are only compared when both match.

## Known limits

- React-family repos only (`.tsx` and `.jsx`). Vue and Svelte files are not parsed in v1.
- Classes are read from string literals, so a class built at runtime (`` `bg-${color}-500` ``) is not seen.
- Component names are read from `export` statements. Components exported through a barrel only are attributed to the file that declares them.
- Prop JSDoc is counted for `interface *Props` and `type *Props = {}` blocks. Props typed inline in the function signature are not counted.
- Lint config is read with comments removed (`//` and `/* */`, and `#` in YAML), so a commented-out rule is not counted. Strings stay whole, so a URL in a string survives.
