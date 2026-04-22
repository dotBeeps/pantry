# Coding Conventions

**Analysis Date:** 2026-04-22

> **Authoritative sources — read first, this doc synthesizes:**
>
> - `AGENTS.md` (root, lines 442–478) — Code Style, berrygems Conventions, Go Conventions, Commits
> - `AGENTS.md` (sub-packages) — `berrygems/AGENTS.md`, `storybook-daemon/AGENTS.md`, `dragon-cubed/AGENTS.md`, `dragon-cubed/leylines/AGENTS.md`, etc.
> - `.claude/rules/testing.md` — TDD, language runner conventions
> - `.claude/rules/context7.md` — library doc lookup
> - `storybook-daemon/.claude/rules/go.md` — Go idioms beyond linter
> - `dragon-forge/.claude/rules/python.md` — Python/uv/ruff/pyright target
>
> This document cites them and records only what the actual code reveals in addition.

## Language-by-language Summary

| Language   | Sub-packages                                     | Files                 | Formatter                                                                              | Linter                                                         | Type check               | Config location                                                                                                           |
| ---------- | ------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Go         | `storybook-daemon/`, `dragon-cubed/soulgem/`     | 82                    | `gofumpt` + `goimports`                                                                | `golangci-lint` v2 (strict)                                    | `go vet` (via golangci)  | `storybook-daemon/.golangci.yml` (soulgem has **no** `.golangci.yml` — relies on `go vet`/`go build` per `AGENTS.md:321`) |
| TypeScript | `berrygems/`                                     | 47                    | **none configured** (tabs+double-quotes+semis by convention)                           | **none** — no `biome.json`, no `.eslintrc*`, no `.prettierrc*` | `tsc --noEmit --strict`  | `berrygems/tsconfig.json`                                                                                                 |
| Python     | `dragon-forge/`                                  | 22                    | _aspirational_ `ruff format` per `dragon-forge/.claude/rules/python.md:6`              | _aspirational_ `ruff check`                                    | _aspirational_ `pyright` | **no `pyproject.toml`, no `ruff.toml`, no `uv.lock` present yet** — rule doc is target state                              |
| Kotlin     | `dragon-cubed/leylines/`, `dragon-cubed/rumble/` | 13                    | **no ktlint/detekt config** — official Kotlin style via `kotlin.jvmToolchain(21)` only | Gradle `build` is the gate                                     | `kotlinc` via Gradle     | `dragon-cubed/leylines/build.gradle.kts`, `dragon-cubed/rumble/build.gradle.kts`                                          |
| QML        | `psi/qml/`                                       | 12                    | **no `.qmllint.ini`** — enforcement is Qt's QML compiler via `qt_add_qml_module`       | QML compiler only                                              | —                        | `psi/CMakeLists.txt:23`                                                                                                   |
| C++        | `psi/src/`                                       | 8 (4 `.cpp` + 4 `.h`) | **no `.clang-format`**                                                                 | **no `.clang-tidy`**                                           | —                        | `psi/CMakeLists.txt`                                                                                                      |

**Observation:** only Go has a machine-enforced convention config (`storybook-daemon/.golangci.yml`). Every other sub-package relies on `AGENTS.md` prose + compile gates + reviewer discipline.

## Root-level Conventions

Canonical source: `AGENTS.md:442–488`.

- **Commits:** Conventional Commits — `<type>(<scope>): <summary>`, ≤72 chars, imperative mood, no trailing period. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`. Scope is the skill/extension/component name. See `AGENTS.md:481–488` and `dragon-cubed/AGENTS.md:90–102`.
- **Shell scripts:** fish only, never bash. Observed: `dragon-forge/run.fish:1` (`#!/usr/bin/env fish`). No `.sh` files under any sub-package root.
- **No `.github/workflows/`** — repo has zero configured CI. Pre-commit checklist in `AGENTS.md:331–340` is a manual gate: `tsc` → `golangci-lint` → `go build` → `cmake --build` → `./gradlew build`.
- **AI contributor identity** for commit trailers: `AGENTS.md:406–421` (reads `hoard.contributor.*` from `~/.pi/agent/settings.json`).
- **Tone system:** `AGENTS.md:425–439` — `hoard.tone.default` + `hoard.tone.overrides.*`. Affects document writing voice only, not agent personality.

## TypeScript — `berrygems/`

Canonical: `AGENTS.md:445–446` + `berrygems/AGENTS.md` + `berrygems/tsconfig.json`.

### `tsconfig.json` (`berrygems/tsconfig.json:1-21`)

