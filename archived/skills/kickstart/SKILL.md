---
name: kickstart
description: "Bootstrap a fresh project from scratch — establish the tech stack, create a SPEC.md, generate CLAUDE.md, and load all convention files. Use for new or early-stage projects needing full setup. For existing projects that just need a refresh, use init instead."
license: MIT
---

# /kickstart

Bootstrap a fresh project from scratch — establish the tech stack, create a spec, generate CLAUDE.md, and load all convention files.

Use this for **new or early-stage projects** that need full setup. For existing projects that just need a session refresh, use `/init` instead.

## Arguments

`/kickstart [description]` — optional free-text description of what the project is or should be. If omitted, infer from whatever exists in the directory.

## Steps

### 1 — Assess the starting point

Determine what already exists:

- Is this an empty directory, a fresh `git init`, or does it have code already?
- Check for `CLAUDE.md`, `.claude/`, `go.mod`, `package.json`, `Cargo.toml`, etc.
- Run `git log --oneline -5` if it's a git repo (skip if not)
- Run `ls -la` to see what's here

Categorize as one of:

- **Empty**: nothing or just a `.git` — full bootstrap needed
- **Skeleton**: has a build config but minimal code — partial bootstrap
- **In-progress**: has real code — enhance what exists

### 2 — Identify the tech stack

**If a description argument was provided**, use it to determine the stack(s). Otherwise, detect from existing files.

For each stack component, determine:

- **Language(s)**: Go, TypeScript, Rust, Python, Java, Kotlin, GDScript, etc.
- **Frameworks**: Bubble Tea, React, Astro, Spring Boot, etc.
- **Build tools**: Make, npm, cargo, gradle, etc.
- **Notable libraries**: anything significant enough to warrant conventions (e.g., Charmbracelet for Go TUI)

If the project is **empty** and no description was given, ask the user what they're building. Use AskUserQuestion with specific options if possible (e.g., "What's the main language? Go / TypeScript / Rust / other?").

### 3 — Create or fetch stack conventions

For each identified stack:

1. **Check if `~/.claude/<stack>.md` already exists** by checking the SessionStart hooks in `~/.claude/settings.json`
2. **If it exists**: execute `/fetch-stacks <stack>` to copy it into `.claude/rules/`
3. **If it doesn't exist**: execute `/init-stack <stack>` to research, generate, and register it — then it's automatically available

Process stacks in dependency order (language first, then framework, then library-specific).

### 4 — Create the project spec

Create a `SPEC.md` at the project root (or update it if one exists). This is the project's north star — what it is, what it does, and how it's structured.

**If the project is empty/skeleton**, ask the user clarifying questions to flesh out the spec. Use AskUserQuestion for each area that can't be inferred:

- What does this project do? (one sentence)
- Who is it for? (CLI users, web users, API consumers, etc.)
- What are the core features? (3–5 bullet points)
- Any constraints or non-goals?

**If the project has existing code**, infer the spec from the codebase and present it for approval.

Write `SPEC.md` with this structure:

```markdown
# <Project Name>

<One-paragraph description of what this project does and why it exists.>

## Goals

- <Core goal 1>
- <Core goal 2>
- <Core goal 3>

## Non-Goals

- <Things explicitly out of scope>

## Architecture

<High-level description of how the project is structured — key modules, data flow, entry points.>

## Tech Stack

| Layer     | Choice      | Why               |
| --------- | ----------- | ----------------- |
| Language  | <lang>      | <brief rationale> |
| Framework | <framework> | <brief rationale> |
| Build     | <tool>      | <brief rationale> |
| Test      | <tool>      | <brief rationale> |

## Key Decisions

<Numbered list of architectural decisions made during kickstart, with brief rationale. This section grows over time.>
```

### 5 — Generate CLAUDE.md

Check if `CLAUDE.md` exists at the project root or `.claude/CLAUDE.md`.

**If it doesn't exist**, create one at the project root:

```markdown
# <Project Name>

<One-line description.>

## Build & Test

- **Build**: `<build command>`
- **Test**: `<test command>`
- **Lint**: `<lint command>`

## Project Structure

<Key directories and their purpose — keep it brief, 5–10 lines max.>

## Conventions

<Any project-specific conventions not covered by stack convention files. Reference the stack files rather than duplicating them.>
```

**If it already exists**, propose enhancements — add missing build/test commands, fill gaps. Show the diff and ask before writing.

### 6 — Initialize project scaffolding (empty/skeleton projects only)

If the project is empty or skeleton and would benefit from scaffolding, ask the user if they want you to create the basic structure. This is opt-in — don't just create files without asking.

Typical scaffolding (varies by stack):

- Entry point file (`main.go`, `src/index.ts`, etc.)
- Build config (`go.mod`, `package.json`, `Cargo.toml`)
- Test directory or first test file
- `.gitignore` appropriate for the stack
- `Makefile` or equivalent task runner if the stack benefits from one

### 7 — Summary

Present a clear summary of everything that was set up:

- **Stacks loaded**: list convention files in `.claude/rules/`
- **New stacks created**: any that went through `/init-stack`
- **Files created/updated**: `SPEC.md`, `CLAUDE.md`, any scaffolding
- **Recommended first action**: one specific imperative ("Implement the main command in `cmd/root.go`", "Set up the router in `src/App.tsx`", etc.)

## Rules

- **Always ask before creating files in an existing project** — never silently scaffold over someone's work
- **Spec is the source of truth** — if `SPEC.md` conflicts with code, flag it; don't silently resolve
- **Don't over-scaffold** — create the minimum viable structure. A `main.go` and `go.mod` is enough; don't generate 10 empty package directories
- **Stack conventions go in `~/.claude/`, not the project** — project-specific rules go in `CLAUDE.md`
- **Non-goals matter** — actively ask about non-goals to prevent scope creep later
- **If unsure about a tech choice, ask** — don't assume the user wants React when they said "frontend"
