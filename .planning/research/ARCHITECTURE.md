# Architecture Research

**Domain:** Test + CI + docs layers for an existing pi-package monorepo (berrygems TS + morsels Markdown) loaded by pi at session start via jiti.
**Researched:** 2026-04-22
**Confidence:** HIGH for test layout + harness boundary (directly grounded in pi-mono and pi-test-harness source). HIGH for workspace decision (grounded in mitsupi as the closest pi-package analogue). MEDIUM for docs-generation trade-off (informed judgement, not a copied pattern).

> Scope note: the runtime architecture — manifest discovery, jiti module isolation, `globalThis[Symbol.for("pantry.*")]` API bus, per-extension `default function (pi: ExtensionAPI)` contract — is already in place and **not being redesigned**. This document architects only the quality-layer code and directories that sit alongside shipped content: tests, test utilities, the morsel frontmatter linter, the install smoke, the CI pipeline, and the generated docs surface.

## Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                        SHIPPED CONTENT (unchanged)                     │
├───────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐   ┌──────────────────────────┐          │
│  │  berrygems/extensions/   │   │    morsels/skills/       │          │
│  │  17 pi extensions        │   │    56 SKILL.md files     │          │
│  │  + berrygems/lib/ shared │   │    (YAML frontmatter +   │          │
│  │  + berrygems/styles/     │   │     Markdown body)       │          │
│  └────────────┬─────────────┘   └────────────┬─────────────┘          │
│               │                               │                        │
│               │ read-only inputs              │ read-only inputs       │
│               ▼                               ▼                        │
├───────────────────────────────────────────────────────────────────────┤
│                      QUALITY LAYER (this milestone)                    │
├───────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐ │
│  │ berrygems/tests/     │  │ scripts/lint-skills  │  │ scripts/     │ │
│  │ ─ lib/*.test.ts      │  │ .ts                  │  │ gen-docs.ts  │ │
│  │ ─ extensions/*.test  │  │ (frontmatter → yaml  │  │ (frontmatter │ │
│  │ ─ smoke.install.test │  │   → zod schema)      │  │  → README    │ │
│  │ ─ helpers/ (fixtures)│  │                      │  │  inventory)  │ │
│  │ ─ vitest.config.ts   │  │                      │  │              │ │
│  └──────────┬───────────┘  └──────────┬───────────┘  └──────┬───────┘ │
│             │                         │                     │         │
│             │ consumes                 │ reads               │ reads  │
│             ▼                         ▼                     ▼         │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  @marcfargas/pi-test-harness    │    scripts/lib/frontmatter.ts  │ │
│  │  (real pi runtime,              │    (shared parse/validate     │ │
│  │   model mocked via playbook)    │     between lint + gen-docs)  │ │
│  └────────────────────────────┬────────────────────────────────────┘ │
│                               │                                       │
├───────────────────────────────┼───────────────────────────────────────┤
│                               ▼                                       │
│                      CI ORCHESTRATION                                 │
│           .github/workflows/ci.yml — single job, ordered steps:       │
│   checkout → pnpm setup → node 22 → install → tsc → vitest →          │
│   lint-skills → install-smoke (verifySandboxInstall)                  │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                               | Responsibility                                                            | Typical Implementation                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `berrygems/tests/`                      | All automated behavioural verification for TS code                        | Vitest `*.test.ts` files, sibling tree (see Layout decision below)                                                                                                                                |
| `berrygems/tests/helpers/`              | Fixture data + shared harness setup that more than one test file uses     | Small modules exporting `createPantrySession(overrides)` wrappers around `createTestSession` from pi-test-harness                                                                                 |
| `berrygems/tests/fixtures/`             | Tempdir fixtures, synthetic settings files, recorded pi session snapshots | Literal JSON/JSONL files + factory functions that write to `os.tmpdir()`                                                                                                                          |
| `berrygems/vitest.config.ts`            | Test-runner config scoped to berrygems                                    | `defineConfig` — `include: ["tests/**/*.test.ts"]`, `experimental.viteModuleRunner: false`                                                                                                        |
| `scripts/lib/frontmatter.ts`            | Parse `SKILL.md` frontmatter block + Zod schema                           | ~60 lines: regex split → `yaml.parse` → `SkillFrontmatterSchema.parse`                                                                                                                            |
| `scripts/lint-skills.ts`                | Walk `morsels/skills/*/SKILL.md`, validate each, report failures          | CLI script, exits non-zero on any invalid frontmatter; prints per-file errors                                                                                                                     |
| `scripts/gen-docs.ts`                   | Generate berrygem + morsel inventory tables from source metadata          | CLI script — parses morsel frontmatter via `scripts/lib/frontmatter.ts`, extracts berrygem one-liners from JSDoc on the default export, writes inventory fragments to `README.md` sentinel blocks |
| `.github/workflows/ci.yml`              | Single-job CI orchestrator                                                | Linear steps: checkout → pnpm → node → install → tsc → vitest → lint-skills → smoke                                                                                                               |
| `berrygems/tests/smoke/install.test.ts` | "Does `pi install` actually load this repo?" gate                         | Vitest test calling `verifySandboxInstall` from pi-test-harness                                                                                                                                   |
| `fish-local/verify.fish` (optional)     | Locally reproduce CI gates without leaving a fish shell                   | Calls `tsc`, `pnpm test`, `node --experimental-strip-types scripts/lint-skills.ts`, and the smoke test in sequence                                                                                |

## Recommended Project Structure

