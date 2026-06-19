# Stack Research

**Domain:** Quality layer for an existing pi-package monorepo (TypeScript extensions loaded by jiti + Markdown skills) — adding tests, CI, frontmatter linting, and an install smoke test for v1.0.
**Researched:** 2026-04-22
**Confidence:** HIGH for runner + frontmatter validator (canonical pi-ecosystem harness exists; versions verified against npm). MEDIUM for YAML parser choice (preference, not forced). HIGH for CI shape.

## Executive recommendation (one-liner per Active requirement)

| Requirement                      | Pick                                                                                                                                                                                                                   | Why in one line                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-01 runner                   | **Vitest 4.1.5** (with `experimental.viteModuleRunner: false` + native Node TypeScript stripping)                                                                                                                      | Test-runner-agnostic harness uses Vitest in its own examples; native Node TS keeps jiti/no-emit ethos intact.                                                                          |
| TEST-02 unit lib/                | Vitest + **real fs via `node:os.tmpdir()`** (no DB mocks per project rule)                                                                                                                                             | Matches pantry's "never mock persistence" stance; `lib/settings.ts` is the hot spot and it's file-backed.                                                                              |
| TEST-03 integration ExtensionAPI | **`@marcfargas/pi-test-harness` v0.5.0** (`createTestSession` + playbook DSL)                                                                                                                                          | Purpose-built for this exact problem. Runs real pi runtime with mocked model — the hand-rolled fake would be a worse reimplementation.                                                 |
| TEST-04 frontmatter linter       | **`yaml@2.8.3` → `zod@4.3.6`** schema validation over the parsed frontmatter block (cut `gray-matter`)                                                                                                                 | `gray-matter` last published 2023-07 and bundles a stale `js-yaml`; `eemeli/yaml` + Zod gives us one modern ESM dep, native TS types, and reuses the schema library we'll want anyway. |
| CI-01 workflow shape             | `actions/checkout@v4` + `pnpm/action-setup@v4` (`version: 10, cache: true`) + `actions/setup-node@v4` (node 22 LTS) → `pnpm install --frozen-lockfile` → `pnpm tsc --project berrygems/tsconfig.json` → `pnpm test`    | Canonical pnpm-on-GHA recipe; v4 actions are current; `cache: true` is the officially supported single-knob form.                                                                      |
| CI-02 install smoke              | **`pi-test-harness.verifySandboxInstall`** inside a tmp dir in the same workflow — OR a minimal shell step that does `pi install $GITHUB_WORKSPACE` into `HOME=$(mktemp -d)` and asserts extension count via `pi list` | Harness already implements npm-pack → install → load → assert. If pi's git-install codepath differs from npm-pack enough to matter, bolt a `pi install` fixture step on top.           |

## Recommended Stack

### Core Technologies

| Technology | Version                                                            | Purpose                             | Why Recommended                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest     | 4.1.5                                                              | Test runner for `berrygems/**`      | Zero-config TS + ESM (matches `"module": "ESNext"` + `allowImportingTsExtensions`), first-class pnpm support, and — critically — it's what `@marcfargas/pi-test-harness` uses in its own docs. With `experimental.viteModuleRunner: false` it drops Vite's transform pipeline and uses Node's native `--experimental-strip-types` / full native TS (Node 22.18+), which is the closest thing to pi's jiti-at-runtime model. Released 2026-03-12, latest patch 2026-04-11. |
| TypeScript | 5.x (whichever ships with the host pi install — already satisfied) | Type checking                       | Already wired; the `tsc --project berrygems/tsconfig.json` gate stays exactly as-is. No change.                                                                                                                                                                                                                                                                                                                                                                           |
| Node.js    | 22 LTS (`actions/setup-node@v4` with `node-version: 22`)           | CI runtime                          | Node 22.18+ strips TS natively, removing the need for a secondary loader in CI. Node 20 would force `tsx` in the loop; Node 22 keeps the stack to one tool.                                                                                                                                                                                                                                                                                                               |
| pnpm       | 10.x                                                               | Package manager inside `berrygems/` | Already the committed choice (`lockfileVersion: 9.0`); v10 is current.                                                                                                                                                                                                                                                                                                                                                                                                    |

### Supporting Libraries

