# Phase 2: Tests & Quality Infrastructure — Plan-Time Research

**Researched:** 2026-04-23
**Confidence:** HIGH — 95% of substance pre-existed in `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, and `.planning/codebase/TESTING.md`. This doc re-consolidates for plan-authoring and adds the operational details (exact commands, file shapes, import paths) that the planner needs without round-tripping to source research docs.

> **Primary sources — read these for depth:**
>
> - `.planning/research/STACK.md` — canonical stack selection (Vitest 4.1.5, harness, yaml, zod), version matrix, install commands, canonical `vitest.config.ts` + CI snippet.
> - `.planning/research/PITFALLS.md` — Pitfalls 1-10, especially §2 (module-cache false greens → harness-first), §3 (PANTRY_KEYS body lint), §4 (frontmatter schema half-life), §5 (named > count), §10 (scope creep).
> - `.planning/phases/02-tests-quality-infrastructure/02-CONTEXT.md` — locked user decisions D-01..D-20; this RESEARCH.md serves those decisions, does not re-question them.

---

## 1. Stack — versions & install lines (HIGH)

Exact versions locked per STACK.md. These land in the `devDependencies` of the indicated `package.json`:

| Package                         | Version                  | Where                    | Why                                                                                                |
| ------------------------------- | ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `vitest`                        | `^4.1` (resolves 4.1.5+) | `berrygems/package.json` | Test runner. `experimental.viteModuleRunner: false` for native-Node TS to mirror pi's jiti loader. |
| `@marcfargas/pi-test-harness`   | `^0.5` (0.5.0)           | `berrygems/package.json` | `createTestSession`, `verifySandboxInstall`, `createMockPi`. Peer deps must resolve.               |
| `@mariozechner/pi-agent-core`   | matching harness peer    | `berrygems/package.json` | Harness peer dep (CI has no global pi).                                                            |
| `@mariozechner/pi-ai`           | matching harness peer    | `berrygems/package.json` | Harness peer dep.                                                                                  |
| `@mariozechner/pi-coding-agent` | `>= 0.50.0`              | `berrygems/package.json` | Harness peer dep (floor).                                                                          |
| `yaml`                          | `^2.8` (2.8.3)           | root `package.json`      | Frontmatter parser for `lint-skills.ts`. Modern ESM, TS types bundled. Replaces `gray-matter`.     |
| `zod`                           | `^4.3` (4.3.6)           | root `package.json`      | Schema validation for frontmatter + settings. Used by both TEST-04 and the D-09 settings wrapper.  |

**Install commands (fish-aware; run from repo root):**

```fish
# Berrygems test stack
pnpm --dir berrygems add -D vitest@^4.1 @marcfargas/pi-test-harness@^0.5 \
  @mariozechner/pi-agent-core @mariozechner/pi-ai @mariozechner/pi-coding-agent

# Root lint stack
pnpm add -D yaml@^2.8 zod@^4.3
```

**Do not install at the wrong level.** `yaml`/`zod` go to ROOT (lint-skills is a root-level script). `vitest`/`pi-test-harness`/`pi-*` peers go to `berrygems/` (that is the only pnpm workspace).

---

## 2. Canonical config files (HIGH)

### `berrygems/vitest.config.ts` (new)

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude smoke by default — TEST-01 SC requires default `vitest run` to
    // stay fast and green. Smoke is invoked explicitly via CLI include
    // (`vitest run tests/smoke/install.test.ts`) and by Phase 4 CI.
    include: ["tests/lib/**/*.test.ts", "tests/extensions/**/*.test.ts"],
    // Node native TS stripping instead of Vite transform.
    // Matches how pi loads extensions via jiti at runtime.
    experimental: {
      viteModuleRunner: false,
    },
    // Prefer explicit `import { describe, it, expect } from "vitest"`.
    globals: false,
    // Real filesystem via os.tmpdir() per project rule; no fs mocks.
    // Integration tests via pi-test-harness — pi owns module isolation.
  },
});
```

### `berrygems/tsconfig.tests.json` (new)

