---
name: agent-init
description: "Investigate a directory, interview the user, and create or update its AGENTS.md file. Use when initializing a project for AI coding agents, creating AGENTS.md, or setting up agent instructions."
---

# Agent Init

Generate a high-quality `AGENTS.md` file by scanning the project directory and interviewing the user. AGENTS.md is the universal open format for guiding AI coding agents — supported by Codex, Copilot, Cursor, Jules, Aider, Gemini CLI, VS Code, Windsurf, and [many more](https://agents.md).

## Workflow

### 1. Investigate the Directory

Scan the project to determine its purpose, stack, and structure:

```bash
# Directory overview
ls -la
find . -maxdepth 2 -type f | head -80

# Check for existing agent instruction files
cat AGENTS.md 2>/dev/null
cat CLAUDE.md 2>/dev/null
cat .github/copilot-instructions.md 2>/dev/null
cat .cursorrules 2>/dev/null

# Detect stack from config files
cat package.json 2>/dev/null | head -30
cat pyproject.toml 2>/dev/null | head -30
cat go.mod 2>/dev/null | head -10
cat Cargo.toml 2>/dev/null | head -20
cat pom.xml 2>/dev/null | head -20
cat build.gradle* 2>/dev/null | head -20
cat Makefile 2>/dev/null | head -20
cat Dockerfile 2>/dev/null | head -10
cat docker-compose*.yml 2>/dev/null | head -20

# Check for existing docs
cat README.md 2>/dev/null | head -60
cat CONTRIBUTING.md 2>/dev/null | head -40

# Detect CI/CD
ls .github/workflows/ 2>/dev/null
cat .github/workflows/*.yml 2>/dev/null | head -60

# Detect linting/formatting config
ls .eslintrc* .prettierrc* .editorconfig biome.json ruff.toml .ruff.toml pyproject.toml .golangci.yml rustfmt.toml .clang-format 2>/dev/null
```

Record what you find:
- **Project type** — app, library, monorepo, CLI tool, API, static site, etc.
- **Languages & frameworks** — with versions if detectable
- **Build system** — npm/pnpm/yarn, uv/pip, cargo, go, maven/gradle, make, etc.
- **Test framework** — jest, vitest, pytest, go test, cargo test, junit, etc.
- **Linting/formatting** — eslint, prettier, ruff, gofmt, clippy, etc.
- **CI/CD** — GitHub Actions, GitLab CI, etc.
- **Existing agent files** — AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions.md

### 2. Interview the User

Use the `ask` tool to gather preferences the codebase can't tell you. Adapt questions based on what you found in step 1.

**Always ask:**

```
ask({ question: "What's the main thing agents working here should know?",
      mode: "text", placeholder: "e.g., always run tests before committing" })
```

**Ask if not detectable from the codebase:**

- Build/install commands (if no obvious package manager or Makefile)
- Test commands and patterns (if no test config found)
- Code style preferences beyond what linters enforce
- Architecture boundaries or gotchas

**Ask if updating an existing AGENTS.md:**

```
ask({ question: "What should change in the current AGENTS.md?",
      mode: "select", options: [
        { label: "Add missing sections", description: "Keep existing content, fill gaps" },
        { label: "Rewrite from scratch", description: "Start fresh based on current project state" },
        { label: "Update outdated info", description: "Fix commands or conventions that changed" }
      ]})
```

**Ask about optional sections:**

```
ask({ question: "Which extra sections should we include?",
      mode: "select", options: [
        { label: "Standard set", description: "Setup, structure, style, testing, commits" },
        { label: "Comprehensive", description: "Add architecture boundaries, security, deployment" },
        { label: "Minimal", description: "Just setup and testing commands" }
      ]})
```

Keep the interview to **3–5 questions max**. Fill gaps from codebase analysis.

### 3. Generate AGENTS.md

Write the file following these rules:

**Format rules:**
- Plain Markdown — no frontmatter, no special syntax
- H2 sections (`##`), bullets and tables for content
- Target **100–200 lines** — concise and specific
- Commands must be **real and tested** — verify they work before including them
- Be **imperative and concrete** — "Run `npm test` before committing", not "Testing is important"
- Include only what agents can't discover on their own

**Section order** (include what's relevant, skip what's not):

```markdown
# AGENTS.md

## Project Overview
Brief description — what this is, who it's for, what problem it solves.

## Setup
Install commands, prerequisites, environment variables.
Always specify exact commands — agents will run them.

## Development
Build, run, and watch commands. Dev server URLs.
Call out gotchas (e.g., "must run install before build").

## Repository Structure
Key directories and their purpose. Only the important ones.
Use a simple list or compact tree — not exhaustive.

## Code Style
Conventions beyond what linters enforce.
Naming patterns, import ordering, file organization.
Pair rules with rationale — "Prefer X over Y — because Z".

## Testing
How to run tests — full suite and individual.
Test file locations and naming conventions.
Required coverage or patterns (snapshot, integration, etc.).

## Architecture Boundaries
What talks to what. Isolation rules. Import restrictions.
"Never import X from Y" — things that break if violated.

## Commits and PRs
Commit message format. Branch naming. PR checklist.
Any CI checks that must pass.

## Security
Sensitive paths. Auth patterns. What not to log.

## Deployment
How to deploy. Environment differences. Feature flags.
```

**Quality checks before writing:**
- Every command is runnable — no pseudocode, no placeholders agents can't resolve
- No duplicate info from README unless it's agent-critical (build commands count)
- Specific over general — "Use `vitest --run`" not "Run the tests"
- Anti-patterns flagged — "Do NOT run `npm run build` during dev" (from the Codex example)
- Monorepo? Mention if nested AGENTS.md files exist or should be created

### 4. Handle Existing Files

**If AGENTS.md exists:** Show the user what will change with a diff-style summary before overwriting. Respect their update preference from step 2.

**If CLAUDE.md exists without AGENTS.md:** Create AGENTS.md and suggest adding `@AGENTS.md` import to CLAUDE.md so both tools read the same instructions.

**If .cursorrules or copilot-instructions.md exist:** Note their presence in the output. Suggest the user migrate to AGENTS.md as the universal format, or at minimum keep them in sync.

## Cross-Agent Compatibility

AGENTS.md works across the widest ecosystem. For agent-specific files:

| Agent | File | Relationship |
|-------|------|-------------|
| Universal | `AGENTS.md` | The standard — write this first |
| Claude Code | `CLAUDE.md` | Can `@AGENTS.md` to import |
| GitHub Copilot | `.github/copilot-instructions.md` | Separate format, also reads AGENTS.md |
| Cursor | `.cursorrules` | Legacy — Cursor also reads AGENTS.md |
| Gemini CLI | `.gemini/settings.json` | Can point `context.fileName` to AGENTS.md |
| Aider | `.aider.conf.yml` | Add `read: AGENTS.md` |

## Real-World Patterns

Drawn from high-quality AGENTS.md files in production repos:

**OpenAI Codex** — Language-specific coding conventions with links to linter rules. Architecture boundaries ("resist adding code to codex-core"). Detailed test patterns including snapshot testing workflow.

**Apache Airflow** — "Never run pytest directly — always use breeze." Detailed command reference table. Architecture boundaries as numbered rules. Commit message examples (good vs bad).

**Common traits of great AGENTS.md files:**
- Commands are tested and exact
- Architecture boundaries are explicit prohibitions, not suggestions
- Anti-patterns are called out with "Do NOT" or "Never"
- Monorepo-aware — point to subproject-specific files
- Living documents — they mention when to update them
