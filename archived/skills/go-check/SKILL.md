---
name: go-check
description: "Run Go verification tools: go vet, golangci-lint, go test. Interpret output and fix common issues. Use when checking Go code for errors, running linters, debugging test failures, or validating Go before committing."
license: MIT
---

# Go Verification

Run `go vet`, `golangci-lint`, and `go test` to catch errors. This skill covers **running the tools and interpreting output** — see the `go` skill for code conventions.

## Quick Reference

```bash
# Vet — catches suspicious constructs (always run)
go vet ./...

# Lint — comprehensive static analysis
golangci-lint run ./...

# Test — run all tests
go test ./...

# Test verbose with race detection
go test -v -race ./...

# Test a specific package
go test ./pkg/mypackage/...

# Build check — verify compilation without producing binary
go build ./...
```

## Reading go vet Output

Format: `file:line:col: message`

```
main.go:42:10: printf format %d has arg of wrong type string
```

Common vet findings:
- **Printf format mismatches** — `%d` with string, `%s` with int
- **Unreachable code** — code after return/panic
- **Copying locks** — passing `sync.Mutex` by value
- **Unused results** — ignoring error returns from functions

## Reading golangci-lint Output

Format: `file:line:col: message (linter-name)`

```
main.go:42:10: error strings should not be capitalized (ST1005) (stylecheck)
```

### Key Linters

| Linter | What It Catches |
|--------|----------------|
| **errcheck** | Unchecked error returns |
| **govet** | Suspicious constructs (superset of `go vet`) |
| **staticcheck** | Bugs, performance, simplification |
| **unused** | Unused code (vars, funcs, types) |
| **gosimple** | Code that can be simplified |
| **ineffassign** | Assignments to variables that are never used |
| **typecheck** | Type-checking errors |

### Triage Strategy

1. **Fix typecheck errors first** — if it won't compile, nothing else matters
2. **Fix errcheck next** — unchecked errors are real bugs
3. **Fix staticcheck** — often finds genuine logic issues
4. **Fix style linters last** — cosmetic, won't cause runtime bugs

## Reading go test Output

```
--- FAIL: TestFoo (0.01s)
    foo_test.go:42: expected 5, got 3
FAIL
exit status 1
FAIL    mymodule/pkg    0.015s
```

Key patterns:
- `--- FAIL:` — test name and duration
- `--- PASS:` — successful test
- `FAIL` at end — package failed
- `ok` at end — package passed
- `-count=1` flag disables test caching

```bash
# Run a specific test by name
go test -run TestFoo ./...

# Run tests matching a pattern
go test -run "TestFoo/subtest_name" ./...

# Show test coverage
go test -cover ./...

# Generate coverage profile
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Configuration

### golangci-lint

Configured via `.golangci.yml` at project root. If absent, uses defaults.

```yaml
# .golangci.yml — minimal config
linters:
  enable:
    - errcheck
    - govet
    - staticcheck
    - unused
    - gosimple
    - ineffassign

run:
  timeout: 5m
```

### Go Module Issues

```bash
# Update dependencies
go mod tidy

# Verify module integrity
go mod verify

# If "missing go.sum entry" — run tidy then retry
go mod tidy && go build ./...
```
