# Phase 1: Amputation Cleanup & tsc-Green — Research

**Researched:** 2026-04-22
**Domain:** Post-amputation residue sweep, tsc fix, typed globalThis registry
**Confidence:** HIGH (all findings verified by direct file inspection on the live tree)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `berrygems/lib/globals.ts` exports `export const PANTRY_KEYS = { parchment: Symbol.for('pantry.parchment'), ... } as const`
- **D-02:** Same module exports `registerGlobal<T>(key: symbol, api: T): void` and `getGlobal<T>(key: symbol): T | undefined`
- **D-03:** Migrate all 16+ `(globalThis as any)[Symbol.for('pantry.*')]` call sites across `berrygems/extensions/` to the typed helper
- **D-04:** Delete the ally-mode branch in `dragon-guard/index.ts` (lines 188–219) and `initAllyMode`/`getAllyModeToolPolicy` state functions, plus matching AGENTS.md prose at line 13
- **D-05:** Delete `morsels/skills/hoard-allies/` and `morsels/skills/hoard-sending-stone/` outright
- **D-06:** Delete `.claude/parity-map.json`
- **D-07:** Delete `.claude/hooks/stop-doc-sync.fish` and its registration in `.claude/settings.json`
- **D-08:** Path-rewrite `.claude/settings.json` hook paths from `/home/dot/Development/hoard/…` to `/home/dot/Development/pantry/…`; drop registrations whose hook files have been removed
- **D-09:** Full template rewrite of `AGENTS.override.md`
- **D-10:** Scrub hoard-flavor jsdoc in `berrygems/lib/panel-chrome.ts:127,289`
- **D-11:** Fix dangling attributions in `pi-spawn.ts:9` (rewrite or remove) and `dragon-digestion.ts:1938–1943` TODO (inline the detection or delete the TODO)
- **D-12:** Rewrite daemon-present-tense framing in `berrygems/AGENTS.md:16` and `morsels/AGENTS.md:13`; fix wrong `cd` path in `berrygems/AGENTS.md:70`

### Claude's Discretion

- Commit granularity / ordering (default: AMP-04 first, then one commit per AMP-XX)
- Whether to also export `type PantryKey` / `type PantryKeyValue` type aliases
- `pi-spawn.ts:9` rewrite vs. removal
- `dragon-digestion.ts:1938–1943` TODO inline vs. delete-with-note

### Deferred Ideas (OUT OF SCOPE)

- `den/features/` reorganization
- `ETHICS.md` identity pass
- Full `AGENTS.md` post-amputation rewrite (Phase 3 DOCS-01)
- Richer typed registry module (version negotiation, lifecycle, introspection)
- Settings schema validation (Zod layer over `readPantrySetting`)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                                | Research Support                                                                                       |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AMP-01 | Remove all amputation-husk directories                                     | §Husk Directory Inventory confirms all five exist on disk                                              |
| AMP-02 | Remove all stale `/home/dot/Development/hoard/` path references            | §.claude/ Audit gives exact file:line for all 4 hook paths + 2 agents + 1 skill                        |
| AMP-03 | Remove stale `Symbol.for("hoard.*")` references from morsels and berrygems | §Hoard-Symbol Residue Inventory gives all 3 morsel sites + all dragon-guard + dragon-digestion fallout |
| AMP-04 | `tsc --project berrygems/tsconfig.json` returns zero errors                | §AMP-04: Import-Path Bug confirms one-line fix at dragon-breath/index.ts:20                            |
| AMP-05 | Centralize cross-extension symbol keys in `berrygems/lib/globals.ts`       | §PANTRY_KEYS Inventory gives all 5 keys + all 22 call-site lines                                       |

</phase_requirements>

---

## Summary

Phase 1 is a sweep-and-fix operation on a codebase that is already well-understood: all residue sites are enumerable by grep, the one tsc error is a single-character path fix, and the `PANTRY_KEYS` module is a straightforward new file with 22 call-site migrations. There are no unknown external dependencies and no research-blocking ambiguities.

The research focus was precise enumeration rather than design investigation — the locked decisions (D-01..D-13) already specify the what; this document provides the exact where (file:line) the planner needs to produce unambiguous task actions.

**Key correction vs. CONTEXT.md assumptions:** The `CONCERNS.md` draft referred to `HOARD_GUARD_MODE` / `HOARD_ALLY_TOOLS` as the ally-mode env vars. The live tree shows these were already renamed to `PANTRY_GUARD_MODE` / `PANTRY_ALLY_TOOLS` in the amputation commit. The D-04 deletion target is still the same block (lines 188–219 of `dragon-guard/index.ts`), but the env var names in the code are already `PANTRY_*`, not `HOARD_*`. The `initAllyMode`/`getAllyModeToolPolicy` functions in `state.ts` (lines 55–73) must also be deleted or the index.ts callers will fail tsc.

**Primary recommendation:** Fix AMP-04 first (one-line edit, unblocks the tsc gate), then execute AMP-01, AMP-02, AMP-03, AMP-05 as separate atomic commits. Every commit after AMP-04 can be verified with `tsc --project berrygems/tsconfig.json`.

