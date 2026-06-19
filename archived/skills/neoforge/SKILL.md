---
name: neoforge
description: NeoForge modding conventions (Kotlin-first / KFF). Use when working with NeoForge mod projects.
license: MIT
---

# NeoForge Conventions (Kotlin-first / KFF)

## Language & Setup

- Use Kotlin for Forge (KFF) — add `thedarkcolour:kotlinforforge-neoforge` dependency
- Mod entrypoint: `object` declaration annotated with `@Mod(MOD_ID)`
- Register event bus in `init {}` block, not a constructor body
- Use `build.gradle.kts` (Kotlin DSL) for build scripts
- MojMap (official) mappings; Parchment overlay for parameter names

## Registration

- `DeferredRegister.create(registry, MOD_ID)` — store as top-level or companion `val`
- Register to mod bus in entrypoint `init {}`: `ITEMS.register(modBus)`
- Specialized registrars: `DeferredRegister.createDataComponents(...)`, `DeferredRegister.createItems(...)` when available
- Supplier references: `val MY_ITEM: Supplier<Item> = ITEMS.register("my_item") { ... }`
- Never register in static initializers or top-level `init` outside the mod class

## Events

- Prefer `@EventBusSubscriber(modid = MOD_ID)` companion objects for game events
- Mod bus events: `@EventBusSubscriber(modid = MOD_ID, bus = EventBusSubscriber.Bus.MOD)`
- Handler methods: `@JvmStatic @SubscribeEvent fun onThing(event: ThingEvent) { ... }`
- Use extension functions on event types for cleaner handler logic
- Kotlin SAM conversions work for single-method event interfaces

## Data Components

- Define data as `data class` or Kotlin `value class` where appropriate
- Codecs: `RecordCodecBuilder.create { instance -> instance.group(...).apply(instance, ::MyData) }`
- StreamCodecs: `StreamCodec.composite(...)` — keep symmetry between codec and stream codec
- Register: `REGISTRAR.registerComponentType("name") { it.persistent(CODEC).networkSynchronized(STREAM_CODEC) }`
- Transient (no save): omit `.persistent()`, only `.networkSynchronized()`
- No network sync: use `StreamCodec.unit(default)` as the network codec

## Data Attachments

- `AttachmentType.builder { DefaultValue() }.serialize(CODEC).build()` for persistent
- Access: `player.getData(MY_ATTACHMENT)`, `entity.setData(MY_ATTACHMENT, value)`
- `hasData()` before `getData()` if the default is expensive to construct
- Sync: `.sync(STREAM_CODEC)` for simple cases, `AttachmentSyncHandler` for granular control
- `setData` auto-marks chunk/entity dirty — no manual `setChanged()` needed

## Networking

- Payloads: `data class MyPayload(...) : CustomPacketPayload` with companion `TYPE` and `STREAM_CODEC`
- Register in `RegisterPayloadHandlersEvent`: `registrar.playBidirectional(TYPE, STREAM_CODEC, handler)`
- Send: `ClientPacketDistributor.sendToServer(payload)` / `PacketDistributor.sendToPlayer(player, payload)`
- Size limits: 1 MiB client-bound, 32 KiB server-bound
- Use `HandlerThread.NETWORK` for expensive handlers to avoid blocking the main thread
- Keep payload classes as pure data — handler logic lives in separate handler objects

## Codecs & Serialization

- Prefer `Codec` + `StreamCodec` pairs for all custom data types
- `RecordCodecBuilder` for multi-field types, `Codec.INT` / `Codec.STRING` etc. for primitives
- Use `ByteBufCodecs` for stream codec primitives
- Kotlin-friendly: extension properties on `Codec` companion for common patterns
- Never hardcode NBT tag names scattered across code — centralize codec definitions

## Sided Execution

- `@OnlyIn(Dist.CLIENT)` — use sparingly, prefer runtime dist checks
- Client-only logic in separate source set or guarded by `FMLEnvironment.dist`
- Event handlers: `@EventBusSubscriber(value = [Dist.CLIENT])` for client-only subscribers
- Networking handlers: use `DirectionalPayloadHandler` to split client/server logic cleanly

## Project Structure

```
src/main/kotlin/com/example/modid/
├── ModEntrypoint.kt          # @Mod object, bus registration
├── registry/                  # DeferredRegister declarations
├── event/                     # Event subscriber objects
├── network/                   # Payload records + handlers
├── data/                      # Codecs, data components, attachments
├── client/                    # Client-only code (renderers, screens)
└── mixin/                     # Mixin classes (last resort)
```

## Testing

- `@GameTest` framework for in-game integration tests
- Test mod in `src/test/` source set with separate mod ID
- Use `GameTestHelper` for spawning entities, placing blocks, asserting state
- No mocking vanilla classes — test against real game state

## Gradle / Build

- `neoForge { ... }` block in `build.gradle.kts` for version and mappings
- Access transformers in `src/main/resources/META-INF/accesstransformer.cfg`
- Mixin config in `src/main/resources/<modid>.mixins.json`
- Mod metadata in `src/main/resources/META-INF/neoforge.mods.toml`
- Data generation: `GatherDataEvent` subscriber, output to `src/generated/resources`
