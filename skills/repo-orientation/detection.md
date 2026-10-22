# Detection

Signals and precedence for step 2 of [SKILL.md](SKILL.md). Read files first; run commands only to confirm. Record each answer with the file that settled it, because the orientation note cites it.

## 1. Workspace layout

A repo is a monorepo when any of these exist at the root:

- `pnpm-workspace.yaml`
- `workspaces` in the root `package.json` (npm, Yarn, Bun)
- `turbo.json`, `nx.json`, `lerna.json`, `rush.json`

List the members from the workspace globs (`apps/*`, `packages/*`). Then pick the app:

1. The app the user named.
2. The app the root `dev` script starts, when it starts exactly one.
3. Otherwise, list the apps that have a `dev` script and a framework dependency, and ask. Do not start them all.

In a monorepo:

- Install at the workspace root, never inside the app. An install inside a member creates a second `node_modules` tree and often a stray lockfile.
- Run the app with the workspace filter (`pnpm --filter <name> dev`, `npm run dev --workspace <name>`, `yarn workspace <name> dev`, `turbo run dev --filter <name>`) or from the app's folder.
- Note internal packages the app imports (`"@acme/ui": "workspace:*"`). Some ship source; some must be built first and fail with "Cannot find module" or a missing declaration file until they are. Check the package's `main` or `exports`: a path into `dist/` means it needs a build.
- pnpm `catalog:` versions resolve from `pnpm-workspace.yaml`. Read the real version there, not in the app's `package.json`.

A repo with an unrelated second `package.json` (a docs site, a scripts folder) and no workspace config is not a monorepo. The shallowest `package.json` with a framework dependency is the app.

## 2. Package manager

Precedence:

1. `packageManager` in the root `package.json` (`"pnpm@9.12.0"`). It also pins the version, which Corepack enforces.
2. The lockfile at the workspace root:

| Lockfile | Manager |
|---|---|
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` with a `__metadata` block | Yarn 2+ (check `.yarnrc.yml` for `nodeLinker`) |
| `yarn.lock` without it | Yarn 1 |
| `bun.lock` or `bun.lockb` | Bun |
| `package-lock.json` or `npm-shrinkwrap.json` | npm |

3. The command the README documents.
4. None of the above: npm, stated as an assumption in the note.

Which binaries are installed on the machine is not a signal.

**Two lockfiles.** Trust the one matching `packageManager`. Without that field, trust the lockfile changed most recently in git (`git log -1 --format=%cr -- <file>`), and report the other as drift for an engineer. Never delete either.

**Version mismatch.** When `packageManager` pins a version and the installed binary differs, Corepack can provide the pinned one (`corepack enable`, then the manager command). That changes global shims, so ask first. Yarn 2+ repos often commit the Yarn binary under `.yarn/releases/` and select it in `.yarnrc.yml`; then `yarn` works with any global Yarn.

**Yarn Plug'n'Play.** `.pnp.cjs` and no `node_modules` after install is normal for PnP, not a failed install.

## 3. Node version

Precedence: `.nvmrc`, `.node-version`, `.tool-versions` (`nodejs` line), `volta.node` in `package.json`, then `engines.node`. In a monorepo check the app folder first, then the root.

- An exact pin is the version the team tested. If the active Node (`node -v`) differs and a version manager is installed (`nvm`, `fnm`, `volta`, `mise`, `asdf`), propose switching with it and ask before installing a new version.
- A range in `engines` only needs the active Node to satisfy it.
- An alias such as `lts/*` means current LTS.
- With no version manager and a mismatch, say so, try the active version, and if install or start fails, put the mismatch first in the diagnosis.
- With no pin at all, use the active version and write "assumed". The real floor is the framework's own `engines.node`: read it from the framework's entry in the lockfile, or from `node_modules/<framework>/package.json` after install. Report it ("Vite 7 needs Node 20.19 or newer"), because a teammate on an older Node will hit it.

- A pin below the framework's own floor (an `.nvmrc` of `18` with Vite 7, which needs 20.19) cannot run the app. Do not propose switching to it: report the pin as drift for an engineer and stay on a version that meets the floor.

Never edit `.nvmrc`, `engines` or `.npmrc` to make a version fit.

## 4. Framework and dev command

| Signal | Framework |
|---|---|
| `next` dependency, `next.config.*` | Next.js. `app/` or `src/app/` is the App Router; `pages/` or `src/pages/` is the Pages Router; both can coexist |
| `vite` dependency, `vite.config.*` | Vite (check for `@vitejs/plugin-react`) |
| `@remix-run/*`, or `@react-router/dev` with `react-router.config.*` | Remix or React Router framework mode |
| `react-scripts` | Create React App |
| `astro`, `@sveltejs/kit`, `nuxt`, `@angular/core`, `expo`, `react-native` | Out of the main scope; say so |

Dev command precedence: the documented command, then the `dev` script, then `start`, then `serve`. Skip scripts that build or deploy (`build`, `export`, `vite build`). When `dev` chains several processes (`concurrently`, `turbo run dev`, `run-p`), note each one; a chained backend or codegen watcher may be what fails.

Note `predev`, `postinstall` and `prepare` scripts: they run code generation (`prisma generate`, GraphQL codegen, token builds) or git hooks (`husky`, `lefthook`) and are a common first failure.

## 5. Styling

| Signal | System |
|---|---|
| `@import "tailwindcss"` and a `@theme` block in a CSS file | Tailwind v4, tokens in CSS |
| `tailwind.config.{js,ts,cjs,mjs}` with `theme` or `theme.extend` | Tailwind v3, tokens in the config, often pointing at CSS variables |
| `:root { --... }` in `globals.css`, `index.css` or `app.css` | CSS variables, often with a `.dark` or `[data-theme]` block |
| `*.module.css`, `*.module.scss` | CSS Modules |
| `sass` dependency, `_variables.scss`, `_tokens.scss` | Sass variables |
| `styled-components`, `@emotion/*`, `@vanilla-extract/*`, `@stitches/*` | CSS-in-JS, tokens in a theme object |

A `:root` block counts as tokens only when it defines custom properties (`--name: value`) that something reads. Starter templates ship `:root` blocks that only set fonts and colors, or define variables nothing uses.

Several can coexist (Tailwind plus CSS Modules, MUI plus Emotion). Report each and which one new code should use: the one the docs name, else the one most recent files use. When neither settles it (a starter wired for two systems, used by nothing yet), ask an engineer.

## 6. Component library

| Signal | Library |
|---|---|
| `components.json` | shadcn. `aliases.ui` gives the primitives folder; primitives use `cva` for variants and `cn()` from `lib/utils` |
| `@mui/material` | MUI. Look for a `createTheme` call and the `ThemeProvider` in the root layout |
| `@chakra-ui/react`, `@mantine/core`, `antd`, `@radix-ui/themes` | That library, themed in one provider |
| `@radix-ui/react-*`, `react-aria-components`, `@headlessui/react` | Unstyled primitives wrapped by the repo's own components |
| A workspace package such as `packages/ui` or `@acme/design-system` | In-house library; its folder is the component source |
| None | Components live in `src/components` or next to their routes |

## 7. Tokens

Find the governing source, then check whether it is generated:

- Tailwind v4: the `@theme` block, plus `:root` variables it references. `@theme inline` that maps to another system's variables (`var(--mui-palette-primary-main)`) is a bridge, not the source: the source is that system's theme file.
- Tailwind v3: `theme.extend` in the config, plus the CSS variables it maps to.
- shadcn: the CSS variables in the file named by `tailwind.css` in `components.json`.
- MUI and CSS-in-JS: the theme file passed to the provider (`theme.ts`, `createTheme(...)`). When that file overrides little, most values are library defaults: say so, and read the runtime values (MUI with `cssVariables` writes `--mui-*` on `:root`).
- Token pipelines: `tokens/*.json`, Style Dictionary (`style-dictionary.config.*`), Tokens Studio exports. The JSON is the source; the CSS or TS it writes is generated.

A file is generated when it has a "do not edit" or "auto-generated" header, sits in `generated/`, `__generated__/`, `dist/` or `build/`, is gitignored, or is written by a script in `package.json`. Edits to generated files are lost on the next build; point the designer at the source.

**Check the tokens are used.** Count token use against raw values: hex, `rgb()` and `rgba()`, Tailwind arbitrary values (`bg-[#F0F0F0]`) and Tailwind's built-in palette (`text-black/60`, `bg-gray-100`). Many of these next to an untouched token file means the real palette lives in the components. Report the most repeated raw values with counts and how many files each appears in. With no tokens at all, that list is the palette. Values copied into a bridge by hand (breakpoints typed into `@theme` instead of referenced) will drift from the source; name them.

## Where things live

Searches that answer the map questions. Use `rg` when available, else `grep -r`. Always pass a path (`.`) and redirect stdin from `/dev/null`: in an agent's shell, `rg` with no path reads stdin and never returns. `rg` skips gitignored files, so `node_modules` and build output stay out.

```bash
# Tokens: CSS custom properties, Tailwind v4 theme, JS theme objects
rg -l -e '^\s*--[a-zA-Z][\w-]*\s*:' -g '*.{css,scss}' . </dev/null
rg -l '@theme' -g '*.css' . </dev/null
rg -l 'createTheme|extendTheme|createSystem' . </dev/null
find . -maxdepth 3 -path ./node_modules -prune -o \( -name 'tailwind.config.*' -o -name 'tokens' \) -print

# Raw values that bypass tokens, most repeated first
rg -o -i '#[0-9a-f]{6}\b|#[0-9a-f]{3}\b' -g '*.{tsx,jsx,ts,js,css,scss}' . </dev/null | cut -d: -f2 | sort | uniq -c | sort -rn | head

rg -o '(text|bg|border)-(black|white|gray-[0-9]+|slate-[0-9]+)(/[0-9]+)?' -g '*.{tsx,jsx}' . </dev/null | cut -d: -f2 | sort | uniq -c | sort -rn | head

# Fonts
rg -l 'next/font|@font-face|font-family' . </dev/null

# Shared primitives and their reach (alias and relative imports)
ls src/components/ui components/ui packages/ui/src 2>/dev/null
rg -l "from ['\"][^'\"]*/button['\"]" . </dev/null | wc -l   # repeat per primitive, and per file you call safe

# Routes
rg --files -g '**/app/**/page.{tsx,jsx,js,mdx}' . </dev/null       # Next.js App Router
ls pages src/pages 2>/dev/null                                       # Pages Router
rg -n "createBrowserRouter|<Route |path: ['\"]/" . </dev/null        # React Router

# Isolated preview
ls .storybook 2>/dev/null; rg --files -g '*.stories.*' . </dev/null | head
```

For each primitive, the importer count goes in the note, so the designer sees that `Button` with 48 importers is a different change from `PromoBanner` with one. The import search matches by file name, so check a count that looks high for name collisions. Run counting loops in `bash`; nested quotes break inside a `zsh` command substitution.
