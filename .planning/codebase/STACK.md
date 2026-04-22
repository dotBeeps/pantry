# Technology Stack

**Analysis Date:** 2026-04-22

> Authoritative canonical reference: [`AGENTS.md`](../../AGENTS.md) (lines 231–340 cover setup + per-sub-package verification commands). This document cross-references AGENTS.md and adds version pins, dependency details, and per-sub-package specifics not covered there.

## Monorepo Shape

**Hoard** is a polyglot monorepo with 8 sub-packages, each with its own toolchain. The root `package.json` (`package.json:1-11`) declares `pi-package` keyword and points pi at `berrygems/extensions` and `morsels/skills` for auto-discovery — installed via `pi install https://github.com/dotBeeps/hoard`.

| Sub-package              | Language                       | Build system                 | Entry point                                                                  |
| ------------------------ | ------------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| `berrygems/`             | TypeScript (ESM, no transpile) | pnpm + tsc                   | `berrygems/extensions/*.ts`                                                  |
| `morsels/`               | Markdown                       | none                         | `morsels/skills/*/SKILL.md`                                                  |
| `storybook-daemon/`      | Go 1.25                        | `go build`                   | `storybook-daemon/main.go`                                                   |
| `psi/`                   | C++17 + QML                    | CMake + Qt6                  | `psi/src/main.cpp`                                                           |
| `dragon-cubed/soulgem/`  | Go 1.26                        | `go build`                   | `dragon-cubed/soulgem/main.go`                                               |
| `dragon-cubed/leylines/` | Kotlin 2.1 / JVM 21            | Gradle (Kotlin DSL)          | `dragon-cubed/leylines/src/main/kotlin/dev/dragoncubed/leylines/Leylines.kt` |
| `dragon-cubed/rumble/`   | Kotlin 2.1 / JVM 21            | Gradle (Kotlin DSL)          | `dragon-cubed/rumble/src/main/kotlin/dev/dragoncubed/rumble/Rumble.kt`       |
| `dragon-forge/`          | Python (Unsloth venv)          | fish wrapper + external venv | `dragon-forge/train.py`, `extract.py`, `eval.py`                             |
| `cc-plugin/`             | Markdown + JSON                | none (CC plugin bundle)      | `cc-plugin/.claude-plugin/plugin.json`                                       |

## Languages

**Primary:**

