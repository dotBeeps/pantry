# Codebase Structure

**Analysis Date:** 2026-04-22

> The canonical layout diagram lives in `AGENTS.md` §Repository Layout. This document adds what that diagram doesn't — file counts, per-directory roles as observed in code, and guidance for adding new work.

## Directory Layout

```
hoard/
├── AGENTS.md                     Authoritative — read first
├── AGENTS.override.md            Repo-local override for agent instructions
├── CLAUDE.md                     Claude-Code-specific additions to AGENTS.md
├── ETHICS.md                     The binding ethical contract
├── README.md
├── ENERGY_CONSUMPTION_REFERENCE.md, ENERGY_RESEARCH.md    Environmental-cost research (see ETHICS §3.7)
├── package.json                  Root manifest (references sub-packages)
├── node_modules/                 Root-level pi symlinks (see AGENTS.md §berrygems)
│
├── berrygems/                    Pi extensions (TypeScript) — 47 .ts files
│   ├── AGENTS.md
│   ├── extensions/               19 extensions (14 single-file, 5 multi-file dirs)
│   ├── lib/                      13 shared utility modules
│   ├── styles/                   Writing tone files
│   ├── tsconfig.json             Symlink-resolved pi packages
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── node_modules/
│
├── morsels/                      Pi skills (Markdown) — 45 skills
│   ├── AGENTS.md
│   ├── skills/                   One dir per skill, each with SKILL.md
│   └── package.json
│
├── storybook-daemon/             Go persona daemon — 64 .go files
│   ├── AGENTS.md
│   ├── main.go                   7-line entry → cmd.Execute()
│   ├── go.mod, go.sum
│   ├── .golangci.yml             Strict v2 linter config
│   ├── cmd/                      Cobra CLI (root/run/run_all)
│   ├── internal/                 16 packages (see ARCHITECTURE.md for graph)
│   ├── personas/                 ember.yaml, maren.yaml, README.md (in-repo samples)
│   └── quests/                   plans/, reviews/, runs/, tasks/ (quest state dirs)
│
├── psi/                          Qt 6/QML desktop client — 14 C++ + 12 QML files
│   ├── CMakeLists.txt            Qt 6.5+ required (Quick, Network, QuickControls2)
│   ├── src/                      7 C++ object pairs (.h/.cpp) + main.cpp
│   ├── qml/                      12 QML files
│   └── build/                    CMake build output (gitignored)
│
├── dragon-cubed/                 Minecraft body — 3 independent builds
│   ├── AGENTS.md, README.md
│   ├── settings.gradle.kts       Root Gradle settings (leylines + rumble only)
│   ├── soulgem/                  Go orchestrator (12 .go files, own go.mod)
│   ├── leylines/                 NeoForge mod (Kotlin, 9 .kt files)
│   └── rumble/                   Baritone extension (Kotlin, 3 .kt files)
│
├── dragon-forge/                 Fine-tuning pipeline — 3 Python scripts (flat)
│   ├── extract.py, train.py, eval.py, run.fish
│   ├── config/                   persona.md, user-context.md
│   ├── seed/                     containment.jsonl (22 role-coded seeds)
│   ├── probes.jsonl              Eval probes
│   ├── out/                      Training artifacts (gitignored)
│   └── unsloth_compiled_cache/   Unsloth cache (gitignored)
│
├── cc-plugin/                    Claude Code plugin bundle (declarative)
│   ├── AGENTS.md
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json                 Active: storybook-ember → http://127.0.0.1:9432/mcp
│   ├── .mcp.json.disabled        Archived second-persona wiring
│   ├── .orphaned_at              Disabled marker
│   ├── agents/                   5 ally subagent definitions (.md)
│   └── skills/                   3 skills (quest, ally-status, memory)
│
├── den/                          Internal docs — NOT shipped
│   ├── features/                 16 per-feature dirs with AGENTS.md + research
│   ├── moments/                  Session logs, interaction captures
│   └── reviews/                  Review artifacts
│
├── docs/                         Public-facing docs
│   └── superpowers/              Specs (e.g. pi-as-persona design, psi sub-project design)
│
└── allies-parity/                Parity notes — investigative, not a sub-package
    └── README.md
```