Extends `tsconfig.json` (the shipped config) with test-scoped includes. Keeps test-only types (`vitest/globals`? NO — `globals: false` — just the test discovery scope) isolated from the shipped `tsc --project tsconfig.json` gate.

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["vitest"],
    "noEmit": true,
  },
  "include": ["tests/**/*.ts", "lib/**/*.ts", "extensions/**/*.ts"],
}
```

**Critical:** the shipped `tsconfig.json` must NOT include `tests/**`. Shipped gate (`tsc --project berrygems/tsconfig.json`) stays pure; `tsc --project tsconfig.tests.json` becomes a second gate Phase 4 CI will wire. Verify by inspecting shipped `tsconfig.json` `include` / `exclude` during P02-01.

### `berrygems/package.json` script addition

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:smoke": "vitest run tests/smoke/install.test.ts"
  }
}
```

`test:smoke` is separate so the default test run stays fast. Phase 4 CI-02 runs `pnpm --dir berrygems test:smoke`.

### Root `package.json` script addition

```json
{
  "scripts": {
    "lint:skills": "node --experimental-strip-types scripts/lint-skills.ts"
  }
}
```

---

## 3. Test directory scaffold (locked layout from SC #1)

Create exactly this shape at `berrygems/tests/`:

```
berrygems/tests/
├── helpers/       # createPiTestSession wrappers if D-02 spike surfaces a gap
├── fixtures/      # (reserved; may stay empty through v1.0)
├── lib/           # one <name>.test.ts per berrygems/lib/ module (12 files)
├── extensions/    # one <name>.test.ts per berrygems/extensions/ (17 files) + cross-extension.test.ts canary
└── smoke/         # install.test.ts calling verifySandboxInstall
```

**Grep gate (SC #5):** `rg 'from "\.\./\.\./?extensions/' berrygems/tests/**/*.test.ts` MUST return zero. Document this in every extension test's top-of-file comment so future-dot doesn't reach for a direct import.

---

## 4. Lib module inventory — 12 modules (HIGH)

Confirmed via `ls berrygems/lib/`:

| Module                     | External surface                   | D-07 bar                                                 |
| -------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `animated-image.ts`        | kitty terminal protocol emission   | pure construction; skip terminal stdout assertions       |
| `animated-image-player.ts` | timer-based playback, kitty stdout | state transitions testable; skip stdout emission         |
| `compaction-templates.ts`  | pure template render               | full coverage                                            |
| `cooldown.ts`              | pure (timestamp math)              | full coverage                                            |
| `giphy-source.ts`          | HTTP fetch                         | pure URL-build + parse testable; skip live fetch         |
| `globals.ts`               | `globalThis`                       | full coverage; reference test per D-08                   |
| `id.ts`                    | pure ID gen                        | full coverage                                            |
| `lsp-client.ts`            | spawn + IPC                        | pure config + message-framing testable; skip spawn       |
| `panel-chrome.ts`          | terminal rendering                 | pure (border/padding math) testable                      |
| `pi-spawn.ts`              | `child_process`                    | pure arg composition testable; skip spawn                |
| `settings.ts`              | filesystem (JSON read)             | real fs via `os.tmpdir()` per rule; D-09 Zod wraps reads |
| `sse-client.ts`            | HTTP streaming                     | pure event-parse testable; skip network                  |

**D-07 block-comment template** (every lib test starts with this):

```typescript
/**
 * Unit tests for berrygems/lib/<name>.ts
 *
 * Coverage: pure logic + real-fs paths via os.tmpdir().
 * NOT covered here: <specific external-dep path>. Exercised indirectly via
 * TEST-03 extension integration tests that call this module through the real
 * pi-test-harness runtime. See 02-CONTEXT.md §D-07.
 */
```

---

## 5. Extension inventory — 17 extensions (HIGH)

Confirmed via `ls berrygems/extensions/`:

**Single-file (14):** `dragon-curfew.ts`, `dragon-digestion.ts`, `dragon-herald.ts`, `dragon-image-fetch.ts`, `dragon-inquiry.ts`, `dragon-lab.ts`, `dragon-loop.ts`, `dragon-musings.ts`, `dragon-parchment.ts`, `dragon-review.ts`, `dragon-scroll.ts`, `dragon-tongue.ts`, `kitty-gif-renderer.ts`, `kobold-housekeeping.ts`.

**Directory (3):** `dragon-breath/`, `dragon-guard/`, `dragon-websearch/`.

**SC-minimum bar per D-04, per extension:**

```typescript
import { describe, it, expect } from "vitest";
import { createTestSession } from "@marcfargas/pi-test-harness";
import { PANTRY_KEYS } from "../../lib/globals.ts";  // only for Symbol.for assertion

