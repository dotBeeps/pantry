# Architecture

**Analysis Date:** 2026-04-22

> **Source-of-truth cross-references** — this document cites, not duplicates. Authoritative:
>
> - `AGENTS.md` — sub-package inventory, feature lifecycle, pi platform integration, verification
> - `ETHICS.md` — the binding contract the `soul/` + `consent/` + `memory/` packages enforce
> - `storybook-daemon/AGENTS.md` — daemon-internal phase status and pi-as-persona wiring
> - `cc-plugin/skills/quest/SKILL.md` — ally dispatch taxonomy
>
> What follows is observed code-level architecture: real entry points, module boundaries, and inter-package data flow that the AGENTS.md files are silent on.

## Pattern Overview

**Overall:** Polyglot meta-repo (monorepo) of **8 autonomous sub-packages** glued together by **two runtime buses** — the **storybook-daemon MCP/SSE psi interfaces** (machine bus) and the **sending stone** (agent-to-agent bus). No shared source code or shared build: each sub-package has its own toolchain (`go.mod`, `package.json`, `Gradle`, `CMake`, Python/uv).

Canonical layout and sub-package purpose: see `AGENTS.md` §Repository Layout and §Hoard Features. This document covers what the code reveals beyond those descriptions.

**Key Characteristics:**

- **The daemon is the hub, not a shared library.** No sub-package imports daemon Go code; integration is via SSE + MCP-over-HTTP. `cc-plugin/.mcp.json` registers `http://127.0.0.1:9432/mcp` as an MCP server; `psi/src/main.cpp:24-31` hardcodes `http://localhost:7432` (SSE) and `http://localhost:9432` (MCP).
- **Pi is the inference engine, not the daemon.** Each heartbeat spawns `pi --mode text` as a subprocess (`storybook-daemon/internal/thought/pi.go`). The daemon owns ethics, sensory aggregation, attention budget, and memory; pi owns LLM calls, tool dispatch, and multi-turn session state. See `storybook-daemon/AGENTS.md` §Pi Subprocess per Beat.
- **Two plugin adapters expose the same daemon capabilities through different UX.** `berrygems/` (TypeScript, pi extensions) and `cc-plugin/` (Markdown/JSON, Claude Code plugin) are siblings, not parent/child — each talks to the daemon independently. `cc-plugin/AGENTS.md` lines 57-62 states this explicitly.
- **The ethical contract is enforced in code, not by convention.** `storybook-daemon/internal/soul/` contains a deterministic gate + audit enforcer wired into every beat (`storybook-daemon/internal/daemon/daemon.go:153-164`).

## Layers

### The Dragon's Core — `storybook-daemon/`

A Go daemon. Single-persona lifecycle lives in `storybook-daemon/internal/daemon/daemon.go`; multi-persona in `storybook-daemon/internal/storybook/storybook.go` (uses `errgroup.WithContext` per persona — one goroutine per persona).

**Clean layered internal dependency graph** (observed from imports, no cycles):

```
daemon.Run (internal/daemon/daemon.go:42)
  ├─ persona.LoadFromDir              (YAML → persona.Persona)
  ├─ attention.New                    (budget ledger)
  ├─ sensory.New(20)                  (ring buffer of observations)
  ├─ memory.Open                      (Obsidian vault at ~/.config/storybook-daemon/memory/<persona>/)
  ├─ conversation.New                 (output-capture ledger, compacts to vault)
  ├─ buildNerves → nerve/hoard.New    (fsnotify watcher on ~/Development/hoard)
  ├─ buildInterfaces →
  │    ├─ psi/sse.New   (:7432 SSE thought stream)
  │    └─ psi/mcp.New   (:9432 MCP over HTTP — memory/attention/stone/quest)
  ├─ thought.New                      (cycle orchestrator)
  ├─ soul.NewEnforcer                 (deterministic gates + audits)
  └─ heart.New                        (event-driven ticker)
         └─ fn per beat:
              soul.Check (rest gate)
              attention.AboveFloor?
              soul.PreBeat / cycle.Run / soul.Verify
```

Inbound-event fan-in (`daemon.go:361-409`): every nerve and every psi interface has an `Events() <-chan sensory.Event`; each channel is drained by a goroutine that does `agg.Enqueue(ev); h.Nudge()`. Nudging causes `heart.Run` (`internal/heart/heart.go:60-78`) to fire an immediate beat instead of waiting for the next interval tick.