## Directory Purposes

### `berrygems/`

- **Purpose:** Pi extensions — the dragon's hands while inhabiting a pi session
- **Contains:** TypeScript (ESM), single-file or `<name>/index.ts` multi-file; `lib/` for shared utilities
- **Key files:**
  - `berrygems/extensions/hoard-sending-stone/` — inter-agent HTTP+SSE bus (6 files)
  - `berrygems/extensions/hoard-allies/` — subagent dispatch orchestrator (8 files, has own AGENTS.md)
  - `berrygems/extensions/dragon-guard/` — four-tier permission guard (7 files, own AGENTS.md + README.md)
  - `berrygems/extensions/dragon-parchment.ts` — panel authority (single file, referenced by many others via `Symbol.for("hoard.parchment")`)
  - `berrygems/lib/settings.ts` — **the only legal settings accessor**
  - `berrygems/lib/ally-taxonomy.ts` — kobold/griffin/dragon taxonomy types
  - `berrygems/lib/panel-chrome.ts`, `animated-image.ts`, `animated-image-player.ts`, `giphy-source.ts`, `lsp-client.ts`, `sse-client.ts`, `local-server.ts`, `pi-spawn.ts`, `cooldown.ts`, `id.ts`, `compaction-templates.ts`
- **Build:** None — jiti loads `.ts` directly. Tsc for type checking only.

### `morsels/`

- **Purpose:** Agent-facing skills as pure Markdown — no executable code
- **Contains:** 45 skill directories, each with `SKILL.md` (+ optional `references/`)
- **Key files:** Full inventory in `AGENTS.md` §morsels — Skills
- **Build:** None. Pi loads on demand.

### `storybook-daemon/`

- **Purpose:** The formless core — Go daemon with thought loop, ethics enforcement, sensory aggregation, memory vault
- **Contains:** 64 `.go` files across `cmd/` and `internal/`
- **Key files:**
  - `main.go` (7 lines) — minimal entry, delegates to `cmd.Execute()`
  - `cmd/root.go`, `cmd/run.go`, `cmd/run_all.go` — Cobra CLI
  - `internal/daemon/daemon.go` (409) — per-persona lifecycle
  - `internal/storybook/storybook.go` (102) — multi-persona errgroup orchestrator
  - `internal/heart/heart.go` (104) — jittered+nudgeable ticker
  - `internal/thought/cycle.go` (179), `thought/pi.go` (116) — thought cycle + pi subprocess spawn
  - `internal/soul/enforcer.go` (180) + `*_audit.go` siblings — ethics enforcement
  - `internal/psi/mcp/mcp.go` (570) — MCP-over-HTTP server
  - `internal/psi/sse/sse.go` (255) — SSE thought stream
  - `internal/memory/vault.go` (364) — Obsidian vault
  - `internal/quest/manager.go` (418) — ally dispatch
  - `internal/nerve/hoard/hoard.go` (256) + `watcher.go` — fsnotify nerve
- **Configuration:** Runtime config at `~/.config/storybook-daemon/` (personas, memory, sessions, user-context.md). In-repo `storybook-daemon/personas/*.yaml` are samples.
- **Build:** `go build` → single binary. Strict `.golangci.yml`.

### `psi/`

- **Purpose:** Ember's visual interface — Qt 6/QML desktop chat client
- **Contains:** C++ backend in `src/`, QML UI in `qml/`
- **Key files:**
  - `psi/src/main.cpp` (98) — entry point; wires 7 C++ objects to QML via context properties
  - `psi/src/sseconnection.{h,cpp}` — SSE client to daemon :7432
  - `psi/src/mcpclient.{h,cpp}` — JSON-RPC MCP client to daemon :9432
  - `psi/src/stonepoller.{h,cpp}` — long-poll thread for stone messages
  - `psi/src/conversationmodel.{h,cpp}` — unified `QAbstractListModel`
  - `psi/src/daemonstate.{h,cpp}`, `thoughtmodel.{h,cpp}`, `themeengine.{h,cpp}`
  - `psi/qml/Main.qml` — root QML
  - `psi/qml/ConversationStream.qml` + `{Thought,DotMessage,Stone,QuestEvent,Summary}Delegate.qml` — typed delegates
  - `psi/qml/{SessionRail,ConnectionBar,InputBar,StatePanel,StreamFilter}.qml`
  - `psi/CMakeLists.txt`