| Library                       | Version | Purpose                                                   | When to Use                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | ------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@marcfargas/pi-test-harness` | 0.5.0   | Integration tests against `ExtensionAPI` + install smoke  | **Every berrygem integration test (TEST-03) and the CI-02 install smoke.** Exports `createTestSession`, `verifySandboxInstall`, `createMockPi`, and a playbook DSL (`when` / `calls` / `says`). Real pi runtime, real extension loader, only the LLM (and optionally named tools) are mocked. Last published 2026-02-21. |
| `yaml` (eemeli)               | 2.8.3   | Parse `SKILL.md` frontmatter block                        | **TEST-04 frontmatter linter, step 1.** Pure-JS parser, dual-build ESM+CJS, TS types bundled, actively maintained (last publish weeks ago). Faster and safer than the old `js-yaml` that `gray-matter` drags in.                                                                                                         |
| `zod`                         | 4.3.6   | Schema + type inference for the parsed frontmatter object | **TEST-04 frontmatter linter, step 2.** TypeScript-first, single `.parse()` call gives us both "is this valid?" and a typed `SkillFrontmatter` object reusable elsewhere. Zod 4 is the current stable, with per-field error messages good enough to surface directly to the PR comment surface.                          |
| `@actions/checkout`           | v4      | CI checkout                                               | Canonical.                                                                                                                                                                                                                                                                                                               |
| `pnpm/action-setup`           | v4      | CI pnpm install                                           | Current. Use `version: 10` + `cache: true`.                                                                                                                                                                                                                                                                              |
| `actions/setup-node`          | v4      | CI node install                                           | Current. Use `node-version: 22`.                                                                                                                                                                                                                                                                                         |

### Development Tools

| Tool                                                                | Purpose                    | Notes                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` script (added to `berrygems/package.json`)              | Unified runner entry point | Single script `"test": "vitest run"`. A separate `"test:watch": "vitest"` is optional.                                                                    |
| `pnpm lint:skills` script (added to `morsels/package.json` OR root) | Frontmatter gate           | Tiny script (≤80 lines) iterating `morsels/skills/*/SKILL.md`, parsing with `yaml`, validating with `zod`. Runs in CI and locally.                        |
| GitHub Actions workflow at `.github/workflows/ci.yml`               | Unified CI entry           | Steps: checkout → pnpm → node → install → tsc → vitest → lint:skills → sandbox install smoke.                                                             |
| `vitest.config.ts` at `berrygems/` root                             | Test runner config         | Opts into `experimental.viteModuleRunner: false` so tests hit Node's native TS pipeline instead of Vite's transform. Keeps the "no compile step" promise. |

## Installation

```fish
# Berrygems test stack — inside berrygems/
cd /home/dot/Development/pantry/berrygems
pnpm add -D vitest@^4.1 @marcfargas/pi-test-harness@^0.5 @earendil-works/pi-agent-core @earendil-works/pi-ai @earendil-works/pi-coding-agent

# Morsels lint stack — root (single skill-lint script), devDependencies only
cd /home/dot/Development/pantry
pnpm add -D yaml@^2.8 zod@^4.3
# (If you'd rather keep it scoped to morsels/, add an inner package.json with devDeps there.)
```

