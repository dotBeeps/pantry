---
phase: 02-tests-quality-infrastructure
plan: 01
subsystem: testing
tags: [vitest, pi-test-harness, typescript, pnpm, yaml, zod]

requires:
  - phase: 01-foundation
    provides: berrygems tsconfig.json and workspace layout to extend from
provides:
  - Vitest 4.1 runner wired to berrygems workspace
  - tsconfig.tests.json extending shipped tsconfig for test-only typechecking
  - berrygems/tests/ sibling tree (helpers/ fixtures/ lib/ extensions/ smoke/) with .gitkeep placeholders
  - devDeps installed (vitest, @marcfargas/pi-test-harness, pi peer deps at berrygems; yaml + zod at root)
  - test/test:watch/test:smoke scripts in berrygems; lint:skills script at root
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

tech-stack:
  added:
    [
      vitest@4.1.5,
      "@marcfargas/pi-test-harness@0.5.0",
      "@earendil-works/pi-agent-core@0.69.0",
      "@earendil-works/pi-ai@0.69.0",
      "@earendil-works/pi-coding-agent@0.69.0",
      yaml@2.8.3,
      zod@4.3.6,
    ]
  patterns:
    [
      sibling tests/ tree separate from src,
      test-only tsconfig extension,
      passWithNoTests gate for empty-tree exit-0,
    ]

key-files:
  created:
    - berrygems/vitest.config.ts
    - berrygems/tsconfig.tests.json
    - berrygems/tests/helpers/.gitkeep
    - berrygems/tests/fixtures/.gitkeep
    - berrygems/tests/lib/.gitkeep
    - berrygems/tests/extensions/.gitkeep
    - berrygems/tests/smoke/.gitkeep
    - pnpm-lock.yaml
  modified:
    - berrygems/package.json
    - berrygems/pnpm-lock.yaml
    - package.json

key-decisions:
  - "Added passWithNoTests: true to vitest config so an empty test tree exits 0 (TEST-01 SC requires exit zero with no tests collected; Vitest 4.1 default behavior is to exit 1)"
  - "Kept shipped berrygems/tsconfig.json untouched — tests/** stays out of its include so tsc remains pure; tsconfig.tests.json is the separate project for test typechecking"
  - "Smoke tests excluded from default vitest include per D-17 — only tests/lib/** and tests/extensions/** are collected by `pnpm test`; `pnpm test:smoke` runs the single smoke file explicitly"

patterns-established:
  - "Sibling tests/ tree: berrygems/tests/{helpers,fixtures,lib,extensions,smoke}/ — test code lives alongside src/extensions rather than colocated"
  - "Workspace-boundary devDeps: yaml/zod at root (for scripts/lint-skills.ts), vitest/harness at berrygems (for runner)"
  - "passWithNoTests as wave-1 gate — downstream plans can drop test files into tests/lib or tests/extensions and see them collected automatically without reconfiguring"

requirements-completed: [TEST-01]

duration: ~15min
completed: 2026-04-23
---

# Phase 2 Plan 01: Test Infrastructure Summary

**Vitest 4.1 runner wired to empty berrygems/tests sibling tree with passWithNoTests gate — TEST-01 green, downstream plans unblocked**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-23
- **Tasks:** 5 (all complete)
- **Commits:** 5 atomic

## Accomplishments

- Vitest 4.1.5 + pi-test-harness 0.5.0 + pi peer deps installed at berrygems workspace
- yaml@2.8 + zod@4.3 installed at root for forthcoming `scripts/lint-skills.ts` (lands in 02-05)
- `berrygems/vitest.config.ts` with canonical body (viteModuleRunner: false, globals: false, include globs for lib/ + extensions/, smoke excluded per D-17)
- `berrygems/tsconfig.tests.json` extending shipped tsconfig with tests/\*\* + vitest types; shipped tsconfig untouched
- `berrygems/tests/` tree scaffolded with helpers/ fixtures/ lib/ extensions/ smoke/ + .gitkeep placeholders
- `pnpm --dir berrygems test` exits 0 with "No test files found"

## Task Commits

