---
name: go
description: Go language conventions, idioms, error handling, and verification commands. Use when working with Go source files or go.mod projects.
license: MIT
---

# Go Conventions

Go-specific rules beyond what gofmt/golangci-lint enforce.

## Idioms

- Interfaces belong in the **consumer** package, not the implementor package
- `context.Context` is always the **first parameter** — never store it in a struct
- No naked returns — always name the returned values explicitly in the return statement
- No `panic` for recoverable errors — return `error`
- Use `errors.Is` / `errors.As` for error comparison, never `==` on error strings
- Wrap errors with context: `fmt.Errorf("doing X: %w", err)`

## Generics

- Don't reach for generics by default — start concrete, generalize when a second type appears
- Good uses: collection helpers, type-safe containers, reducing boilerplate across multiple concrete types
- Bad uses: single-type code that "might" need generics later, wrapping interfaces for no gain
- Prefer stdlib generic helpers (`slices`, `maps`, `cmp`) over hand-rolled equivalents

## Iterators (range-over-func)

- Go 1.23+ supports `range` over iterator functions — use for custom sequence iteration
- Iterator signatures: `func(yield func(V) bool)` (single value) or `func(yield func(K, V) bool)` (key-value)
- Use `iter.Seq[V]` / `iter.Seq2[K, V]` type aliases from `iter` package
- Prefer stdlib iterator helpers in `slices`, `maps` packages over manual loops when available

## Logging

- Use `log/slog` for structured logging — it's stdlib since Go 1.21
- Pass `slog.Logger` explicitly or use `slog.Default()` — don't create globals
- Use `slog.With()` for adding persistent fields to a logger
- Logging is for events, not metrics — use metrics/tracing for performance data

## Testing

- Table-driven tests with `t.Run` for subtests
- Test file: `package foo_test` (black-box) unless you need access to unexported symbols
- Use `t.Helper()` in test helper functions
- Prefer stdlib `testing` + `cmp` over heavy assertion libraries

## Structure

- Small interfaces — prefer 1–2 methods; large interfaces are a smell
- Accept interfaces, return concrete structs
- Package names are lowercase, single words — never `util`, `common`, `helpers`
- Don't use init() for side effects that aren't absolutely necessary
- In monorepos, shared helpers go in a shared `internal/` package — extract on second use. A comment explaining duplication is a refactor trigger, not a justification.

## Concurrency

- Always pass a `context.Context` to goroutines that might need cancellation
- Close channels from the sender, not the receiver
- Use `sync.WaitGroup` or `errgroup` to coordinate goroutine lifetimes — don't fire and forget
