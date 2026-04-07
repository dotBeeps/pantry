# Research: Go Error Handling Best Practices & Patterns (2023–2026)

## Summary

Go error handling follows a value-based philosophy: errors are ordinary values returned from functions, not exceptions thrown through the stack. The consensus across the Go team, Google's style guide, Uber's style guide, and Dave Cheney's influential writings coalesces around six pillars: (1) always use `errors.Is`/`errors.As` instead of direct comparison or type assertion, (2) wrap with `%w` only when the underlying error is part of your API contract, (3) prefer sentinel errors for static conditions and custom types for dynamic ones, (4) handle each error exactly once, (5) reserve `panic` for truly unrecoverable situations, and (6) keep error strings lowercase and free of redundant prefixes like "failed to".

## Findings

### 1. Error Wrapping: `%w` vs `%v` — an API Contract Decision

**Use `%w` when callers should be able to programmatically inspect the cause; use `%v` when the cause is an implementation detail.**

The Go 1.13 blog post establishes the core rule: "Wrap an error to expose it to callers. Do not wrap an error when doing so would expose implementation details." The canonical example: if `LookupUser` internally uses `database/sql`, wrapping `sql.ErrNoRows` with `%w` means callers can `errors.Is(err, sql.ErrNoRows)` — and you've now committed to that dependency as part of your API. [Go Blog: Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)

The Uber Go Style Guide adds practical guidance: use `%w` as the default for most wrapped errors, but be aware callers may begin relying on it. Use `%v` to deliberately obfuscate the underlying error — you can always switch to `%w` later, but switching from `%w` to `%v` is a breaking change. [Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md)

```go
// ✅ %w — caller can match on ErrNotFound
func FetchItem(name string) (*Item, error) {
    if !exists(name) {
        return nil, fmt.Errorf("fetch item %q: %w", name, ErrNotFound)
    }
    // ...
}

// ✅ %v — internal DB error is an implementation detail
func LookupUser(id string) (*User, error) {
    row := db.QueryRow("SELECT ...", id)
    if err := row.Scan(&u); err != nil {
        return nil, fmt.Errorf("lookup user %q: %v", id, err)
    }
    return &u, nil
}
```

### 2. Sentinel Errors vs Custom Error Types — Decision Matrix

**Use sentinel `var` errors for static, matchable conditions. Use custom types when the error carries dynamic context that callers need.**

The Uber guide provides the clearest decision table:

| Caller needs to match? | Message type | Use |
|---|---|---|
| No | static | `errors.New` (unexported) |
| No | dynamic | `fmt.Errorf` |
| Yes | static | exported `var ErrXxx = errors.New(...)` |
| Yes | dynamic | custom type implementing `error` |

[Uber Go Style Guide](https://github.com/uber-go/guide/blob/master/style.md)

```go
// Sentinel — static, matchable
var ErrNotFound = errors.New("not found")
var ErrPermission = errors.New("permission denied")

// Custom type — dynamic, matchable, carries context
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation: %s: %s", e.Field, e.Message)
}
```

**Naming conventions** (Uber + Google style guides):
- Sentinel variables: prefix `Err` (exported) or `err` (unexported) — e.g., `ErrBrokenLink`, `errNotFound`
- Custom types: suffix `Error` — e.g., `NotFoundError`, `ValidationError`

Dave Cheney's talk goes further: prefer "opaque errors" (just return `error`, don't expose specific types/values) when possible, and when you must allow callers to inspect errors, assert on **behavior** (interfaces) rather than type:

```go
// Assert behavior, not type
type temporary interface {
    Temporary() bool
}

func IsTemporary(err error) bool {
    var te temporary
    return errors.As(err, &te) && te.Temporary()
}
```