**Package map** (`internal/` — 16 packages, no cycles):

| Package        | Role                                                      | Key file                                                                                                                                    |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `daemon`       | Lifecycle orchestration per persona                       | `internal/daemon/daemon.go` (409 lines)                                                                                                     |
| `storybook`    | Multi-persona orchestrator                                | `internal/storybook/storybook.go` (102)                                                                                                     |
| `heart`        | Jittered+nudgeable ticker                                 | `internal/heart/heart.go` (104)                                                                                                             |
| `thought`      | Beat cycle: sensory → pi → output                         | `internal/thought/cycle.go` (179), `pi.go` (116)                                                                                            |
| `persona`      | YAML loader + schema                                      | `internal/persona/loader.go`, `types.go`                                                                                                    |
| `attention`    | Budget ledger (pool / rate / floor)                       | `internal/attention/ledger.go`                                                                                                              |
| `sensory`      | Observation ring buffer + snapshot                        | `internal/sensory/aggregator.go`, `types.go`                                                                                                |
| `nerve`        | Nerve interface (sensory connector)                       | `internal/nerve/nerve.go`                                                                                                                   |
| `nerve/hoard`  | fsnotify watcher for this repo                            | `internal/nerve/hoard/hoard.go` (256), `watcher.go`                                                                                         |
| `psi`          | Interface + OutputSink contracts                          | `internal/psi/psi.go`                                                                                                                       |
| `psi/sse`      | HTTP+SSE thought stream + dot ingestion                   | `internal/psi/sse/sse.go` (255)                                                                                                             |
| `psi/mcp`      | MCP-over-HTTP tool server                                 | `internal/psi/mcp/mcp.go` (570), `stone_broker.go` (192)                                                                                    |
| `memory`       | Obsidian-compatible vault                                 | `internal/memory/vault.go` (364), `note.go`, `tier.go`                                                                                      |
| `conversation` | Output-capture ledger → vault                             | `internal/conversation/ledger.go`, `entry.go`                                                                                               |
| `soul`         | Ethical enforcement (gates + audits)                      | `internal/soul/enforcer.go` (180), `consent_gate.go`, `framing_audit.go`, `private_shelf_audit.go`, `memory_audit.go`, `attention_audit.go` |
| `consent`      | Consent state machine (low/med/high tiers)                | `internal/consent/state.go`                                                                                                                 |
| `stone`        | Shared `stone.Message` type (the only cross-package type) | `internal/stone/types.go`                                                                                                                   |
| `quest`        | Ally dispatch model + cascade                             | `internal/quest/manager.go` (418), `cascade.go`, `orchestrate.go`, `prompt.go`, `taxonomy.go`                                               |

### The Dragon's Hands — `berrygems/`

Pi extensions loaded by jiti at session start — **no build step**, TypeScript runs directly. Each extension is an isolated module (see `AGENTS.md` §Extension Runtime). Cross-extension comms via `globalThis[Symbol.for("hoard.*")]` — never direct imports (`berrygems/AGENTS.md:29-41`).

Two especially-architectural extensions:

- `berrygems/extensions/hoard-sending-stone/` — **inter-agent bus**. Starts a local HTTP+SSE server in the primary pi session (`berrygems/extensions/hoard-sending-stone/server.ts`), writes connection info to `~/.pi/hoard-sending-stone.json` so subagent sessions can discover it (`index.ts:27`). Registers `stone_send` / `stone_receive` tools.
- `berrygems/extensions/hoard-allies/` — **ally dispatch orchestrator**. Implements the kobold/griffin/dragon/scout/reviewer/coder/researcher/planner taxonomy (`berrygems/lib/ally-taxonomy.ts`), spawns pi subagents, cascades models through provider cooldowns, and wires results back through the sending stone (`berrygems/extensions/hoard-allies/spawn.ts`, `cascade.ts`, `quest-tool.ts`).

### The Dragon's Mouth — `psi/` (Qt 6/QML)

Native desktop chat client. Entry point `psi/src/main.cpp` (98 lines) wires seven C++ objects to QML via `QQmlContext::setContextProperty` (see `AGENTS.md` §psi — context-property approach is load-bearing due to a Qt 6.11 bug; do not refactor to `loadFromModule()`).

