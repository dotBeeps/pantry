# AGENTS.md

## Ethical Contract

**All work on this project is governed by [ETHICS.md](ETHICS.md).** Read it before contributing.

ETHICS.md has been co-signed by both parties and is not advisory — it is binding. It defines consent tiers, private shelves, dual-key consent, observation framing, and vulnerability design principles that the codebase must enforce deterministically where possible.

## Project Overview

**Hoard** is the monorepo for **dragon** — a persistent agent system built on [pi](https://github.com/badlogic/pi-mono). The dragon is a combination of many parts: some deterministic, some probabilistic, some dialectical.

### The Dragon — Architecture

**dragon-daemon/** is the formless core — mind, soul, and connectors. A Go system daemon with an always-beating central thought loop, attention economy, and deterministic ethical contract enforcement. It connects to **bodies** that give it form in different environments.

**Bodies** are how the daemon interacts with the world. The daemon can either **inhabit** a body (active — the daemon IS the session) or **direct** it (passive — the daemon sends instructions, spawns subagents). This keeps core context clean of working noise.

- **dragon** (pi body) — gives the daemon control of pi instances. Used for research, coding with dot, or anytime she needs access to a berrygem. Can be passive or active depending on what makes sense for core context.
- **dragon-cubed** (Minecraft body) — LLM-controlled Minecraft agent. SoulGem (Go orchestrator) connects to Leylines (NeoForge mod) over WebSocket, with Rumble (Baritone extension) for pathfinding. See `dragon-cubed/AGENTS.md`.

**berrygems/** — delicious bite-sized knowledge, hardened into programmatic tools for the agent to use through her pi body. Pi extensions (TypeScript) providing carbon tracking, custom digestion, permission guards, panel systems, and more. We own, maintain, and forge these — when we hit technical roadblocks, this is often the go-to area to level up in.

**morsels/** — yummy generalized AI snacks. General-purpose agentic skills (Markdown) that are inherently non-programmatic — they can't be hardened into a gem or shaped into a body. Quick, grab-and-go bites of knowledge for any agent.

Installable via `pi install https://github.com/dotBeeps/hoard`. Pi auto-discovers `extensions/` and `skills/` in each sub-package.

### Attention Economy

The daemon's attention system is collaborative and gamified. Either party (dot or agent) can propose raising or lowering attention on bodies, topics, or tasks. This is understood, welcomed, and designed for mutual benefit. Asking to adjust attention is always okay.

## Feature Lifecycle

Features move through six states, tracked with emoji in all inventory tables:

| emoji | state | definition |
|---|---|---|
| 💭 | idea | Name and up to 500 words of description. No research or code yet. |
| 📜 | researched | Research documents and/or relevant source files present. *(Auto-update via GitHub Actions is planned — see [Hoard Infrastructure](#hoard-infrastructure))* |
| 🥚 | planned | Work broken down into phases. No code written. Spec lives in `den/features/{name}/`. |
| 🐣 | in-progress | Code work cycle started. Current state documented in `den/features/{name}/AGENTS.md`. |
| 🔥 | beta | Usable and being manually tested. Manually designated. |
| 💎 | complete | Manually marked done when stable and well-tested. |

## Hoard Features

### berrygems — Extensions

Extensions are TypeScript files loaded by pi via jiti. Multi-file extensions use a directory with `index.ts` as entry point (e.g. `dragon-guard/`). Single-file extensions will graduate to directories when they reach `in-progress` state, at which point they also gain a code-side `AGENTS.md` documenting patterns, antipatterns, and inter-extension interactions.

| | extension | description |
|---|---|---|
| 🔥 | dragon-breath | Carbon/energy tracking footer widget + `/carbon` command |
| 💎 | dragon-curfew | Bedtime enforcement — blocks tool calls during curfew hours |
| 🔥 | dragon-digestion | Tiered compaction system with progressive context management |
| 🔥 | dragon-guard/ | Four-tier permission guard |
| 💎 | dragon-herald | Desktop notifications on agent completion (OSC777 + notify-send) |
| 🔥 | dragon-image-fetch | Multi-source image/GIF fetch API (Giphy/Tenor/URL/file) |
| 💎 | dragon-inquiry | Interactive user input (select/confirm/text) |
| 🐣 | dragon-lab | Experimental provider feature opt-in manager — Anthropic beta headers today, extensible to any provider |
| 🐣 | dragon-loop | Automation loops with breakout conditions + `/loop` command |
| 🔥 | hoard-sending-stone | Cross-agent communication bus — local HTTP/SSE message passing between pi sessions. Async quest results, stone_send tool, bordered message renderer with per-agent truecolor. Powers future Maren voice. |
| 🔥 | dragon-musings | LLM-generated contextual thinking spinner |
| 🔥 | dragon-parchment | Central panel authority — creation, positioning, focus |
| 🔥 | dragon-review | Code review via `/review` and `/end-review` commands |
| 🔥 | dragon-scroll | Markdown popup panels (scrollable, updatable by ID) |
| 💎 | dragon-tongue | Floating diagnostics panel (tsc type errors) |
| 🔥 | kitty-gif-renderer | Kitty Graphics Protocol image rendering for panels |
| 🔥 | kobold-housekeeping | Floating todo panels with GIF mascots |
| 🔥 | hoard-allies | Subagent token governance — kobold/griffin/dragon taxonomy + `quest`/`recruit` tools + `/allies` command. 3D taxonomy (thinking×noun×job, open combos), budget-based enforcement, named allies, FrugalGPT model cascade, async dispatch via sending-stone, ally_status tool. Dragon-guard coupling ✅. Phase 4 (polish) 🔥, Phase 5 (decoupling + Maren + budget interview) 🥚 |

### berrygems — Library

Shared utilities used across extensions. Not loaded directly by pi.

| | module | description |
|---|---|---|
| 🔥 | animated-image-player | Playback lifecycle controller for AnimatedImage |
| 🔥 | animated-image | Kitty Graphics Protocol frame rendering |
| 🔥 | compaction-templates | Structured summary templates + strategy presets |
| 🔥 | giphy-source | Giphy API fetch + GIF frame extraction |
| 🔥 | lsp-client | Minimal LSP client (JSON-RPC over stdio) |
| 🔥 | panel-chrome | Shared border/focus/header/footer rendering + 19 panel skins |
| 🔥 | settings | Shared settings reader (`hoard.*` + legacy fallback) |

### morsels — Skills

| | skill | description |
|---|---|---|
| 🔥 | agent-init | Generate AGENTS.md files |
| 💎 | api-design | REST/GraphQL/OpenAPI design patterns |
| 💎 | commit | Conventional Commits + AI attribution |
| 💎 | database | Schema design, migrations, ORMs, query optimization |
| 💎 | defuddle | Extract clean markdown from web pages via Defuddle CLI |
| 💎 | dependency-management | Cross-ecosystem dependency management (bun/uv/cargo/Go/Gradle) |
| 💎 | docker | Dockerfiles, multi-stage builds, Compose, security |
| 🔥 | dragon-guard | Four-tier permission guard — Puppy (read-only), Dog (gated), Ally (quest whitelist), Dragon (full) |
| 🔥 | dragon-image-fetch | Use the dragon-image-fetch extension API |
| 🔥 | dragon-parchment | Build panel extensions |
| 🔥 | hoard-allies | Subagent dispatch strategy — kobold/griffin/dragon taxonomy, budget-based cost tiers, decision tree |
| 🔥 | extension-designer | Build pi extensions |
| 💎 | git | Git operations + rebase/bisect references |
| 💎 | git-auth | SSH + rbw credential management |
| 💎 | github | gh CLI operations + GraphQL patterns |
| 💎 | github-actions | GitHub Actions CI/CD workflow authoring |
| 💎 | github-markdown | GFM conventions |
| 💎 | github-writing | Interview-driven document authoring |
| 💎 | go-check | Run go vet/golangci-lint/go test, interpret output |
| 💎 | go-testing | Go testing patterns (testify, table-driven, benchmarks) |
| 💎 | js-testing | JS/TS testing with Jest, Vitest, Node test runner |
| 🔥 | kitty-gif-renderer | Integrate Kitty GIF rendering into panel extensions |
| 🔥 | kobold-housekeeping | Task tracking with panels |
| 💎 | pi-events | Event hooks reference |
| 🔥 | pi-sessions | Sessions & state management |
| 🔥 | pi-tui | TUI component building |
| 💎 | python-testing | Python testing with pytest |
| 💎 | refactoring | Refactoring patterns, SOLID, design principles |
| 🔥 | skill-designer | Build agent skills |
| 💎 | typescript-check | Run tsc/eslint, interpret errors, fix patterns |

### dragon-daemon

| | component | description |
|---|---|---|
| 🐣 | dragon-daemon | Persistent persona daemon — dragon-heart (event-driven ticker), dragon-body (fsnotify sensing), dragon-soul (ethical contract enforcement), attention economy, Obsidian vault memory, pi OAuth. Phase 1 ✅, Phase 2 ✅, soul shore-up ✅ (private shelf, consent tiers, framing audit), Phase 3: new body types (GitHub, pi session, shell) 🐣, Phase 4: dragon pi body (HTTP+SSE) + Qt/QML desktop window 🥚 |

### dragon-cubed

| | component | description |
|---|---|---|
| 🐣 | dragon-cubed | Minecraft body — SoulGem (Go orchestrator), Leylines (NeoForge mod, Phase 1 ✅), Rumble (Baritone extension, Phase 2 ✅), SoulGem (Go orchestrator, Phase 3 ✅). Future: daemon integration via `body.Body` interface. |

### Hoard Infrastructure

Meta-features that serve the hoard as a whole rather than individual tools. Code artifacts live in `.github/` rather than a sub-package.

| | feature | description |
|---|---|---|
| 💭 | auto-research | GitHub Actions workflow to auto-update `researched`-state feature docs on a timer |

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
├── dragon-daemon/    Go persona daemon (the formless core)
│   ├── cmd/          Cobra CLI (run --persona <name>)
│   ├── internal/     Core packages (auth, persona, attention, sensory, body, memory, thought, heart, soul, daemon)
│   ├── AGENTS.md     Daemon-specific agent instructions
│   ├── main.go
│   └── go.mod
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
cd dragon-daemon && go build -o dragon-daemon .
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

### dragon-daemon (Go)

```bash
# Lint — strict static analysis (includes vet + 30+ linters)
cd dragon-daemon && golangci-lint run ./...

# Build — verify compilation
cd dragon-daemon && go build -o dragon-daemon .
```

- Uses `.golangci.yml` in `dragon-daemon/` (v2 format)
- Key strict linters: `errcheck`, `wrapcheck`, `errorlint`, `gosec`, `revive`, `gocritic`, `exhaustive`
- `fmt.Print*` banned outside `cmd/` (use `log/slog`)
- `gofumpt` formatting enforced
- All `//nolint` directives must be specific + explained

### morsels (Markdown)

- No automated linting — review skill frontmatter manually
- Required frontmatter fields: `name` (must match directory), `description`
- Keep SKILL.md under 500 lines; move reference material to `references/`

### dragon-cubed

```bash
# SoulGem (Go orchestrator)
cd dragon-cubed/soulgem && go build ./...
cd dragon-cubed/soulgem && go vet ./...

# Leylines + Rumble (Kotlin/Gradle) — requires JDK 21
cd dragon-cubed && ./gradlew build
```

- SoulGem follows the same Go conventions as dragon-daemon
- Leylines/Rumble use Kotlin with NeoForge/Baritone APIs
- Gradle wrapper pinned in repo

### Pre-Commit Checklist

1. `tsc --project berrygems/tsconfig.json` — zero errors
2. `cd dragon-daemon && golangci-lint run ./...` — zero issues
3. `cd dragon-daemon && go build ./...` — compiles clean
4. `cd dragon-cubed/soulgem && go build ./...` — compiles clean
5. `cd dragon-cubed && ./gradlew build` — Leylines + Rumble compile (requires JDK 21)
6. Test extension changes with `/reload` in pi
7. Skill frontmatter valid (`name` matches directory, `description` present)

## Pi Platform

This project extends [pi](https://github.com/badlogic/pi-mono), a terminal coding agent harness.

### Monorepo Packages

| Package | Role | You Import |
|---|---|---|
| `@mariozechner/pi-ai` | LLM API, model discovery, streaming | `StringEnum` |
| `@mariozechner/pi-tui` | Terminal UI components, keyboard, rendering | `Text`, `Box`, `Container`, `SelectList`, `SettingsList`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth` |
| `@mariozechner/pi-agent-core` | Agent loop, state, transport abstraction | (rarely imported directly) |
| `@mariozechner/pi-coding-agent` | Coding agent CLI — tools, sessions, extensions, skills, compaction | `ExtensionAPI`, `ExtensionContext`, `DynamicBorder`, `BorderedLoader`, `getMarkdownTheme`, `keyHint`, `isToolCallEventType`, `withFileMutationQueue`, `CustomEditor` |
| `@sinclair/typebox` | JSON schema definitions | `Type` for tool parameter schemas |

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

All settings under `hoard` in `~/.pi/agent/settings.json`, with tiered nesting. Legacy `dotsPiEnhancements` flat keys are still read as fallback via `berrygems/lib/settings.ts`.

```
hoard.breath.*       Carbon tracking (enabled, gridRegion, gridIntensity)
hoard.contributor.*  AI attribution (name, email, trailerFormat)
hoard.curfew.*       Bedtime enforcement (enabled, startHour, endHour)
hoard.lab.*          Provider experimental features (lab.anthropic.contextManagement)
hoard.digestion.*    Compaction tuning (triggerMode, strategy, tieredMode, summaryThreshold, hygieneKeepResults, summaryModel, anchoredUpdates, tierOverrides)
hoard.guard.*        Dragon Guard (autoDetect, dogAllowedTools, keys)
hoard.allies.*       Subagent taxonomy (models, thinking, maxParallel, confirmAbove, announceDispatch, budget.*)
hoard.herald.*       Desktop notifications (enabled, title, method, minDuration)
hoard.imageFetch.*   Image/GIF fetching (sources, preferStickers, rating, enableVibeQuery, model, queryPrompt, cacheMaxSize)
hoard.musings.*      Thinking spinner configuration
hoard.panels.*       Panel system (focusKey, defaultSkin, keybinds.*)
hoard.todos.*        Todo panels (gifVibePrompt, gifRating)
hoard.tone.*         Writing style (default, overrides)
```

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

- **TypeScript** — tabs for indentation, double quotes, semicolons; `satisfies` over `as`; no `any` without comment
- **Go** — strict conventions enforced via `.golangci.yml` (see below)
- **Markdown** — ATX headings (`#`), bullet lists with `-`, fenced code blocks with language tags
- **Skill frontmatter** — YAML between `---` fences, `name` and `description` required

### berrygems Conventions

**Shared library layer:** Extract utilities to `berrygems/lib/` on second use. Never duplicate code between extensions with a comment justifying it.

- `readHoardSetting()` from `lib/settings.ts` for ALL settings access — never hand-roll JSON parsing
- `generateShortId()` / `generateId()` from `lib/id.ts` for ID generation — never `Math.random().toString(36)`
- `parseComboName()` from `lib/ally-taxonomy.ts` for combo validation — never `as` casts on string splits
- Before writing any utility, `grep berrygems/lib/` for existing solutions

Available shared libs: `settings`, `ally-taxonomy`, `pi-spawn`, `id`, `cooldown`, `local-server`, `sse-client`, `panel-chrome`, `compaction-templates`, `animated-image`, `animated-image-player`, `giphy-source`, `lsp-client`

**Structural rules:**
- One tool registration per file. 300+ lines in an extension file = split candidate.
- >4 function parameters → options object. No exceptions.
- Skills and code co-ship. Adding a behavior without updating the skill is incomplete work.
- Cross-extension communication via `globalThis` + `Symbol.for()` — never direct imports between extensions.

### Go Conventions (dragon-daemon)

**Naming:**
- `MixedCaps`/`mixedCaps` only. Never underscores in exported names.
- Interfaces: single-method → `-er` suffix (`Reader`, `Gate`). Multi-method → describe the capability.
- Error types: `ErrFoo` for sentinels, `FooError` for custom types. Enforced by `errname` linter.
- Receivers: short (1–2 chars), consistent per type, never `this`/`self`. E.g. `h` for `Heart`, `e` for `Enforcer`.
- Packages: single lowercase word, no underscores, no plurals. Name matches directory.
- Getters: `Name()` not `GetName()`. Setters: `SetName()`.

**Error handling:**
- Wrap errors crossing package boundaries with `fmt.Errorf("context: %w", err)`. Enforced by `wrapcheck`.
- Error messages: lowercase, no punctuation. E.g. `"starting watcher: %w"`.
- Use `errors.Is`/`errors.As` for comparison, never `==` on wrapped errors. Enforced by `errorlint`.
- Handle or return every error. No `_ = foo()` without comment. Enforced by `errcheck`.
- `panic` only for truly unrecoverable programmer errors (init-time invariant violations).

**Concurrency:**
- Every goroutine must have a shutdown path via `context.Context` or a done channel.
- Use `context.Context` as first parameter in functions that may block.
- Prefer channels for coordination, `sync.Mutex` for state protection.
- Document goroutine ownership: who starts it, what stops it.
- Use `sync.WaitGroup` or done channels to prevent goroutine leaks.

**Style:**
- `gofumpt` formatting (strict superset of `gofmt`). Enforced by formatter.
- No naked returns. Enforced by `nakedret`.
- No `fmt.Print*` in library code (use `log/slog`). Enforced by `forbidigo`.
- Use `http.StatusOK` not `200`. Enforced by `usestdlibvars`.
- Switch over if-else chains when ≥3 branches. Flagged by `gocritic`.
- Preallocate slices when length is known. Suggested by `prealloc`.

**Security (gosec):**
- File permissions: dirs ≤0750, files ≤0600. Relax only with `//nolint:gosec` + reason.
- No `math/rand` for anything security-adjacent. Use `crypto/rand` or `math/rand/v2`.
- Validate/sanitize external input before passing to `exec.Command`.

**nolint discipline:**
- Every `//nolint` must name the specific linter and include a reason.
- E.g. `//nolint:gosec // G204: git args are not user-controlled`.
- Enforced by `nolintlint`.

**Linting:** `golangci-lint run ./...` using `dragon-daemon/.golangci.yml`. Zero issues required before merge.

## Commits

Conventional Commits: `<type>(<scope>): <summary>`

- `feat` for new skills or extensions
- `fix` for bug fixes
- `docs` for README or skill content updates
- `refactor` for restructuring without behavior change
- Scope is the skill, extension, or component name
- Summary ≤72 chars, imperative mood, no trailing period
