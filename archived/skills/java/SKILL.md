---
name: java
description: "Java conventions: style, patterns, and build commands. Use when working with Java source files or Maven/Gradle projects."
license: MIT
---

# Java Conventions

## Style

- Use `var` for local type inference when the type is obvious from the RHS
- Records for immutable DTOs and value objects (Java 16+)
- Sealed classes for closed type hierarchies (Java 17+)
- Pattern matching `instanceof` — don't cast after checking
- Switch expressions over switch statements where returning a value

## Null Handling

- `Optional<T>` for return types that may be absent — never return null from public methods
- Don't use `Optional` as a field type or parameter — just for return values
- Annotate with `@Nullable` / `@NonNull` at API boundaries

## Collections & Streams

- `List.of()`, `Map.of()` for immutable collections
- Stream API for transformations — avoid imperative loops where streams read cleaner
- Don't chain more than ~4 stream ops without breaking into named intermediates

## Error Handling

- Checked exceptions: only use them at true recovery boundaries; wrap in unchecked elsewhere
- `IllegalArgumentException` / `IllegalStateException` for programming errors
- Domain errors belong in domain types (Result types or custom exceptions), not raw `Exception`

## Testing

- JUnit 5 (`@Test`, `@ParameterizedTest`, `@BeforeEach`)
- AssertJ for assertions — not `assertEquals`
- Testcontainers for anything that touches infra
- Never mock the DB — test against real infrastructure