- **Go 1.25.0** — `storybook-daemon/` (see `storybook-daemon/go.mod:3`). The `.golangci.yml` pins `run.go: "1.23"` for linter compatibility (`storybook-daemon/.golangci.yml:6-8`) while the module itself targets 1.25.
- **Go 1.26.1** — `dragon-cubed/soulgem/` (see `dragon-cubed/soulgem/go.mod:3`). Newer than storybook-daemon's toolchain.
- **TypeScript (ESNext, strict, no emit)** — `berrygems/` extensions + lib. Loaded directly by pi via `jiti`, never compiled. Config at `berrygems/tsconfig.json:1-22` — `target: ESNext`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`, `noUnusedLocals: true`, `allowImportingTsExtensions: true`.
- **Kotlin 2.1.0 / JVM 21** — `dragon-cubed/leylines/` and `dragon-cubed/rumble/`. Toolchain pinned via `kotlin { jvmToolchain(21) }` in both `dragon-cubed/leylines/build.gradle.kts:48-50` and `dragon-cubed/rumble/build.gradle.kts:52-54`.
- **C++17** — `psi/` (set in `psi/CMakeLists.txt:4-5`).

**Secondary:**

- **QML (Qt 6.5+)** — `psi/qml/` — 12 QML files declaring the desktop UI (`psi/CMakeLists.txt:26-39`).
- **Python 3** — `dragon-forge/` fine-tuning scripts. No `pyproject.toml`; relies on an **external, out-of-tree** shared venv at `~/.unsloth/studio/unsloth_studio/bin/python` (referenced in `dragon-forge/run.fish:20`).
- **Markdown** — `morsels/skills/` (pi-consumed skills), `cc-plugin/skills/` (CC-consumed skills), per-feature docs in `den/`.
- **fish shell** — `dragon-forge/run.fish` (only shell script in the tree; fish is the user's shell per global rules).

## Runtime

**Pi (agent harness):**

- Hoard extends [pi](https://github.com/badlogic/pi-mono) — see `AGENTS.md:344-357`.
- Pi packages consumed by berrygems (resolved through symlinks per `AGENTS.md:262-272`):
  - `@mariozechner/pi-ai` — LLM API / streaming / model discovery
  - `@mariozechner/pi-tui` — terminal UI primitives
  - `@mariozechner/pi-agent-core` — agent loop / transport
  - `@mariozechner/pi-coding-agent` — coding-agent CLI, `ExtensionAPI`
  - `@sinclair/typebox` — JSON schema for tool params (`Type`)
- The daemon itself **spawns pi as a subprocess per thought beat** — `storybook-daemon/internal/thought/pi.go:33-36` runs `pi --mode text -p --model <...> --system-prompt <tmp> --thinking <level> --session <jsonl>` per heartbeat. Pi owns inference; the daemon owns the attention economy + scheduling.

**Daemon (Go):**

- Binary produced by `go build -o storybook-daemon .` in `storybook-daemon/` (see `AGENTS.md:282-284`).
- CLI via cobra: `storybook-daemon run` / `run-all --all` / `run-all --personas a,b` (see `storybook-daemon/cmd/root.go`, `storybook-daemon/cmd/run.go`, `storybook-daemon/cmd/run_all.go`).

**Desktop app (Qt):**

- `psi/` built via `cd psi && cmake -B build && cmake --build build` (see `AGENTS.md:302-308`).
- Runtime requires Qt 6.5+ with **Quick, Network, QuickControls2** components (`psi/CMakeLists.txt:8`).
- QML loaded via `engine.load(qrc:/qt/qml/Psi/qml/Main.qml)` using `QQuickStyle::setStyle("Material")` (`psi/src/main.cpp:20,89-90`).
- **Dead-end warning** documented in `AGENTS.md:311-314`: do not use `loadFromModule()` — context properties don't propagate under Qt 6.11. Do not name a context property `State` (collides with `QtQuick.State`). Use `QVariantMap`/`QVariantList` at signal boundaries, not `QJsonObject`/`QJsonArray`.

**Minecraft body (NeoForge):**

- Targets **Minecraft 1.21.4 + NeoForge 21.4.172-beta + KFF 5.6.0** (see `dragon-cubed/leylines/build.gradle.kts:7,21,44`; `dragon-cubed/rumble/build.gradle.kts:20,42`).
- Parchment mappings `2024.11.17` over MojMap official (`dragon-cubed/leylines/build.gradle.kts:24-27`).
- Builds with `./gradlew build` from `dragon-cubed/` root; `settings.gradle.kts` includes `:leylines` + `:rumble`.
- NeoForge Gradle plugin: `net.neoforged.moddev` version 2.0.78 (`dragon-cubed/leylines/build.gradle.kts:7`).

**Fine-tuning pipeline (Python, out-of-tree venv):**

- Runs only through `dragon-forge/run.fish` which forces `HIP_VISIBLE_DEVICES=0` and uses the shared Unsloth studio venv — **ROCm 7.2 + unsloth 2026.4+** per `dragon-forge/train.py:11-13`.
- Subcommands: `extract` (walk session logs → `out/dataset.jsonl`), `train`, `validate` (1-batch smoke test), `dry-run`, `eval`.

## Package Managers

| Sub-package                         | Manager                                                                                   | Lockfile                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| `berrygems/`                        | **pnpm** (lockfileVersion 9.0 — `berrygems/pnpm-lock.yaml:1`)                             | `berrygems/pnpm-lock.yaml`           |
| Root `/`                            | npm-compatible (only `node_modules/` exists for symlink resolution — no lockfile at root) | none                                 |
| `morsels/`                          | n/a (markdown only — `morsels/package.json:1-8` exists for pi discovery)                  | none                                 |
| `storybook-daemon/`                 | Go modules                                                                                | `storybook-daemon/go.sum` (59 lines) |
| `dragon-cubed/soulgem/`             | Go modules                                                                                | `dragon-cubed/soulgem/go.sum`        |
| `dragon-cubed/leylines/`, `rumble/` | Gradle (wrapper pinned in repo per `AGENTS.md:330`)                                       | Gradle resolves at build time        |
| `dragon-forge/`                     | implicit (external venv, no pinning)                                                      | none in-tree                         |

## Frameworks & Key Dependencies

### storybook-daemon (Go) — `storybook-daemon/go.mod:5-12`

**Direct dependencies:**

- `github.com/anthropics/anthropic-sdk-go v1.30.0` — Anthropic SDK (present in go.mod but **not imported anywhere under `internal/`** — daemon delegates inference to pi-as-subprocess, so this appears vestigial or reserved for future direct use).
- `github.com/fsnotify/fsnotify v1.9.0` — filesystem watcher for the hoard nerve (`storybook-daemon/internal/nerve/hoard/watcher.go:14`).
- `github.com/modelcontextprotocol/go-sdk v1.5.0` — MCP server implementation imported as `gomcp` in `storybook-daemon/internal/psi/mcp/mcp.go:17`.
- `github.com/spf13/cobra v1.10.2` — CLI framework (`storybook-daemon/cmd/root.go:8`).
- `github.com/stretchr/testify v1.11.1` — test assertions (table-driven tests with `assert`/`require`).
- `gopkg.in/yaml.v3 v3.0.1` — persona YAML parsing (`storybook-daemon/internal/persona/loader.go:10`) and Obsidian note frontmatter (`storybook-daemon/internal/memory/vault.go:14`).

**Indirect (notable):**

- `github.com/google/jsonschema-go v0.4.2` — pulled in by MCP SDK for tool-schema handling.
- `github.com/tidwall/gjson`, `match`, `pretty`, `sjson` — also via MCP SDK.
- `golang.org/x/oauth2 v0.35.0`, `golang.org/x/sync v0.16.0`, `golang.org/x/sys v0.41.0`.

**Lint stack (`storybook-daemon/.golangci.yml`):** v2 format. Formatters `gofumpt` (with `extra-rules: true`) + `goimports`. Linters include `errname`, `errorlint`, `wrapcheck`, `nilnil`, `exhaustive`, `bodyclose`, `noctx`, `contextcheck`, `fatcontext`, `revive`, `gocritic`, `gosec`, `forbidigo`, `perfsprint`, `intrange`, `copyloopvar`. `fmt.Print*` banned outside `cmd/` (agents.md:287). All `//nolint` must name the linter and give a reason.

