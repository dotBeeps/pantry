---
name: hoard-verify
description: Run full verification suite across hoard sub-packages. Covers golangci-lint, go test, and qmllint for psi. Use before finishing a branch or after significant changes.
---

# Hoard Verify

Run the full verification pass across sub-packages. Stop on first critical failure and report clearly.

## Sub-packages and their checks

### storybook-daemon (Go)

```bash
cd /home/dot/Development/hoard/storybook-daemon
golangci-lint run ./...
go test ./...
```

Run lint first — don't bother with tests if lint fails on anything beyond a warning.

### psi (Qt/QML)

Only check if QML files were modified this session:

```bash
qmllint /home/dot/Development/hoard/psi/qml/**/*.qml
```

If CMake/C++ files changed, note that a build verification would require `cmake --build build/` but don't run it unless dot asks — it's slow.

### berrygems (TypeScript Pi extensions)

If any `.ts` files in `berrygems/` changed:

```bash
cd /home/dot/Development/hoard/berrygems
npx tsc --noEmit 2>&1 | head -40
```

## Output format

Report by sub-package:

```
storybook-daemon:
  lint: PASS / FAIL (n issues)
  tests: PASS / FAIL (n failed, show first failure)

psi:
  qmllint: PASS / FAIL / SKIPPED (no QML changes)

berrygems:
  tsc: PASS / FAIL / SKIPPED (no TS changes)
```

If anything fails, show the first error with file:line. Don't dump all output — surface what's actionable.
