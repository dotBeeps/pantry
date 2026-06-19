---
name: gdscript
description: "GDScript / Godot 4.x conventions: typing, signals, scene structure. Use when working with Godot game projects or .gd files."
license: MIT
---

# GDScript / Godot 4.x Conventions

## Typing

- Always annotate variable and parameter types — no untyped GDScript
- Use `@export` with type annotations: `@export var speed: float = 5.0`
- `@export_range`, `@export_enum`, `@export_group` for inspector organization
- Return types on all functions: `func get_health() -> int:`

## Node Architecture

- Favor composition over deep inheritance — small focused nodes
- Scenes are the unit of reuse, not scripts — a script without a scene is rare
- `@onready var foo: Node = $Foo` for node references — never get nodes in `_process`
- Autoloads (singletons) for truly global state only — not as a grab-bag

## Signals

- Signals for decoupled communication between nodes (child → parent, sibling → sibling)
- Declare with types: `signal health_changed(old_value: int, new_value: int)`
- Connect in `_ready()` via code, not the editor — keeps connections visible and refactorable
- Don't call methods directly upward (child → parent) — emit a signal instead

## Lifecycle

- `_ready()` — node is in tree, children are ready; do setup here
- `_process(delta)` — per-frame logic; keep lightweight
- `_physics_process(delta)` — physics and movement; use for anything physics-related
- `_input(event)` / `_unhandled_input(event)` — prefer `_unhandled_input` unless consuming early

## Resources

- Use `Resource` subclasses for shared data (stats, config, item definitions)
- `@export var stats: CharacterStats` — lets designers configure in inspector
- Preload for assets known at compile time: `const SCENE = preload("res://foo.tscn")`
- `load()` for dynamic/conditional loading only

## Testing

- No headless test runner available in Godot 4 — skip automated verification, note manually
- GUT (Godot Unit Testing) if the project already has it; don't add it unprompted