- **Build:** `cmake -B build && cmake --build build` → `./build/psi`

### `dragon-cubed/`

- **Purpose:** Minecraft body — three independent projects with no unified build
- **Contains:** `soulgem/` (Go), `leylines/` (NeoForge Kotlin), `rumble/` (Baritone Kotlin)
- **Key files:**
  - `dragon-cubed/soulgem/main.go` — Go orchestrator entry
  - `dragon-cubed/soulgem/cmd/{root,serve,agents}.go` — CLI
  - `dragon-cubed/soulgem/internal/{agent,api,leylines,prompt,tools}/` — 5 sub-packages
  - `dragon-cubed/soulgem/extension/soulgem.js` — pi-side extension
  - `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt` — `@Mod` entrypoint
  - `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt` — **wire protocol source of truth**
  - `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/server/{LeylineServer,WebSocketHandler,CommandRouter,LeylineSession}.kt` — transport
  - `dragon-cubed/rumble/src/main/kotlin/dev/dragoncubed/rumble/Rumble.kt` — mod entrypoint
  - `dragon-cubed/rumble/src/main/resources/META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension` — ServiceLoader registration
- **Build:** `soulgem`: `go build ./...`; `leylines` + `rumble`: `./gradlew build` (JDK 21)

### `dragon-forge/`

- **Purpose:** Fine-tuning pipeline for a local Ember voice model
- **Contains:** Flat Python layout (no sub-packages)
- **Key files:**
  - `dragon-forge/run.fish` — pipeline driver
  - `dragon-forge/extract.py` — extracts dragon-register pairs from CC session logs
  - `dragon-forge/train.py` — Unsloth LoRA on Qwen 2.5 7B
  - `dragon-forge/eval.py`
  - `dragon-forge/seed/containment.jsonl`
  - `dragon-forge/config/persona.md`, `config/user-context.md`
- **Build:** Python/uv, ROCm target

### `cc-plugin/`

- **Purpose:** Claude Code plugin bundle — wires this daemon into CC sessions
- **Contains:** Pure declarative — JSON manifests + Markdown agent/skill definitions
- **Key files:**
  - `cc-plugin/.claude-plugin/plugin.json` — CC plugin manifest
  - `cc-plugin/.mcp.json` — MCP server registration (storybook-ember :9432)
  - `cc-plugin/agents/ally-{scout,reviewer,coder,researcher,planner}.md` — 5 ally defs
  - `cc-plugin/skills/{quest,ally-status,memory}/SKILL.md` — dispatch guides
- **Build:** None

### `den/`

- **Purpose:** Internal planning docs — not shipped
- **Contains:**
  - `den/features/<name>/AGENTS.md` — per-feature current state + links to code (16 dirs)
  - `den/moments/` — session logs and interaction captures
  - `den/reviews/` — review artifacts

### `docs/`

- **Purpose:** Public-facing engineering docs
- **Contains:** `docs/superpowers/specs/` — design docs (e.g. `2026-04-13-pi-as-persona-design.md`, `2026-04-13-psi-sub-project-2-design.md`)

## Key File Locations

**Entry Points:**

- Daemon CLI: `storybook-daemon/main.go` → `storybook-daemon/cmd/run.go` / `cmd/run_all.go`
- Psi app: `psi/src/main.cpp`
- SoulGem orchestrator: `dragon-cubed/soulgem/main.go`
- Leylines mod: `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt`
- Rumble extension: `dragon-cubed/rumble/src/main/kotlin/dev/dragoncubed/rumble/Rumble.kt`
- Training pipeline: `dragon-forge/run.fish`
- Each berrygem: `berrygems/extensions/<name>.ts` or `<name>/index.ts`

