# Requirements: pantry

**Defined:** 2026-04-22
**Core Value:** `pi install github:dotbeeps/pantry` on a fresh Linux box produces a working, type-clean, tested, documented pi environment — with zero manual intervention — and stays that way under CI.

## v1 Requirements

Requirements for the post-amputation stabilization milestone (v1.0). Each maps to exactly one roadmap phase.

### Amputation Cleanup

- [ ] **AMP-01**: All amputation-husk directories are removed from the working tree (`storybook-daemon/`, `psi/`, `dragon-cubed/`, `allies-parity/`, and the empty `berrygems/extensions/hoard-allies/`)
- [ ] **AMP-02**: All stale `/home/dot/Development/hoard/` path references are removed from `.claude/` hooks, `AGENTS.override.md`, and any other in-tree config
- [ ] **AMP-03**: All stale `Symbol.for("hoard.*")` API references are removed from morsels and berrygems (intentional "hoard" flavor prose inside persona-styled berrygems like `dragon-curfew` and `dragon-musings` may remain; only API-string residue is in scope)
- [ ] **AMP-04**: `tsc --project berrygems/tsconfig.json` returns zero errors (fixes the currently-RED `dragon-breath/index.ts` import-path bug documented in `.planning/codebase/CONCERNS.md`)
- [ ] **AMP-05**: Cross-extension symbol keys are centralized in `berrygems/lib/globals.ts` (exports a `PANTRY_KEYS` const used by the frontmatter linter in TEST-04)

### Testing

- [ ] **TEST-01**: A test runner is wired into `berrygems/` (Vitest 4.1.5 with `viteModuleRunner: false`); `pnpm --dir berrygems test` invokes it and exits zero with no tests collected
- [ ] **TEST-02**: Every module in `berrygems/lib/` has a unit-test file at `berrygems/tests/lib/<name>.test.ts`; tests use real filesystem via `os.tmpdir()` (no DB/FS mocks)
- [ ] **TEST-03**: Every extension under `berrygems/extensions/` has an integration-test file at `berrygems/tests/extensions/<name>.test.ts` that uses `@marcfargas/pi-test-harness` `createTestSession` and asserts tool registration + any `Symbol.for("pantry.<name>")` publication the extension claims
- [ ] **TEST-04**: A standalone `scripts/lint-skills.ts` script validates every `morsels/skills/*/SKILL.md` frontmatter against a Zod schema (required fields: `name`, `description ≤1024`, `license: "MIT"`, typed `compatibility`) and rejects stale `Symbol.for("hoard.*")` + unregistered `pantry.*` key references in skill bodies

### Continuous Integration

- [ ] **CI-01**: A GitHub Actions workflow at `.github/workflows/ci.yml` runs on every PR and push to `main`, executes on `ubuntu-latest` with Node 22 LTS + pnpm 10.x, and runs (in order): checkout → pnpm install → tsc (shipped) → tsc (tests) → vitest (lib+extensions) → lint-skills → gen-docs --check → vitest (smoke)
- [ ] **CI-02**: The CI install-smoke gate runs **both** verification paths — (a) `verifySandboxInstall` via pi-test-harness (fast, npm-pack based), and (b) a real-install shell step doing `HOME=$(mktemp -d) pi install $GITHUB_WORKSPACE && pi list` asserting named extensions and named skills load

### Documentation

- [ ] **DOCS-01**: The root `README.md` is rewritten to describe post-amputation pantry — what it is, what installing it provides, how to install (`pi install github:dotbeeps/pantry#v1.0.0` primary + `pi install github:dotbeeps/pantry` tracking-main secondary), and a CI status badge
- [ ] **DOCS-02**: The README contains a berrygem inventory — one-line-per-extension description, regenerable from JSDoc via `scripts/gen-docs.ts` and guarded by a `gen-docs.ts --check` CI step
- [ ] **DOCS-03**: The README contains a morsel inventory — one-line-per-skill description grouped by category, regenerable from frontmatter via `scripts/gen-docs.ts` and guarded by the same `--check` CI step
- [ ] **DOCS-04**: Each multi-file directory extension (`dragon-breath/`, `dragon-guard/`, `dragon-websearch/`) has a `README.md` describing its settings, published cross-extension APIs, and tools registered (`dragon-guard/` may already be covered by its existing `AGENTS.md` — if so, DOCS-04 confirms parity for the other two)

### Licensing

- [ ] **LIC-01**: A `LICENSE` file exists at repo root containing the MIT license text, matching the `license: MIT` declaration present in every morsel's frontmatter and the root `package.json`

### Release

