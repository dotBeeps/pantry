# Pi Internals — Project-Specific Gotchas

Hard-won knowledge from building extensions in this repo. These are things you **cannot** learn from pi's official docs alone.

## reserveTokens Double Duty

`compaction.reserveTokens` in settings controls **two things simultaneously:**

1. **Trigger threshold** — auto-compaction fires when `tokens > contextWindow - reserveTokens`
2. **Output budget** — the compaction LLM call gets `0.8 × reserveTokens` as its `max_tokens`

This means writing a very large `reserveTokens` (to trigger compaction earlier) also inflates the compaction LLM's output budget, potentially hitting API limits. Conversely, a small `reserveTokens` triggers compaction very late AND limits the summary quality.

### The Decoupling Pattern

`digestion-settings.ts` decouples these by:

- Writing a **safe `reserveTokens`** (16384) to settings — keeps the compaction output budget reasonable
- Enforcing the **real trigger** through extension hooks (`turn_end` and `session_before_compact`)
- Storing the user's actual trigger parameters separately under `dotsPiEnhancements` in settings

## Compaction Event Ordering

`compaction_start` fires **before** `session_before_compact` in pi's internal flow. Pi's interactive mode hardcodes the compaction label on `compaction_start`:

```js
// interactive-mode.js, line 1997-1999
label = `Compacting context... ${cancelHint}`
      : `Auto-compacting... ${cancelHint}`;
this.autoCompactionLoader = new Loader(..., label);
```

**Consequence:** No extension hook can intercept or replace the "Compacting context..." / "Auto-compacting..." label. It's set before `session_before_compact` runs.

### What You Can Do

- `ctx.ui.setStatus("key", "🐉 Digesting…")` shows in the extension footer area **alongside** pi's label
- If `session_before_compact` returns `{ cancel: true }`, pi briefly flashes "Auto-compaction cancelled" — minimized by managing compaction proactively from `turn_end`

## Proactive vs. Reactive Compaction

Two hooks, two strategies — they work together:

### Reactive: `session_before_compact`

Pi fires this when its native trigger (`contextWindow - reserveTokens`) is met. If our custom threshold isn't actually met (because we wrote a small `reserveTokens` as a safety net), cancel it:

```typescript
pi.on("session_before_compact", async (event, ctx) => {
	if (!isOurThresholdMet(ctx)) {
		return { cancel: true };
	}
});
```

### Proactive: `turn_end`

For trigger points **earlier** than pi's native threshold, pi will never fire on its own. Check our threshold in `turn_end` and call `ctx.compact()` manually:

```typescript
pi.on("turn_end", async (_event, ctx) => {
	if (isOurThresholdMet(ctx) && !compactionInProgress) {
		ctx.compact({ customInstructions: strategyInstructions });
	}
});
```

**Guard against double-fire:** Don't call `compact()` if one is already in progress. Track compaction state via `session_before_compact` and `session_compact` events.

### Minimizing the Cancel Flash

If we manage ALL compaction via `ctx.compact()` from `turn_end`, pi only shows its hardcoded label when **we** fire it — no surprise auto-compaction, no cancel flashes. Keep pi's auto-compaction enabled at a small `reserveTokens` (16384) as an overflow safety net, so the cancel case is extremely rare.

## dots-panels globalThis API

`dots-panels.ts` publishes its API at `Symbol.for("dot.panels")`. Primary method:

```typescript
const panels = (globalThis as any)[Symbol.for("dot.panels")];

// Primary API — handles overlay creation, key routing, geometry tracking
panels.createPanel(id, (panelCtx) => component, options)  // Create & register
panels.close(id)                                          // Close a panel
panels.focusPanel(id)                                     // Focus specific panel
panels.cycleFocus()                                       // Cycle focus between panels
panels.suggestLayout(count)                               // Optimal positions for N panels
panels.getGeometry(id)                                    // Panel position info
panels.keyHints                                           // { focusKey, closeKey, focused, unfocused }

// Backward compat (prefer createPanel)
panels.register(id, managedPanel)                         // Low-level registration
panels.wrapComponent(id, component)                       // Low-level key routing
```

Always use optional chaining (`panels?.createPanel(...)`) — dots-panels may not be loaded yet depending on extension load order. Listen for `pi.events.on("panels:ready", ...)` if you need guaranteed availability.

## Trigger Mode Semantics

The digestion panel supports three trigger modes. Each has a different relationship to `reserveTokens`:

| Mode | User Controls | reserveTokens in Settings | Trigger Logic |
|---|---|---|---|
| **Reserve** | Response budget (tokens) | User's value directly | `tokens > contextWindow - userReserve` |
| **Percentage** | Context fill % | Always `SAFE_RESERVE_TOKENS` (16384) | `tokens > contextWindow × (pct / 100)` |
| **Fixed** | Token threshold | Always `SAFE_RESERVE_TOKENS` (16384) | `tokens > fixedThreshold` |

In Reserve mode, `reserveTokens` IS the user's value. In Percentage/Fixed modes, `reserveTokens` is always the safe constant — the actual trigger is enforced by extension hooks, not pi's native mechanism.
