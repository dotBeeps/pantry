---
name: github-writing
description: "Write effective GitHub documents: PR descriptions, issues, READMEs, CONTRIBUTING guides, release notes, repo templates, and community docs. Use when drafting any document that lives on GitHub — PRs, issues, READMEs, wikis, releases, or repository setup files."
---

# GitHub Writing

Collaboratively draft high-quality documents for GitHub repositories. **Do not execute any bash or CLI commands until the user explicitly approves the draft.**

## Writing Styles

Before drafting, determine the active writing style. Check settings first, then ask if unclear:

```json
// ~/.pi/agent/settings.json → dotsPiEnhancements.writingStyle
{
  "default": "friendly",
  "overrides": {
    "pr": "narrative",
    "readme": "personality",
    "security": "formal"
  }
}
```

**Resolution order:**
1. Check `overrides` for the document type (`pr`, `issue`, `readme`, `contributing`, `release`, `security`, `coc`, `template`)
2. Fall back to `default`
3. If no setting exists, ask the user or default to `friendly`

**Available styles** — read the full style file before drafting:

| Style | File | Voice | Best For |
|-------|------|-------|----------|
| **formal** | berrygems/styles/formal.md | Precise, impersonal, technical | Public libs, corporate, security docs |
| **friendly** | berrygems/styles/friendly.md | Warm, approachable, professional | OSS projects, broad audiences (default) |
| **personality** | berrygems/styles/personality.md | Character-driven, expressive | Personal projects, branded repos |
| **narrative** | berrygems/styles/narrative.md | Story-driven, investigative | Complex PRs, release notes, post-mortems |
| **minimal** | berrygems/styles/minimal.md | Terse, factual, zero fluff | Internal tools, automation, expert audiences |

The user can also request a style inline: "write this PR in narrative style" or "keep it minimal." Inline requests override settings.

Styles control **tone and voice only** — document structure comes from the reference files. Every style enforces technical accuracy; personality never excuses imprecision.

## Workflow

Follow these steps in order. Do not skip the approval gate.

### 1. Classify

Determine the document type. Each links to a structure guide in `references/`:

**Code workflow documents:**
- **PR description** — summarizing changes for reviewers → [references/pr-template.md](references/pr-template.md)
- **Bug report** — reproducing and documenting a defect → [references/issue-templates.md](references/issue-templates.md)
- **Feature request** — proposing new functionality → [references/issue-templates.md](references/issue-templates.md)
- **RFC / design doc** — proposing architectural changes → [references/issue-templates.md](references/issue-templates.md)
- **Release notes** — communicating what shipped → [references/release-notes-guide.md](references/release-notes-guide.md)

**Repository documents:**
- **README** — project introduction and onboarding → [references/readme-guide.md](references/readme-guide.md)
- **CONTRIBUTING guide** — how to contribute → [references/contributing-guide.md](references/contributing-guide.md)
- **Community docs** — CODE_OF_CONDUCT, SECURITY, FUNDING, LICENSE → [references/community-docs-guide.md](references/community-docs-guide.md)
- **Repo templates** — `.github/` issue/PR/discussion templates → [references/repo-templates-guide.md](references/repo-templates-guide.md)

**Other:**
- **Discussion post** — questions, announcements, show-and-tell → treat as issue with less formality
- **Wiki page** — extended documentation → treat as README section
- **Profile README** — personal or org landing page → [references/readme-guide.md](references/readme-guide.md) (profile section)

Ask the user if the type isn't clear from context. Read the appropriate reference file before proceeding.

### 2. Interview

Ask 2–4 quick questions (skip what's already obvious):

- What's the focus or goal of this document?
- Who's the audience? (maintainers, users, contributors, specific reviewers)
- What are the key points to cover?
- Are there sections you want to write yourself? (mark as `[MANUAL]` in the outline)

Also resolve the writing style if not already clear from settings or user request. If the setting exists and the user hasn't overridden it, confirm briefly: "I'll write this in [style] style — good?" Don't make it a whole conversation.

Keep the interview fast — two focused questions are better than four vague ones.

### 3. Research (Read-Only)

Gather context **without executing any commands that modify state**. Allowed:
- Read diffs, logs, file contents: `git diff`, `git log`, `git show`, source files
- Read issues/PRs: `gh issue view`, `gh pr view`
- Read existing docs: READMEs, CONTRIBUTING, templates already in the repo
- Read CI status: `gh pr checks`, `gh run view`
- Read repo metadata: `gh repo view`, `package.json`, `Cargo.toml`, etc.

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

Read the resolved style file from `styles/` and apply its voice, word choice, and structure rules. Write the complete document in a fenced code block for easy review and copying. Use GitHub Flavored Markdown (see `github-markdown` skill for conventions).

**Style enforcement during drafting:**
- Reread the style's Guardrails section before writing
- If the style says "never" do something, don't do it
- If personality/narrative styles feel forced for the content, tell the user and suggest a better fit
- Technical accuracy overrides style in every case

### 7. Final Review

Present the draft and ask: **"Ready to submit?"**

Only after final approval, offer to run the appropriate command:
- PR: `gh pr create --body-file <file>`
- Issue: `gh issue create --body-file <file>`
- Release: `gh release create --notes-file <file>`
- Repo files: write directly to the repository (README.md, CONTRIBUTING.md, etc.)

## Attribution

### AI Contributor Identity

Read the contributor identity from settings before writing attribution:

```json
// ~/.pi/agent/settings.json → dotsPiEnhancements.contributor
{
  "name": "Ember 🐉",
  "email": "ember-ai@dotbeeps.dev",
  "trailerFormat": "Co-authored-by: Ember 🐉 <ember-ai@dotbeeps.dev>",
  "transparencyFormat": "Authored with Ember 🐉 [{model}]",
  "includeModel": true
}
```

If the setting is absent, fall back to asking the user or omitting AI attribution.

### Co-authored-by

For AI-assisted or pair-programmed commits, add a trailer:

```
Co-authored-by: Ember 🐉 <ember-ai@dotbeeps.dev>
```

If `includeModel` is true, include the current model:

```
Co-authored-by: Ember 🐉 [claude-sonnet-4] <ember-ai@dotbeeps.dev>
```

For human co-authors, use their name and email:

```
Co-authored-by: Name <email@example.com>
```

### Transparency in PRs and Issues

When writing PR descriptions or issues that were substantially AI-authored, include a transparency note using `transparencyFormat`. Replace `{model}` with the current model:

```markdown
> Authored with Ember 🐉 [claude-sonnet-4]
```

Place at the bottom of the document, before any footers. This is for technical transparency — reviewers and maintainers should know when AI drafted the content.

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

❌ **"Fixed stuff"** — No context, no motivation, no testing notes.

✅ Even a two-line summary is infinitely better than nothing.

❌ **Wall of diff, no explanation** — The diff is already visible. The description explains *why*.

✅ Summarize the approach, link to the issue, note anything non-obvious.

❌ **No testing notes** — "It works" with no evidence.

✅ List what was tested, how to reproduce, edge cases checked.

❌ **Missing issue links** — Changes without traceability.

✅ Always link to the motivating issue. Create one first if it doesn't exist.

❌ **README with no quick start** — Long explanations before the user can try anything.

✅ Show install + first command in the first 20 lines.

❌ **CONTRIBUTING with no setup steps** — "PRs welcome" with no onboarding.

✅ Clone → install → test → submit flow with real commands.

❌ **Templates that are walls of text** — Nobody fills out 20 required fields.

✅ Keep required fields minimal, use optional sections with comments.
