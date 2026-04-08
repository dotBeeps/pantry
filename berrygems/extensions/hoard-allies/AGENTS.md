# hoard-allies — Extension AGENTS.md

> **Part of [Hoard](../../../AGENTS.md)** · **Feature spec:** `den/features/hoard-allies/AGENTS.md`

**Status:** 🔥 Phase 4 (polish)
**Entry point:** `index.ts`

## What This Extension Does

Subagent token governance — kobold/griffin/dragon taxonomy for dispatching allies on quests. Manages the full lifecycle: budget tracking, model cascade, async dispatch via sending-stone, and the `quest` / `ally_status` tools.

## Directory Structure

```
hoard-allies/
  index.ts              — Extension entry, settings, budget state, event hooks, /allies command, globalThis API
  quest-tool.ts         — quest tool registration, dispatch modes (single/rally/chain), estimation
  spawn.ts              — Pi subprocess spawning (local wrapper, will migrate to lib/pi-spawn.ts)
  cascade.ts            — FrugalGPT model cascade, cooldown tracking, provider error classification
  types.ts              — Shared interfaces (re-exports taxonomy types from lib/ally-taxonomy.ts)
  ally-status-tool.ts   — Running ally registry + ally_status diagnostic tool
  AGENTS.md             — This file
```

## Shared Library Dependencies

- `berrygems/lib/ally-taxonomy.ts` — `Adjective`/`Noun`/`Job` types, `CURATED_COMBOS`, `comboName`, `parseComboName`, `JOB_TOOLS`, `JOB_DEFAULTS`, cost calculation
- `berrygems/lib/settings.ts` — `readHoardSetting()` for all settings access
- `berrygems/lib/id.ts` — `generateShortId()` for spawn ID generation

## Cross-Extension Coupling

- **Sends/receives messages** via `globalThis[Symbol.for("hoard.stone")]` (sending-stone bus)
- **Exposes own API** via `globalThis[Symbol.for("hoard.allies")]`
- **Dragon-guard coupling** — quest spawns set `HOARD_GUARD_MODE=ally` and `HOARD_ALLY_TOOLS=<csv>` env vars. No imports, no shared state.
- **NEVER** direct-import between separate extensions — use globalThis Symbol keys only

## Patterns

- **DispatchOptions object** — `dispatchSingle`, `dispatchRally`, `dispatchChain` all take an options object. Never add positional params beyond 4.
- **Combo parsing** — always use `parseComboName()` from `lib/ally-taxonomy.ts`. Never split strings and cast with `as`.
- **Budget validation** — interceptor in `index.ts` event hook. `quest-tool.ts` trusts the interceptor; no duplicate checks.
- **Running ally registry** — lives in `ally-status-tool.ts`, shared to same-extension files via direct function exports (fine within one extension).
- **Formula-based costing** — `cost = noun_weight × thinking_multiplier × job_multiplier`. Never count-based.
- **FrugalGPT cascade** — `github-copilot → anthropic → google`. Free quota before paid API.

## Anti-Patterns

- **DO NOT** duplicate taxonomy constants locally — always import from `lib/ally-taxonomy.ts`
- **DO NOT** add positional parameters to `dispatchSingle` — use `DispatchOptions`
- **DO NOT** register multiple tools in one file — `quest` and `ally_status` are already separated
- **DO NOT** hand-roll settings parsing — use `readHoardSetting()`
- **DO NOT** use `stdin: "pipe"` in spawn — causes process hang, use `stdin: "ignore"`
- **DO NOT** put `output: false` in agent def frontmatter — not a valid field
- **DO NOT** use `--system-prompt` for file paths — use `--append-system-prompt`
- **DO NOT** use `--max-subagent-depth` as a CLI flag — it's an agent def frontmatter field only

## Settings Namespace (`hoard.allies.*`)

- `models` — fallback chains per noun tier
- `thinking` — thinking level per adjective
- `budget.nounWeights` / `budget.thinkingMultipliers` / `budget.jobMultipliers` — cost formula inputs
- `budget.pools` — budget per requester tier
- `budget.refundFraction` — refund on completion (default 0.5)
- `maxParallel` — max concurrent allies
- `confirmAbove` — prompt before dispatching this tier or above
- `announceDispatch` — show dispatch announcements
- `stripAppendForSubagents` — strip `APPEND_SYSTEM.md` persona prompt for spawned allies