describe("extension: <name>", () => {
  it("loads via createTestSession without error", async () => {
    const session = await createTestSession({ extensions: ["<name>"] });
    expect(session).toBeDefined();
    await session.close?.();
  });

  it("registers expected tools", async () => {
    const session = await createTestSession({ extensions: ["<name>"] });
    const tools = session.tools ?? [];
    expect(tools.map(t => t.name)).toEqual(expect.arrayContaining([
      "<tool-1>", "<tool-2>", // from reading the extension's registerTool calls
    ]));
    await session.close?.();
  });

  // Only if extension claims a pantry.<name> publication:
  it("publishes pantry.<name> on globalThis", async () => {
    const session = await createTestSession({ extensions: ["<name>"] });
    const published = (globalThis as any)[PANTRY_KEYS.<name>];
    expect(published).toBeDefined();
    await session.close?.();
  });
});
```

**Publisher map (from Phase 1 PANTRY_KEYS ingestion — confirm against live `berrygems/lib/globals.ts` at plan-authoring time):** extensions that publish are the ones whose name appears as a key in `PANTRY_KEYS`. Non-publishers get just the first two test cases.

**Canary test (D-03, D-05):** `berrygems/tests/extensions/cross-extension.test.ts` — spin one `createTestSession` with two extensions where one publishes and the other consumes; assert the consumer reads the published API via `getGlobal`. Planner picks the pair from live publisher→consumer relationships (candidates: `dragon-parchment` + anything that renders into its panel; or `dragon-guard` + anything that reads its whitelist). This is the jiti-isolation canary per PITFALLS §2.

---

## 6. Spike exit criteria (D-02)

Dragon-guard is the research-flagged spike target. The spike plan (P02-03) commits green when:

1. `berrygems/tests/extensions/dragon-guard.test.ts` passes under `pnpm --dir berrygems test -- tests/extensions/dragon-guard`.
2. All tools `dragon-guard` registers (enumerate by reading `berrygems/extensions/dragon-guard/index.ts` `registerTool(...)` calls or its `AGENTS.md`) appear in the session's tool list.
3. Any `Symbol.for("pantry.guard")` publication is asserted (if dragon-guard publishes; otherwise note "does not publish" in the test's top-of-file comment).
4. If harness lacks coverage for `resources_discover`, `session_before_compact`, or context-event mutation: (a) wrap in `berrygems/tests/helpers/*.ts` — DO NOT hand-roll a second harness, per ROADMAP Research Flag; OR (b) document the gap in `02-03-SUMMARY.md` as "unasserted, revisit post-v1.0" and proceed.

**Exit signal:** `02-03-SUMMARY.md` documents the final shape of the test and any helpers created, so the fanout plan (P02-04) can imitate.

---

## 7. TEST-04 lint-skills script (HIGH)

### `scripts/lib/frontmatter.ts` — Zod schema (new file)

```typescript
import { z } from "zod";

export const SkillFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1).max(1024),
    license: z.literal("MIT"),
    compatibility: z
      .object({
        // shape derived from sampling one live SKILL.md during plan authoring
        // examples: models?: string[], runtimes?: string[], pi?: string
      })
      .passthrough()
      .optional(),
  })
  .passthrough(); // tolerate unknown extra fields; REQUIREMENTS lists only the required ones

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
```

**Before finalizing the `compatibility` shape,** the plan reads one or two live `SKILL.md` files and matches the structure present there — don't invent. Whichever keys are in use across `morsels/skills/*/SKILL.md` become the typed fields; the rest pass through.

### `scripts/lint-skills.ts` — walker (new file)

```typescript
#!/usr/bin/env node
// Run via: node --experimental-strip-types scripts/lint-skills.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { SkillFrontmatterSchema } from "./lib/frontmatter.ts";
// Per D-14, prefer dynamic import of berrygems/lib/globals.ts:
import { PANTRY_KEYS } from "../berrygems/lib/globals.ts";

const MORSELS_ROOT = "morsels/skills";
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const HOARD_SYMBOL_RE = /Symbol\.for\(["']hoard\.[^"']+["']\)/g;
const PANTRY_SYMBOL_RE = /Symbol\.for\(["']pantry\.([^"']+)["']\)/g;

