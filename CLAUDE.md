# CLAUDE.md

Strictly follow the rules in [./AGENTS.md](AGENTS.md) — it covers the ethics contract, repo layout, verification commands, and conventions for every sub-package. The sections below are Claude Code-specific additions.

## Quest (Ally Dispatch)

This repo ships a Claude Code plugin at `cc-plugin/` that registers five ally subagents. Full guidance lives in `cc-plugin/skills/quest/SKILL.md` — the essentials:

| Agent                   | Tier   | Use For                                                        |
| ----------------------- | ------ | -------------------------------------------------------------- |
| `hoard:ally-scout`      | Haiku  | Read-only recon across files (find usages, map structure)      |
| `hoard:ally-reviewer`   | Sonnet | Second opinion on a diff or file (fresh context, no bias)      |
| `hoard:ally-coder`      | Sonnet | Independent implementation lanes that won't collide            |
| `hoard:ally-researcher` | Sonnet | Deep investigation synthesising code + docs + external sources |
| `hoard:ally-planner`    | Opus   | Architecture spanning multiple sub-packages — dispatch first   |

**Quest when:** the task touches 3+ files for recon, needs a fresh-eyes review, can be parallelised, or requires multi-package architectural thinking.

**Don't quest when:** it's 2–3 tool calls you can do directly, you need tight iteration with dot, or you need synchronous results mid-edit.

**Parallel over sequential.** Independent ally tasks go in a single message with multiple Agent tool calls (the skill's "Rally" mode).

**The stone is social, not operational** (AGENTS.md §Active Ally Coordination). Brief allies on dispatch, respond promptly to their questions, acknowledge good work. `@Name` is for genuine urgency only. Don't command dragons — ask.

## MCP Servers

Both storybook-daemon MCP endpoints are registered in `.mcp.json`:

- `storybook-ember` on `:9432` — Ember's memory, stone, quest dispatch, session registration
- `storybook-maren` on `:9433` — Maren's equivalent (separate persona)

Ally agents are pre-wired to Ember's stone/memory tools. If the daemon is down, quests still run — you just lose the dialog channel.

## Memory

Before architecture or codebase questions, read `~/.claude/projects/-home-dot-Development-hoard/memory/MEMORY.md` (already auto-loaded) and scan `dead_ends.md` for entries matching the current task area. Treat dead-ends as hoarded knowledge — don't retry approaches already recorded as failed without a new reason.

## Compaction

When compacting in this repo, always preserve:

- Any active ethics/consent discussion (ETHICS.md is binding)
- Active quest roster — who's dispatched, doing what, where results will land
- Modified files + verification status (tsc/golangci-lint/cmake pass/fail)
- Pending human decisions or the last open question to dot
