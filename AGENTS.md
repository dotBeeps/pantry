# AGENTS.md

## Project Overview

A [pi](https://github.com/badlogic/pi-mono) package containing custom Agent Skills and TUI extensions. Installable via `pi install https://github.com/dotBeeps/dots-pi-enhancements`. No build step — pi loads TypeScript extensions and Markdown skills directly.

## Setup & Development

```bash
# Install as a pi package (symlinks into pi's package registry)
pi install https://github.com/dotBeeps/dots-pi-enhancements

# Or for local development — clone and point pi at the directory
pi install ../../Development/dots-pi-enhancements
```

- **No build step** — pi loads `.ts` files directly via jiti
- **Reload after changes** — run `/reload` in pi to pick up extension edits
- **Settings file** — `~/.pi/agent/settings.json` (global), `.pi/settings.json` (project)

## Repository Structure

```
extensions/                TypeScript pi extensions (loaded by convention)
  ask.ts                   Interactive user input tool (select/confirm/text)
  dots-panels.ts           Central panel authority — creation, positioning, focus, smart placement
  digestion-settings.ts    Compaction tuning panel — trigger modes, strategies, stats, threshold markers
  todo-lists.ts            Floating todo panels with animated GIF mascots
skills/                    Agent Skills — each subdirectory has a SKILL.md
  agent-init/              Generates AGENTS.md files for projects
  commit/                  Conventional Commits — staging, formatting, amend, fixup
  dot-panels/              How to build panel extensions using the dots-panels API
  dots-todos/              Task tracking with tagged todos and floating panels
  extension-designer/      Guides creation of pi extensions (tools, TUI, events)
  git/                     Git conventions — branching, rebase, history surgery, conflicts
  git-auth/                SSH key management, rbw/Bitwarden integration, auth troubleshooting
  github/                  GitHub workflows via gh CLI — PRs, issues, CI, releases, reviews
  github-markdown/         GitHub Flavored Markdown — callouts, task lists, mermaid, tables
  github-writing/          Interview-driven PR/issue drafting with approval gate
  pi-events/               Event hooks — intercept tools, transform input, inject context
  pi-sessions/             Sessions, state management, compaction, branching
  pi-tui/                  TUI component building — overlays, widgets, theming, custom editors
  skill-designer/          Guides creation of new Agent Skills
package.json               pi-package manifest (convention discovery)
```

Pi auto-discovers `extensions/` and `skills/` directories — no manifest paths required.

## Pi Platform

This package extends [pi](https://github.com/badlogic/pi-mono), a terminal coding agent harness. Understanding the platform is essential for working on extensions and skills here.

### Monorepo Packages

Pi is built from layered packages — extensions import from these:

| Package | Role | You Import |
|---|---|---|
| `@mariozechner/pi-ai` | LLM API, model discovery, streaming | `StringEnum` (required for Google-compatible enums) |
| `@mariozechner/pi-tui` | Terminal UI components, keyboard, rendering | `Text`, `Box`, `Container`, `SelectList`, `SettingsList`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth` |
| `@mariozechner/pi-agent-core` | Agent loop, state, transport abstraction | (rarely imported directly) |
| `@mariozechner/pi-coding-agent` | Coding agent CLI — tools, sessions, extensions, skills, compaction | `ExtensionAPI`, `ExtensionContext`, `DynamicBorder`, `BorderedLoader`, `getMarkdownTheme`, `keyHint`, `isToolCallEventType`, `withFileMutationQueue`, `CustomEditor` |
| `@sinclair/typebox` | JSON schema definitions | `Type` for tool parameter schemas |

Dependency chain: `pi-ai` → `pi-agent-core` → `pi-coding-agent` (also depends on `pi-tui`).

### Runtime Modes

Pi runs in four modes. Extensions work in all of them but UI availability varies:

| Mode | Trigger | `ctx.hasUI` | UI Methods |
|---|---|---|---|
| Interactive | default | `true` | Full TUI — dialogs, widgets, overlays |
| RPC | `--mode rpc` | `true` | JSON protocol (host handles rendering) |
| Print | `-p` | `false` | No-op — check `ctx.hasUI` before calling |
| JSON | `--mode json` | `false` | No-op |

### Extension Runtime

Extensions are loaded via [jiti](https://github.com/unjs/jiti) — TypeScript runs without compilation. Each extension gets its own module context, which means **modules are isolated between extensions**. This is why direct imports between extensions cause duplicate state. Use `globalThis` + `Symbol.for()` or `pi.events` instead (see Architecture below).

Hot-reload with `/reload` — picks up extension file changes without restarting pi.

### Event Lifecycle

The full event flow for a user prompt:

```
session_start → user types → input (can intercept/transform)
  → before_agent_start (inject message, modify system prompt)
  → agent_start
    → turn_start → context (modify messages) → before_provider_request
      → tool_execution_start → tool_call (can BLOCK or MUTATE args)
      → tool_execution_update → tool_result (can MODIFY result)
      → tool_execution_end
    → turn_end
  → agent_end
```

Session events: `session_before_compact`/`compact`, `session_before_switch`/`switch`, `session_before_fork`/`fork`, `session_before_tree`/`tree`, `session_shutdown`. Model events: `model_select`.

### TUI Component Contract

Every TUI component implements three methods:

- `render(width: number): string[]` — return lines, each **must not exceed `width`** (use `truncateToWidth`)
- `handleInput?(data: string): void` — keyboard input (use `matchesKey(data, Key.*)` for detection)
- `invalidate(): void` — clear cached render state; rebuild themed content here (theme may change)

Overlays render floating components via `ctx.ui.custom(factory, { overlay: true, overlayOptions })`. Nine anchor positions: `center`, `top-left`, `top-center`, etc.

### Sessions, State & Branching

Sessions are **JSONL tree structures** — entries linked by `id`/`parentId`. `/tree` navigates to any point; all history preserved in one file.

**State management rule:** Store state in tool result `details`, never in external files. Reconstruct from `ctx.sessionManager.getBranch()` on session events (`session_start`, `session_switch`, `session_fork`, `session_tree`). External files break branching — state diverges from the conversation tree.

### Compaction

When context grows too long, compaction summarizes older messages.

- **Auto-trigger:** `tokens > contextWindow - reserveTokens` (default `reserveTokens`: 16384)
- **Manual:** `/compact [custom instructions]`
- **Hooks:** `session_before_compact` (can cancel or provide custom summary), `session_compact` (after completion)
- **`reserveTokens` serves double duty:** it's the trigger threshold AND the output budget cap for the compaction LLM call (0.8 × reserveTokens = max_tokens). See `references/pi-internals.md` in extension-designer for details.
- **`keepRecentTokens`** (default 20000): how many recent tokens to preserve (not summarized)

### Settings System

- **Global:** `~/.pi/agent/settings.json` — applies to all projects
- **Project:** `.pi/settings.json` — overrides global; nested objects merge (not replace)
- Extensions read/write these files directly via `node:fs`
- Compaction config lives under `compaction` key; this package's settings under `dotsPiEnhancements`

### Skills & Packages

**Skills** are on-demand capability packages (Markdown). Pi shows descriptions in the system prompt; agents load the full SKILL.md when relevant. Follow the [Agent Skills standard](https://agentskills.io/specification). Place in `skills/<name>/SKILL.md`.

**Packages** bundle extensions/skills/prompts/themes for distribution. A `pi` key in `package.json` declares resources, or pi auto-discovers from conventional directories. Core pi packages (`pi-ai`, `pi-tui`, etc.) are peer dependencies — never bundle them.

For deep reference, read `/opt/pi-coding-agent/docs/extensions.md`, `tui.md`, `compaction.md`, `session.md`, `settings.md`, `skills.md`, `packages.md`.

## Architecture

### Inter-Extension Communication

Extensions **must not import each other directly** — pi's jiti loader isolates module caches per extension entry point, causing duplicate state and shortcut conflicts.

Instead, use `globalThis` with `Symbol.for()` for shared APIs:

```typescript
// Publisher (dots-panels.ts) — writes API at load time
const API_KEY = Symbol.for("dot.panels");
(globalThis as any)[API_KEY] = { register, close, focusPanel, ... };

// Consumer (any other extension) — reads with fallback
const PANELS_KEY = Symbol.for("dot.panels");
function getPanels(): any { return (globalThis as any)[PANELS_KEY]; }
const panels = getPanels();
panels?.register("my-panel", { handle, invalidate, dispose });
```

`Symbol.for()` returns the same symbol across isolated module contexts — safe for cross-extension singletons.

For event coordination between extensions, use `pi.events`:

```typescript
pi.events.emit("panels:ready");           // Publisher
pi.events.on("panels:ready", () => {});   // Consumer
```

### Settings Namespace

All package settings live under the `dotsPiEnhancements` key in `~/.pi/agent/settings.json`. Each extension documents its own keys — read with a `readSetting(key, fallback)` helper, falling back to defaults.

### Panel Extensions

`dots-panels` is the central panel authority — it owns creation, positioning, smart placement, focus cycling, hotkeys, and TUI capture. Other extensions create panels via `createPanel()` and register through its globalThis API. See the `dot-panels` skill for the full integration guide.

## Adding Skills or Extensions

Use the `skill-designer` and `extension-designer` skills — they cover scaffolding, structure, quality checklists, and best practices.

## Code Style

- **TypeScript** — tabs for indentation, double quotes, semicolons
- **Markdown** — ATX headings (`#`), bullet lists with `-`, fenced code blocks with language tags
- **Skill frontmatter** — YAML between `---` fences, `name` and `description` required

## Commits

Use Conventional Commits: `<type>(<scope>): <summary>`

- `feat` for new skills or extensions
- `fix` for bug fixes
- `docs` for README or skill content updates
- `refactor` for restructuring without behavior change
- Scope is the skill or extension name: `feat(agent-init): add interview step`
- Summary ≤72 chars, imperative mood, no trailing period
- Update `README.md` when adding or removing skills/extensions