```json
"target": "ESNext", "module": "ESNext", "moduleResolution": "bundler",
"strict": true, "noEmit": true,
"noUnusedLocals": true, "noUnusedParameters": true,
"allowImportingTsExtensions": true, "skipLibCheck": true,
"esModuleInterop": true
```

Paths resolve `@mariozechner/pi-tui`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@sinclair/typebox` to `../node_modules/.../dist`. Symlinks into `~/.npm/lib/node_modules/mitsupi/node_modules/`. Repair script at `AGENTS.md:265–272`.

### Observed code style (not tooling-enforced)

- **Tabs for indentation**, double quotes, semicolons (`berrygems/AGENTS.md:95`; confirmed in `berrygems/lib/settings.ts:1`, `berrygems/extensions/dragon-breath.ts:1`).
- `.ts` extension in imports (`allowImportingTsExtensions`) — seen in `berrygems/extensions/dragon-breath.ts:17`: `from "../lib/settings.ts"`.
- **`satisfies` over `as`** — `AGENTS.md:445`.
- **No `any` without an explanatory comment** — `AGENTS.md:445`.

### Structural rules (`AGENTS.md:458–463`)

- One tool registration per file. 300+ lines in an extension file = split candidate.
- > 4 function parameters → options object. No exceptions.
- Skills and code co-ship.
- Cross-extension communication via `globalThis` + `Symbol.for()` — never direct imports. Example `berrygems/extensions/dragon-breath.ts` publishes `BreathAPI`; pattern in `AGENTS.md:389–397`.

### Shared-library-first rule (`AGENTS.md:450–456`)

- Always `grep berrygems/lib/` before writing utilities.
- Extract to `berrygems/lib/` on **second** use — never duplicate with a comment.
- **Use these instead of hand-rolling:**
  - `readHoardSetting()` / `readHoardKey()` from `berrygems/lib/settings.ts` for ALL settings access — never hand-parse JSON
  - `generateShortId()` / `generateId()` from `berrygems/lib/id.ts` — never `Math.random().toString(36)`
  - `parseComboName()` from `berrygems/lib/ally-taxonomy.ts` — never `as` casts on split strings
- Full lib inventory: `settings`, `ally-taxonomy`, `pi-spawn`, `id`, `cooldown`, `local-server`, `sse-client`, `panel-chrome`, `compaction-templates`, `animated-image`, `animated-image-player`, `giphy-source`, `lsp-client` (`AGENTS.md:456`).

### Tool registration requirement (`berrygems/AGENTS.md:44–60`)

Every `pi.registerTool()` must include `promptSnippet` and `promptGuidelines`. Without these, pi omits the tool from system-prompt "Available tools" / "Guidelines" sections, breaking ally-model usage.

## Go — `storybook-daemon/`, `dragon-cubed/soulgem/`

Canonical: `AGENTS.md:465–478`, `storybook-daemon/.claude/rules/go.md`, `storybook-daemon/.golangci.yml`.

### Go version

- `storybook-daemon/go.mod:3` — `go 1.25.0`
- `dragon-cubed/soulgem/go.mod:3` — `go 1.26.1`
- `.golangci.yml` pins analysis to `go: "1.23"` (`storybook-daemon/.golangci.yml:7`)

### Formatters (enforced)

`storybook-daemon/.golangci.yml:11-18`:

- `gofumpt` with `extra-rules: true`, `module-path: github.com/dotBeeps/hoard/storybook-daemon`
- `goimports`

### Enabled linters (`storybook-daemon/.golangci.yml:21-60`)

- **Errors:** `errname`, `errorlint`, `wrapcheck`, `nilnil`
- **Correctness:** `exhaustive` (switch + map; `default` signifies exhaustive, line 122-126), `bodyclose`, `noctx`, `contextcheck`, `fatcontext`, `reassign`
- **Style:** `revive` (30+ rules, lines 72-112), `gocritic` (all checks, lines 114-120), `unconvert`, `misspell`, `dupword`, `nakedret` (zero tolerance — `max-func-lines: 0`, line 164), `nolintlint` (require-explanation + require-specific, lines 128-131), `predeclared`, `usestdlibvars`, `wastedassign`, `prealloc`
- **Security:** `gosec` (excludes G104 covered by `errcheck`, G304 noisy, lines 171-174)
- **Bans:** `forbidigo` — `fmt.Print*` banned outside `cmd/` and `main.go` (`storybook-daemon/.golangci.yml:157-161, 200-204`); use `log/slog` instead

### Disabled linters (`storybook-daemon/.golangci.yml:62-68`)

`exhaustruct`, `ireturn`, `varnamelen`, `wsl`, `funlen`, `gochecknoglobals` — deliberately off.

### wrapcheck-ignored signatures (`storybook-daemon/.golangci.yml:147-154`)

`.Errorf(`, `errors.New(`, `errors.Unwrap(`, `errors.Join(`, `.Wrap(`, `.Wrapf(`, `.WithMessage(`.

### Idioms beyond the linter (`AGENTS.md:469-477` + `storybook-daemon/.claude/rules/go.md`)

- Interfaces belong in the **consumer** package. Single-method interfaces get `-er` suffix.
- `context.Context` always first parameter; never stored in a struct.
- Every goroutine has a shutdown path via context or done channel — document who starts it and what stops it.
- Error types: `ErrFoo` for sentinels, `FooError` for custom types (enforced by `errname`).
- Error messages: lowercase, no punctuation. Cross-package wrap: `fmt.Errorf("starting watcher: %w", err)`.
- Packages: single lowercase word, no underscores or plurals — directory name matches.
- Every `//nolint` names the specific linter **and** a reason, e.g. `//nolint:gosec // G204: args are not user-controlled` (`AGENTS.md:478`).
- **No naked returns** — `nakedret.max-func-lines: 0` (`.golangci.yml:164`).
- Structured logging via `log/slog`; pass `slog.Logger` explicitly or use `slog.Default()` — don't create globals (`storybook-daemon/.claude/rules/go.md` Logging section).
- Table-driven tests with `t.Run` subtests; black-box `package foo_test` unless internal access needed (`storybook-daemon/.claude/rules/go.md` Testing section).

### soulgem divergence

`dragon-cubed/soulgem/` has **no `.golangci.yml`**. Per `AGENTS.md:320–327`, verification is `go vet ./...` + `go build ./...` only. The root-level prose says SoulGem "follows the same Go conventions as storybook-daemon" (`AGENTS.md:327`), but there is no machine enforcement.

### Test-file relaxations (`storybook-daemon/.golangci.yml:193-198`)

Inside `_test.go`: `errcheck`, `wrapcheck` disabled.
Inside `cmd/` + `main.go`: `forbidigo` allows `fmt.Print*`.
Shadow-declaration of `ctx`, `err`, `ok` is silenced (`.golangci.yml:206-209`).

## Python — `dragon-forge/`

Canonical: `dragon-forge/.claude/rules/python.md` — **target state, not fully realized**.

### Reality vs. rules

- Rule doc says `uv` + `pyproject.toml` + `ruff format`/`ruff check` + `pyright` + `pytest`.
- **Actual files in `dragon-forge/`:** `extract.py`, `train.py`, `eval.py`, `probes.jsonl`, `run.fish`, `seed/containment.jsonl`, `config/*.md`. **No `pyproject.toml`, no `uv.lock`, no `ruff.toml`, no `tests/`.**
- Python invoked via fish wrapper `dragon-forge/run.fish:20` — `$HOME/.unsloth/studio/unsloth_studio/bin/python` (Unsloth venv), **not** `uv run`. Environment set: `HIP_VISIBLE_DEVICES=0` (`run.fish:19`).

### Observed code patterns (actual Python)

- `#!/usr/bin/env python3` shebang + module-level docstring (`extract.py:1-11`, `eval.py:1-18`).
- `from __future__ import annotations` at top of files (`extract.py:13`, `eval.py:20`) — forward references for type hints.
- `dataclasses.dataclass` used for structured data (`extract.py:21`).
- `pathlib.Path` + `.expanduser()` for user-home paths (`extract.py:25-26`).
- `argparse` for CLI (`extract.py:15`, `eval.py:24`).
- `noqa: I001` used for order-sensitive Unsloth import (`eval.py:22`) — the single linter directive in the codebase; suggests ruff import-sort rules are anticipated even though no config file yet.

### Aspirational rules from `dragon-forge/.claude/rules/python.md`

- Line length 88 (ruff default), 4-space indent.
- `snake_case` funcs/vars, `PascalCase` classes, `UPPER_SNAKE` constants.
- f-strings only.
- `X | None` not `Optional[X]`; `X | Y` not `Union[X, Y]` (Python 3.10+).
- Catch specific exceptions, never bare `except:`.
- Re-raise with `raise` (preserves traceback), not `raise e`.
- `dataclasses.dataclass` or `NamedTuple` for structured data — not plain dicts.
- `match`/`case` over chained `isinstance`.
- **src/ layout preferred** — not in use yet in `dragon-forge/`; files live at package root.
- Never mock the DB — use real DB via pytest fixtures or testcontainers.

## Kotlin — `dragon-cubed/leylines/`, `dragon-cubed/rumble/`

Canonical: `dragon-cubed/AGENTS.md`, `dragon-cubed/leylines/AGENTS.md`, `.claude/rules/neoforge.md` (from `Development/.claude/rules/`), `.claude/rules/minecraft-modding.md`.

### Build

- Kotlin version pinned: `kotlin("jvm") version "2.1.0"` (`dragon-cubed/leylines/build.gradle.kts:6`)
- JVM toolchain 21 (`dragon-cubed/leylines/build.gradle.kts:49`) — matches `AGENTS.md:324` "requires JDK 21".
- NeoForge mod plugin `net.neoforged.moddev` v2.0.78 (`build.gradle.kts:7`).
- Mappings: MojMap + Parchment overlay (`build.gradle.kts:24-27`, versioned `2024.11.17` / MC `1.21.4`).
- KFF dependency: `thedarkcolour:kotlinforforge-neoforge:5.6.0` (`build.gradle.kts:44`).

### Tooling gap

- **No `.editorconfig`, no `ktlint` / `detekt` config** anywhere under `dragon-cubed/`. Style enforcement is "`./gradlew build` compiles clean" (`AGENTS.md:337`).

### Conventions (from rule docs — substantiated in observed code)

- `@Mod(MOD_ID)` on an `object` declaration, not a class (`Leylines.kt:22-24` — `object Leylines { const val MOD_ID = "leylines"; ... }`).
- Top-level `const val` for mod ID (`Leylines.kt:24`) — never duplicate the string.
- Event-bus wiring in `init {}` block (`Leylines.kt:37-43`).
- Client-dist guard: `if (FMLEnvironment.dist == Dist.CLIENT)` before subscribing (`Leylines.kt:40-42`). The mod has no server-side logic per `dragon-cubed/AGENTS.md:86`.
- Loggers as `val LOGGER: Logger = LogManager.getLogger(MOD_ID)` at companion scope (`Leylines.kt:28`).
- Package path mirrors domain: `dev.dragoncubed.leylines.*` with sub-packages `event/`, `extension/`, `protocol/`, `server/`, `state/` (`dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/`).
- **All protocol types** live in `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt` — single source of truth; SoulGem mirrors (`dragon-cubed/AGENTS.md:53-54`).

### Mixins

- **Mixin classes must be Java**, not Kotlin. Keep `src/main/java/.../mixin/` alongside Kotlin sources (rule: `minecraft-modding.md` "Kotlin" section). No mixins present yet in `dragon-cubed/`.

### Inter-component boundaries (`dragon-cubed/AGENTS.md:83-88`)

- Leylines is CLIENT-ONLY. `FMLEnvironment.dist == Dist.CLIENT` must gate startup.
- Never import leylines code from soulgem. Never import soulgem code from leylines.
- Netty I/O vs Minecraft game thread: commands drained on game thread each tick via `CommandRouter.drainQueue()` (`dragon-cubed/AGENTS.md:88`).

## C++ / QML — `psi/`

Canonical: `AGENTS.md:300-315`, dead-ends around Qt 6.11 gotchas in project memory.

### Build

- CMake ≥ 3.21, C++17, AUTOMOC on (`psi/CMakeLists.txt:1-6`).
- Qt 6.5+ required, components `Quick`, `Network`, `QuickControls2` (`psi/CMakeLists.txt:8`).
- `qt_standard_project_setup(REQUIRES 6.5)` (`CMakeLists.txt:10`).
- `qt_add_qml_module(psi URI Psi VERSION 1.0 QML_FILES ...)` — one module, 12 QML files (`CMakeLists.txt:23-39`).

### Tooling gap

- **No `.clang-format`, no `.clang-tidy`, no `.qmllint.ini`** in `psi/`. Enforcement is `cmake --build build` compiles clean (`AGENTS.md:302-306`).

### Qt 6.11 gotchas (binding rules — `AGENTS.md:312-315`)

- **Do NOT use `loadFromModule()`** — context properties don't propagate in Qt 6.11. Use `engine.load()`.
- **Do NOT name context properties `State`** — collides with `QtQuick.State`.
- Use `QVariantMap`/`QVariantList` at signal/property boundaries — **not** `QJsonObject`/`QJsonArray`.

### Observed C++ patterns (`psi/src/main.cpp`)

- `QQuickStyle::setStyle("Material")` (line 20).
- All QObjects parented to `app` (line 22-33). No raw `new` without parent.
- Signal/slot wiring uses **pointer-to-member** syntax: `QObject::connect(sender, &SseConnection::thoughtReceived, ...)` (line 36-59). String-based `SIGNAL()`/`SLOT()` is **not** used.
- Base URLs hardcoded in `main.cpp:24` (`http://localhost:7432`) and `:31` (`http://localhost:9432`) — daemon SSE and MCP. These are the Ember ports; Maren is `:9433` per `CLAUDE.md`.
- `QGuiApplication::setApplicationName("psi")` + `setOrganizationName("hoard")` (`main.cpp:17-18`).

### QML file layout (`psi/qml/`)

- One component per file, PascalCase matches filename: `Main.qml`, `SessionRail.qml`, `ConversationStream.qml`, `ConnectionBar.qml`, `InputBar.qml`, `StatePanel.qml`, `StreamFilter.qml`, five delegates (`ThoughtDelegate.qml`, `DotMessageDelegate.qml`, `StoneDelegate.qml`, `QuestEventDelegate.qml`, `SummaryDelegate.qml`).
- Typed delegates pattern: each conversation event type has its own delegate, selected by `ConversationStream.qml` (per `AGENTS.md:162`).
- 1023 lines total across the 12 QML files — average 85 lines per component.

## Morsels — Markdown skills

Canonical: `AGENTS.md:292-298`.

- Frontmatter (YAML between `---` fences): `name` (matches directory), `description`, `license: MIT` required.
- Pi-specific skills: include `compatibility: "Designed for Pi (pi-coding-agent)"`.
- SKILL.md under 500 lines; reference material moves to `references/`.
- **No automated linting** — manual frontmatter review.

## Naming — cross-language summary

| Concern          | Go                                      | TypeScript                                     | Python               | Kotlin                                              | C++                                                | QML                               |
| ---------------- | --------------------------------------- | ---------------------------------------------- | -------------------- | --------------------------------------------------- | -------------------------------------------------- | --------------------------------- |
| Packages/modules | lowercase, single word                  | camelCase dirs                                 | snake_case pkgs      | lowercase dot notation (`dev.dragoncubed.leylines`) | lowercase namespace                                | PascalCase filename per component |
| Types/classes    | `PascalCase` via `revive exported`      | PascalCase                                     | PascalCase           | PascalCase                                          | PascalCase                                         | —                                 |
| Funcs/methods    | `camelCase`                             | camelCase                                      | snake_case           | camelCase                                           | camelCase (observed: `thoughtReceived`)            | camelCase                         |
| Constants        | `UpperCamel` (Go exported)              | UPPER_SNAKE or camelCase                       | UPPER_SNAKE          | `const val UPPER_SNAKE`                             | UPPER_SNAKE / `kPascalCase`                        | —                                 |
| Error types      | `ErrFoo` (sentinel) / `FooError` (type) | extends `Error` with named class               | subclass `Exception` | subclass exception                                  | std::exception hierarchy                           | —                                 |
| Files            | `snake_case.go`                         | `kebab-case.ts` (observed: `dragon-breath.ts`) | `snake_case.py`      | `PascalCase.kt`                                     | `lowercase.cpp/.h` (observed: `sseconnection.cpp`) | `PascalCase.qml`                  |

## Error handling posture

- **Go:** `fmt.Errorf("doing X: %w", err)` for cross-package wraps; `errors.Is`/`errors.As` for comparison; lowercase messages, no punctuation (`.golangci.yml` revive rules `error-strings`, `errorf`).
- **TypeScript:** narrow `unknown` via `instanceof Error`; no `any` on catch without comment (`AGENTS.md:445` + rule-doc guidance).
- **Python:** catch specific exceptions, never bare `except:`; re-raise with plain `raise` (not `raise e`); `contextlib.contextmanager` over try/finally (`dragon-forge/.claude/rules/python.md` Error Handling section).
- **Kotlin:** prefer `Result<T>` / sealed types; never use `!!`; never catch `CancellationException` without rethrowing (`.claude/rules/kotlin/coding-style.md`).
- **C++/Qt:** check return values from `QFile::open` etc. (they return `bool`, not throw); `qWarning`/`qCritical`/`qDebug` with category logging; never use C++ exceptions across Qt API boundaries (`.claude/rules/qt.md` Error Handling section).

## Immutability posture

- **Root rule:** `~/.claude/rules/common/coding-style.md` — "ALWAYS create new objects, NEVER mutate existing ones."
- **TypeScript:** spread-based updates; `Readonly<T>` on parameters.
- **Kotlin:** `val` default, `data class` + `.copy()` for state updates.
- **Python:** `@dataclass(frozen=True)` / `NamedTuple` encouraged.
- **Go:** idiomatic value-semantics for small structs; returning new slices rather than mutating in place.
- **C++:** Rule of Zero preferred; `const&` for large types; return by value (RVO).

---

_Convention analysis: 2026-04-22_
