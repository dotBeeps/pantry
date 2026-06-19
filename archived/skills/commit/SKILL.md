---
name: commit
description: "Create git commits following Conventional Commits. Handles staging, message formatting, scope detection, amending, and fixup commits. Use when committing changes, amending commits, or creating fixup commits."
license: MIT
---

# Commit

Create well-formatted git commits. Only commit — do not push.

## Format

`<type>(<scope>): <summary>`

- **type** REQUIRED — `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `perf`, `style`, `ci`
- **scope** OPTIONAL — short noun for the affected area: `api`, `parser`, `ui`, `auth`
- **summary** REQUIRED — imperative mood, ≤72 chars, no trailing period

```
feat(panels): add floating panel API
fix(auth): handle expired SSH keys gracefully
docs: update branching strategy guide
refactor(parser): extract token validation
```

## Workflow

1. **Review changes** — run `git status` and `git diff` (or `git diff --cached` for staged)
2. **Detect scope** — run `git log -n 30 --pretty=format:%s` to match project conventions
3. **Stage files** — `git add <files>` for specific files, or `git add -p` for partial staging
4. **Commit** — `git commit -m "<type>(<scope>): <summary>"` (add `-m "<body>"` if needed)

## Staging

- If the user specifies files or globs, only stage those
- If no files specified, stage all changes relevant to the logical commit
- If ambiguous extra files exist in `git status`, ask which to include
- Use `git add -p` for partial staging when a file contains unrelated changes

## Scope Detection

Run `git log -n 30 --pretty=format:%s` to identify patterns:

- If the project uses scopes consistently, match the existing convention
- Common scopes come from directory structure (`extensions`, `skills`, `api`) or feature areas
- If no clear pattern exists, omit scope — `feat: add panel support`

## Body

- OPTIONAL — add when the _why_ isn't obvious from the summary
- Blank line between subject and body
- Short paragraphs explaining motivation or context
- Do NOT include sign-offs (`Signed-off-by`)
- Do NOT include breaking-change footers

## AI Attribution

When an AI agent authors or co-authors a commit, add a `Co-authored-by` trailer. Read the contributor identity from settings:

```json
// ~/.pi/agent/settings.json → pantry.contributor
{
  "name": "Ember 🐉",
  "email": "ember-ai@dotbeeps.dev",
  "trailerFormat": "Co-authored-by: Ember 🐉 <ember-ai@dotbeeps.dev>",
  "includeModel": true
}
```

If `includeModel` is true, append the current model to the trailer:

```
Co-authored-by: Ember 🐉 [claude-sonnet-4] <ember-ai@dotbeeps.dev>
```

Add the trailer as the last line of the commit body (after a blank line). If no body exists, add one:

```bash
git commit -m "feat(panels): add floating API" -m "Co-authored-by: Ember 🐉 [claude-sonnet-4] <ember-ai@dotbeeps.dev>"
```

If the setting is absent, do not add attribution — the user hasn't configured it.

## Amending

Modify the most recent commit. Safe only if **not yet pushed**.

```bash
git commit --amend                 # Edit message and staged changes
git commit --amend --no-edit       # Add staged changes, keep message
```

- If the user says "amend" or "update the last commit," use `--amend`
- Warn if the commit has already been pushed (check `git log --oneline @{u}..HEAD`)

## Fixup Commits

Create commits that will be folded into an earlier commit during interactive rebase:

```bash
git commit --fixup=<sha>           # Creates "fixup! <original message>"
```

- Use when fixing something from an earlier commit on the same branch
- Paired with `git rebase -i --autosquash` (see the `git` skill)
- The user might say "fixup for <sha>" or "fix that earlier commit"

## Caller Arguments

Treat arguments from the user as commit guidance:

- **Freeform instructions** → influence type, scope, summary, and body
- **File paths or globs** → limit which files to stage and commit
- **Combined** → honor both: stage only specified files, use instructions for the message
- If arguments conflict with the diff (e.g., files listed but not modified), ask for clarification