---

## Architectural Responsibility Map

| Capability                                         | Primary Tier                                        | Secondary Tier                             | Rationale                                                          |
| -------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Husk directory deletion (AMP-01)                   | Filesystem/shell                                    | —                                          | Pure `rm -rf`; no code involved                                    |
| Path sweep (.claude/, AGENTS.override.md) (AMP-02) | Config/docs                                         | —                                          | File edits in non-TypeScript config; tsc-invisible                 |
| Hoard-API residue removal (AMP-03)                 | morsels (Markdown) + berrygems/lib + extension code | dragon-guard state.ts                      | Morsel deletions are filesystem; code changes are in TS extensions |
| tsc fix (AMP-04)                                   | berrygems extension (dragon-breath/index.ts:20)     | —                                          | Single relative-import path correction                             |
| PANTRY_KEYS module (AMP-05)                        | berrygems/lib (new `globals.ts`)                    | All 9 extensions that use globalThis slots | New shared lib module; consumer call-site migrations in extensions |

---

## Standard Stack

No new libraries required for Phase 1. All work is file edits and deletions in the existing TypeScript codebase.

**Invocation pattern (verified):** `tsc --project berrygems/tsconfig.json` — run from `/home/dot/Development/pantry` (not `cd berrygems/`). [VERIFIED: live tree]

**pnpm invocation** (if needed for any pnpm-backed task): `pnpm --dir berrygems <cmd>` [VERIFIED: CONTEXT.md]

---

## Residue Site Inventories

### AMP-01: Husk Directories

All five exist on disk and are confirmed untracked (git-rm removed their tracked content). [VERIFIED: `ls` on live tree]

| Path                                 | Contents on Disk                                            | Size (approx) |
| ------------------------------------ | ----------------------------------------------------------- | ------------- |
| `storybook-daemon/`                  | `internal/`, `.claude/rules/go.md`, stray `.pi/agents/*.md` | 180 KB        |
| `psi/`                               | `build/` (Qt/QML build artifacts — gitignored)              | 33 MB         |
| `allies-parity/`                     | `runner/node_modules/` (full npm install)                   | 38 MB         |
| `dragon-cubed/`                      | `.pi/todos/dragon-cubed.md` stub only                       | 16 KB         |
| `berrygems/extensions/hoard-allies/` | `.claude/rules/typescript.md` only                          | 16 KB         |

**Deletion command (fish):**

```fish
rm -rf storybook-daemon psi allies-parity dragon-cubed berrygems/extensions/hoard-allies
```

**Success criterion 1 verification:**

```fish
ls storybook-daemon psi allies-parity dragon-cubed berrygems/extensions/hoard-allies 2>&1 | grep -c 'No such file'
# expect: 5
```

---

### AMP-02: Stale `/home/dot/Development/hoard/` Path References

**`.claude/settings.json`** — 4 hook path references: [VERIFIED: file inspection]

| Line | Hook type                | Stale path                                                              | Hook file still exists in pantry?                                               |
| ---- | ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 9    | PreToolUse (Edit\|Write) | `fish /home/dot/Development/hoard/.claude/hooks/pre-block-gosum.fish`   | YES — file exists at `.claude/hooks/pre-block-gosum.fish`                       |
| 19   | Stop                     | `fish /home/dot/Development/hoard/.claude/hooks/stop-phase-gate.fish`   | YES — file exists (references `dragon-forge` which is amputated; still runs ok) |
| 23   | Stop                     | `fish /home/dot/Development/hoard/.claude/hooks/stop-parity-check.fish` | YES — file exists (references `cc-plugin/` which is amputated)                  |
| 27   | Stop                     | `fish /home/dot/Development/hoard/.claude/hooks/stop-doc-sync.fish`     | YES — file exists BUT D-07 deletes it                                           |

**Post-D-07 and post-D-08 state of `.claude/settings.json`:**

After applying D-07 (delete `stop-doc-sync.fish`) and D-08 (path rewrite + drop orphaned registrations):

- Drop the `stop-doc-sync.fish` Stop registration entirely.
- Drop the `stop-parity-check.fish` Stop registration (its logic reads `cc-plugin/` which is amputated — it cannot produce useful output; keeping it with a path fix still leaves dead logic running every Stop).
- Drop the `stop-phase-gate.fish` Stop registration (its logic checks `dragon-forge/` phase artifacts which are amputated; warning is vacuously empty every session).
- Fix `pre-block-gosum.fish` path to `/home/dot/Development/pantry/.claude/hooks/pre-block-gosum.fish` — the hook body has no Go files to protect in pantry (no `.go` files exist), but the hook is harmless (it only blocks `go.sum` edits, will never fire) and retaining it is lower risk than deleting a PreToolUse safety hook.

**Recommendation for planner:** After D-07 and path correction, the Stop hooks array should be empty (all three Stop hooks reference amputated subsystems). The PreToolUse hook survives with a path fix. Result: a minimal, non-broken `settings.json`.

