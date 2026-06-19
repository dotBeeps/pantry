---
name: kotlin
description: Kotlin conventions beyond ktlint/detekt. Use when working with Kotlin source files or Gradle Kotlin DSL.
license: MIT
---

# Kotlin Conventions

Kotlin-specific rules beyond what ktlint/detekt enforce.

## Idioms

- `val` over `var` — mutability is opt-in
- Expression bodies for single-expression functions: `fun greet(name: String) = "Hello, $name"`
- Data classes for value types — don't hand-write `equals`/`hashCode`/`toString`
- Destructuring declarations to unpack data classes: `val (name, age) = person`
- `@JvmInline value class` for type-safe wrappers without allocation overhead (IDs, units, tokens)
- `object` for singletons; `companion object` for factory methods and constants
- Prefer top-level functions over utility classes
- Extension functions at file level, not nested inside classes

## Null Safety

- Never use `!!` — restructure with `?.let { }`, `?: return`, `?: error("msg")`, or `requireNotNull()`
- `lateinit var` only for DI frameworks — not as a lazy-init hack
- Use `?.` chains over nested `if (x != null)` blocks
- Prefer non-nullable types in public APIs — push nullability to the edges

## Sealed Types

- `sealed class` / `sealed interface` for exhaustive `when` — compiler catches missing branches
- Prefer `sealed interface` over `sealed class` when subtypes don't share state
- Model error hierarchies as sealed types, not exception subclasses
- `data object` for singleton variants (not `object` inside sealed hierarchies)

## Scope Functions

- `let` — nullable receiver or scoping a result
- `apply` — builder-style object configuration
- `also` — side effects (logging, validation) without breaking a chain
- `run` / `with` — grouping operations on a receiver
- Max 2 levels of nesting — flatten or extract a function

## Collections & Sequences

- Prefer `map`/`filter`/`flatMap` over manual loops
- Use `Sequence` (`.asSequence()`) for chains on large collections — avoids intermediate lists
- `associate` / `groupBy` / `partition` over manual accumulation
- `buildList` / `buildMap` / `buildSet` for complex construction

## Coroutines

- `suspend` functions for async — not callbacks, not RxJava
- Structured concurrency: always launch in a bounded scope, never `GlobalScope`
- `coroutineScope { }` to fan out parallel work — if one child fails, siblings cancel
- `supervisorScope { }` when child failures should be isolated
- `CoroutineExceptionHandler` on root coroutines only — children propagate up
- `flow` for cold streams; `StateFlow`/`SharedFlow` for hot streams
- `withContext(Dispatchers.IO)` for blocking calls — don't block the caller's dispatcher

## Error Handling

- `require()` / `requireNotNull()` for preconditions (throws `IllegalArgumentException`)
- `check()` / `checkNotNull()` for state invariants (throws `IllegalStateException`)
- `runCatching { }` only at API boundaries — don't swallow exceptions silently
- Sealed result types over exceptions for expected failure paths

## Testing

- JUnit 5 with `@Nested` inner classes for grouping
- Table-driven style: parameterize with `@ParameterizedTest` + `@MethodSource`
- `kotlinx-coroutines-test` with `runTest { }` for suspend functions
- Testcontainers for integration tests — never mock the database
- `object : Interface { }` anonymous implementations over mocking libraries when feasible

## Gradle (Kotlin DSL)

- `build.gradle.kts` — always Kotlin DSL, not Groovy
- Version catalogs (`libs.versions.toml`) for dependency management
- `implementation` over `compile` (removed); `api` only when exposing transitive deps
