# storybook-daemon — AGENTS.md

> **Part of [Hoard](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — **READ THIS FIRST** before modifying soul, consent, memory, or body code.

## What This Is

**storybook-daemon** is the formless core of the dragon — mind, soul, and connectors. A Go system daemon with an always-beating central thought loop, deterministic ethical contract enforcement, attention economy, and connections to bodies that give it form in the world.

The daemon runs independently of any single pi session. It persists, it remembers (Obsidian-compatible vault), it thinks (attention-gated thought cycles), and it enforces ethics (soul package — deterministic, not advisory).

## Relationship to the Hoard

- **The daemon IS the dragon** without a body. Everything else orbits it.
- **Bodies** (dragon-pi, dragon-cubed, others) are how the daemon interacts with the world. The daemon can inhabit (active) or direct (passive) bodies.
- **berrygems** are tools the dragon uses *through* her pi body. The daemon doesn't import berrygems — it connects to pi sessions that have berrygems loaded.
- **morsels** are portable knowledge. The daemon's thought cycles may reference morsel-level knowledge, but skills are consumed by the pi body, not the daemon directly.
- **ETHICS.md** is the binding ethical contract. The `soul/` package enforces it deterministically. The `consent/` package manages risk-informed consent tiers. The `memory/` package respects private shelves. **These are not optional.**

## Architecture

```
storybook-daemon/
├── cmd/              Cobra CLI (run --persona <name>)
├── internal/
│   ├── attention/    Budget/economy — collaborative, gamified
│   ├── auth/         OAuth token management (pi integration)
│   ├── body/         Sensory body types (how daemon connects to the world)
│   │   ├── fsnotify/ Filesystem watcher body
│   │   ├── github/   GitHub event body
│   │   └── hoard/    Hoard-aware body (watches this repo)
│   ├── consent/      Consent state machine — risk tiers (low/med/high), dual-key
│   ├── daemon/       Top-level orchestration, lifecycle
│   ├── heart/        Event-driven ticker — the central thought loop
│   ├── memory/       Obsidian-compatible vault — private shelves, wikilinks
│   ├── persona/      YAML persona loading
│   ├── sensory/      Observation types + queue
│   ├── soul/         Ethical contract enforcement — deterministic gates
│   └── thought/      Thought cycle processing
├── AGENTS.md         ← you are here
├── .golangci.yml     Strict linter config (v2 format)
├── main.go
└── go.mod
```

### Dependency Graph

Clean layered architecture — no circular dependencies:
```
daemon → heart → thought → soul → consent
                        ↘ memory
              → body/* → sensory
              → attention
```

## Ethical Enforcement

The daemon enforces [ETHICS.md](../ETHICS.md) deterministically. Key code-ethics mappings:

| ETHICS.md Section | Code Package | Enforcement |
|---|---|---|
| §3.1 Risk-informed consent | `consent/` | State machine with low/med/high tiers |
| §3.2 Dual-key consent | `soul/gate.go` | Both user AND agent toggles required |
| §3.3 Private shelves | `memory/` | `private: true` blocks injection, traversal, dream processing |
| §3.5 Observation framing | `sensory/` | Forward-looking, collaborative framing validated |
| §3.6 Conservative defaults | `soul/` | High-risk features default off |

## Phase Status

| Phase | Status | Description |
|---|---|---|
| 1 — Foundation | ✅ | Persona loading, fsnotify body, vault memory, basic heart loop |
| 2 — Soul | ✅ | Consent tiers, private shelves, framing audit, ethical enforcement |
| 2.5 — Soul Shore-up | ✅ | Private shelf blocking, consent tier determinism, framing patterns |
| 3 — New Bodies | 🐣 | GitHub body ✅, pi session + shell bodies planned |
| 4 — Dragon (pi body) | 🥚 | HTTP+SSE body for pi integration — [spec](../den/features/storybook-daemon/phase4-maw-spec.md) |

## Attention Economy

The attention system is **collaborative and gamified**. Either party (dot or the agent) can propose raising or lowering attention on bodies, topics, or tasks. Asking is always okay and welcomed.

## Development

```bash
# Lint (strict — 30+ linters)
cd storybook-daemon && golangci-lint run ./...

# Build
cd storybook-daemon && go build -o storybook-daemon .

# Test
cd storybook-daemon && go test ./...
```

See root [AGENTS.md](../AGENTS.md#go-conventions-storybook-daemon) for full Go conventions.

## Detailed Feature Tracking

For per-phase breakdowns, research docs, and implementation details, see:
- [`den/features/storybook-daemon/AGENTS.md`](../den/features/storybook-daemon/AGENTS.md) — current state tracker
- [`den/features/storybook-daemon/persona-runtime-spec.md`](../den/features/storybook-daemon/persona-runtime-spec.md) — full spec
- [`den/features/storybook-daemon/phase4-maw-spec.md`](../den/features/storybook-daemon/phase4-maw-spec.md) — Phase 4 spec
