# Heal mode

Heal fixes what the check found, one commit per criterion, on its own branch. Every edit is small enough to review in one sitting. Anything that changes how the UI looks is proposed, not applied.

## Before the first edit

1. Run check mode and keep its table. It is the "before" column of the report.
2. Confirm the working tree is clean (`git status --porcelain` prints nothing). If it is not, stop and say which files are dirty. Never stash the user's work.
3. Find the default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, else `main`, else `master`. Cut `ai-ready-design-system` from it (add a numeric suffix if the name exists). Never commit on the default branch.
4. Find the repo's verify commands from `package.json` and the lockfile's package manager: a typecheck (`tsc --noEmit` when `typescript` is installed and no `typecheck` script exists) and the build. Run both once now. If the build already fails, record the error as the baseline, keep going, and verify each commit with the typecheck plus "the build fails the same way as before".

## Commit order

Work in criterion order: 1, 2, 3, 4, 6. Skip a criterion that already scores 3. Criterion 5 never produces a commit. After each commit, run the verify commands. If a commit breaks them, fix it inside the same commit (`git commit --amend` before moving on) or drop it and report why.

Commit messages describe the change to the codebase, never this skill:

```
design-system: mark duplicate components deprecated, use canonical imports

- Slider: `slider copy.tsx` is an unused copy of `slider.tsx`; marked @deprecated
- Button, Rating: 4 relative imports now use @/components/ui/<name>
```

## 1. Discoverable

- **Duplicates.** For each unresolved group, pick the canonical member: the one in the component layer, else the one with the most importers (count them with a search). Add `@deprecated Use <Name> from "<canonical import>".` in a JSDoc block above every other member. Never delete, rename or move a component in heal; the deprecation and the lint rule make the next step safe for a person to take. Two components that share a name but do different jobs (two page-specific `Header`s) are not duplicates: leave them, and list them as "rename for clarity" in the report.
- **Import paths.** Rewrite non-canonical specifiers to the canonical one when both resolve to the same file. This changes no behavior; the typecheck proves it.
- **Raw elements.** Do not swap `<button>` for `<Button>` in heal. The component may render differently. List each with its location as a follow-up.

## 2. Tokens in code

1. Run `node <skill>/scripts/propose-tokens.mjs <repo> [--ds <dir>]`. It never edits. It maps every hard-coded and palette value to the nearest project token by role first (text, background, border), then by value: colors by delta E OK, lengths by pixels.
2. Show the user the table grouped by verdict: `exact` (same value, swap is invisible), `within tolerance` (delta E OK 2 or less, 2px or less), `gap` (no token is close), `manual`.
3. Apply only the rows the user approves in this session. With no answer, or in a non-interactive run, apply none: the table goes into the report and the PR description, and this criterion gets no commit.
4. An approved swap keeps the variant prefix and opacity (`hover:bg-[#F0F0F0]/50` becomes `hover:bg-secondary/50`). A gap is never closed by inventing a token. List it for the design system owner.

If `token-mapping` is installed, offer it for a deeper purpose-first audit before step 3.

## 3. Typed variants

- **Untyped props.** Narrow `variant: string` to the union of values the component handles and its call sites pass. Find both with a search. The typecheck must pass.
- **Repeated overrides.** When three or more call sites restyle the same component with the same visual classes (`<Button className="rounded-full bg-black">`), propose a named variant with those classes and list the call sites. Add it only when the user approves, and then migrate those call sites in the same commit.
- Never remove `className` from a component's props. Placement classes (`mt-4`, `w-full`) are legitimate.

## 4. Documented for agents

- **Rules file.** Write the guide into the file agents in this repo already load: `AGENTS.md`, else `CLAUDE.md`, else a `.cursor/rules` file, else create `AGENTS.md` at the root. Add one `## Design system` section; never rewrite the rest of the file. If `create-design-md` is installed and the user wants a `DESIGN.md` for the visual language, run it separately. Its schema is for tokens and brand, not a component inventory.
- **JSDoc.** One sentence above each exported component in the layer saying what it renders and when to reach for it, and one line above each declared prop. Take every statement from the code: the variants the `cva` call defines, the element it renders, the primitive it wraps. Never describe behavior the code does not have.
- **Examples.** Do not add Storybook to a repo that has none. Put one short usage snippet per core component in the rules file instead, copied from a real call site, and list missing stories as a follow-up.

Section template, filled from the scan and the code:

````md
## Design system

Build UI from these components and tokens. Do not write raw values.

### Components

Import from `@/components/ui/<file>`. Change a component's look with its props, never with `className`.

| Need | Component | Import | Props |
|---|---|---|---|
| Action | `Button` | `@/components/ui/button` | `variant`: default, destructive, outline, secondary, ghost, link. `size`: default, sm, lg, icon |
| Choose one of many | `Select` | `@/components/ui/select` | |

