# Scope: classifying the change and cutting the branch

Designers often make several changes over a few sessions before anyone asks for a pull request. The working tree then holds the change they mean, some edits to another screen, and whatever the tools left behind. An engineer who gets all of it in one pull request either reviews it all or rejects it. This file covers how to separate those groups using git alone.

## The four classes

| Class | What it is | Where it goes |
| --- | --- | --- |
| **The change** | Files and hunks that do what the user asked for | This PR |
| **Needed by the change** | A token, icon, utility or component the change uses and that did not exist on `$BASE` | This PR, named in the description |
| **Unrelated work** | A real edit with a different purpose: another screen, another issue, a different user-visible result | Its own branch off `$BASE`, or left uncommitted if the user prefers |
| **Noise** | Changes nobody meant to ship | Reverted |

Two edits belong together when a reviewer would need both to understand either one. A button color and the token it now uses belong together. A button color and a new page title do not, even in the same file.

## Detecting noise

Each check is a command and its rule. Run them on every changed file.

| Noise | Check |
| --- | --- |
| Whitespace or formatting only | `git diff -w --ignore-blank-lines -- <file>` prints nothing (add `$BASE` for committed changes) |
| Lockfile churn | The lockfile changed but `git diff -- package.json` shows no dependency change. Usually an install with a different package manager version |
| Wrong package manager | A new lockfile for a package manager the repo does not use, such as `package-lock.json` in a pnpm repo |
| Debug output | Added lines with `console.log`, `debugger`, `print(` or a hard-coded test value |
| Commented-out code | Added lines that are only commented-out code |
| Scratch files | Throwaway routes or state pages (`/states/...`, `/playground`), fixtures, `*.backup`, `copy of` files |
| Evidence files | Screenshots, recordings, `.reviewable-ui-pr/`, `.pr-screenshots/` |
| Local config | `.env*`, `.DS_Store`, editor folders the repo does not already track |
| Generated output | Build folders and generated types the repo does not track elsewhere |

A file with real changes plus formatter churn is not noise as a whole. Keep the real hunks and revert the reformatted ones. If the churn comes from a format-on-save setting that disagrees with the repo's formatter config, say so, so it does not happen again.

A real dependency change is never noise. Keep `package.json` and the lockfile together and name the dependency in the description, because engineers review dependencies closely.

## Cutting the branch

Run these only after the user has agreed to the inventory.

1. **Back up.** Write `git diff --binary HEAD > .reviewable-ui-pr/backup-<timestamp>.patch` and copy any untracked files you are about to remove into the same folder. Add `/.reviewable-ui-pr/` to `$(git rev-parse --git-common-dir)/info/exclude` first, so the folder can never be committed. The patch is the undo for everything below.
2. **Revert noise.** `git restore -- <files>` for tracked files, delete untracked ones. For hunks inside a kept file, write a patch of just those hunks and apply it in reverse with `git apply -R`.
3. **Branch.** From the default branch, `git switch -c <branch>` carries uncommitted changes onto the new branch. From a feature branch that already holds commits for this change, stay on it.
4. **Commit the change only.** Stage by path: `git add -- <files>`. When one file mixes in-scope and unrelated hunks, write a patch of the in-scope hunks and stage it with `git apply --cached <patch>`. Interactive `git add -p` is not available to most agents. If you cannot separate the hunks cleanly, ask the user whether to keep the file whole.
5. **Unrelated groups.** After committing the change, move the remaining uncommitted edits to their own branch. A file that also held in-scope hunks differs between the PR branch and `$BASE`, so a plain `git switch -c <other-branch> $BASE` aborts with "Your local changes would be overwritten". For those files:
   1. Save what is left of them: `git diff --binary -- <mixed files> > .reviewable-ui-pr/unrelated-<timestamp>.patch`. After the commit, that diff holds only the unrelated hunks.
   2. Restore them to the PR branch's version: `git restore -- <mixed files>`.
   3. `git switch -c <other-branch> $BASE`. Edits to files the PR branch did not touch come along unchanged.
   4. `git apply --3way .reviewable-ui-pr/unrelated-<timestamp>.patch`. The three-way fallback handles unrelated hunks that sit next to in-scope ones. If it reports a conflict, stop and show it to the user.
   5. Commit there with `git add -- <files>`, then `git switch <pr-branch>`.

   If the user wants the unrelated edits left uncommitted instead, leave them. The after screenshots will then come from a worktree, as described in step 5 of the skill.
6. **Unrelated work that is already committed.** Create the PR branch from `$BASE` and `git cherry-pick` the in-scope commits. For a commit that mixes both, run `git checkout <commit> -- <paths>` for the in-scope paths and commit. Never rewrite a branch that is already pushed without asking.

Confirm with `git status --short` and `git diff --stat $BASE..HEAD` that the branch holds exactly the agreed files.

## Conventions

**Commit messages.** Look for commitlint config (`commitlint.config.*`, `.commitlintrc*`, a `commitlint` key in `package.json`), a husky `commit-msg` hook, or Conventional Commits subjects (`type(scope): description`) in at least half of the last 30 commits. When any of these is present:

- `feat` for a new visible element or behavior, `fix` for correcting UI that was wrong.
- `style` means formatting with no change in meaning. It is not for visual styling. A color change is `feat` or `fix`.
- A scope in parentheses only when the history uses scopes. Reuse the scopes it already has.
- Lowercase, imperative, no trailing period, under 72 characters.

Otherwise match the history: its tense, its capitalization, and any issue key prefix such as `ABC-123`. The body says what changed for users and why, not how.

**Branch names.** Match the remote's pattern (`git for-each-ref refs/remotes --format='%(refname:short)'`): a `feat/` or `ui/` prefix, a username prefix, an issue key. When the user gives an issue that suggests a branch name, use that name. With no pattern, use `ui/<short-slug>`.

**Pull request title.** Same convention as the commit subject.
