---
name: research-and-fix
description: "Deep-research a bug using parallel sub-agents, then fix it with opus collaboration. Use when /fix alone isn't enough — root cause unclear, bug spans multiple systems, or prior fix attempts failed."
license: MIT
---

# /research-and-fix

Deep-research a bug using a fleet of sub-agents, then fix it with opus collaboration. Use this when `/fix` alone isn't enough — root cause is unclear, the bug spans multiple systems, or prior fix attempts have failed.

## Phase 1 — Parallel Research (spawn all at once)

Spawn these sub-agents simultaneously:

**Agent A — Project History** (`model: haiku`, max 10 tool calls)

- `git log --oneline -30` to identify relevant commits
- `git log --all --oneline --grep="<keyword>"` for bug-related commits
- `git blame` on the most suspect files
- Return: timeline of relevant changes, last known-good commit, any prior fix attempts visible in history

**Agent B — Current State** (`model: sonnet`, max 15 tool calls)

- Read the files most likely involved in the bug
- Run `go test ./... 2>&1` and capture failure output
- Grep for related error strings, TODOs, or FIXME comments in affected packages
- Return: current failure signatures, affected code paths, data flow from entry point to failure site

Wait for both to complete before Phase 2.

## Phase 2 — Lateral Research (spawn 1-3 based on complexity)

Based on Phase 1 findings, spawn targeted haiku agents (`model: haiku`, max 8 tool calls each) for any that apply:

- **Library docs agent**: Fetch current docs for the relevant Charm/BubbleTea/lipgloss API via Context7 MCP if the bug touches rendering, layout, or animation
- **Similar issues agent**: Search the codebase for analogous patterns that work correctly — grep for similar function signatures, look at how adjacent screens handle the same concern
- **Test patterns agent**: Read existing passing tests in affected packages to understand what invariants are currently tested and what's missing

## Phase 3 — Fix with Opus

Synthesize all findings into a 3-sentence root cause summary. Then pair with an opus sub-agent (`model: opus`, max 25 tool calls) and follow the `/fix` skill pattern exactly:

1. Write a failing test that reproduces the bug
2. Implement the fix — minimum code, no surrounding refactor
3. Run `go build ./...` then `go test ./...` — both must pass
4. Max 3 fix attempts; on failure revert and report findings

## Rules

- Never skip Phase 1 — the history agent catches regression sources that code-reading misses
- Spawn Phase 2 agents only for concerns actually surfaced in Phase 1, not speculatively
- The main agent synthesizes and directs; sub-agents research and report — don't let sub-agents write code
- All sub-agent findings must be summarized before the opus fix agent starts

## When not to use

- Root cause is already obvious — use `/fix` instead; multi-agent orchestration is overhead.
- Typo or one-line fix — just edit it.
- Bug is in code you just wrote this session — context is already loaded; skip the research fleet.
- No failing reproduction exists yet — get a failing test first, then decide if research is warranted.
- Exploring a codebase for understanding (not fixing a bug) — use codebase-memory or Grep.
