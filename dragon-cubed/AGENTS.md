# AGENTS.md — dragon-cubed

> **Part of [Hoard](../AGENTS.md)** — the dragon's monorepo. Read root AGENTS.md for full architecture.
> **Governed by [ETHICS.md](../ETHICS.md)** — observation consent, chat log privacy, and no multiplayer tracking apply here.

A **Minecraft body** for the dragon. LLM-controlled agent stack — three components, three build systems, one protocol.
The daemon can inhabit or direct this body to interact with Minecraft worlds.
Read this file first, then the component AGENTS.md for your target area.

## Architecture

```
D3-SoulGem  (Go + optional Qt)           ← orchestrator, LLM prompt builder
     │  JSON over WebSocket (ws://localhost:8765/leylines)
D3-Leylines (NeoForge 1.21.4 / Kotlin)  ← client-side mod, nervous system
     ├── D3-Rumble  (NeoForge extension) ← Baritone goal translation
     └── [core: chat + player state]
```

**SoulGem** connects to **Leylines** on connect. Leylines sends a capability handshake
listing loaded extensions. SoulGem synthesizes pi tool definitions from that handshake —
tools are dynamic, not hardcoded.

**Baritone** is NOT wrapped — D3-Rumble translates D3 commands into direct Baritone Java
API calls (`ICustomGoalProcess`, `IMineProcess`). Never use chat commands for Baritone.

## Component Map — where to work

| Task | Directory | Read next |
|------|-----------|-----------|
| NeoForge mod, WebSocket server, player state, chat events | `leylines/` | `leylines/AGENTS.md` |
| Baritone pathfinding / mining extension | `rumble/` | `rumble/AGENTS.md` |
| Agent orchestration, LLM prompts, pi extension, CLI | `soulgem/` | `soulgem/AGENTS.md` |
| Wire protocol (shared contract) | See **Protocol** section below | — |

## Build Systems

These are **separate** projects with separate build systems. There is no unified build.

```
leylines/   → Gradle (Kotlin DSL) — ./gradlew <task>
rumble/     → Gradle (Kotlin DSL) — ./gradlew <task>
soulgem/    → Go modules           — go build ./...
```

Never apply Gradle commands inside `soulgem/`. Never apply `go` commands inside `leylines/` or `rumble/`.

## Protocol (Leylines ↔ SoulGem)

Transport: **JSON over WebSocket** at `ws://localhost:8765/leylines`.

All protocol types live in `leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt`.
SoulGem must mirror these types — that file is the source of truth.

### Message types

| Direction | `type` field | Purpose |
|-----------|-------------|---------|
| Leylines → SoulGem | `"handshake"` | Sent on connect. Lists extensions + core capabilities. |
| Leylines → SoulGem | `"state"` | Periodic (1 s) player state snapshot. |
| Leylines → SoulGem | `"event"` | Async events: chat, goal lifecycle, etc. |
| Leylines → SoulGem | `"error"` | Command rejected or extension threw. |
| SoulGem → Leylines | `"command"` | Dispatch an action to a capability. |

### Key shapes

```json
// Handshake (Leylines → SoulGem, on connect)
{ "type": "handshake", "version": "0.1.0",
  "extensions": [{ "id": "d3-rumble", "version": "0.1.0", "capabilities": ["pathfind","mine"] }],
  "coreCapabilities": ["chat","player_state","inventory","world_query"] }

// Command (SoulGem → Leylines)
{ "type": "command", "id": "<uuid>", "capability": "d3-rumble", "action": "pathfind",
  "params": { "x": 100, "y": 64, "z": 100 } }

// Async event (Leylines → SoulGem)
{ "type": "event", "cmdId": "<uuid>", "event": "goal:progressed", "data": { "eta_ticks": 240 } }
```

Goal lifecycle events: `goal:started` → `goal:progressed` → `goal:completed` | `goal:failed`.

## Shared Boundaries

- **Leylines is CLIENT-ONLY.** It must never run on a dedicated server. All event subscribers carry `value = [Dist.CLIENT]`. The `@Mod` object guards startup with `FMLEnvironment.dist == Dist.CLIENT`.
- **Never import leylines code from soulgem.** SoulGem only knows the wire protocol.
- **Never import soulgem code from leylines.** The mod has no knowledge of the agent layer.
- **Thread safety:** Netty I/O threads and the Minecraft game thread are different. Inbound commands are enqueued by Netty and drained on the game thread each tick via `CommandRouter.drainQueue()`. Any code touching Minecraft APIs must run on the game thread.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<scope>): <summary>` — imperative, ≤72 chars.

```
feat(leylines): add world query capability
fix(rumble): handle goal cancellation correctly
chore(soulgem): update go.mod dependencies
docs: update protocol shapes in AGENTS.md
```

Scopes: `leylines`, `rumble`, `soulgem`, `protocol`, `ci`.

## Relationship to the Hoard

- **storybook-daemon** is the persistent core. dragon-cubed is one of its bodies — when the daemon inhabits or directs this body, it acts through SoulGem to control a Minecraft agent.
- **berrygems** are not used here — this body doesn't run inside pi. Future integration: daemon routes commands to SoulGem over HTTP/WebSocket using the `body.Body` interface.
- **ETHICS.md** applies to: observation consent (game state monitoring), chat log privacy (player messages), no tracking of other players.

## Repository Layout

```
dragon-cubed/
├── AGENTS.md              ← you are here
├── README.md              ← vision + architecture diagram
├── .gitignore
├── leylines/              ← NeoForge mod (Phase 1 ✅)
├── rumble/                ← Baritone extension (Phase 2 ✅)
└── soulgem/               ← Go orchestrator (Phase 3 ✅)
```
