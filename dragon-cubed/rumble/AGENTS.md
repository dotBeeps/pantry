# AGENTS.md — D3-Rumble

Baritone compatibility extension for D3-Leylines. Translates SoulGem commands
into direct Baritone Java API calls. Read `../AGENTS.md` first.

## Setup

⚠️  **Baritone API jar required before building.**

```bash
# Download from: https://github.com/cabaletta/baritone/releases/tag/v1.13.1
# File: baritone-api-neoforge-1.13.1.jar
# Place at: rumble/libs/baritone-api-neoforge-1.13.1.jar
```

Build Leylines first (Rumble compiles against it):
```bash
# From repo root:
./gradlew :leylines:build
./gradlew :rumble:build

# Or both at once:
./gradlew :leylines:build :rumble:build
```

## Running in Development

Same pattern as Leylines — needs both mods + Baritone in the mods folder.

```bash
# Client
./gradlew :rumble:runClient

# Server (client-only mod — activates only on client)
./gradlew :rumble:runServer
```

For the client run config, NeoForge will load both `leylines` and `d3_rumble` together.
Baritone standalone jar must also be present in the run mods directory.

## Architecture

```
SoulGem command ("capability": "d3-rumble")
    ↓ WebSocket → Leylines CommandRouter (game thread)
    ↓ ExtensionRegistry.findByCapability("d3-rumble")
    ↓ RumbleExtension.handleCommand(session, commandId, action, params)
    ↓ BaritoneController.pathfind / mine / cancel
    ↓ Baritone API (ICustomGoalProcess / IMineProcess)
    ↓ PathEventRelay (AbstractGameEventListener) fires on path events
    ↓ session.send(EventMessage("goal:started" / "goal:progressed" / "goal:completed" / "goal:failed"))
```

## Key Files

```
src/main/kotlin/dev/dragoncubed/rumble/
├── Rumble.kt                       ← @Mod entrypoint, initializes BaritoneController
├── RumbleExtension.kt              ← LeylineExtension impl, command dispatch
└── baritone/
    └── BaritoneController.kt       ← Baritone API wrapper, PathEvent relay
```

## Capabilities

| Action | Required params | Optional | Notes |
|--------|----------------|----------|-------|
| `pathfind` | `x, y, z: Int` | — | GoalBlock — exact position |
| `pathfind_near` | `x, y, z: Int` | `range: Int` (default 3) | GoalNear — within range |
| `pathfind_xz` | `x, z: Int` | — | GoalXZ — any Y |
| `mine` | `blocks: [String]` | `quantity: Int` (0 = unlimited) | Block registry names |
| `cancel` | — | — | Cancels any active goal |

Block names use full registry IDs: `"minecraft:diamond_ore"`, `"minecraft:coal_ore"`, etc.

## Goal Lifecycle Events

All events carry the original `cmdId` from the command for correlation.

| Event | When |
|-------|------|
| `goal:started` | Immediately when command is dispatched to Baritone |
| `goal:progressed { status: "calculating" }` | Pathfinder started calculating |
| `goal:progressed { status: "walking" }` | Path found, executing |
| `goal:progressed { status: "recalculating" }` | Transient calc failure — Baritone retrying |
| `goal:completed` | `PathEvent.AT_GOAL` fired — goal reached |
| `goal:failed { reason: "canceled" }` | `cancel` command or Baritone lost control |
| `goal:failed { reason: "path_calc_failed" }` | Baritone gave up — unreachable |

**CALC_FAILED vs terminal failure:** `CALC_FAILED` can be transient (Baritone retries).
D3-Rumble checks `isActive()` on the process — if still active, it emits `recalculating`;
if the process lost control, it emits `goal:failed`.

## Baritone API Rules

- **Entry point:** `BaritoneAPI.getProvider().primaryBaritone` — lazy, initialized once in `BaritoneController`
- **Only import from `baritone.api.*`** — everything outside that package is obfuscated in production jars
- **Game thread only** — all Baritone API calls must be on the game thread. This is already satisfied because commands arrive via `CommandRouter.drainQueue()` which runs in `ClientTickEvent`
- **One process at a time** — starting a new command while one is running implicitly cancels the previous. SoulGem should not send overlapping commands without an explicit `cancel` first
- **`mineByName` vs `mine`:** prefer `mineByName(String...)` over `mine(Block...)` for string params from SoulGem — avoids registry lookup complexity

## Adding New Capabilities

1. Add the capability name to `RumbleExtension.capabilities`
2. Add a `when` branch in `RumbleExtension.handleCommand`
3. Add a method in `BaritoneController` that sets up the active command and calls Baritone
4. PathEvent relay handles lifecycle events automatically — no changes needed there
5. Update this AGENTS.md capability table
6. Update root `AGENTS.md` protocol section if the new capability needs new event shapes

## Versions

| Component | Version |
|-----------|---------|
| Baritone API | 1.13.1 (NeoForge 1.21.4) |
| Leylines | 0.1.0 |
| NeoForge | 21.4.172-beta |
| KFF | 5.6.0 |
| JDK | 21 |