### dragon-cubed/soulgem (Go) — `dragon-cubed/soulgem/go.mod:5-9`

- `github.com/gorilla/websocket v1.5.3` — WebSocket client for the Leylines connection (`dragon-cubed/soulgem/internal/leylines/client.go` — `websocket.DefaultDialer.DialContext`).
- `github.com/spf13/cobra v1.10.2` — CLI (`dragon-cubed/soulgem/cmd/root.go`, `serve.go`, `agents.go`).
- `golang.org/x/sync v0.20.0` — errgroup for server lifecycle (`dragon-cubed/soulgem/cmd/serve.go:12`).

### psi (Qt/C++) — `psi/CMakeLists.txt:8,43-47`

- `Qt6::Quick` — QML runtime
- `Qt6::Network` — `QNetworkAccessManager` for HTTP/SSE + MCP JSON-RPC (used in `psi/src/sseconnection.cpp`, `psi/src/mcpclient.cpp`)
- `Qt6::QuickControls2` — Material style widgets
- CMake 3.21+ minimum; C++17 standard; `CMAKE_AUTOMOC ON`; qml module registered via `qt_add_qml_module(psi URI Psi VERSION 1.0 ...)`.
- **Qt version floor is 6.5** but the repo documents a Qt 6.11 workaround for context-property propagation (`AGENTS.md:311-314`).

### berrygems (TS) — no `package.json` dependencies; pi packages via symlinks

- `berrygems/package.json:1-8` has no `dependencies` field — everything is resolved through symlinks from the pi global install, re-linked manually (`AGENTS.md:262-272`).
- TS path aliases in `berrygems/tsconfig.json:15-19`:
  - `@mariozechner/pi-tui` → `../node_modules/@mariozechner/pi-tui/dist`
  - `@mariozechner/pi-coding-agent` → `../node_modules/@mariozechner/pi-coding-agent/dist`
  - `@mariozechner/pi-ai` → `../node_modules/@mariozechner/pi-ai/dist`
  - `@sinclair/typebox` → `../node_modules/@sinclair/typebox`
