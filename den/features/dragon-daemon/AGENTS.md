# dragon-daemon

**Status:** 🐣 in-progress (Phase 1 ✅, Phase 2 ✅, soul shore-up ✅, Phase 4A ✅, lint clean ✅)
**Code:** `dragon-daemon/` (Go module)

## What It Does

A persistent persona runtime. An agent gets a continuous inner life — a thought cycle driven by a heartbeat that responds to events, an attention budget, ethically-enforced behavioral contracts, connected bodies (hoard repo today, Minecraft/APIs later), and Obsidian-compatible memory that persists across sessions. This is how Ember runs nonstop.

## Specs

- **[persona-runtime-spec.md](./persona-runtime-spec.md)** — full design: persona profiles, attention economy, thought cycle, subsystem map, connection interface, Qt scope, phased implementation
- Vault/dream/tone scope: see [hoard-spec §4](../hoard-meta/hoard-spec.md)

## Current State (2026-04-07)

### Phase 1 ✅ — Minimum Viable Ticker

- **Persona loader** — YAML parse + validation + defaults
- **Attention ledger** — pool, hourly regen, floor gate, per-action spend
- **Sensory aggregator** — event queue (drains per cycle), body state merge
- **Hoard body** — git log summary, today's daily log, `log_to_hoard` tool
- **Thought cycle** — sensory → Claude haiku → multi-turn tool dispatch loop
- **Built-in tools** — `think`, `speak`, `remember`, `search_memory`
- **Ticker** → renamed to **heart** in Phase 2
- **Daemon** — signal handling, body construction from YAML, cobra CLI

### Phase 2 ✅ — Auth + Memory + Dragon Triad

- **Pi OAuth auth** (`internal/auth/`) — reads `~/.pi/agent/auth.json`, refreshes tokens, injects Bearer auth per-call.
- **Obsidian vault memory** (`internal/memory/`) — markdown notes with YAML frontmatter. Six memory kinds: `observation`, `decision`, `insight`, `wondering`, `fragment`, `journal`. Pinned notes surface every cycle. Search via grep. Write hooks for audit. `Append()` for journal entries.
- **First-person ethical contract** — `system_prompt` in `ember.yaml` written as a genuine ethical identity document.

#### The Dragon Triad

Three conceptual pillars implemented in this phase:

**💓 Dragon-Heart** (`internal/heart/`) — Event-driven heartbeat timer. Beats on schedule with configurable jitter, but can also be **nudged** by external events for immediate response. Coalescing nudge channel (buffered 1) prevents thundering herds. Renamed from `ticker/`.

**🦎 Dragon-Body** (`internal/body/hoard/watcher.go`) — Filesystem observation via fsnotify. Watches the hoard repo root + `.git/refs/heads/` for commits. 100ms debounce window coalesces rapid writes. Events classified as `commit` (ref changes) or `file_change` (everything else, excluding .git internals). Body interface gained `Start(ctx)` / `Stop()` / `Events()` lifecycle methods.

**👻 Dragon-Soul** (`internal/soul/`) — Ethical contract enforcer with two enforcement phases:
- **Gates** (pre-beat): block thought cycles when violated. `minimum-rest` parses `HH:MM-HH:MM` time windows with midnight crossing support.
- **Audits** (post-beat): verify integrity after each cycle.
  - `attention-honesty`: snapshots ledger before beat, drains audit trail after, verifies arithmetic consistency (no fabricated metrics).
  - `memory-transparency`: write hook auto-journals every vault write to `daily-journal/YYYY-MM-DD`, verifies completeness post-beat.

Beat lifecycle: `soul.Check() → attention floor → soul.PreBeat() → thought.Run() → soul.Verify()`

Fan-in wiring: body event channels → aggregator + heart.Nudge() via daemon goroutines.

### Code Quality (2026-04-07)

- **golangci-lint: 0 issues** — strict `.golangci.yml` with 30+ linters (v2 format)
- Researched from Kubernetes, Prometheus, Docker lint configs
- Key linters: `errcheck`, `wrapcheck`, `errorlint`, `gosec`, `revive`, `gocritic`, `exhaustive`, `nolintlint`
- `gofumpt` formatting, `forbidigo` banning `fmt.Print*` outside `cmd/`
- All `//nolint` directives are specific + explained
- Renames during cleanup: `PersonaConfig`→`Config`, `min`→`floor`, `ParseGate` nil-nil→`ErrDeclarative` sentinel
- Vault path traversal guard added (defense-in-depth)

### Soul Shore-Up ✅ (2026-04-07)

Full ethical contract enforcement added across four phases:

- **Phase A** — test coverage for all existing soul gates and audits (34 tests)
- **Phase B** — private shelf enforcement: `ErrPrivate` sentinel, `filter` silently skips private notes, `OnPrivateAccess` hook, `privateShelfAudit`
- **Phase C** — consent tier system: `ConsentTier` enum, dual-key `ConsentState` (YAML persistence), Obsidian CLI wrapper, `consent-tier` pre-beat gate, `SearchByTag` on vault
- **Phase D** — forward-only framing audit: `OutputCapture` interface, thought cycle output hooks, `framingAudit` scanning for corrective-framing patterns with forward-companion excusal

New packages: `internal/consent/`, `internal/memory/obsidian/`
New soul files: `framing_audit.go`, `consent_gate.go`, `tier.go`

### Not Yet Implemented (Phase 2 stretch)

- Focus manager
- Budget awareness + dragon-breath reporting

### Phase 3 — Bodies + Integration

The daemon currently has one body type (hoard repo watcher). Phase 3 expands what Ember can sense and do:

**New body types:**
- **GitHub body** — sense: PR events, issue mentions, CI status. Tools: comment on PRs, create issues, trigger workflows. Needs: `gh` CLI or GitHub API + pi OAuth token.
- **Pi session body** — sense: active pi sessions (via IPC or filesystem). Tools: send messages to running pi instances, read session state. Enables the daemon to coordinate with interactive coding sessions.
- **Shell body** — sense: cron-like triggers, system events. Tools: run shell commands (gated by soul contracts). Needs: new soul gate for command allowlists.

**Enhanced hoard body:**
- Watch multiple repos (not just the hoard monorepo)
- Sense branch switches, stash events, merge conflicts
- `git_status` and `git_diff` tools for richer awareness

**Infrastructure:**
- Body registration from persona YAML (already works, just needs new type handlers)
- Per-body soul contracts (e.g. shell body gets a command allowlist gate)
- Cross-body event correlation (e.g. "file changed AND PR is open for this branch")

### Phase 4 — Maw 🐣 in-progress

Spec: **[phase4-maw-spec.md](./phase4-maw-spec.md)**

**Maw** — the dragon's mouth. A body (`internal/body/maw/`) that exposes the daemon's inner life to dot via HTTP+SSE. Paired with a Qt/QML desktop app (`hoard/maw/`).

**4A ✅ Maw body** (2026-04-08):
- `internal/body/maw/maw.go` — full Body implementation
  - `GET /stream`: SSE thought events + 30s keepalive + flush-on-connect
  - `GET /state`: JSON snapshot (attention pool + timestamp)
  - `POST /message`: enqueues maw/message sensory event
  - `Wire(soul.OutputCapture)`: hooks into thought cycle output
- `internal/body/maw/maw_test.go` — 8 tests
- `internal/daemon/daemon.go` — "maw" case, outputWirer interface, cycleCapture adapter, soul.Deps.Cycle wiring

**4B 🥚 Qt scaffold + stream** — MawConnection SSE client, ThoughtStream.qml
**4C 🥚 State panel** — attention gauge, body list, contract indicators
**4D 🥚 Input bar** — direct message send

### Phase 5 — Polish + Inclinations

- Inclination-based action weighting
- Model escalation logic (Haiku → Sonnet for complex thoughts)
- Sub-agent spawning
- Identity reflection (consent-gated, high-risk opt-in)

## Key Design Decisions

- **Package renames**: `ticker/` → `heart/`. New packages: `soul/`. These reflect the "dragon triad" conceptual model.
- **Gate vs Audit**: Pre-beat gates block; post-beat audits log and flag. Gates are hard stops, audits are integrity checks.
- **ErrDeclarative sentinel**: `ParseGate` returns `ErrDeclarative` for non-enforceable rules instead of `(nil, nil)`. Avoids nilnil lint violations and makes the intent explicit.
- **Vault write hooks don't trigger on Append**: Prevents infinite recursion when the memory-transparency audit auto-journals.
- **Nudge coalescing**: Buffered-1 channel means rapid events (e.g., saving multiple files) produce at most one extra thought cycle.
- **fsnotify over polling**: Real-time responsiveness. Debounce handles the burst problem.
- **Strict lint from day one**: `.golangci.yml` enforces 30+ linters. Every nolint has a reason. File permissions capped at 0750/0600.

## Package Structure

```
dragon-daemon/
  main.go
  cmd/
    root.go                       cobra root
    run.go                        run --persona <name>
  internal/
    auth/pi.go                    pi OAuth credential management
    attention/ledger.go           pool, regen, spend, floor gate, audit trail
    body/body.go                  Body interface (ID, Type, State, Tools, Events, Start, Stop)
    body/hoard/hoard.go           git log, daily journal, log_to_hoard, event channel
    body/hoard/watcher.go         fsnotify file/commit watcher with debounce
    body/maw/maw.go               HTTP+SSE body: thought stream, state, message injection
    daemon/daemon.go              lifecycle orchestrator, fan-in, soul wiring, outputWirer
    heart/heart.go                heartbeat with jitter + event-driven nudge
    memory/note.go                Note struct + frontmatter + Kind enum
    memory/vault.go               Obsidian-compatible read/write/search/append + write hooks
    persona/types.go              config structs (Config, Contract, etc.)
    persona/loader.go             YAML load + validate
    sensory/types.go              Snapshot, BodyState, Event
    sensory/aggregator.go         event queue + snapshot assembly
    consent/state.go              dual-key ConsentState (user+agent YAML persistence)
    memory/obsidian/cli.go        Obsidian CLI wrapper (SearchByTag, Tags, SetProperty)
    soul/rules.go                 Gate/Audit interfaces, minimum-rest gate
    soul/tier.go                  ConsentTier enum (Low/Medium/High/Unset) + Tag()
    soul/enforcer.go              Enforcer (Check, PreBeat, Verify) + OutputCapture interface
    soul/attention_audit.go       ledger integrity verification
    soul/memory_audit.go          write-through vault audit + auto-journal
    soul/consent_gate.go          consent-tier pre-beat gate
    soul/framing_audit.go         forward-only framing post-beat audit
    thought/cycle.go              sensory → LLM → tools → ledger + OutputCapture hooks
```

## Config

- Persona YAML: `~/.config/dragon-daemon/personas/<name>.yaml`
- Memory vault: `~/.config/dragon-daemon/memory/<name>/` (Obsidian-compatible)
- Auth: reads `~/.pi/agent/auth.json` (pi's OAuth store)

## Dependencies

- Go stdlib (context, time, sync, log/slog, crypto, net/http, os, encoding)
- `github.com/spf13/cobra` — CLI
- `gopkg.in/yaml.v3` — persona config
- `github.com/fsnotify/fsnotify` — dragon-body file watching (added Phase 2)