Deprecated: `Slider` in `slider copy.tsx`. Use `Slider` from `@/components/ui/slider`.

### Tokens

| Role | Class | Variable |
|---|---|---|
| Page background | `bg-background` | `--background` |
| Body text | `text-foreground` | `--foreground` |
| Secondary text | `text-muted-foreground` | `--muted-foreground` |
| Borders | `border-border` | `--border` |
| Radius | `rounded-lg`, `rounded-md`, `rounded-sm` | `--radius` |

Spacing and type use the Tailwind scale (`p-4`, `gap-6`, `text-sm`).

### Never

- Hex, `rgb()` or `hsl()` colors, or arbitrary values such as `p-[13px]` or `bg-[#F0F0F0]`.
- Tailwind palette colors such as `text-gray-600` or `bg-black`. Use the role tokens above.
- A raw `<button>`, `<input>` or `<select>` where a component exists.

### Example

```tsx
import { Button } from "@/components/ui/button";

<Button variant="outline" size="sm">Add to cart</Button>
```
````

Only list a role in the token table when the token's name or its use in the components says what it is for. When it does not, list the token without a role and say so in the report.

## 6. Enforced

Add two rules, scoped to feature code (the component layer may define the values):

1. **Raw values:** hex colors, arbitrary color and length classes, and, when the project has 4 or more color tokens, framework palette colors.
2. **Imports:** deprecated modules, non-canonical paths into the layer, and the unstyled primitives the layer wraps (`@radix-ui/*` when `components/ui` wraps Radix).

Rule level: `error` when the codebase has zero violations of that rule after commits 1 to 4, else `warn`, with the violation count in the commit body and the report. A `warn` rule does not block, so the criterion stays at 2 until someone fixes the rest and flips it.

When the repo already has a linter, add the rules to its existing config, in its format. When it has none, add ESLint with only these rules and the parser they need. Do not add a framework preset such as `next/core-web-vitals` in the same commit: it brings its own rules, existing code can fail them, and the build then breaks for reasons unrelated to the design system. Offer it as a follow-up. Install with the repo's package manager.

Prove each rule fires: write one file with a violation inside a linted folder, run the linter on it, see the rule named in the output, delete the file. Never commit it. If a rule does not fire, fix the selector before committing.

Legacy config (`.eslintrc.json`, ESLint 8), dependency-free apart from the parser. Adjust the globs and paths to the repo:

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module", "ecmaFeatures": { "jsx": true } },
  "overrides": [
    {
      "files": ["src/**/*.tsx", "src/**/*.jsx"],
      "excludedFiles": ["src/components/ui/**"],
      "rules": {
        "no-restricted-syntax": ["warn",
          { "selector": "Literal[value=/(^|\\s|:)-?[a-z]+(-[a-z]+)*-\\[(#|rgba?\\(|hsla?\\(|-?\\d*\\.?\\d+(px|rem|em))/]", "message": "Arbitrary color or length. Use a token (AGENTS.md, Design system)." },
          { "selector": "TemplateElement[value.raw=/(^|\\s|:)-?[a-z]+(-[a-z]+)*-\\[(#|rgba?\\(|hsla?\\(|-?\\d*\\.?\\d+(px|rem|em))/]", "message": "Arbitrary color or length. Use a token (AGENTS.md, Design system)." },
          { "selector": "Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]", "message": "Raw hex color. Use a color token (AGENTS.md, Design system)." },
          { "selector": "Literal[value=/(^|\\s|:)(text|bg|border|ring|fill|stroke)-(black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\\d+)?(\\u002F\\d+)?(\\s|$)/]", "message": "Palette color. Use a role token (AGENTS.md, Design system)." }
        ],
        "no-restricted-imports": ["error", {
          "patterns": [
            { "group": ["@radix-ui/*"], "message": "Import the wrapper from @/components/ui." },
            { "group": ["**/ui/*", "!@/components/ui/*"], "message": "Import UI components from @/components/ui/<file>." }
          ]
        }]
      }
    }
  ]
}
```

In a flat config (`eslint.config.js`, ESLint 9), add the same `rules` in an object with `files` and `ignores`. esquery regexes cannot contain a literal `/`; write it as the escape `\u002F`, which the JSON above spells `\\u002F`. For CSS, Stylelint's `color-no-hex` and `declaration-property-value-disallowed-list` cover the same ground.

Wiring: if lint runs nowhere (no CI step, hook or build step), do not add a CI workflow. Name the missing step in the report.

## After the last commit

1. Re-run check mode on the branch. Report before and after per criterion.
2. Show `git log --oneline <default>..HEAD` and `git diff --stat <default>..HEAD`.
3. Write the PR description: what each commit changes, the verify commands with their results, the token proposal table (or a pointer to it), and the follow-ups heal did not take (raw elements, gaps, missing stories, renames).
4. Stop. Do not push. Give the user the command to push and open the PR themselves.