**Dual-connection model** (observed in `psi/src/main.cpp:22-78`):

- `SseConnection` (`psi/src/sseconnection.cpp`) — thought stream from daemon SSE at `:7432`
- `McpClient` (`psi/src/mcpclient.cpp`) — JSON-RPC over HTTP to daemon MCP at `:9432`
- `StonePoller` (`psi/src/stonepoller.cpp`) — long-poll thread that drains stone messages through the MCP client
- `ConversationModel` (`psi/src/conversationmodel.cpp`) — unified `QAbstractListModel` feeding all QML delegates (`qml/ThoughtDelegate.qml`, `DotMessageDelegate.qml`, `StoneDelegate.qml`, `QuestEventDelegate.qml`, `SummaryDelegate.qml`)
- `DaemonState` (`psi/src/daemonstate.cpp`) — attention/connection status panel backing (`qml/StatePanel.qml`)
- `ThoughtModel` (`psi/src/thoughtmodel.cpp`) — legacy feed model kept alongside unified conversation model
- `ThemeEngine` (`psi/src/themeengine.cpp`) — palette source for QML

Registration flow on connect (`psi/src/main.cpp:62-78`): SSE connects first → on connected, `McpClient::registerSession("psi-ember", "ui", "direct", "psi")` → on session registered, `StonePoller` starts its polling thread. This is the only cross-component sequencing in psi.

### The Dragon's Body — `dragon-cubed/`

Three independent builds wired by one wire protocol (`dragon-cubed/AGENTS.md` §Protocol):

- `dragon-cubed/soulgem/main.go` — Go orchestrator. Spawns `agent` (internal/agent/agent.go + dispatcher.go), exposes HTTP API (`internal/api/server.go`), connects to Leylines (`internal/leylines/client.go`, `protocol.go`, `session.go`), synthesizes pi tools dynamically from handshake (`internal/tools/synthesizer.go`), composes LLM prompts (`internal/prompt/builder.go`). Also ships a pi extension at `dragon-cubed/soulgem/extension/soulgem.js`.
- `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt` — NeoForge 1.21.4 client-side mod. WebSocket server at `ws://localhost:8765/leylines` (`server/LeylineServer.kt`, `server/WebSocketHandler.kt`), command routing on the Minecraft game thread (`server/CommandRouter.kt`), extension registry (`extension/ExtensionRegistry.kt`, `extension/LeylineExtension.kt`), protocol types (`protocol/Messages.kt` — **source of truth for wire types**).
- `dragon-cubed/rumble/src/main/kotlin/dev/dragoncubed/rumble/Rumble.kt` — Leylines extension wrapping Baritone's Java API directly (`baritone/BaritoneController.kt`). Registered via `META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension`.

Integration with daemon is **not yet wired** — `dragon-cubed/AGENTS.md:106-108` marks future daemon integration as "daemon routes commands to SoulGem over HTTP/WebSocket using the `body.Body` interface."

### The Dragon's Voice Training — `dragon-forge/`

Python/uv project. No package subdirectories — flat script layout:

- `dragon-forge/extract.py` — extracts dragon-register pairs from Claude Code `.jsonl` session logs
- `dragon-forge/train.py` — Unsloth LoRA training on Qwen 2.5 7B Instruct (ROCm)
- `dragon-forge/eval.py` — evaluation
- `dragon-forge/run.fish` — pipeline entry
- `dragon-forge/seed/containment.jsonl` — 22 role-coded seed exchanges
- `dragon-forge/config/persona.md`, `config/user-context.md` — two-layer persona+user spec

Target: a local-model pi backend consumable by the daemon as the persona's `llm.model` (see `AGENTS.md` §dragon-forge).

### The Dragon's Planner — `den/`

Internal docs only, not shipped (`AGENTS.md` §Repository Layout):

- `den/features/<name>/AGENTS.md` — per-feature current state + links to code
- `den/moments/` — session logs and interaction captures
- `den/reviews/` — review artifacts

16 feature directories present: `auto-research`, `dragon-breath`, `dragon-cubed-migration`, `dragon-daemon`, `dragon-digestion`, `dragon-forge`, `dragon-lab`, `dragon-loop`, `dragon-parchment`, `go-error-handling`, `golangci-lint-config`, `go-style`, `hoard-allies`, `hoard-meta`, `hoard-sending-stone`, `quest-budget-interview`.