Note: the pi-test-harness peer deps (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`) are already resolved in `berrygems/node_modules/@mariozechner/` via the existing pi-install symlink dance. Adding them as explicit devDependencies is only necessary if you want CI to install them from npm without relying on a pre-installed pi — which we do, because the CI runner won't have pi globally installed.

## Alternatives Considered

| Recommended                                      | Alternative                                | When to Use Alternative                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest 4                                         | **`node --test` + `tsx --test`**           | If "one fewer dependency" becomes a hard requirement. `tsx --test` drives `node:test` over `.ts` files directly and needs zero config. The cost: no watch mode UX, no snapshot API, and `pi-test-harness` examples all use Vitest — you'd be porting assertions.                                                                                                                                                                           |
| Vitest 4                                         | **Jest 30**                                | Never for a new pi-package in 2026. Jest's CJS-first architecture requires explicit ESM config, which fights `"module": "ESNext"` + `allowImportingTsExtensions`.                                                                                                                                                                                                                                                                          |
| `yaml` + `zod` for TEST-04                       | **`gray-matter` + `zod`**                  | If the team prefers the convenience of `matter(fileContents)` splitting frontmatter + body in one call. Cost: `gray-matter@4.0.3` last published 2023-07-12, pulls in the old `js-yaml`. For a 56-skill corpus the hand-written splitter is ~10 lines.                                                                                                                                                                                     |
| `yaml` + `zod` for TEST-04                       | **`ajv@8.18` + JSON Schema**               | If we wanted a language-portable schema that could also document the frontmatter contract for non-Node consumers. Not needed — morsels are consumed only by pi/agent harnesses, and Zod's error messages are better for a linter surface.                                                                                                                                                                                                  |
| `yaml` + `zod` for TEST-04                       | **`@github-docs/frontmatter`**             | It wraps `gray-matter` with revalidator schema. Same staleness issue as gray-matter; GitHub-docs-scoped.                                                                                                                                                                                                                                                                                                                                   |
| `pi-test-harness.verifySandboxInstall` for CI-02 | **Custom docker-based install fixture**    | Only needed if pi's git-install codepath behaves materially differently from npm-pack+install and that difference is what we're gating on. The harness does `npm pack` → `npm install <tarball>` → load — that validates the manifest layer but skips `pi install github:…`'s git-clone path. A tiny follow-up shell step that does `pi install $GITHUB_WORKSPACE` into a fresh `HOME` closes the remaining gap without pulling docker in. |
| Vitest 4 native                                  | **Vitest with default Vite module runner** | Default mode gives you Vite plugins, `import.meta.env`, aliases. None of which pantry needs — we want tests to load TS the same way pi does at runtime. Stay on the native runner.                                                                                                                                                                                                                                                         |

## What NOT to Use

| Avoid                                                               | Why                                                                                                                                                                                                                     | Use Instead                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Jest (any version)**                                              | CJS-first; ESM is experimental-flagged; doesn't line up with `"module": "ESNext"` + `allowImportingTsExtensions`. Config tax is real and grows over time.                                                               | Vitest 4.                                                                                                                                  |
| **`ts-node` or `ts-node/esm`**                                      | Deprecated-by-ecosystem for new projects since Node 22's native TS stripping + `tsx` split the job between them. Known conflict patterns with jiti's own ESM resolution.                                                | Native Node 22 TS support on CI; `tsx --test` if Vitest is rejected.                                                                       |
| **Hand-rolled `ExtensionAPI` fakes** (proxy objects, stub literals) | The pi event lifecycle has ~30 event names and tricky ordering (`before_agent_start` vs `agent_start`, `tool_call` block semantics, `ctx.sessionManager.getBranch()` walk). Faking this correctly = re-implementing pi. | `@marcfargas/pi-test-harness` runs the real runtime. Only the model (and named tools) are mocked.                                          |
| **`gray-matter`**                                                   | Last published 2023-07-12, ships an outdated `js-yaml`, CJS-primary, no first-class TS types (they're declared `.d.ts` on DefinitelyTyped), and we already need `zod` for the schema layer.                             | `yaml` (eemeli, 2.8.3) + `zod` (4.3.6). Split frontmatter with a regex (`^---\n(.*?)\n---`), parse block with `yaml`, validate with `zod`. |
| **`joi`**                                                           | Not TypeScript-first; types are bolted on; Joi schemas don't infer a usable `SkillFrontmatter` type for downstream consumers.                                                                                           | `zod`.                                                                                                                                     |
| **Global `pi install` against the real user `$HOME` during CI**     | Would pollute the runner between jobs in matrix builds and race with any other caching step.                                                                                                                            | Smoke-install into `$(mktemp -d)` and point `HOME` at it for that step.                                                                    |
| **Docker-based smoke runner as the first line**                     | Over-engineered; `ubuntu-latest` is already an ephemeral clean env.                                                                                                                                                     | Plain shell step inside the same workflow job. Docker only if reproducibility across self-hosted runners becomes a concrete need.          |
| **Matrix across Node 20 / 22 / 24**                                 | Out of Scope per PROJECT.md (`macOS / Windows CI` + cross-OS deferred). Same rationale applies to Node versions — pin the one pi is known to support.                                                                   | Single Node 22 LTS job.                                                                                                                    |

## Stack Patterns by Variant

**If Vitest's `viteModuleRunner: false` mode misbehaves with `@sinclair/typebox` or pi's symlinks:**

- Fall back to `tsx --test` driving `node:test`. Lose Vitest's DX, keep the no-compile property.
- Rationale: jiti-like loading is more important than the runner's DX surface.

**If `@marcfargas/pi-test-harness` doesn't cover a specific event (`session_before_compact`, `context` event mutation, `resources_discover`):**

- Wrap the harness in a small in-repo `berrygems/tests/helpers/` module that uses the harness's `TestSession.emit(event, payload)`-adjacent primitives.
- Don't hand-roll a second harness.

**If the `pi install github:…` git-clone codepath is what we actually need to gate (CI-02, strict read):**

- Add an extra CI step after the harness smoke: `pi install $GITHUB_WORKSPACE` with `HOME=$(mktemp -d)`, then run `pi list` and grep for extension count ≥ 17 and skill count ≥ 56.
- Keep the harness smoke as the first gate (fast, deterministic); the shell step as the second (more realistic).

**If a second, non-pi consumer ever reads morsels:**

- Emit the Zod schema as JSON Schema via `z.toJSONSchema()` (Zod 4 native) and commit it under `morsels/schema/skill-frontmatter.json`. Other tools can validate against it without a Node dep.

## Version Compatibility

| Package A                                              | Compatible With                           | Notes                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `vitest@^4.1`                                          | Node 20.19+, 22.12+, 24+                  | Node 22.18+ enables native TS stripping (no loader needed). Use Node 22 LTS on CI.                                      |
| `vitest@^4.1` + `experimental.viteModuleRunner: false` | Node 22.15+ for `vi.mock` support         | We don't expect to need `vi.mock` — the pi-test-harness owns the mocking layer.                                         |
| `@marcfargas/pi-test-harness@^0.5`                     | `@earendil-works/pi-coding-agent >= 0.50.0` | Peer-dep check; pi's current release line satisfies this.                                                               |
| `zod@^4`                                               | TypeScript ^5, any Node ≥ 18              | Zod 4 is a major bump from 3.x with better perf; no migration pain for greenfield use.                                  |
| `yaml@^2.8`                                            | Node ≥ 14, ESM + CJS                      | Pure JS, no native bindings.                                                                                            |
| `pnpm@^10` + `pnpm/action-setup@v4`                    | Node ≥ 18                                 | Use `cache: true` and omit `store prune` — the action handles it.                                                       |
| `actions/setup-node@v4` after `pnpm/action-setup@v4`   | —                                         | **Order matters:** pnpm setup must come before `setup-node` so that setup-node can detect pnpm for its own cache logic. |

## Canonical `vitest.config.ts` (berrygems/)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    // Use Node's native module loader + TS stripping, not Vite's transform.
    // Keeps the "loaded exactly like pi loads it" property intact.
    experimental: {
      viteModuleRunner: false,
    },
    // No globals; prefer explicit `import { describe, it, expect } from "vitest"`.
    globals: false,
  },
});
```

## Canonical CI workflow (`.github/workflows/ci.yml`) shape

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10
          cache: true

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install berrygems deps
        working-directory: berrygems
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm --dir berrygems exec tsc --project tsconfig.json

      - name: Unit + integration tests
        run: pnpm --dir berrygems exec vitest run

      - name: Lint skill frontmatter
        run: node --experimental-strip-types scripts/lint-skills.ts

      - name: Install smoke (harness)
        run: pnpm --dir berrygems exec vitest run tests/smoke.install.test.ts
```

The final "Install smoke (harness)" step is just a Vitest test that calls `verifySandboxInstall({ packageDir: process.cwd() })` and asserts the loaded extension/skill counts. No separate tool, no separate language, no docker.

## Sources

- `/vitest-dev/vitest` (Context7) — v4 native Node TS, `experimental.viteModuleRunner: false`, `defineConfig` shape — HIGH
- `/privatenumber/tsx` (Context7) — `tsx --test` driving `node:test` as fallback — HIGH
- `/colinhacks/zod` (Context7) — Zod 4 current stable, `.parse()` ergonomics — HIGH
- `/jonschlinkert/gray-matter` (Context7) — TS typing gaps, staleness signals — MEDIUM (Context7 doesn't surface publish dates; cross-checked with `npm view`)
- `/ajv-validator/ajv` (Context7) — v8.18 current, JSON Schema validation shape for the "alternative considered" column — HIGH
- `/pnpm/action-setup` (Context7) — v4 is current, `cache: true` is the documented knob — HIGH
- https://github.com/marcfargas/pi-test-harness — purpose of the harness, public API (`createTestSession`, `verifySandboxInstall`, `createMockPi`), Vitest example shape, peer-dep floor `pi-coding-agent >= 0.50.0` — HIGH
- https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md — full `ExtensionAPI` + `ExtensionContext` + event surface — HIGH (official pi docs)
- `npm view` (live registry, 2026-04-22) — `vitest@4.1.5`, `zod@4.3.6`, `yaml@2.8.3`, `tsx@4.21.0`, `ajv@8.18.0`, `@marcfargas/pi-test-harness@0.5.0`, `gray-matter@4.0.3` (last publish 2023-07-12) — HIGH
- https://vitest.dev/blog/vitest-4 and https://main.vitest.dev/blog/vitest-4-1 — Vitest 4.0 GA (Oct 2025) and 4.1 (Mar 2026) release notes — HIGH
- https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026 — 2026 runner-selection rationale — MEDIUM
- https://www.pkgpulse.com/compare/ajv-vs-zod — perf vs DX framing for the TEST-04 choice — MEDIUM

---

_Stack research for: pantry v1.0 quality-layer milestone_
_Researched: 2026-04-22_