**`.claude/agents/soul-reviewer.md`** — ENTIRE FILE deleted (D-06 cascade) [VERIFIED: file inspection]

- Line 13,25: references `hoard daemon`, reads `/home/dot/Development/hoard/ETHICS.md`
- References `mcp__storybook-ember__*` tools (amputated MCP server)

**`.claude/skills/hoard-verify/SKILL.md`** — ENTIRE DIRECTORY deleted (D-06 cascade) [VERIFIED: file inspection]

- Invokes `cd /home/dot/Development/hoard/storybook-daemon` and `qmllint /home/dot/Development/hoard/psi/qml/…`
- Both targets are amputated

**`AGENTS.override.md`** — full template rewrite (D-09) [VERIFIED: file inspection]

- Line 7: `storybook-ember MCP: :9432`
- Line 8: `storybook-maren MCP: :9433`
- Line 9: `stone HTTP bus: :9431`
- Line 21: GPU notes for `dragon-forge`, Minecraft address for `dragon-cubed`

**Success criterion 2 verification (after all AMP-02 work):**

```fish
rg '/home/dot/Development/hoard/' .claude AGENTS.override.md
# expect: zero matches
test ! -e .claude/agents/soul-reviewer.md; and echo "OK soul-reviewer gone"
test ! -e .claude/skills/hoard-verify; and echo "OK hoard-verify gone"
```

---

### AMP-03: Hoard-API Residue in Shipped Code

#### Symbol.for("hoard.\*") — morsels [VERIFIED: `rg` on live tree]

All three matches are inside the two directories D-05 deletes. No morsel outside those directories contains `Symbol.for("hoard.*")`.

| File                                          | Line | Content                                               |
| --------------------------------------------- | ---- | ----------------------------------------------------- |
| `morsels/skills/hoard-sending-stone/SKILL.md` | 17   | `Symbol.for("hoard.stone")` — consumer example        |
| `morsels/skills/hoard-sending-stone/SKILL.md` | 123  | `Symbol.for("hoard.stone")` — second example          |
| `morsels/skills/hoard-allies/SKILL.md`        | 295  | `Symbol.for("hoard.allies")` — documented API surface |

**Resolution:** D-05 deletes both directories wholesale. No per-line edits needed.

#### HOARD\_\* env var references — morsels [VERIFIED: `rg` on live tree]

| File                                          | Lines   | Content                                  |
| --------------------------------------------- | ------- | ---------------------------------------- |
| `morsels/skills/hoard-sending-stone/SKILL.md` | 203–204 | `HOARD_STONE_PORT`, `HOARD_ALLY_DEFNAME` |

**Resolution:** Eliminated by D-05 deletion.

#### Dragon-guard ally-mode block (D-04) [VERIFIED: live `dragon-guard/index.ts`]

**Critical correction:** `CONCERNS.md` listed `HOARD_GUARD_MODE` / `HOARD_ALLY_TOOLS`. The live code uses `PANTRY_GUARD_MODE` / `PANTRY_ALLY_TOOLS` (already renamed in the amputation commit). The deletion target is the same block, the env var names just happen to already be correct.

**`dragon-guard/index.ts` block to delete (lines 188–219):**

```
  // ── Ally Mode: quest-dispatched allies get locked tool whitelist ──
  const guardModeEnv = process.env.PANTRY_GUARD_MODE;
  const allyToolsEnv = process.env.PANTRY_ALLY_TOOLS;

  if (guardModeEnv === "ally" && allyToolsEnv) {
    initAllyMode(allyToolsEnv.split(","));
    // ... (full if block through the closing `return;`)
  }

  // ── Legacy subagent bail-out (non-hoard subagents) ──   ← line 220, also delete per D-04
```

**`dragon-guard/state.ts` — also delete:** The `initAllyMode` and `getAllyModeToolPolicy` functions (lines 55–73 in state.ts) and the `_allyToolWhitelist` module-level variable (line 35) are only called from the block above. After deleting the index.ts block, these become dead exports. Delete them and their `isAllyMode()` helper (line 60). Also remove `"ally"` from the `GuardMode` type and the `MODE_LABEL` map. [VERIFIED: state.ts inspection]

**`dragon-guard/state.ts` — imports in index.ts:** `initAllyMode` and `getAllyModeToolPolicy` are imported at line 37. The import line must be updated to remove those names.

**`dragon-guard/AGENTS.md` — line 13:** Delete or rewrite the Ally Mode bullet ("Quest-dispatched allies only. Tool whitelist set by hoard-allies at spawn time via env vars..."). [VERIFIED: file inspection — only one hoard reference in this file]

Note: CONCERNS.md mentioned hoard references at lines 104 and 161 of dragon-guard/AGENTS.md. Verification shows these do NOT exist in the live file (172 lines total, only line 13 contains "hoard"). The CONCERNS.md was written when the file had different content.

#### Hoard-flavor comments in berrygems code (D-10, D-11, D-12) [VERIFIED: live files]