[Dave Cheney: Don't just check errors, handle them gracefully](https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully)

### 3. `errors.Is` and `errors.As` — Always Use These, Never `==` or Type Assertion

**Since Go 1.13, always use `errors.Is` for sentinel comparison and `errors.As` for type extraction.** These functions walk the entire error chain (following `Unwrap()`), while `==` and `.(type)` only check the outermost error.

```go
// ❌ Fragile — breaks if err is wrapped
if err == ErrNotFound { ... }
if e, ok := err.(*QueryError); ok { ... }

// ✅ Robust — traverses the error chain
if errors.Is(err, ErrNotFound) { ... }

var qe *QueryError
if errors.As(err, &qe) {
    fmt.Println("query was:", qe.Query)
}
```

Custom `Is` methods allow flexible matching (e.g., template-based comparison where zero fields are wildcards):

```go
type Error struct {
    Path string
    User string
}

func (e *Error) Is(target error) bool {
    t, ok := target.(*Error)
    if !ok {
        return false
    }
    return (e.Path == t.Path || t.Path == "") &&
           (e.User == t.User || t.User == "")
}

// Match any error with User == "admin"
if errors.Is(err, &Error{User: "admin"}) { ... }
```

[Go Blog: Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)

### 4. `panic` vs Error Returns — The "Library Rule"

**Real library functions should avoid `panic`. If the problem can be masked or worked around, it's always better to let things continue to run.** — Effective Go

`panic` is reserved for:
- **Truly unrecoverable situations**: nil dereferences, impossible states (e.g., a switch default that "can't happen"), index out of bounds on programmer error
- **Program initialization**: `template.Must()`, `regexp.MustCompile()`, missing required env vars in `init()`
- **Package-internal control flow**: where panic+recover simplifies deeply recursive code (like parsers), but **never crossing package boundaries**

```go
// ✅ panic in init — startup invariant
var user = os.Getenv("USER")
func init() {
    if user == "" {
        panic("no value for $USER")
    }
}

// ✅ Must-style convenience for init-time
var tmpl = template.Must(template.New("status").Parse(statusHTML))

// ✅ Panic for impossible program state
func mustGetIndex(s []string, target string) int {
    for i, v := range s {
        if v == target {
            return i
        }
    }
    panic(fmt.Sprintf("unreachable: %q not in slice", target))
}

// ❌ NEVER panic for operational errors
func readConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        // panic(err)          // ❌ Never
        return Config{}, err   // ✅ Always
    }
    // ...
}
```

If panic+recover is used inside a package, **always convert panics to errors at the package boundary**:

```go
func Compile(str string) (regexp *Regexp, err error) {
    defer func() {
        if e := recover(); e != nil {
            regexp = nil
            err = e.(Error) // Re-panics if not our Error type
        }
    }()
    return doParse(str), nil
}
```

[Effective Go: Panic](https://go.dev/doc/effective_go#panic) · [Uber Go Style Guide: Don't Panic](https://github.com/uber-go/guide/blob/master/style.md)

### 5. Error Message Conventions

**Error strings should be lowercase, without trailing punctuation, and without redundant prefixes.**

From the Go Code Review Comments wiki:

> Error strings should not be capitalized (unless beginning with proper nouns or acronyms) or end with punctuation, since they are usually printed following other context.

[Go Wiki: Code Review Comments](https://go.dev/wiki/CodeReviewComments#error-strings)

From the Google Go Style Guide:

> Error strings should not capitalize the first letter (unless it begins with an exported name, acronym, or initialism) and should not end with punctuation. This is because error strings usually appear within other context before being printed to the user.

[Google Go Style Guide: Decisions](https://google.github.io/styleguide/go/decisions#errors)

The Uber guide adds: avoid "failed to" / "error" / "unable to" prefixes since they state the obvious and compound noisily as errors bubble up:

```go
// ❌ Redundant prefixes compound into noise
// "failed to x: failed to y: failed to create store: the error"
return fmt.Errorf("failed to create new store: %w", err)

// ✅ Terse context — reads well when chained
// "x: y: new store: the error"
return fmt.Errorf("new store: %w", err)
```

```go
// ❌ Bad error strings
errors.New("Failed to connect to database.")
errors.New("ERROR: connection refused")
fmt.Errorf("Unable to parse %s", name)

// ✅ Good error strings
errors.New("connect to database")
errors.New("connection refused")
fmt.Errorf("parse %s: %w", name, err)
```

### 6. The "Handle or Return" Principle — Handle Each Error Exactly Once

**An error should be either handled (logged, recovered from, converted) or returned — never both.**

Dave Cheney:

> You should only handle errors once. Handling an error means inspecting the error value, and making a decision. [...] making more than one decision in response to a single error is also problematic.

```go
// ❌ Handles AND returns — error logged at every level
func Write(w io.Writer, buf []byte) error {
    _, err := w.Write(buf)
    if err != nil {
        log.Println("unable to write:", err)  // ← handling
        return err                              // ← also returning
    }
    return nil
}

// ✅ Returns with context — caller decides what to do
func Write(w io.Writer, buf []byte) error {
    _, err := w.Write(buf)
    if err != nil {
        return fmt.Errorf("write: %w", err)
    }
    return nil
}

// ✅ Handles and does NOT return — graceful degradation
func emitMetrics(data []byte) {
    if err := send(data); err != nil {
        log.Printf("emit metrics: %v", err)
        // Don't return error — metrics are best-effort
    }
}
```

[Dave Cheney: Don't just check errors](https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully) · [Uber Go Style Guide: Handle Errors Once](https://github.com/uber-go/guide/blob/master/style.md)

The Uber guide enumerates the four valid ways to "handle" an error:
1. **Match and branch** — `errors.Is`/`errors.As` → take different paths
2. **Log and degrade** — non-critical operation, keep going
3. **Convert to domain error** — return a well-defined error appropriate to your layer
4. **Wrap and return** — add context, propagate up

### 7. Structural Patterns — Indent the Error Path

**The happy path should remain at the left edge. Error handling should be indented.**

From Go Code Review Comments:

> Try to keep the normal code path at a minimal indentation, and indent the error handling, dealing with it first.

```go
// ❌ Happy path buried in else
f, err := os.Open(name)
if err == nil {
    d, err := f.Stat()
    if err == nil {
        // use d
    }
}

// ✅ Error case handled first, happy path flows naturally
f, err := os.Open(name)
if err != nil {
    return err
}
d, err := f.Stat()
if err != nil {
    return err
}
// use d
```

[Go Wiki: Code Review Comments](https://go.dev/wiki/CodeReviewComments#indent-error-flow)

### 8. "Errors Are Values" — Reduce Repetition with Patterns

Rob Pike's blog post shows that because errors are values, you can use programming techniques to reduce boilerplate:

```go
// errWriter absorbs errors, checked once at the end
type errWriter struct {
    w   io.Writer
    err error
}

func (ew *errWriter) write(buf []byte) {
    if ew.err != nil {
        return
    }
    _, ew.err = ew.w.Write(buf)
}

// Usage — clean sequential writes
ew := &errWriter{w: fd}
ew.write(p0[a:b])
ew.write(p1[c:d])
ew.write(p2[e:f])
if ew.err != nil {
    return ew.err
}
```

[Go Blog: Errors are values](https://go.dev/blog/errors-are-values)

### 9. Never Inspect `error.Error()` Output Programmatically

Dave Cheney:

> The `Error` method on the `error` interface exists for humans, not code. You shouldn't try to change the behaviour of your program by inspecting it.

```go
// ❌ Brittle — breaks if message changes
if strings.Contains(err.Error(), "not found") { ... }

// ✅ Structured — stable across refactors
if errors.Is(err, ErrNotFound) { ... }
```

[Dave Cheney: Don't just check errors](https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully)

### 10. Document Your Error API Contract

The Go 1.13 blog post emphasizes: if your function returns specific matchable errors, **document that contract** and don't return bare sentinels (wrap them so callers use `errors.Is` from the start):

```go
// FetchItem returns the named item.
//
// If no item with the name exists, FetchItem returns
// an error wrapping ErrNotFound.
func FetchItem(name string) (*Item, error) {
    if !exists(name) {
        return nil, fmt.Errorf("fetch %q: %w", name, ErrNotFound)
    }
    // ...
}
```

Returning `ErrNotFound` directly (unwrapped) invites callers to write `err == ErrNotFound`, which breaks if you later want to add context. Always wrap, even if it's just `fmt.Errorf("%w", ErrNotFound)`. [Go Blog: Working with Errors in Go 1.13](https://go.dev/blog/go1.13-errors)

## Quick Reference: Rules

| # | Rule | Source |
|---|---|---|
| 1 | Use `errors.Is` / `errors.As`, never `==` or type assertion | Go 1.13 blog |
| 2 | Wrap with `%w` only when the cause is part of your API contract | Go 1.13 blog, Uber |
| 3 | Use `%v` to hide implementation detail errors | Go 1.13 blog, Uber |
| 4 | Sentinel `var ErrXxx` for static matchable errors; custom `XxxError` types for dynamic | Uber, Google |
| 5 | Error strings: lowercase, no trailing punctuation | Go Code Review Comments, Google |
| 6 | No "failed to" / "unable to" prefixes — they compound into noise | Uber |
| 7 | Handle each error exactly once: wrap+return OR log+degrade, never both | Dave Cheney, Uber |
| 8 | `panic` only for unrecoverable states and init; never for operational errors | Effective Go, Uber |
| 9 | Convert internal panics to errors at package boundaries | Effective Go |
| 10 | Never inspect `error.Error()` output to make decisions | Dave Cheney |
| 11 | Keep happy path at left edge; indent error handling | Go Code Review Comments |
| 12 | Assert error behavior (interfaces), not type, when possible | Dave Cheney |
| 13 | Document which sentinel/type errors your functions return | Go 1.13 blog |

## Sources

### Kept
- **Go Blog: Working with Errors in Go 1.13** (https://go.dev/blog/go1.13-errors) — Primary source on `%w`, `errors.Is`/`As`, wrapping decisions. Written by Damien Neil and Jonathan Amsterdam (Go team).
- **Go Blog: Error handling and Go** (https://go.dev/blog/error-handling-and-go) — Foundational Go team post on error philosophy (Andrew Gerrand).
- **Go Blog: Errors are values** (https://go.dev/blog/errors-are-values) — Rob Pike's seminal post on reducing error handling boilerplate.
- **Effective Go: Panic/Recover** (https://go.dev/doc/effective_go#errors) — Official Go team guidance on when panic is appropriate.
- **Go Wiki: Code Review Comments** (https://go.dev/wiki/CodeReviewComments) — Go team's code review norms: error strings, indent error flow.
- **Google Go Style Guide** (https://google.github.io/styleguide/go/decisions) — Google-internal Go conventions, publicly shared. Detailed error string and error handling rules.
- **Uber Go Style Guide** (https://github.com/uber-go/guide/blob/master/style.md) — Widely adopted industry guide. Best decision matrix for error types, clearest "handle once" guidance.
- **Dave Cheney: Don't just check errors, handle them gracefully** (https://dave.cheney.net/2016/04/27/dont-just-check-errors-handle-them-gracefully) — The canonical talk on sentinel vs type vs opaque errors and behavior assertion.

### Dropped
- Generic blog posts / Medium articles on Go error handling — redundant coverage of the same patterns without authoritative weight.
- Pre-Go 1.13 error handling libraries (pkg/errors, etc.) — superseded by stdlib `%w`, `errors.Is`, `errors.As`. Dave Cheney's `pkg/errors` concepts were absorbed into the language; the package itself is in maintenance mode.
- Go 2 error handling proposals — never shipped; the `check`/`handle` draft design was abandoned.

## Gaps

1. **`errors.Join` (Go 1.20)** — Not deeply covered here. Go 1.20 added `errors.Join` for combining multiple errors into one that unwraps to all of them. Worth a follow-up for concurrent error collection patterns.
2. **Structured/typed error packages (2024+)** — Emerging patterns around `connectrpc`'s error model, gRPC status codes mapped to Go errors, and `hashicorp/go-multierror` vs stdlib `errors.Join` deserve separate research.
3. **`slog` integration** — Go 1.21's `log/slog` has implications for error logging patterns (structured logging with error attributes vs `%v` formatting). Not covered by the canonical sources yet.
4. **Benchmarks** — Performance characteristics of `errors.Is`/`errors.As` chain traversal on deep error stacks vs flat comparisons. No authoritative benchmarks found.
