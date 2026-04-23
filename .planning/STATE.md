---
gsd_state_version: 1.0
milestone: v1.0.0
milestone_name: "**Goal:** An annotated `v1.0.0` tag exists on GitHub at a commit where CI is green; `pi install github:dotbeeps/pantry#v1.0.0` resolves and produces a working install; `main` is protected so future pushes can't silently break the tracks-main install."
status: executing
last_updated: "2026-04-23T03:32:26.754Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 0
  percent: 0
---

# STATE: pantry v1.0 stabilization

**Last updated:** 2026-04-22

## Project Reference

- **Core value:** `pi install github:dotbeeps/pantry` on a fresh Linux box produces a working, type-clean, tested, documented pi environment — with zero manual intervention — and stays that way under CI.
- **Milestone:** v1.0 (post-amputation stabilization; cleanup cut, not feature milestone)
- **Audience:** dot's personal pi environment. GitHub install only.
- **Granularity:** coarse (5 phases)

## Current Position

Phase: 1 (Amputation Cleanup & tsc-Green) — EXECUTING
Plan: 1 of 5

- **Phase:** 1 — Amputation Cleanup & tsc-Green
- **Plan:** None (plans TBD; run `/gsd-plan-phase 1` to decompose)
- **Status:** Executing Phase 1
- **Progress:** 0/5 phases complete

### Phase Progress

- [ ] Phase 1: Amputation Cleanup & tsc-Green
- [ ] Phase 2: Tests & Quality Infrastructure
- [ ] Phase 3: Documentation & License
- [ ] Phase 4: CI Pipeline
- [ ] Phase 5: Release v1.0.0

## Performance Metrics

- Requirements mapped: 17/17 (100%)
- Orphaned requirements: 0
- Active blockers: 1 — `tsc --project berrygems/tsconfig.json` is RED (dragon-breath import path bug); Phase 1 fixes this as its top-priority deliverable

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

- **Phase 1 must land first.** `tsc` RED blocks every downstream verification. Amputation residue in morsels + `.claude/` hooks would be tested/documented into permanence if not swept before Phases 2/3.

### Anti-Features (guard against scope creep per PITFALLS §10)

- NOT in scope this milestone (enumerated so agents don't silently re-add):
  - Splitting `dragon-digestion.ts` or any other oversized extension (queue for v1.1).
  - Removing the `dotsPiEnhancements.*` legacy settings namespace.
  - Typed `getGlobal<T>(key: symbol)` helper replacing the `(globalThis as any)[Symbol.for(...)]` pattern.
  - Dragon-guard settings schema fine-tuning.
  - Net-new berrygems or morsels.
  - npm publish, agentskills.io publication, cross-OS CI, cross-harness adapters.
  - Resurrecting amputated scope (daemon, persona, Ember, cc-plugin).
- Commit scopes in this milestone should be: `amp`, `test`, `ci`, `docs`, `rel`, `chore`. A `refactor(…)` or `feat(…)` scope is a scope-creep signal.

## Session Continuity

- **Next action:** `/gsd-plan-phase 1` — decompose Phase 1 (Amputation Cleanup & tsc-Green) into executable plans.
- **On return:** read this file + `.planning/ROADMAP.md` + `.planning/REQUIREMENTS.md`. Start with Phase 1's first plan.

---

_State initialized: 2026-04-22 after roadmap creation_

**Planned Phase:** 1 (Amputation Cleanup & tsc-Green) — 5 plans — 2026-04-23T03:03:18.926Z