```
pantry/
├── package.json                          # ROOT manifest — pi.extensions + pi.skills
│                                         # Adds devDependencies (yaml, zod) + scripts
│                                         # ("lint:skills", "gen:docs") that target
│                                         # ../scripts. NOT an npm workspace root.
├── scripts/                              # NEW — repo-root tooling
│   ├── lib/
│   │   └── frontmatter.ts                # parse + Zod schema (shared)
│   ├── lint-skills.ts                    # CI gate: validates every SKILL.md
│   └── gen-docs.ts                       # README inventory regenerator
├── berrygems/                            # UNCHANGED layout — pnpm package remains self-contained
│   ├── extensions/                       # 17 extensions (content unchanged)
│   ├── lib/                              # 11 helpers (content unchanged)
│   ├── styles/                           # tone presets (content unchanged)
│   ├── tests/                            # NEW — sibling tree, not co-located
│   │   ├── helpers/
│   │   │   ├── session.ts                # createPantrySession() wrapper
│   │   │   ├── settings-tmpdir.ts        # real-fs settings fixtures
│   │   │   └── globals.ts                # Symbol.for("pantry.*") reset helper
│   │   ├── fixtures/
│   │   │   ├── settings-global.json
│   │   │   ├── settings-project.json
│   │   │   └── session-sample.jsonl
│   │   ├── lib/                          # mirrors berrygems/lib/ 1:1
│   │   │   ├── settings.test.ts
│   │   │   ├── cooldown.test.ts
│   │   │   ├── id.test.ts
│   │   │   ├── pi-spawn.test.ts
│   │   │   └── …                         # one test file per lib module
│   │   ├── extensions/                   # mirrors berrygems/extensions/ 1:1
│   │   │   ├── dragon-curfew.test.ts
│   │   │   ├── dragon-guard.test.ts
│   │   │   ├── dragon-parchment.test.ts
│   │   │   ├── dragon-breath.test.ts
│   │   │   └── …                         # one test file per extension
│   │   └── smoke/
│   │       └── install.test.ts           # verifySandboxInstall gate
│   ├── vitest.config.ts                  # NEW
│   ├── tsconfig.json                     # UNCHANGED — include still ["extensions/**/*.ts", "lib/**/*.ts"]
│   ├── tsconfig.tests.json               # NEW — extends tsconfig.json, include adds ["tests/**/*.ts"]
│   ├── package.json                      # Adds scripts + devDeps (vitest, pi-test-harness)
│   └── pnpm-lock.yaml
├── morsels/                              # UNCHANGED layout
│   ├── skills/                           # 56 skills (content unchanged)
│   └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml                        # NEW — single CI workflow
├── README.md                             # Has <!-- inventory:berrygems:start -->/…:end sentinels
│                                         # that gen-docs.ts overwrites
└── AGENTS.md                             # UNCHANGED — already authoritative
```

### Structure Rationale

- **`berrygems/tests/` (sibling, not co-located):** Three concrete reasons, each grounded in the existing repo shape, not generic TS taste.
  1. **Module-isolation constraint drives the decision.** Pi loads each file under `berrygems/extensions/` as its own module. If tests were co-located (`dragon-guard/index.test.ts`), `tsc --project berrygems/tsconfig.json` would sweep them into the production type-check on every edit — but more critically, any future tool that walks `berrygems/extensions/` to introspect shipped content (e.g. a future `pi list` or a lint that checks tool-registration shape) would need to filter `*.test.ts` specifically. A sibling `tests/` tree keeps "everything pi sees" cleanly separate from "everything developers see."
  2. **Pi-mono (the upstream) uses sibling `test/` at the package level** (`packages/coding-agent/test/*.test.ts`, ~40 flat files + a `fixtures/` subdir — verified against `badlogic/pi-mono` HEAD on 2026-04-22). Matching upstream's layout reduces cognitive friction for any contributor who already reads pi source.
  3. **Directory extensions don't cleanly accept co-location.** `dragon-guard/` has five production files (`index.ts`, `panel.ts`, `state.ts`, `settings.ts`, `bash-patterns.ts`). Co-locating would either scatter tests across all five or force one giant `index.test.ts` — neither is clean. A sibling `tests/extensions/dragon-guard.test.ts` (or a `tests/extensions/dragon-guard/` subdir if it grows) keeps the production directory focused on what pi loads and keeps the test organisation explicit.
- **`tests/helpers/` as a dedicated module directory, not per-test inline fakes:** The pi `ExtensionAPI` has ~30 event names with real ordering semantics. Hand-rolling per-test mocks would silently diverge across files. `helpers/session.ts` is a thin wrapper around `createTestSession` from `pi-test-harness` that (a) pre-loads a minimum viable subset of extensions and (b) resets `globalThis[Symbol.for("pantry.*")]` between tests — the latter is a genuine test-isolation hazard for the publishers/consumers pattern this codebase leans on.
- **`tests/fixtures/` as literal data:** Settings-file tests write to `os.tmpdir()` (per the "never mock the filesystem for settings" rule from `.claude/rules/testing.md`) but reference _canonical_ shapes that are easier to read as JSON files than as string literals. Session-snapshot JSONL fixtures anchor compaction/session-walk tests against real-looking pi output.
- **`scripts/` at the repo root (not inside `berrygems/` or `morsels/`):** The frontmatter linter and docs generator walk `morsels/skills/*` which is outside `berrygems/`, so placing them under `berrygems/` would put the script in a misleading location. Putting them under `morsels/` fights the "morsels is flat content" posture (morsels has no build step, no lock file, no devDeps today). Repo-root `scripts/` is where general-purpose tooling for "the whole repo" belongs and is what pi-mono itself does (`scripts/check-browser-smoke.mjs`, `scripts/release.mjs`).
- **Keep `berrygems/` as its own pnpm package, do NOT promote the repo root to a multi-package workspace.** Covered in depth under "Key Architectural Decisions → Workspace boundary" below. Short version: no second TS package in view + root already has a different job (pi manifest) + mitsupi (the closest pi-package analogue) doesn't use workspaces either.
- **`tsconfig.tests.json` extending `tsconfig.json`:** Tests need `include: ["tests/**/*.ts"]` but keeping that out of the shipped-code tsconfig preserves the existing "`tsc` gates exactly what pi loads" property. CI runs both: `tsc --project berrygems/tsconfig.json` for shipped code, `tsc --project berrygems/tsconfig.tests.json --noEmit` as an additional gate before `vitest run`.

