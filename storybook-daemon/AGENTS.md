# storybook-daemon — AGENTS.md

> **Part of [Hoard](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — **READ THIS FIRST** before modifying soul, consent, memory, or nerve code.

## What This Is

**storybook-daemon** is the formless core of the dragon — mind, soul, and connectors. A Go system daemon with an attention-gated thought loop, deterministic ethical contract enforcement, attention economy, and connections to nerves that bridge perception and action.

The daemon runs independently of any single pi session. It persists, it remembers (Obsidian-compatible vault), it thinks (attention-gated thought cycles), and it enforces ethics (soul package — deterministic, not advisory).

**Psi** is the primary interface: a Qt/QML chat client connecting to one or more persona SSE psi interfaces via HTTP+SSE. Each agent gets a chat thread; tool invocations render in dedicated Qt windows. Agents can be proactive (heartbeat-driven) or reactive (message-triggered only).

> **✅ Auth blocker resolved** — the `llm.Provider` abstraction decouples inference from Pi OAuth. Personas backed by `llamacli` (local llama-cli subprocess) require no network credentials and can run proactive heartbeat-driven thought cycles today. Anthropic-backed personas still require Pi OAuth (reactive path). See the `llm:` section of persona YAML.

## Relationship to the Hoard

- **The daemon IS the dragon** without a body. Everything else orbits it.
- **Nerves** (`hoard`, others planned) are sensory connectors to external systems — git repos, GitHub, shell. They carry perception inward and action outward.
- **Psi interfaces** (`sse`, `mcp`) are communication surfaces the daemon exposes to the world — dot's chat window, MCP tool connections. Named after psionics: the channel through which the daemon reaches outward and the world reaches in.
- **berrygems** are tools the dragon uses _through_ her pi body. The daemon doesn't import berrygems — it connects to pi sessions that have berrygems loaded. Berrygems that currently render Pi-specific panels will have native Qt window equivalents in the Psi Qt client.
- **morsels** are portable knowledge. The daemon's thought cycles may reference morsel-level knowledge, but skills are consumed by the pi body, not the daemon directly.
- **ETHICS.md** is the binding ethical contract. The `soul/` package enforces it deterministically. The `consent/` package manages risk-informed consent tiers. The `memory/` package respects private shelves. **These are not optional.**

## Architecture

```
storybook-daemon/
├── cmd/              Cobra CLI (run --persona <name>)
├── internal/
│   ├── attention/    Budget/economy — collaborative, gamified
│   ├── auth/         OAuth token management (pi integration, anthropic provider only)
│   ├── nerve/        Sensory nerves — connectors to external systems
│   │   ├── hoard/    Hoard-aware nerve (watches this repo)
│   │   └── github/   GitHub event nerve (planned)
│   ├── llm/          LLM provider abstraction
│   │   ├── provider.go    Provider interface + Tool/ToolCall types
│   │   ├── anthropic/     Anthropic SDK wrapper — multi-turn tool loop, Pi OAuth
│   │   └── llamacli/      llama-cli subprocess — single-turn, DeepSeek R1 <think> parsing
│   ├── psi/          Psi interfaces — communication surfaces exposed to the world
│   │   ├── sse/      HTTP+SSE dot interface (chat stream, state, message ingestion)
│   │   └── mcp/      MCP tool server (vault, attention, stone for CC/VSCode/etc.)
│   ├── consent/      Consent state machine — risk tiers (low/med/high), dual-key
│   ├── daemon/       Top-level orchestration, lifecycle, provider construction
│   ├── heart/        Event-driven ticker — the central thought loop
│   ├── memory/       Obsidian-compatible vault — private shelves, wikilinks
│   ├── persona/      YAML persona loading (includes LLMConfig)
│   ├── sensory/      Observation types + queue
│   ├── soul/         Ethical contract enforcement — deterministic gates
│   └── thought/      Thought cycle — provider-agnostic, tool dispatch
├── AGENTS.md         ← you are here
├── .golangci.yml     Strict linter config (v2 format)
├── main.go
└── go.mod
```

### Dependency Graph

Clean layered architecture — no circular dependencies:

```
daemon → heart → thought → llm/provider (interface)
                         → soul → consent
                         ↘ memory
              → nerve/* → sensory
              → psi/*   → sensory
              → attention
llm/anthropic → auth (Pi OAuth)
llm/llamacli  → (no external deps — spawns llama-cli subprocess)
```

## Ethical Enforcement

The daemon enforces [ETHICS.md](../ETHICS.md) deterministically. Key code-ethics mappings:

| ETHICS.md Section          | Code Package   | Enforcement                                                   |
| -------------------------- | -------------- | ------------------------------------------------------------- |
| §3.1 Risk-informed consent | `consent/`     | State machine with low/med/high tiers                         |
| §3.2 Dual-key consent      | `soul/gate.go` | Both user AND agent toggles required                          |
| §3.3 Private shelves       | `memory/`      | `private: true` blocks injection, traversal, dream processing |
| §3.5 Observation framing   | `sensory/`     | Forward-looking, collaborative framing validated              |
| §3.6 Conservative defaults | `soul/`        | High-risk features default off                                |

## Phase Status

| Phase                | Status | Description                                                                                                                                                                                                                                                        |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Foundation       | ✅     | Persona loading, fsnotify nerve, vault memory, basic heart loop                                                                                                                                                                                                    |
| 2 — Soul             | ✅     | Consent tiers, private shelves, framing audit, ethical enforcement                                                                                                                                                                                                 |
| 2.5 — Soul Shore-up  | ✅     | Private shelf blocking, consent tier determinism, framing patterns                                                                                                                                                                                                 |
| 3 — New Nerves + Psi | 🐣     | GitHub nerve ✅, SSE psi ✅ (HTTP+SSE dot interface), MCP psi ✅ (memory/attention/stone via MCP protocol), multi-persona orchestration ✅ (storybook.go + run-all CLI), pi session + shell nerves planned                                                         |
| 3.5 — Local LLM      | ✅     | `internal/llm/` provider abstraction; `llamacli` backend (llama-cli subprocess, DeepSeek R1 `<think>` parsing, single-turn, GPU offload); `anthropic` backend extracted from cycle; `LLMConfig` in persona YAML; proactive ticking unblocked for llamacli personas |
| 4 — Psi Qt client    | 🐣     | Qt/QML chat client — core shell + Ember chat (sub-project 1 ✅), multi-session tabs, panel system, context inspector planned                                                                                                                                       |

## Attention Economy

The attention system is **collaborative and gamified**. Either party (dot or the agent) can propose raising or lowering attention on nerves, topics, or tasks. Asking is always okay and welcomed.

## Development

```bash
# Lint (strict — 30+ linters)
cd storybook-daemon && golangci-lint run ./...

# Build
cd storybook-daemon && go build -o storybook-daemon .

# Test
cd storybook-daemon && go test ./...

# Run a single persona
cd storybook-daemon && go run . run --persona ember

# Run all personas from ~/.config/storybook-daemon/personas/
cd storybook-daemon && go run . run-all --all

# Run specific personas
cd storybook-daemon && go run . run-all --personas ember,maren
```

See root [AGENTS.md](../AGENTS.md#go-conventions-storybook-daemon) for full Go conventions.

## Detailed Feature Tracking

For per-phase breakdowns, research docs, and implementation details, see:

- [`den/features/storybook-daemon/AGENTS.md`](../den/features/storybook-daemon/AGENTS.md) — current state tracker
- [`den/features/storybook-daemon/persona-runtime-spec.md`](../den/features/storybook-daemon/persona-runtime-spec.md) — full spec
- [`den/features/storybook-daemon/phase4-maw-spec.md`](../den/features/storybook-daemon/phase4-maw-spec.md) — Phase 4 spec
