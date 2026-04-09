# cc-plugin — AGENTS.md

> **Part of [Hoard](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.

## What This Is

**cc-plugin** is the Claude Code plugin bundle for the hoard ecosystem. It wires storybook-daemon into CC sessions via MCP, provides pre-built ally subagent definitions, and ships skills for quest dispatch and memory access.

## Directory Structure

```
cc-plugin/
  .claude-plugin/
    plugin.json         — Plugin manifest (name, description, version)
  .mcp.json             — MCP server registrations (storybook-ember :9432, storybook-maren :9433)
  agents/
    ally-scout.md       — Recon ally (haiku, read-only: Read/Glob/Grep/Bash)
    ally-reviewer.md    — Review ally (sonnet, read-only: Read/Glob/Grep)
    ally-coder.md       — Implementation ally (sonnet, full: Read/Write/Edit/Glob/Grep/Bash)
    ally-researcher.md  — Research ally (sonnet, read + notes: Read/Glob/Grep/Bash)
    ally-planner.md     — Architecture ally (opus, read + memory: Read/Glob/Grep)
  skills/
    quest/SKILL.md      — Ally dispatch guide (roles, modes, when to use)
    ally-status/SKILL.md — Check daemon state, drain pending stone messages
    memory/SKILL.md     — Search, read, and write persona memory vault
  AGENTS.md             — This file
```

## How It Works

### MCP Integration

`.mcp.json` registers storybook-daemon's MCP bodies as CC MCP servers. When the daemon is running, all tools appear in CC as `mcp__storybook-ember__<tool>`:

- `mcp__storybook-ember__register_session` — announce this CC session to the daemon
- `mcp__storybook-ember__stone_send` — send a message to the room, an ally, or dot
- `mcp__storybook-ember__stone_receive` — poll for incoming messages
- `mcp__storybook-ember__memory_search` / `memory_read` / `memory_write` — vault access
- `mcp__storybook-ember__attention_state` — daemon attention pool status

CC subagents inherit the parent's MCP connections automatically, so dispatched allies get these tools without extra config.

### Ally Agents

Agent definitions live in `agents/`. CC loads them at session start; Claude dispatches them automatically when the task matches the agent's description, or they can be invoked explicitly (`/agent ally-scout`).

Each agent definition includes:

- `model` — tier-appropriate model (haiku/sonnet/opus)
- `allowed-tools` — job-scoped tool list + storybook-ember MCP tools
- `system-prompt` — identity, job rules, mandatory stone_send(type=result) delivery

### Skills

Skills in `skills/` load on demand when Claude decides they're relevant, or when invoked as `/hoard:quest`, `/hoard:ally-status`, `/hoard:memory`. They're reference guides — they don't execute code, but they tell Claude exactly which MCP tool calls to make.

## Relationship to berrygems

berrygems is the Pi extension layer — TypeScript, only works in Pi sessions.
cc-plugin is the Claude Code layer — declarative (JSON + Markdown), only works in CC sessions.

The functional overlap is intentional: both expose the same storybook-daemon capabilities, just through different plugin mechanisms. The daemon is the source of truth; the plugins are adapters.

## Ports

| Persona | MCP Port |
| ------- | -------- |
| Ember   | 9432     |
| Maren   | 9433     |

Ports are set in the persona YAML files (`storybook-daemon/personas/<name>.yaml`, `path: "9432"` under the `mcp` body config).

## Installation

```bash
# Install for all Claude Code sessions
claude install /path/to/hoard/cc-plugin

# Or reference directly in .claude/settings.json:
# { "plugins": ["/path/to/hoard/cc-plugin"] }
```

The daemon must be running before MCP tools become available:

```bash
cd storybook-daemon && go run ./cmd/storybook-daemon run-all --all
```

## Development Notes

- Agent frontmatter `model` uses Claude model IDs — update when upgrading models
- MCP ports must match the persona YAML body config — they're not auto-discovered
- Skills are markdown — no build step, changes take effect on next CC session start
- The `system-prompt` in agent files is the CC equivalent of `CALLING_HOME_SECTION` + job prompt in berrygems — keep them in sync when updating ally behavior