**Configuration:**

- Runtime daemon config: `~/.config/storybook-daemon/personas/<name>.yaml`, `~/.config/storybook-daemon/user-context.md`
- Sample personas in-repo: `storybook-daemon/personas/{ember,maren}.yaml`
- Daemon lint rules: `storybook-daemon/.golangci.yml`
- Berrygems type check: `berrygems/tsconfig.json`
- Psi build: `psi/CMakeLists.txt`
- CC plugin MCP wiring: `cc-plugin/.mcp.json`
- CC plugin manifest: `cc-plugin/.claude-plugin/plugin.json`
- Pi settings (user-level): `~/.pi/agent/settings.json` under `hoard.*` namespace

**Core Logic:**

- Thought cycle: `storybook-daemon/internal/thought/cycle.go`, `pi.go`
- Lifecycle wiring: `storybook-daemon/internal/daemon/daemon.go`
- Ethical enforcement: `storybook-daemon/internal/soul/enforcer.go` + audits
- Inter-agent bus: `berrygems/extensions/hoard-sending-stone/server.ts`, `client.ts`
- Ally taxonomy: `berrygems/lib/ally-taxonomy.ts`, `storybook-daemon/internal/quest/taxonomy.go`
- Wire protocol (dragon-cubed): `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt`

**Testing:**

- Go: `*_test.go` co-located; significant coverage in `internal/heart`, `attention`, `consent`, `conversation`, `memory`, `quest`, `soul`, `stone`, `thought`, `psi/mcp`, `psi/sse`
- TypeScript (berrygems): no test framework — manual via `/reload`
- Qt: no tests in repo currently
- Kotlin: `@GameTest` framework planned (see `AGENTS.md` §Minecraft Modding)
- Python (dragon-forge): smoke test via `run.fish`

## Naming Conventions

**Sub-packages:** lowercase, hyphenated where multi-word. Each ships with its own `AGENTS.md` that starts with a `> Part of [Hoard](../AGENTS.md)` header. `storybook-daemon` (dragon's core), `berrygems` / `morsels` (capabilities — food metaphor), `dragon-cubed` (Minecraft body — "³" = cubes), `dragon-forge` (training pipeline), `psi` (visual interface — psionic channel), `cc-plugin` (adapter), `den` (internal workspace).

**Files (Go):** single-word lowercase packages, files named for the primary type (`ledger.go`, `vault.go`, `cycle.go`). Tests are `*_test.go` co-located.

**Files (TypeScript):** `kebab-case.ts`. Multi-file extensions: `<kebab-name>/index.ts` with siblings named by role (`types.ts`, `server.ts`, `client.ts`, `renderer.ts`, `spawn.ts`, `cascade.ts`).

**Files (Qt/QML):** C++ classes use `lowercasename.{h,cpp}` — flat, no prefixes (e.g. `conversationmodel.cpp`). QML uses `PascalCase.qml`, one component per file.

**Files (Kotlin):** `PascalCase.kt` matching the primary class. Package path mirrors directory: `dev.dragoncubed.leylines.server.LeylineServer` at `leylines/src/main/kotlin/dev/dragoncubed/leylines/server/LeylineServer.kt`.

**Files (Markdown skills/features):** `SKILL.md` (skills) or `AGENTS.md` (features/sub-packages). Directory name is the canonical identifier.

**Extensions (berrygems):** prefix conveys the persona family — `dragon-*` (deep capabilities), `hoard-*` (cross-agent bus / ally dispatch), `kobold-*`, `kitty-*` (special renderers).

**Agents (cc-plugin):** `ally-<role>.md` (scout/reviewer/coder/researcher/planner). When dispatched from CC, namespaced as `hoard:ally-<role>` (see `CLAUDE.md`).

## Where to Add New Code

**New pi extension:**

- Single file: `berrygems/extensions/<name>.ts`
- Multi-file: `berrygems/extensions/<name>/index.ts` + siblings (add `AGENTS.md` + `README.md` once it reaches `in-progress` state, per `AGENTS.md` §berrygems — Extensions)
- Use `globalThis[Symbol.for("hoard.<domain>")]` for cross-extension comms, never direct imports
- Settings go under `hoard.<namespace>` — access via `berrygems/lib/settings.ts::readHoardSetting()`

**New pi skill:**

- `morsels/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`, `license: MIT`, optional `compatibility`)
- Keep under 500 lines; overflow to `morsels/skills/<name>/references/`

