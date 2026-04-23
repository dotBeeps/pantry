---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: "**Goal:** An annotated `v1.0.0` tag exists on GitHub at a commit where CI is green; `pi install github:dotbeeps/pantry#v1.0.0` resolves and produces a working install; `main` is protected so future pushes can't silently break the tracks-main install."
status: completed
last_updated: "2026-04-23T04:24:54.384Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# STATE: pantry v1.0 stabilization

**Last updated:** 2026-04-23

## Project Reference

- **Core value:** `pi install github:dotbeeps/pantry` on a fresh Linux box produces a working, type-clean, tested, documented pi environment — with zero manual intervention — and stays that way under CI.
- **Milestone:** v1.0 (post-amputation stabilization; cleanup cut, not feature milestone)
- **Audience:** dot's personal pi environment. GitHub install only.
- **Granularity:** coarse (5 phases)

## Current Position

Phase 1 COMPLETE (2026-04-23). Ready for Phase 2.

- **Phase:** 2 — Tests & Quality Infrastructure (next)
- **Plan:** None (plans TBD; run `/gsd-discuss-phase 2` to capture context, then `/gsd-plan-phase 2`)
- **Status:** Phase 1 complete; Phase 2 not started
- **Progress:** 1/5 phases complete (20%)

### Phase Progress

- [x] Phase 1: Amputation Cleanup & tsc-Green (completed 2026-04-23; 5 plans, 5/5 success criteria green, verifier PASSED)
- [ ] Phase 2: Tests & Quality Infrastructure
- [ ] Phase 3: Documentation & License
- [ ] Phase 4: CI Pipeline
- [ ] Phase 5: Release v1.0.0

## Performance Metrics

- Requirements mapped: 17/17 (100%)
- Orphaned requirements: 0
- Active blockers: 0 (tsc is GREEN; AMP-04 dragon-breath import fix landed in Phase 1)
- Phase 1 deliverables: AMP-01..05 all closed; 5 husk dirs removed; 22 `(globalThis as any)` call sites migrated to typed `PANTRY_KEYS` + `registerGlobal<T>`/`getGlobal<T>`; `.claude/` and `AGENTS.override.md` swept

## Accumulated Context

### Key Decisions (carried from research)

- **Stack:** Vitest 4.1.5 + `@marcfargas/pi-test-harness@0.5.0` + `yaml@2.8.3` + `zod@4.3.6`; Node 22 LTS + pnpm 10.x on GHA v4 actions (`pnpm/action-setup@v4` BEFORE `setup-node@v4` — order matters for cache detection).
- **Test layout:** sibling `berrygems/tests/` tree mirroring `berrygems/{lib,extensions}` 1:1. NOT co-located. Preserves `tsc`-scope purity.
- **Harness boundary:** every integration test routes through `createTestSession`; no hand-rolled `ExtensionAPI` fakes; no direct `../extensions/` imports in `*.test.ts`.
- **Workspace boundary:** berrygems-only pnpm package. Root stays a pi-package manifest with a small devDependency addition for the lint + docs-gen scripts. NO root workspace conversion.
- **Docs approach:** hand-written narrative + sentinel-block regeneration for inventories; `gen-docs.ts --check` is the CI drift gate.
- **Install smoke:** two gates — `verifySandboxInstall` (fast, npm-pack) AND real `pi install $GITHUB_WORKSPACE` into fresh `HOME`. Both required.
- **Symbol-key centralization:** `berrygems/lib/globals.ts` exports `PANTRY_KEYS`; TEST-04 lint uses this as the allow-list for morsel-body key references.

### Open Todos

- Resolve Phase 2 research flag: pi-test-harness coverage for `resources_discover` / `session_before_compact` events (spike on `dragon-guard` before fanning out).
- Resolve Phase 4 research flag: `pi install github:` git-clone codepath specifics (symlink repair timing).
- Confirm persona "hoard" flavor-prose policy (kept in `dragon-curfew`, `dragon-musings`) — write into PROJECT.md or AGENTS.md during Phase 1 so future sweeps don't re-litigate.

### Blockers

- None. Phase 1 landed. `tsc` is green. Downstream phases (Tests, Docs, CI, Release) are unblocked.

### Anti-Features (guard against scope creep per PITFALLS §10)

- NOT in scope this milestone (enumerated so agents don't silently re-add):
  - Splitting `dragon-digestion.ts` or any other oversized extension (queue for v1.1).
  - Removing the `dotsPiEnhancements.*` legacy settings namespace.
  - Dragon-guard settings schema fine-tuning.
  - Net-new berrygems or morsels.
  - npm publish, agentskills.io publication, cross-OS CI, cross-harness adapters.
  - Resurrecting amputated scope (daemon, persona, Ember, cc-plugin).
- Commit scopes in this milestone should be: `amp`, `test`, `ci`, `docs`, `rel`, `chore`. A `refactor(…)` or `feat(…)` scope is a scope-creep signal.

## Session Continuity

- **Next action:** `/gsd-discuss-phase 2 --chain` — capture context, plan, and execute Phase 2 (Tests & Quality Infrastructure).
- **On return:** read this file + `.planning/ROADMAP.md` + `.planning/REQUIREMENTS.md` + `.planning/phases/01-amputation-cleanup-tsc-green/01-VERIFICATION.md` (Phase 1 sign-off).
- **Known Phase 2 spike required (research flag):** `@marcfargas/pi-test-harness@0.5.0` coverage for `resources_discover` / `session_before_compact` / context-event mutation is unconfirmed — budget a spike on `dragon-guard` (richest directory extension) before fanning out across 17 extensions.

---

_State initialized: 2026-04-22 after roadmap creation_
_Phase 1 completed: 2026-04-23 — all 5 success criteria green, verifier PASSED_

**Planned Phase:** 1 (Amputation Cleanup & tsc-Green) — 5 plans — 2026-04-23T03:03:18.926Z
**Completed Phase:** 1 (Amputation Cleanup & tsc-Green) — 5/5 plans, 5/5 SC — 2026-04-23T04:00:00.000Z