### The Dragon's Knowledge — `morsels/`

Markdown skills (`morsels/skills/<name>/SKILL.md`). No build step; pi loads at startup. 45 skills present. Inert at runtime — read by pi as documentation, executed as instructions. Full inventory in `AGENTS.md` §morsels — Skills.

### The Claude Code Bridge — `cc-plugin/`

Declarative plugin bundle (JSON + Markdown):

- `cc-plugin/.claude-plugin/plugin.json` — manifest
- `cc-plugin/.mcp.json` — **registers daemon MCP endpoint** as `storybook-ember: http://127.0.0.1:9432/mcp`
- `cc-plugin/agents/ally-*.md` — 5 subagent definitions (scout/reviewer/coder/researcher/planner) with `model`, `allowed-tools`, `system-prompt` frontmatter
- `cc-plugin/skills/{quest,ally-status,memory}/SKILL.md` — dispatch guides

See `cc-plugin/AGENTS.md` for full mechanism.

## Data Flow

### Thought Cycle (per-persona, per-beat)

Observed in `storybook-daemon/internal/thought/cycle.go:76-121`:

1. `cycle.gatherNerveStates(ctx)` — calls `Nerve.State(ctx)` on every nerve (only `hoard` today)
2. `sensory.Snapshot(pool, nerveStates)` — aggregates attention pool + nerve states + recent events
3. `buildContextMessage(snap)` — formats markdown: `## Sensory Context`, `### Pinned Memories` (from `vault.Pinned()`), `### Nerve States`, `### Recent Events`. **Sensory-only — no conversation replay**; pi maintains history via session file.
4. `runPi(ctx, pi, contextMsg)` — spawns `pi --mode text -p --model … --system-prompt … --thinking … --session ~/.config/storybook-daemon/sessions/<persona>.jsonl "<context>"` with filtered env (strips `_API_KEY`/`_SECRET`/`_TOKEN`/`_PASSWORD`/`_CREDENTIAL` + `AWS_/GITHUB_/OPENAI_/AZURE_/GCP_` prefixes; injects `HOARD_STONE_PORT=<mcp_port>`)
5. `fireOutput(output)` + `convo.Append(…, Source: "thought")` — hooks carry output to SSE and conversation ledger
6. `ledger.Spend("beat", persona.Costs.Beat)` — flat attention deduction (default 15)

Gate/audit wrapper (`internal/daemon/daemon.go:166-194`): `enforcer.Check()` (rest gate) → floor check → `enforcer.PreBeat()` → `cycle.Run` → `enforcer.Verify()`. Soul enforcer has deterministic gates and post-beat audits (framing, private-shelf, memory-transparency, consent, attention).

### Cross-Package Coordination (multi-agent bus)

**There are two distinct buses**, and they are mostly independent:

**Bus 1 — Daemon-centric (machine-to-daemon):**

- Psi Qt app ↔ daemon over SSE (`:7432`) + MCP (`:9432`) — `psi/src/main.cpp:24, 31`
- Claude Code sessions ↔ daemon over MCP-over-HTTP — `cc-plugin/.mcp.json`
- Pi extensions ↔ daemon MCP — via `HOARD_STONE_PORT` env injected when daemon spawns pi (`storybook-daemon/AGENTS.md` §Pi Subprocess)
- The daemon's MCP server exposes: `register_session`, `stone_send`, `stone_receive`, `memory_search`/`read`/`write`, `attention_state`, and quest tools (`cc-plugin/AGENTS.md:36-42`)

**Bus 2 — Sending Stone (agent-to-agent within a pi session):**

- Primary pi session runs `berrygems/extensions/hoard-sending-stone/server.ts` on a local HTTP+SSE port, writes `~/.pi/hoard-sending-stone.json`
- Subagent pi sessions discover the port via that file and `stone_send` back to the primary (`berrygems/extensions/hoard-sending-stone/index.ts:11-27`)
- **This bus is peer-to-peer between pi processes and does not route through the daemon** — the daemon is not required for ally dispatch within a single CC/pi session

