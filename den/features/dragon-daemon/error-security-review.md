# dragon-daemon — Error Handling & Security Review

**Date**: 2026-04-07
**Scope**: All 21 `.go` files in dragon-daemon
**Lint report**: `/tmp/dragon-daemon-lint-report.txt` — 74 findings across 11 linters
**Verdict**: **42 real issues**, **17 false positives**, **15 nolint-worthy**

---

## Part 1: Error Handling Assessment

### Wrapping Discipline — Grade: B-

The codebase wraps errors well *within* functions (`fmt.Errorf("context: %w", err)`) but has **9 cross-package boundary violations** caught by wrapcheck. The pattern breaks consistently at package edges — callers of `os`, `fsnotify`, `time`, and `body` return raw errors without context.

Good examples already in the code:
- `thought/cycle.go:327` — `fmt.Errorf("writing memory: %w", err)` ✅
- `soul/rules.go:115` — `fmt.Errorf("invalid start time: %w", err)` ✅

Bad examples (all 9 wrapcheck findings):
- `body/hoard/hoard.go:203` — bare `os.ReadFile` error returned
- `daemon/daemon.go:148` — bare `cycle.Run` error returned
- `memory/note.go:36,41` — bare `time.Parse` errors returned

### Sentinel vs Custom Types — Grade: C

- **Critical**: `soul/rules.go:ParseGate()` returns `(nil, nil)` for unknown rule types. Caller cannot distinguish "not a gate" from "parse error." Needs sentinel.
- No custom error types yet — all errors are `fmt.Errorf` strings. Acceptable at this stage, but `soul/enforcer` violations would benefit from a structured `ViolationError` type for programmatic handling.
- 11 instances of `fmt.Errorf("static string")` that should be `errors.New("...")` — no wrapping needed when there's no underlying error.

### errcheck Violations — Grade: B

11 unchecked returns, split into three categories:

| Category | Count | Verdict |
|----------|-------|---------|
| Write-path `f.Close()` / `resp.Body.Close()` | 2 | **FIX** — data loss / resource leak risk |
| Best-effort cleanup (tmp.Close, os.Remove in error paths) | 5 | **nolint** — can't do anything useful on failure |
| `fmt.Fprintf(os.Stdout)` display output | 4 | **nolint** — fire-and-forget user output |

---

## Part 2: Security Findings

### 🔴 File Permissions — 4 violations of AGENTS.md policy

AGENTS.md requires: "dirs ≤0750, files ≤0600."

| File | Line | Current | Required | What's exposed |
|------|------|---------|----------|----------------|
| `memory/vault.go` | 36 | `0755` | `0750` | Vault directory containing dragon's thoughts |
| `memory/vault.go` | 206 | `0644` | `0600` | Individual memory note files |
| `body/hoard/hoard.go` | 223 | `0755` | `0750` | Daily log directory |
| `body/hoard/hoard.go` | 228 | `0644` | `0600` | Daily log files with git activity |

**Impact**: On a multi-user system, any user could read the daemon's memory vault and activity logs. Memory notes may contain sensitive observations, decisions, and persona identity data.

### 🟡 Path Traversal in vault.go — incomplete sanitization

`vault.Write()` accepts a `key` string and builds a file path:
```go
sanitized := sanitizeKey(key)
path := filepath.Join(v.dir, sanitized+".md")
```

