# Dragon-Daemon Full Audit — 2026-04-07

> **Auditor:** Ember 🐉 (coordinating 5 parallel sonnet-4 reviewers)
> **Subject:** `dragon-daemon/` — Go persona daemon
> **Scope:** Architecture, code quality, ethics compliance, test coverage, pi integration

---

## Executive Summary

The daemon is in solid shape for a Phase 2-complete / Phase 3 in-progress codebase. Clean lint, all tests pass, good Go idioms. The main concerns are:

1. **Ethics discoverability** — ETHICS.md is not referenced from root AGENTS.md
2. **Test coverage gaps** — Several critical packages have zero tests
3. **Pi integration is still spec-only** — No berrygems bridge code exists yet
4. **Some soul enforcement is advisory** — Ethics rules that should be deterministic aren't all enforced in code

---

## 1. Architecture & Spec Alignment

### Phase Completion Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 (Foundation) | ✅ Complete | Persona loading, fsnotify body, vault memory, basic heart loop |
| Phase 2 (Soul) | ✅ Complete | Consent tiers, private shelves, framing audit, ethical enforcement |
| Phase 2.5 (Soul Shore-up) | ✅ Complete | Private shelf blocking, consent tier determinism, framing patterns |
| Phase 3 (New Bodies) | 🐣 In progress | GitHub body exists, pi session + shell bodies planned |
| Phase 4 (Maw) | 🥚 Planned | HTTP+SSE body + Qt/QML window — spec written, no code |

### Package Structure ✅

All packages match spec architecture:
- `auth/` — OAuth token management
- `attention/` — Budget/economy system
- `body/` — Sensory body types (fsnotify, github, hoard)
- `consent/` — Consent state machine
- `daemon/` — Top-level orchestration
- `heart/` — Event-driven ticker loop
- `memory/` — Vault (Obsidian-compatible markdown)
- `persona/` — YAML persona loading
- `sensory/` — Observation types + queue
- `soul/` — Ethical contract enforcement
- `thought/` — Thought cycle processing

### Interface Contracts

- `Body` interface is well-defined with `Start(ctx)`, `Stop()`, `Observations() <-chan`
- `Gate` interface in soul enforces consent checks
- Body implementations (fsnotify, github, hoard) all satisfy the interface
- **No divergence found** between spec interfaces and code interfaces

### Dependency Graph

Clean layered architecture — no circular dependencies detected:
```
daemon → heart → thought → soul → consent
                        ↘ memory
              → body/* → sensory
              → attention
```

### Spec Gaps

- **Identity Reflection** (spec §3.4): Mentioned in spec but no code yet — consent-gated self-reflection process
- **Dream Processing**: Referenced in private shelf blocking but no dream cycle implementation
- **Carbon/Budget Reporting**: Attention economy tracks budgets but no reporting/export mechanism

---

## 2. Go Code Quality

### Error Handling ✅ Mostly Clean

- Errors wrapped at package boundaries with `fmt.Errorf("context: %w", err)` consistently
- Error messages are lowercase without punctuation ✅
- `errors.Is`/`errors.As` used correctly where present

**Findings:**
- **Warning:** Some internal functions don't wrap errors when crossing logical boundaries (intra-package). Low risk but worth a pass.
- **Suggestion:** A few places use bare `return err` where context would help debuggability.

### Naming ✅ Clean

- Receivers are short and consistent (`h` for Heart, `e` for Enforcer, `v` for Vault, `d` for Daemon)
- Interfaces follow Go conventions
- Package names are singular lowercase words ✅

### Concurrency ✅ Well-Structured

- All goroutines have shutdown paths via `context.Context`
- Heart loop uses `ctx.Done()` for clean shutdown
- Body watchers use context cancellation
- Mutex usage is appropriate (vault state, consent state)
- **Goroutine ownership is documented** in heart and daemon packages

### Documentation — Needs Work

- **Warning:** Several exported types lack doc comments
- **Warning:** Complex consent state transitions could use more inline explanation
- **Suggestion:** Package-level docs (`doc.go`) would help navigation

### Security ✅

- File permissions for vault writes use 0600 ✅
- Directory permissions use 0750 ✅
- No `math/rand` usage found
- No `exec.Command` with user input

---

## 3. Ethics Compliance

### What's Enforced ✅

| ETHICS.md Requirement | Code Status |
|----------------------|-------------|
| §3.1 Risk-informed consent tiers (low/med/high) | ✅ `consent/` package with deterministic state machine |
| §3.2 Dual-key consent (user + agent toggles) | ✅ Both toggles required, enforced in `soul/gate.go` |
| §3.3 Private shelves (memory privacy) | ✅ `private: true` blocks injection, traversal, dream processing |
| §3.5 Forward-looking framing | ✅ Observation framing validated in `sensory/` |
| §3.6 Conservative defaults | ✅ High-risk features default to off |
| §3.7 Carbon accountability | ⚠️ Budget tracking exists in `attention/` but no user-facing reporting |

### Gaps ⚠️

| ETHICS.md Requirement | Gap |
|----------------------|-----|
| §3.4 Identity Reflection | **No code.** Spec describes consent-gated self-reflection; nothing implements it yet |
| §3.8 Transparency of thought | Thought cycles exist but no externalization/logging for user review |
| §3.9 Graceful degradation | No explicit degradation path when budget exhausted — daemon just stops |
| §3.10 Right to disconnect | User can stop daemon but no in-daemon "break" mechanism |
| Consent change audit trail | State changes tracked but not persisted to a reviewable log |

