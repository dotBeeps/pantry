---
phase: 01-amputation-cleanup-tsc-green
plan: "02"
subsystem: infra
tags: [cleanup, filesystem, amputation]

# Dependency graph
requires:
  - phase: 01-amputation-cleanup-tsc-green/01-01
    provides: tsc gate green (dragon-breath import fix)
provides:
  - Five amputation-husk directories removed from working tree (storybook-daemon, psi, allies-parity, dragon-cubed, berrygems/extensions/hoard-allies)
affects:
  [
    all phases — working tree now reflects post-amputation scope with no residual husk dirs,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Directories were already untracked in git (removed by amputation commit b9c5050); deletion required no git staging"

patterns-established: []

requirements-completed: [AMP-01]

# Metrics
duration: 2min
completed: 2026-04-23
---

# Phase 01 Plan 02: Amputation-Husk Deletion Summary

**Five untracked husk directories (storybook-daemon, psi, allies-parity, dragon-cubed, berrygems/extensions/hoard-allies) deleted from disk — ~71 MB freed, tsc still exits 0**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-23T03:37:40Z
- **Completed:** 2026-04-23T03:37:48Z
- **Tasks:** 1
- **Files modified:** 0 (directories were untracked; no git-tracked files changed)

## Accomplishments

- Removed all five amputation-husk directories from the working tree
- Verified `ls storybook-daemon psi allies-parity dragon-cubed berrygems/extensions/hoard-allies 2>&1 | grep -c 'No such file'` returns 5
- Confirmed `tsc --project berrygems/tsconfig.json` exits 0 with no regression

## Task Commits

No per-task commit was required: all five directories were already removed from git tracking by the 2026-04-22 amputation commit (`b9c5050`). Their disk-resident contents (build artifacts, node_modules, stray config files) were untracked files — `git status` showed a clean working tree after deletion.

**Plan metadata commit:** see final commit below.

## Files Created/Modified

None — pure filesystem deletion of untracked directories.

## Decisions Made

- No staging required: git already doesn't track any file under these paths. The amputation commit is the authoritative git tombstone; this plan cleans up the on-disk residue.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- AMP-01 (Remove all amputation husks) is satisfied.
- Working tree is now clean: only `berrygems/` and `morsels/` content, plus planning docs and repo config.
- Ready for 01-03 (test framework wiring) and 01-04 (tsc-clean passes) which operate on tracked berrygems files.

---

_Phase: 01-amputation-cleanup-tsc-green_
_Completed: 2026-04-23_
