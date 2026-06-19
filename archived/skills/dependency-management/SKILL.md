---
name: dependency-management
description: "Dependency management across ecosystems: bun (preferred Node PM), uv (Python), cargo (Rust), Go modules, and Gradle (Java/Kotlin). Covers adding/removing deps, lockfiles, workspaces, security auditing, and version strategies. Use when managing dependencies, resolving version conflicts, setting up workspaces, or auditing packages."
license: MIT
---

# Dependency Management

Covers adding, removing, updating, and auditing dependencies across five ecosystems. When in doubt, prefer exact tools listed — `bun` over npm/pnpm, `uv` over pip/poetry, Gradle over Maven.

## Quick Reference

| Task | Bun | uv | Cargo | Go | Gradle |
|------|-----|----|-------|----|--------|
| Add dep | `bun add pkg` | `uv add pkg` | `cargo add crate` | `go get pkg@v1` | `implementation("g:a:v")` |
| Remove dep | `bun remove pkg` | `uv remove pkg` | `cargo remove crate` | `go get pkg@none` | delete line |
| Install all | `bun install` | `uv sync` | `cargo build` | `go mod download` | `./gradlew build` |
| Update one | `bun update pkg` | `uv lock --upgrade-package pkg` | `cargo update -p crate` | `go get pkg@latest` | bump version |
| Update all | `bun update` | `uv lock --upgrade` | `cargo update` | `go get -u ./...` | `./gradlew dependencyUpdates` |
| Audit | `bun audit` | `uv audit` | `cargo audit` | `govulncheck ./...` | — |
| Exec one-off | `bunx pkg` | `uvx pkg` | `cargo run` | — | — |
| Dep tree | `bun pm ls` | `uv tree` | `cargo tree` | `go mod graph` | `./gradlew dependencies` |

---

## Bun (Node.js — preferred)

> Use bun for all Node.js projects. Prefer it over npm, pnpm, and yarn.

### Core Commands

```bash
bun install                         # install from bun.lockb (frozen if CI)
bun add express                     # add runtime dep
bun add -d @types/node typescript   # add dev dep
bun add -E zod                      # exact version (no range)
bun remove lodash                   # remove dep
bun update                          # update all within semver ranges
bun update zod                      # update one package
bun pm ls                           # list installed packages
bunx tsc --version                  # run a bin without installing globally
```

### bun.lockb

- Binary lockfile — commit it, do not edit manually
- Regenerate with `bun install` after editing `package.json`
- Add `*.lockb diff=lockb` to `.gitattributes` for readable diffs:
  ```
  *.lockb binary diff=lockb
  ```
  Then: `git config diff.lockb.textconv "bun --bun x @nicolo-ribaudo/lockb-print"`

### Workspaces

```json
// package.json (root)
{
  "name": "my-monorepo",
  "workspaces": ["packages/*", "apps/*"]
}
```

```bash
bun install                         # installs all workspace packages
bun add lodash --filter @scope/pkg  # add dep to specific workspace
bun run build --filter @scope/pkg   # run script in one workspace
bun run build --filter './packages/**'  # run in all matching packages
```

Use `workspace:*` protocol for internal cross-package deps:
```json
{ "dependencies": { "@scope/shared": "workspace:*" } }
```

### Scripts and Lifecycle

```json
{ "scripts": { "build": "tsc", "postinstall": "patch-package" } }
```

Bun runs `pre*` / `post*` hooks by default. Run with `bun run <name>` or `bun <name>` (auto-discovery).

---

## uv (Python — preferred)

> Use uv for all Python projects. Replaces pip, pip-tools, virtualenv, pyenv, and poetry.

### Core Commands

```bash
uv init myproject                   # scaffold pyproject.toml + .venv
uv add requests                     # add dep (updates pyproject.toml + uv.lock)
uv add "httpx>=0.26"                # with version constraint
uv add --dev pytest ruff            # add dev dep
uv remove requests                  # remove dep
uv sync                             # install from uv.lock (creates .venv if absent)
uv sync --frozen                    # CI — fail if lockfile is out of date
uv sync --no-dev                    # production install, skip dev deps
uv lock --upgrade                   # regenerate lock with latest compatible versions
uv lock --upgrade-package httpx     # upgrade one package
uv tree                             # dependency tree
```

### Script Execution

```bash
uv run python src/main.py           # run in managed .venv
uv run pytest                       # run dev tool without activating venv
uvx ruff check .                    # run tool in ephemeral env (no project needed)
uvx --from httpie http GET example.com  # run tool from specific package
```

### pyproject.toml Integration

