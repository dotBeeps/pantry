---
phase: 02-tests-quality-infrastructure
plan: 04
status: complete
requirements: [TEST-03]
self_check: PASSED
---

# 02-04 Summary — extension fanout + cross-extension canary

## What was built

Fanned out the 02-03 dragon-guard spike pattern across the remaining 16
extensions, authoring one `berrygems/tests/extensions/<name>.test.ts` per
extension at the D-04 SC-minimum bar. Added a cross-extension canary that
exercises a real publisher → consumer `PANTRY_KEYS` round-trip through the
harness's jiti runtime.

## Key files created (17)

### Extension integration tests (16)

| File                                                     | Tools                                     | Commands           | Publishes                   |
| -------------------------------------------------------- | ----------------------------------------- | ------------------ | --------------------------- |
| `berrygems/tests/extensions/dragon-breath.test.ts`       | (none)                                    | carbon             | `breath`                    |
| `berrygems/tests/extensions/dragon-curfew.test.ts`       | (none)                                    | curfew             | N/A                         |
| `berrygems/tests/extensions/dragon-digestion.test.ts`    | dragon_digest                             | digestion          | N/A                         |
| `berrygems/tests/extensions/dragon-herald.test.ts`       | (none)                                    | (none)             | N/A                         |
| `berrygems/tests/extensions/dragon-image-fetch.test.ts`  | (none)                                    | (none)             | `imageFetch`                |
| `berrygems/tests/extensions/dragon-inquiry.test.ts`      | ask                                       | (none)             | N/A                         |
| `berrygems/tests/extensions/dragon-lab.test.ts`          | (none)                                    | (none)             | `lab`                       |
| `berrygems/tests/extensions/dragon-loop.test.ts`         | signal_loop_success                       | loop               | N/A                         |
| `berrygems/tests/extensions/dragon-musings.test.ts`      | (none)                                    | musings            | N/A                         |
| `berrygems/tests/extensions/dragon-parchment.test.ts`    | (none)                                    | panels             | `parchment`                 |
| `berrygems/tests/extensions/dragon-review.test.ts`       | (none)                                    | review, end-review | N/A                         |
| `berrygems/tests/extensions/dragon-scroll.test.ts`       | popup, close_popup                        | popup              | N/A                         |
| `berrygems/tests/extensions/dragon-tongue.test.ts`       | lint                                      | lint               | N/A (consumer of parchment) |
| `berrygems/tests/extensions/dragon-websearch.test.ts`    | web_search (via `pi.registerTool as any`) | (none)             | N/A                         |
| `berrygems/tests/extensions/kitty-gif-renderer.test.ts`  | (none)                                    | (none)             | `kitty`                     |
| `berrygems/tests/extensions/kobold-housekeeping.test.ts` | todo_panel                                | todos              | N/A                         |

### Canary (1)

- `berrygems/tests/extensions/cross-extension.test.ts` — one session, two
  extensions (dragon-parchment + dragon-tongue), asserts
  `getGlobal(PANTRY_KEYS.parchment)` returns defined after both extensions
  loaded, plus sanity check that both `panels` and `lint` commands are present.

## Publisher map confirmed (live code verification)

All five publisher sites verified against the planner's map; exact line numbers
match the live source:

| Key                 | Site                         |
| ------------------- | ---------------------------- |
| `pantry.parchment`  | `dragon-parchment.ts:1873`   |
| `pantry.kitty`      | `kitty-gif-renderer.ts:181`  |
| `pantry.breath`     | `dragon-breath/index.ts:481` |
| `pantry.imageFetch` | `dragon-image-fetch.ts:457`  |
| `pantry.lab`        | `dragon-lab.ts:85`           |

## Canary pair + result

**Pair:** dragon-parchment (publisher) + dragon-tongue (consumer).

Verified dragon-tongue actually consumes parchment:
`rg -n 'getGlobal\(PANTRY_KEYS' berrygems/extensions/dragon-tongue.ts` returned
`42:  return getGlobal(PANTRY_KEYS.parchment);` — pair is valid.

**Result:** canary passes. After `createTestSession({ extensions: [parchment,
tongue] })`, `getGlobal(PANTRY_KEYS.parchment)` resolves to a defined value in
the same jiti context dragon-tongue sees. The jiti-isolation assumption (PITFALLS
§2) holds.

## Deviations from plan-time snapshot

- **dragon-websearch** — initial inventory missed the tool because it's
  registered as `(pi.registerTool as any)(...)` at `index.ts:219`. The bare
  `rg 'pi\.registerTool\('` pattern didn't match the typecast form (the `(`
  after `pi` is inside a paren group). First test asserted zero tools and
  failed under live run; corrected to assert `web_search` is registered.
  Matches the plan's own advisory note about the `as any` cast.
- **Hook-induced formatting** on `dragon-websearch.test.ts` happened because
  the initial write included an incorrect `tools).toEqual([])` assertion; the
  second write corrected it to `expect.arrayContaining(["web_search"])`.

## Self-Check: PASSED

1. `ls berrygems/tests/extensions/*.test.ts | wc -l` → **18** (17 per-extension
   including the 02-03 dragon-guard + 1 cross-extension canary).
2. `pnpm --dir berrygems test` → exit 0, **124 tests passing across 30 files**
   (70 lib + 4 dragon-guard + 49 new extension tests + 1 canary).
3. `pnpm --dir berrygems exec tsc --project tsconfig.tests.json` → exit 0.
4. `rg 'from "\.\./\.\./?extensions/' berrygems/tests/ -g '*.test.ts' | wc -l`
   → **0** (SC #5 grep gate).
5. `rg 'from "@marcfargas/pi-test-harness"' berrygems/tests/extensions/ | wc -l`
   → **0** (all imports go through the helper).
6. `diff <(ls berrygems/extensions | sed 's/\.ts$//' | sort) <(ls
berrygems/tests/extensions/*.test.ts | xargs -n1 basename | sed
's/\.test\.ts$//' | grep -v '^cross-extension$' | sort)` → empty (every
   extension has a matching test file; SC #3 closed).

## ROADMAP status

- **SC #3 CLOSED** — every extension has a matching integration test plus the
  cross-extension canary.
- **SC #5 CLOSED** — grep gate returns 0 matches.
- **TEST-03 CLOSED** — in conjunction with 02-03's dragon-guard spike.

## Commits

1. `test(02): fanout 16 extension integration tests (TEST-03)`
2. `test(02): cross-extension canary — dragon-parchment + dragon-tongue round-trip`
3. `docs(02-04): add plan summary — extension fanout + canary` (this file)
