---
name: minecraft-modding
description: Cross-loader Minecraft modding conventions shared between Fabric and NeoForge. Use when working on Minecraft mods.
license: MIT
---

# Minecraft Modding Conventions (Cross-Loader)

Shared principles for Fabric and NeoForge. Loader-specific conventions live in `minecraft-fabric.md` and `neoforge.md`.

## Kotlin

- Primary language for mod code — use `fabric-language-kotlin` (Fabric) or KFF (NeoForge)
- Mixin classes must be Java — Kotlin is not supported by the Mixin processor
- Keep a `src/main/java/.../mixin/` directory for Mixin classes alongside Kotlin sources

## Registration

- Register everything (blocks, items, entities, etc.) in the mod initializer — not static initializers
- Group related registrations in dedicated objects: `ModItems`, `ModBlocks`, `ModEntities`
- Mod ID as a `const val` in a shared companion or top-level constant — never duplicate the string

## Mixins

- Last resort — prefer loader API hooks or extension points first
- Target the narrowest possible method; avoid full `@Overwrite`
- `@Shadow` only to access existing fields/methods, not to add state
- `@Inject` at `HEAD` or specific `Shift` — be explicit about injection point
- Name Mixin classes `FooMixin` in a `mixin` package
- Use `@Unique` for any fields or methods you add to a Mixin class
- Separate mixin configs for common vs client-only mixins
- Access wideners (Fabric) / access transformers (NeoForge) over `@Accessor` when possible

## Mappings

- Fabric: Yarn mappings (default)
- NeoForge: MojMap (official), optionally Parchment for parameter names
- Never hardcode obfuscated names — always use the mapping layer
- Use `@Mixin(targets = "...")` with mapped names, not SRG/intermediary

## Codecs & Serialization

- Use Mojang `Codec` system for all persistent data (not raw NBT manipulation)
- `RecordCodecBuilder` for multi-field data classes
- `StreamCodec` for network serialization — keep symmetry with the persistent codec
- Kotlin `data class` or `value class` for codec-backed types
- Centralize codec definitions near the data type, not scattered across usage sites

## Sided Execution

- Never import client-only classes from common code paths — causes crashes on dedicated server
- Client-only code belongs in a separate entrypoint or guarded source set
- Use annotations sparingly (`@Environment`/`@OnlyIn`) — prefer architectural separation
- Always check `world.isClientSide` before performing server-only logic in shared methods
- Render code, screens, and keybindings are always client-only

## Resources & Assets

- `assets/<modid>/` — client resources (textures, models, lang, sounds)
- `data/<modid>/` — server data (recipes, loot tables, tags, worldgen)
- Use data generation for all JSON resources — don't hand-write them
- Lang files: `assets/<modid>/lang/en_us.json` — always provide English translations
- Model parents: extend vanilla models (`item/generated`, `block/cube_all`) where possible

## Compatibility

- Check mod presence before optional integration — don't crash if the other mod isn't loaded
- Don't `instanceof` vanilla classes that might be duck-typed by other mods — use interfaces
- Provide API artifacts (separate source set) for other mods to depend on
- Use `Optional` dependencies in mod metadata, not hard requires for soft integrations
- Namespace all registry IDs, tags, and data with your mod ID

## Performance

- Avoid per-tick allocations — reuse mutable objects where safe (e.g., `BlockPos.MutableBlockPos`)
- Don't iterate all loaded chunks/entities unless absolutely necessary — use spatial queries
- Cache registry lookups; don't call `BuiltInRegistries.X.get()` every tick
- Network payloads: send only deltas when possible, respect size limits
- Lazy-load client resources — don't load textures/models that may never be seen

## Project Structure

```
src/main/
├── kotlin/com/example/modid/   # Mod code (Kotlin)
│   ├── ModEntrypoint.kt
│   ├── registry/
│   ├── event/
│   ├── network/
│   ├── data/
│   └── client/
├── java/com/example/modid/
│   └── mixin/                  # Mixin classes (must be Java)
└── resources/
    ├── fabric.mod.json OR META-INF/neoforge.mods.toml
    ├── modid.mixins.json
    ├── assets/modid/
    └── data/modid/
```

## Testing

- `@GameTest` framework for in-game integration tests
- Test against real game state — never mock vanilla classes
- Datagen output should be committed and diffable in version control