| File                                         | Line      | Current text                                                                                                                               | Action                                                                             |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `berrygems/lib/panel-chrome.ts`              | 127       | `/** Dots and sparkles. Whimsical hoard vibes. */`                                                                                         | Replace "hoard vibes" → "vibes"                                                    |
| `berrygems/lib/panel-chrome.ts`              | 289       | `/** Ice crystal edges. Frozen hoard aesthetic. ❈ */`                                                                                      | Replace "hoard aesthetic" → "aesthetic"                                            |
| `berrygems/lib/pi-spawn.ts`                  | 9         | `Extracted from berrygems/extensions/hoard-allies/spawn.ts for use across…`                                                                | Remove line or rewrite attribution                                                 |
| `berrygems/extensions/dragon-digestion.ts`   | 1938–1943 | `Blocked until hoard-lab extension can detect auth type…`                                                                                  | Delete block or replace with inline note; the blocker is amputated                 |
| `berrygems/extensions/dragon-guard/index.ts` | 220       | `// ── Legacy subagent bail-out (non-hoard subagents) ──`                                                                                  | Deleted as part of D-04 ally-mode block                                            |
| `berrygems/AGENTS.md`                        | 16        | `storybook-daemon is the persistent core — mind, soul, connectors. berrygems tools are what the daemon uses when inhabiting a pi session.` | Rewrite to post-amputation framing                                                 |
| `berrygems/AGENTS.md`                        | 70        | `cd /home/dot/Development/hoard && tsc --project berrygems/tsconfig.json`                                                                  | Fix path to `cd /home/dot/Development/pantry` (or remove cd — root is already cwd) |
| `morsels/AGENTS.md`                          | 13        | `storybook-daemon is the persistent core. Morsels are portable knowledge any body can consume…`                                            | Rewrite to post-amputation framing                                                 |

**Note on dragon-digestion.ts:1938–1943:** The comment block is a multi-line JSDoc comment starting with `Anthropic beta feature needed for context_management API`. The hoard-lab reference is inside it. The simplest correct action is to delete the entire commented-out block (lines 1938–1949, including the disabled `const ANTHROPIC_CONTEXT_MGMT_BETA`), since the API it references is blocked and the workaround is undefined. The blocked feature remains blocked but without the stale reference. If the planner prefers to inline the TODO, the auth-type detection logic would need new research — recommend deletion instead.

**Success criterion 3 verification:**

```fish
rg 'Symbol\.for\("hoard\.' morsels berrygems
# expect: zero matches
```

---

### AMP-04: Dragon-Breath Import-Path Bug

[VERIFIED: `tsc` run on live tree confirms exactly this error]

**Current state:**

- File: `berrygems/extensions/dragon-breath/index.ts`
- Line 20: `import { readPantrySetting, readPantryKey } from "../lib/settings.ts";`
- Error: `TS2307: Cannot find module '../lib/settings.ts'`

**Root cause:** `dragon-breath/` is a directory extension (`extensions/dragon-breath/index.ts`). Its imports must go two levels up to reach `lib/` (`../../lib/`), not one (`../lib/`). The working examples are `dragon-guard/index.ts:3` and `dragon-websearch/index.ts:3` which both use `../../lib/settings`.

**One-line fix:**

```
Line 20, before: import { readPantrySetting, readPantryKey } from "../lib/settings.ts";
Line 20, after:  import { readPantrySetting, readPantryKey } from "../../lib/settings.ts";
```

**No other `../lib/` mistakes exist in dragon-breath:** grep confirms `../lib/` appears exactly once (line 20). All other imports in dragon-breath are from `@mariozechner/*` packages. [VERIFIED: grep count = 1]

**Post-fix verification:**

```fish
tsc --project berrygems/tsconfig.json
# expect: no output, exit 0
```

---

### AMP-05: PANTRY_KEYS — Complete Call-Site Inventory

#### Five canonical keys (all publishers verified on live tree)

| Key name (JS property) | Symbol string         | Publisher file                      | Publisher line |
| ---------------------- | --------------------- | ----------------------------------- | -------------- |
| `parchment`            | `"pantry.parchment"`  | `extensions/dragon-parchment.ts`    | 220            |
| `kitty`                | `"pantry.kitty"`      | `extensions/kitty-gif-renderer.ts`  | 94             |
| `breath`               | `"pantry.breath"`     | `extensions/dragon-breath/index.ts` | 480            |
| `imageFetch`           | `"pantry.imageFetch"` | `extensions/dragon-image-fetch.ts`  | 50             |
| `lab`                  | `"pantry.lab"`        | `extensions/dragon-lab.ts`          | 67             |

No other `Symbol.for("pantry.*")` strings exist in the extensions tree. [VERIFIED: grep]

#### `globals.ts` module shape (D-01, D-02):

```typescript
// berrygems/lib/globals.ts
export const PANTRY_KEYS = {
  parchment: Symbol.for("pantry.parchment"),
  kitty: Symbol.for("pantry.kitty"),
  breath: Symbol.for("pantry.breath"),
  imageFetch: Symbol.for("pantry.imageFetch"),
  lab: Symbol.for("pantry.lab"),
} as const;

// Typed registry helpers — eliminates (globalThis as any) at every call site
export function registerGlobal<T>(key: symbol, api: T): void {
  (globalThis as unknown as Record<symbol, T>)[key] = api;
}

export function getGlobal<T>(key: symbol): T | undefined {
  return (globalThis as unknown as Record<symbol, T | undefined>)[key];
}
```