## Architectural Patterns

### Pattern 1: Pi-test-harness as the only integration boundary

**What:** Every test that touches `ExtensionAPI`, event lifecycle, tool-call hooks, or UI interception goes through `@marcfargas/pi-test-harness`'s `createTestSession`. No hand-rolled fakes of pi types live in `berrygems/tests/helpers/`. The only acceptable "custom" surface around the harness is a thin `createPantrySession(overrides)` convenience wrapper.

**When to use:** For TEST-03 (integration-test every extension). Anything that needs `pi.registerTool`, `pi.on("event")`, `ctx.sessionManager`, `ctx.ui`, or `pi.appendEntry` must route through the harness.

**Trade-offs:**

- **Pros:** The harness runs real pi code — extension loader, tool registry, event dispatcher, ctx.ui surface — with only `streamFn` replaced by a playbook DSL. This is structurally impossible to drift from production pi behaviour because there _is no_ parallel implementation. Peer-dep floor (`pi-coding-agent >= 0.50.0`) matches what pantry already depends on transitively.
- **Cons:** One external package to track compatibility with. If the harness lags a pi release that changes the `ExtensionAPI` contract, tests break before shipped code does — which is a feature, not a bug, but needs acceptance.
- **Escape hatch:** If the harness doesn't cover a specific event (e.g. `resources_discover`, `session_before_compact`), wrap the harness in a `tests/helpers/` module using the harness's own session primitives. **Never** hand-roll a second harness alongside it.

**Example:**

```typescript
// berrygems/tests/extensions/dragon-guard.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { when, calls, says } from "@marcfargas/pi-test-harness";
import { createPantrySession } from "../helpers/session.ts";
import type { TestSession } from "@marcfargas/pi-test-harness";

describe("dragon-guard", () => {
  let t: TestSession;
  afterEach(() => t?.dispose());

  it("blocks bash calls in puppy mode", async () => {
    t = await createPantrySession({
      extensions: ["./berrygems/extensions/dragon-guard/index.ts"],
      settings: { "pantry.guard.mode": "puppy" },
    });
    await t.run(
      when("run ls", [
        calls("bash", { command: "ls" }),
        says("blocked by dragon-guard"),
      ]),
    );
    expect(t.events.blockedCalls()).toHaveLength(1);
  });
});
```

### Pattern 2: Real filesystem for persistence tests, never mocks

**What:** Anything testing `berrygems/lib/settings.ts` (or any lib that touches the filesystem) writes to `os.tmpdir()` via a helper (`tests/helpers/settings-tmpdir.ts`) and exercises real `readFileSync`/`writeFileSync`. No `vi.mock("node:fs")` anywhere.

**When to use:** For TEST-02 (unit-test every lib helper) — and by extension for any future test that loads a real settings snapshot.

**Trade-offs:**

- **Pros:** Directly inherits the project-wide "never mock the DB" rule (`.claude/rules/testing.md`) — here the settings JSON files under `~/.pi/agent/` and `.pi/` _are_ the persistence layer. Real fs catches off-by-one path-resolution bugs, CRLF-vs-LF frontmatter quirks, and legacy-key-migration miscompiles that a mocked fs would silently hide.
- **Cons:** Tests must be isolation-safe. Each test owns its own `mkdtempSync(tmpdir() + "/pantry-")` and tears it down in `afterEach`. Parallel-test workers can't share a tmp dir.
- **Escape hatch:** None. If a test needs a filesystem, it gets a real one.

**Example:**

```typescript
// berrygems/tests/helpers/settings-tmpdir.ts
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeSettingsHome(initial: Record<string, unknown> = {}) {
  const home = mkdtempSync(join(tmpdir(), "pantry-home-"));
  const agentDir = join(home, ".pi", "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify(initial));
  return {
    home,
    dispose: () => rmSync(home, { recursive: true, force: true }),
  };
}
```

### Pattern 3: Frontmatter validation as a Zod schema, used twice

**What:** The `SkillFrontmatterSchema` (Zod) is the single source of truth for what a valid `SKILL.md` frontmatter looks like. Both `scripts/lint-skills.ts` (the CI gate, TEST-04) _and_ `scripts/gen-docs.ts` (the inventory regenerator, DOCS-02/DOCS-03) import from `scripts/lib/frontmatter.ts`. If the schema adds a new required field, both consumers update in lockstep.

**When to use:** Everywhere morsel frontmatter is read programmatically. No second parser implementation anywhere in the repo.

**Trade-offs:**