- **No eslint config** — `tsc` is the only lint gate (`AGENTS.md:273`).
- **No test framework** — manual `/reload` in pi (`AGENTS.md:274`).
- Shared internal libs live in `berrygems/lib/` — 13 modules listed in `AGENTS.md:456` (`settings`, `ally-taxonomy`, `pi-spawn`, `id`, `cooldown`, `local-server`, `sse-client`, `panel-chrome`, `compaction-templates`, `animated-image`, `animated-image-player`, `giphy-source`, `lsp-client`).

### dragon-cubed/leylines + rumble (Kotlin/NeoForge)

- Kotlin 2.1.0 JVM plugin + NeoForge moddev 2.0.78 (both `build.gradle.kts`).
- `thedarkcolour:kotlinforforge-neoforge:5.6.0` — KFF runtime providing Kotlin stdlib + coroutines + serialization bundled at runtime (`dragon-cubed/leylines/build.gradle.kts:44`; `dragon-cubed/rumble/build.gradle.kts:42`).
- Rumble additionally requires a **manually placed** `baritone-api-neoforge-1.13.1.jar` in `dragon-cubed/rumble/libs/` (see `dragon-cubed/rumble/build.gradle.kts:5-9,49`), marked `compileOnly` so the end-user installs Baritone as a separate mod.
- Rumble `compileOnly(project(":leylines"))` — Leylines API is a separate runtime mod (`dragon-cubed/rumble/build.gradle.kts:46`).
- **Gson + Netty are bundled by Minecraft at runtime** — no jarJar needed (`dragon-cubed/leylines/build.gradle.kts:45`). `LeylineServer` uses Netty directly (`io.netty.bootstrap.ServerBootstrap` + `WebSocketServerProtocolHandler` on path `/leylines`).

### dragon-forge (Python, out-of-tree)

**Runtime dependencies (imported, not pinned here — pinned by the external venv):**

- `unsloth` (`unsloth.FastLanguageModel`, `unsloth.chat_templates.train_on_responses_only`) — LoRA fine-tuning (`dragon-forge/train.py:23-24`).
- `datasets` (`datasets.Dataset`) — HuggingFace datasets.
- `transformers` (`DataCollatorForSeq2Seq`).
- `trl` (`SFTConfig`, `SFTTrainer`) — supervised fine-tuning trainer.
- Standard lib: `argparse`, `json`, `random`, `pathlib`, `hashlib`, `re`, `collections.Counter`, `datetime`, `dataclasses`.
- **No requirements.txt, no pyproject.toml in-tree** — version pinning is delegated to the shared Unsloth studio venv outside the repo.

**Target model:** Qwen 2.5 7B Instruct with LoRA (r=32, lr=2e-4, 2 epochs default per `dragon-forge/train.py` argparse defaults).

### cc-plugin (Claude Code plugin bundle)

- `cc-plugin/.claude-plugin/plugin.json:1-5` — plugin manifest v0.1.0, named `hoard`.
- Pure Markdown + JSON — no build.
- An `.orphaned_at` sentinel file (`cc-plugin/.orphaned_at`) contains a Unix timestamp `1776360954362` (Apr 14 2026) — indicates plugin may be in the process of being deprecated or split.

## Configuration Files

**In-repo:**

- `storybook-daemon/.golangci.yml` — v2 linter config, `run.go: "1.23"`.
- `berrygems/tsconfig.json` — strict mode, ESNext + bundler resolution.
- `psi/CMakeLists.txt` — Qt6.5 + C++17.
- `dragon-cubed/settings.gradle.kts` — includes `:leylines` and `:rumble`, repositories: `gradlePluginPortal`, `mavenCentral`, `maven.neoforged.net`, `thedarkcolour.github.io/KotlinForForge`.
- Root `/.mcp.json` — registers only `storybook-ember` at `http://127.0.0.1:9432/mcp`.
- `cc-plugin/.mcp.json` — active registration: `storybook-ember` only (type: http, `http://127.0.0.1:9432/mcp`).
- `cc-plugin/.mcp.json.disabled` — archived dual registration including `storybook-maren` at `http://127.0.0.1:9433/mcp`. Maren's MCP endpoint **is defined in `storybook-daemon/personas/maren.yaml:54-57` (port 9433)** but currently disabled at the CC plugin layer.

