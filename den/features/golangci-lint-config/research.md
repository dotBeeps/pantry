# Research: golangci-lint Configuration Best Practices for Strict Go Projects

## Summary

golangci-lint v2 (current: v2.11.4) uses a `version: "2"` config format with restructured sections (`linters.settings`, `linters.exclusions`, separate `formatters`). A strict Go project should start from `default: standard`, explicitly enable 15–25 additional linters beyond defaults (revive, gocritic, gofumpt, exhaustive, nolintlint, wrapcheck, errname, nilnil, forbidigo, prealloc, errorlint, gosec, unconvert, nakedret, misspell), and configure per-linter settings rather than relying on defaults. The best real-world reference configs come from golangci-lint's own repo, Prometheus, Docker/Moby, and HashiCorp Consul — each balances strictness against false-positive suppression differently.

## Findings

### 1. v2 Config Format (Breaking Change)

**golangci-lint v2 restructured the YAML schema.** The `version: "2"` key is now required. Key structural changes:
- `linters-settings:` → `linters.settings:` (nested under `linters`)
- `issues.exclude-rules:` → `linters.exclusions.rules:`
- Formatters (gofumpt, goimports, gofmt) moved to a separate `formatters:` top-level section
- `linters.default:` replaces the old `enable-all: true` pattern — accepts `standard`, `all`, `none`, or `fast`
- `run.go:` replaces the old `go` directive for pinning Go version

