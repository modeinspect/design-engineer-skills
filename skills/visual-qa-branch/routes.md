# From a diff to routes

List the changed files first, including uncommitted ones:

```bash
git diff --name-only "$BASE"...HEAD
git diff --name-only HEAD
git ls-files --others --exclude-standard
```

Then sort every file into one of the five cases below, in order. The result is the route table for the report.

## 1. The file is a route

### Next.js, app router

The app root is `app/` or `src/app/`. A route is a folder that contains `page.tsx` (or `.jsx`, `.ts`, `.js`, `.mdx`). Build the URL from the folder path:

| Folder | URL rule |
| --- | --- |
| `(marketing)/pricing/page.tsx` | Route groups in parentheses drop out: `/pricing` |
| `@modal/...` | Parallel route slots drop out; the slot renders inside its parent's page |
| `_components/...` | Private folders are never routes |
| `(.)photo/[id]` | Intercepting routes render as an overlay only after in-app navigation. Capture the full page at the plain URL and note that the overlay was not captured |
| `[id]`, `[...slug]`, `[[...slug]]` | Dynamic. Needs a real value, see **Dynamic segments** |

Files that are not `page` affect every page beneath them:

- `layout.tsx` and `template.tsx`: every page in that folder and below. Treat as **5. Global** when it is the root layout.
- `loading.tsx`: the loading state of pages below. A capture after load never shows it; list it under "Could not check" unless the user wants it slowed down by hand.
- `error.tsx`, `not-found.tsx`, `global-error.tsx`: visit a URL that triggers them, such as a path that does not exist for `not-found`.
- `route.ts`, `opengraph-image.tsx`, `icon.tsx`, `sitemap.ts`, `robots.ts`: not pages. Skip them and list them.
- `middleware.ts` can redirect or rewrite any route. Read its `matcher` and note which routes it touches.

### Next.js, pages router

The root is `pages/` or `src/pages/`. `index.tsx` is `/`, `about.tsx` is `/about`, `blog/[slug].tsx` is dynamic. `_app.tsx` and `_document.tsx` are **5. Global**. `pages/api/**` is never UI. `404.tsx` and `500.tsx` are reached by visiting a missing path or, for 500, are listed under "Could not check".

A repo can use both routers at once; check for both roots.

### React Router in a Vite app

Find where routes are declared before mapping anything:

```bash
grep -rnE "createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes|<Routes|<Route |flatRoutes|from \"@react-router/dev/routes\"" src app --include=*.{js,jsx,ts,tsx}
```

- **Data or declarative routers** (`createBrowserRouter([...])`, `<Route path element>`): read the tree and join nested `path` values. An `index` route is its parent's path. A changed file is a route when a route's `element`, `Component` or `lazy` import points at it.
- **Framework mode** (`app/routes.ts`): read the `route("path", "file")`, `index("file")`, `layout("file", [...])` and `prefix("path", [...])` calls. `layout` adds no URL segment.
- **File routes** (`flatRoutes()` over `app/routes/`): dots become slashes (`settings.profile.tsx` is `/settings/profile`), `_index` is the index, `$id` is dynamic, a leading `_` is a pathless layout, a trailing `_` opts out of the parent layout, `($lang)` is optional.
- `createHashRouter` puts the path after `#/`, so the URL is `http://localhost:5173/#/settings`.
- **No router at all**: the app has one route, `/`. Views behind tabs or buttons are states; reach them with a `click` state ([capture-plan.md](capture-plan.md)).

### Other routers

TanStack Router keeps its tree in `routeTree.gen.ts`; read it the same way. For anything else, ask the user for the URLs and say the mapping was manual.

## 2. The file is a component one route uses

Walk importers up until you reach a route file. Resolve the repo's path aliases from `tsconfig.json` or `jsconfig.json` `paths` (`@/components/Card` is `src/components/Card`) and follow barrel files (`index.ts` that re-export).

```bash
grep -rlE "from ['\"](@/|\.{1,2}/)[^'\"]*components/Card['\"]" src app
```

Stop after three hops. If no route is reached by then, treat the file as shared (case 3).

## 3. The file is shared

A file is shared when it is imported from three or more places, or sits in a shared folder such as `components/ui/`, `design-system/`, `packages/ui/`. One line here reaches routes the user was not thinking about. Those are where unintended findings come from.

If `component-impact` is installed, tell the user to run `/component-impact` on the file for the full list of usages; it runs only when the user starts it. For this run, pick up to three routes, in this order:

1. The route the branch was made for (from the branch name, commit messages or the user).
2. The route where the component sits in the most different context: a different parent layout, a narrow column, a dense table, a dialog.
3. The route that renders the most instances of it.

Say in the report how many consumers you found and how many you did not capture.

## 4. The file never renders

Tests, stories, type-only files, server-only code, API handlers, docs, lockfiles and CI config. List them as skipped with the reason. When the branch changes only a Storybook story, there is no route to capture; say so.

## 5. The file is global

Design tokens, global CSS, the Tailwind config or theme file, the theme provider, fonts, the root layout, `_app`. These reach every route. Sample up to four:

1. The route the branch was made for.
2. The home or entry route.
3. The densest route: a table, a long form or a dashboard.
4. A route with the most distinct components.

State that the routes are a sample.

## Dynamic segments

A dynamic route needs a value that renders a real page on both sides. In order of preference:

1. Follow a link from the list page on the running app (the first row's link).
2. A value from the repo's seed data, fixtures or `generateStaticParams`.
3. Ask the user.

Never invent an id. A 404 on one side makes the whole comparison meaningless. Against production, ask for a value that exists in production and locally, or accept that the whole page will be a content difference and say so.

## Routes behind a login or a flag

Ask the user for a saved browser session (a Playwright storage state file, one per side) and pass it in the plan. Never type credentials and never change a flag in production. Without a session, list the route under "Could not check".

## The cap

Six routes per run by default. When the mapping finds more, check the six that cover the most changed files and list the rest by name, then ask whether to run another batch.