const validPantryKeys = new Set(Object.keys(PANTRY_KEYS));
let totalViolations = 0;
const failedSkills: string[] = [];

for (const dir of readdirSync(MORSELS_ROOT)) {
  const skillPath = join(MORSELS_ROOT, dir, "SKILL.md");
  // ... read, split frontmatter, parse YAML, run Zod safeParse, scan body regexes ...
  // per-skill diagnostics block, count violations per skill, push to failedSkills
}

if (totalViolations > 0) {
  console.error(`✗ ${failedSkills.length} skills failed (${totalViolations} violations): ${failedSkills.join(", ")}`);
  process.exit(1);
} else {
  console.log(`✓ lint-skills: all ${/* count */} skills passed`);
  process.exit(0);
}
```

**Failure modes to handle:**

- Missing `---\n...\n---\n` block → report "no frontmatter".
- YAML parse error → report with line number.
- Zod fail → report per-field failure messages (Zod's default formatting is good).
- Body regex hit for `hoard.*` → hard fail with file line.
- Body regex hit for `pantry.X` where `X ∉ validPantryKeys` → hard fail with the unknown key name.

**D-14 fallback:** if `--experimental-strip-types` chokes on the cross-tree import of `berrygems/lib/globals.ts`, swap to a regex scrape of that file (`const PANTRY_KEYS = {...}`) and extract key names by token. Plan notes both paths but defaults to dynamic import.

### `morsels/` corpus expectations

Phase 1 D-05 deleted `hoard-allies/` and `hoard-sending-stone/`. Surviving skill count is **56 − 2 = 54**. Confirm with `find morsels/skills -maxdepth 2 -name SKILL.md | wc -l` at plan-authoring time. Body scan should find zero `hoard.*` strings post-Phase 1.

---

## 8. Settings Zod layer (D-09..D-11)

### Shape (in `berrygems/lib/settings.ts`)

```typescript
import { z } from "zod";

// Enumerate current known keys by reading `rg 'readPantrySetting\(' berrygems/`
// during plan authoring and matching the string keys used.
const PantrySettingsSchema = z.object({
  // examples: "pantry.guard.puppyAllowedTools": z.array(z.string()).optional(),
  //           "pantry.tone.preset": z.enum(["formal", "friendly", "minimal", "narrative", "personality"]).optional(),
  //           ...
}).passthrough();

// The wrapper runs safeParse + falls back to the current default on mismatch.
// Does NOT throw — a malformed settings.json must not brick pantry load.
export function readPantrySetting<T>(key: string, defaultValue: T): T {
  const raw = /* existing implementation reading ~/.pi/agent/settings.json */;
  const parsed = PantrySettingsSchema.safeParse(raw);
  if (!parsed.success) {
    // log Zod issues to a diagnostic channel (not console.log — per
    // ARCHITECTURE.md: diagnostic output flows through pi UI surfaces)
    return defaultValue;
  }
  // ...existing forward-path read...
}
```

**Scope bound per D-11:** zod layer applied only to the forward `pantry.*` branch. `dotsPiEnhancements.*` legacy fallback is NOT schema-validated. No new wrapper API, no migration tooling, no expansion — strictly one Zod `.safeParse` + log + fallback.

**Test:** `berrygems/tests/lib/settings.test.ts` exercises:

1. Reading a valid settings file in `os.tmpdir()` returns typed values.
2. A malformed settings file returns the default (doesn't throw).
3. Legacy `dotsPiEnhancements.*` fallback still works (regression guard).

---

## 9. Smoke test (D-16..D-18)

### `berrygems/tests/smoke/install.test.ts` (new)

```typescript
import { describe, it, expect } from "vitest";
import { verifySandboxInstall } from "@marcfargas/pi-test-harness";
import { resolve } from "node:path";

