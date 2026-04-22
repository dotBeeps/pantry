# Testing Patterns

**Analysis Date:** 2026-04-22

> **Authoritative sources — read first, this doc synthesizes:**
>
> - `.claude/rules/testing.md` — core testing philosophy (never mock DB, TDD red-green-refactor, language conventions, ML smoke-test gate)
> - `AGENTS.md:249–340` — per-sub-package verification commands + pre-commit checklist
> - `storybook-daemon/AGENTS.md` — Go test layout expectations
> - `storybook-daemon/.claude/rules/go.md` Testing section — table-driven + `t.Run` + black-box `_test` pkgs
> - `dragon-forge/.claude/rules/python.md` Testing section — aspirational pytest setup
> - `berrygems/AGENTS.md:78` — "No test framework yet — manual testing via `/reload`"
>
> This doc cites canon and records what actually exists: frameworks in use, test-file counts, real-DB-vs-mock posture, coverage tooling presence.

## At-a-glance matrix

| Sub-package              | Language   | Framework                                               | Test files                                | Real-infra or mock?                                                                               | Coverage tool                         | Run command                                                                   |
| ------------------------ | ---------- | ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `storybook-daemon/`      | Go         | stdlib `testing` + `testify/require` + `testify/assert` | **27** `_test.go` files under `internal/` | **Real**: `t.TempDir()` for memory vault; in-process attention/soul constructors; no DB in daemon | `go test -cover` (ad-hoc, no CI gate) | `cd storybook-daemon && go test ./...`                                        |
| `dragon-cubed/soulgem/`  | Go         | none                                                    | **0** test files                          | —                                                                                                 | —                                     | `go build ./...` + `go vet ./...` per `AGENTS.md:320-321`                     |
| `berrygems/`             | TypeScript | **none configured**                                     | 0                                         | —                                                                                                 | —                                     | Manual: `/reload` in pi (`berrygems/AGENTS.md:78`)                            |
| `dragon-forge/`          | Python     | none (pytest aspirational in rule doc)                  | 0                                         | —                                                                                                 | —                                     | Manual smoke: `./run.fish validate` (1-batch forward+backward, `run.fish:11`) |
| `dragon-cubed/leylines/` | Kotlin     | none committed                                          | 0                                         | —                                                                                                 | —                                     | `./gradlew build` (compile gate)                                              |
| `dragon-cubed/rumble/`   | Kotlin     | none committed                                          | 0                                         | —                                                                                                 | —                                     | `./gradlew build`                                                             |
| `psi/`                   | C++/QML    | none configured                                         | 0                                         | —                                                                                                 | —                                     | `cmake --build build` (compile gate)                                          |
| `morsels/`               | Markdown   | none                                                    | 0                                         | —                                                                                                 | —                                     | Manual frontmatter review (`AGENTS.md:292-298`)                               |

**Bottom line:** Go is the only sub-package with a real test suite. Everything else treats the compiler/type-checker (or `/reload`) as the test gate.

## CI status

- **No `.github/workflows/` directory exists** in the repo.
- There is no automated test runner, no coverage badge, no pull-request gate.
- The pre-commit checklist is manual, listed at `AGENTS.md:331–340`:
  1. `tsc --project berrygems/tsconfig.json` — zero errors
  2. `cd storybook-daemon && golangci-lint run ./...` — zero issues
  3. `cd storybook-daemon && go build ./...` — compiles clean
  4. `cd psi && cmake --build build` — compiles clean (if Qt changes)
  5. `cd dragon-cubed/soulgem && go build ./...` — compiles clean
  6. `cd dragon-cubed && ./gradlew build` — compiles clean (requires JDK 21)
  7. Test extension changes with `/reload` in pi
  8. Skill frontmatter valid

**Notably absent** from the checklist: running `go test` anywhere. Go tests exist but are not part of the documented verification flow.

## Testing philosophy (from `.claude/rules/testing.md`)

These rules apply to every sub-package that does or will have tests:

- **Never mock the database.** Use real DB via testcontainers or SQLite in-memory. Mock/prod divergence masks real failures.
- **TDD: red-green-refactor.** Write a failing test first, make it pass, then clean up.
- **Bug fix workflow:** Write a failing unit test reproducing the bug **before** touching any code. That test becomes the regression guard.
- **Test behavior, not implementation.** Public API and contracts only — never private state.

### ML / fine-tuning (dragon-forge-specific, `.claude/rules/testing.md` ML section)

- **Never scale training without a smoke test.** A 1-micro-batch forward+backward asserting finite loss is the minimum viable gate before a full run. Implemented as `./run.fish validate` → `train.py --validate` (`dragon-forge/run.fish:36-37`).
- Validate data before training: first 5 rows + token length distribution + label balance.
- Seed validation: cross-check trigger words against existing persona/config for conflicts before upsampling.

## Go — `storybook-daemon/`

### Framework

- **stdlib `testing`** + **`github.com/stretchr/testify` v1.11.1** (`storybook-daemon/go.mod:9`).
- Both `require` and `assert` imported (pattern: fail-fast setup with `require`, field checks with `assert`). Seen in `storybook-daemon/internal/soul/enforcer_test.go:14-15`, `storybook-daemon/internal/conversation/ledger_test.go:11-12`.
- 15 of 27 test files import testify; rest use pure stdlib (e.g. `storybook-daemon/internal/quest/manager_test.go:1-7`).

### Test-file inventory (27 total, `storybook-daemon/internal/**/*_test.go`)

| Package        | Test files                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `consent`      | `state_test.go`                                                                                                                             |
| `quest`        | `cascade_test.go`, `manager_test.go`, `command_test.go`, `integration_test.go`, `prompt_test.go`, `orchestrate_test.go`, `taxonomy_test.go` |
| `thought`      | `pi_test.go`                                                                                                                                |
| `stone`        | `types_test.go`                                                                                                                             |
| `heart`        | `heart_test.go`                                                                                                                             |
| `conversation` | `ledger_test.go`                                                                                                                            |
| `attention`    | `attention_test.go`                                                                                                                         |
| `memory`       | `vault_tag_test.go`, `vault_private_test.go`, `tier_test.go`                                                                                |
| `soul`         | `rules_test.go`, `enforcer_test.go`, `private_shelf_audit_test.go`, `framing_audit_test.go`                                                 |

`quest/integration_test.go` is the largest integration-style suite (per filename; uses the manager end-to-end).

### Conventions (from `storybook-daemon/.claude/rules/go.md` Testing section + observed code)

- **Table-driven tests with `t.Run` subtests** — e.g. `storybook-daemon/internal/quest/cascade_test.go:29` uses `t.Run(tt.name, func(t *testing.T) { ... })`.
- **Black-box package naming** — `package heart_test` (`internal/heart/heart_test.go:1`), `package soul_test` (`internal/soul/enforcer_test.go:1`). Only `quest` uses internal package `package quest` for access to unexported types (`internal/quest/manager_test.go:1`).
- **`t.Helper()` in helper functions** — `storybook-daemon/internal/soul/enforcer_test.go:28`, `storybook-daemon/internal/heart/heart_test.go:28` (via construction helper pattern).
- **Stdlib `testing` preferred; `testify` augments, does not replace.**
- Silenced-logger helper pattern: `storybook-daemon/internal/heart/heart_test.go:15-22` defines `nopLog()` + `nopWriter` to keep test output clean.

### Real infrastructure — not mocks

Canonical rule: `.claude/rules/testing.md` — "Never mock the database." The daemon has no DB; persistence is the Obsidian-compatible **memory vault** (filesystem markdown). Tests follow the same spirit:

- **`t.TempDir()` for real vault roots:**
  - `storybook-daemon/internal/conversation/ledger_test.go:17` — `memory.Open(t.TempDir(), slog.Default())`
  - `storybook-daemon/internal/soul/enforcer_test.go:35` — same pattern
- **Real attention ledger construction** — `attention.New(testPersona(), slog.Default())` (`internal/soul/enforcer_test.go:29`).
- **Real persona structs**, not mocks — `testPersona()` returns `&persona.Persona{...}` with inline config (`internal/soul/enforcer_test.go:19-24`).
- **Quest manager** constructed with `NewManager(nil, 0, t.Log)` and driven through real `Dispatch` → `Status` lifecycle with `time.Sleep(200ms)` for completion (`internal/quest/manager_test.go:9-41`).