**New berrygems shared utility:**

- `berrygems/lib/<name>.ts`
- **Rule:** extract on second use, never with a duplication-justifying comment (`AGENTS.md` §berrygems Conventions)

**New daemon nerve:**

- `storybook-daemon/internal/nerve/<type>/<type>.go` implementing `nerve.Nerve` from `storybook-daemon/internal/nerve/nerve.go`
- Wire in `storybook-daemon/internal/daemon/daemon.go::buildNerve` switch (line ~318)
- Add `<type>` to persona YAML schema via `storybook-daemon/internal/persona/types.go`

**New daemon psi interface:**

- `storybook-daemon/internal/psi/<type>/<type>.go` implementing `psi.Interface`
- Wire in `storybook-daemon/internal/daemon/daemon.go::buildInterface` switch (line ~338)
- If it relays thought output, also implement `psi.OutputSink`

**New soul audit:**

- `storybook-daemon/internal/soul/<name>_audit.go` + `<name>_audit_test.go`
- Register in `storybook-daemon/internal/soul/enforcer.go`
- Cross-reference the ETHICS.md section it enforces

**New CC ally role:**

- `cc-plugin/agents/ally-<role>.md` with `model`, `allowed-tools`, and `system-prompt` frontmatter
- Mirror any permission/behavior changes in the berrygems-side hoard-allies config so both adapters stay consistent (`cc-plugin/AGENTS.md:93-95`)

**New dragon-cubed capability:**

- Protocol changes: **first** update `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt` (source of truth), then mirror in `dragon-cubed/soulgem/internal/leylines/protocol.go`
- New Baritone capability: new Leylines extension registered via `META-INF/services/...LeylineExtension`

**New feature plan / research:**

- `den/features/<name>/AGENTS.md` (current state + code links)
- `den/features/<name>/research/*.md`, `plans/*.md`, `reviews/*.md` as the feature evolves through lifecycle states (`AGENTS.md` §Feature Lifecycle)

## Special Directories

**`node_modules/` (root + `berrygems/`):**

- Purpose: Symlinks to pi packages installed by npm-globally-installed `mitsupi`
- Generated: Yes (by pnpm / symlink repair script in `AGENTS.md`)
- Committed: No (gitignored)

**`storybook-daemon/quests/`:**

- Purpose: Runtime quest state (plans/reviews/runs/tasks)
- Mirrored at `storybook-daemon/internal/psi/mcp/quests/` for MCP access
- Committed: Structural dirs only, not runtime artifacts

**`psi/build/`:**

- Purpose: CMake build output
- Generated: Yes
- Committed: No

**`dragon-forge/out/`, `dragon-forge/unsloth_compiled_cache/`:**

- Purpose: Training artifacts + Unsloth JIT cache
- Generated: Yes (by `train.py`)
- Committed: No

**`cc-plugin/.mcp.json.disabled`, `cc-plugin/.orphaned_at`:**

- Purpose: Archived second-persona MCP wiring (Maren on `:9433`) — currently inactive
- Committed: Yes (preserved for re-enablement)

**`allies-parity/`:**

- Purpose: Investigative notes on berrygems-vs-cc-plugin ally parity
- Not a sub-package — no code, just `README.md`

**`.planning/codebase/`:**

- Purpose: Generated codebase analysis docs (this file)
- Consumed by `/gsd-plan-phase` and `/gsd-execute-phase`

---

_Structure analysis: 2026-04-22_
