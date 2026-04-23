# Roadmap: pantry v1.0 stabilization

**Milestone:** v1.0 (post-amputation stabilization)
**Created:** 2026-04-22
**Granularity:** coarse (5 phases)
**Requirements mapped:** 17/17 (100%)

## Core Value

`pi install github:dotbeeps/pantry` on a fresh Linux box produces a working, type-clean, tested, documented pi environment — with zero manual intervention — and stays that way under CI.

## Critical Path

AMP (tsc-green + residue sweep) → Tests & Infrastructure → Docs & License (parallelizable with Tests) → CI Pipeline → Release

`tsc --project berrygems/tsconfig.json` is currently **RED** (dragon-breath import path bug per CONCERNS.md). AMP-04 is the hard prerequisite that unblocks every downstream verification.

## Phases

- [ ] **Phase 1: Amputation Cleanup & tsc-Green** — Remove husks, sweep stale `hoard.*`/path references, centralize `PANTRY_KEYS`, return `tsc` to zero errors
- [ ] **Phase 2: Tests & Quality Infrastructure** — Wire Vitest + pi-test-harness + Zod frontmatter schema; ship lib unit tests, extension integration tests, and morsel frontmatter lint
- [ ] **Phase 3: Documentation & License** — Rewrite README, generate berrygem + morsel inventories (with `--check` drift gate), per-directory-extension READMEs, MIT LICENSE at root
- [ ] **Phase 4: CI Pipeline** — GitHub Actions workflow on `ubuntu-latest` running tsc + tests + lint + docs-drift + both install-smoke gates
- [ ] **Phase 5: Release v1.0.0** — Cut annotated `v1.0.0` tag, GitHub Release, branch protection, verify `pi install github:dotbeeps/pantry#v1.0.0` resolves

## Phase Details

### Phase 1: Amputation Cleanup & tsc-Green

**Goal:** The working tree reflects the post-amputation scope, all stale `hoard.*` API references are swept, and `tsc --project berrygems/tsconfig.json` returns zero errors.

**Depends on:** Nothing (first phase; unblocks everything else).

**Requirements:** AMP-01, AMP-02, AMP-03, AMP-04, AMP-05

**Success Criteria** (what must be TRUE):

1. `ls storybook-daemon psi allies-parity dragon-cubed berrygems/extensions/hoard-allies` returns "No such file or directory" for all five paths.
2. `rg '/home/dot/Development/hoard/' .claude AGENTS.override.md` returns zero matches; `.claude/agents/soul-reviewer.md` and `.claude/skills/hoard-verify/` are deleted.
3. `rg 'Symbol\.for\("hoard\.' morsels berrygems` returns zero matches (persona "hoard" flavor prose inside `dragon-curfew` / `dragon-musings` may remain; only API-string residue is in scope).
4. `berrygems/lib/globals.ts` exists and exports a `PANTRY_KEYS` const covering every live cross-extension symbol; production extension code imports from this module instead of repeating `Symbol.for("pantry.*")` string literals.
5. `tsc --project berrygems/tsconfig.json` returns zero errors (dragon-breath import-path bug per CONCERNS.md is fixed).

**Plans:** TBD

---

### Phase 2: Tests & Quality Infrastructure

**Goal:** Every berrygems/lib module has unit-test coverage, every extension has integration-test coverage via pi-test-harness, and every morsel's frontmatter is validated by a standalone Zod-backed linter.