`sanitizeKey()` replaces `/` → `-` and `..` → `_`, which catches the obvious cases. However:
- **Null bytes** are not stripped (can truncate paths on some systems)
- **Backslash** (`\`) not handled (Windows paths, though Linux-only today)
- **No containment check** — after sanitization, no verification that the resolved path is still under `v.dir`

**Fix**: Add after sanitization:
```go
abs := filepath.Clean(filepath.Join(v.dir, sanitized+".md"))
if !strings.HasPrefix(abs, filepath.Clean(v.dir)+string(os.PathSeparator)) {
    return nil, fmt.Errorf("key %q resolves outside vault", key)
}
```

### 🟡 exec.Command with config-sourced path — 2 findings

`hoard.go:165,185` run `git -C b.path` where `b.path` comes from persona YAML config. Low risk since the path is set at startup, not from runtime user input. But a malicious persona file could set the path to something unexpected.

**Fix**: Validate at `New()` time that the path exists and is a directory.

### 🟢 False Positives — 2 findings

| File | Line | Linter | Why it's false |
|------|------|--------|----------------|
| `auth/pi.go` | 24 | gosec G101 | `tokenURL` is a URL constant (`https://...`), not a credential value |
| `heart/heart.go` | 95 | gosec G404 | `math/rand` used for timing jitter on tick intervals — not security-sensitive randomness |

---

## Part 3: Fix-or-Nolint Verdict by File

### `internal/auth/pi.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 24 | gosec G101 | **nolint** | `//nolint:gosec // G101: tokenURL is a URL constant, not a credential` |
| 134 | errcheck | **FIX** | Check `resp.Body.Close()` — use pattern: read body fully, then `_ = resp.Body.Close()` with comment, or defer with named return error capture |
| 192 | errcheck | **nolint** | `//nolint:errcheck // best-effort cleanup: close temp file before remove` |
| 193 | errcheck | **nolint** | `//nolint:errcheck // best-effort cleanup: remove temp file on write failure` |
| 197 | errcheck | **nolint** | `//nolint:errcheck // best-effort cleanup: remove temp file on chmod failure` |
| 201 | errcheck | **nolint** | `//nolint:errcheck // best-effort cleanup: remove temp file on rename failure` |

### `internal/body/hoard/hoard.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 22 | gofumpt | **FIX** | Run `gofumpt -w internal/body/hoard/hoard.go` |
| 55 | revive | **FIX** | Add doc comment for exported `GitChange` |
| 57 | revive | **FIX** | Add doc comment for exported `CommitInfo` |
| 88 | revive | **FIX** | `errors.New("hoard body not started")` |
| 96 | revive | **FIX** | `errors.New("hoard body not started")` |
| 125 | revive | **FIX** | `errors.New("hoard body already started")` |
| 165 | gosec G204 | **nolint** | `//nolint:gosec // G204: b.path is from validated persona config loaded at startup` — also add path validation in `New()` |
| 185 | gosec G204 | **nolint** | Same as above |
| 203 | wrapcheck | **FIX** | `return "", fmt.Errorf("reading daily log %s: %w", path, err)` |
| 223 | gosec G301 | **FIX** | Change `0755` → `0o750` |
| 228 | gosec G302 | **FIX** | Change `0644` → `0o600` |
| 232 | errcheck | **FIX** | Named return + deferred close error capture (this is a write-path file — data could be lost if close fails on buffered writer) |
| 247 | perfsprint | **FIX** | `"Logged to " + path` |

### `internal/body/hoard/watcher.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 31 | wrapcheck | **FIX** | `return nil, fmt.Errorf("creating fs watcher: %w", err)` |
| 44 | errcheck | **nolint** | `//nolint:errcheck // best-effort: close watcher after Add() failure` |
| 45 | wrapcheck | **FIX** | `return nil, fmt.Errorf("watching %s: %w", path, err)` |
| 153 | gocritic | **FIX** | Refactor if-else chain to `switch { case evt.Has(fsnotify.Create): ... }` |
| 173 | wrapcheck | **FIX** | `return fmt.Errorf("closing fs watcher: %w", err)` |

### `internal/daemon/daemon.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 81 | revive | **FIX** | Extract body-start loop into a helper or use explicit close tracking: `defer func() { for _, b := range started { b.Stop() } }()` |
| 148 | wrapcheck | **FIX** | `return fmt.Errorf("thought cycle failed: %w", err)` |
| 185 | wrapcheck | **FIX** | `return "", fmt.Errorf("resolving home directory: %w", err)` |

### `internal/heart/heart.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 95 | gosec G404 | **nolint** | `//nolint:gosec // G404: math/rand for timing jitter, not security-sensitive` |
| 99 | revive | **FIX** | Rename variable `min` → `maxJitter` (shadows Go 1.21+ builtin `min`) |

### `internal/memory/vault.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 36 | gosec G301 | **FIX** | Change `0755` → `0o750` |
| 94 | gocritic | **FIX** | Combine parameters if applicable, or verify this is the actual signature flagged. If `NewVault(dir string, log *slog.Logger)` — types differ, **false positive**, add `//nolint:gocritic // paramTypeCombine: dir is string, log is *slog.Logger` |
| 128 | revive | **nolint** | `//nolint:revive // unhandled-error: strings.Builder.WriteString cannot fail` |
| 129 | revive | **nolint** | Same |
| 130–136 | revive | **nolint** | Same — all `strings.Builder` writes (7 instances) |
| 206 | gosec G306 | **FIX** | Change `0644` → `0o600` |

### `internal/memory/note.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 36 | wrapcheck | **FIX** | `return Note{}, fmt.Errorf("parsing created timestamp: %w", err)` |
| 41 | wrapcheck | **FIX** | `return Note{}, fmt.Errorf("parsing updated timestamp: %w", err)` |

### `internal/persona/types.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 6 | gofumpt | **FIX** | Run `gofumpt -w internal/persona/types.go` |
| 14 | revive | **FIX** | Rename `PersonaConfig` → `Config` (eliminates `persona.PersonaConfig` stutter). **Breaking change** — update all call sites. |

### `internal/soul/rules.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 41 | nilnil | **FIX** | Add sentinel: `var ErrNotAGate = errors.New("rule is not a time-based gate")` and return `(nil, ErrNotAGate)`. Update callers to check `errors.Is(err, soul.ErrNotAGate)` and skip gracefully. |

### `internal/soul/memory_audit.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 65 | perfsprint | **FIX** | `"daily-journal/" + now.Format("2006-01-02")` |
| 68 | perfsprint | **FIX** | Use `strings.Builder` or `strings.Join` for the loop concatenation |

### `internal/soul/enforcer.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| various | revive | **FIX** | Add doc comments for exported `Enforcer`, `NewEnforcer`, etc. (9 instances across all files) |

### `internal/thought/cycle.go`

| Line | Linter | Verdict | Action |
|------|--------|---------|--------|
| 115 | errcheck | **nolint** | `//nolint:errcheck // stdout display: fire-and-forget` |
| 301 | staticcheck S1005 | **FIX** | `props := td.Parameters["properties"]` (drop unnecessary `_`) |
| 331 | errcheck | **nolint** | `//nolint:errcheck // stdout display: fire-and-forget` |
| 336 | errcheck | **nolint** | Same |
| 353 | exhaustive | **FIX** | Add `default:` case to the `memory.Kind` switch — config has `default-signifies-exhaustive: true`, so a bare `default:` suffices. The default behavior (keeping `KindObservation`) is correct, just needs to be explicit. |
| 361 | errcheck | **nolint** | `//nolint:errcheck // stdout display: fire-and-forget` |
| 371 | revive | **nolint** | `//nolint:revive // unhandled-error: strings.Builder.WriteString cannot fail` (multiple instances in `search_memory` handler) |
| 384 | wrapcheck | **FIX** | `return "", costs.Perceive, fmt.Errorf("executing %s: %w", block.Name, err)` |

---

## Part 4: Input Validation Deep Dive

### persona/loader.go — YAML Parsing ⚠️

| Check | Status | Notes |
|-------|--------|-------|
| Safe YAML lib | ✅ | `gopkg.in/yaml.v3` — no arbitrary code execution |
| Required field validation | ✅ | `Name`, `Identity` checked in `Validate()` |
| Numeric range checks | ✅ | `TickInterval`, `BudgetPerCycle` validated |
| String length limits | ❌ | A 10MB `Identity` field would be accepted |
| Soul rule validation at load | ❌ | Invalid rules pass `Validate()`, fail at runtime |
| Costs validation | ❌ | Negative cost values accepted |

**Recommendations**:
1. Add `validateRules()` call inside `Validate()` — parse all soul rules eagerly
2. Cap `Identity` at 10K chars, `Name` at 100 chars
3. Validate `Costs` values are non-negative

### soul/rules.go — String Parsing ✅ (mostly)

| Check | Status | Notes |
|-------|--------|-------|
| Format validation | ✅ | `SplitN` + length check |
| Range validation | ✅ | Hours 0-23, minutes 0-59 |
| Midnight crossing | ✅ | `crossesMidnight()` logic correct |
| Unknown type handling | ❌ | Returns `(nil, nil)` — ambiguous |

### memory/vault.go — File Operations ⚠️

| Check | Status | Notes |
|-------|--------|-------|
| Path sanitization | ⚠️ | Handles `/` and `..` but not null bytes or containment check |
| Atomic writes | ❌ | Uses `os.WriteFile` directly — no temp+rename |
| File permissions | ❌ | Too open (0644 → should be 0600) |
| Size limits | ❌ | No cap on write content — could fill disk |

### auth/pi.go — Credentials ✅

| Check | Status | Notes |
|-------|--------|-------|
| Atomic writes | ✅ | temp file → chmod → rename pattern |
| File permissions | ✅ | Temp file created with `0600` |
| Token expiry handling | ✅ | Checks `ExpiresAt` before use, refreshes if stale |
| Credential storage | ✅ | Reads from pi's auth file, doesn't duplicate credentials |

---

## Summary: Priority Actions

### Must-fix before beta (security + correctness)
1. **File permissions** — 4 fixes, all trivial `0755→0750` / `0644→0600`
2. **Path traversal guard** in `vault.go` — add containment check
3. **`ParseGate` nil-nil** — add `ErrNotAGate` sentinel
4. **9 wrapcheck violations** — wrap all cross-package errors
5. **`defer f.Close()` on write path** in `hoard.go:232` — capture close error

### Should-fix (code quality)
6. **11 `errors.New` replacements** — static error strings don't need `fmt.Errorf`
7. **`PersonaConfig` → `Config`** rename — eliminates stutter
8. **`min` variable shadow** — rename to avoid builtin conflict
9. **Missing doc comments** — 9 exported symbols
10. **gofumpt formatting** — 2 files

### Nolint annotations needed (15 total)
- 4× `errcheck` on `fmt.Fprintf(os.Stdout)` — stdout display
- 4× `errcheck` on error-path cleanup — best-effort
- 2× `gosec G204` on `exec.CommandContext` — validated config path
- 1× `gosec G101` on `tokenURL` — URL constant
- 1× `gosec G404` on `math/rand` — timing jitter
- ~7× `revive` on `strings.Builder` writes — cannot fail
- 1× `gocritic` if paramTypeCombine is false positive

All nolint directives must use the format: `//nolint:linter // REASON: explanation` per AGENTS.md.
