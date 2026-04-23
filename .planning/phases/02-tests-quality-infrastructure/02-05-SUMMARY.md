---
phase: 02-tests-quality-infrastructure
plan: 05
subsystem: testing
tags: [zod, yaml, linter, frontmatter, ci, skills, pantry-keys]

requires:
  - phase: 02-01
    provides: "root devDeps (yaml, zod) + lint:skills script wiring"
  - phase: 01-amputation
    provides: "berrygems/lib/globals.ts PANTRY_KEYS as const export"
provides:
  - "scripts/lib/frontmatter.ts — Zod SkillFrontmatterSchema (name/description/license/compatibility + passthrough)"
  - "scripts/lint-skills.ts — CLI walker for morsels/skills/*/SKILL.md, frontmatter + body-residue linter"
  - "Exit-code-based CI gate closing TEST-04 / ROADMAP §Phase 2 SC #4"
affects: [03-docs, 04-ci, docs-tooling]

tech-stack:
  added: [] # yaml + zod landed in 02-01
  patterns:
    - "Standalone Node scripts under scripts/ run via --experimental-strip-types"
    - "Schema modules are import-graph-minimal (only zod) so Phase 3 docs tooling can re-export"
    - "Dynamic cross-tree .ts import for live allowlist ingestion; regex fallback as a documented escape hatch"

key-files:
  created:
    - scripts/lib/frontmatter.ts
    - scripts/lint-skills.ts
  modified: []

key-decisions:
  - "compatibility shape = z.string().optional() — all 12 skills using the field ship free-form strings (dragon-guard, defuddle, git-auth, etc.). No structured object in live corpus; stricter union would be premature per PITFALLS §4."
  - "Dynamic import of berrygems/lib/globals.ts is the live PANTRY_KEYS ingestion path under Node v25.9.0 --experimental-strip-types; regex fallback is a dead branch in practice but retained for Node/strip-types regressions."
  - "No --fix, --json, or flag surface — exit-code-based CLI only (D-11 scope-creep stance)."
  - "Diagnostics on stderr, success line on stdout — CI can separate streams."

patterns-established:
  - "Per-skill grouped diagnostic block on stderr (D-15): blank line + header + bullet list, then a final summary tallying failed skills and total violations."
  - "Frontmatter regex tolerates \\r\\n for cross-platform authored files."
  - "Body-scan regexes reset lastIndex = 0 before each file (module-scope /g regex footgun guard)."

requirements-completed: [TEST-04]

duration: ~15min
completed: 2026-04-23
---

# Phase 02-05: lint-skills Summary

**Standalone Node linter for morsels/skills/\*/SKILL.md — Zod-validated frontmatter plus body scans for stale `Symbol.for("hoard.*")` residue and unregistered `Symbol.for("pantry.<X>")` references against the live PANTRY_KEYS allowlist.**

## Accomplishments

- `scripts/lib/frontmatter.ts` exports `SkillFrontmatterSchema` (Zod) and the inferred `SkillFrontmatter` type — re-exportable for Phase 3 docs tooling without pulling in fs/path.
- `scripts/lint-skills.ts` walks all 54 surviving skills, enforces schema + `name === directory`, and rejects both hoard-era residue and unknown pantry keys.
- `pnpm lint:skills` exits 0 cleanly on the current Phase-1-clean corpus; closes ROADMAP §Phase 2 SC #4.

## Task Commits

1. **Task 1: Confirm live frontmatter shape** — research only (no commit). Sampled 8 skills directly (git, typescript, dragon-guard, kotlin, extension-designer, defuddle, git-auth, skill-designer). 12 skills set `compatibility`, all free-form strings.
2. **Task 2: Author `scripts/lib/frontmatter.ts`** — `4fa6628` (feat)
3. **Task 3: Author `scripts/lint-skills.ts`** — `4026782` (feat)
4. **Task 4: Regression probe against fixture** — no commit (disposable `/tmp` fixture). Confirmed exit 1 + all three failure modes (hoard residue, unknown pantry key, frontmatter violation) in separate per-skill blocks; fixture deleted; real-corpus run returned to exit 0.

## Files Created/Modified

- `scripts/lib/frontmatter.ts` — Zod schema + type export (33 lines).
- `scripts/lint-skills.ts` — CLI walker with dynamic PANTRY_KEYS ingestion (177 lines).

## Compatibility Schema Decision

**Shape used:** `compatibility: z.string().optional()` on a `.passthrough()` root object.

**Evidence from Task 1 corpus sweep (12 skills, all string):**

- `dragon-guard`: `"Designed for Pi (pi-coding-agent)"`
- `git-auth`: `"Requires rbw (Bitwarden CLI) for passphrase automation"`
- `defuddle`: `"Designed for Pi (pi-coding-agent); Claude Code uses its own defuddle skill. Requires Defuddle CLI (npx defuddle or installed globally)."`
- `skill-designer`: `"Designed for Pi (pi-coding-agent); Claude Code uses skill-creator + superpowers:writing-skills instead."`
- `extension-designer`, `pi-events`, `pi-tui`, `kitty-gif-renderer`, `kobold-housekeeping`, `pi-sessions`, `dragon-parchment`: all `"Designed for Pi (pi-coding-agent)"` variants.

