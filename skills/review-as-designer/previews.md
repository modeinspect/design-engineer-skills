# Opening the preview and walking states

How to find a preview of the change's head, how to run it locally without touching the designer's checkout, and which states to walk once it is open.

## Deploy previews

Look in three places. Stop at the first that yields a URL for the head SHA.

**Deployments.** Vercel, Netlify and others report through GitHub Deployments, which carry the SHA they were built from:

```bash
gh api "repos/<owner>/<repo>/deployments?sha=<headRefOid>" --jq '.[] | {id, environment}'
gh api "repos/<owner>/<repo>/deployments/<id>/statuses" --jq '.[0] | {state, environment_url}'
```

A `state` other than `success` means the preview is still building or failed. Say which, and do not review a failed build.

**Bot comments.** Preview bots post a comment and edit it on every push. Read them from `gh pr view <n> --json comments` and look for the bot's preview link. A bot comment does not always name the SHA. If it does not, and no deployment matches the head SHA, check the comment's "updated" time against the last commit time and say the match is unconfirmed.

**Checks.** `gh pr checks <n>` lists each check with a link. A deploy check's link often goes to the provider's dashboard, not the preview itself. Use it to see whether the deploy passed, not as the preview URL.

**Stale previews.** If the newest preview was built from an older commit, say so and give the designer two options: wait for the deploy, or run the head locally.

**Protected previews.** Many teams put previews behind a login. If the browser tool lands on a provider login page, stop and tell the designer. They can open the preview in their own signed-in browser and share screenshots, or give you a bypass token their team already uses. Never try to get around the protection.

## Running the branch locally

Use this when there is no preview, the preview is stale, or the designer asks for it.

1. **Decide where to run.** If the current checkout is at the head SHA and `git status --porcelain` is empty, run in place. Otherwise add a worktree, so the designer's open files never change:

   ```bash
   git fetch origin "pull/<n>/head:refs/remotes/pr/<n>"   # for a pull request
   git worktree add --detach /tmp/review-<n> refs/remotes/pr/<n>
   ```

   For a local branch, pass the branch name instead of the pull request ref, and name the folder after the branch, such as `/tmp/review-cart-refresh`. Never use `gh pr checkout`, `git checkout`, `git switch` or `git stash` in the designer's checkout.

2. **Install.** Detect the package manager from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or `bun.lockb`, `package-lock.json`) and run its install in the worktree. A frozen or CI install (`npm ci`, `pnpm install --frozen-lockfile`) keeps the lockfile unchanged. With no committed lockfile, use the manager named in `package.json`'s `packageManager` field or the README, otherwise npm with `npm install --no-package-lock`, and say which you used.

3. **Env files.** A worktree has no gitignored files, so `.env.local` and similar are missing. If the app needs them, ask the designer before copying them from their checkout.

4. **Start.** Use the project's own dev script from `package.json`. Pick a port nothing is listening on, and check it first (`lsof -iTCP:3100 -sTCP:LISTEN` prints nothing when it is free). Pass it as `PORT=3100` for Next.js or `--port 3100` for Vite. A busy port makes the server fail, or worse, makes the browser load someone else's app. Wait for the ready line, then load the first route and confirm it returns the page, not an error overlay.

5. **Fail loudly.** If install or start fails, stop and quote the failing command and the last lines of its output. Common causes are a missing env var, a backend or database that is not running, and a Node version mismatch (check `.nvmrc`, `.node-version` and `engines`). Name the cause if the output shows it. Do not patch the engineer's code to make it start.

6. **The base, when you need it.** For a before and after, use production if the designer gives you its URL. Otherwise add a second worktree at the base (`git worktree add --detach /tmp/review-<n>-base <base-sha>`) and run it on another port.

Out of scope: native mobile apps, and stacks the agent cannot run in a browser. Say so plainly and offer to review from the designer's own screenshots instead.

## Capturing a state

Record four facts with every capture: route, state, viewport width and pixel ratio. A capture without them cannot be cited.

With Playwright, the core moves are:

```ts
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(`${baseUrl}/settings`);

// keyboard focus, so :focus-visible styles apply
await page.keyboard.press("Tab"); // repeat until the target is focused
await expect(page.getByRole("button", { name: "Save" })).toBeFocused();

// hover
await page.getByRole("button", { name: "Save" }).hover();

// measure in CSS pixels, not screenshot pixels
const gap = await page.locator(".card-list").evaluate((el) => getComputedStyle(el).rowGap);

await page.screenshot({ path: "/tmp/review-<n>-shots/settings-save-focus-375.png" });
```

Name each file `<surface>-<state>-<width>[-base].png` so the drafts can point at it. Keep the screenshots in one folder outside every worktree, such as `/tmp/review-<n>-shots/`, so cleanup does not delete them.

If Playwright is not installed in the project, do not add it to the engineer's `package.json`. Use a copy installed outside the repo, or the agent's own browser tool. If neither exists, hand the designer the steps and ask for their screenshots.

## States to walk

Walk the states the change could affect, not every state the product has. Mark each one walked, not reachable (with the reason), or not applicable.

| Group | States | How to reach them |
| --- | --- | --- |
| Interaction | default, hover, keyboard focus, active or pressed, disabled, selected | Pointer hover, Tab for focus, the control's own disabled condition |
| Data | loading, empty, error, success, partial | Throttle the network, use an empty account or filter, block the request, ask the designer for a seed step |
| Content | one item, many items, a long name or label, a missing image, a large number | Real data first. Otherwise ask before editing anything in the browser |
| Layout | 375px, the main desktop width, any breakpoint the diff names | Viewport size. Check for horizontal scroll at 375px |
| Theme | light, dark, high contrast if supported | The product's own theme toggle or class |

Two traps:

- **Focus by click.** Clicking a button does not trigger `:focus-visible` in most browsers. Reach focus with the keyboard, or the missing focus ring goes unseen.
- **Breakpoints.** A change behind `md:` or `lg:` does not show at a width below that breakpoint. Read the diff for the breakpoint prefixes it uses and walk one width on each side.
