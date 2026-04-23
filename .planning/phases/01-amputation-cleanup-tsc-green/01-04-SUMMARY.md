---
phase: 01-amputation-cleanup-tsc-green
plan: "04"
subsystem: berrygems, morsels
tags: [amputation, cleanup, dead-code, documentation]
dependency_graph:
  requires: [01-01]
  provides: [AMP-03]
  affects: [berrygems/extensions/dragon-guard, berrygems/lib, morsels/skills]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - berrygems/extensions/dragon-guard/index.ts
    - berrygems/extensions/dragon-guard/state.ts
    - berrygems/extensions/dragon-guard/AGENTS.md
    - berrygems/lib/panel-chrome.ts
    - berrygems/lib/pi-spawn.ts
    - berrygems/extensions/dragon-digestion.ts
    - berrygems/AGENTS.md
    - morsels/AGENTS.md
  deleted:
    - morsels/skills/hoard-allies/SKILL.md
    - morsels/skills/hoard-sending-stone/SKILL.md
decisions:
  - Deleted setMode ally-mode guards from state.ts along with ally functions — no caller sets mode to "ally" after the block removal, so guards are dead code
  - Updated file-level JSDoc in index.ts from "Four-tier" to "Three-tier" to match the reduced mode count
  - Updated dragon-guard/AGENTS.md "four-tier"/"Four modes" framing to "three-tier"/"Three modes" for consistency
metrics:
  duration_seconds: 292
  completed: "2026-04-22"
  tasks_completed: 4
  files_changed: 10
---

# Phase 01 Plan 04: hoard API Residue Sweep Summary

Deleted two dead morsel skill directories, removed the dragon-guard ally-mode code path and its state.ts helpers, scrubbed hoard-flavor JSDoc from berrygems lib files, and rewrote daemon-present-tense prose in both AGENTS.md files. AMP-03 grep gate is green; tsc exits 0.

## Tasks Completed

| Task | Name                                                                              | Commit  | Files                                                                                       |
| ---- | --------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 1    | Delete hoard-\* morsel skills (D-05)                                              | e651c30 | morsels/skills/hoard-allies/SKILL.md, morsels/skills/hoard-sending-stone/SKILL.md (deleted) |
| 2    | Delete dragon-guard ally-mode block and state.ts helpers (D-04)                   | 8f6d2a2 | dragon-guard/index.ts, dragon-guard/state.ts, dragon-guard/AGENTS.md                        |
| 3    | Scrub hoard-flavor comments and factual errors in lib + AGENTS (D-10, D-11, D-12) | 468335e | panel-chrome.ts, pi-spawn.ts, dragon-digestion.ts, berrygems/AGENTS.md, morsels/AGENTS.md   |
| 4    | Final AMP-03 grep-gate verification                                               | —       | (verification only, no file changes)                                                        |

## Verification Results

- `rg 'Symbol\.for\("hoard\.' morsels berrygems` — exit 1 (zero matches)
- `rg 'initAllyMode|getAllyModeToolPolicy|isAllyMode|_allyToolWhitelist|PANTRY_GUARD_MODE|PANTRY_ALLY_TOOLS' berrygems/extensions/dragon-guard/` — 0 matches
- `rg 'storybook-daemon is the persistent core' berrygems/AGENTS.md morsels/AGENTS.md` — 0 matches
- `rg 'cd /home/dot/Development/hoard' berrygems/AGENTS.md` — 0 matches
- `rg 'Whimsical hoard vibes|Frozen hoard aesthetic|hoard-lab extension can detect auth type|Extracted from berrygems/extensions/hoard-allies' berrygems/` — 0 matches
- `pnpm --dir berrygems exec tsc --project tsconfig.json` — exit 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed stale setMode ally-mode guards**

- **Found during:** Task 2
- **Issue:** `setMode` had two guard clauses (`if (_mode === "ally") return` and `if (m === "ally") return`) that referenced the now-deleted GuardMode "ally" arm. After removing the ally arm from the type, these guards referenced a value that could never appear, making them unreachable dead code.
- **Fix:** Simplified `setMode` to `_mode = m` with the guards removed.
- **Files modified:** berrygems/extensions/dragon-guard/state.ts
- **Commit:** 8f6d2a2

**2. [Rule 2 - Consistency] Updated "Four-tier"/"Four modes" framing in AGENTS.md and index.ts JSDoc**

- **Found during:** Task 2
- **Issue:** The file-level JSDoc in index.ts still described "Four-tier" and listed "Ally Mode" as a mode after the block deletion. AGENTS.md similarly said "four-tier permission system" and "Four modes".
- **Fix:** Updated both to "Three-tier"/"Three modes" with the Ally Mode bullet removed.
- **Files modified:** berrygems/extensions/dragon-guard/index.ts, berrygems/extensions/dragon-guard/AGENTS.md
- **Commit:** 8f6d2a2

## Preserved (Per AMP-03 Carve-Out)

- `dragon-curfew.ts` — untouched (persona "hoard" flavor prose exempted)
- `dragon-musings.ts` — untouched (persona "hoard" flavor prose exempted)
- `ETHICS.md` — untouched (deferred to Phase 3 DOCS-01)
- `den/features/` — untouched (D-13 internal archive, out of scope)

## Known Stubs

None. All deleted content was dead code or stale documentation. No placeholder text was introduced.

## Threat Flags

None. All changes reduce or eliminate surface (dead code path removal, documentation correction). No new trust boundaries introduced. T-01-06 disposition (ally-mode removal reduces privilege surface) confirmed satisfied.

## Self-Check: PASSED

- morsels/skills/hoard-allies/ deleted: confirmed (`test ! -e` passes)
- morsels/skills/hoard-sending-stone/ deleted: confirmed (`test ! -e` passes)
- Commits exist: e651c30, 8f6d2a2, 468335e — all present in `git log --oneline`
- tsc exits 0: confirmed
- AMP-03 grep gate: confirmed (rg exits 1)