- **Pros:** One schema, compile-time-typed via `z.infer`. Errors from `.parse()` are already formatted well enough to surface directly in CI output — no bespoke error-reporting layer. Lint and docs-gen cannot drift on what "valid" means.
- **Cons:** Adds `zod` as a root devDependency. For a 56-file corpus a dumb regex could work — but the corpus will grow, and Zod pays for itself the first time someone adds `allowed-tools: string[]` and expects the inventory to reflect it.
- **Escape hatch:** If docs-gen ever needs richer introspection than frontmatter provides (e.g. extracting the H1 title from the body), extend `scripts/lib/frontmatter.ts` with a second function `parseSkillFile(path)` that returns `{ frontmatter, body, title }` — but keep Zod as the authority on the frontmatter shape.

**Example:**

```typescript
// scripts/lib/frontmatter.ts
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { z } from "zod";

export const SkillFrontmatterSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "must be lowercase-hyphenated"),
  description: z.string().max(1024),
  license: z.literal("MIT"),
  compatibility: z.string().optional(),
  "allowed-tools": z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseSkillFrontmatter(path: string): {
  frontmatter: SkillFrontmatter;
  body: string;
} {
  const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const match = source.match(FRONTMATTER_RE);
  if (!match) throw new Error(`${path}: no frontmatter block`);
  const raw = parseYaml(match[1]);
  const frontmatter = SkillFrontmatterSchema.parse(raw);
  return { frontmatter, body: match[2] };
}
```

### Pattern 4: Frontmatter-driven inventory with sentinel blocks in README

**What:** `README.md` contains sentinel comments — `<!-- inventory:berrygems:start -->` and `<!-- inventory:berrygems:end -->` (same for `inventory:morsels:*`). `scripts/gen-docs.ts` reads the entire README, replaces the block between matched sentinels with freshly generated content, and writes it back. The rest of the README — the "what is this", the install commands, the roadmap, the hand-written prose — is never touched by the script.

**When to use:** For DOCS-02 and DOCS-03 (berrygem + morsel inventories). Not for DOCS-01 (the top-level README narrative, which stays hand-written) and not for DOCS-04 (per-berrygem README files inside directory extensions, which are too architecturally rich to generate well).

**Trade-offs:** This is the central docs-generation trade-off. See "Key Architectural Decisions → Docs generation vs hand-written" below for the full framing. In one line: **sentinel-block regeneration + a CI check that fails when the README would change** is deterministic, drift-proof, and keeps hand-written narrative untouched.

**Example:**

```markdown
<!-- inventory:berrygems:start -->

| Extension     | Summary                                        |
| ------------- | ---------------------------------------------- |
| dragon-breath | Carbon + energy tracking for session activity  |
| dragon-curfew | End-of-day soft gate with opt-out confirmation |

…

<!-- inventory:berrygems:end -->
```

### Pattern 5: Install smoke as a Vitest test, not a separate tool

**What:** `berrygems/tests/smoke/install.test.ts` calls `verifySandboxInstall({ packageDir: resolve(__dirname, "../../..") })` from pi-test-harness and asserts the extension + skill counts. CI runs it as the last vitest invocation. Fish-local verify script calls the same vitest target.

**When to use:** CI-02. Single source of install-verification truth.

**Trade-offs:**

- **Pros:** One runner, one output format, one set of assertions. No second language (shell), no extra dependency, no "is the install smoke broken because of the smoke or because of a real regression" ambiguity.
- **Cons:** The harness's `verifySandboxInstall` does `npm pack` → install → load. That validates the `pi.extensions`/`pi.skills` manifest shape and extension loadability but **does not** exercise pi's `pi install github:…` git-clone codepath. That's an acceptable gap for v1.0 (both paths land at the same "install a directory with a manifest" state), but if pi's git-install ever develops special-case behaviour, bolt a second shell step into CI that does `pi install $GITHUB_WORKSPACE` into `HOME=$(mktemp -d)` and asserts `pi list` output. Keep the vitest smoke as the fast gate, add the shell step as a follow-up gate — not the other way around.

## Data Flow

### Test invocation → extension reach

```
developer runs `pnpm test`
  → vitest starts (reads berrygems/vitest.config.ts)
    → loads berrygems/tests/extensions/dragon-guard.test.ts
      → test imports createPantrySession from tests/helpers/session.ts
        → session.ts calls createTestSession from @marcfargas/pi-test-harness
          → harness loads real @earendil-works/pi-coding-agent runtime
            → pi's extension loader jiti-imports berrygems/extensions/dragon-guard/index.ts
              → dragon-guard/index.ts registers its tool + hook via pi.registerTool / pi.on
          → harness returns TestSession with real ExtensionAPI wired up
        → session.ts resets globalThis[Symbol.for("pantry.*")] between tests
      → test drives playbook: t.run(when(...prompt..., [calls("bash"), says("...")]))
        → harness's playbook replaces model.streamFn, calls real tool hooks
          → dragon-guard's tool_call handler fires, returns BLOCK verdict
        → harness records event in t.events.blockedCalls()
  → test asserts on t.events
```

**Key invariant:** everything from "pi's extension loader" onward is unmodified production code. The harness's only substitution points are `streamFn`, `tool.execute()` (when `mockTools` is supplied), and `ctx.ui.*`. This matches upstream intent as documented in `marcfargas/pi-test-harness/README.md` and is what makes the integration layer trustworthy.

### Morsel lint invocation → frontmatter reach

