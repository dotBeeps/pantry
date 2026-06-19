---
name: minecraft-fabric
description: Minecraft Fabric modding conventions (Kotlin-first). Use when working with Fabric mod projects.
license: MIT
---

# Minecraft Fabric Conventions (Kotlin-first)

## Language & Setup

- Use `fabric-language-kotlin` — enables Kotlin entrypoints and coroutine support
- Entrypoints: `object MyMod : ModInitializer`, `object MyModClient : ClientModInitializer`
- Register entrypoints in `fabric.mod.json` with `"adapter": "kotlin"` and `"value": "com.example.MyMod"`
- Yarn mappings (default); intermediary for production
- `build.gradle.kts` (Kotlin DSL) for build scripts

## Registration

- Use `Registry.register(BuiltInRegistries.X, ResourceLocation.fromNamespaceAndPath(MOD_ID, "name"), instance)`
- Group registrations in dedicated objects: `object ModItems`, `object ModBlocks`, etc.
- Call registration objects from `onInitialize()` to trigger class loading
- Never register in static initializers or top-level `init` outside the mod entrypoint
- Use `Identifier.of(MOD_ID, path)` helper for ResourceLocation creation

## Entry Points

- `main` → `ModInitializer` — shared logic, registration, server events
- `client` → `ClientModInitializer` — renderers, screens, keybindings
- `server` → `DedicatedServerModInitializer` — server-only logic
- `fabric-datagen` → `DataGeneratorEntrypoint` — data generation
- Keep entrypoints minimal — delegate to registration objects

## Events & Callbacks

- Fabric API event callbacks: `ServerTickEvents.START_SERVER_TICK.register { server -> ... }`
- Kotlin lambdas work directly with Fabric's functional interfaces (SAM conversion)
- Use `ServerLifecycleEvents`, `ServerTickEvents`, `UseBlockCallback`, etc.
- Don't create event listener classes — register lambdas or method references inline
- Check `FabricLoader.getInstance().isModLoaded("mod_id")` before optional integration

## Mixins

- Last resort — prefer Fabric API hooks first
- Target the narrowest possible method; avoid `@Overwrite`
- `@Inject` at `HEAD` or specific `Shift` — be explicit about injection point
- `@Shadow` only to access existing fields/methods, not to add state
- Name Mixin classes `FooMixin` in a `mixin` package
- Mixin classes must be Java (Kotlin not supported for Mixins)
- Separate mixin configs: `modid.mixins.json` (common), `modid.client.mixins.json` (client)

## Networking

- Payloads: `data class MyPayload(val pos: BlockPos) : CustomPacketPayload`
- Define companion: `TYPE`, `CODEC` (StreamCodec), and override `type()`
- Register: `PayloadTypeRegistry.playS2C().register(TYPE, CODEC)`
- Server send: `ServerPlayNetworking.send(player, payload)`
- Client send: `ClientPlayNetworking.send(payload)`
- Client receive: `ClientPlayNetworking.registerGlobalReceiver(TYPE) { payload, context -> ... }`
- Always check `world.isClientSide` before server-only logic in use methods

## Data Components

- `data class` or Kotlin `value class` for component data
- Codec: `RecordCodecBuilder.create { it.group(...).apply(it, ::MyComponent) }`
- Register: `Registry.register(BuiltInRegistries.DATA_COMPONENT_TYPE, id, DataComponentType.builder<T>().persistent(CODEC).build())`
- Optional fields: `Codec.TYPE.optionalFieldOf("name", default).forGetter(...)`

## Data Generation

- Enable in `build.gradle.kts`: `fabricApi { configureDataGeneration { client = true } }`
- Entrypoint implements `DataGeneratorEntrypoint`
- Register providers in `onInitializeDataGenerator`: recipes, loot tables, models, tags, advancements
- Output to `src/generated/resources` — add to resource dirs in build script

## Sided Execution

- `@Environment(EnvType.CLIENT)` — use sparingly, prefer runtime checks
- Client code in separate entrypoint, not guarded by annotations
- `FabricLoader.getInstance().environmentType` for runtime side detection
- Never import client classes from common code paths

## Project Structure

```
src/main/
├── kotlin/com/example/modid/
│   ├── MyMod.kt                # ModInitializer object
│   ├── registry/               # ModItems, ModBlocks, etc.
│   ├── event/                  # Event handler registrations
│   ├── network/                # Payload data classes + handlers
│   ├── data/                   # Codecs, components
│   └── client/                 # ClientModInitializer + renderers
├── java/com/example/modid/
│   └── mixin/                  # Mixin classes (must be Java)
└── resources/
    ├── fabric.mod.json
    ├── modid.mixins.json
    └── assets/modid/           # Textures, models, lang
```

## Testing

- Fabric `GameTest` framework for in-game integration tests
- Use `FabricGameTest` interface for test classes
- `TestContext` provides world interaction helpers
- No mocking vanilla classes — test against real game state

## Compatibility

- Check mod presence: `FabricLoader.getInstance().isModLoaded("mod_id")`
- Don't `instanceof` vanilla classes that might be duck-typed by other mods
- Use Fabric API interfaces over vanilla internals where possible
- Provide API artifacts for other mods to depend on via separate source set
