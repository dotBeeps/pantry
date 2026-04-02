---
name: github-writing
description: "Write effective pull request descriptions and GitHub issues with proper context, attribution, and structure. Use when drafting PR descriptions, writing issue reports, feature requests, or structuring technical documents for GitHub."
---

# GitHub Writing

Collaboratively draft high-quality PR descriptions, issue reports, and feature requests. **Do not execute any bash or CLI commands until the user explicitly approves the draft.**

## Workflow

Follow these steps in order. Do not skip the approval gate.

### 1. Classify

Determine the document type:
- **PR description** — summarizing code changes for reviewers
- **Bug report** — reproducing and documenting a defect
- **Feature request** — proposing new functionality
- **RFC / design doc** — proposing architectural changes

Ask the user if the type isn't clear from context.

### 2. Interview

Ask 2–4 quick questions (skip what's already obvious):

- What's the focus or goal of this document?
- Who's the audience? (maintainers, users, contributors, specific reviewers)
- What are the key points to cover?
- Are there sections you want to write yourself? (mark as `[MANUAL]` in the outline)

Keep the interview fast — two focused questions are better than four vague ones.

### 3. Research (Read-Only)

Gather context **without executing any commands that modify state**. Allowed actions:
- Read diffs: `git diff`, `git log`, `git show`
- Read issues/PRs: `gh issue view`, `gh pr view`
- Read files: source code, READMEs, existing templates
- Read CI status: `gh pr checks`, `gh run view`

Summarize findings for the user. Note anything that needs clarification.

### 4. Outline

Present a structured outline before writing:

- List proposed sections with bullet points for key content
- Mark `[MANUAL]` on any sections the user wants to write
- Include attribution notes (co-authors, linked issues)
- Flag any gaps: "I couldn't find X — should I include it?"

### 5. Approval Gate

Present the outline and ask: **"Ready to draft?"**

The user can:
- Approve → proceed to drafting
- Adjust sections, reorder, add/remove content
- Write manual sections inline
- Request more research

**Do not write the full draft or run any CLI commands until approved.**

### 6. Draft

Write the complete document in a fenced code block for easy review and copying. Use GitHub Flavored Markdown (see `github-markdown` skill for conventions).

### 7. Final Review

Present the draft and ask: **"Ready to submit?"**

Only after final approval, offer to run the appropriate `gh` command (e.g., `gh pr create --body-file`, `gh issue create --body`).

## PR Description Structure

```markdown
## Summary

[1–2 sentences: what changed and why]

## Motivation

[Link to issue, explain the problem being solved]
Fixes #123

## Changes

- [Key change 1 — what and why]
- [Key change 2]
- [Key change 3]

## Testing

- [ ] [How this was tested]
- [ ] [What reviewers should verify]

## Screenshots

[If UI changes — before/after screenshots or recordings]

## Notes

[Breaking changes, migration steps, follow-up work needed]
```

## Bug Report Structure

```markdown
## Summary

[1-sentence description of the bug]

## Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior

[What should happen]

## Actual Behavior

[What actually happens — include error messages, screenshots]

## Environment

- OS: [e.g., Arch Linux 6.x]
- Version: [e.g., v1.2.3]
- [Other relevant context]

## Additional Context

[Logs, stack traces (in collapsible sections), related issues]
```

## Feature Request Structure

```markdown
## Summary

[1-sentence description of the feature]

## Motivation

[Why this feature is needed — what problem does it solve?]

## Proposed Solution

[How it should work — API, behavior, UI]

## Alternatives Considered

[What else was considered and why it was rejected]

## Additional Context

[Mockups, examples from other projects, related issues]
```

## Attribution

### Co-authored-by

For AI-assisted or pair-programmed work, add trailers to the commit message:

```
Co-authored-by: Name <email@example.com>
```

Include in the PR description body when multiple contributors are involved.

### Issue Linking

- `Fixes #123` — auto-closes the issue when PR merges
- `Closes #123` — same as Fixes
- `Resolves #123` — same as Fixes
- `Related to #456` — reference without auto-closing
- `Part of #789` — for incremental work on a larger issue

### Crediting Others

When building on someone else's work, report, or suggestion:
- "Thanks to @user for reporting this in #123"
- "Based on the approach suggested by @user in #456"
- Link to the original issue, discussion, or comment

## Anti-Patterns

❌ **"Fixed stuff"** — No context, no motivation, no testing notes. Reviewers can't understand what changed or why.

✅ **Instead:** Even a two-line summary ("Fixed null check in panel renderer. The bug caused crashes when panels had no title.") is infinitely better.

❌ **Wall of diff, no explanation** — Pasting the entire diff as the PR body. The diff is already visible in the PR — the description should explain *why*.

✅ **Instead:** Summarize the approach, link to the issue, note anything surprising or non-obvious.

❌ **No testing notes** — "It works" with no evidence. Reviewers don't know what to verify.

✅ **Instead:** List what was tested, how to reproduce, and any edge cases checked.

❌ **Missing issue links** — Changes without traceability. Why was this done? Who asked for it?

✅ **Instead:** Always link to the motivating issue. If there isn't one, create one first.

See [references/pr-template.md](references/pr-template.md) and [references/issue-templates.md](references/issue-templates.md) for copy-paste templates.