**Phase 2 integration note:** For TEST-04's morsel-body lint to consume the key allow-list, either `Object.keys(PANTRY_KEYS)` or a sibling `export const PANTRY_KEY_NAMES = Object.keys(PANTRY_KEYS) as (keyof typeof PANTRY_KEYS)[]` works. The planner should pick whichever the lint script's import is cleaner for — both are equivalent at runtime.

**`no any` compliance:** Using `as unknown as Record<symbol, T>` instead of `as any` satisfies the `no any` policy from `berrygems/AGENTS.md`. This is the correct pattern here. [CITED: berrygems/AGENTS.md:219]

#### Complete call-site migration table (D-03)

All 22 call sites verified on live tree. Grouped by file.

**PUBLISHER sites — replace `(globalThis as any)[Symbol.for("pantry.X")] = api` with `registerGlobal(PANTRY_KEYS.X, api)`:**

| File                     | Line | Current pattern                                                | Migration                                                                                       |
| ------------------------ | ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `dragon-parchment.ts`    | 1873 | `(globalThis as any)[API_KEY] = api`                           | `registerGlobal(PANTRY_KEYS.parchment, api)` (API_KEY const → remove, use PANTRY_KEYS directly) |
| `kitty-gif-renderer.ts`  | 182  | `(globalThis as any)[API_KEY] = api`                           | `registerGlobal(PANTRY_KEYS.kitty, api)`                                                        |
| `kitty-gif-renderer.ts`  | 188  | `(globalThis as any)[API_KEY] = api`                           | `registerGlobal(PANTRY_KEYS.kitty, api)`                                                        |
| `dragon-image-fetch.ts`  | 458  | `(globalThis as any)[API_KEY] = api`                           | `registerGlobal(PANTRY_KEYS.imageFetch, api)`                                                   |
| `dragon-lab.ts`          | 86   | `(globalThis as any)[LAB_KEY] = api`                           | `registerGlobal(PANTRY_KEYS.lab, api)`                                                          |
| `dragon-breath/index.ts` | 480  | `(globalThis as any)[Symbol.for("pantry.breath")] = api`       | `registerGlobal(PANTRY_KEYS.breath, api)`                                                       |
| `dragon-breath/index.ts` | 486  | `(globalThis as any)[Symbol.for("pantry.breath")] = undefined` | `registerGlobal(PANTRY_KEYS.breath, undefined)`                                                 |

**CONSUMER sites — replace `(globalThis as any)[KEY]` with `getGlobal<T>(PANTRY_KEYS.X)`:**

| File                     | Line | Current pattern                                                    | Migration                                          |
| ------------------------ | ---- | ------------------------------------------------------------------ | -------------------------------------------------- |
| `dragon-digestion.ts`    | 48   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `dragon-digestion.ts`    | 2629 | `(globalThis as any)[Symbol.for("pantry.lab")] as ...DragonLabAPI` | `getGlobal<DragonLabAPI>(PANTRY_KEYS.lab)`         |
| `dragon-guard/index.ts`  | 59   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `dragon-guard/panel.ts`  | 54   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `dragon-inquiry.ts`      | 91   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `dragon-scroll.ts`       | 43   | `(globalThis as any)[KITTY_KEY]`                                   | `getGlobal<KittyAPI>(PANTRY_KEYS.kitty)`           |
| `dragon-scroll.ts`       | 49   | `(globalThis as any)[IMAGE_FETCH_KEY]`                             | `getGlobal<ImageFetchAPI>(PANTRY_KEYS.imageFetch)` |
| `dragon-scroll.ts`       | 53   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `dragon-tongue.ts`       | 41   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |
| `kobold-housekeeping.ts` | 36   | `(globalThis as any)[PANELS_KEY]`                                  | `getGlobal<ParchmentAPI>(PANTRY_KEYS.parchment)`   |

**COMMENT/JSDoc sites (no runtime impact, but must be updated for consistency):**

| File                    | Line | Current text                                                                         | Action                                          |
| ----------------------- | ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `dragon-digestion.ts`   | 114  | `// Check: (globalThis as any)[Symbol.for("pantry.lab")]?.isActive(...)`             | Update comment to reference `getGlobal` pattern |
| `dragon-image-fetch.ts` | 10   | `const imageFetch = (globalThis as any)[Symbol.for("pantry.imageFetch")]` — in JSDoc | Update JSDoc example to show `getGlobal` usage  |
| `dragon-parchment.ts`   | 12   | `const panels = (globalThis as any)[Symbol.for("pantry.parchment")]` — in JSDoc      | Update JSDoc example                            |
| `kitty-gif-renderer.ts` | 9    | `const kitty = (globalThis as any)[Symbol.for("pantry.kitty")]` — in JSDoc           | Update JSDoc example                            |

