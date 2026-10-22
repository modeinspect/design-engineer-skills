---
name: review-as-designer
description: Helps a designer review an engineer's UI pull request. Opens the deploy preview or runs the branch locally, lists the screens and states the change touches, walks those states with the designer, and drafts review comments an engineer can act on. Each comment says what is wrong, where, why it matters, how to fix it and whether it blocks the merge. Comments are posted to GitHub only after the designer says yes. Use when a designer says "review this PR as a designer", "design review PR 482", "design QA this branch", "check the engineer's UI changes", "help me leave feedback on this pull request", "what should I comment on this PR", or pastes a pull request link and asks how it looks.
---

# Review as designer

This skill helps a designer review someone else's UI change. It opens the change where it can be seen, maps the diff to the screens and states it touches, walks those states with the designer and turns what they see into review comments an engineer can act on. The designer judges. The agent reproduces states, measures and cites code.

It owns the walkthrough, the sorting of each issue into intent, bug or taste, and the comment drafts. The agent's own code review of the diff belongs to `interface-review`. Deep accessibility, copy and polish rules belong to the `better-*` skills. A full route by route comparison against production belongs to `visual-qa-branch`. Hand off to them where they are installed and keep going where they are not.

## The designer reviews, the agent assists

An engineer will act on a comment that shows them the problem, names the fix and says how much it matters. They resent a comment that reads as taste dressed up as a rule, or a vague "this feels off". Every step below exists to produce the first kind and to catch the second before it gets posted.

Nothing reaches GitHub until the designer has read the drafts and said yes.

## Steps

### 1. Resolve the change and its intent

Accept `pr <n>`, a pull request URL, a branch name, or nothing. With nothing, use the open pull request on the current branch, then the current branch against the default branch. If none of these resolves to a change, say so and ask for a target. Never fall back to the last commit.

For a pull request, read the change with `gh`:

```bash
gh pr view <n> --json number,title,body,url,baseRefName,headRefName,headRefOid,files,comments
```

Record the base, the head SHA and the changed files. For a local branch, take the base from `git merge-base <default-branch> <branch>` and read intent from the commit messages.

The intent is what the change claims to do. Read the title, the body, linked issues, design links and any before and after screenshots the author attached. Then ask the designer one short question and use the answer as the reference for every intent comment:

> What should this match: a design file, a spec, or what the product already does? Anything you already want me to check?

If they have no reference, the reference is the existing product plus the pull request description. Say so in the report. If the designer cannot answer this or any later question in the session, keep going: an issue that depends on the answer stays a `Question (intent)`, and the question goes in the report.

Read each hunk against the stated intent. A visible change the description does not mention, such as a removed button in a change that says "shortened the message", is a lead for step 4. A design file can be older than the code, so when it disagrees with existing shared components, ask which one wins before calling either side wrong.

If `gh` is missing or not signed in and the target is a pull request, stop and say which. Do not guess the pull request's contents from a branch with a similar name.

### 2. Open the preview

Find a place to see the head of the change, in this order. Details and commands are in [previews.md](previews.md).

1. **A deploy preview for the head SHA.** Look in the pull request's bot comments, deployments and checks (Vercel, Netlify, Cloudflare Pages, Render and similar). Confirm the preview was built from the current head SHA. A preview from an older commit is a different change.
2. **The branch run locally.** If the current checkout is already the head and has no uncommitted changes, run it in place. Otherwise create a separate worktree at the head so the designer's own checkout is never switched. Detect the package manager from the lockfile and use the project's own dev command.

If neither works, stop. Report the preview you looked for and why it failed, the exact command that failed and its error, and what would unblock it (an env file, a running backend, deploy protection access). Do not draft visual comments from the diff alone. If the designer wants a code-only pass instead, that is `interface-review`'s job.

Login walls and missing data are part of opening the preview. Ask the designer for a test account or seed step. A state you cannot reach is listed as not walked, never assumed fine.

### 3. List the surfaces

A changed file is not a surface. Map each one to where it renders:

- A route or page file is its own surface.
- A component maps to the routes that render it. Follow imports one hop. For a shared component, a token, a theme value or a global style, search for its name and take the routes with the most consumers. If the blast radius is large and `component-impact` is installed, tell the designer to run `/component-impact` for the full set; it runs only when the user starts it.
- Copy and locale files map to the screens that show those strings.
- Tests, config, data fetching and other code that does not render go in a short "not reviewed: no visible UI" line.

Cap the walk at eight surfaces and name the ones you left out. Show the list to the designer before walking it, so they can reorder or add one.

| Surface | Route | Why it is in scope | States to walk |
| --- | --- | --- | --- |
| Cart summary | `/cart` | `CartSummary.tsx` changed | default, empty, long item name, 375px |

If `interface-review` is installed, ask the designer to run it on the same target now (it is started by the user, not the agent). Treat its findings as leads to confirm in the preview. A lead you cannot see rendered stays marked "from code, not seen".