Zero structured objects in live corpus → no union. PITFALLS §4: do not pre-invent a shape.

## PANTRY_KEYS Ingestion Strategy

**Live path: dynamic import.** Confirmed working under Node v25.9.0 with `--experimental-strip-types`:

```
node --experimental-strip-types -e 'import("./berrygems/lib/globals.ts").then(m => console.log(Object.keys(m.PANTRY_KEYS)))'
# → [ 'parchment', 'kitty', 'breath', 'imageFetch', 'lab' ]
```

The regex fallback in `loadPantryKeys()` is a dead branch on this Node version but retained verbatim per plan — it is the D-14 (c) escape hatch for a future Node/strip-types regression. If the dynamic branch is ever observed falling into the fallback, re-open this as a follow-up.

## Body-Lint Coverage

- `HOARD_SYMBOL_RE = /Symbol\.for\(\s*["']hoard\.([^"']+)["']\s*\)/g` — any hoard-era symbol reference in skill body → violation (PITFALLS §1).
- `PANTRY_SYMBOL_RE = /Symbol\.for\(\s*["']pantry\.([^"']+)["']\s*\)/g` — any `pantry.<X>` where `<X> ∉ PANTRY_KEYS` → violation (PITFALLS §3). Centralized allowlist means renaming a key in `berrygems/lib/globals.ts` trips lint loudly.

## Linter Output on Clean Tree

```
$ node --experimental-strip-types scripts/lint-skills.ts
ok lint-skills: all 54 skills passed
# exit=0
```

Same via `pnpm lint:skills`. No skills required frontmatter fixes — the Phase-1 sweep left a clean corpus.

## Fixture Probe Outcome

Built a disposable fixture under `/tmp` (with copied `berrygems/lib/globals.ts` + symlinked node_modules) containing three crafted-bad skills:

- `bad-hoard`: body contains `Symbol.for("hoard.something")`
- `bad-pantry-key`: body contains `Symbol.for("pantry.notakey")`
- `bad-frontmatter`: frontmatter missing `license: MIT`

Result:

```
x bad-frontmatter:
    - frontmatter.license: Invalid input: expected "MIT"

x bad-hoard:
    - body contains stale Symbol.for("hoard.something") residue (pantry amputation complete — remove)

x bad-pantry-key:
    - body references unknown Symbol.for("pantry.notakey") — not a key of PANTRY_KEYS (known: breath, imageFetch, kitty, lab, parchment)

x lint-skills: 3 of 3 skills failed (3 violations): bad-frontmatter, bad-hoard, bad-pantry-key
# exit=1
```

All three failure modes caught, per-skill grouped diagnostics on stderr, exit code 1. Fixture deleted after the probe; committed linter has no fixture support and no flags.

## Schema ↔ morsels/AGENTS.md Drift

No drift surfaced during this plan — but explicit schema-vs-prose reconciliation is a Phase 3 docs responsibility (per 02-CONTEXT.md §Layer conventions). Phase 3 should check that `morsels/AGENTS.md`'s description of required frontmatter matches `SkillFrontmatterSchema` exactly.

## Decisions Made

- **compatibility = optional string, no union.** Data-backed from 12 live skills; union would be premature schema expansion per PITFALLS §4.
- **Dynamic import preferred, regex fallback retained.** Dynamic works on Node v25.9.0; the fallback is cheap insurance.
- **No flags on the CLI.** Exit codes only. `--fix` / `--json` would be scope creep (D-11 stance).
- **All diagnostics on stderr.** Single success line on stdout. CI streams cleanly separable.

## Deviations from Plan

None — plan executed exactly as written. The `<interfaces>` reference implementation was authored verbatim (with an ASCII "x" / "ok" status prefix in place of Unicode check/cross marks, since the interface block used literal `✗`/`✓` and the codebase convention has been plain-ASCII).

## Issues Encountered

- One cosmetic runtime warning: `[MODULE_TYPELESS_PACKAGE_JSON]` from Node when dynamic-importing `.ts` files without `"type": "module"` in the nearest `package.json`. Does not affect correctness; the linter still exits 0/1 as expected. Not worth fixing here — adding `"type": "module"` to root `package.json` is a cross-cutting decision for a later phase (would affect jiti loading in extensions).

## Next Phase Readiness

- Phase 3 (docs tooling) can `import { SkillFrontmatterSchema } from "../scripts/lib/frontmatter.ts"` to reuse the same contract.
- Phase 4 (CI) can wire `pnpm lint:skills` as a required check alongside `pnpm --dir berrygems test` and `tsc`.
- Self-check all green: both files exist, linter exits 0 on clean corpus, fixture proves non-zero path, `pnpm lint:skills` works, berrygems tests pass (30 files / 124 tests), `tsc --project berrygems/tsconfig.json` exits 0. **PASSED.**

---

_Phase: 02-tests-quality-infrastructure_
_Completed: 2026-04-23_
