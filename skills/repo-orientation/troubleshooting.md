# Troubleshooting

For steps 3 and 4 of [SKILL.md](SKILL.md). Find the **first** error in the log, not the last line: a dev server that crashes because an install half-failed is an install problem. Match it below, then report the error verbatim, the cause and the fix.

The **Who** column says who can apply the fix:

- **Agent**: the agent may apply it. It touches no tracked file and nothing outside the repo.
- **User**: needs the user's OK, because it changes the machine.
- **Engineer**: needs a value, an access grant or a code change only the team can give.

## Install fails

| First error looks like | Likely cause | Fix | Who |
|---|---|---|---|
| `EBADENGINE`, `Unsupported engine`, `The engine "node" is incompatible`, a `preinstall` that exits on a version check | Active Node outside the repo's pin or range | Switch to the pinned version with the installed version manager | User |
| `ERR_PNPM_UNSUPPORTED_ENGINE`, `This project is configured to use yarn`, `Usage Error: This project's package.json defines "packageManager"` | Wrong package manager, or the wrong version of the right one | Use the manager from `packageManager`; enable Corepack for the pinned version | User |
| `npm ci` says the lockfile and `package.json` are out of sync; `ERR_PNPM_OUTDATED_LOCKFILE`; `YN0028: The lockfile would have been modified` | The committed lockfile does not match `package.json` | Do not regenerate it. Report that the lockfile is stale on this branch | Engineer |
| `E401`, `E403`, `401 Unauthorized`, `404 Not Found` for a scoped package (`@acme/...`), `.npmrc` with `${NPM_TOKEN}` or `_authToken` | Private registry (GitHub Packages, Artifactory, a private npm org) | Ask for a read token and where it goes (usually an env var the `.npmrc` reads). Never remove the dependency or edit `.npmrc` | Engineer |
| `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN` against an internal hostname | Registry or git host behind a VPN | Ask the user to connect to the VPN, then rerun | User |
| `fatal: not a git repository`, `husky - .git can't be found`, `lefthook` errors in `prepare` | Folder is not a git checkout (downloaded zip) or has no commits | Clone the repo with git instead of downloading it | User |
| `gyp ERR!`, `node-pre-gyp`, `sharp`, `canvas`, `better-sqlite3` build errors | Native dependency without a prebuilt binary for this Node or CPU | Usually fixed by the pinned Node version; otherwise the build tools named in the error | User |
| `prisma generate`, GraphQL codegen or a token build fails in `postinstall` | Codegen needs a schema file, an env var or a running service | Read the generator's own error; it usually names the missing var or file | Engineer, or Agent if it is an env var with a documented default |
| `Cannot find module` for a package used in code but missing from `package.json` | Undeclared dependency that worked by accident elsewhere | Report the package name. Adding it changes `package.json` and the lockfile | Engineer |
| Yarn 2+: no `node_modules` after a successful install | Plug'n'Play; not an error | Run scripts through `yarn`; editors may need the Yarn SDK | None |
| Install exits 0 but lists dependency install scripts it skipped (`esbuild`, `sharp`, `@tailwindcss/oxide`); `pnpm approve-builds` | The package manager blocks dependency scripts by default | Harmless if the server starts. If a native module fails later, approve that script (`pnpm approve-builds`, or the npm equivalent the warning names) | User |
| `found N vulnerabilities`, deprecation warnings | Advisory noise | Not a blocker. Never run `npm audit fix`; it rewrites the lockfile. Mention a security advisory on the framework itself as a question | None |

## Dev server fails to start

