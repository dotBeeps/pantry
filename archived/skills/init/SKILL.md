---
name: init
description: "Initialize the current project — generate or update CLAUDE.md, load stack conventions, and orient. Use when entering an existing project for the first time or when the user says /init. For fresh empty directories use kickstart instead."
license: MIT
---

# /init

Initialize the current project — generate or update CLAUDE.md, load stack conventions, and orient.

This skill replaces the built-in `/init` command and extends it with stack convention loading.

## Steps

### 1 — Fetch stacks

Execute the `/fetch-stacks` skill with no arguments to auto-detect and load all applicable stack convention files for this project.

### 2 — Analyze the codebase

Use an Explore agent (or do it yourself if the project is small) to discover:

- **Build system**: Look for `package.json`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle(.kts)`, `Makefile`, `CMakeLists.txt`, `project.godot`, `pyproject.toml`, etc.
- **Build commands**: Extract from the build config (e.g., `npm run build`, `go build ./...`, `cargo build`, `mvn compile`, `./gradlew build`)
- **Test commands**: Extract from the build config (e.g., `npm test`, `go test ./...`, `cargo test`, `./gradlew test`)
- **Lint/format commands**: Extract from configs or scripts (e.g., `npm run lint`, `golangci-lint run`, `cargo clippy`)
- **Project structure**: Note key directories, entry points, and architectural patterns
- **Coding conventions**: Infer from existing code — naming style, error handling patterns, module layout

Keep the exploration focused — don't read every file, just enough to understand the project shape.

### 3 — Generate or update CLAUDE.md

Check if `CLAUDE.md` exists at the project root or in `.claude/CLAUDE.md`.

**If no CLAUDE.md exists**, create one at the project root with:

```markdown
# Project Name

Brief one-line description of what this project is.

## Build & Test

- **Build**: `<discovered build command>`
- **Test**: `<discovered test command>`
- **Lint**: `<discovered lint command>` (if applicable)

## Project Structure

<Brief description of key directories and their purpose>

## Conventions

<Any conventions inferred from the code — naming, patterns, architecture notes>
```

**If CLAUDE.md already exists**, read it and propose improvements:

- Add any missing build/test/lint commands that were discovered
- Fill in missing sections
- Don't remove or rewrite existing content — only append or suggest changes
- Present the diff and ask for approval before writing

### 4 — Quick orient

After stacks are loaded and CLAUDE.md is handled, give a brief lay of the land:

- List which stack rules were loaded
- Summarize what was written to or updated in CLAUDE.md
- Run `git log --oneline -5` to show recent momentum (skip if not a git repo)

Keep the output compact — this is a fast startup, not a deep dive. If the user wants more context they can run `/kickstart`.

## Rules

- **Non-destructive**: Never overwrite existing CLAUDE.md content. Enhance it.
- **Ask before writing**: If CLAUDE.md already exists, show the proposed changes and get approval before editing.
- **No fluff in CLAUDE.md**: Keep it dense and useful. No boilerplate, no "this file was auto-generated" disclaimers.
- **Respect existing structure**: If the project already has a well-structured CLAUDE.md, don't reorganize it — just fill gaps.
- **Skip what's obvious**: Don't document things that are standard for the detected stack (e.g., don't explain what `go test` does in a Go project).
