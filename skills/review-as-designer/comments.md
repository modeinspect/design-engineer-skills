# Writing review comments

The anatomy of a comment, how to tell intent from bug from taste, when an issue blocks the merge, and how to word it so the engineer acts on it instead of arguing with it.

## Anatomy

Every comment has five parts, in this order:

```md
**Blocking (bug):** The Save button has no visible focus ring.

**Where:** `/settings`, keyboard focus on Save, 1280px wide. Screenshot: `settings-save-focus-1280.png`. Code: `src/components/SettingsForm.tsx:58`.

**Why it matters:** Keyboard users lose track of where they are after the name field. The other buttons on this page show the ring that `Button` provides.

**Suggested fix:** Use `<Button>` here instead of the plain `<button>`, or add `focus-visible:ring-2 focus-visible:ring-ring` to match it.
```

1. **Label and summary.** One line: blocking or not, the kind, then what is wrong in words the engineer would use. The summary is the problem, not the fix. One comment covers one fix, see [Tone](#tone).
2. **Where.** The route, the state, the viewport width, the screenshot file name and, when one line causes it, `path:line`. The engineer should be able to reach the state from this line alone.
3. **Why it matters.** The effect on the user or on the system, in one or two sentences. For an intent issue, name the reference: the design frame, the spec section or the existing screen that does it the other way.
4. **Suggested fix.** The value, token, variant or component to use, in the project's own idiom. Name `--space-6` or `gap-6`, not "a bit more space". If there are several fixes, give the cheapest first. If you do not know the fix, say what the result should look like and leave the how to the engineer.
5. **Before and after**, when you have both. A base capture next to the head capture settles most spacing and color discussions without a reply.

The labels are:

| Label | Use for |
| --- | --- |
| `Blocking (bug)`, `Blocking (intent)` | Fix before merge |
| `Non-blocking (bug)`, `Non-blocking (intent)` | Fix now or in a follow-up, the engineer's call |
| `Non-blocking (taste)` | A preference. Fine to decline |
| `Question (intent)` | You do not know what was intended. Ask before judging |

## The three kinds

**Intent.** The UI differs from the reference the designer named, or from what the pull request says it does. Cite the reference. Without one, it is a question, not a finding. Typical cases: a layout that differs from the design frame, a flow that skips a step the spec has, a pattern that differs from how the product already handles the same situation.

**Bug.** It is wrong regardless of anyone's taste, and you can point at the evidence:

- a state the component needs and does not have: hover, keyboard focus, disabled, loading, empty, error
- a regression: a value or behavior that was right on the base and is not on the head
- a token problem: a raw value where the system has a token, a token from the wrong scale, or a semantic token used against its meaning, such as the danger color on a success message
- a layout that clips, overlaps or scrolls sideways at a width the product supports
- copy that misleads or leaves the user without a next step, such as an empty state with no way forward

**Taste.** The designer would do it differently and nothing written says so. Say it as a preference ("I would try..."), label it, and expect the engineer may say no. If the same taste comment comes up in every review, it belongs in the design system or the spec, not in the pull request. Say that in the review summary instead of repeating the comment.

When an issue looks like two kinds, pick by evidence. If you can show a regression or a broken state, it is a bug, even if it also differs from the design. If the only evidence is the design file, it is intent. If the only evidence is the designer's eye, it is taste.

Hand off rather than re-derive the rules. Accessibility depth belongs to `better-accessibility`, copy to `better-writing`, and visual polish and motion to `better-ui`, if installed. Use their findings as the "why" in a bug comment.

## Blocking or not

Propose a call for each issue and say why. The designer has the final say.

**Blocking:**

- a bug a user will hit: a regression, a missing keyboard focus indicator, a control that cannot be reached, a broken layout at a supported width, a state that shows nothing or the wrong thing
- a semantic token used against its meaning, or a raw value that renders differently from the token it should use
- an intent mismatch against a reference the team agreed on, unless the designer chooses to ship and follow up

**Non-blocking:**

- a raw value that renders the same as its token, unless the project's docs or lint rules forbid raw values
- polish that is off on one surface and does not affect the task
- anything pre-existing, meaning present on the base and not made worse
- all taste

Keep the number of blockers honest. If everything blocks, nothing does, and the engineer stops reading the labels.

## Tone

Engineers resent comments that are vague, that judge the person, or that hide a preference behind a rule. Write the opposite:

- **Talk about the UI, not the person.** "The list loses its gap at 375px", not "you broke the spacing".
- **Lead with what the user sees.** Then the code. An engineer can argue with an opinion about code; it is harder to argue with a screenshot.
- **One fix per comment.** Unrelated issues bundled together get half fixed. Symptoms that one change fixes belong together: a missing hover and a missing focus ring on a hand-styled `<button>` that should be `Button` are one comment, labelled with the stricter blocking call.
- **Group a root cause.** One comment on the token or shared component that causes the issue, listing every place it shows up, not five comments on five screens.
- **State requests as requests.** A blocking comment says "Restore the 24px gap". Hedging a blocker into "maybe consider" gets it read as optional and fixed in the next pull request, if ever.
- **State preferences as preferences.** "I would try a lighter weight here. Non-blocking." Never "this should be".
- **Ask when you do not know.** "Is the empty state meant to drop the Shop button, or did it get lost in the refactor?" A question invites the context you are missing.
- **Give the value, not the feeling.** "Off", "feels heavy" and "make it pop" give the engineer nothing to change. Name the property, the current value and the target value.
- **Drop the words that sting.** No "just", "simply", "obviously", "clearly", "why didn't you", "pixel perfect" or "as I said". No sarcasm, no exclamation marks.
- **Say what you checked.** "Checked at 375px and 1280px, light theme only." That tells the engineer what is still open. Say it once in the review summary, and in a comment only when that comment's coverage differs.

Praise goes in the review summary, once, and only when it is specific and true: "The new loading state on the table is solid." Do not pad every comment with a compliment.

## The review summary

Posted as the review body. Keep it short:

```md
Design review of the settings refresh, against the settings frame in the design file.

Walked `/settings` and `/settings/billing` at 375px and 1280px, light theme, default, hover, keyboard focus, loading and empty states. Dark theme not checked.

**2 blocking:** missing focus ring on Save, list gap regression on mobile.
**3 non-blocking:** 2 bugs, 1 taste.
**1 question:** the empty state's missing action.

Screenshots are attached to each comment.
```

If the designer wants a call to talk through the comments instead, say so in the summary and keep the posted comments to the blockers.
