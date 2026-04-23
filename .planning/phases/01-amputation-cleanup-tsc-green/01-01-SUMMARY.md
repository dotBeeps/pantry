---
phase: 01-amputation-cleanup-tsc-green
plan: "01"
subsystem: infra
tags: [typescript, tsc, import-paths, dragon-breath]

requires: []
provides:
  - "tsc --project berrygems/tsconfig.json exits 0 — the phase-wide verification gate is green"
  - "dragon-breath/index.ts uses correct ../../lib/settings.ts import path"
affects:
  - 01-amputation-cleanup-tsc-green
  - 02-tests-quality-infrastructure

tech-stack:
  added: []
  patterns:
    - "Directory extension import depth rule: extensions/<dir-ext>/index.ts reaches berrygems/lib/ via ../../lib/ (two dots), not ../lib/ (one dot)"

key-files:
  created: []
  modified:
    - berrygems/extensions/dragon-breath/index.ts

key-decisions:
  - "One-line import path correction only — no other changes; plan scope was intentionally minimal to isolate tsc unblock"

patterns-established:
  - "Import depth rule: single-file extensions in berrygems/extensions/*.ts use ../lib/; directory extensions with index.ts use ../../lib/"

requirements-completed: [AMP-04]

duration: 5min
completed: 2026-04-22
---

# Phase 01 Plan 01: Dragon-Breath Import Path Fix Summary

**One-line correction to `../../lib/settings.ts` in dragon-breath/index.ts unblocks tsc for all downstream phase-1 plans**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-22T03:10:00Z
- **Completed:** 2026-04-22T03:15:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Fixed single-character path depth error (line 20 of dragon-breath/index.ts): `../lib/settings.ts` -> `../../lib/settings.ts`
- `pnpm --dir berrygems exec tsc --project tsconfig.json` now exits 0 with no output
- Phase 1 tsc verification gate is green — all downstream plans (01-02 through 01-05) can rely on tsc as their exit-criteria check

## Task Commits

1. **Task 1: Fix dragon-breath import path from ../lib/ to ../../lib/** - `07de203` (amp)

## Files Created/Modified

- `berrygems/extensions/dragon-breath/index.ts` — corrected import depth from one-dot to two-dot for directory extension path to berrygems/lib/settings.ts

## Decisions Made

None — followed plan as specified. The fix was precisely described in AMP-04 research and the plan action.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Threat Surface

No new attack surface. Internal import-path correction only — no new network endpoints, auth paths, file access patterns, or schema changes.

## Next Phase Readiness

- tsc gate is green — plans 01-02 through 01-05 can proceed in parallel (wave 2)
- No blockers introduced

---

_Phase: 01-amputation-cleanup-tsc-green_
_Completed: 2026-04-22_

## Self-Check: PASSED

- FOUND: berrygems/extensions/dragon-breath/index.ts
- FOUND: .planning/phases/01-amputation-cleanup-tsc-green/01-01-SUMMARY.md
- FOUND: commit 07de203