**Depends on:** Phase 1 (tsc must be green; residue must be swept so tests and lint don't assert against dead surface; `PANTRY_KEYS` must exist so the morsel-body lint has a key list to check against).

**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04

**Success Criteria** (what must be TRUE):

1. `pnpm --dir berrygems test` invokes Vitest 4.1.5 (with `experimental.viteModuleRunner: false`) and exits zero; `berrygems/vitest.config.ts` and `berrygems/tsconfig.tests.json` both exist; `berrygems/tests/` is a sibling tree (NOT co-located) with `helpers/`, `fixtures/`, `lib/`, `extensions/`, `smoke/` subdirs.
2. Every module in `berrygems/lib/` has a matching `berrygems/tests/lib/<name>.test.ts` that exercises real filesystem via `os.tmpdir()` (no fs mocks, per `.claude/rules/testing.md`).
3. Every extension under `berrygems/extensions/` has a matching `berrygems/tests/extensions/<name>.test.ts` that uses `@marcfargas/pi-test-harness` `createTestSession` (NOT direct `../extensions/` imports) and asserts tool registration plus any `Symbol.for("pantry.<name>")` publication the extension claims; a canary "two extensions, one session" test exercises cross-extension `globalThis` round-trip.
4. `node --experimental-strip-types scripts/lint-skills.ts` walks every `morsels/skills/*/SKILL.md`, validates frontmatter against the shared Zod schema at `scripts/lib/frontmatter.ts` (required `name`, `description ≤ 1024`, `license: "MIT"`, typed `compatibility`), and rejects stale `Symbol.for("hoard.*")` + unregistered `pantry.*` key references in skill bodies; exits non-zero on any violation with per-file diagnostics.
5. Grep-gate: `rg 'from "\.\./\.\./?extensions/' berrygems/tests/**/*.test.ts` returns zero (prevents module-cache false-greens per PITFALLS §2).

**Plans:** TBD

---

### Phase 3: Documentation & License

**Goal:** A first-time reader of the repo gets an accurate post-amputation mental model, can install via a pinned ref, finds every berrygem and morsel inventoried, and sees a proper MIT LICENSE backing the morsel frontmatter claims.

**Depends on:** Phase 1 (README must describe the post-amputation shape, not the pre-amputation one). Can execute in parallel with Phase 2 because `scripts/lib/frontmatter.ts` is shared infrastructure landing in Phase 2; if Phase 3 starts before Phase 2's schema lands, the inventory generator can stub it and re-wire. Config sets `parallelization: true`.

**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, LIC-01

**Success Criteria** (what must be TRUE):

1. Root `README.md` describes post-amputation pantry (what it is, what installing it provides, how to install with `pi install github:dotbeeps/pantry#v1.0.0` primary + tracks-main secondary); a CI status badge appears below the title; no occurrences of `storybook-daemon`, `cc-plugin`, `dragon-forge`, or `daemon` outside explicit "amputated" context.
2. README contains a berrygem inventory (one-line-per-extension, covering all 17 extensions) and a morsel inventory (one-line-per-skill grouped by category, covering all 56 skills), both delimited by `<!-- inventory:berrygems:start -->` / `<!-- inventory:morsels:start -->` sentinel blocks regenerable by `scripts/gen-docs.ts`.
3. `node --experimental-strip-types scripts/gen-docs.ts --check` exits zero on a clean tree and exits non-zero when the README's sentinel-block content would differ from regenerated output (drift gate).
4. Each multi-file directory extension has a `README.md`: `berrygems/extensions/dragon-breath/README.md`, `berrygems/extensions/dragon-guard/README.md`, `berrygems/extensions/dragon-websearch/README.md` all exist and describe settings, published cross-extension APIs, and registered tools.
5. `LICENSE` file exists at repo root containing the MIT license text with a copyright line, matching the `license: MIT` declaration in every morsel's frontmatter and the root `package.json`.

**Plans:** TBD
**UI hint:** yes

---

### Phase 4: CI Pipeline

**Goal:** Every push to `main` and every PR runs the full quality gate on GitHub Actions — tsc, tests, frontmatter lint, docs-drift check, and both install-smoke paths (harness-fast + real `pi install`) — on Linux with Node 22 LTS.

**Depends on:** Phases 1, 2, 3. CI composes commands that must already work locally. Every step of the workflow mirrors a locally-runnable invocation from prior phases.

**Requirements:** CI-01, CI-02

**Success Criteria** (what must be TRUE):

1. `.github/workflows/ci.yml` exists, triggers on `push: [main]` and `pull_request`, runs on `ubuntu-latest`, and executes steps in order: `checkout@v4` → `pnpm/action-setup@v4` (before `setup-node`, per STACK.md version-compat table) → `setup-node@v4` (Node 22) → `pnpm install --frozen-lockfile` → `tsc` (shipped) → `tsc` (tests) → `vitest run` (lib+extensions) → `lint-skills` → `gen-docs --check` → `vitest run tests/smoke` (install smoke).
2. The install-smoke vitest test (`berrygems/tests/smoke/install.test.ts`) calls `verifySandboxInstall({ packageDir })` from pi-test-harness and asserts specific named extensions (e.g., `dragon-parchment`) and named skills (e.g., `git`) loaded — NOT just counts.
3. A second real-install shell step in the same workflow runs `HOME=$(mktemp -d) pi install $GITHUB_WORKSPACE && pi list` and asserts the same named extensions/skills are present (closes the `pi install github:` git-clone gap that `verifySandboxInstall`'s `npm pack` path misses, per PITFALLS §5).
4. A clean PR opened against `main` triggers the workflow automatically (not manual dispatch) and shows green checks for every step.

**Plans:** TBD

---

### Phase 5: Release v1.0.0

**Goal:** An annotated `v1.0.0` tag exists on GitHub at a commit where CI is green; `pi install github:dotbeeps/pantry#v1.0.0` resolves and produces a working install; `main` is protected so future pushes can't silently break the tracks-main install.

**Depends on:** Phases 1–4 all green (REL-01 gates on every Active requirement being validated).

**Requirements:** REL-01

**Success Criteria** (what must be TRUE):

1. `git tag --list | grep v1.0.0` returns an annotated tag (`git tag -a`, not lightweight) pointing at a commit where CI is passing; a corresponding GitHub Release references the tag.
2. `HOME=$(mktemp -d) pi install github:dotbeeps/pantry#v1.0.0 && pi list` from a fresh clean environment loads every expected extension and skill (verifies the pinned-install path claimed in README DOCS-01 actually resolves).
3. GitHub branch protection on `main` is configured with tsc + vitest (lib+extensions) + lint-skills + gen-docs --check + both smoke gates as required status checks; at least one approval required before merge (per PITFALLS §6 — every push to main is a release for every tracks-main consumer).

**Plans:** TBD

---

## Progress

| Phase                             | Plans Complete | Status      | Completed |
| --------------------------------- | -------------- | ----------- | --------- |
| 1. Amputation Cleanup & tsc-Green | 0/?            | Not started | -         |
| 2. Tests & Quality Infrastructure | 0/?            | Not started | -         |
| 3. Documentation & License        | 0/?            | Not started | -         |
| 4. CI Pipeline                    | 0/?            | Not started | -         |
| 5. Release v1.0.0                 | 0/?            | Not started | -         |

## Traceability

Every v1 requirement maps to exactly one phase. See `REQUIREMENTS.md` for the authoritative table.

| Phase | Requirements                               | Count  |
| ----- | ------------------------------------------ | ------ |
| 1     | AMP-01, AMP-02, AMP-03, AMP-04, AMP-05     | 5      |
| 2     | TEST-01, TEST-02, TEST-03, TEST-04         | 4      |
| 3     | DOCS-01, DOCS-02, DOCS-03, DOCS-04, LIC-01 | 5      |
| 4     | CI-01, CI-02                               | 2      |
| 5     | REL-01                                     | 1      |
| —     | **Total mapped**                           | **17** |

**Coverage:** 17/17 v1 requirements mapped. No orphans, no duplicates.

## Research Flags Carried Forward

From `.planning/research/SUMMARY.md` §Research Flags:

- **Phase 2 (TEST-03 extension integration):** `@marcfargas/pi-test-harness@0.5.0` coverage for `resources_discover` / `session_before_compact` / context-event mutation is unconfirmed. Budget a spike on `dragon-guard` (richest directory extension) before fanning out across 17 extensions. Do NOT hand-roll a second harness; wrap via `tests/helpers/`.
- **Phase 4 (CI-02 real install step):** Pi's git-install codepath specifics (symlink handling after clone, `HOME` layout, `berrygems/node_modules/` symlink repair timing) are under-documented. Budget a small spike; fallback is a shell step running the documented symlink-repair recipe before `pi list`.

## Constraints Carried Forward from PROJECT.md

These must not be lost as the roadmap decomposes into plans:

- **`tsc` is currently RED** — AMP-04 is the hardest prerequisite; fix it as the first commit in Phase 1.
- **Both install-smoke gates required in CI-02** — harness-fast AND real `pi install $GITHUB_WORKSPACE` with fresh `HOME`. One alone is insufficient.
- **Docs inventory generation must include `--check` mode** — drift gate in CI, not just a regenerator.
- **Workspace boundary: berrygems-only.** Do NOT propose root-level workspace conversion. Root `package.json` stays a pi-package manifest with a small `devDependencies` (`yaml`, `zod`) + `scripts` (`lint:skills`, `gen:docs`) addition only.
- **Test layout: sibling `berrygems/tests/`, NOT co-located.** Preserves `tsc`-scope purity and pi-mono parity.
- **Audience:** dot's personal pi environment. No public-facing marketing scope. No npm, no agentskills.io, no cross-OS CI, no net-new content during this milestone.

---

_Roadmap created: 2026-04-22_