```toml
[project]
name = "myapp"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.26",
    "pydantic>=2.0",
]

[dependency-groups]
dev = ["pytest>=8", "ruff>=0.3"]

[tool.uv]
dev-dependencies = ["pytest>=8"]    # alternative to dependency-groups

[tool.uv.sources]
# Override source for one package (local or git)
mylib = { path = "../mylib", editable = true }
```

### Python Version Management

```bash
uv python install 3.12              # install Python 3.12
uv python list                      # list installed/available versions
uv python pin 3.12                  # write .python-version (per-project)
uv venv --python 3.12               # create venv with specific version
```

### uv pip and Global Tools

```bash
uv pip install -r requirements.txt              # compatibility layer for existing projects
uv pip compile requirements.in -o requirements.txt  # pin deps to file

uv tool install ruff                            # install CLI tool globally
uv tool upgrade ruff && uv tool list
```

---

## Cargo (Rust)

### Core Commands

```bash
cargo add serde --features derive   # add with features
cargo add tokio --features full
cargo add --dev criterion           # dev dep
cargo add --build cc                # build dep
cargo remove serde                  # remove
cargo update                        # update within semver ranges
cargo update -p serde               # update one crate
cargo tree                          # full dependency tree
cargo tree -d                       # show duplicate crates (diamond problem)
```

### Cargo.lock

- **Binaries** — always commit `Cargo.lock` (reproducible builds)
- **Libraries** — do not commit (let consumers pick versions); add to `.gitignore`

### Workspaces

```toml
# Cargo.toml (root)
[workspace]
members = ["crates/*", "tools/*"]
resolver = "2"

# Share dep versions across workspace
[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

Member crate inherits:
```toml
# crates/mylib/Cargo.toml
[dependencies]
serde = { workspace = true }
tokio = { workspace = true, optional = true }
```

### Features and Optional Dependencies

```toml
[features]
default = ["std"]
std = []
async = ["dep:tokio"]

[dependencies]
tokio = { version = "1", optional = true }
```

```bash
cargo build --features async        # enable feature
cargo build --no-default-features   # disable defaults
```

### Security Audit

```bash
cargo install cargo-audit
cargo audit                         # check advisory database
cargo audit fix                     # auto-update vulnerable deps where possible
```

---

## Go Modules

### Core Commands

```bash
go get github.com/user/pkg@v1.2.3   # add/update dep (specific version)
go get github.com/user/pkg@latest   # update to latest
go get github.com/user/pkg@none     # remove dep
go get -u ./...                     # update all deps to latest minor/patch
go mod tidy                         # prune unused, add missing, sync go.sum
go mod download                     # pre-download (CI caching)
go mod verify                       # verify cached modules against go.sum
go mod graph                        # print dependency graph
go list -m all                      # list all modules
```

**Always run `go mod tidy` after any `go get` operation.**

### go.mod and go.sum

- Commit both `go.mod` and `go.sum`
- `go.sum` contains checksums — it is not a lockfile; versions are pinned in `go.mod`
- Do not edit `go.sum` manually

### Module Proxies

```bash
# Default: uses proxy.golang.org, then direct
GOPROXY=https://proxy.golang.org,direct go get pkg

