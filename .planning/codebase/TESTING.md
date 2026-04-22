# Testing Patterns

**Analysis Date:** 2026-04-22

## Honest Summary

**There is no test framework wired up in this repo.** No `vitest.config.*`, no `jest.config.*`, no `.test.ts`/`.spec.ts` files under `berrygems/` or `morsels/`. This is stated outright in `AGENTS.md:82-83`:

> There is one automated gate: `tsc` over the berrygems source. Everything else is manual review and `/reload` testing. Be honest about this — no Vitest, no eslint, no skill linter is wired up yet.

And again in `berrygems/AGENTS.md:77-78`:

> - No eslint — type checking is the primary gate
> - No test framework — manual testing via `/reload`

Any testing-related guidance below is either (a) the closest automated gate that exists (`tsc`), (b) the aspirational rules inherited from global Claude conventions, or (c) documentation-level skills (`js-testing`, `python-testing`, `go-testing`) that describe how to test code in **other** projects — not pantry itself.

## Test Framework

**Runner:** None.

- No `vitest`, `jest`, `mocha`, or `node:test` configuration is present in `berrygems/` or repo root.
- `berrygems/package.json` has no `scripts` block, no `devDependencies`, no `test` entry.
- The only automated verification is TypeScript compilation.

**Assertion Library:** None.

**Run Commands (verification, not test):**

```fish
# Type check — the only automated gate
cd /home/dot/Development/pantry; and tsc --project berrygems/tsconfig.json

# Reload extensions in a running pi session
/reload   # typed inside pi
```

- `berrygems/tsconfig.json:4-11` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, `allowImportingTsExtensions`, `noEmit`. This is what "passing" means today.
- There is no coverage tool, no CI config (no `.github/workflows/`, no Gradle/`pyproject` test targets for these two packages).

## Verification Skills in morsels/

The prompt asks whether the old `hoard-verify` skill has been renamed. **It has not been renamed or replaced.** No `pantry-verify`, `hoard-verify`, or similar exists in `morsels/skills/`.

The closest analogues — generic verification helpers, not pantry-specific gates — are:

- `morsels/skills/typescript-check/SKILL.md` — how to run `tsc`, read errors, triage by code.
- `morsels/skills/go-check/SKILL.md` — the Go equivalent.

`morsels/skills/typescript-check/SKILL.md` already contains the pi-specific section ("Pi Extension Projects", lines 102-115) that documents pantry's `tsc` flow, so the project treats `typescript-check` as its de facto pre-commit verification skill.

If a pantry-specific verification skill is needed later, it should wrap step 1 from the pre-commit checklist in `AGENTS.md:114`:

```fish
cd /home/dot/Development/pantry; and tsc --project berrygems/tsconfig.json
```

…plus the skill frontmatter / `/reload` reminders from the same checklist.

## Test File Organization

**Location:** N/A — no test files exist.

**Naming:** If tests are ever introduced, follow the global TypeScript conventions (`.claude/rules/testing.md`):

- Co-located `*.test.ts` preferred (e.g. `berrygems/lib/cooldown.test.ts` next to `cooldown.ts`).
- Use the project's configured runner — but that runner must be chosen and wired up first.

**Structure:** N/A until a framework is added.

## Mocking

**Framework:** N/A.

**Project stance (explicit):** From `.claude/rules/testing.md`:

> **Never mock the database.** Use real DB via testcontainers or SQLite in-memory. Mock/prod divergence masks real failures.

Pantry has no database — it reads/writes JSON files under `~/.pi/agent/settings.json` and `.pi/settings.json` (`berrygems/lib/settings.ts`) — so the "never mock the DB" rule translates here to:

- **Never mock the pi session / sessionManager / settings filesystem.** Exercise real file I/O in a temp dir if future tests need to cover `readPantrySetting` / `writeProjectPantrySetting`.
- **Never mock pi's event bus.** If integration testing is added, run a real pi session via the harness and observe through `ctx.sessionManager.getBranch()`.
- **Pi APIs (`ExtensionAPI`, `ExtensionContext`, `TUI`) are the hard boundary** — in lieu of mocking, prefer extracting pure helpers into `berrygems/lib/` (like the time/date helpers in `berrygems/extensions/dragon-curfew.ts:62-91`) that can be exercised without the pi runtime.