| First error looks like | Likely cause | Fix | Who |
|---|---|---|---|
| `EADDRINUSE`, `address already in use :::3000` | Another process holds the port | `lsof -nP -iTCP:<port> -sTCP:LISTEN` to see what. If this run started it, stop it. Otherwise pick a free port (`next dev -p 3001`, `vite --port 5174`, or `PORT=3001`). Some login callbacks only allow one port; check before moving | Agent |
| `Port 3000 is in use, trying 3001 instead` | The server moved itself; not an error | Use the printed URL and confirm your PID owns that port. Same login callback caveat | Agent |
| `Missing required environment variable`, `X is not set`, `Invalid environment variables` (zod or `@t3-oss/env`), `TypeError` on `process.env.X` | Required env var empty | Copy the example file if not done; fill documented defaults; list the rest as names to ask for | Agent for defaults, Engineer for secrets |
| `Cannot find module '@acme/ui'`, `Could not find a declaration file for module`, imports into `dist/` failing | Internal workspace package not built yet | Run that package's build script from the workspace root, if the README or a root script documents it | Agent if documented, else Engineer |
| `Module not found` after a branch switch, stale types, `.next` or Vite cache errors | Stale build cache | Delete the framework cache (`.next/`, `node_modules/.vite/`) and restart. Both are gitignored | Agent |
| `command not found: next`, `vite: not found` | Install did not finish, or the command ran outside the package | Rerun the frozen install at the workspace root; run the script from the app or with the filter | Agent |
| Type or lint errors stop the dev server | The repo's dev script runs type checks first | Report the first error. Do not disable the check | Engineer |
| ``Failed to download `<Font>` from Google Fonts. Using fallback font instead`` | Network hiccup or no internet; the server still runs | Note it. One restart is fine; the page renders in a fallback font until the download works | Agent |
| `execSync` or `git rev-parse` fails inside a config | Config reads git metadata; no commits | Clone with git | User |
| `docker: command not found`, `connect ECONNREFUSED 127.0.0.1:5432` (or 6379, 27017) at boot | App needs a database or cache at startup | Look for a documented `docker compose` file or a hosted dev URL in the example env. Starting Docker needs the user's OK | User or Engineer |
| Process exits with no error, or hangs with no output for over two minutes | A chained process failed quietly, or a watcher is waiting on input | Run each process in the chained `dev` script on its own to find the one that fails | Agent |

## Server runs, page does not

| What you see | Likely cause | Fix | Who |
|---|---|---|---|
| First load errors (`Invalid or unexpected token`, a `ChunkLoadError`) or hangs on a spinner, and the log is still compiling | The dev server was compiling the route on demand | Wait for the compile line in the log, load once more. Diagnose only if the second load fails too | Agent |
| Framework error dialog, `Unhandled Runtime Error`, `500` with a stack trace | A render error in the app | Report the dialog's first line and the file it names. Check whether it reproduces on the default branch before blaming the setup | Engineer |
| `Hydration failed`, `Text content does not match` | Server and client render differ | Usually pre-existing; report it and continue the map | Engineer |
| Redirect to `/login`, `/sign-in`, an identity provider, or an `invalid redirect_uri` page | Login wall | Look for a dev account, seed script, mock or dev auth flag in the docs or the example env. Never write a bypass | Engineer |
| An auth library logs a redirect loop or key mismatch | Wrong or mismatched auth keys in the local env | Ask for the dev keys for this environment | Engineer |
| Shell renders, data areas are empty or show errors; network shows `502`, `ECONNREFUSED`, `fetch failed` | Backend or API not running or not reachable | Look for a mock layer, a documented backend command or a staging API var. Report which screens degrade | Engineer |
| Blank white page, no overlay | Uncaught client error or a missing root element | Read the browser console; the first error names the cause | Agent to diagnose |
| `curl` fails but the browser works, or the reverse | Server bound to IPv6 `localhost` (`::1`) and the client used `127.0.0.1`, or the reverse | Use the exact URL the server printed | Agent |
| Unstyled page | CSS pipeline failed (PostCSS or Tailwind config) | The terminal log names the failing plugin | Engineer |

## Rules for any fix

- Two attempts on the same error, then report. A third variation is guessing.
- Never change tracked files to get past an error. Revert any you changed by accident and say so.
- A fix the agent applied goes in the note's "What changed, and what I assumed".
- If nothing here matches, report the first line that names the cause, verbatim, with the command that produced it and the Node and package manager versions. Do not paraphrase the error.
