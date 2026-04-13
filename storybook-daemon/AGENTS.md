# storybook-daemon — AGENTS.md

> **Part of [Hoard](../AGENTS.md)** — read the root AGENTS.md first for project-wide context.
> **Governed by [ETHICS.md](../ETHICS.md)** — **READ THIS FIRST** before modifying soul, consent, memory, or nerve code.

## What This Is

**storybook-daemon** is the formless core of the dragon — mind, soul, and connectors. A Go system daemon with an attention-gated thought loop, deterministic ethical contract enforcement, attention economy, and connections to nerves that bridge perception and action.

The daemon runs independently of any single pi session. It persists, it remembers (Obsidian-compatible vault), it thinks (attention-gated thought cycles), and it enforces ethics (soul package — deterministic, not advisory).

**Pi is the persona.** The daemon doesn't run its own inference — each beat spawns a `pi --mode text` subprocess with a persistent session file. Pi handles model management, tool dispatch, multi-turn context, and its own auth. The daemon keeps what pi can't: heartbeat, soul, sensory aggregation, attention economy, and memory vault. See `internal/thought/pi.go`.

**Psi** is the primary interface: a Qt/QML chat client connecting to each persona's SSE + MCP psi interfaces. SSE for the thought stream, MCP for memory/stone/quest participation. See `../psi/`.

## Relationship to the Hoard

- **The daemon IS the dragon** without a body. Everything else orbits it.
- **Nerves** (`hoard`, others planned) are sensory connectors to external systems — git repos, GitHub, shell. They carry perception inward and action outward.
- **Psi interfaces** (`sse`, `mcp`) are communication surfaces the daemon exposes to the world — dot's chat window, MCP tool connections. Named after psionics: the channel through which the daemon reaches outward and the world reaches in.
- **Pi is the brain.** The daemon spawns `pi --mode text` per beat with a persistent session. Pi owns inference, tools, and multi-turn context. The daemon owns the environment pi runs in (sensory context, ethics, attention).
- **berrygems** are tools the dragon uses _through_ her pi body — including the one the daemon spawns. The daemon doesn't import berrygems; pi loads them.
- **morsels** are portable knowledge. The daemon's thought cycles may reference morsel-level knowledge, but skills are consumed by the pi body, not the daemon directly.
- **ETHICS.md** is the binding ethical contract. The `soul/` package enforces it deterministically. The `consent/` package manages risk-informed consent tiers. The `memory/` package respects private shelves. **These are not optional.**

## Architecture

```
storybook-daemon/
├── cmd/              Cobra CLI (run --persona <name>)
├── internal/
│   ├── attention/    Budget/economy — collaborative, gamified
│   ├── conversation/ Output-capture ledger — feeds psi/vault/soul; compacts to vault
│   ├── nerve/        Sensory nerves — connectors to external systems
│   │   └── hoard/    Hoard-aware nerve (watches this repo)
│   ├── psi/          Psi interfaces — communication surfaces exposed to the world
│   │   ├── sse/      HTTP+SSE dot interface (chat stream, state, message ingestion)
│   │   └── mcp/      MCP tool server (memory, attention, stone, quest dispatch)
│   ├── consent/      Consent state machine — risk tiers (low/med/high), dual-key
│   ├── daemon/       Top-level orchestration, lifecycle, pi session config
│   ├── heart/        Event-driven ticker — the central thought loop
│   ├── memory/       Obsidian-compatible vault — private shelves, wikilinks
│   ├── persona/      YAML persona loading (pi model/thinking, flat beat cost)
│   ├── quest/        Ally dispatch — stone broker, cascade, rally/chain
│   ├── sensory/      Observation types + queue
│   ├── soul/         Ethical contract enforcement — deterministic gates + audits
│   ├── stone/        Shared stone Message type
│   ├── storybook/    Multi-persona orchestrator
│   └── thought/      Thought cycle — pi subprocess per beat (pi.go), sensory context
├── AGENTS.md         ← you are here
├── .golangci.yml     Strict linter config (v2 format)
├── main.go
└── go.mod
```

### Dependency Graph

Clean layered architecture — no circular dependencies:

```
daemon → heart → thought → pi (subprocess spawn, env filter)
                         → soul → consent
                         → conversation → memory
              → nerve/* → sensory
              → psi/*   → sensory
                       → quest (MCP only) → stone
              → attention
```

The daemon builds the pi system prompt at startup from `~/.config/storybook-daemon/user-context.md` + persona identity (name, flavor, voice). Persona YAML `system_prompt` field acts as a full override if set.

## Pi Subprocess per Beat

Each thought cycle spawns:

```
pi --mode text -p \
   --model <persona.llm.model> \
   --system-prompt <composed-prompt.md> \
   --thinking <persona.llm.thinking> \
   --session <~/.config/storybook-daemon/sessions/<persona>.jsonl> \
   "<sensory context message>"
```

**Session file** — persistent JSONL at `~/.config/storybook-daemon/sessions/<persona>.jsonl`. Pi appends to it each beat, maintaining multi-turn context across beats without the daemon managing conversation history.

**Context message** — sensory-only: attention, pinned memories, nerve states, recent events. No conversation replay — pi owns that via the session file.

**Environment** — same filtering as ally quest dispatch. Strips `_API_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`, `_CREDENTIAL`, and `AWS_/GITHUB_/OPENAI_/AZURE_/GCP_` prefixes. Adds `HOARD_STONE_PORT=<mcp_port>` so pi can reach daemon MCP tools (memory, attention_state, stone, quests).

**Attention cost** — flat per-beat (`persona.costs.beat`, default 15). The daemon can't inspect pi's internal tool usage, so it charges once per cycle.

## Ethical Enforcement

The daemon enforces [ETHICS.md](../ETHICS.md) deterministically. Key code-ethics mappings:

| ETHICS.md Section          | Code Package   | Enforcement                                                   |
| -------------------------- | -------------- | ------------------------------------------------------------- |
| §3.1 Risk-informed consent | `consent/`     | State machine with low/med/high tiers                         |
| §3.2 Dual-key consent      | `soul/gate.go` | Both user AND agent toggles required                          |
| §3.3 Private shelves       | `memory/`      | `private: true` blocks injection, traversal, dream processing |
| §3.5 Observation framing   | `sensory/`     | Forward-looking, collaborative framing validated              |
| §3.6 Conservative defaults | `soul/`        | High-risk features default off                                |

The soul's framing audit scans pi's captured output (via conversation ledger hook). The memory-transparency audit fires on every `vault.Write` including conversation compaction.

## Phase Status

| Phase                | Status | Description                                                                                                                                                                                    |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation       | ✅     | Persona loading, fsnotify nerve, vault memory, basic heart loop                                                                                                                                |
| 2 — Soul             | ✅     | Consent tiers, private shelves, framing audit, ethical enforcement                                                                                                                             |
| 2.5 — Soul Shore-up  | ✅     | Private shelf blocking, consent tier determinism, framing patterns                                                                                                                             |
| 3 — New Nerves + Psi | ✅     | Hoard nerve ✅, SSE psi ✅, MCP psi ✅ (memory/attention/stone/quest via MCP protocol), multi-persona orchestration ✅                                                                         |
| 3.5 — Local LLM      | ⚰️     | Superseded by pi-as-persona. llamacli/anthropic providers removed. Pi handles its own model/auth/tool dispatch.                                                                                |
| 4 — Psi Qt client    | ✅     | Qt/QML chat client — core shell ✅, dual SSE+MCP connection ✅, conversation ledger ✅, unified ConversationStream ✅. See `../psi/AGENTS.md` (forthcoming) for sub-project details.           |
| 5 — pi-as-persona    | ✅     | Thought cycle spawns pi subprocess per beat with persistent session. System prompt composed from persona + user-context.md. Flat per-beat attention cost. `internal/llm/` and `auth/` deleted. |

## Attention Economy

The attention system is **collaborative and gamified**. Either party (dot or the agent) can propose raising or lowering attention on nerves, topics, or tasks. Asking is always okay and welcomed.

Per-tool costs (think/speak/remember/search) were replaced by a flat `costs.beat` when inference moved into pi. The daemon can no longer observe individual tool calls — pi dispatches them internally — so it charges once per thought cycle.

## Config Layout

```
~/.config/storybook-daemon/
├── personas/
│   ├── ember.yaml              Ember's persona config
│   └── maren.yaml              Maren's persona config
├── memory/
│   └── <persona>/              Obsidian-compatible vault per persona
├── sessions/
│   └── <persona>.jsonl         Pi persistent session per persona
└── user-context.md             dot's profile — composed into system prompt at startup
```

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
```

See root [AGENTS.md](../AGENTS.md#go-conventions-storybook-daemon) for full Go conventions.

## Detailed Feature Tracking

For per-phase breakdowns, research docs, and implementation details, see:

- [`docs/superpowers/specs/2026-04-13-pi-as-persona-design.md`](../docs/superpowers/specs/2026-04-13-pi-as-persona-design.md) — pi-as-persona design
- [`docs/superpowers/specs/2026-04-13-psi-sub-project-2-design.md`](../docs/superpowers/specs/2026-04-13-psi-sub-project-2-design.md) — psi dual-connection design
- [`den/features/storybook-daemon/AGENTS.md`](../den/features/storybook-daemon/AGENTS.md) — legacy state tracker