## Fixtures and Factories

**Test Data:** N/A — no test tree.

**Location:** N/A. If added, reference data should live under a `fixtures/` directory next to the `.test.ts` files that use it, or under `berrygems/lib/__fixtures__/` for library-shared data. Never commit captured pi session JSONL containing secrets (API keys appear in provider request payloads).

## Coverage

**Requirements:** None enforced. No coverage tooling is configured.

**Global target (aspirational, not enforced here):** `.claude/rules/common/testing.md` sets an 80% minimum for projects that have tests. Pantry does not currently meet or measure against any target because no test suite exists.

**View Coverage:** N/A.

## Test Types

**Unit Tests:** None. Small pure helpers that would be trivially testable today:

- `isCurfewHour`, `getNightKey`, `isConfirmCommand` in `berrygems/extensions/dragon-curfew.ts:62-95`.
- `resolvePath`, `parseJsonFile` in `berrygems/lib/settings.ts:44-68`.
- `CooldownTracker` methods in `berrygems/lib/cooldown.ts`.
- `generateId`, `generateShortId`, `generatePrefixedId` in `berrygems/lib/id.ts`.

**Integration Tests:** None. Settings read/write (`berrygems/lib/settings.ts`) and extension loading through pi are covered manually via `/reload` in a live pi session.

**E2E Tests:** None. Global convention nominates Playwright (`.claude/rules/typescript/testing.md`), but that applies to browser/UI projects — pantry is a terminal extension package where "E2E" would mean spawning a real pi session, which the project intentionally keeps as a manual `/reload` loop.

## Common Patterns

**Manual verification loop** (the current substitute for a test suite):

1. Edit the extension or lib file.
2. Run `tsc --project berrygems/tsconfig.json` at the repo root — zero errors required.
3. In a running pi session, run `/reload` (`berrygems/AGENTS.md:72`).
4. Exercise the extension's triggers manually (invoke the tool, hit the keybind, let the timer fire, etc.).
5. Read `ctx.sessionManager.getBranch()` state via diagnostic tools (e.g. `dragon-musings`, `dragon-inquiry`) to confirm behavior.

**Async testing:** N/A — no runner. Extensions themselves frequently use async/await with `try/catch` returning a default on failure (see `berrygems/extensions/dragon-herald.ts:52-55, 145-155` and `berrygems/lib/settings.ts:44-54, 190-220`). Any future async tests should follow the same swallow-and-default pattern in fixtures.

**Error testing:** N/A. When tests arrive, follow the global "write a failing test reproducing the bug **before** touching code" rule from `.claude/rules/testing.md`.

## Pre-Commit Verification Checklist

From `AGENTS.md:113-117` — this is what passes for a "test pass" today:

1. `tsc --project berrygems/tsconfig.json` — zero errors.
2. Extension reloaded in a live pi session with `/reload` and manually exercised.
3. Skill frontmatter valid: `name` matches directory, `description` and `license: MIT` present; pi-specific skills have `compatibility: "Designed for Pi (pi-coding-agent)"`.

## Future Testing — Recommended Next Steps

If/when a test framework is introduced:

- **Runner:** Vitest is the natural fit — it handles TS + ESM + path aliases without a build step, matching pantry's `allowImportingTsExtensions` / jiti ethos.
- **First targets:** the pure helpers in `berrygems/lib/` (`settings.ts`, `cooldown.ts`, `id.ts`). These have no pi-runtime dependency and exercise the most settings-migration surface.
- **Never mock the filesystem for `settings.ts` tests** — use a `tmpdir()` and real file I/O, consistent with the project-wide "never mock the DB" stance adapted to this codebase's persistence layer.
- **Add a pantry-verify (or rename `typescript-check`) skill** bundling `tsc` + frontmatter validation + the `/reload` reminder into a single agent-invokable gate.

---

_Testing analysis: 2026-04-22_
