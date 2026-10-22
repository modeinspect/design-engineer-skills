# Finding usages

How to turn one component, variant or token into a complete list of the places
in source that use it. Each section names a pattern that a plain name search
misses, and the search that catches it.

Run every search on the working tree. Then run the component searches once
more at `$BASE` (`git grep -n <pattern> $BASE src`) to catch usages the change
itself deleted or moved.

## Search tools

- `git grep` respects `.gitignore` and skips `node_modules` and build output.
  Its `-E` mode has no `\b`, so a word boundary written that way silently
  matches nothing. Use `-P` where git was built with PCRE, or spell the
  boundary out: `([^a-zA-Z0-9_-]|$)`.
- `rg` (ripgrep) supports `\b` and respects `.gitignore`. Prefer it when it is
  installed.
- Pass `-e` before a pattern that starts with a dash, such as `--color-primary`,
  or the tool parses it as an option.
- A TypeScript language server's "find references" resolves aliases,
  re-exports and renamed imports for you. Use it when the agent has one, and
  union its result with the text searches below: it does not see class names,
  CSS variables or string-built names.

Exclude the target's own file, tests, snapshots and generated output from the
usage list. Keep stories (`*.stories.*`) out of the usage count but note them:
they are places that already render the target in isolation.

## Components

### Every specifier that resolves to the module

A component is imported by path, not by name. Before searching, read the path
aliases in `tsconfig.json` or `jsconfig.json` (`compilerOptions.paths`) and the
bundler config (`resolve.alias` in Vite, `webpack.resolve.alias`). Then search
for every form the path can take:

| Form | Example for `src/components/ui/button.tsx` |
| --- | --- |
| Alias | `@/components/ui/button` |
| Relative from a sibling or parent | `./button`, `../ui/button`, `../../components/ui/button` |
| With an index or extension | `@/components/ui/button/index`, `./button.tsx` |
| Through a barrel | `@/components/ui` |

The reliable query is the file's basename at the end of an import specifier,
then filtered by resolving each hit:

```bash
rg -n "from ['\"][^'\"]*/button(/index)?(\.tsx?)?['\"]" src
rg -n "import\(['\"][^'\"]*/button['\"]\)" src   # dynamic imports, next/dynamic, React.lazy
```

Relative imports are the ones agents miss most: an alias search finds most
importers and quietly skips the files next door.

### Barrels and re-exports

A file that re-exports the target is a new module to search, and so is any
barrel that re-exports that barrel. Repeat until a pass finds no new barrel.

```bash
rg -n "export \* from ['\"][^'\"]*/button['\"]" src
rg -n "export \{[^}]*\bButton\b[^}]*\} from" src
```

### Local names

The name in the importing file can differ from the export:

- Renamed: `import { Button as BaseButton } from ...`. Search the file for the
  local name.
- Default export under any name: `import Btn from "./button"`.
- Namespace: `import * as UI from "@/components/ui"`, used as `<UI.Button>`.
- A second export that carries the styles without the component, such as
  `buttonVariants` from a `cva` file applied to an `<a>` or a router link. Each
  call is a usage of the variant it passes.

### Wrappers

A component that renders the target and is exported is a wrapper, and every
render of the wrapper is a usage one hop further out. Search for the wrapper's
importers with the same patterns, and record for each usage:

- the hop: direct, or through `IconButton`, through `CarouselNext`, and so on;
- the props the wrapper passes down. A wrapper that pins `size="icon"` or
  `variant="ghost"` decides which variant all of its consumers get, and one
  that forwards `className` lets each consumer override.

Stop expanding at the first wrapper whose output no longer includes the changed
property (it overrides it unconditionally), and say so in the inventory.

### `asChild` and polymorphic props

`<Button asChild><Link /></Button>` renders the child with the target's
classes. `as="a"` or `component={Link}` does the same in other libraries. They
are usages and they are often the ones whose layout differs, because the child
is an inline element.

## Variants and sizes

For a change to one entry in a `cva` config, or any variant map:

- A render with no `variant` prop gets the default from `defaultVariants`.
  Changing the default variant reaches every bare `<Button>`, which a search
  for `variant="default"` never finds.
- A change to the base classes (the first argument to `cva`) reaches every
  variant and size.
- `compoundVariants` apply only to the combination they name. List the
  combinations the change touches.
- Dynamic values such as `variant={isActive ? "default" : "ghost"}` count once
  for each value they can take. Mark them dynamic.
- Overrides win. A `className` merged through `cn` or `tailwind-merge` replaces
  the same property from the variant, so a usage with `className="rounded-full"`
  does not change when the variant's radius does. Group those usages as one
  kind and still render one to prove it.

## Tokens

A token is consumed by name in several syntaxes, and the component that uses
it never imports it. Search for each form below that the project uses.

### CSS custom properties

```bash
rg -n -e "var\(--color-primary\b" src styles
rg -n -e "--color-primary\s*:" src styles   # definitions, including theme blocks
```

Check every block that redefines it: `:root`, `.dark`, `[data-theme=...]`,
`@media (prefers-color-scheme: dark)`. Each is a separate value with its own
set of places, so a change to the dark value needs dark captures.

Follow aliases. `--ring: var(--color-primary)` makes every `--ring` consumer a
usage too. Repeat until no new alias appears.

### Tailwind v3: config keys

`tailwind.config.*` maps a key to the variable: `colors.primary` to
`hsl(var(--primary))`, `borderRadius.lg` to `var(--radius)`. Components use
the key, not the variable, through every utility that accepts it:

| Theme section | Utilities to search |
| --- | --- |
| `colors` | `bg-`, `text-`, `border-`, `ring-`, `ring-offset-`, `outline-`, `divide-`, `fill-`, `stroke-`, `from-`, `via-`, `to-`, `placeholder-`, `caret-`, `accent-`, `decoration-`, `shadow-` |
| `borderRadius` | `rounded-`, `rounded-t-`, `rounded-r-`, `rounded-b-`, `rounded-l-`, `rounded-tl-` and the other corners, `rounded-s-`, `rounded-e-` |
| `spacing` | `p-`, `px-`, `m-`, `gap-`, `space-x-`, `w-`, `h-`, `size-`, `inset-`, `top-` and the rest |
| `fontSize`, `fontFamily` | `text-`, `font-` |

Match the full class, including variant prefixes and opacity modifiers, and
exclude longer keys that share the prefix:

```bash
# bg-primary, hover:bg-primary/90, md:text-primary; not bg-primary-foreground
rg -n "(^|[\s\"'\`:])(bg|text|border|ring|outline|fill|stroke|from|via|to)-primary(/\d+)?([\s\"'\`]|$)" src
```

Also search `theme('colors.primary')` in CSS and `@apply` lines.

### Tailwind v4: `@theme`

Variables declared in `@theme { --color-primary: ...; }` generate utilities
named after the variable minus its namespace: `--color-primary` gives
`bg-primary`, `text-primary` and the rest; `--radius-lg` gives `rounded-lg`;
`--spacing` scales every spacing utility. Search the utilities as above and
`var(--color-primary)` for direct uses.

### JavaScript theme objects

- MUI: `theme.palette.primary.main` in `sx` and `styled`, the shorthand
  `sx={{ color: "primary.main" }}`, and the `color="primary"` prop on every
  MUI component that accepts it. Component-level `styleOverrides` in
  `createTheme` are usages too.
- styled-components and Emotion: `props.theme.colors.primary`,
  `${({ theme }) => theme.colors.primary}`.
- Sass and Less variables: `$color-primary`, `@color-primary`, plus every
  partial that `@use`s or `@import`s the file that defines it.

## What cannot be resolved

List these as unresolved in the inventory with file and line. Never drop them
and never count them as covered.

- Class names built from strings: `` `bg-${tone}` ``, `cn(variants[tone])`.
- Content from a CMS, MDX or a database that names a component or class.
- Components picked by a computed key from a registry object.
- Usages in other repositories or packages that consume this one as a library.
  Say that the search covered this repository only.
