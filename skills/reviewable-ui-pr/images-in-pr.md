# Getting screenshots into the pull request

GitHub shows images in a pull request description when they are hosted somewhere GitHub can render. The `gh` CLI has no command to upload an attachment, and GitHub has no public API for the attachment storage its web editor uses. An agent cannot put a local PNG into a GitHub pull request on its own. Do not claim otherwise, and do not paste local file paths into the body, because they render as broken images.

## Default: the agent uploads through the user's browser

GitHub accepts attachments only through its web editor. When the agent controls a browser in which the user is already signed in to GitHub (a browser extension that drives the user's own browser, or Playwright with a persistent profile the user signed in to), the agent does the upload itself, exactly as a manual drag would. The images land in GitHub's attachment storage with the same access rules as any drag and drop, so this works for private repos and adds nothing to the repo.

1. When the user asks for the pull request, push the branch and create a draft from the description file. Its table holds `<!-- img: <file name> -->` placeholders.

   ```bash
   git push -u origin <branch>
   gh pr create --draft --base <default> --head <branch> --title "<title>" --body-file .reviewable-ui-pr/<branch>/description.md
   ```

2. Check the session before touching anything. Open the pull request URL from step 1 in the browser. If GitHub shows a sign-in page, or the description has no **Edit** option, the browser is not usable: go to the fallback below. Never type, ask for or fill in the user's password or two-factor code.
3. Open the description's **Edit** box and attach every PNG in `.reviewable-ui-pr/<branch>/` through the editor's file field ("Paste, drop, or click to add files"), all in one selection. With Playwright, set the files on the comment box's `input[type=file]`. Do not paste images, because pasted images lose their file names.
4. Wait until no upload is still in progress, then click **Update comment**. Do not rearrange the text in the browser. Placement happens in step 5 through `gh`, where it can be checked.
5. Place the images and verify, as described under "Placing the images" below.

If any browser step fails (an element is missing, an upload errors, the session expires), stop the browser path, say which step failed and with what message, and switch to the fallback. Do not retry in a loop, and do not try other upload routes on your own.

## Fallback: instructions for the user

Use this when no browser is available, the user is not signed in to GitHub there, or the browser path failed. Steps 1 and 5 are the same; the user does the upload.

Tell the user exactly what to do. Use the real folder path:

> Open the pull request (`gh pr view --web`), click **Edit** on the description, select every PNG in `.reviewable-ui-pr/<branch>/` and drop them onto the text box in one drag. Wait until every upload finishes, then click **Update comment**. Drop the files from the folder. Do not paste them, because pasted images lose their file names.

When the user says it is done, place the images.

## Placing the images

1. Read the body back with `gh pr view <number> --json body`. Each uploaded file is now an image whose alt text is the file name. GitHub writes either `![name](https://github.com/user-attachments/assets/<id>)` or `<img ... alt="name" src="https://github.com/user-attachments/assets/<id>" />`. Match both, with or without `.png`.
2. Replace each `<!-- img: <name> -->` placeholder with its image, at `width="400"` so pairs sit side by side. Delete the block of uploaded images. Write the result with `gh pr edit <number> --body-file <file>`.
3. Read the body back again and check that no placeholder is left and every image appears exactly once. List any placeholder without a match and any uploaded image that did not match a placeholder. Do not guess a match by position.

When the user does not want the agent to open the pull request, hand over the description file and the folder. They create the pull request in the browser, and the same upload works on the new pull request form, by the agent's browser or by the user's drag. Placing the images then runs on their pull request number.

## On request: an assets branch

When the user wants no manual step and accepts a second branch on the remote:

1. Commit the PNGs to an orphan branch such as `pr-assets/<branch>`, in a separate worktree, never on the PR branch. Push it after the user says yes.
2. Reference each image as `https://github.com/<owner>/<repo>/blob/<assets-commit-sha>/<file>.png?raw=true`. Pin the commit SHA, not the branch name, so later pushes cannot change the images.
3. Open the pull request and check that the images render. In private repos they render only for signed-in viewers with access. If they do not render, fall back to the browser upload or the user instructions.

The cost: the binaries stay in the repo's object store until the branch is deleted and the repo is garbage collected. Say so before using it, and delete the branch after the pull request merges, if the user agrees.

## Other hosts

- **GitLab:** the project uploads API (`POST /projects/:id/uploads`) accepts a file and returns its markdown, so the agent can upload directly with the user's token. Merge request descriptions render the returned link.
- **Bitbucket and others:** use the web editor's upload, through the user's browser or the user instructions, as on GitHub.

## Never

- Commit screenshots to the PR branch. They land in the default branch on merge and add binary noise to the diff the engineer reviews.
- Upload screenshots of unreleased UI to a public image host, a paste site or a CDN, unless the user explicitly asks for that host.
- Link images from a local dev server or a `file://` path.