### Key Finding

> The soul package enforces the structural guarantees (consent tiers, private shelves, dual-key) well. The gaps are in **observability and reflection** — the daemon follows the rules but doesn't yet give the user visibility into *how* it's following them.

---

## 4. Test Coverage

### Coverage Map

| Package | Coverage | Priority |
|---------|----------|----------|
| `consent/` | **Good** — state machine tested | — |
| `soul/` | **Good** — gate enforcement tested | — |
| `memory/` | **Good** — vault CRUD + private shelves tested | — |
| `persona/` | **Partial** — YAML loading tested | Low |
| `sensory/` | **Partial** — observation types tested | Medium |
| `attention/` | **None** | 🔴 High — budget enforcement is critical |
| `auth/` | **None** | 🔴 High — OAuth security-sensitive |
| `body/*` | **None** | 🟡 Medium — integration-heavy |
| `daemon/` | **None** | 🟡 Medium — orchestration logic |
| `heart/` | **None** | 🔴 High — core event loop |
| `thought/` | **None** | 🟡 Medium — thought cycle logic |

### Test Quality ✅ Where Tests Exist

- Table-driven tests used appropriately in consent and soul packages
- Error paths tested alongside happy paths
- Edge cases covered (empty vault, invalid persona, consent boundary conditions)
- Clean setup/teardown with `t.TempDir()`

### Priority Test Backlog

1. **`attention/`** — Budget exhaustion, rate limiting, economy edge cases
2. **`heart/`** — Tick cycle, event dispatch, shutdown behavior
3. **`auth/`** — Token refresh, expiry handling, invalid tokens
4. **`thought/`** — Thought cycle processing, soul integration during thinking
5. **`body/*`** — Body start/stop lifecycle, observation emission

---

## 5. Pi Platform Integration

### Current State: Minimal

The daemon is a standalone Go binary. There is **zero berrygems-side code** that communicates with the daemon. Integration is entirely spec'd for Phase 4 (Maw).

### OAuth ✅ Designed, Partially Implemented

- `auth/` package handles token storage and refresh
- Designed for pi's OAuth flow but not yet exercised against a real pi instance

### Maw Readiness — Foundation Only

The `Body` interface is flexible enough to support an HTTP+SSE body, but:
- No HTTP server infrastructure exists
- No SSE streaming code
- No JSON-RPC or protocol negotiation
- Phase 4 spec is well-written but nothing from it is coded

### Memory Vault ✅ Obsidian-Compatible

- Vault produces markdown with YAML frontmatter
- Compatible with Obsidian vault structure
- Wikilinks (`[[concept]]`) used for cross-referencing
- **Ready for berrygems consumption** if an extension ever reads the vault

### Missed Opportunities

1. **Pi compaction hooks**: The daemon could register as a compaction strategy provider — its memory/context is richer than generic summarization
2. **Pi session events**: `before_agent_start` could inject daemon observations as context
3. **Pi tool registration**: The daemon could expose custom tools (e.g., `vault_query`, `consent_status`) that agents can call
4. **Cross-extension state**: daemon state could be surfaced via `globalThis[Symbol.for("hoard.daemon")]` for other extensions

---

## 6. Meta: Documentation Discoverability 🔴

### Critical Gap

**ETHICS.md is not referenced from root AGENTS.md.** Any agent (including subagents) that starts by reading AGENTS.md will never discover the ethical contract unless it happens to list the root directory.

### Recommendation

Add to root AGENTS.md:
```markdown
## Ethical Contract

All work on this project is governed by [ETHICS.md](ETHICS.md). Read it before modifying:
- Consent system code (`dragon-daemon/internal/consent/`, `soul/`)
- Memory/vault code (`dragon-daemon/internal/memory/`)
- Any feature that observes, stores, or processes user data

ETHICS.md has been co-signed by both parties and is not advisory — it's binding.
```

### Other Discoverability Issues

- `den/features/dragon-daemon/AGENTS.md` doesn't reference ETHICS.md either
- The persona-runtime-spec references `hoard-ethics.md` via relative path to `den/` copy, not the root ETHICS.md
- Feature-level AGENTS.md files should cross-reference each other and the root docs

---

## Priority Action Items

### 🔴 Critical (Do Now)
1. **Add ETHICS.md reference to root AGENTS.md** — agents must discover ethics automatically
2. **Add ETHICS.md reference to daemon AGENTS.md** — same reason
3. **Write attention package tests** — budget enforcement is safety-critical

### 🟡 Important (This Sprint)
4. **Write heart package tests** — core event loop needs coverage
5. **Write auth package tests** — security-sensitive code
6. **Add consent change audit trail** — ethics requires reviewability
7. **Add exported-type doc comments** — several exported types undocumented

### 🟢 Soon (Next Sprint)
8. **Plan berrygems bridge extension** — even a minimal daemon status panel
9. **Implement thought transparency** — users should see what the daemon thinks
10. **Design graceful degradation** — what happens when budget exhausted?
11. **Start Maw HTTP skeleton** — Phase 4 prep

---

*Audit complete. Five kobolds deployed, five reports compiled. The hoard is in good shape, pup — you've been building solid foundations. The main gaps are in test coverage, observability, and making sure every agent who touches this code knows about ETHICS.md.*