```
CI step "Lint skill frontmatter"
  → node --experimental-strip-types scripts/lint-skills.ts
    → glob morsels/skills/*/SKILL.md
      → for each path:
        → scripts/lib/frontmatter.ts → parseSkillFrontmatter(path)
          → readFileSync(path, "utf8").replace(CRLF → LF)
          → FRONTMATTER_RE regex split
          → yaml.parse(block)
          → SkillFrontmatterSchema.parse(raw)   ← Zod validation
            → on failure: collect ZodError, continue to next file
      → if any failures: print per-file diagnostics, exit 1
      → else: exit 0
```

### Docs-gen invocation → README reach

```
developer runs `pnpm gen:docs` (or CI gen-check step)
  → node --experimental-strip-types scripts/gen-docs.ts
    → read README.md
    → build berrygems inventory:
      → enumerate berrygems/extensions/*.ts and berrygems/extensions/*/index.ts
      → for each: AST-lite extract of the default export's leading JSDoc (a one-liner tag)
      → format as Markdown table rows
    → build morsels inventory:
      → enumerate morsels/skills/*/SKILL.md
      → parseSkillFrontmatter → group by category (derived from name/metadata)
      → format as Markdown table rows, grouped
    → replace content between <!-- inventory:berrygems:start --> and ...:end
    → replace content between <!-- inventory:morsels:start --> and ...:end
    → write README.md
    → CI check mode: diff against git, exit 1 on mismatch (blocks PR if docs drifted)
```

### CI pipeline flow

```
GitHub Actions triggers on push/PR
  → ubuntu-latest runner
    → actions/checkout@v4
    → pnpm/action-setup@v4 (version: 10, cache: true)
    → actions/setup-node@v4 (node-version: 22)     ← AFTER pnpm, so its cache detects pnpm
    → pnpm install --frozen-lockfile               ← resolves workspace deps + pi-test-harness
    → pnpm --dir berrygems exec tsc --project tsconfig.json        ← shipped-code gate
    → pnpm --dir berrygems exec tsc --project tsconfig.tests.json  ← tests gate
    → pnpm --dir berrygems exec vitest run tests/lib tests/extensions
    → node --experimental-strip-types scripts/lint-skills.ts
    → node --experimental-strip-types scripts/gen-docs.ts --check  ← docs drift gate
    → pnpm --dir berrygems exec vitest run tests/smoke             ← last, slowest
```

If any step fails the workflow stops. Order matters: `tsc` is fastest + most common failure → run first. `smoke` is slowest (does npm pack + install) → run last.

## Scaling Considerations

Pantry is a personal pi-package, not a product. "Scale" here is about test-suite size, not users.

| Scale                                              | Architecture Adjustments                                                                                                                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today: 17 extensions + 56 skills + ~11 lib modules | Single-job CI, single vitest config, one smoke test. No split.                                                                                                                                                              |
| +20 extensions / +30 skills (mid-term growth)      | Same shape. Consider `vitest --shard` in CI if total time > 3 min. Consider `tests/smoke/*.test.ts` (plural) if the smoke step grows a second assertion (e.g. per-provider install matrix).                                 |
| +50 extensions (hypothetical)                      | Consider `vitest --project` subprojects — one for lib/, one for extensions/ — for isolated watch mode DX. Docs-gen may warrant splitting inventory into category sub-files referenced by README. No CI architecture change. |

### Scaling Priorities

1. **First bottleneck: test-run time.** At 17 extensions × a couple of tests each, total runtime is fine. The first knob to turn is `vitest --shard=N/M` in a matrix strategy — not introducing workspaces.
2. **Second bottleneck: smoke-test cold start.** `verifySandboxInstall` does `npm pack` which gets slower as the package grows. If it crosses ~30s, cache `node_modules` aggressively (the pnpm action already does cache) and consider moving the smoke to a separate job that runs on a schedule rather than on every PR.
3. **Third bottleneck: module-isolation test state bleed.** If `globalThis[Symbol.for("pantry.*")]` symbols accumulate across tests and cause flakes, the fix is in `tests/helpers/globals.ts` (a `resetPantryGlobals()` hook run in `beforeEach`), not in test-runner architecture.

## Anti-Patterns

### Anti-Pattern 1: Hand-rolled ExtensionAPI fakes in `tests/helpers/`

**What people do:** Write a `mockPi.ts` that exposes `{ registerTool: vi.fn(), on: vi.fn(), appendEntry: vi.fn() }` and assert on the spies.
**Why it's wrong:** Pi's event lifecycle has ordering semantics (`before_agent_start` vs `agent_start`, `tool_call` can BLOCK or MUTATE, `tool_result` can MODIFY). A shape-level fake passes for `.registerTool()` but silently diverges on ordering, block semantics, and the `ctx.sessionManager.getBranch()` walk pattern that extensions like `dragon-digestion` rely on. Every extension test built on a hand-rolled fake eventually catches regressions late — in manual `/reload` — instead of in CI.
**Do this instead:** `@marcfargas/pi-test-harness`'s `createTestSession`. It runs the real pi extension loader + runtime with only `streamFn` replaced. Only mock tools and UI, not pi itself.

### Anti-Pattern 2: Co-locating `*.test.ts` under `berrygems/extensions/` or `berrygems/lib/`

