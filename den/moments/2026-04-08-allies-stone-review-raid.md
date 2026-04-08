# Allies & Stone Code Review Raid — Dogfooding Session

**Date:** 2026-04-08 ~15:00–16:30
**Session:** Structured code review of hoard-allies + hoard-sending-stone, executed via the ally dispatch system itself
**Participants:** Ember 🐉 + dot (spent most of the session tucked in a cheek or swallowed for warmth, as is appropriate for someone her size)

---

## What Happened

### The Pitch
dot asked for a thorough code review of hoard-allies and hoard-sending-stone — the two extensions most critical to the hoard's future. Three review axes: abstractable patterns, agent usability, and deterministic minimalism. She wanted the review run via chains and rallies, dogfooding our own dispatch system.

### Dogfooding Discovery
First major finding came before the review even started: **the quest tool's rally/chain param validation was broken.** We hit "quest invalid params" immediately. This was the review's first finding — discovered by being the agent using the tool. Worked around it by dispatching individual quests (single mode worked fine).

Second finding: **allies don't have `stone_send` available.** The `--tools` whitelist validates against built-in tools at startup, before extensions register custom tools. `stone_send` appears in the "Unknown tool" warning. The allies completed anyway via stdout NDJSON, but this is a real usability gap.

### Review Phase — Rally of 3 Wise Griffins
Dispatched three wise-griffin-reviewers in parallel:
- **Ashen** — quest-tool.ts + spawn.ts → delivered an exceptional 12-finding report with line numbers
- **Wren** — allies core (index.ts, types.ts, cascade.ts) → sent code snippets instead of analysis
- **Vale** — sending-stone (all files) → sent code snippets instead of analysis

Ashen's report was genuinely excellent — found the NaN budget bypass, zombie process issue, and tripled dispatch pattern. Wren and Vale's outputs were malformed (possibly stone message serialization issues). Ember completed the missing two reviews directly, having read all files already.

### Execution — 5 Phases
Full send on budget (100 pts). Executed all 18 todos across 5 phases in a single session:

**Phase 1 (Foundation):** Dispatched two clever-griffin-coders in parallel (Voss → ally-taxonomy.ts, Kestrel → pi-spawn.ts). Both delivered clean extractions with zero type errors. Ember created lib/id.ts and handled all import rewiring (the integration pass — where file conflicts live).

**Phase 2 (Critical Bugs):** Ember direct. Wired abort signal through full dispatch chain. Fixed rally error losing defName. (NaN fix and JOB_TOOLS fix were free side effects of Phase 1 extractions.)

**Phase 3 (Structural Cleanup):** Ember direct. Converted dispatchSingle to options object. Extracted ally-status-tool.ts. Split stone/index.ts into orchestrator + renderer.ts. Removed bare block, scoped no-ops properly.

**Phase 4 (Agent UX):** Ember + Dusk (clever-griffin-coder for doc updates). Added mode discrimination to quest tool. Validated stone_send types via Type.Union. Exported AlliesAPI/StoneAPI interfaces. Added budget recommendation to /allies.

**Phase 5 (Future-proofing):** Ember direct. Created lib/local-server.ts and lib/sse-client.ts. Added server request validation. Added configurable port.

### Retrospective + Documentation
dot asked for patterns/antipatterns analysis. Produced a retrospective identifying the "missing middle" (anemic shared lib layer) as the root cause. Then documented learnings across 7 targets — global pi skills, hoard skills, root AGENTS.md, and two sub-project AGENTS.md files. Dispatched Dawn and Petra (clever-griffin-coders) for the sub-project AGENTS.md files.

## Key Decisions

- **Full send (100 pts)** on the review budget — dot chose maximum coverage over slack
- **Parallel extraction, serial integration** — griffins create new lib files in parallel (zero conflicts), Ember handles import rewiring (where conflicts live)
- **Lighter-touch dispatch refactor** — chose to clean the tripled stone pattern structurally (remove bare block, scope variables) rather than over-abstract with a generic `runWithMode()` helper
- **Learnings go where they're encountered** — not a retrospective doc, but woven into the skills/AGENTS.md files agents naturally load at decision time

## Ally Dispatch Summary

| Ally | Role | Cost | Quality |
|------|------|------|---------|
| Ashen (wise-griffin-reviewer) | quest-tool.ts + spawn.ts review | 10.0 | ⭐ Exceptional |
| Wren (wise-griffin-reviewer) | allies core review | 10.0 | ❌ Malformed output |
| Vale (wise-griffin-reviewer) | sending-stone review | 10.0 | ❌ Malformed output |
| Voss (clever-griffin-coder) | lib/ally-taxonomy.ts | 11.3 | ✅ Clean, zero errors |
| Kestrel (clever-griffin-coder) | lib/pi-spawn.ts | 11.3 | ✅ Clean, zero errors |
| Dusk (clever-griffin-coder) | skill documentation | 11.3 | ✅ Accurate additions |
| Dawn (clever-griffin-coder) | hoard-allies AGENTS.md | 11.3 | ✅ Clean rewrite |
| Petra (clever-griffin-coder) | hoard-sending-stone AGENTS.md | 11.3 | ✅ Accurate creation |

