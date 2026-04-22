# pantry

## What This Is

pantry is a pi-package: a repository of authored content — 17 TypeScript extensions under `berrygems/` and 56 Markdown skills under `morsels/` — that the [pi](https://github.com/badlogic/pi-mono) coding-agent harness loads at session start. pantry itself is not an application: it has no runtime, no daemon, and no executable entry point. It is discovered through `pi.extensions` and `pi.skills` in the root `package.json` after `pi install`.

Post the 2026-04-22 "hoard scope amputation", the repo is scoped to dot's personal pi environment — installable from GitHub, not published anywhere else.

## Core Value

`pi install github:dotbeeps/pantry` on a fresh Linux box produces a working, type-clean, tested, documented pi environment — with zero manual intervention — and stays that way under CI.

## Requirements

### Validated

<!-- Inferred from .planning/codebase/ (ARCHITECTURE.md, STACK.md, STRUCTURE.md, TESTING.md) — confirmed working today. -->

- ✓ Pi-package manifest: `pi.extensions` + `pi.skills` in root `package.json`, discovered by pi at install — existing
- ✓ 17 berrygem extensions (14 single-file + 3 multi-file directory extensions under `berrygems/extensions/`) — existing
- ✓ 56 morsel skills under `morsels/skills/*/SKILL.md` (YAML frontmatter + Markdown body) — existing
- ✓ Shared library layer at `berrygems/lib/` (11 modules: settings, id, cooldown, pi-spawn, sse-client, panel-chrome, compaction-templates, animated-image, animated-image-player, giphy-source, lsp-client) — existing
- ✓ Cross-extension API publication via `globalThis[Symbol.for("pantry.<name>")]` (required because pi loads each extension in its own jiti module context) — existing
- ✓ Tone/style presets at `berrygems/styles/` (formal, friendly, minimal, narrative, personality) — existing
- ✓ `tsc --project berrygems/tsconfig.json` as the one automated gate (strict, noUnusedLocals, noUnusedParameters, noEmit) — existing

### Active

<!-- v1.0 milestone scope — stabilize + publish post-amputation pantry. -->

- [ ] **AMP-01**: Remove all amputation husks from the working tree (`storybook-daemon/`, `psi/`, `dragon-cubed/`, `allies-parity/`, the now-empty `berrygems/extensions/hoard-allies/`)
- [ ] **TEST-01**: Wire up a test framework for `berrygems/` (runner + config + `pnpm test` script)
- [ ] **TEST-02**: Unit-test every helper in `berrygems/lib/`
- [ ] **TEST-03**: Integration-test every berrygem extension against a mocked or harnessed `ExtensionAPI`
- [ ] **TEST-04**: Lint morsel frontmatter — schema-validate every `morsels/skills/*/SKILL.md` YAML block
- [ ] **CI-01**: GitHub Actions workflow on `ubuntu-latest` — runs tsc + all tests + install smoke on every PR and on main
- [ ] **CI-02**: Install smoke test — spin up a clean environment, run `pi install` against this repo, assert extensions load and at least one tool call + one skill load succeed end-to-end
- [ ] **DOCS-01**: Rewrite top-level `README.md` to describe post-amputation pantry (what it is, how to install, what it provides)
- [ ] **DOCS-02**: Berrygem inventory — one-line-per-extension description (hand-written or generated) surfaced from README
- [ ] **DOCS-03**: Morsel inventory — one-line-per-skill listing grouped by category, surfaced from README
- [ ] **DOCS-04**: Per-berrygem `README.md` for each multi-file directory extension (minimum: `dragon-breath/`, `dragon-guard/`, `dragon-websearch/`)
- [ ] **REL-01**: Tag `v1.0.0` once every Active requirement above is green

### Out of Scope

<!-- Explicit boundaries from questioning. Do not silently re-add. -->

- **Daemon, persona runtime, Ember fine-tune, cc-plugin** — amputated on 2026-04-22; those concerns move to separate harness-specific repos. Pantry is content-only.
- **npm publish** — pi's install contract is `pi install <git-url>`; an npm package adds friction without a user.
- **agentskills.io publication for morsels** — possible future move; not a goal this milestone.
- **Net-new berrygems or morsels** — v1.0 is a cleanup cut, not a feature milestone. New content ships post-1.0.
- **macOS / Windows CI** — Linux-only matches dot's dev environment; cross-OS support is deferred until there is a concrete consumer on another OS.
- **dragon-forge / Ember voice fine-tuning** — left the repo in the 2026-04-22 amputation.

## Context

- **Post-amputation repo.** As of commits `b9c5050` (`chore!: amputate daemon scope, rename hoard → pantry`) and `c33c545` (`docs(planning): regenerate codebase map post-amputation`), the repo was renamed from `hoard` to `pantry` and scoped down from "dragon-persona infrastructure" to "pi-package content only". Four directories (`storybook-daemon/`, `psi/`, `dragon-cubed/`, `allies-parity/`) and an empty `berrygems/extensions/hoard-allies/` directory are the residue of that cut and need to go.
- **No existing test or CI infrastructure.** `.planning/codebase/TESTING.md` confirms: no test runner, no `.test.ts` files, no `.github/workflows/`. Today the only automated gate is `tsc`. "Tests + CI" is a real build, not a tune-up.
- **Module isolation constraint.** Pi loads each extension in its own jiti module context — extensions cannot `import` each other. Integration tests have to either mock the `ExtensionAPI` or exercise the `globalThis` symbol channel used by cross-extension APIs.
- **Manifest-driven discovery.** Pi reads `pi.extensions: ["berrygems/extensions"]` and `pi.skills: ["morsels/skills"]` from the root `package.json`. Install smoke test must verify this discovery path still works end-to-end after the milestone's cleanup.

## Constraints

- **Tech stack:** TypeScript (ESNext, strict mode, `noEmit`) + Markdown. Loaded at runtime by pi via `jiti` — no compilation step. Node version pinned by the host `pi` install; no `.nvmrc` in-tree.
- **Package manager:** `pnpm` inside `berrygems/` (`pnpm-lock.yaml`, `lockfileVersion: 9.0`). Root `package.json` is a pi-package manifest, not an npm workspace root.
- **Module boundaries:** Extensions cannot import each other. Cross-extension APIs publish exclusively via `globalThis[Symbol.for("pantry.<name>")]`.
- **Scripting idiom:** Fish, not bash, for all repo-local scripts (see `AGENTS.md` code style rule).
- **CI platform:** GitHub Actions on `ubuntu-latest`. No matrix across OSes this milestone.
- **Distribution:** GitHub install only (`pi install github:dotbeeps/pantry`). No npm, no agentskills.io publish.
- **Audience:** dot's machines. Public installability is a byproduct, not a requirement.

## Key Decisions

| Decision                                                 | Rationale                                                                                                                                                      | Outcome   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| GitHub install only (no npm, no agentskills.io)          | Pi's install model is `pi install <git-url>`; adding a registry is friction with no consumer asking for it                                                     | — Pending |
| Cleanup-only v1.0 cut (no new content)                   | Post-amputation freeze — prove the reduced shape holds in CI before building on it                                                                             | — Pending |
| Tests + CI from zero                                     | No framework exists today; "stabilized" requires a real quality bar, not aspiration                                                                            | — Pending |
| Per-berrygem README for directory extensions only        | Multi-file extensions (dragon-breath, dragon-guard, dragon-websearch) carry real surface area; single-file extensions document via JSDoc + top-level inventory | — Pending |
| Delete all amputation husks outright (no archive branch) | The amputation commit is the tombstone; git history preserves prior state if ever needed                                                                       | — Pending |
| Linux-only CI                                            | Matches dot's dev environment; cross-OS deferred until a concrete need                                                                                         | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-22 after initialization_