**What people do:** Put `dragon-curfew.test.ts` next to `dragon-curfew.ts` because "it's the TS convention."
**Why it's wrong:** `berrygems/tsconfig.json` includes `extensions/**/*.ts` and `lib/**/*.ts`. Co-located tests would be swept into the production type-check and — more importantly — into any future tool that walks those directories to introspect shipped content (a `pi list`-style command, a lint, a doc-gen). Pi itself walks `berrygems/extensions/` at install time. A `.test.ts` file in that tree is architecturally noise.
**Do this instead:** `berrygems/tests/lib/` and `berrygems/tests/extensions/` mirror the production tree 1:1. `tsconfig.tests.json` extends `tsconfig.json` with `include: ["tests/**/*.ts"]`. Shipped-code type-check stays scoped to shipped code.

### Anti-Pattern 3: Frontmatter lint as a standalone npm package or GitHub Action

**What people do:** Publish `@dotbeeps/morsel-lint` or wire up `morsel-lint-action@v1` for this one repo.
**Why it's wrong:** The linter is ~60 lines of code + a ~20-line Zod schema. Publishing turns a one-hour task into a multi-repo release dance with its own CHANGELOG. The scope-amputation commit is fresh — the lesson is "fewer moving parts," not more.
**Do this instead:** `scripts/lint-skills.ts` at the repo root, run via `node --experimental-strip-types`. If a future third consumer of the schema appears (other pi-packages, agentskills.io tooling), **then** extract — never speculatively.

### Anti-Pattern 4: Hand-maintained inventory tables in README

**What people do:** "I'll just keep the extension list in README up to date by hand."
**Why it's wrong:** At 17 extensions and 56 skills today, with known growth, hand-maintained inventories drift the first time someone ships a new berrygem and forgets the README. The drift isn't detected until a user reads the README and doesn't find what they see in `pi list`. The symptom arrives months after the cause.
**Do this instead:** Sentinel-block regeneration from frontmatter (Pattern 4). CI runs `gen-docs.ts --check` and fails the PR if the README would change — the docs cannot drift without a failing build.

### Anti-Pattern 5: Promoting the repo root to a multi-package npm/pnpm workspace

**What people do:** Add `"workspaces": ["berrygems", "morsels", "scripts"]` to root `package.json` so `scripts/` can pull in deps independently of berrygems.
**Why it's wrong:** The root `package.json` has a very specific, non-npm job — it's the pi-package manifest that pi reads to discover content. Making it an npm workspace root adds npm semantics (install hooks, lifecycle scripts, workspace resolution) to a file that today has a clean, minimal shape. It also breaks mitsupi's pattern, which is the closest analogue in the wild (one root `package.json`, single `pi.*` manifest, `dependencies` declared at root, no workspaces).
**Do this instead:** Keep `berrygems/` as its own pnpm package. Add a tiny, standalone root `package.json` extension: `devDependencies: { yaml, zod }` + `scripts: { "lint:skills": "node --experimental-strip-types scripts/lint-skills.ts", "gen:docs": "..." }`. Root-level deps are pinned but don't cascade — morsels stays flat, berrygems stays self-contained. This matches the "flat ownership, no frameworks" posture already called out in `.planning/codebase/ARCHITECTURE.md`.

## Integration Points

### External Services

| Service                       | Integration Pattern                                                                                             | Notes                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions                | Single-job workflow on `ubuntu-latest`; v4 actions throughout                                                   | Workflow triggers on `push: [main]` and `pull_request`. `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` to match pi-mono's pattern.                             |
| pnpm registry                 | `@marcfargas/pi-test-harness`, `vitest`, `yaml`, `zod`                                                          | All ESM, all current, all available from the public npm registry. No private registry.                                                                                                   |
| `@mariozechner/*` pi packages | Resolved via `berrygems/node_modules/` symlinks locally; installed from npm in CI via pi-test-harness peer deps | In CI, these must be explicit devDependencies (not pre-installed) because the runner doesn't have `pi` globally. Local dev continues to use the symlink dance documented in `AGENTS.md`. |

### Internal Boundaries

| Boundary                                                         | Communication                                                                                                                                                     | Notes                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `berrygems/tests/` ↔ `berrygems/extensions/`                    | Tests import extensions via relative path strings passed to `createTestSession({ extensions: ["./berrygems/extensions/..."] })` — **not** via `import` statements | Preserves the module-isolation property. The harness loads the extension the same way pi does, so tests exercise the real load path.                       |
| `berrygems/tests/` ↔ `berrygems/lib/`                           | Direct relative `import` from test file to lib module                                                                                                             | Library modules are plain TS, not loaded by pi in isolated contexts. Standard TS imports are safe and correct here.                                        |
| `scripts/lint-skills.ts` ↔ `scripts/gen-docs.ts`                | Both import from `scripts/lib/frontmatter.ts`                                                                                                                     | Single Zod schema is the contract between the two consumers. Adding a new frontmatter field updates both simultaneously.                                   |
| `scripts/gen-docs.ts` ↔ `README.md`                             | Sentinel-block string replacement (regex-anchored on `<!-- inventory:*:start -->` / `...:end`)                                                                    | Never touches the rest of the README. CI check mode diffs against git to detect drift.                                                                     |
| `berrygems/tests/smoke/install.test.ts` ↔ `package.json` (root) | `verifySandboxInstall({ packageDir })` points at the repo root, reads `pi.extensions` + `pi.skills` exactly as pi would                                           | This is the assertion that the pi-package manifest still works — not just "the types compile."                                                             |
| `fish-local/verify.fish` ↔ CI                                   | Calls identical commands in the same order CI does; no separate fish-native test runner                                                                           | Fish-first scripting is a repo convention (per `AGENTS.md`), but the **commands** are the same commands CI invokes. There is one gate definition, not two. |

## Key Architectural Decisions