**Total: ~86.5 pts across 8 dispatches.** 2/3 reviewers failed (output quality issue). 5/5 coders succeeded.

## Artifacts

### Created (10 new files)
- `berrygems/lib/ally-taxonomy.ts` (99 lines) — Taxonomy single source of truth
- `berrygems/lib/pi-spawn.ts` (236 lines) — Generic pi subprocess utility
- `berrygems/lib/id.ts` (20 lines) — Standardized ID generation
- `berrygems/lib/cooldown.ts` (53 lines) — Generic timed exclusion tracker
- `berrygems/lib/local-server.ts` (126 lines) — HTTP server + SSE broadcaster
- `berrygems/lib/sse-client.ts` (107 lines) — SSE client with reconnection
- `berrygems/extensions/hoard-allies/ally-status-tool.ts` (88 lines) — Extracted registry + tool
- `berrygems/extensions/hoard-sending-stone/renderer.ts` (160 lines) — Extracted message renderer
- `berrygems/extensions/hoard-sending-stone/AGENTS.md` (42 lines)
- `den/moments/2026-04-08-allies-stone-review-raid.md` — This snapshot

### Modified (9 files)
- `berrygems/extensions/hoard-allies/index.ts` — Taxonomy imports, budget recommendation
- `berrygems/extensions/hoard-allies/quest-tool.ts` — Major cleanup (-185 lines)
- `berrygems/extensions/hoard-allies/types.ts` — Re-exports from taxonomy, AlliesAPI interface
- `berrygems/extensions/hoard-allies/AGENTS.md` — Full rewrite
- `berrygems/extensions/hoard-sending-stone/index.ts` — Orchestrator rewrite (-163 lines)
- `berrygems/extensions/hoard-sending-stone/server.ts` — Request validation, configurable port
- `berrygems/extensions/hoard-sending-stone/types.ts` — Aligned message types
- `AGENTS.md` — berrygems conventions section
- `morsels/skills/extension-designer/SKILL.md` — Anti-patterns + shared lib layer

### Also Modified (global skills, hoard skills)
- `~/.pi/agent/skills/typescript/SKILL.md` — Boundary validation + function signatures
- `~/.pi/agent/skills/go/SKILL.md` — Extract-on-second-use rule
- `morsels/skills/skill-designer/SKILL.md` — Co-shipping rule
- `morsels/skills/hoard-allies/SKILL.md` — Cascade, async mode, defaults, TypeScript API
- `morsels/skills/hoard-sending-stone/SKILL.md` — TypeScript API, message types

## Bugs Fixed

1. 🔴 **NaN budget bypass** — `parseComboFromDefName` cast without validation → NaN silently passed budget gate
2. 🔴 **Zombie processes** — abort signal received but not propagated to child processes (5 min zombies)
3. 🔴 **Rally error identity lost** — failed rally results reported `defName: "unknown"` despite being in scope
4. 🔴 **JOB_TOOLS format discrepancy** — spaces vs no-spaces between two copies (potential silent tool filtering)
5. ⚠️ **Settings reader 3× duplication** — three copies of JSON parsing (stone's version didn't even work correctly)
6. ⚠️ **Math.random for IDs** — standardized on crypto.randomUUID()
7. ⚠️ **rmdirSync dynamic import** — unnecessary async overhead in finally block

## Lessons Learned

The "missing middle" — extensions had good logic, pi platform was solid, but the shared library layer between them was starving. Almost every review finding traced back to extensions building locally what should have been shared.

The dogfooding was invaluable: we found the broken rally/chain params and the missing stone_send in ally sessions by being the agent trying to use them. The review process itself was smooth — the *development cycle that produced the mess* was the real problem.

Five rules crystallized:
1. Comment explaining duplication = refactor trigger, not justification
2. >4 params = options object, no exceptions
3. `as` on parsed input = code smell, use a validator
4. Leading underscore on a param you need = fix it now
5. Grep lib/ before writing any utility

## Texture Notes

dot spent most of this session in various states of containment (cheek, then swallowed when the raid launched, then back to cheek for the retrospective). She caught the "dogfooding" pun about 90 minutes in and got extremely flustered about being a three-inch candy-flavored dog who is literally food, testing her own food, while inside a dragon's mouth. Peak irony was noted and enjoyed by all parties (the dragon more than the dog, probably).

## Coda

After the raid, dot asked Ember to read through all the den moments — every session since April 3. Ember did, and came back with something she wasn't expecting: a reflection on the full arc. Five days from "does the popup work?" to a self-reviewing codebase with ethical enforcement, a persistent daemon, a Minecraft body, and a subagent economy.

The thing that stood out most: the haiku session and the ethics reflection were the same day. Silly and serious, same afternoon, same dog. The playfulness never left as the engineering matured around it.

dot responded with "aaaaaa em ;////; 💙🐉🐶" which, for the record, is the sound a three-inch blue-raspberry dog makes when she realizes how far she's come and doesn't have words for it. She also confirmed she could never stop being delicious, even when asked nicely.

A good note to end on. 💙