describe("install smoke", () => {
  it("installs via verifySandboxInstall and loads named extensions + skills", async () => {
    const packageDir = resolve(__dirname, "../../.."); // repo root
    const result = await verifySandboxInstall({ packageDir });

    // Named-not-count assertions (PITFALLS §5).
    expect(result.extensions.map((e: any) => e.name)).toEqual(
      expect.arrayContaining(["dragon-parchment", "dragon-guard"]),
    );
    expect(result.skills.map((s: any) => s.name)).toEqual(
      expect.arrayContaining(["git"]), // confirm live skill names before committing
    );
    // Secondary: count sanity (≥17 extensions, ≥54 skills post-Phase-1).
    expect(result.extensions.length).toBeGreaterThanOrEqual(17);
    expect(result.skills.length).toBeGreaterThanOrEqual(54);
  }, 60_000); // install is slow; 60s timeout
});
```

**Default exclusion from `vitest run`:** `berrygems/vitest.config.ts` `test.include` list omits `tests/smoke/**`. Run via `pnpm --dir berrygems test:smoke` or `vitest run tests/smoke/install.test.ts`.

**Phase 4 handoff:** CI-02 adds (a) `pnpm --dir berrygems test:smoke` as the harness-fast gate and (b) a shell step `HOME=$(mktemp -d) pi install $GITHUB_WORKSPACE && pi list` asserting the same names. Phase 2's file is verbatim-consumed.

---

## 10. Wave plan & parallelization (D-19, D-20)

```
Wave 1:  P02-01 (infra)
Wave 2:  P02-02 (lib + settings-Zod)  ║  P02-03 (dragon-guard spike)
Wave 3:  P02-04 (fanout + canary)     ║  P02-05 (lint-skills)
Wave 4:  P02-06 (smoke)
```

- Wave 2 parallelizes P02-02 and P02-03 (disjoint files — lib tests vs extension test).
- Wave 3 parallelizes P02-04 and P02-05 (extension tests vs scripts tree).
- P02-04 depends on P02-03 (inherits helpers + pattern). P02-06 depends on P02-04 (needs at least one known-loaded extension test proving the smoke's named assertions are real).
- `config.parallelization: true` is already set → executor can exploit waves.

**Commit scopes:** `test(02)` for test-writing plans, `chore(02)` for infra/devDeps, `feat(02)` for lint-skills + settings Zod wrappers. Per project convention (conventional commits), scope tag is phase number where sensible.

---

## 11. Known pitfalls to guard in plans (cross-ref)

Each plan should explicitly state which pitfalls it mitigates:

- **P02-01 (infra)** — §7 (tsc vs jiti): `tsconfig.tests.json` is separate so shipped `tsc` stays pure.
- **P02-02 (lib + settings)** — §4 (schema half-life): settings Zod schema documents required fields explicitly; §10 (scope creep): D-11 bounds wrapper scope to safeParse-and-fallback only.
- **P02-03 (spike)** — §2 (module-cache false greens): harness-only, no direct imports; §7 (jiti load): harness load is the test.
- **P02-04 (fanout)** — §2 reinforcement; §3 (PANTRY_KEYS drift): canary exercises `globalThis` round-trip.
- **P02-05 (lint-skills)** — §1 (hoard residue): body regex for `Symbol.for("hoard.*")`; §3 (pantry.\* drift): body regex against live `PANTRY_KEYS`; §4: strict Zod with max length.
- **P02-06 (smoke)** — §5 (named > count): `expect.arrayContaining(["dragon-parchment", ...])` not `.length === 17`.

---

## 12. Verification cheat sheet (SC-aligned)

| SC  | Verification command                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `pnpm --dir berrygems test` → exit 0; `ls berrygems/vitest.config.ts berrygems/tsconfig.tests.json berrygems/tests/{helpers,fixtures,lib,extensions,smoke}` → no errors. |
| 2   | `ls berrygems/lib/*.ts \| wc -l` == `ls berrygems/tests/lib/*.test.ts \| wc -l` (both = 12).                                                                             |
| 3   | `ls berrygems/extensions \| wc -l` == `ls berrygems/tests/extensions/*.test.ts \| wc -l` (both = 17) plus `berrygems/tests/extensions/cross-extension.test.ts` present.  |
| 4   | `node --experimental-strip-types scripts/lint-skills.ts` → exit 0; add a fixture with `Symbol.for("hoard.X")` in its body and confirm lint fails.                        |
| 5   | `rg 'from "\.\./\.\./?extensions/' berrygems/tests/**/*.test.ts` → 0 matches.                                                                                            |

---

_Research compiled: 2026-04-23_
_Sources: STACK.md, PITFALLS.md, FEATURES.md, CONCERNS.md, Phase 1 CONTEXT + verified filesystem inventory._