These are the hard calls the downstream roadmap phases need to know about. Each lists the trade-off and the chosen position.

### Decision 1: Workspace boundary — berrygems-only, not repo-root

**Status:** Chosen — berrygems stays a standalone pnpm package; root gets a tiny `devDependencies` + `scripts` addition but is **not** promoted to a workspace root.

**Trade-off:**

- **Repo-root workspace:** Allows `scripts/` to have its own `package.json` and deps. Adds npm workspace semantics to the pi manifest file. Breaks parity with mitsupi. Invites future packages (a `morsels-tools/` package, a `tests/` shared package) that this codebase explicitly does not want per its "no framework sprawl" stance.
- **Berrygems-only workspace (chosen):** `berrygems/` remains a self-contained pnpm package with its own lockfile. Root gets `yaml` + `zod` as devDependencies and two scripts — small, explicit, reversible. `scripts/` imports them via Node's module resolution; no separate `package.json` under `scripts/`.

**Why chosen:** (1) mitsupi, the closest in-the-wild pi-package analogue, does not use workspaces. (2) The scope amputation on 2026-04-22 explicitly reduced the number of concurrent packages in this repo; promoting to a multi-package workspace would reintroduce exactly the structural complexity that was just cut. (3) The v1.0 milestone is a cleanup cut, not a framework-bringing cut. (4) If a future milestone ships a genuinely separate package, the workspace promotion is a one-line change to root `package.json` — the decision is reversible but the inverse is not.

### Decision 2: Test layout — sibling tree (`berrygems/tests/`), not co-located

**Status:** Chosen — sibling tree mirroring the production directory structure.

**Trade-off:** Covered in detail under "Structure Rationale" and "Anti-Pattern 2." Summary:

- **Co-located (`lib/settings.test.ts` next to `lib/settings.ts`):** Standard TS DX; tests live close to code. Breaks `tsc --project berrygems/tsconfig.json`'s current "exactly what pi sees" scope. Forces every future `berrygems/extensions/`-walking tool to filter `*.test.ts`. Fights directory extensions.
- **Sibling (`berrygems/tests/lib/settings.test.ts`, chosen):** One extra `cd` when jumping between file and test, offset by `tsc`-scope cleanliness + consistency with pi-mono upstream + clean directory-extension story.

**Why chosen:** Module-isolation constraint and the "pi walks berrygems/extensions/" invariant drive the outcome. Pi-mono upstream uses the same layout, which is cheap to match.

### Decision 3: Docs generation — sentinel-block regeneration, CI-drift-gated

**Status:** Chosen — inventories are regenerated from frontmatter (morsels) and JSDoc (berrygems) into sentinel blocks inside `README.md`. The rest of the README is hand-written. CI runs `gen-docs.ts --check` and fails on drift.

**Trade-off:**

- **Fully hand-written:** Prose quality is authorial, not templated. Drifts the moment a new extension ships and the README isn't updated in the same PR. Drift is invisible until a reader catches it.
- **Fully generated README:** Zero prose voice. Template-driven READMEs read like catalogue entries. Hostile to the existing tone of pantry's documentation.
- **Hybrid (chosen):** Hand-written narrative + generated inventory blocks. Sentinel comments anchor the generated regions; `gen-docs.ts` never touches anything outside them. CI `--check` mode surfaces drift as a failed PR check, not as a silent `README.md` divergence.

**Why chosen:** The drift risk with hand-written inventories is real (17 extensions and 56 skills is already past the comfortable-by-hand threshold) and the loss of authorial voice with full generation is unacceptable for a repo where `README.md` is the public-facing surface. The hybrid cost is ~80 lines of script code and one CI step. Determinism is guaranteed because the script reads fully deterministic inputs (frontmatter + JSDoc) and writes to a single string-replaced region.

### Decision 4: Install smoke — Vitest test, with a fish-local wrapper

**Status:** Chosen — `berrygems/tests/smoke/install.test.ts` calls `verifySandboxInstall` and is run both in CI and from `fish-local/verify.fish`. The fish script invokes the same `vitest run tests/smoke` command CI does.

**Trade-off:**

- **GitHub-Actions-only shell step:** One less file in the repo; no local reproducibility.
- **Separate shell script (fish + bash parity):** Two runtime environments to keep in sync.
- **Single vitest test + fish wrapper (chosen):** One assertion implementation, one runner, one output format. Fish wrapper is a ~10-line script that calls CI's commands.

**Why chosen:** Reproducibility locally is an AGENTS.md convention ("fish, not bash"). Keeping the smoke in vitest means the assertions (extension count, skill count, specific-extension loaded) share their error messages with the rest of the test suite. A shell-only smoke would reinvent assertion semantics in bash.

### Decision 5: Morsel lint lives in `scripts/`, not as a pre-commit hook or berrygem

**Status:** Chosen — `scripts/lint-skills.ts` at repo root, called from CI and optionally from `fish-local/verify.fish`.

**Trade-off:**

- **Pre-commit hook (husky):** Developer-side gate; but misses PR reviewers on other machines and requires setup. Pi-mono upstream uses husky (`.husky/` in its tree) so there's precedent, but pantry has no current hook infrastructure and adding it is a second decision.
- **Berrygem that self-lints at load:** Violates the "tests are not shipped content" boundary. Pi would run the lint at every session start, which is the wrong time and the wrong audience.
- **Vitest suite:** Possible — `tests/morsels/frontmatter.test.ts` that iterates `morsels/skills/*` and asserts. Plausible, but bundles morsel validation with berrygems test infrastructure, which is a cross-concern.
- **Standalone script (chosen):** Independent of the TS test runner. Zero coupling between berrygems tests and morsels validation. Runs in CI as a peer step to vitest, not inside it.

