# hoard-allies — Extension AGENTS.md

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Feature spec:** `den/features/hoard-allies/AGENTS.md`

**Status:** 🔥 beta
**Entry point:** `index.ts`

## What This Extension Does

Subagent token governance — the kobold/griffin/dragon taxonomy for dispatching allies on quests. Manages the full lifecycle: agent def generation, budget-based cost tracking, named allies, model cascade, and the `quest` dispatch tool.

## Directory Structure

```
hoard-allies/
  index.ts        — Entry: taxonomy, budget, events, /allies command, shared API
  quest-tool.ts   — Quest tool: schema, execute (single/rally/chain), formatting
  spawn.ts        — Pi process spawning (pi --mode json), NDJSON parsing
  cascade.ts      — Model fallback, provider cooldown tracking
  types.ts        — Shared interfaces
```

## Architecture

### Inter-Extension Communication

Exposes shared API on `globalThis[Symbol.for("hoard.allies.api")]` for quest-tool.ts to access taxonomy functions (calcCost, popName, buildAllyPrompt, budgetRemaining, etc.).

### Dragon-Guard Coupling

Quest spawns set two env vars for dragon-guard's Ally mode:
- `HOARD_GUARD_MODE=ally`
- `HOARD_ALLY_TOOLS=<comma-separated tool list>`

This is the ONLY interface between the two extensions. No imports, no shared state.

### Settings Namespace

All settings under `hoard.allies.*`:
- `models` — fallback chains per noun tier
- `thinking` — thinking level per adjective
- `budget.nounWeights` / `budget.thinkingMultipliers` / `budget.jobMultipliers` — cost formula
- `budget.pools` — budget per requester tier
- `budget.refundFraction` — refund on completion (default 0.5)
- `maxParallel` — max concurrent allies
- `confirmAbove` — prompt user before dispatching this tier or above
- `announceDispatch` — show dispatch announcements
- `stripAppendForSubagents` — strip APPEND_SYSTEM.md persona prompt

## Patterns

- **Formula-based costing:** `cost = noun_weight × thinking_multiplier × job_multiplier`. Never count-based.
- **Copilot-first fallback:** `github-copilot → anthropic → google`. Free quota before paid API.
- **Name pools on globalThis state:** shuffled per session, popped per dispatch, reshuffle on exhaust.
- **Agent defs regenerated on session_start:** always fresh from current settings.
- **Old 2D defs cleaned:** `cleanOldDefs()` removes phase-1 format `adj-noun.md` files.

## Antipatterns

- **Don't import from quest-tool.ts into index.ts** — quest-tool reads the shared API from globalThis.
- **Don't put `output: false` in agent def frontmatter** — it's not a valid field, gets parsed as filename string "false".
- **Don't use `--system-prompt` for file paths** — use `--append-system-prompt` (takes file path).
- **Don't use `--max-subagent-depth` as CLI flag** — it's an agent def frontmatter field only.
- **Don't use `stdin: "pipe"` in spawn** — causes process hang. Use `stdin: "ignore"`.

## Dependencies

- `../../lib/settings.ts` — `readHoardSetting()` for all config
- `@sinclair/typebox` — tool parameter schemas
- `@mariozechner/pi-coding-agent` — ExtensionAPI, ExtensionContext, isToolCallEventType
- **dragon-guard** — coupled via env vars (HOARD_GUARD_MODE, HOARD_ALLY_TOOLS)