The two buses converge when the daemon is running: its MCP server also brokers stone messages between sessions (`storybook-daemon/internal/psi/mcp/stone_broker.go`), so psi/cc-plugin/pi-in-daemon-beat can all participate in the same social channel. When the daemon is down, `hoard-sending-stone` still works inside a single pi tree.

### Quest Dispatch Flow (from CC)

1. Claude Code primary detects a questable task → calls `Agent` tool with `ally-coder` (etc.) — subagent definition loaded from `cc-plugin/agents/ally-coder.md`
2. Subagent inherits parent MCP connections (`cc-plugin/AGENTS.md:42`) — has direct access to `mcp__storybook-ember__stone_send`
3. Subagent performs its job, closes with `stone_send(type="result", to="primary-agent")` — enforced as mandatory by the agent's system-prompt
4. Daemon's stone broker (`storybook-daemon/internal/psi/mcp/stone_broker.go`) routes the message; primary picks it up via `stone_receive` (long-poll) or sees it drained into context

### Memory Write Path

`vault.Write` (`storybook-daemon/internal/memory/vault.go`) is intercepted by `soul.memory_audit.go` every call (`storybook-daemon/AGENTS.md` §Ethical Enforcement). Private-shelf enforcement runs in `vault_private_test.go`-asserted paths: `private: true` frontmatter blocks injection, traversal, and dream processing.

## Key Abstractions

### `nerve.Nerve` interface (`storybook-daemon/internal/nerve/nerve.go:15-46`)

Sensory connectors. Contract: `ID() / Type() / Start(ctx) / Stop() / State(ctx) / Execute(ctx, name, args) / Tools() / Events()`. Only implementation today: `nerve/hoard/hoard.go`. The interface supports future dragon-cubed integration via a planned `body.Body` adapter (`dragon-cubed/AGENTS.md:106-108`).

### `psi.Interface` interface (`storybook-daemon/internal/psi/psi.go:19-39`)

Communication surfaces (not sensory). Contract: `ID() / Type() / Start(ctx) / Stop() / Events()`. Optional `psi.OutputSink.Wire(capture soul.OutputCapture)` for interfaces that relay thought output (SSE does; MCP does not). Implementations: `psi/sse` and `psi/mcp`.

### `soul.Enforcer` (`storybook-daemon/internal/soul/enforcer.go`)

Deterministic ethics enforcer — **the code-level embodiment of `ETHICS.md`**. Built with `Deps{Ledger, Vault, Cycle}` (`daemon.go:153-157`). Registers gates (pre-beat blocks) and audits (post-beat reports). Audits implemented: `attention_audit.go`, `consent_gate.go`, `framing_audit.go`, `memory_audit.go`, `private_shelf_audit.go`. Code-ethics mapping table: `storybook-daemon/AGENTS.md` §Ethical Enforcement.

### `consent.State` (`storybook-daemon/internal/consent/state.go`)

Risk-tier state machine (low/med/high, dual-key user+agent). Enforces `ETHICS.md` §3.1 risk-informed consent and §3.2 dual-key.

### `stone.Message` (`storybook-daemon/internal/stone/types.go`)

The one shared type that crosses package boundaries. Both the daemon's MCP broker and `berrygems/extensions/hoard-sending-stone/types.ts` use compatible shapes so pi extensions and daemon-brokered messages serialize identically.

### `quest.Manager` (`storybook-daemon/internal/quest/manager.go`, 418 lines)

The ally taxonomy kernel. Supporting files: `cascade.go` (model fallback), `orchestrate.go` (parallel rally/chain), `prompt.go` (ally system prompts), `taxonomy.go` (adjective/noun/job permutations). Exposed through MCP at `internal/psi/mcp/quests/{plans,reviews,runs,tasks}/`. Cc-plugin and berrygems both call this through MCP tools.

### Persona schema (`storybook-daemon/internal/persona/types.go`)

YAML config at `~/.config/storybook-daemon/personas/<name>.yaml` (or `storybook-daemon/personas/*.yaml` in-repo). Contains `persona {name, flavor, voice, memory_scope, system_prompt}`, `attention {pool, rate, floor, thought_interval, variance}`, `costs.beat`, `llm {model, thinking}`, `nerves[]`, `interfaces[]`. Both `storybook-daemon/personas/ember.yaml` and `maren.yaml` ship in-repo as samples/defaults.