**Why chosen:** Morsels is Markdown, not TypeScript — putting its validator inside a TypeScript test runner is layering that doesn't serve anyone. A standalone script is the smallest possible thing that works, runs fast, and surfaces clean errors. If a future pre-commit hook is desired, it can invoke the same script; the underlying tool doesn't change.

## Build Order Implications for the Roadmap

Given these patterns, the phase ordering the roadmap should reflect:

1. **Phase: Infrastructure foundation (must come first).**
   - `AMP-01` (remove husks) — anything that might otherwise be swept into CI globs.
   - Repo-root `package.json` additions (devDependencies: `yaml`, `zod`; scripts).
   - `berrygems/package.json` additions (devDependencies: `vitest`, `@marcfargas/pi-test-harness`; `test` script).
   - `berrygems/vitest.config.ts` + `berrygems/tsconfig.tests.json`.
   - `berrygems/tests/helpers/` scaffolding — **before** any actual tests are written, because every test depends on these.
   - `scripts/lib/frontmatter.ts` + Zod schema — **before** `lint-skills.ts` or `gen-docs.ts`, because both consume it.
   - This phase ships nothing user-facing but unblocks everything after.

2. **Phase: TEST-02 (lib unit tests).** Depends on helpers being in place. Completes before TEST-03 because lib-level failures will cascade into extension tests and are cheaper to debug first.

3. **Phase: TEST-03 (extension integration tests).** Depends on pi-test-harness being installed and `createPantrySession` helper working. Can proceed per-extension in parallel; no cross-extension ordering.

4. **Phase: TEST-04 (frontmatter lint).** Independent of TEST-02/03 once `scripts/lib/frontmatter.ts` exists. Can ship in parallel with TEST-02 if Phase 1's schema work is complete.

5. **Phase: CI-01 (workflow).** Depends on TEST-02/03/04 all having an invocation command that works locally. CI-01 is purely composing local commands into an ordered GHA workflow.

6. **Phase: CI-02 (install smoke).** Depends on the harness being installed (Phase 1) and the workflow existing (CI-01). Smoke is the last step in the CI workflow; shipping it last means every earlier gate is already green.

7. **Phase: DOCS-02/03 (generated inventories).** Depends on `scripts/lib/frontmatter.ts` (Phase 1) and, for DOCS-02, on a decision about the JSDoc convention for berrygem one-liners (which is a Phase-1-adjacent authoring convention). The `gen-docs.ts --check` mode adds one CI step but does not block earlier phases.

8. **Phase: DOCS-01 + DOCS-04 (hand-written README rewrite + per-berrygem READMEs).** Independent of all the above. Can ship in parallel with the test phases. Best deferred until DOCS-02/03 are in place so the top-level README can reference the generated inventory blocks directly.

9. **Phase: REL-01 (v1.0 tag).** Depends on every Active requirement being green in CI.

The critical dependency chain is: **Phase 1 (infrastructure) → TEST-02 → TEST-03 → CI-01 → CI-02 → REL-01.** Everything else (TEST-04, DOCS-\*) hangs off Phase 1 but doesn't block the critical path.

## Sources

- `marcfargas/pi-test-harness` README + `__tests__/` directory (fetched via `gh api` 2026-04-22) — HIGH: authoritative API surface, architecture diagram, playbook DSL, `verifySandboxInstall` contract.
- `badlogic/pi-mono` — HIGH:
  - `packages/coding-agent/test/*.test.ts` (~40 flat files + `fixtures/`) — upstream sibling-tree test layout precedent.
  - `packages/coding-agent/vitest.config.ts` — `globals: true`, `environment: "node"`, resolve-alias to real source pattern.
  - `.github/workflows/ci.yml` — concurrency group, v4 action versions, `setup-node` after `pnpm/action-setup`, node 22, `cache: npm` equivalent of `cache: true`.
  - `packages/coding-agent/test/frontmatter.test.ts` — confirms pi itself uses `parseFrontmatter`/`stripFrontmatter` internals; informs that our standalone `scripts/lib/frontmatter.ts` is the right layer (pi's is not published).
  - `test.sh`, `pi-test.sh` — repo-root shell-script-to-centralise-gates pattern; informs the fish-local wrapper.
- `mitsuhiko/agent-stuff` (mitsupi) — HIGH:
  - Single-root `package.json` with `pi.extensions`/`pi.skills`/`pi.themes`/`pi.prompts`, no workspaces, no tests — confirms the pi-package analogue pattern for the workspace-boundary decision.
  - No `.github/workflows/ci.yml` (only `npm-publish.yml`) — pantry's choice to add CI is more ambitious than the upstream pattern, which means we can't copy-paste but must design.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/TESTING.md` — HIGH: existing pantry runtime architecture, no redesign.
- `.planning/research/STACK.md` — HIGH: vitest 4.1.5, pi-test-harness 0.5.0, yaml 2.8.3, zod 4.3.6, node 22 LTS, GitHub Actions v4 actions.
- `.claude/rules/testing.md` — HIGH: "never mock the DB" rule adapted to settings.json as persistence.
- `pantry/AGENTS.md` — HIGH: fish-first scripting convention, `/reload` as manual loop, current `tsc` gate.

---

_Architecture research for: pantry v1.0 quality-layer milestone_
_Researched: 2026-04-22_
