# AGENTS.md — D3-Leylines

NeoForge 1.21.4 client-side mod. Broadcasts player state over WebSocket,
hosts Leyline extensions, handles chat. Read `../AGENTS.md` first.

## Setup

Prerequisites: JDK 21, Gradle 8.12+ (wrapper included).
No manual install needed — `./gradlew` downloads everything.

```bash
cd leylines/
./gradlew --version   # confirm Gradle is working
```

## Running in Development

### Client only (most common)
```bash
./gradlew runClient
```
Launches Minecraft with the mod loaded. Connect to any server or use LAN.
The WebSocket server starts at `ws://localhost:8765/leylines` when in-game.

### Dedicated server only
```bash
./gradlew runServer
# First run exits immediately — expected. Then:
echo "eula=true" >> runs/server/eula.txt
# Edit runs/server/server.properties → set online-mode=false for dev
./gradlew runServer   # now stays up, connect via localhost
```

### Client + server simultaneously (dev loop)
Gradle cannot run both in one invocation. Use two terminals or an IDE compound run:

```bash
# Terminal 1
./gradlew runServer

# Terminal 2 (once server is ready)
./gradlew runClient
```

IntelliJ: Run → Edit Configurations → `+` → Compound → add `runClient` + `runServer`.
If debugging both, change one debug port to `5006` to avoid the default `5005` clash.

**Leylines is CLIENT-ONLY** — `runServer` will load the mod but nothing will activate
(guarded by `FMLEnvironment.dist == Dist.CLIENT`). Always test the WebSocket path with
`runClient`.

### Build (jar)
```bash
./gradlew build
# Output: build/libs/leylines-<version>.jar
```

## Key Directories

```
src/main/kotlin/dev/dragoncubed/leylines/
├── Leylines.kt                  ← @Mod entrypoint, starts server on client setup
├── protocol/Messages.kt         ← all wire types — source of truth for the protocol
├── extension/
│   ├── LeylineExtension.kt      ← service interface extensions must implement
│   └── ExtensionRegistry.kt     ← ServiceLoader discovery, capability lookup
├── server/
│   ├── LeylineServer.kt         ← Netty bootstrap, session list, broadcast
│   ├── LeylineSession.kt        ← single connection wrapper
│   ├── WebSocketHandler.kt      ← Netty handler, sends handshake on upgrade
│   └── CommandRouter.kt         ← thread-safe inbound queue
├── state/PlayerStateCollector.kt  ← game-thread state snapshot
└── event/GameEventSubscriber.kt   ← tick drain, periodic broadcast, chat events

src/main/resources/
├── META-INF/neoforge.mods.toml
└── META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension
    ← extensions register their class name here
```

## Architecture Rules

**Thread model — the most important thing to get right:**
- Netty I/O threads handle WebSocket framing. They must never call Minecraft APIs.
- The Minecraft game thread owns all MC state. Access it only from event subscribers.
- Inbound commands travel: Netty thread → `CommandRouter.enqueue()` → queue → game thread → `CommandRouter.drainQueue()` (called each tick in `GameEventSubscriber`).
- Outbound state travels: game thread → `LeylineServer.broadcast()` → `LeylineSession.send()` → Netty flush (Netty is thread-safe for `writeAndFlush`).

**Event bus — use the right one:**
- `Bus.MOD` (mod bus): lifecycle events — `FMLClientSetupEvent`, `RegisterPayloadHandlersEvent`
- `Bus.GAME` (NeoForge bus, the default): runtime events — `ClientTickEvent`, `ClientChatReceivedEvent`
- Getting this wrong causes silent failures or crashes. `@EventBusSubscriber` defaults to `Bus.GAME`.

**`@OnlyIn` is removed in NeoForge 21.7.3+.**
Use `@Mod(dist = Dist.CLIENT)` or `@EventBusSubscriber(value = [Dist.CLIENT])` instead.
Leylines uses `FMLEnvironment.dist == Dist.CLIENT` at startup for the server guard.

## Adding a New Extension

1. Create a new NeoForge mod that depends on `leylines`.
2. Implement `LeylineExtension` (in `dev.dragoncubed.leylines.extension`).
3. Register in your mod's `META-INF/services/dev.dragoncubed.leylines.extension.LeylineExtension`.
4. Your `handleCommand` is called on the **game thread** — safe to use Minecraft APIs directly.
5. Send events back via `session.send(EventMessage(...).toJson())`.

## Code Style

- Kotlin-first. No Java except for Mixin classes (none currently).
- All protocol types in `protocol/Messages.kt` — never scatter wire shapes across the codebase.
- Use `runCatching { }` at extension dispatch boundaries, not individual try/catch blocks.
- `LOGGER.info/warn/error` all messages prefixed with `[Leylines]` for log filtering.
- Null safety over `!!` — if something might not be initialized, use nullable + `?: return`.

## Versions

| Component | Version |
|-----------|---------|
| Minecraft | 1.21.4 |
| NeoForge | 21.4.172-beta *(verify latest at maven.neoforged.net)* |
| KFF (Kotlin for Forge) | 5.6.0 *(verify latest)* |
| Kotlin | 2.1.0 |
| JDK | 21 |
| Gradle | 8.12 |
| Netty | bundled with Minecraft — no separate dep |
| Gson | bundled with Minecraft — no separate dep |

When updating NeoForge, also check `parchment.mappingsVersion` in `build.gradle.kts`.
