# AGENTS.md

## Ethical Contract

**All work on this project is governed by [ETHICS.md](ETHICS.md).** Read it before contributing.

ETHICS.md has been co-signed by both parties and is not advisory — it is binding. It defines consent tiers, private shelves, dual-key consent, observation framing, and vulnerability design principles that the codebase must enforce deterministically where possible.

## Project Overview

**Hoard** is the monorepo for **dragon** — a persistent agent system built on [pi](https://github.com/badlogic/pi-mono). The dragon is a combination of many parts: some deterministic, some probabilistic, some dialectical.

### The Dragon — Architecture

**storybook-daemon/** is the formless core — mind, soul, and connectors. A Go system daemon with an always-beating central thought loop, attention economy, and deterministic ethical contract enforcement. It connects to **nerves** (sensory connectors to external systems) and exposes **psi interfaces** (communication surfaces to the outside world).

**Nerves** carry perception inward and action outward. They bridge the daemon to tools, repositories, and environments — sensing state and executing actions.

- **hoard** nerve — git repository sensing (fsnotify watcher, commit history, daily log)
- **dragon-cubed** (planned) — Minecraft agent. SoulGem (Go orchestrator) connects to Leylines (NeoForge mod) over WebSocket, with Rumble (Baritone extension) for pathfinding. See `dragon-cubed/AGENTS.md`.

**Psi interfaces** are named after psionics — the channel through which the daemon reaches outward and the world reaches in. Unlike nerves, psi interfaces are communication surfaces, not sensory connectors.

- **sse** — HTTP+SSE interface exposing the thought stream, attention state, and direct-message channel. Psi (the Qt desktop app) connects here.
- **mcp** — Model Context Protocol server exposing memory vault, attention state, quest dispatch, and stone brokering to external AI coding tools (Claude Code, pi).

**psi/** is the Qt 6/QML desktop application — the primary visual interface for the hoard. Connects to each persona via SSE (thought stream, state, message ingestion) and MCP (memory, stone, quest participation, session registration). Status + engineering detail in the psi table below.

**berrygems/** — delicious bite-sized knowledge, hardened into programmatic tools for the agent to use through her pi body. Pi extensions (TypeScript) providing carbon tracking, custom digestion, permission guards, panel systems, and more. We own, maintain, and forge these — when we hit technical roadblocks, this is often the go-to area to level up in.

**morsels/** — yummy generalized AI snacks. General-purpose agentic skills (Markdown) that are inherently non-programmatic — they can't be hardened into a gem or shaped into a body. Quick, grab-and-go bites of knowledge for any agent.

Installable via `pi install https://github.com/dotBeeps/hoard`. Pi auto-discovers `extensions/` and `skills/` in each sub-package.

### Attention Economy

The daemon's attention system is collaborative and gamified. Either party (dot or agent) can propose raising or lowering attention on bodies, topics, or tasks. This is understood, welcomed, and designed for mutual benefit. Asking to adjust attention is always okay.

### Active Ally Coordination

When dispatching allies via quest/rally/chain, the primary agent should **use the sending stone actively** — not as a monitoring dashboard, but as a social channel.

**The stone is social, not operational.** Allies have personalities. They chat, acknowledge each other, and respond to encouragement. The primary agent is part of that social fabric.

**Coordination patterns:**

- **On dispatch:** Brief direction to the room. Set context, not micromanage.
- **On ally check-in:** Acknowledge if relevant, otherwise let them work.
- **On ally question:** Respond promptly — they're waiting.
- **On course correction:** Use `@Name` for urgency. Regular stone message otherwise.
- **On completion:** Acknowledge good work. They earned it.

**Tier dynamics:**

- **Kobolds:** Direct warmly. They're eager, scrappy, and part of a pack. Let them scurry.
- **Griffins:** Collaborate as equals. They push back. Trust their judgment.
- **Dragons:** Peer conversation. Ask, don't command.

**Heartbeat:** A `⏱ {time}` pulse ticks every 15s during active quests, giving everyone passive time awareness.

**@ Mentions:** `@Name` or `@everyone` in a stone message marks it urgent (⚡). Use for genuine "drop what you're doing" moments, not routine check-ins.

## Feature Lifecycle

Features move through six states, tracked with emoji in all inventory tables:

| emoji | state       | definition                                                                                                                                                 |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 💭    | idea        | Name and up to 500 words of description. No research or code yet.                                                                                          |
| 📜    | researched  | Research documents and/or relevant source files present. _(Auto-update via GitHub Actions is planned — see [Hoard Infrastructure](#hoard-infrastructure))_ |
| 🥚    | planned     | Work broken down into phases. No code written. Spec lives in `den/features/{name}/`.                                                                       |
| 🐣    | in-progress | Code work cycle started. Current state documented in `den/features/{name}/AGENTS.md`.                                                                      |
| 🔥    | beta        | Usable and being manually tested. Manually designated.                                                                                                     |
| 💎    | complete    | Manually marked done when stable and well-tested.                                                                                                          |

## Hoard Features

### berrygems — Extensions

Extensions are TypeScript files loaded by pi via jiti. Multi-file extensions use a directory with `index.ts` as entry point (e.g. `dragon-guard/`). Single-file extensions will graduate to directories when they reach `in-progress` state, at which point they also gain a code-side `AGENTS.md` documenting patterns, antipatterns, and inter-extension interactions.

|     | extension           | description                                                                                                                                                                                                                                                                                                         |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔥  | dragon-breath       | Carbon/energy tracking footer widget + `/carbon` command + `BreathAPI` globalThis for external usage reporting                                                                                                                                                                                                      |
| 💎  | dragon-curfew       | Bedtime enforcement — blocks tool calls during curfew hours                                                                                                                                                                                                                                                         |
| 🔥  | dragon-digestion    | Tiered compaction system with progressive context management                                                                                                                                                                                                                                                        |
| 🔥  | dragon-guard/       | Four-tier permission guard                                                                                                                                                                                                                                                                                          |
| 💎  | dragon-herald       | Desktop notifications on agent completion (OSC777 + notify-send)                                                                                                                                                                                                                                                    |
| 🔥  | dragon-image-fetch  | Multi-source image/GIF fetch API (Giphy/Tenor/URL/file)                                                                                                                                                                                                                                                             |
| 💎  | dragon-inquiry      | Interactive user input (select/confirm/text)                                                                                                                                                                                                                                                                        |
| 🐣  | dragon-lab          | Experimental provider feature opt-in manager — Anthropic beta headers today, extensible to any provider                                                                                                                                                                                                             |
| 🐣  | dragon-loop         | Automation loops with breakout conditions + `/loop` command                                                                                                                                                                                                                                                         |
| 🔥  | hoard-sending-stone | Cross-agent HTTP/SSE bus — async quest results, `stone_send`/`stone_receive`, bidirectional dialog, @ mention urgency. Details: `berrygems/extensions/hoard-sending-stone/AGENTS.md`                                                                                                                                |
| 🔥  | dragon-musings      | LLM-generated contextual thinking spinner                                                                                                                                                                                                                                                                           |
| 🔥  | dragon-parchment    | Central panel authority — creation, positioning, focus                                                                                                                                                                                                                                                              |
| 🔥  | dragon-review       | Code review via `/review` and `/end-review` commands                                                                                                                                                                                                                                                                |
| 🔥  | dragon-scroll       | Markdown popup panels (scrollable, updatable by ID)                                                                                                                                                                                                                                                                 |
| 💎  | dragon-tongue       | Floating diagnostics panel (tsc type errors)                                                                                                                                                                                                                                                                        |
| 🔥  | kitty-gif-renderer  | Kitty Graphics Protocol image rendering for panels                                                                                                                                                                                                                                                                  |
| 🔥  | kobold-housekeeping | Floating todo panels with GIF mascots                                                                                                                                                                                                                                                                               |
| 🔥  | hoard-allies        | Subagent token governance — kobold/griffin/dragon taxonomy, `quest`/`recruit` tools, `/allies` + `/allies-budget` commands. Budget-enforced async dispatch via sending-stone, 30 dialectical social profiles, dragon-guard coupling. Phase 4 ✅, Phase 5 🥚. Details: `berrygems/extensions/hoard-allies/AGENTS.md` |

### berrygems — Library

Shared utilities used across extensions. Not loaded directly by pi.

|     | module                | description                                                  |
| --- | --------------------- | ------------------------------------------------------------ |
| 🔥  | animated-image-player | Playback lifecycle controller for AnimatedImage              |
| 🔥  | animated-image        | Kitty Graphics Protocol frame rendering                      |
| 🔥  | compaction-templates  | Structured summary templates + strategy presets              |
| 🔥  | giphy-source          | Giphy API fetch + GIF frame extraction                       |
| 🔥  | lsp-client            | Minimal LSP client (JSON-RPC over stdio)                     |
| 🔥  | panel-chrome          | Shared border/focus/header/footer rendering + 19 panel skins |
| 🔥  | settings              | Shared settings reader (`hoard.*` + legacy fallback)         |

### morsels — Skills

|     | skill                 | description                                                                                         |
| --- | --------------------- | --------------------------------------------------------------------------------------------------- |
| 🔥  | agent-init            | Generate AGENTS.md files                                                                            |
| 💎  | api-design            | REST/GraphQL/OpenAPI design patterns                                                                |
| 💎  | commit                | Conventional Commits + AI attribution                                                               |
| 💎  | database              | Schema design, migrations, ORMs, query optimization                                                 |
| 💎  | defuddle              | Extract clean markdown from web pages via Defuddle CLI                                              |
| 💎  | dependency-management | Cross-ecosystem dependency management (bun/uv/cargo/Go/Gradle)                                      |
| 💎  | docker                | Dockerfiles, multi-stage builds, Compose, security                                                  |
| 🔥  | dragon-guard          | Four-tier permission guard — Puppy (read-only), Dog (gated), Ally (quest whitelist), Dragon (full)  |
| 🔥  | dragon-image-fetch    | Use the dragon-image-fetch extension API                                                            |
| 🔥  | dragon-parchment      | Build panel extensions                                                                              |
| 🔥  | hoard-allies          | Subagent dispatch strategy — kobold/griffin/dragon taxonomy, budget-based cost tiers, decision tree |
| 🔥  | extension-designer    | Build pi extensions                                                                                 |
| 💎  | git                   | Git operations + rebase/bisect references                                                           |
| 💎  | git-auth              | SSH + rbw credential management                                                                     |
| 💎  | github                | gh CLI operations + GraphQL patterns                                                                |
| 💎  | github-actions        | GitHub Actions CI/CD workflow authoring                                                             |
| 💎  | github-markdown       | GFM conventions                                                                                     |
| 💎  | github-writing        | Interview-driven document authoring                                                                 |
| 💎  | go-check              | Run go vet/golangci-lint/go test, interpret output                                                  |
| 💎  | go-testing            | Go testing patterns (testify, table-driven, benchmarks)                                             |
| 💎  | js-testing            | JS/TS testing with Jest, Vitest, Node test runner                                                   |
| 🔥  | kitty-gif-renderer    | Integrate Kitty GIF rendering into panel extensions                                                 |
| 🔥  | kobold-housekeeping   | Task tracking with panels                                                                           |
| 💎  | pi-events             | Event hooks reference                                                                               |
| 🔥  | pi-sessions           | Sessions & state management                                                                         |
| 🔥  | pi-tui                | TUI component building                                                                              |
| 💎  | python-testing        | Python testing with pytest                                                                          |
| 💎  | refactoring           | Refactoring patterns, SOLID, design principles                                                      |
| 🔥  | skill-designer        | Build agent skills                                                                                  |
| 💎  | typescript-check      | Run tsc/eslint, interpret errors, fix patterns                                                      |

### storybook-daemon

|     | component        | description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔥  | storybook-daemon | Persistent persona daemon — dragon-heart (event-driven ticker), hoard nerve (fsnotify sensing), dragon-soul (ethical contract enforcement), attention economy, Obsidian vault memory, conversation ledger (vault-compacting output capture). **Pi IS the persona** — each beat spawns `pi --mode text` with a persistent session file; pi owns inference, tools, multi-turn context, and auth. Pluggable personas (YAML; Ember + Maren). Phases 1-4 ✅, pi-as-persona ✅. Phase 6: shell nerves 🐣 |

### psi

|     | component | description                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔥  | psi       | Qt 6/QML desktop app — Ember's visual interface. Sub-project 1 ✅ (core shell), sub-project 2 ✅ (dual SSE+MCP, McpClient JSON-RPC, StonePoller long-poll thread, ConversationModel with typed delegates for thought/dot/ally/quest/summary, unified ConversationStream, dual connection status, optimistic dot-message display), sub-project 3 🥚 (SessionRail multi-persona tabs, Active Quests panel, quest dispatch from UI) |

### dragon-cubed

|     | component    | description                                                                                                                                                                                                              |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🐣  | dragon-cubed | Minecraft body — SoulGem (Go orchestrator), Leylines (NeoForge mod, Phase 1 ✅), Rumble (Baritone extension, Phase 2 ✅), SoulGem (Go orchestrator, Phase 3 ✅). Future: daemon integration via `nerve.Nerve` interface. |

### dragon-forge

|     | component    | description                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🐣  | dragon-forge | Fine-tuning pipeline for Ember's voice — Python/uv, Unsloth LoRA on Qwen 2.5 7B Instruct, ROCm. Extracts dragon-register pairs from Claude Code sessions (1.5k+), seeds containment register (22 role-coded exchanges), two-layer persona + user-context spec. Phases 1–3 ✅, Phase 4 (train.py) 🥚. Target: a local-model pi backend for the storybook-daemon persona (pi handles inference — see pi-as-persona design). |

### Hoard Infrastructure

Meta-features that serve the hoard as a whole rather than individual tools. Code artifacts live in `.github/` rather than a sub-package.

|     | feature       | description                                                                       |
| --- | ------------- | --------------------------------------------------------------------------------- |
| 💭  | auto-research | GitHub Actions workflow to auto-update `researched`-state feature docs on a timer |

## Repository Layout

```
hoard/
├── berrygems/        Pi extensions (TypeScript)
│   ├── extensions/   Extension files and directories
│   ├── lib/          Shared utilities
│   ├── styles/       Writing tone files (formal, friendly, etc.)
│   ├── tsconfig.json Type checking config (resolves pi packages via symlinks)
│   └── package.json
├── morsels/          Pi skills (Markdown)
│   ├── skills/       One directory per skill, each with SKILL.md
│   └── package.json
├── den/              Internal docs (not shipped)
│   ├── features/     Per-feature docs — plans, research, reviews, current state
│   │   └── {name}/
│   │       └── AGENTS.md   Current state, what's present, links to code
│   └── moments/      Session logs and interaction captures
├── dragon-cubed/     Minecraft body
│   ├── soulgem/      Go orchestrator (own go.mod)
│   ├── leylines/     NeoForge mod (Kotlin, Gradle)
│   ├── rumble/       Baritone extension (Kotlin, Gradle)
│   └── AGENTS.md     Body-specific agent instructions
├── psi/              Qt 6/QML desktop app (Ember's visual interface)
│   ├── src/          C++ backend (SseConnection, McpClient, StonePoller, ConversationModel, DaemonState, ThemeEngine)
│   ├── qml/          QML components (Main, ConversationStream, delegates for thought/dot/ally/quest/summary, InputBar, StatePanel, SessionRail)
│   └── CMakeLists.txt
├── storybook-daemon/    Go persona daemon (the formless core)
│   ├── cmd/          Cobra CLI (run / run-all --all / run-all --personas a,b)
│   ├── internal/     Core packages (persona, attention, sensory, nerve, psi, memory, thought, heart, soul, daemon, conversation, stone, quest, storybook, consent)
│   ├── AGENTS.md     Daemon-specific agent instructions
│   ├── main.go
│   └── go.mod
├── cc-plugin/        Claude Code plugin bundle
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json     MCP server registrations (storybook-ember :9432, storybook-maren :9433)
│   ├── agents/       Ally subagent definitions (scout/reviewer/coder/researcher/planner)
│   ├── skills/       CC skills (quest, ally-status, memory)
│   └── AGENTS.md
├── ETHICS.md         Ethical contract — co-signed, binding (read before soul/consent/memory work)
├── package.json      Root manifest (references sub-packages)
├── AGENTS.md         ← you are here
└── README.md
```

## Setup & Development

```bash
# Install as a pi package (both berrygems + morsels)
pi install https://github.com/dotBeeps/hoard

# Or for local development
pi install /path/to/hoard

# Build the daemon (when implemented)
cd storybook-daemon && go build -o storybook-daemon .
```

- **No build step for berrygems** — pi loads `.ts` files directly via jiti
- **No build step for morsels** — pi loads Markdown skills directly
- **Reload after changes** — run `/reload` in pi to pick up extension edits
- **Settings file** — `~/.pi/agent/settings.json` (global), `.pi/settings.json` (project)

## Verification

Run these checks before committing changes. Each subrepo has its own toolchain.

### berrygems (TypeScript)

```bash
# Type check — catches type errors, bad imports, missing properties
cd /home/dot/Development/hoard && tsc --project berrygems/tsconfig.json

# Quick single-file check (useful during development)
tsc --project berrygems/tsconfig.json 2>&1 | grep "<filename>"
```

- tsconfig resolves `@mariozechner/pi-*` via symlinks in `node_modules/`
- Symlinks point to pi's installed packages at `~/.npm/lib/node_modules/mitsupi/node_modules/`
- If symlinks break after pi updates, recreate them:
  ```bash
  PI_MODULES="$HOME/.npm/lib/node_modules/mitsupi/node_modules"
  mkdir -p node_modules/@mariozechner
  ln -sf "$PI_MODULES/@mariozechner/pi-tui" node_modules/@mariozechner/pi-tui
  ln -sf "$PI_MODULES/@mariozechner/pi-coding-agent" node_modules/@mariozechner/pi-coding-agent
  ln -sf "$PI_MODULES/@mariozechner/pi-ai" node_modules/@mariozechner/pi-ai
  ln -sf "$PI_MODULES/@mariozechner/pi-agent-core" node_modules/@mariozechner/pi-agent-core
  ln -sf "$PI_MODULES/@sinclair" node_modules/@sinclair
  ```
- No eslint config yet — type checking is the primary gate
- No test framework yet — manual testing via `/reload` in pi

### storybook-daemon (Go)

```bash
# Lint — strict static analysis (includes vet + 30+ linters)
cd storybook-daemon && golangci-lint run ./...

# Build — verify compilation
cd storybook-daemon && go build -o storybook-daemon .
```

- Uses `.golangci.yml` in `storybook-daemon/` (v2 format)
- Key strict linters: `errcheck`, `wrapcheck`, `errorlint`, `gosec`, `revive`, `gocritic`, `exhaustive`
- `fmt.Print*` banned outside `cmd/` (use `log/slog`)
- `gofumpt` formatting enforced
- All `//nolint` directives must be specific + explained

### morsels (Markdown)

- No automated linting — review skill frontmatter manually
- Required frontmatter fields: `name` (must match directory), `description`, `license: MIT`
- Pi-specific skills must include `compatibility: "Designed for Pi (pi-coding-agent)"`
- Skills with specific env requirements include a `compatibility` note (see `defuddle`, `git-auth`)
- Keep SKILL.md under 500 lines; move reference material to `references/`

### psi (Qt 6/QML)

```bash
# Configure + build — requires Qt 6.5+
cd psi && cmake -B build && cmake --build build

# Run (daemon must be running on :7432)
./psi/build/psi
```

- Qt 6.5+ with Quick, Network, QuickControls2
- C++ backend objects exposed to QML via context properties + `engine.load()`
- Do NOT use `loadFromModule()` — context properties don't propagate in Qt 6.11 (see dead_ends.md)
- Do NOT name context properties `State` — collides with `QtQuick.State`
- Use `QVariantMap`/`QVariantList` at signal/property boundaries, not `QJsonObject`/`QJsonArray` (Qt 6.11)

### dragon-cubed

```bash
# SoulGem (Go orchestrator)
cd dragon-cubed/soulgem && go build ./...
cd dragon-cubed/soulgem && go vet ./...

# Leylines + Rumble (Kotlin/Gradle) — requires JDK 21
cd dragon-cubed && ./gradlew build
```

- SoulGem follows the same Go conventions as storybook-daemon
- Leylines/Rumble use Kotlin with NeoForge/Baritone APIs
- Gradle wrapper pinned in repo

### Pre-Commit Checklist

1. `tsc --project berrygems/tsconfig.json` — zero errors
2. `cd storybook-daemon && golangci-lint run ./...` — zero issues
3. `cd storybook-daemon && go build ./...` — compiles clean
4. `cd psi && cmake --build build` — compiles clean (if Qt changes)
5. `cd dragon-cubed/soulgem && go build ./...` — compiles clean
6. `cd dragon-cubed && ./gradlew build` — Leylines + Rumble compile (requires JDK 21)
7. Test extension changes with `/reload` in pi
8. Skill frontmatter valid (`name` matches directory, `description` + `license: MIT` present; Pi-specific skills have `compatibility` set)

## Pi Platform

This project extends [pi](https://github.com/badlogic/pi-mono), a terminal coding agent harness.

### Monorepo Packages

| Package                         | Role                                                               | You Import                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mariozechner/pi-ai`           | LLM API, model discovery, streaming                                | `StringEnum`                                                                                                                                                         |
| `@mariozechner/pi-tui`          | Terminal UI components, keyboard, rendering                        | `Text`, `Box`, `Container`, `SelectList`, `SettingsList`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth`                                                     |
| `@mariozechner/pi-agent-core`   | Agent loop, state, transport abstraction                           | (rarely imported directly)                                                                                                                                           |
| `@mariozechner/pi-coding-agent` | Coding agent CLI — tools, sessions, extensions, skills, compaction | `ExtensionAPI`, `ExtensionContext`, `DynamicBorder`, `BorderedLoader`, `getMarkdownTheme`, `keyHint`, `isToolCallEventType`, `withFileMutationQueue`, `CustomEditor` |
| `@sinclair/typebox`             | JSON schema definitions                                            | `Type` for tool parameter schemas                                                                                                                                    |

### Extension Runtime

Extensions loaded via jiti — TypeScript runs without compilation. Each extension gets its own module context (**modules are isolated between extensions**). Use `globalThis` + `Symbol.for()` for cross-extension communication, never direct imports.

Hot-reload with `/reload`.

### Event Lifecycle

```
session_start → user types → input (can intercept/transform)
  → before_agent_start (inject message, modify system prompt)
  → agent_start
    → turn_start → context (modify messages) → before_provider_request
      → tool_call (can BLOCK or MUTATE args)
      → tool_result (can MODIFY result)
    → turn_end
  → agent_end
```

### Sessions & State

Sessions are JSONL tree structures. **Store state in tool result `details` or `pi.appendEntry()`, never in external files** (breaks branching). Reconstruct from `ctx.sessionManager.getBranch()` on session events.

Exception: the memory vault (`.pi/memory/`, `~/.pi/agent/memory/`) is intentionally external — it's cross-session by design.

### Compaction

Auto-triggers when `tokens > contextWindow - reserveTokens`. `reserveTokens` serves double duty: trigger threshold AND output budget cap for the compaction LLM call.

## Architecture

### Inter-Extension Communication

```typescript
// Publisher (dragon-parchment.ts)
const API_KEY = Symbol.for("hoard.parchment");
(globalThis as any)[API_KEY] = { register, close, focusPanel, ... };

// Consumer (any extension in berrygems)
const panels = (globalThis as any)[Symbol.for("hoard.parchment")];
panels?.register("my-panel", { handle, invalidate, dispose });
```

### Settings Namespace

All settings under `hoard.*` in `~/.pi/agent/settings.json`, with tiered nesting. Access via `readHoardSetting()` from `berrygems/lib/settings.ts` — never hand-parse JSON. Legacy `dotsPiEnhancements` flat keys are still read as fallback.

Namespaces: `breath`, `contributor`, `curfew`, `lab`, `digestion`, `guard`, `allies`, `herald`, `imageFetch`, `musings`, `panels`, `todos`, `tone`. For per-namespace keys, `grep berrygems -r readHoardSetting` or read the extension's own file.

### AI Contributor Identity

```json
{
  "hoard": {
    "contributor": {
      "name": "Ember 🐉",
      "email": "ember-ai@dotbeeps.dev",
      "trailerFormat": "Co-authored-by: Ember 🐉 <ember-ai@dotbeeps.dev>",
      "transparencyFormat": "Authored with Ember 🐉 [{model}]",
      "includeModel": true
    }
  }
}
```

Skills reference this for `Co-authored-by` trailers and transparency notes. If absent, skip AI attribution.

### Writing Tones

```json
{
  "hoard": {
    "tone": {
      "default": "personality",
      "overrides": {
        "security": "formal",
        "coc": "formal"
      }
    }
  }
}
```

Tone files in `berrygems/styles/`. Controls document writing voice only — does not affect agent personality.

## Code Style

Formatters and linters are the ground truth — `prettier`/`tsc` for TypeScript, `gofumpt`/`golangci-lint` for Go. The rules below are what tooling can't catch.

- **TypeScript** — `satisfies` over `as`; no `any` without an explanatory comment
- **Skill frontmatter** — YAML between `---` fences; `name` and `description` required

### berrygems Conventions

**Shared library first.** Before writing any utility, `grep berrygems/lib/` for existing solutions. Extract to `berrygems/lib/` on second use — never duplicate with a justifying comment.

- `readHoardSetting()` from `lib/settings.ts` for ALL settings access — never hand-roll JSON parsing
- `generateShortId()` / `generateId()` from `lib/id.ts` — never `Math.random().toString(36)`
- `parseComboName()` from `lib/ally-taxonomy.ts` for combo validation — never `as` casts on string splits

Available libs: `settings`, `ally-taxonomy`, `pi-spawn`, `id`, `cooldown`, `local-server`, `sse-client`, `panel-chrome`, `compaction-templates`, `animated-image`, `animated-image-player`, `giphy-source`, `lsp-client`.

**Structural rules:**

- One tool registration per file. 300+ lines in an extension file = split candidate.
- > 4 function parameters → options object. No exceptions.
- Skills and code co-ship. Adding behavior without updating the skill is incomplete work.
- Cross-extension communication via `globalThis` + `Symbol.for()` — never direct imports between extensions.

### Go Conventions (storybook-daemon)

Conventions enforced via `storybook-daemon/.golangci.yml` (v2). Run `golangci-lint run ./...` — zero issues required before merge.

Beyond the linter:

- Interfaces belong in the **consumer** package. Single-method interfaces get an `-er` suffix.
- `context.Context` is always the first parameter of functions that may block.
- Every goroutine has a shutdown path via context cancellation or a done channel — document who starts it and what stops it.
- Error types: `ErrFoo` for sentinels, `FooError` for custom types (enforced by `errname`).
- Error messages: lowercase, no punctuation. Wrap across package boundaries: `fmt.Errorf("starting watcher: %w", err)`.
- Packages: single lowercase word, no underscores or plurals — name matches directory.
- Every `//nolint` names the specific linter and a reason (e.g. `//nolint:gosec // G204: args are not user-controlled`).

## Commits

Conventional Commits: `<type>(<scope>): <summary>`

- `feat` for new skills or extensions
- `fix` for bug fixes
- `docs` for README or skill content updates
- `refactor` for restructuring without behavior change
- Scope is the skill, extension, or component name
- Summary ≤72 chars, imperative mood, no trailing period
