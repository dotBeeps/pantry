# Research: Go Project Structure & Package Design for Daemon Applications

## Summary

Go project structure best practices center on **simplicity, domain-driven packages, and the dependency rule** (domain core has zero external dependencies). The Go team explicitly rejects the "golang-standards/project-layout" repo as not standard. Instead, guidance from Russ Cox, the Go blog, Google's style guide, Mat Ryer, and Ben Johnson converges on: use `internal/` to enforce boundaries, `cmd/` for entry points, define interfaces at the consumer, wire dependencies manually via constructors, and organize packages by domain concern — not by technical layer.

## Findings

### 1. The "Standard Layout" Is Not Standard

**Russ Cox (Go tech lead) explicitly disavowed golang-standards/project-layout:**

> "It is unfortunate that this is being put forth as 'golang-standards' when it really is not. I'm commenting here because I am starting to see people say things like 'you are not using the standard Go project layout' and linking to this repo." — [Russ Cox, GitHub Issue #117](https://github.com/golang-standards/project-layout/issues/117)

The vast majority of Go packages do **not** use `pkg/` subdirectories. The official Go team guidance is:

- Start flat. Add structure when the project needs it.
- The only "official" layout guidance is [go.dev/doc/modules/layout](https://go.dev/doc/modules/layout), which describes three patterns: single package, single module with multiple packages, and multi-module repo.
- `internal/` is the one directory with language-enforced semantics — the Go toolchain prevents imports from outside the parent tree.

**Rule: Never use `pkg/`. Use `internal/` for implementation packages. Start flatter than you think you need.**

[Source: go.dev/doc/modules/layout](https://go.dev/doc/modules/layout) · [Source: Issue #117](https://github.com/golang-standards/project-layout/issues/117)

---

### 2. `cmd/` Layout for Daemon Applications

The `cmd/` pattern is one of the few universally agreed conventions. Each subdirectory under `cmd/` holds a `main` package for one binary. For a daemon:

```
cmd/
  daemon/         # or cmd/dragon-daemon/
    main.go       # entry point — parses flags/config, wires deps, starts daemon
```

**Main should be thin.** Mat Ryer's 2024 pattern crystallizes this: `main()` calls a `run()` function that accepts all external dependencies (stdin, stdout, stderr, env, args, ctx) and returns an error. This makes the binary testable:

```go
func main() {
    ctx := context.Background()
    ctx, cancel := signal.NotifyContext(ctx, os.Interrupt)
    defer cancel()
    if err := run(ctx, os.Stdout, os.Args); err != nil {
        fmt.Fprintf(os.Stderr, "%s\n", err)
        os.Exit(1)
    }
}

func run(ctx context.Context, w io.Writer, args []string) error {
    // parse config, wire services, start daemon
}
```

**Rule: `cmd/<name>/main.go` does three things: parse config, wire dependencies, call `run()`. No business logic. The `run()` function is the real entry point and takes explicit deps.**

[Source: Mat Ryer, "How I write HTTP services after 13 years" (Grafana, 2024)](https://grafana.com/blog/2024/02/09/how-i-write-http-services-in-go-after-13-years/)

---

### 3. `internal/` Package Pattern — Enforced Privacy

The Go toolchain enforces that packages under `internal/` can only be imported by code rooted at the parent of `internal/`. This is the **only** directory name with compiler-enforced semantics.

```
dragon-daemon/
  internal/
    daemon/       # orchestration — only importable within dragon-daemon/
    heart/        # tick loop
    soul/         # ethical enforcement
    memory/       # vault operations
    ...
  cmd/
    dragon-daemon/
      main.go     # can import internal/* — same parent tree
```

**When to use `internal/`:**
- Always, for application code that shouldn't become a public API
- For packages you might refactor or rename without breaking external consumers
- For domain types that only make sense within this binary

**When NOT to use `internal/`:**
- Libraries meant for reuse across modules — put those at the module root or in named packages
- Shared types across multiple binaries in a monorepo — consider a top-level `domain/` or root-level types package instead

**Rule: Default to `internal/` for all non-main packages in a daemon. Promote to top-level only when another module genuinely needs to import it.**

[Source: go.dev/doc/modules/layout](https://go.dev/doc/modules/layout)

---

### 4. Ben Johnson's Domain-Driven Package Design

Ben Johnson's "Standard Package Layout" (2016, updated via GoBeyond.dev) is the most influential non-official guide. Core principles:

**a) Root package defines domain types and interfaces:**
The root package (e.g., `package myapp`) contains domain types (`User`, `Event`, `Thought`) and service interfaces (`UserService`, `ThoughtCycle`). It has **zero dependencies** on external packages — no database drivers, no HTTP frameworks, nothing.

```go
package dragon

// ThoughtCycle generates thoughts from sensory input.
type ThoughtCycle interface {
    Run(ctx context.Context) error
}

// Persona defines a loaded persona configuration.
type Persona struct {
    Name        string
    Directives  []string
    Boundaries  []Boundary
}
```

**b) Implementation packages depend inward:**
Packages like `internal/thought`, `internal/memory`, `internal/body` import the root domain types and implement the interfaces. Dependencies flow **one direction: inward toward the domain core**.

**c) `main` is the adapter between implementations:**
The `main` package (or a `cmd/` entry point) is the **only** place where all packages meet. It imports every implementation, wires them together, and starts the process.

**Rule: Domain types and interfaces live in the root package (or a dedicated `internal/domain/` package). Implementation packages import the domain, never each other (unless genuinely layered). The `main` package is the wiring point.**

[Source: Ben Johnson, "Standard Package Layout"](https://medium.com/@benbjohnson/standard-package-layout-7cdbc8391fc1) · [Source: GoBeyond.dev](https://www.gobeyond.dev/standard-package-layout/)

---

### 5. Interface Design: Accept Interfaces, Return Structs

This is one of the most widely cited Go proverbs, originating from Jack Lindamood and reinforced by the Go team, Mat Ryer, and Google's style guide.

**The principle:** Functions and methods should accept interface parameters (to be flexible about what callers pass) but return concrete types (to give callers maximum capability).

```go
// Good: accepts interface — callers can pass any implementation
func NewDaemon(heart Heart, soul Soul, body Body) *Daemon { ... }

// Good: returns concrete — callers get full type, can use any method
func NewVault(dir string) *Vault { ... }

// Bad: returns interface — hides capabilities, forces type assertions
func NewVault(dir string) VaultReader { ... }
```

**Google's Go Style Guide makes this explicit:**

> "Go code should generally only define interfaces when they are going to be used... the implementing package should return concrete (usually pointer or struct) types. That way, new methods can be added to implementations without requiring extensive refactoring."

**Where interfaces are defined matters.** The consumer defines the interface, not the producer:

```go
// In package thought (consumer):
type MemoryReader interface {
    Recent(ctx context.Context, n int) ([]memory.Note, error)
}

// In package memory (producer):
// Vault is a concrete type — does NOT define its own interface
type Vault struct { ... }
func (v *Vault) Recent(ctx context.Context, n int) ([]Note, error) { ... }
```

This way `thought` depends on its own interface, not on the `memory` package. The `memory.Vault` implicitly satisfies `thought.MemoryReader`.

**Key exceptions:**
- Standard library-like interfaces (`io.Reader`, `io.Writer`) defined by the producer when the abstraction is fundamental
- Well-known domain interfaces in the root package that multiple consumers share

**Rule: Define interfaces at the consumer, not the producer. Return concrete types. Use small interfaces (1-3 methods). Name single-method interfaces with `-er` suffix.**

[Source: Google Go Style Guide — Decisions](https://google.github.io/styleguide/go/decisions) · [Source: Go Code Review Comments](https://go.dev/wiki/CodeReviewComments) · [Source: Mat Ryer, Grafana 2024](https://grafana.com/blog/2024/02/09/how-i-write-http-services-in-go-after-13-years/)

---

### 6. Dependency Injection Without Frameworks

Go's community overwhelmingly prefers **manual constructor injection** over DI frameworks (Wire, Dig, etc.). Mat Ryer, Ben Johnson, and the Google style guide all advocate this approach.

**Constructor injection pattern:**

```go
// Each service declares what it needs as constructor parameters
func NewDaemon(cfg Config, heart *Heart, soul *Soul, body *Body) *Daemon {
    return &Daemon{
        cfg:   cfg,
        heart: heart,
        soul:  soul,
        body:  body,
    }
}
```

**Wiring happens in `main` (or `run()`):**

```go
func run(ctx context.Context, cfg Config) error {
    vault := memory.NewVault(cfg.VaultDir)
    ledger := attention.NewLedger()
    aggregator := sensory.NewAggregator()
    body := body.New(aggregator, cfg.WatchPaths)
    thought := thought.NewCycle(vault, aggregator, ledger)
    soul := soul.NewEnforcer(cfg.Persona.Boundaries, ledger, vault)
    heart := heart.New(thought, soul, body, cfg.TickInterval)
    daemon := daemon.New(heart, soul, body, vault)
    return daemon.Run(ctx)
}
```

**Why no frameworks:**
- The dependency graph is visible in one place
- Compile-time type checking catches wiring errors
- No reflection magic, no runtime failures
- When wiring becomes painful, it signals your architecture is too complex

**Option structs for complex constructors** (from Google's style guide):

```go
type DaemonConfig struct {
    Heart        *Heart
    Soul         *Soul
    Body         *Body
    TickInterval time.Duration
    Logger       *slog.Logger
}

func NewDaemon(cfg DaemonConfig) *Daemon { ... }
```

**Rule: Wire dependencies manually in `main`/`run()`. Use constructor functions with explicit parameters. If a constructor exceeds ~5 params, use an option struct. If wiring `main` becomes unmanageable, your package graph is too coupled.**

[Source: Mat Ryer, Grafana 2024](https://grafana.com/blog/2024/02/09/how-i-write-http-services-in-go-after-13-years/) · [Source: Google Go Style Guide — Best Practices](https://google.github.io/styleguide/go/best-practices)

---

### 7. Package Cohesion & Naming

**The Go blog's package naming guidance** is authoritative:

> "Good package names are short and clear. They are lower case, with no under_scores or mixedCaps. They are often simple nouns."

**Cohesion rules from Go blog and Google style guide:**

1. **Name packages for what they provide, not what they contain.** `heart` (provides heartbeat loop), not `heartbeat_utils`.
2. **Avoid meaningless names.** Never `util`, `common`, `misc`, `helpers`, `types`, `models`, `api`. These grow without bound.
3. **Don't stutter.** `heart.Beat()` not `heart.HeartBeat()`. `memory.Vault` not `memory.MemoryVault`.
4. **One package = one idea.** If you can't describe the package in one sentence without "and", split it.
5. **Don't put all interfaces in one package.** A package named `interfaces` or `types` is an antipattern. Interfaces belong with their consumers, domain types with the domain package.

**Package size guidance** (Google style guide):
- No hard line count rules, but a package should have a clear, singular purpose
- If a package has many files, check whether it's doing too many things
- If a package has one file with 3 functions, it might not deserve to be a package — merge it up

**Rule: Each `internal/` package is a noun describing a domain concept. If you'd say "the X subsystem," `x` is your package name. Kill any package named `util`, `helpers`, `common`, or `types`.**

[Source: Go Blog — Package Names](https://go.dev/blog/package-names) · [Source: Google Go Style Guide](https://google.github.io/styleguide/go/best-practices)

---

### 8. Avoiding Circular Dependencies

Go's compiler **forbids import cycles**. This is a feature, not a limitation — it forces clean layering. Common strategies:

**a) The Dependency Rule (most important):**
Dependencies flow inward. Domain core ← service implementations ← adapters ← main. Never outward.

```
main → daemon → heart → thought → [domain interfaces]
                                     ↑
                      memory ────────┘  (implements domain interfaces)
```

**b) Interface extraction breaks cycles:**
If package A needs to call package B and B needs to call A, extract the interface A needs into A (or into the domain root). B implements that interface without importing A.

```
// Before (cycle): body imports thought, thought imports body
// After: thought defines a SensorySource interface
// body.Body implements thought.SensorySource without importing thought
```

**c) Shared domain package breaks type cycles:**
If two packages both need the same type, that type belongs in the domain root or a shared `internal/domain/` package that both import.

**d) Event/callback patterns break behavioral cycles:**
Instead of A calling B.DoThing(), A emits an event (via channel or callback), and main wires B as the listener.

```go
type Heart struct {
    onTick []func(ctx context.Context) // callbacks wired by main
}
```

**Rule: If you hit a circular import, the fix is always one of: (1) move shared types to the domain root, (2) define an interface at the consumer, (3) use callbacks/channels wired at `main`. Never work around cycles with `internal/shared` grab-bags.**

[Source: Go Blog — Package Names](https://go.dev/blog/package-names) · [Source: Ben Johnson, Standard Package Layout](https://medium.com/@benbjohnson/standard-package-layout-7cdbc8391fc1)

---

### 9. Mat Ryer's 2024 Service Patterns

Mat Ryer's "How I write HTTP services in Go after 13 years" (published on Grafana's blog, 2024) provides battle-tested patterns that generalize beyond HTTP to any long-running service:

**a) `run()` function with explicit dependencies:**
Already covered above — makes the binary testable by injecting stdout, env, context.

**b) Server struct holds shared dependencies:**

```go
type server struct {
    db     *sql.DB
    logger *slog.Logger
    // ... shared deps
}
```

Methods on `server` are handlers/services. This avoids global state and makes testing trivial.

**c) Long-running service with graceful shutdown:**

