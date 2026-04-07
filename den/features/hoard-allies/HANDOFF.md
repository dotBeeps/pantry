# Handoff: hoard-allies

> **Last updated:** 2026-04-07
> **From:** Ember 🐉
> **For:** Next session picking up hoard-allies work

## Current State

**Phases 1-3 complete. Guard coupling done. All three quest modes tested.**

### Test Results
- ✅ **Single quest:** Wort, Dross, Crisp (kobold scouts), Seren (griffin coder)
- ✅ **Rally:** Grix, Kink, Nub — 3 parallel scouts, 1.5 pts
- ✅ **Chain:** Twig (scout) → Snark (reviewer) — 2.0 pts, found real doc debt
- ✅ **Ally guard:** Scout blocked from writing, coder allowed. Ally → Dragon impossible.
- ✅ **Model cascade:** Copilot first, falls back on rate limit

### What Exists

- **`berrygems/extensions/hoard-allies/`** — directory extension (~1,600 lines):
  - `index.ts` — taxonomy, budget, events, /allies command, shared API
  - `quest-tool.ts` — quest tool (single/rally/chain) with onUpdate progress
  - `spawn.ts` — pi process spawning with Ally mode env vars
  - `cascade.ts` — FrugalGPT model fallback + cooldowns
  - `types.ts` — shared interfaces
  - `AGENTS.md` — extension-level agent instructions

- **`berrygems/extensions/dragon-guard/`** — updated with Ally mode:
  - `state.ts` — four modes (Puppy/Dog/Ally/Dragon), ally whitelist, transition locks
  - `index.ts` — Ally mode early return, minimal tool_call handler

- **`morsels/skills/hoard-allies/SKILL.md`** — dispatch strategy skill
- **`den/features/hoard-allies/`** — spec, handoff, guard coupling spec, quest design doc

### Known Issues

1. **NDJSON parsing** — works but hasn't been stress-tested with all pi output modes
2. **Old interception code** — tool_call/tool_result interception for built-in subagent still in index.ts. Remove when dot disables pi-subagents.
3. **No TUI rendering** — quest tool doesn't use renderCall/renderResult yet
4. **No carbon tracking** — dragon-breath integration pending

## What's Next

### Phase 4 — Polish 🐣
- Quest tool TUI rendering (renderCall/renderResult)
- Dispatch announcements
- Rally/chain cost estimation
- Dragon-breath carbon integration
- Remove old subagent interception code

## Key Files

| File | Role |
|------|------|
| `den/features/hoard-allies/AGENTS.md` | Full spec and phase tracker |
| `den/features/hoard-allies/guard-coupling-spec.md` | Four-tier guard design |
| `den/features/hoard-allies/quest-design.md` | Griffin-researcher design doc |
| `berrygems/extensions/hoard-allies/` | The extension (6 files) |
| `berrygems/extensions/dragon-guard/` | Guard with Ally mode |
| `morsels/skills/hoard-allies/SKILL.md` | Dispatch strategy skill |
| `ETHICS.md` | §3.7 drives the budget system |

## Verification

```bash
cd /home/dot/Development/hoard && tsc --project berrygems/tsconfig.json
# Then /reload in pi, test: quest single, rally, chain
```