- [ ] **REL-01**: An annotated `v1.0.0` git tag is cut after every above requirement is green, pointing at a commit where CI is passing; a corresponding GitHub Release references the tag; main-branch protection is configured (tsc + vitest + lint-skills + gen-docs --check + smoke all required status checks)

## v2 Requirements

Deferred to post-1.0 but acknowledged. Tracked but not in v1 roadmap.

### Differentiators (research P2)

- **CHG-01**: `CHANGELOG.md` at repo root with a `v1.0.0` entry documenting the amputation + stabilization
- **META-01**: Root `package.json` gets `keywords: ["pi-package", ...]` and a `repository` field
- **DEP-01**: `.github/dependabot.yml` for GHA action version bumps
- **AGEN-01**: `berrygems/extensions/dragon-breath/AGENTS.md` and `dragon-websearch/AGENTS.md` for parity with existing `dragon-guard/AGENTS.md`
- **DEMO-01**: One demo GIF of `dragon-parchment` (or another visually-interesting berrygem) embedded in README
- **REL-02**: Optional `release` branch tracking the last tagged cut (policy layer against "every main push is a breaking change")

### Expansion (post-stabilization)

- **FEAT-01**: Net-new berrygem extensions (no specific candidates this milestone)
- **FEAT-02**: Net-new morsel skills (no specific candidates this milestone)
- **DIST-01**: Evaluate agentskills.io publication for morsels as a distribution channel
- **DIST-02**: Evaluate npm publish for `berrygems/lib/` helpers if they grow a reuse audience outside pantry
- **CI-03**: macOS CI matrix if a consumer surfaces on darwin
- **CI-04**: Test coverage reporting (Vitest `--coverage` + a badge)

## Out of Scope

Explicitly excluded. Anti-features from PROJECT.md and research FEATURES.md.

| Feature                                                               | Reason                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Daemon / persona runtime / Ember fine-tune / cc-plugin                | Amputated 2026-04-22; those concerns move to harness-specific external repos (see `project_scope_amputation_2026_04` memory)                                       |
| npm publish                                                           | Pi's install contract is `pi install <git-url>`; npm adds friction with no requesting consumer                                                                     |
| agentskills.io publication (this milestone)                           | Possible future move; not a goal this milestone (see v2 `DIST-01`)                                                                                                 |
| Net-new berrygems or morsels                                          | v1.0 is a cleanup cut, not a feature milestone — prove the shape holds before building on it                                                                       |
| macOS / Windows CI                                                    | Linux-only matches dot's dev environment; cross-OS deferred (see v2 `CI-03`)                                                                                       |
| Inventory auto-generation from scratch (beyond `gen-docs.ts --check`) | Hand-written inventories plus a drift-check are sufficient for 17+56 items; full generation is premature                                                           |
| Coverage reporting in v1 CI                                           | Adds noise and a second reason to fail; wait for tests to land and settle (see v2 `CI-04`)                                                                         |
| Semantic-release / conventional-commits automation                    | Manual `v1.0.0` tag is the smallest working unit; automation is speculative at 1-tag scale                                                                         |
| Cross-harness adapters (Claude Code, Cursor, etc.)                    | Pantry targets pi; adapters for other harnesses are separate repos/projects                                                                                        |
| Docker-based smoke-test runner                                        | `ubuntu-latest` is already ephemeral; docker is over-engineered for this distribution model                                                                        |
| Hand-rolled `ExtensionAPI` fakes in tests                             | Re-implementing pi — use `@marcfargas/pi-test-harness` as the only integration boundary (see PITFALLS.md #2)                                                       |
| Repo-root npm workspace conversion                                    | Root `package.json` is a pi-package manifest; workspace conversion adds surface area with no requesting consumer (see ARCHITECTURE.md workspace-boundary decision) |

## Traceability

Phases populated during roadmap creation.

| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| AMP-01      | TBD   | Pending |
| AMP-02      | TBD   | Pending |
| AMP-03      | TBD   | Pending |
| AMP-04      | TBD   | Pending |
| AMP-05      | TBD   | Pending |
| TEST-01     | TBD   | Pending |
| TEST-02     | TBD   | Pending |
| TEST-03     | TBD   | Pending |
| TEST-04     | TBD   | Pending |
| CI-01       | TBD   | Pending |
| CI-02       | TBD   | Pending |
| DOCS-01     | TBD   | Pending |
| DOCS-02     | TBD   | Pending |
| DOCS-03     | TBD   | Pending |
| DOCS-04     | TBD   | Pending |
| LIC-01      | TBD   | Pending |
| REL-01      | TBD   | Pending |

**Coverage:**

- v1 requirements: 17 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 17 ⚠️

---

_Requirements defined: 2026-04-22_
_Last updated: 2026-04-22 after initial definition_