# Skip proxy for private modules
GOPRIVATE=github.com/myorg/* go get github.com/myorg/private

# Direct only (no proxy)
GOPROXY=direct go get pkg
```

### go work (Multi-Module Workspaces)

```bash
go work init ./module1 ./module2    # create go.work
go work use ./module3               # add another module
go work sync                        # sync deps across modules
```

```
# go.work
go 1.22

use (
    ./core
    ./api
    ./cli
)
```

Do **not** commit `go.work` unless the repo is intentionally a multi-module workspace. Add to `.gitignore` for local-dev-only workspaces.

### Vendoring

```bash
go mod vendor                       # copy deps to vendor/
go build -mod=vendor ./...          # build from vendor (air-gapped CI)
```

### Replace Directives (Local Dev)

```go
// go.mod — temporary local override
replace github.com/user/pkg => ../local-pkg
```

Remove before merging. Never commit replace directives pointing to local paths.

---

## Gradle (Java/Kotlin — preferred for JVM)

### Dependency Configurations

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")   // compile + runtime
    api("org.jetbrains.kotlin:kotlin-stdlib")               // exposes to consumers
    compileOnly("org.projectlombok:lombok:1.18.30")         // compile only
    runtimeOnly("org.postgresql:postgresql:42.6.0")         // runtime only
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
```

### Version Catalogs (libs.versions.toml)

Preferred for multi-module projects:

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "1.9.22"
ktor = "2.3.7"
junit = "5.10.0"

[libraries]
kotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }
ktor-server = { module = "io.ktor:ktor-server-core", version.ref = "ktor" }
junit-jupiter = { module = "org.junit.jupiter:junit-jupiter", version.ref = "junit" }

[bundles]
ktor = ["ktor-server", "ktor-client"]
```

```kotlin
// build.gradle.kts — using catalog
dependencies {
    implementation(libs.kotlin.stdlib)
    implementation(libs.bundles.ktor)
    testImplementation(libs.junit.jupiter)
}
```

### Multi-Project Builds

```kotlin
// settings.gradle.kts
include(":core", ":api", ":cli")
```

```kotlin
// build.gradle.kts (root)
subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    repositories { mavenCentral() }
}

// Inter-project deps
dependencies {
    implementation(project(":core"))
}
```

### Inspecting Dependencies

```bash
./gradlew dependencies                          # full tree
./gradlew dependencies --configuration runtimeClasspath  # one config
./gradlew :api:dependencies                     # specific subproject
./gradlew dependencyInsight --dependency slf4j  # why is this dep included?
```

### Dependency Updates Plugin

```kotlin
// build.gradle.kts
plugins {
    id("com.github.ben-manes.versions") version "0.51.0"
}
```

```bash
./gradlew dependencyUpdates                     # show available updates
./gradlew dependencyUpdates -Drevision=release  # only stable releases
```

### Resolution Strategies

```kotlin
configurations.all {
    resolutionStrategy {
        force("com.google.guava:guava:32.1.3-jre")     // pin version globally
        failOnVersionConflict()                         // fail on any conflict
        eachDependency {
            if (requested.group == "org.slf4j") {
                useVersion("2.0.9")
                because("force consistent slf4j version")
            }
        }
    }
}
```

---

## Cross-Cutting Concerns

### Lockfile Hygiene

| Ecosystem | Lockfile | Commit? |
|-----------|---------|---------|
| Bun | `bun.lockb` | ✅ always |
| uv | `uv.lock` | ✅ always |
| Cargo (binary) | `Cargo.lock` | ✅ always |
| Cargo (library) | `Cargo.lock` | ❌ gitignore |
| Go | `go.sum` | ✅ always |
| Gradle | (no native lockfile) | use version catalog |

Regenerate lockfiles with `--frozen` / `--locked` in CI to catch drift:
```bash
bun install --frozen-lockfile      # fail if bun.lockb would change
uv sync --frozen                   # fail if uv.lock would change
cargo build --locked               # fail if Cargo.lock would change
```

### Version Pinning Strategies

| Strategy | Syntax (npm/bun) | When to Use |
|----------|-----------------|-------------|
| Exact | `"1.2.3"` | Prod deps in apps, security-sensitive |
| Caret | `"^1.2.3"` | Most app deps (allows minor/patch) |
| Tilde | `"~1.2.3"` | Patch updates only |
| Range | `">=1.0.0 <2.0.0"` | Library peerDeps |
| Latest | `"*"` | ❌ avoid |

For Python (uv): use `>=x.y` for libraries, `==x.y.z` in lockfile-driven apps.

### Security Auditing

```bash
# Node.js
bun audit
bun audit --level high             # only high/critical

# Python
uv audit                           # checks PyPI advisory database

# Rust
cargo audit
cargo audit --deny warnings        # fail CI on any advisory

# Go
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Java
./gradlew dependencyCheckAnalyze   # requires org.owasp.dependencycheck plugin
```

### CI Cache Paths (GitHub Actions `actions/cache@v4`)

| Ecosystem | `path` | `key` hash file |
|-----------|--------|-----------------|
| Bun | `~/.bun/install/cache` | `bun.lockb` |
| uv | `~/.cache/uv` | `uv.lock` |
| Cargo | `~/.cargo/registry`, `~/.cargo/git`, `target/` | `Cargo.lock` |
| Go | `~/go/pkg/mod` | `go.sum` |
| Gradle | `~/.gradle/caches` | `gradle/libs.versions.toml` |

### Resolving Version Conflicts

1. **Identify the conflict** — use `cargo tree -d`, `bun pm ls`, `./gradlew dependencyInsight`, `uv tree`
2. **Find the diamond** — two packages require incompatible versions of a shared dep
3. **Resolution options:**
   - Upgrade the higher-level dep that pins the old version
   - Force/override to the newer compatible version
   - Use a shim or compatibility layer if versions are truly incompatible
4. **Validate** — run tests after resolution; version conflicts can cause silent runtime failures

```bash
# Cargo — find duplicates
cargo tree -d

# Go — find why a dep is included
go mod why github.com/user/pkg

# Gradle — investigate a conflict
./gradlew dependencyInsight --dependency log4j --configuration runtimeClasspath
```