### 4. Walk the states with the designer

For each surface, walk the states the change could affect. Use a browser automation tool such as Playwright, or the agent's own browser. If neither is available, give the designer the URL and the steps for each state and ask for their screenshots. Say in the report that the designer captured them.

The full state list is in [previews.md](previews.md#states-to-walk). At minimum, cover these where they exist:

- default, hover, keyboard focus (reached with Tab, not a click), active, disabled
- loading, empty, error, success
- long content, missing images, one item and many items
- 375px, the main desktop width, and dark theme if the product has one

For every capture, record the route, the state, the viewport width and the pixel ratio. A 2x screenshot shows everything at twice its real size, so measure in CSS pixels, from computed styles, never from screenshot pixels.

When the diff changes a spacing, size, color or type value, capture the base too: production, the base branch's own preview, or a second worktree at the base. That gives the engineer a before and after. A difference the change did not cause is pre-existing. Mention at most three, and never as blocking.

Show the designer each surface's captures together and ask your questions in one batch, not one question per state. Ask what you cannot know: "Is 16px between items intended, or should it stay at 24px?" Do not ask them to confirm what you can measure.

### 5. Sort each issue

Give every issue exactly one kind. The rules and edge cases are in [comments.md](comments.md#the-three-kinds).

- **Intent:** it differs from the reference the designer named, or from what the pull request says it does. If the reference is unclear, it becomes a question.
- **Bug:** it is wrong whatever anyone's taste: a missing state, a wrong or hard-coded token, a regression against the base, a layout that breaks at a width, a control a keyboard cannot reach, copy that leaves the user stuck.
- **Taste:** the designer would do it differently and no reference or system rule says so.

Then mark it **Blocking** or **Non-blocking**. Taste is never blocking. The agent proposes, says why, and the designer decides.

### 6. Draft the comments

Write each comment to the anatomy in [comments.md](comments.md#anatomy): kind and blocking, what is wrong, where, why it matters, the suggested fix. One comment per fix: symptoms that one change fixes share a comment, listing every place they show up.

Anchor a comment to a file and line when one changed line causes it and that line is in the diff. Otherwise write it as a general comment with the route, state and screenshot. Write fixes in the project's own idiom: its token names, its component variants, its spacing scale.

Follow the tone rules in [comments.md](comments.md#tone). Read each draft as the engineer would before showing it.

### 7. Review the drafts with the designer, then post on their OK

Show the drafts in the shape below and ask whether to post. Edits, cuts and changes to blocking calls are the designer's.

Post only after an explicit yes, and only through `gh`. [posting.md](posting.md) has the commands. Offer two ways to post:

- **Pending review** (the default): the comments go up as a draft review only the designer can see. They drag the screenshots in on GitHub, since `gh` cannot upload images, then submit.
- **Post now** as a single review with the event the designer picks: comment or request changes. Never approve on the designer's behalf.

If posting fails, show the error and the comments that did not post. Do not retry with a different method on your own. For a local branch with no pull request, there is nothing to post. The drafts and the screenshot folder are the result.

### 8. Clean up

Stop any dev server you started, then remove any worktree you added. `git worktree remove --force` is fine for a worktree you created, since installs leave untracked files in it. Never force-remove a worktree you did not create. Keep the screenshot folder, which lives outside every worktree, and name its path. Say what you removed.

## Report

Return this, in this order:

1. **Scope:** target, base and head SHA, where the preview came from (URL and the SHA it was built from, or the local command and port), the design reference, and whether `interface-review` findings were included.
2. **Surfaces:** the table from step 3, with a "walked" column listing the states covered and a "not walked" column giving the reason for each state left out.
3. **Drafted comments:** the review summary, then blocking, non-blocking and questions, in that order. Each one written as it would be posted, with its anchor (`path:line` or "general") and its screenshot file names. Name the screenshot folder once.
4. **Pre-existing:** at most three, marked not this change's responsibility.
5. **Not checked:** every state, width or claim that did not run, with the reason.
6. **Posting status:** "Nothing has been posted" until the designer says yes. After posting, the review URL.

A review with nothing worth commenting on is a valid result. Say so plainly, list what was walked, and do not pad.

## Boundaries

- Never posts, edits, resolves or deletes anything on GitHub without the designer's explicit OK for that action.
- Never approves a pull request, and never requests changes unless the designer chose that event.
- Never switches, stashes or resets the designer's checkout, and never pushes, merges or edits the engineer's code.
- Never drafts visual comments for a change it could not render, and never reports a state as checked that it did not see.
- Never presents taste as a requirement, and never marks taste as blocking.
- Does not review correctness, tests, security or performance. Name such a concern once and point to the project's code review.

Part of the [Modeinspect design engineer skills](https://modeinspect.com/design-engineer/skills).