1. **Task 1: Install devDependencies** — `a66a433` (chore)
2. **Task 2: Add vitest.config.ts + tsconfig.tests.json** — `81bd566` (chore)
3. **Task 3: Scaffold berrygems/tests tree** — `48910b3` (chore)
4. **Task 4: Add test and lint:skills scripts** — `86d9011` (chore)
5. **Task 5: passWithNoTests config fix for TEST-01 green** — `11a7eec` (chore)

## Files Created/Modified

- `berrygems/vitest.config.ts` — Vitest 4.1 runner config
- `berrygems/tsconfig.tests.json` — test-only tsc project extending shipped tsconfig
- `berrygems/tests/{helpers,fixtures,lib,extensions,smoke}/.gitkeep` — sibling tree placeholders
- `berrygems/package.json` — +5 devDeps, +3 scripts (test, test:watch, test:smoke)
- `package.json` — +2 devDeps (yaml, zod), +1 script (lint:skills)
- `pnpm-lock.yaml` (root, new) + `berrygems/pnpm-lock.yaml` (updated)

## Decisions Made

- **passWithNoTests: true** — not in the canonical config body from RESEARCH §2, but required to satisfy TEST-01 SC ("exits zero with no tests collected"). Vitest 4.1 defaults to exit 1 when no tests match include globs. Added as a minimal, targeted addition with its own commit so downstream plans can revert if they prefer strict-on-empty behavior.

## Deviations from Plan

**1. [Rule — Missing Critical] Added `passWithNoTests: true` to vitest.config.ts**

- **Found during:** Task 5 (TEST-01 green verification)
- **Issue:** Plan's canonical config body from RESEARCH §2 omitted `passWithNoTests`, but `vitest run` with empty tree exits 1 in Vitest 4.1.5 — TEST-01 SC requires exit 0.
- **Fix:** Added `passWithNoTests: true` to `test` block; verified `pnpm --dir berrygems test` now exits 0 with "No test files found, exiting with code 0".
- **Files modified:** berrygems/vitest.config.ts
- **Verification:** `pnpm --dir berrygems test; echo exit=$?` prints `exit=0`.
- **Committed in:** `11a7eec` (separate commit so it's reviewable and revertable).

**Total deviations:** 1 auto-fixed (missing critical)
**Impact on plan:** Essential for TEST-01 SC gate. No scope creep — single-line config addition only.

## Issues Encountered

None beyond the passWithNoTests gap captured above.

## Acceptance Criteria Status

- [x] `pnpm --dir berrygems test` exits 0 with "No test files found" (TEST-01 green)
- [x] `berrygems/vitest.config.ts` exists with `experimental.viteModuleRunner: false`, `globals: false`, includes tests/lib/** + tests/extensions/**, excludes smoke
- [x] `berrygems/tsconfig.tests.json` exists with `"extends": "./tsconfig.json"` and 3-entry include array (tests, lib, extensions)
- [x] Shipped `berrygems/tsconfig.json` unchanged — tests/\*\* not in its include
- [x] All 5 test subdirs exist with .gitkeep placeholders
- [x] berrygems/package.json has vitest, @marcfargas/pi-test-harness, @earendil-works/pi-agent-core, @earendil-works/pi-ai, @earendil-works/pi-coding-agent in devDependencies
- [x] Root package.json has yaml + zod in devDependencies
- [x] berrygems/package.json scripts.test = "vitest run"
- [x] berrygems/package.json scripts["test:watch"] = "vitest"
- [x] berrygems/package.json scripts["test:smoke"] = "vitest run tests/smoke/install.test.ts"
- [x] Root package.json scripts["lint:skills"] = "node --experimental-strip-types scripts/lint-skills.ts"

## Next Phase Readiness

- TEST-01 SC closed standalone; plans 02-02..02-06 can now author test files into `tests/lib/` and `tests/extensions/` and see them collected by `pnpm --dir berrygems test`.
- `scripts/lint-skills.ts` does not exist yet — running `pnpm lint:skills` now would fail with "file not found". Expected; lands in 02-05.

## Self-Check: PASSED

---

_Phase: 02-tests-quality-infrastructure_
_Completed: 2026-04-23_
