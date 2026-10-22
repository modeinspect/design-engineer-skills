# Posting a review through `gh`

Run these only after the designer has said yes to posting, and only for the comments they approved. Show them which form you are about to use and wait for the yes.

## Before posting

1. **Confirm the repository.** In a fork, `gh` can resolve to the parent repository. Read `gh pr view <n> --json url` and use the owner and repo from that URL explicitly in every call below.
2. **Confirm the head.** Re-read `headRefOid`. If it moved since the walkthrough, tell the designer that the engineer has pushed since, and ask whether to re-walk the affected surfaces before posting.
3. **Check every inline anchor.** A line comment must land on a line inside a diff hunk on the new side. Read the hunks from `gh pr diff <n>`: in `@@ -a,b +c,d @@`, lines `c` to `c+d-1` of the new file can carry a comment. Move any comment whose line is outside every hunk into the review body, prefixed with its `path:line`.

## The review file

Write one JSON file with every approved comment, so the review posts as one unit and the engineer gets one notification:

```json
{
  "commit_id": "<headRefOid>",
  "body": "<the review summary>",
  "comments": [
    {
      "path": "src/components/SettingsForm.tsx",
      "line": 58,
      "side": "RIGHT",
      "body": "**Blocking (bug):** The Save button has no visible focus ring.\n\n..."
    }
  ]
}
```

General comments, those anchored to a route and state rather than a line, go in `body` under the summary, each with its label.

Build the JSON with a tool that escapes strings, such as `jq` or a short script. Hand-written JSON breaks on the first quote in a comment.

## Two ways to post

**Pending review**, the default. Leave out `event`. The review stays as a draft that only the designer can see:

```bash
gh api --method POST "repos/<owner>/<repo>/pulls/<n>/reviews" --input review.json
```

Then tell the designer: open the pull request's Files tab, drag each screenshot into its comment, and submit the review with the event they choose. `gh` cannot upload images to comments, so this is the only way the screenshots reach the review.

**Post now.** Add `"event": "COMMENT"` or `"event": "REQUEST_CHANGES"` to the file, whichever the designer picked, and run the same command. Never use `APPROVE`. Screenshots stay as file names in the text. Say so before posting, so the designer can choose the pending route instead.

## When it fails

Show the error and stop. Do not retry another way without asking. The common ones:

| Error | Cause | What to tell the designer |
| --- | --- | --- |
| `User can only have one pending review per pull request` | They already have a draft review open | Submit or discard that draft on GitHub, then post again |
| `Line could not be resolved` or `must be part of the diff` | An anchor outside the diff | Move that comment into the body and post again |
| `HTTP 404` | Wrong repository, often the fork's parent, or no access | Check the owner and repo from the pull request URL |
| `HTTP 403` or `Resource not accessible` | The token lacks write access | Run `gh auth status` and check the scopes |

After a successful post, report the review's `html_url` from the response.