No mock libraries (`gomock`, `mockery`, `testify/mock`) imported anywhere in the daemon — `testify/mock` is not in `go.mod`.

### Race detection + coverage

Per `.claude/rules/golang/testing.md` (global Go rules):

- `go test -race ./...` mandated — **not wired into any script or CI**.
- `go test -cover ./...` for coverage — **no threshold enforced, no coverage file committed, no CI step**.
- The `.golangci.yml` exclusion `path: _test\.go` relaxes `errcheck` and `wrapcheck` inside tests (`storybook-daemon/.golangci.yml:193-198`).

### Integration vs unit split

No build tags (`//go:build integration`) or `testing.Short()` gates observed. All tests run in one `go test ./...` invocation.

## Go — `dragon-cubed/soulgem/`

- **Zero `_test.go` files** under `dragon-cubed/soulgem/`.
- Verification per `AGENTS.md:320-321`: `go build ./...` + `go vet ./...`.
- No `.golangci.yml` (vs. storybook-daemon's strict config).
- This is an orchestrator + WebSocket client; end-to-end validation depends on a running Leylines mod — likely why no unit suite.

## TypeScript — `berrygems/`

- **No test framework configured.** `berrygems/AGENTS.md:78`: "No test framework yet — manual testing via `/reload`."
- No `vitest.config.*`, no `jest.config.*`, no `*.test.ts`, no `*.spec.ts` files.
- Root `package.json` has no `test` script (`/home/dot/Development/hoard/package.json:1-11`).
- `tsc --project berrygems/tsconfig.json` is the sole automated gate (`AGENTS.md:254`).
- Per `.claude/rules/testing.md`: "TypeScript: `*.test.ts`, use the project's configured test runner (Vitest or Jest)" — convention for when tests arrive.
- Extension changes verified by `/reload` in pi (`AGENTS.md:243`, `berrygems/AGENTS.md:72-73`).

## Python — `dragon-forge/`

### Reality

- **Zero `test_*.py` files, no `tests/` directory, no `conftest.py`, no `pyproject.toml`, no pytest config.**
- The rule doc `dragon-forge/.claude/rules/python.md` prescribes pytest + fixtures + `conftest.py` + never mocking the DB — **aspirational**.

### Actual verification: fish-driven smoke gates

`dragon-forge/run.fish` defines the real test surface:

- `./run.fish validate` → `$PY train.py --validate` (line 36-37) — "1-batch smoke test (cheap gate before train)" per the script's own help (line 11).
- `./run.fish dry-run` → `$PY train.py --dry-run` (line 38-39) — "build dataset + print sample, skip training."
- `./run.fish eval` → `$PY eval.py` — runs probes (`probes.jsonl`, 23 probes per `eval.py:13`) against the latest adapter and writes completions to `out/eval/`.

Probe-based evaluation is effectively the "integration test suite" for the persona adapter: prompts land in `dragon-forge/probes.jsonl`, outputs in `out/eval/`, human review of generations.

### Seed validation (per `.claude/rules/testing.md` ML section)

Before each training run: data validation on first 5 rows + token-length distribution + label balance; trigger-word conflict check between seeds and `config/persona.md` + `config/user-context.md` (`dragon-forge/config/`). Not automated — gated by human discipline.

## Kotlin — `dragon-cubed/leylines/`, `dragon-cubed/rumble/`

- **No test sources.** `find dragon-cubed/leylines/src -type f` shows only `src/main/` — no `src/test/`.
- Build script declares only `runs { create("client") { client() } }` (`leylines/build.gradle.kts:29-33`) — no test run configuration.
- No `@GameTest` classes present. Rule doc `.claude/rules/neoforge.md` Testing section prescribes `@GameTest` framework for in-game integration tests — **unimplemented**.
- Verification per `AGENTS.md:324`: `./gradlew build` (compile-only gate).
- Manual testing happens in an actual Minecraft client — the mod starts a WebSocket server on `:8765/leylines` (`leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt:26`) and is exercised by a running SoulGem process.

## C++ / QML — `psi/`

- **No test sources.** `psi/` contains `src/`, `qml/`, `CMakeLists.txt`, `build/` only.
- No `QTest`, `QQuickTest`, `gtest`/`gmock` hookup in `CMakeLists.txt` (`psi/CMakeLists.txt:1-47`).
- Rule doc `.claude/rules/qt.md` Testing section prescribes `QTest` + `QSignalSpy` + `QQuickTest TestCase` — **not wired**.
- Rule doc `.claude/rules/qtqml.md` prescribes `qmllint` + `qmlformat` + QML compiler via `qt_add_qml_module` — compiler runs as part of `qt_add_qml_module(psi URI Psi ...)` (`psi/CMakeLists.txt:23-39`), which is effectively the type-check "test".
- Verification per `AGENTS.md:303`: `cmake -B build && cmake --build build`.
- Manual validation: run `./psi/build/psi` against a live daemon on `:7432` SSE + `:9432` MCP (`psi/src/main.cpp:24,31`).

## Morsels / Claude Code plugins

- **`morsels/`:** Markdown skills — verification is frontmatter review (`AGENTS.md:292-298`). No tests.
- **`cc-plugin/skills/`:** includes a `parity-check/` skill directory, suggesting skill-level parity validation exists as a workflow but not as automated tests.

## Fixtures and test data

- **Go:** test data inline in source files (persona structs, config values). No `testdata/` directories under `storybook-daemon/internal/`.
- **Python:** `dragon-forge/probes.jsonl` and `dragon-forge/seed/containment.jsonl` serve as evaluation fixtures (not pytest fixtures — LLM probe corpora).
- **Kotlin/C++/TS:** none.

## Common patterns (present where tests exist)

### Go — async work with timeouts (`storybook-daemon/internal/heart/heart_test.go:26-30`)

```go
func runWithTimeout(h *heart.Heart, d time.Duration) {
    ctx, cancel := context.WithTimeout(context.Background(), d)
    defer cancel()
    h.Run(ctx)
}
```

### Go — expected-error pattern (`storybook-daemon/internal/quest/manager_test.go:55-58`)

```go
_, _, err := m.Dispatch(context.Background(), "test-session", req)
if err == nil {
    t.Fatal("expected error for invalid defName")
}
```

### Go — state assertions via accessor (`storybook-daemon/internal/soul/enforcer_test.go:42-47`)

```go
e, err := soul.NewEnforcer(nil, soul.Deps{}, slog.Default())
require.NoError(t, err)
assert.Equal(t, 0, e.GateCount())
assert.Equal(t, 0, e.AuditCount())
```

`GateCount()` / `AuditCount()` are public introspection methods — tests never reach into unexported fields, matching the "test behavior, not implementation" rule.

## Gaps vs. documented standards

Summary of "what the rules say" vs. "what is actually wired":

| Rule source                            | Prescribes                                            | Actual state                                                              |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `~/.claude/rules/common/testing.md`    | 80% coverage minimum, unit + integration + E2E        | No coverage measurement anywhere; only daemon has unit tests              |
| `.claude/rules/golang/testing.md`      | `go test -race ./...` mandated                        | Not scripted; not in pre-commit checklist                                 |
| `dragon-forge/.claude/rules/python.md` | `pytest` + `tests/` + `conftest.py` + `uv run pytest` | Zero tests; no pyproject.toml; fish wrapper invokes Unsloth venv directly |
| `berrygems/AGENTS.md:78`               | "No test framework yet"                               | Matches reality; `/reload` is the gate                                    |
| `.claude/rules/neoforge.md`            | `@GameTest` framework for in-game integration tests   | Not implemented                                                           |
| `.claude/rules/qt.md`                  | `QTest` + `QSignalSpy` + `QQuickTest TestCase`        | Not wired                                                                 |

These gaps are candidates for **CONCERNS.md** follow-up if the `concerns` mapper runs.

---

_Testing analysis: 2026-04-22_