**Per-persona YAML (`storybook-daemon/personas/`):**

- `ember.yaml` — pool 1000, rate 120/hr, thought_interval 20m, SSE port 7432, MCP port 9432, nerves include `hoard-git` at `~/Development/hoard`.
- `maren.yaml` — pool 400, rate 60/hr, thought_interval 45m, SSE port 7433, MCP port 9433, no nerves.

**Runtime settings (not in repo):**

- `~/.pi/agent/settings.json` — global pi settings; hoard namespace is `hoard.*` with tiered nesting (`AGENTS.md:400-403`). Accessed only via `readHoardSetting()` from `berrygems/lib/settings.ts` — never hand-parsed (`AGENTS.md:452`). Namespaces: `breath`, `contributor`, `curfew`, `lab`, `digestion`, `guard`, `allies`, `herald`, `imageFetch`, `musings`, `panels`, `todos`, `tone`, `websearch`.
- `~/.pi/hoard-sending-stone.json` — sending-stone primary-session discovery file (`berrygems/extensions/hoard-sending-stone/index.ts:27`).
- `~/.config/storybook-daemon/personas/<name>.yaml` — daemon loads persona from this path via `storybook-daemon/internal/persona/loader.go:32-40` (the in-repo `personas/*.yaml` are exemplars copied to that path).

## Platform Requirements

**Development / build toolchain:**

- Go 1.25+ for storybook-daemon; Go 1.26+ for soulgem.
- Node.js + pnpm for berrygems (specific version not pinned; pi install chain in `AGENTS.md:262-272` references `~/.npm/lib/node_modules/mitsupi/`).
- JDK 21 for dragon-cubed Kotlin builds (`AGENTS.md:325,338`).
- CMake 3.21+ and Qt 6.5+ for psi (the user is known to run Qt 6.11 — see dead-end at `AGENTS.md:311-314`).
- `golangci-lint` v2-format for Go lint.
- `gofumpt` and `goimports` enforced via golangci-lint formatters block.
- Python out-of-tree venv at `~/.unsloth/studio/unsloth_studio/bin/python` with ROCm 7.2 for dragon-forge (AMD GPU required — `HIP_VISIBLE_DEVICES=0` forced in `dragon-forge/run.fish:17`).
- `pi` binary on `$PATH` — required both at runtime (daemon spawns pi per beat) and for extension reloading.

**Target / runtime:**

- Linux (user environment: Arch/CachyOS per env metadata); fish shell.
- Kitty terminal for GIF rendering via the Kitty Graphics Protocol (hard dependency of `kitty-gif-renderer` + `animated-image` lib — `AGENTS.md:99,110-111`).
- Minecraft 1.21.4 client + NeoForge 21.4+ for dragon-cubed deployment (side: CLIENT per `dragon-cubed/leylines/src/main/resources/META-INF/neoforge.mods.toml:20,27,34`).
- Obsidian-compatible markdown vault for persona memory (`storybook-daemon/internal/memory/note.go:1` — "Obsidian-compatible markdown vault"). Vault is the filesystem; **no SQL/Postgres/SQLite anywhere** in storybook-daemon.

## Verification Commands

Canonical list in `AGENTS.md:249-340`. Summary cross-reference:

| Package               | Command                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| berrygems             | `tsc --project berrygems/tsconfig.json`                                             |
| storybook-daemon      | `cd storybook-daemon && golangci-lint run ./...` + `go build -o storybook-daemon .` |
| psi                   | `cd psi && cmake -B build && cmake --build build`                                   |
| dragon-cubed/soulgem  | `cd dragon-cubed/soulgem && go build ./... && go vet ./...`                         |
| dragon-cubed (Kotlin) | `cd dragon-cubed && ./gradlew build` (requires JDK 21)                              |
| morsels               | no automated linting — frontmatter validated manually                               |
| dragon-forge          | `./dragon-forge/run.fish validate` (1-batch smoke test)                             |

---

_Stack analysis: 2026-04-22_