**Local const cleanup:** After migration, these file-local consts become redundant and should be removed:

- `dragon-parchment.ts:220` — `const API_KEY = Symbol.for("pantry.parchment")`
- `kitty-gif-renderer.ts:94` — `const API_KEY = Symbol.for("pantry.kitty")`
- `dragon-image-fetch.ts:50` — `const API_KEY = Symbol.for("pantry.imageFetch")`
- `dragon-lab.ts:67` — `const LAB_KEY = Symbol.for("pantry.lab")`
- `dragon-digestion.ts:46` — `const PANELS_KEY = Symbol.for("pantry.parchment")`
- `dragon-guard/index.ts:57` — `const PANELS_KEY = Symbol.for("pantry.parchment")`
- `dragon-guard/panel.ts:52` — `const PANELS_KEY = Symbol.for("pantry.parchment")`
- `dragon-inquiry.ts:89` — `const PANELS_KEY = Symbol.for("pantry.parchment")`
- `dragon-scroll.ts:38` — `const PANELS_KEY` / `:39 KITTY_KEY` / `:45 IMAGE_FETCH_KEY`
- `dragon-tongue.ts:39` — `const PANELS_KEY`
- `kobold-housekeeping.ts:34` — `const PANELS_KEY`

tsc's `noUnusedLocals` will flag these if not removed after the migration. The migration is not complete until tsc is clean.

**Import statement to add in each migrated file:**

```typescript
import { PANTRY_KEYS, getGlobal, registerGlobal } from "../../lib/globals.ts";
// (adjust path depth: ../../lib for single-file extensions, ../../lib for guard/panel.ts)
```

Path correction: single-file extensions in `berrygems/extensions/` import from `../lib/globals.ts`. Directory-extension files (`dragon-guard/index.ts`, `dragon-guard/panel.ts`) import from `../../lib/globals.ts`. [VERIFIED: confirmed against existing `settings.ts` import patterns]

**AMP-05 success criterion verification:**

```fish
# Criterion 4: module exists with PANTRY_KEYS
test -f berrygems/lib/globals.ts; and echo "globals.ts present"

# Criterion 3 (overlap): no raw Symbol.for("pantry.*") in extension code
rg 'globalThis as any' berrygems/extensions
# expect: zero matches

# Criterion 5: tsc green
tsc --project berrygems/tsconfig.json
# expect: exit 0
```

---

## Architecture Patterns

### Pattern: Typed globalThis Registry

The `getGlobal<T>` / `registerGlobal<T>` pattern uses a cast through `unknown` (not `any`) to satisfy the `no any` policy while preserving the runtime semantics:

```typescript
// Source: derived from berrygems/AGENTS.md§Inter-Extension Communication + no-any policy
export function getGlobal<T>(key: symbol): T | undefined {
  return (globalThis as unknown as Record<symbol, T | undefined>)[key];
}
```

This is a minimal typed wrapper — the `Record<symbol, T>` cast is still unsound at runtime (you can store any type under any key), but tsc enforces the call-site generic correctly and no `any` appears in the module.

### Pattern: Directory Extension Import Depth

```
berrygems/extensions/single-file.ts     → ../lib/module.ts
berrygems/extensions/dir-ext/index.ts  → ../../lib/module.ts
berrygems/extensions/dir-ext/panel.ts  → ../../lib/module.ts
```

[VERIFIED: `dragon-guard/index.ts:3`, `dragon-guard/settings.ts:13`, `dragon-guard/panel.ts:19` all use `../../lib/`]

---

## Don't Hand-Roll

| Problem                          | Don't Build                                | Use Instead                                          | Why                                                                                                       |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Type-safe globalThis slot access | Custom proxy, WeakMap                      | `getGlobal<T>` / `registerGlobal<T>` in `globals.ts` | Existing call sites have a consistent shape; typed wrapper adds safety without changing runtime semantics |
| Path correction script           | sed/awk one-liner                          | Direct `Edit` tool on each file                      | Only one import to fix; scripted approach adds risk of false positives                                    |
| Symbolic key introspection       | `Object.getOwnPropertySymbols(globalThis)` | `Object.keys(PANTRY_KEYS)`                           | Source-of-truth is the module, not runtime state                                                          |

---

## .claude/ Hook Disposition Table

Post D-07 + D-08, the final `.claude/settings.json` hook registrations:

| Hook file                | Action                                 | Reason                                                                                                    |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pre-block-gosum.fish`   | KEEP, fix path                         | No Go files in pantry, so it never fires, but it's harmless and removing it is riskier than keeping it    |
| `stop-phase-gate.fish`   | DROP registration                      | References `dragon-forge/` phase artifacts — entirely amputated, warning is vacuously empty every session |
| `stop-parity-check.fish` | DROP registration                      | Reads `cc-plugin/` and `parity-map.json` (D-06 deletes the map) — cannot produce valid output             |
| `stop-doc-sync.fish`     | DELETE file + DROP registration (D-07) | Logic hard-codes `hoard_prefixes`, `cc-plugin/agents/` — incoherent without amputated subsystems          |

The three Stop hook files (`stop-phase-gate.fish`, `stop-parity-check.fish`) are not deleted — they just lose their registration. Their file content is amputated-context-specific but does no harm sitting in `.claude/hooks/` unregistered.

---

## AGENTS.override.md Template Shape (D-09)

The current file has 20 lines with 4 stale section headers (storybook-ember MCP, stone HTTP bus, dragon-forge GPU, dragon-cubed Minecraft). The post-amputation replacement should preserve the useful structural intent while referencing only live pantry concerns.

**Recommended pantry-shaped sections:**

```markdown
# AGENTS.override.md