## Entry Points

| Sub-package             | Entry file                                                                                                                                       | How invoked                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `storybook-daemon`      | `storybook-daemon/main.go` (7 lines — `cmd.Execute()`)                                                                                           | `go run . run --persona ember` or `run-all --all` (`cmd/root.go`, `cmd/run.go`, `cmd/run_all.go`) |
| `psi`                   | `psi/src/main.cpp` (98 lines)                                                                                                                    | `./psi/build/psi` after `cmake --build build`                                                     |
| `dragon-cubed/soulgem`  | `dragon-cubed/soulgem/main.go`                                                                                                                   | `go build ./...` then binary; also `dragon-cubed/soulgem/extension/soulgem.js` as a pi extension  |
| `dragon-cubed/leylines` | `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt`                                                                     | `@Mod` object, loaded by NeoForge at Minecraft launch                                             |
| `dragon-cubed/rumble`   | `dragon-cubed/rumble/src/main/kotlin/dev/dragoncubed/rumble/Rumble.kt` + `META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension` | Discovered by Leylines' `ExtensionRegistry` via ServiceLoader                                     |
| `berrygems`             | Every `extensions/*.ts` or `extensions/*/index.ts` is its own entry                                                                              | Pi auto-discovers on session start; `/reload` re-loads                                            |
| `morsels`               | `skills/*/SKILL.md`                                                                                                                              | Pi loads on demand                                                                                |
| `cc-plugin`             | `.claude-plugin/plugin.json` + `agents/*.md` + `skills/*/SKILL.md` + `.mcp.json`                                                                 | Claude Code loads at session start when plugin is installed                                       |
| `dragon-forge`          | `dragon-forge/run.fish` (driver) → `extract.py` / `train.py` / `eval.py`                                                                         | `./run.fish` (requires uv + ROCm)                                                                 |

## Error Handling

**Go (daemon, soulgem):** Errors always wrapped with `fmt.Errorf("doing X: %w", err)` (enforced by `errcheck`, `wrapcheck`, `errorlint` in `storybook-daemon/.golangci.yml`). Sentinel errors `ErrFoo`, custom types `FooError`. See `AGENTS.md` §Go Conventions.

**TypeScript (berrygems):** `satisfies` over `as`, no `any` without comment, no casts on parsed inputs — use a validation function returning `T | null`.

**Qt/C++ (psi):** Check return bools from Qt APIs; use `qWarning()` / `qCritical()`; no exceptions across Qt boundaries.

**Kotlin (dragon-cubed):** Thread-safety is the dominant concern — Netty I/O thread vs. Minecraft game thread. `CommandRouter.drainQueue()` bridges them on every game tick (`dragon-cubed/AGENTS.md:85-88`).

## Cross-Cutting Concerns

**Logging:** `log/slog` structured logs in Go (`storybook-daemon/internal/daemon/daemon.go` uses `slog.With("persona", name)` throughout). Qt side uses `qWarning/qCritical`. No `fmt.Print*` outside `cmd/` in daemon (banned by linter).

**Ethical enforcement:** `storybook-daemon/internal/soul/` is wired into the beat loop. **This is not optional.** Gate failures skip beats; audit failures log violations. Both observable via the MCP interface for psi/cc-plugin inspection.

**Attention as gate:** `ledger.AboveFloor()` blocks beats below `persona.attention.floor` (`daemon.go:174-180`). Attention is spent per beat (flat `costs.beat`), regenerates at `rate` units/hour, caps at `pool`. Attention state is observable via MCP (`attention_state` tool) and pushed through SSE.

**Configuration:** `~/.config/storybook-daemon/{personas/,memory/,sessions/,user-context.md}` for the daemon; `~/.pi/agent/settings.json` (`hoard.*` namespace) for berrygems (`berrygems/lib/settings.ts` is the sole accessor). Pi credentials at `~/.pi/agent/auth.json` — daemon doesn't touch them, pi subprocess reads them.

**Authentication:** Daemon has none — every listener binds to `localhost`. Pi owns LLM provider auth. Psi connects unauthenticated to `localhost:7432/9432`. CC plugin connects unauthenticated to `http://127.0.0.1:9432/mcp`.

---

_Architecture analysis: 2026-04-22_