[Source: golangci-lint reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

### 2. Default Linters Are Not Enough

The `standard` default set includes only: `errcheck`, `govet`, `ineffassign`, `staticcheck`, `unused`. These catch basic issues but miss entire categories: exhaustive switch coverage, error naming conventions, nil-returns, forbidden function calls, error wrapping discipline, and style enforcement. **Every serious Go project enables at least 15 additional linters.**

[Source: golangci-lint linters reference](https://golangci-lint.run/docs/linters/)

### 3. Linter-by-Linter Recommendations for the Requested Set

#### revive — Metalinter replacing golint
**What it does:** Drop-in replacement for the deprecated golint with 30+ configurable rules.
**Recommended rules for strict projects:**
- `exported` — enforce doc comments on exported symbols
- `var-naming` — enforce Go naming conventions (ID, URL, HTTP, etc.)
- `indent-error-flow` — enforce early returns
- `error-return` — error should be last return value
- `error-strings` — error strings should not be capitalized
- `unexported-return` — warn when exported func returns unexported type
- `superfluous-else` — eliminate unnecessary else blocks (with `preserve-scope` argument)
- `increment-decrement` — use `i++` not `i += 1`
- `redefines-builtin-id` — catch shadowing of builtins
- `use-any` — prefer `any` over `interface{}`
- `use-errors-new` — prefer `errors.New` over `fmt.Errorf` without `%w`

**Config pattern from golangci-lint's own repo:**
```yaml
revive:
  rules:
    - name: bare-return
    - name: bool-literal-in-expr
    - name: confusing-results
    - name: constant-logical-expr
    - name: context-as-argument
    - name: defer
    - name: duplicated-imports
    - name: early-return
      arguments: [preserve-scope]
    - name: empty-block
    - name: error-naming
    - name: error-return
    - name: error-strings
    - name: errorf
    - name: exported
      arguments: [checkPrivateReceivers, sayRepetitiveInsteadOfStutters]
    - name: indent-error-flow
      arguments: [preserve-scope]
    - name: range
    - name: receiver-naming
    - name: redefines-builtin-id
    - name: superfluous-else
      arguments: [preserve-scope]
    - name: time-equal
    - name: unconditional-recursion
    - name: unexported-naming
    - name: unexported-return
    - name: unhandled-error
      arguments: ["fmt\\.Fprint", "fmt\\.Fprintf", "fmt\\.Fprintln"]
    - name: unnecessary-stmt
    - name: use-any
    - name: useless-break
    - name: var-declaration
    - name: var-naming
```

[Source: golangci-lint .golangci.yml](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.yml)

#### gocritic — Bugs, performance, style
**What it does:** Highly configurable multi-checker with 100+ checks grouped into diagnostic, style, performance, and opinionated categories.
**Recommended approach:** Use `enable-all: true` with explicit `disabled-checks` rather than cherry-picking (catches new checks as gocritic updates).

**golangci-lint project disables only 4 checks:**
```yaml
gocritic:
  enable-all: true
  disabled-checks:
    - hugeParam           # too noisy for small structs
    - rangeValCopy        # already caught by govet
    - truncateCmpare      # rare
    - unnamedResult       # conflicts with named return style
```

**Moby/Docker disables ~30+ checks** — a more conservative approach for large codebases with legacy code.

**Prometheus uses a middle ground** — enables specific check groups:
```yaml
gocritic:
  enabled-checks:
    - argOrder
    - badCall
    - badCond
    - badLock
    - badRegexp
    - badSorting
    - builtinShadowDecl
    - commentedOutCode
    - deferInLoop
    - dupArg
    - dupBranchBody
    - dupCase
    - dupSubExpr
    - externalErrorReassign
    - flagDeref
    - flagName
    - mapKey
    - nilValReturn
    - offBy1
    - sloppyReassign
    - truncateCmp
    - unnecessaryDefer
    - weakCond
```

[Source: golangci-lint .golangci.yml, prometheus .golangci.yml](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.yml)

#### gofumpt — Stricter gofmt
**What it does:** Enforces a stricter superset of `gofmt` rules (e.g., no empty lines at start/end of blocks, grouped imports, consistent spacing).
**v2 change:** Now lives under `formatters:`, not `linters:`.
```yaml
formatters:
  enable:
    - gofumpt
  settings:
    gofumpt:
      extra-rules: true       # enable additional strictness
      module-path: github.com/your/module  # for import grouping
```

[Source: golangci-lint reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

#### exhaustive — Enum switch completeness
**What it does:** Ensures all enum values are handled in switch statements (and optionally map literals).
**Key settings:**
```yaml
exhaustive:
  check:
    - switch
    - map                     # also check map[EnumType]... literals
  default-signifies-exhaustive: true  # `default:` case satisfies check
  check-generated: false
```
**Prometheus and Moby both enable exhaustive** with `default-signifies-exhaustive: true` to avoid noise on switches with intentional default handling.

[Source: prometheus .golangci.yml, reference config](https://github.com/prometheus/prometheus/blob/main/.golangci.yml)

#### nolintlint — Enforce nolint discipline
**What it does:** Ensures `//nolint` directives specify which linter they suppress and optionally require a reason.
**Strict config:**
```yaml
nolintlint:
  require-explanation: true    # must explain why
  require-specific: true       # must name the linter: //nolint:errcheck // reason
  allow-unused: false          # flag stale nolint directives
```
**golangci-lint's own repo uses all three flags.** This is the single most impactful governance linter — without it, developers can silently suppress anything.

[Source: golangci-lint .golangci.yml](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.yml)

#### prealloc — Slice preallocation
**What it does:** Finds slice declarations that could use `make([]T, 0, n)` for known-size loops.
**Config:**
```yaml
prealloc:
  simple: true          # only flag simple loops (default)
  range-loops: true     # check range loops
  for-loops: false      # skip complex for loops (too many false positives)
```
**Trade-off:** Useful for performance-sensitive code but can be noisy. Prometheus enables it; Docker does not.

[Source: reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

#### errname — Error variable naming
**What it does:** Checks that sentinel error variables follow the `Err` prefix convention (`ErrNotFound`, not `NotFoundError`) and error types end in `Error`.
**Config:** No settings — enable/disable only. Low noise, high value for API consistency.

[Source: reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

#### wrapcheck — Error wrapping enforcement
**What it does:** Ensures errors from external packages are wrapped with `fmt.Errorf("...: %w", err)` to maintain stack context.
**Key settings:**
```yaml
wrapcheck:
  ignore-interfaces:
    - net.Error            # standard library interfaces
  ignore-sigs:
    - .Errorf(             # already wrapping
    - errors.New(          # creating new errors
    - errors.Unwrap(
    - errors.Join(
    - .Wrap(
    - .Wrapf(
    - .WithMessage(
    - .WithMessagef(
    - .WithStack(
  ignore-package-globs:
    - encoding/*
    - github.com/pkg/errors
```
**Trade-off:** Very strict — expect significant noise on first adoption. Enable only in new projects or after initial cleanup. Neither Prometheus nor Docker enable this one.

[Source: reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

#### nilnil — Catch (nil, nil) returns
**What it does:** Flags functions returning `(ptr, error)` pairs where both can be nil — an ambiguous API contract.
**Config:**
```yaml
nilnil:
  checked-types:
    - ptr
    - func
    - iface
    - map
    - chan
```
**Low noise, catches real API design bugs.** Not widely adopted yet but valuable for new codebases.

[Source: reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

#### forbidigo — Ban specific functions/packages
**What it does:** Regex-based function/package bans with custom messages. Extremely powerful for enforcing project conventions.
**Real-world patterns:**
```yaml
forbidigo:
  forbid:
    # Ban sync/atomic primitives in favor of Go 1.19+ atomic types
    - pkg: ^sync/atomic$
      pattern: ^atomic\.(Add|CompareAndSwap|Load|Store|Swap).
      msg: Use Go 1.19+ atomic types instead.
    # Ban fmt.Print in production code (use structured logging)
    - pkg: ^fmt$
      pattern: ^fmt\.Print
      msg: Use structured logging (slog/zerolog/zap) instead.
    # Ban os.Exit outside main
    - pkg: ^os$
      pattern: ^os\.Exit$
      msg: Use error returns instead of os.Exit.
    # Ban regexp.MustCompile at non-init scope
    - pkg: ^regexp$
      pattern: ^regexp\.MustCompile
      msg: Use lazy-compiled regexps or init-time compilation.
  analyze-types: true    # required for pkg-level matching
```
**Docker/Moby uses this extensively** to enforce internal wrapper usage over raw netlink/regexp calls.

[Source: moby .golangci.yml](https://github.com/moby/moby/blob/master/.golangci.yml)

### 4. Configs from Well-Known Go Projects

#### golangci-lint's own config (strictest reference)
- **264 lines**, v2 format
- Enables: revive (29 rules), gocritic (enable-all with 4 disabled), nolintlint (require-explanation + require-specific), gofumpt (formatter), exhaustive, errname, govet (enable-all), staticcheck (enable-all), nakedret (max-func-lines: 0), depguard, misspell, unconvert, thelper, wastedassign, prealloc, dupword
- Does NOT enable: wrapcheck, nilnil, forbidigo, exhaustruct, ireturn, varnamelen, funlen, gocognit
- Pattern: Aggressive rule-level configuration per linter rather than blanket enable

#### Prometheus config (244 lines)
- v2 format, very detailed
- Enables: gocritic (curated check list), revive, exhaustive, promlinter (Prometheus-specific), govet (enable-all), staticcheck (enable-all minus some style checks)
- Notable: Custom `depguard` rules banning internal packages across module boundaries
- Uses `exclusions.rules` extensively for test files and generated code
- Does NOT enable: wrapcheck, prealloc, nilnil, errname

#### Docker/Moby config (151 lines)
- v2 format
- Enables: 40+ linters including forbidigo (heavily customized), gocritic (enable-all, 30+ disabled), gosec (with explicit exclusion list), exhaustive, spancheck, importas
- Notable: The most sophisticated `forbidigo` configuration — bans raw netlink calls, regex compilation, sync/atomic primitives
- Uses `exclusions.rules` with source-level regex matching to suppress false positives in specific code paths

#### HashiCorp Consul config (117 lines)
- Moderate strictness
- Enables: govet, staticcheck, unconvert, unparam, ineffassign, gocritic, misspell, exhaustive, gosec, forbidigo
- Notable: `forbidigo` bans `fmt.Errorf` without `%w` verb, bans raw `os.Exit`
- Custom `gocritic` disabled-checks list targeting high-noise checks

### 5. Severity Levels Configuration

golangci-lint v2 supports per-linter severity overrides:
```yaml
severity:
  # Default severity for all linters
  default: error
  
  # Per-linter severity overrides
  rules:
    - linters:
        - revive
        - gocritic
      severity: warning
    - linters:
        - misspell
        - dupword
      severity: info
```

Valid severity values: `error`, `warning`, `info`. Severity affects output formatting and can be used by CI to distinguish blocking vs. advisory findings. **Most strict projects use `error` as default** (fail CI on any finding) and selectively downgrade style linters to `warning` during adoption.

[Source: golangci-lint reference config](https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml)

### 6. Custom Rules via revive

revive is the primary mechanism for custom linting rules:
```yaml
revive:
  rules:
    - name: exported
      arguments:
        - checkPrivateReceivers      # check unexported receiver methods
        - sayRepetitiveInsteadOfStutters  # custom message for stuttering names
    - name: unhandled-error
      arguments:
        - "fmt\\.Fprint"             # allowlist: these unhandled errors are OK
        - "fmt\\.Fprintf"
    - name: cognitive-complexity
      arguments: [15]                # max complexity score
    - name: function-length
      arguments: [50, 0]             # max statements, max lines (0 = disable)
    - name: line-length-limit
      arguments: [120]
    - name: max-public-structs
      arguments: [5]                 # per file
    - name: add-constant
      arguments:
        - maxLitCount: "3"           # max uses before extracting constant
          allowStrs: '""'
          allowInts: "0,1,2"
```

For truly custom rules beyond revive's built-in set, use `gocritic`'s `#check` pragma system or write a standalone analyzer following the `golang.org/x/tools/go/analysis` framework and load it as a plugin (requires building golangci-lint from source with plugin support).

[Source: revive rules reference](https://github.com/mgechev/revive/blob/HEAD/RULES_DESCRIPTIONS.md)

### 7. Exclusion Patterns Best Practice

**Explicit exclusions beat `exclude-use-default`.** Both golangci-lint's own config and Moby copy default exclusions explicitly into `linters.exclusions.rules` so that upgrading golangci-lint doesn't silently inherit new suppressions:

```yaml
linters:
  exclusions:
    # Don't inherit default exclusions — be explicit
    presets: []   # or omit entirely
    
    rules:
      # Relax errcheck in tests
      - path: _test\.go
        linters: [errcheck]
      
      # Ignore specific gosec rules in test code
      - text: "G101: Potential hardcoded credentials"
        path: _test\.go
        linters: [gosec]
      
      # Allow dot imports in tests (for testify, gomega, etc.)
      - path: _test\.go
        text: "dot-imports"
        linters: [revive]
    
    # Alert when an exclusion rule never matches
    warn-unused: true
```

[Source: moby .golangci.yml](https://github.com/moby/moby/blob/master/.golangci.yml)

### 8. Issues Configuration

```yaml
issues:
  max-issues-per-linter: 0    # no cap — show everything
  max-same-issues: 0          # no dedup — show every instance
```

**Every strict project sets both to 0.** The defaults (50 and 3 respectively) hide problems.

## Recommended Strict .golangci.yml Template

```yaml
# Strict golangci-lint configuration for Go projects
# golangci-lint v2 format
version: "2"

run:
  # Pin Go version to match go.mod
  go: "1.24"
  # Timeout for the entire run
  timeout: 5m

# ── Formatters ──────────────────────────────────────────────
formatters:
  enable:
    - gofumpt
    - goimports
  settings:
    gofumpt:
      extra-rules: true
      module-path: github.com/your/module  # CHANGEME

# ── Linters ─────────────────────────────────────────────────
linters:
  default: standard  # start from defaults: errcheck, govet, ineffassign, staticcheck, unused
  enable:
    # ── Error handling ──
    - errname           # ErrFoo / FooError naming convention
    - errorlint         # correct error wrapping and comparison
    - wrapcheck         # enforce wrapping of external errors
    - nilnil            # catch ambiguous (nil, nil) returns
    - nilerr            # returning nil when err is not nil

    # ── Correctness ──
    - exhaustive        # all enum values handled in switch/map
    - bodyclose         # HTTP response body must be closed
    - noctx             # HTTP requests should pass context
    - rowserrcheck      # sql.Rows.Err() must be checked
    - sqlclosecheck     # sql.Rows/Stmt must be closed
    - contextcheck      # check context.Context passing
    - fatcontext        # detect nested contexts in loops
    - reassign          # detect top-level variable reassignment

    # ── Style & consistency ──
    - revive            # metalinter with configurable rules
    - gocritic          # 100+ checks for bugs, perf, style
    - unconvert         # remove unnecessary type conversions
    - misspell          # catch English typos in comments
    - dupword           # catch duplicate words
    - nakedret          # no naked returns in long functions
    - nolintlint        # enforce nolint directive discipline
    - predeclared       # catch shadowing of predeclared identifiers
    - usestdlibvars     # use http.StatusOK, http.MethodGet, etc.
    - wastedassign      # detect assignments that are never read
    - prealloc          # suggest slice preallocation

    # ── Security ──
    - gosec             # security-oriented checks

    # ── Bans & guards ──
    - forbidigo         # ban specific functions/packages
    - depguard          # ban specific imports

    # ── Misc ──
    - godoclint         # validate godoc comments
    - gocheckcompilerdirectives  # validate //go: directives
    - perfsprint        # suggest faster string formatting
    - exptostd          # prefer stdlib over x/exp when possible
    - intrange          # use range-over-int (Go 1.22+)
    - copyloopvar       # detect loop variable copy issues

  # Linters to explicitly keep disabled
  disable:
    - exhaustruct       # too strict: requires all struct fields set
    - ireturn           # too strict: bans returning interfaces
    - varnamelen        # too style-opinionated
    - wsl               # too much whitespace enforcement
    - funlen            # prefer cognitive complexity over line count
    - gochecknoglobals  # impractical for most projects
    - gochecknoinits    # init() is sometimes appropriate

  # ── Per-linter settings ────────────────────────────────────
  settings:
    revive:
      rules:
        - name: bare-return
        - name: bool-literal-in-expr
        - name: confusing-results
        - name: constant-logical-expr
        - name: context-as-argument
        - name: defer
        - name: duplicated-imports
        - name: early-return
          arguments: [preserve-scope]
        - name: empty-block
        - name: error-naming
        - name: error-return
        - name: error-strings
        - name: errorf
        - name: exported
          arguments: [checkPrivateReceivers, sayRepetitiveInsteadOfStutters]
        - name: increment-decrement
        - name: indent-error-flow
          arguments: [preserve-scope]
        - name: range
        - name: receiver-naming
        - name: redefines-builtin-id
        - name: superfluous-else
          arguments: [preserve-scope]
        - name: time-equal
        - name: unconditional-recursion
        - name: unexported-naming
        - name: unexported-return
        - name: unhandled-error
          arguments:
            - "fmt\\.Fprint"
            - "fmt\\.Fprintf"
            - "fmt\\.Fprintln"
        - name: unnecessary-stmt
        - name: use-any
        - name: use-errors-new
        - name: useless-break
        - name: var-declaration
        - name: var-naming

    gocritic:
      enable-all: true
      disabled-checks:
        - hugeParam             # struct size threshold too aggressive by default
        - rangeValCopy          # overlaps with govet
        - unnamedResult         # conflicts with named-return style preference
        - whyNoLint             # overlaps with nolintlint (use nolintlint instead)

    exhaustive:
      check:
        - switch
        - map
      default-signifies-exhaustive: true

    nolintlint:
      require-explanation: true
      require-specific: true
      allow-unused: false

    nilnil:
      checked-types:
        - ptr
        - func
        - iface
        - map
        - chan

    prealloc:
      simple: true
      range-loops: true
      for-loops: false

    wrapcheck:
      ignore-sigs:
        - .Errorf(
        - errors.New(
        - errors.Unwrap(
        - errors.Join(
        - .Wrap(
        - .Wrapf(
        - .WithMessage(
        - .WithMessagef(
        - .WithStack(

    forbidigo:
      analyze-types: true
      forbid:
        # Ban old-style sync/atomic in favor of atomic types (Go 1.19+)
        - pkg: ^sync/atomic$
          pattern: ^atomic\.(Add|CompareAndSwap|Load|Store|Swap).
          msg: Use Go 1.19+ atomic types (atomic.Int64, etc.) instead.
        # Ban fmt.Print* in non-main packages (use structured logging)
        - pkg: ^fmt$
          pattern: ^fmt\.Print
          msg: Use structured logging (log/slog) instead of fmt.Print*.
        # CHANGEME: Add project-specific bans here

    nakedret:
      max-func-lines: 0        # disallow all naked returns

    govet:
      enable-all: true
      disable:
        - fieldalignment        # useful but noisy; enable per-project

    gosec:
      excludes:
        - G104                  # unhandled errors (errcheck handles this)
        - G304                  # file inclusion via variable (too many false positives)

    staticcheck:
      checks:
        - all

    errorlint:
      errorf: true              # check %w usage in fmt.Errorf
      asserts: true             # check errors.As over type assertion
      comparison: true          # check errors.Is over == comparison

    usestdlibvars:
      http-method: true
      http-status-code: true

  # ── Exclusion rules ────────────────────────────────────────
  exclusions:
    presets: []                 # don't inherit defaults — be explicit

    rules:
      # Relax errcheck in tests
      - path: _test\.go
        linters:
          - errcheck
          - wrapcheck

      # Allow hardcoded credentials in tests
      - text: "G101: Potential hardcoded credentials"
        path: _test\.go
        linters:
          - gosec

      # Allow weak random in tests
      - text: "G404: Use of weak random number generator"
        path: _test\.go
        linters:
          - gosec

      # Allow dot imports for test assertion libraries
      - path: _test\.go
        text: "dot-imports"
        linters:
          - revive

      # Allow fmt.Print in cmd/ and main packages
      - path: (^cmd/|main\.go)
        text: "fmt\\.Print"
        linters:
          - forbidigo

      # Shadow declarations of common variables are OK
      - text: '^shadow: declaration of "(ctx|err|ok)" shadows declaration'
        linters:
          - govet

    warn-unused: true           # flag stale exclusion rules

# ── Issues ──────────────────────────────────────────────────
issues:
  max-issues-per-linter: 0     # show all findings
  max-same-issues: 0           # show every instance

# ── Severity ────────────────────────────────────────────────
severity:
  default: error
  rules:
    - linters:
        - misspell
        - dupword
        - godoclint
      severity: warning
```

### 9. Adoption Strategy for Existing Projects

For existing codebases, adopt linters incrementally:

**Phase 1 — Foundation (week 1):**
Enable: `errcheck`, `govet`, `staticcheck`, `unused`, `ineffassign`, `revive` (basic rules), `nolintlint`, `misspell`, `unconvert`

**Phase 2 — Error discipline (week 2–3):**
Enable: `errorlint`, `errname`, `exhaustive`, `nilnil`, `nakedret`

**Phase 3 — Style consistency (week 3–4):**
Enable: `gocritic` (start with diagnostic only, then expand), `prealloc`, `dupword`, `usestdlibvars`

**Phase 4 — Strict mode (after cleanup):**
Enable: `wrapcheck`, `forbidigo`, `gosec`, `depguard`, `bodyclose`, `noctx`

Use `linters.exclusions.rules` with path patterns to exempt legacy code initially, then shrink exclusions over time.

## Sources

### Kept
- **golangci-lint .golangci.yml** (https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.yml) — The tool's own config; strictest mainstream reference with 264 lines of detailed per-linter tuning
- **golangci-lint .golangci.reference.yml** (https://github.com/golangci/golangci-lint/blob/HEAD/.golangci.reference.yml) — Exhaustive reference of every configuration option with defaults and documentation
- **Prometheus .golangci.yml** (https://github.com/prometheus/prometheus/blob/main/.golangci.yml) — 244-line config from a major CNCF project; excellent gocritic curation and depguard usage
- **Docker/Moby .golangci.yml** (https://github.com/moby/moby/blob/master/.golangci.yml) — The most sophisticated forbidigo configuration in the wild; extensive source-level exclusion rules
- **HashiCorp Consul .golangci.yml** (https://github.com/hashicorp/consul/blob/main/.golangci.yml) — Moderate-strictness reference from a major infrastructure project
- **revive RULES_DESCRIPTIONS.md** (https://github.com/mgechev/revive/blob/HEAD/RULES_DESCRIPTIONS.md) — Authoritative rule documentation for revive configuration

### Dropped
- **Kubernetes** — No single `.golangci.yaml` at repo root; uses per-package configs via hack/ scripts; not directly reusable as a template
- **CockroachDB** — No `.golangci.yml` found at expected locations; likely uses custom tooling

## Gaps

1. **Plugin-based custom linters** — golangci-lint supports loading custom analyzers as Go plugins, but this requires building golangci-lint from source. The documentation on this is sparse and the approach is fragile across versions. The practical alternative is writing a standalone `go/analysis` analyzer and running it separately.

2. **Performance impact measurement** — No benchmarks found comparing golangci-lint run times with different linter combinations. For CI optimization, `fast: true` linters run in ~2s; adding gocritic/revive/staticcheck typically adds 10–30s depending on codebase size.

3. **golangci-lint v2 migration guide** — The v1→v2 config migration details are not fully documented in a single place. The reference config is the authoritative source but doesn't call out what changed explicitly.

4. **errname configuration** — Despite being listed in the reference config, errname has no configurable settings as of v2.11.4 — it's purely enable/disable. Future versions may add customization for the naming pattern.