Local development overrides — gitignored, never committed.

## Local Pi Path

If running pi from local source rather than the installed npm package, note the
path here so commands in skills can be adjusted.

## Machine-Specific Notes

Add anything about this dev environment that affects agent behavior:

- Custom pantry.\* settings active locally (dev overrides, experimental flags)
- Non-standard pi installation paths
- Any external tools the berrygems depend on (e.g., if testing GIF rendering)
```

Drop: storybook-ember MCP, storybook-maren MCP, stone HTTP bus, Local Ports section (no services run from pantry), GPU/Minecraft notes.

---

## Common Pitfalls

### Pitfall 1: Deleting ally-mode block without cleaning state.ts

**What goes wrong:** After deleting lines 188–219 in `dragon-guard/index.ts`, tsc reports unused imports (`initAllyMode`, `getAllyModeToolPolicy` from `state.ts`) and `state.ts` still exports unused functions.

**Why it happens:** D-04 in CONTEXT.md describes the index.ts block deletion; it doesn't explicitly call out the state.ts exports.

**How to avoid:** Delete `initAllyMode`, `getAllyModeToolPolicy`, `isAllyMode`, `_allyToolWhitelist`, the `"ally"` arm in `GuardMode` type, and the `"ally"` entry in `MODE_LABEL` from `state.ts`. Update the import line in `index.ts` to remove the deleted function names.

**Warning sign:** `tsc` reports "declared but its value is never read" on `initAllyMode` or `getAllyModeToolPolicy` after the index.ts edit.

### Pitfall 2: Removing local PANELS_KEY consts before adding PANTRY_KEYS import

**What goes wrong:** Removing `const PANELS_KEY = Symbol.for("pantry.parchment")` at the top of a file before adding the `globals.ts` import causes immediate tsc errors.

**How to avoid:** For each file, (1) add the import, (2) replace usages, (3) remove the local const — in that order.

### Pitfall 3: Wrong import depth for globals.ts in directory extensions

**What goes wrong:** `dragon-guard/panel.ts` imports `../../lib/globals.ts` — not `../lib/globals.ts`. Copying the wrong depth from a single-file extension causes a tsc TS2307 error identical to the AMP-04 bug.

**How to avoid:** Check the existing `settings.ts` import depth in each file before writing the `globals.ts` import.

### Pitfall 4: AMP-03 success criterion fires on pantry.\* morsel references

**What goes wrong:** `rg 'Symbol\.for\("hoard\.' morsels berrygems` (success criterion 3) is specifically scoped to `hoard.` strings. The surviving `Symbol.for("pantry.parchment")` references in `dragon-parchment/SKILL.md`, `kitty-gif-renderer/SKILL.md`, and `dragon-image-fetch/SKILL.md` do NOT match this criterion. They are correct and should NOT be migrated.

**How to avoid:** AMP-03 is `hoard.*` only. AMP-05 migrates `pantry.*` from TS code only — not from Markdown skills. Morsel skill bodies that document `Symbol.for("pantry.parchment")` for agents to consume are correct as-is.

### Pitfall 5: `tsc` run from wrong directory

**What goes wrong:** Running `tsc --project berrygems/tsconfig.json` from inside `berrygems/` produces path resolution failures.

**How to avoid:** Always run from `/home/dot/Development/pantry` (the repo root). The AGENTS.md verification command confirms this. After D-12 fixes `berrygems/AGENTS.md:70`, the documented command will show `tsc --project berrygems/tsconfig.json` without a `cd`. [VERIFIED: AGENTS.md:88]

---

## Verification Gate Commands (fish-compatible)

One command per success criterion, suitable for task `acceptance_criteria`:

```fish
# SC-1: All husk dirs gone
not ls storybook-daemon 2>/dev/null; and not ls psi 2>/dev/null; and not ls allies-parity 2>/dev/null; and not ls dragon-cubed 2>/dev/null; and not ls berrygems/extensions/hoard-allies 2>/dev/null; and echo "SC-1 PASS"

# SC-2: No hoard paths in .claude or AGENTS.override.md; soul-reviewer and hoard-verify deleted
rg '/home/dot/Development/hoard/' .claude AGENTS.override.md; and echo "SC-2 FAIL: residue found"; or echo "SC-2 PASS"
test ! -e .claude/agents/soul-reviewer.md; and test ! -e .claude/skills/hoard-verify; and echo "SC-2 agents/skills PASS"

