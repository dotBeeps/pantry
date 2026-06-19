---
name: init-stack
description: "Research best practices for a language or tech stack, generate a conventions file at ~/.claude/<stack>.md, and register a SessionStart hook that auto-copies it into projects. Use when adding support for a new language/framework stack or refreshing an existing one."
license: MIT
---

# /init-stack

Research up-to-date coding best practices for a language or tech stack, generate a conventions file at `~/.claude/<stack>.md`, and register a SessionStart hook that auto-copies it into relevant projects.

## Arguments

`/init-stack <stack>` — e.g. `/init-stack rust`, `/init-stack react`, `/init-stack python`

## Steps

### 1 — Resolve the stack name

Normalize the input to a canonical slug (lowercase, no spaces: `spring boot` → `spring-boot`). Store as `STACK_SLUG`. Determine a human-readable title (e.g. "Rust", "React", "Python").

### 2 - Check current state

1. Read `~/.claude/settings.json` and `~/.claude/<STACK_SLUG>.md` if they exist.
2. If the stack already has a hook and STACK_SLUG file, evaluate how effective the stack instructions are, ensure the file is concise (~100 lines), then only proceed with researching and updating the stack if needed.

### 3 — Research best practices

Use Context7 MCP to fetch current docs and best practices:

1. Call `resolve-library-id` with the stack name and the query "coding best practices conventions idioms"
2. Pick the best match (prefer the official library/language entry)
3. Call `query-docs` with the selected ID and "best practices coding conventions idioms patterns"
4. If Context7 returns no useful results (empty, unrelated, or error), fall back to `WebSearch` with the query: `"<stack> best practices coding conventions <current year>"`

### 4 — Generate the conventions file

Write `~/.claude/<STACK_SLUG>.md` using the research findings. Structure it to match the style of existing convention files (see `~/.claude/go.md` or `~/.claude/typescript.md` for reference):

- H1 title: `# <Title> Conventions`
- Short, opinionated bullet sections (not paragraph prose)
- Sections should cover relevant topics from: Idioms, Style, Structure, Testing, Error Handling, Concurrency, Module/Package layout — only include what's actually relevant to the stack
- Keep it under ~100 lines — dense and useful, not exhaustive
- Do NOT include version numbers or "as of X" caveats — it should stay relevant

### 5 — Determine detection heuristic

Pick the most reliable shell-compatible detection command for the stack. Use the same pattern as existing hooks (a `test -f` or `find ... | grep -q .` that returns 0 if the stack is present). Examples:

- **rust**: `test -f Cargo.toml`
- **python**: `test -f pyproject.toml || test -f requirements.txt || find . -maxdepth 3 -name '*.py' 2>/dev/null | grep -q .`
- **react**: `grep -qs '"react"' package.json 2>/dev/null`
- **vue**: `grep -qs '"vue"' package.json 2>/dev/null`
- **django**: `find . -maxdepth 4 -name 'manage.py' 2>/dev/null | grep -q .`
- **ruby**: `test -f Gemfile`
- **elixir**: `test -f mix.exs`
- **swift**: `test -f Package.swift || find . -maxdepth 2 -name '*.xcodeproj' 2>/dev/null | grep -q .`
- For anything else: use `find . -maxdepth 3 -name '*.<ext>' 2>/dev/null | grep -q .` where `<ext>` is the primary file extension

The full hook command must follow this pattern:

```
(<detection>) && mkdir -p .claude/rules && cp /home/dot/.claude/<STACK_SLUG>.md .claude/rules/<STACK_SLUG>.md 2>/dev/null || true
```

### 6 — Register the hook

Use the `update-config` skill to add the new hook command to the `SessionStart` hooks array in `~/.claude/settings.json`. The new entry goes inside the existing `hooks[0].hooks` array alongside the other SessionStart commands.

If a hook for this stack already exists in settings.json, replace it rather than adding a duplicate.

### 7 — Confirm

Report back with:

- The path of the conventions file written
- A one-line preview of the detection command used
- Confirmation that the hook was registered

## Rules

- Never invent practices not supported by the research — if Context7 and WebSearch both return thin results, say so and write a minimal placeholder with a note
- Keep the conventions file opinionated and brief — not a tutorial
- The detection heuristic must be false-positive-safe: don't copy rust conventions into a project that just happens to have a `.rs` file in a vendor directory
- Do not modify any existing hooks — only append (or replace the matching one)
- If any practices are up to preference, use your AskUserQuestion tool to get the user's