```go
func (s *server) Run(ctx context.Context) error {
    g, ctx := errgroup.WithContext(ctx)
    g.Go(func() error { return s.heart.Run(ctx) })
    g.Go(func() error { return s.body.Run(ctx) })
    // ...
    return g.Wait()
}
```

Use `errgroup` to run concurrent subsystems and collect the first error. Context cancellation propagates shutdown.

**d) `NewServer` returns `http.Handler` not `*Server`:**
Return the narrowest useful type from constructors when the consumer only needs one capability. But for daemon orchestrators where you need `.Run()`, `.Shutdown()`, etc., returning the concrete struct is correct.

**Rule: Structure daemon orchestration as a struct with a `Run(ctx context.Context) error` method. Use `errgroup` for concurrent subsystems. Accept `context.Context` for cancellation. Make `run()` the real entry point.**

[Source: Mat Ryer, "How I write HTTP services after 13 years" (Grafana, 2024)](https://grafana.com/blog/2024/02/09/how-i-write-http-services-in-go-after-13-years/)

---

### 10. Concrete Structural Rules for Daemon Applications

Synthesizing all sources into actionable rules for `dragon-daemon/`:

```
dragon-daemon/
├── main.go                    # package main — calls cmd
├── cmd/
│   ├── root.go                # Cobra root command
│   └── run.go                 # `run` subcommand — config parse + wiring
├── dragon.go                  # package dragon — root domain types & interfaces
├── internal/
│   ├── daemon/                # orchestrator — owns Run(ctx) lifecycle
│   │   └── daemon.go
│   ├── heart/                 # tick loop — drives thought cycles
│   │   └── heart.go
│   ├── thought/               # LLM thought generation
│   │   └── cycle.go
│   ├── soul/                  # ethical enforcement & auditing
│   │   ├── enforcer.go
│   │   └── rules.go
│   ├── body/                  # fsnotify sensory input
│   │   └── body.go
│   ├── sensory/               # signal aggregation
│   │   ├── aggregator.go
│   │   └── types.go
│   ├── memory/                # Obsidian vault I/O
│   │   ├── vault.go
│   │   └── note.go
│   ├── attention/             # budget tracking
│   │   └── ledger.go
│   ├── auth/                  # pi OAuth
│   │   └── pi.go
│   └── persona/               # persona YAML loading
│       ├── loader.go
│       └── types.go
└── go.mod
```

**The Rules:**

| # | Rule | Source |
|---|------|--------|
| 1 | No `pkg/` directory, ever. | Russ Cox |
| 2 | Root package (`dragon.go`) holds domain types + interfaces. Zero external deps. | Ben Johnson |
| 3 | All implementation lives in `internal/`. | Go spec |
| 4 | Each `internal/` package is one noun, one responsibility. | Go blog |
| 5 | `cmd/` is thin — parse config, wire deps, call `Run()`. | Mat Ryer |
| 6 | Interfaces defined at the consumer, not the producer. | Google style guide |
| 7 | Constructors accept interfaces, return concrete structs. | Go proverbs |
| 8 | Manual constructor DI in `cmd/run.go`. No DI frameworks. | Community consensus |
| 9 | Dependencies flow inward: `main → daemon → subsystems → domain`. | Ben Johnson |
| 10 | Break cycles with interfaces, not `shared` packages. | Go compiler design |
| 11 | Daemon lifecycle: `Run(ctx context.Context) error` + `errgroup`. | Mat Ryer |
| 12 | No `util`, `helpers`, `common`, `types`, `models` packages. | Go blog |
| 13 | Package names don't stutter: `memory.Vault` not `memory.MemoryVault`. | Go blog |
| 14 | Option structs when constructors exceed ~5 params. | Google style guide |
| 15 | Start flat, add packages when you feel real pain, not prophylactic structure. | Russ Cox |

---

## Sources

### Kept
- **Go Modules Layout** (go.dev/doc/modules/layout) — Official Go team guidance on module/package structure. The only sanctioned layout doc.
- **Russ Cox, Issue #117** (github.com/golang-standards/project-layout/issues/117) — Go tech lead explicitly rejecting "standard layout" repo.
- **Go Blog: Package Names** (go.dev/blog/package-names) — Official naming guidance: short nouns, no stutter, no `util`.
- **Go Code Review Comments** (go.dev/wiki/CodeReviewComments) — Semi-official style guide maintained by Go team. Interface placement, naming, error conventions.
- **Google Go Style Guide — Decisions** (google.github.io/styleguide/go/decisions) — Google-internal but published. Authoritative on interfaces, naming, and package design.
- **Google Go Style Guide — Best Practices** (google.github.io/styleguide/go/best-practices) — Option structs, function argument design, package size.
- **Mat Ryer, "How I write HTTP services after 13 years"** (grafana.com/blog/2024/02/09/) — 2024 definitive service structure article. `run()` pattern, graceful shutdown, dep injection.
- **Ben Johnson, "Standard Package Layout"** (medium.com/@benbjohnson) — Most influential community guide. Root domain types, dependency rule, packages-as-layers.
- **Alex Edwards, "The Fat Service Pattern"** (alexedwards.net/blog/the-fat-service-pattern) — Practical DI patterns in Go services without frameworks.

### Dropped
- **golang-standards/project-layout** (github.com) — Explicitly rejected by Go tech lead. Overly complex, promotes `pkg/` antipattern.
- **Effective Go** (go.dev/doc/effective_go) — Good general reference but doesn't address project-level structure. Better for code-level idioms.
- Various "Go project structure 2024" blog posts — Rehash the same points with less authority. No unique insights beyond the primary sources.

---

## Gaps

1. **Ben Johnson's GoBeyond.dev articles** (standard-package-layout, packages-as-layers, wtf-dial) appear to be down or returning errors. The Medium originals are paywalled. The principles are well-documented secondhand but direct quotes couldn't be verified against current live pages.

2. **Daemon-specific lifecycle patterns** (PID files, systemd integration, signal handling, health checks) aren't well-covered by the architecture sources above. These are operational concerns orthogonal to package design. A follow-up research pass on "Go daemon lifecycle systemd integration" would fill this gap.

3. **Testing architecture** — How test packages mirror the internal structure (e.g., `internal/memory/vault_test.go` vs `internal/memory_test/`) deserves its own research brief. The `_test` package suffix for black-box testing is a key Go pattern that interacts with interface design.

4. **Configuration loading patterns** — Where config parsing lives (in `cmd/`? in a dedicated `internal/config/`?) and how Viper/Kong/env vars flow into constructor injection. Mat Ryer's pattern passes `os.Getenv` as a function parameter to `run()`, but Cobra/Viper complicate this.