# SC-3: No Symbol.for("hoard.*") in morsels or berrygems
rg 'Symbol\.for\("hoard\.' morsels berrygems; and echo "SC-3 FAIL: hoard symbols found"; or echo "SC-3 PASS"

# SC-4: globals.ts exists with PANTRY_KEYS; no raw (globalThis as any) in extensions
test -f berrygems/lib/globals.ts; and echo "globals.ts present"
grep -q 'PANTRY_KEYS' berrygems/lib/globals.ts; and echo "PANTRY_KEYS exported"
rg 'globalThis as any' berrygems/extensions; and echo "SC-4 FAIL: raw casts remain"; or echo "SC-4 PASS"

# SC-5: tsc green
tsc --project berrygems/tsconfig.json; and echo "SC-5 PASS"
```

---

## Runtime State Inventory

This phase does not involve rename/migration of stored data, live services, or OS-registered state. The changes are all in-tree file edits and deletions.

| Category            | Items Found                                                                                                                                                      | Action Required                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Stored data         | None — no databases involved                                                                                                                                     | None                                                  |
| Live service config | None — `.claude/` hooks are local config, not external services                                                                                                  | Path rewrite in settings.json                         |
| OS-registered state | None                                                                                                                                                             | None                                                  |
| Secrets/env vars    | `PANTRY_GUARD_MODE`, `PANTRY_ALLY_TOOLS` — removing the ally-mode branch means these env vars no longer have any effect; code that sets them will silently no-op | No secret rotation needed; env vars just become inert |
| Build artifacts     | None — no compiled artifacts                                                                                                                                     | None                                                  |

---

## Environment Availability

| Dependency         | Required By                    | Available | Version                                         | Fallback                     |
| ------------------ | ------------------------------ | --------- | ----------------------------------------------- | ---------------------------- |
| `tsc` (TypeScript) | AMP-04 gate, AMP-05 gate       | ✓         | verified via `berrygems/node_modules/` symlinks | None — required              |
| `rg` (ripgrep)     | Success criterion verification | ✓         | system install                                  | `grep -r` (slower but works) |
| `pnpm`             | Any pnpm-invoked task          | ✓         | inferred from pnpm-lock.yaml presence           | None needed for this phase   |

---

## Assumptions Log

| #   | Claim                                                                                                                                                                    | Section                         | Risk if Wrong                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------- |
| A1  | `stop-phase-gate.fish` and `stop-parity-check.fish` should have their Stop registrations dropped (not just path-fixed) because their logic is amputated-context-specific | .claude/ Hook Disposition Table | Low — worst case is Stop hooks run but produce empty/harmless output; they never block    |
| A2  | `pre-block-gosum.fish` is worth keeping with a path fix despite pantry having no Go files                                                                                | .claude/ Hook Disposition Table | Very low — hook only fires on `go.sum` edits; pantry has no Go; effectively a no-op       |
| A3  | `dragon-digestion.ts:1938–1943` comment block should be deleted rather than worked around                                                                                | AMP-03 hoard-flavor table       | Low — the beta API it references remains blocked for a different reason; deletion is safe |

**All call sites, import paths, and file-line references above were verified by direct inspection of the live tree on 2026-04-22.**

---

## Open Questions

1. **`berrygems/AGENTS.md:230` lists `ally-taxonomy` as an available lib** (verified: NOT found in `berrygems/lib/` or `berrygems/AGENTS.md` on the live tree — CONCERNS.md's reference appears to have been pre-amputation state). No action needed for Phase 1; but the AGENTS.md `Available libs` list should be cross-checked during Phase 3 DOCS-01.

2. **`ParchmentAPI`, `KittyAPI`, `DragonLabAPI`, `ImageFetchAPI` type names for `getGlobal<T>` call sites.** The existing code uses inline `as import("./dragon-lab").DragonLabAPI` casts (e.g., `dragon-digestion.ts:2629`). The planner should decide: use the same inline import types, or re-export API types from `globals.ts` for cleaner consumer sites. Either is correct; this is discretionary.

---

## Sources

### Primary (HIGH confidence)

- Live codebase grep and file inspection, 2026-04-22
- `.planning/codebase/CONCERNS.md` — authoritative residue inventory (cross-checked against live tree; one correction: dragon-guard ally env vars are `PANTRY_*` not `HOARD_*` in the live code)
- `.planning/phases/01-amputation-cleanup-tsc-green/01-CONTEXT.md` — locked decisions D-01..D-13

### Secondary (MEDIUM confidence)

- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — orientation documents (not re-verified by grep but consistent with live tree observations)

---

## Metadata

**Confidence breakdown:**

- Residue site inventories: HIGH — every file:line verified by grep on live tree
- One-line tsc fix (AMP-04): HIGH — confirmed by running tsc; single match confirmed
- PANTRY_KEYS call-site count: HIGH — grep verified; 22 call sites enumerated
- Hook disposition: MEDIUM — stop-phase-gate and stop-parity-check disposition is a judgment call (A1, A2 in Assumptions Log)
- D-04 state.ts scope: HIGH — state.ts functions inspected directly

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable codebase; only invalidated by additional commits to berrygems)
