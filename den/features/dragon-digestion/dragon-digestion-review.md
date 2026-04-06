# Dragon Digestion v2 — Code Review

**Date:** 2026-04-07
**Reviewed:** `berrygems/extensions/dragon-digestion.ts` (1671 lines)
**Reviewer:** Code review kobold

---

## Critical Bugs

### 1. Double-masking in context event — `applyHygiene` runs twice at Tier 2+

**Location:** Context event handler (~line 1561-1569) + `applyLightPrune` (~line 315)

**Problem:** The context event handler calls `applyHygiene(msgs, keepResults)` first (Tier 0), then passes the **already-hygiene'd** result to `applyLightPrune(filtered, keepResults)`. But `applyLightPrune` internally calls `applyHygiene(messages, reducedKeep)` again on its input. This means:

1. First call: `applyHygiene(msgs, 5)` — masks all but last 5 tool results
2. Second call (inside `applyLightPrune`): `applyHygiene(alreadyFiltered, 3)` — masks all but last 3 of the already-filtered messages

The second call re-masks messages that are already breadcrumbs. While this doesn't crash (the breadcrumb is already a string or array), it **recalculates the breadcrumb** from already-breadcrumbed content, producing misleading stats like `[Tool result masked — unknown() → 1 lines, 78 chars]` instead of the original file's stats.

**Same issue at Tier 3+:** `applyHeavyPrune` also calls `applyHygiene(messages, 2)` internally, and is called with the output of `applyLightPrune` which already ran `applyHygiene`.

**Fix:** The context event handler should call either hygiene OR the tier-specific function, not both sequentially:

```typescript
// Tier 0 always runs (hygiene)
let filtered: Record<string, unknown>[];

if (tier >= 3) {
    filtered = applyHeavyPrune(msgs);
} else if (tier >= 2) {
    filtered = applyLightPrune(msgs, v2.hygieneKeepResults);
} else {
    // Tier 0 or 1: just hygiene
    filtered = applyHygiene(msgs, v2.hygieneKeepResults);
}
```

Since `applyLightPrune` and `applyHeavyPrune` already call `applyHygiene` internally, there's no need to call it separately first.

### 2. `applyLightPrune` truncation targets already-breadcrumbed messages

**Location:** `applyLightPrune` (~line 330-340)

**Problem:** After calling `applyHygiene` internally (which already masked some messages to breadcrumbs), the function iterates over **all** surviving tool results and tries to truncate them if they're over 100 lines. But some of these "surviving" results are breadcrumbs from the hygiene pass (they weren't in `safeIndices`). The breadcrumb is a single-element array `[{ type: "text", text: "..." }]` which extracts to ~1 line and passes harmlessly. However, this is wasted work and indicates confused logic.

The function protects the last 2 tool results from truncation (`safeIndices`), but the ones in between (positions `reducedKeep` to `length-2`) have ALREADY been breadcrumbed by the `applyHygiene` call. The truncation pass only applies to the `reducedKeep` newest non-error results, minus the safe 2, which is at most `reducedKeep - 2` messages. With `reducedKeep = 3`, that's 1 message. The logic works but is unnecessarily convoluted.

**Fix:** Not critical, but the logic would be clearer if truncation operated on the original messages rather than post-hygiene output, or if the function simply called `applyHygiene(messages, 2)` plus truncation of the survivors.

### 3. `usage.percent` is `0` when it should trigger Tier 0

**Location:** Context event handler (~line 1554)

**Problem:** The guard `if (!usage?.percent) return;` exits early when `percent` is `0` (falsy), `null`, or `undefined`. But `percent === 0` is a valid state (empty context). More critically, **if `percent` is `0` then Tier 0 hygiene never runs**. This is correct behavior (no messages to filter at 0%) but contradicts the plan's "always active" intent for Tier 0.

In practice, at `percent === 0` there are no messages to filter anyway, so this is a **non-issue functionally**. But the guard reads as a null-safety check when it's actually a zero-is-falsy footgun.

**Fix:** Make the intent explicit:

```typescript
if (usage?.percent == null) return; // null or undefined only
```

---

## Potential Issues

### 4. Settings read from disk on every `context` event (performance)

**Location:** Context event handler (~line 1549) and `before_provider_request` handler (~line 1585)

**Problem:** When `panelComponent` is `null` (panel not open), the fallback `readDigestSettingsV2(cwd)` is called. This function calls `readProjectHoardSetting` 10 times, each of which calls `parseJsonFile` which reads + parses JSON from disk. That's potentially 20+ file reads per turn (project + global for each setting).

With the panel open, `panelComponent.digestSettingsV2` is used instead (cached in memory), so this is only a problem when the panel is closed.

The `context` event fires once per turn, so the absolute frequency is low. But synchronous file I/O in an event handler can block the event loop.

**Fix (suggestion):** Cache V2 settings at the module level, refreshed on `session_start`, `session_switch`, and when the user changes settings via the panel:

```typescript
let cachedV2Settings: DigestSettingsV2 | null = null;
function getCachedV2Settings(cwd: string): DigestSettingsV2 {
    if (!cachedV2Settings) cachedV2Settings = readDigestSettingsV2(cwd);
    return cachedV2Settings;
}
```

### 5. `context` event uses stale usage data from previous turn

**Location:** Context event handler (~line 1553)

**Problem:** `panelComponent?.getContextUsage()` returns the usage from the **last `turn_end` update**, not the current turn. The `context` event fires during context assembly for the current request, which happens before `turn_end`. So the tier decision is based on the **previous turn's** token count.

In practice, context grows monotonically between compactions, so the stale data means the tier might be one step behind. This is a minor lag (one turn) but could cause:
- Tier transitions to be delayed by one turn
- The first turn after a compaction to still think it's at high usage

**Mitigation:** This is a fundamental limitation — the `context` event doesn't provide usage data in its own event payload. The lag is inherent to the architecture.

### 6. No timeout on the LLM call in `session_before_compact`

**Location:** `session_before_compact` handler (~line 1509)

**Problem:** The `complete()` call has no timeout. If the summary model's API is slow or hangs, the compaction will block indefinitely. Pi's own compaction also makes an LLM call, so this may be an inherent risk, but our call is to a potentially different model/provider than the session model.

**Fix (suggestion):** Add an `AbortSignal` with a timeout:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60_000); // 60s timeout
try {
    const response = await complete(
        resolved.model,
        { systemPrompt: "...", messages: [userMessage] },
        { apiKey: resolved.apiKey, headers: resolved.headers, signal: controller.signal },
    );
    // ...
} finally {
    clearTimeout(timeout);
}
```

Note: Check if `complete()` accepts a `signal` option — it may not.

### 7. `before_provider_request` handler payload structure may be wrong

**Location:** `before_provider_request` handler (~line 1627)

**Problem:** The handler does:
```typescript
const payload = (event as unknown as Record<string, unknown>).payload ?? event;
return { ...(payload as Record<string, unknown>), context_management: { edits } };
```

The `before_provider_request` event shape (per pi-context-pipeline.md) passes the raw provider payload. But the handler accesses `event.payload` first, falling back to `event` itself. If the event IS the payload (not wrapped), this works. If the event wraps the payload, we need `event.payload`. The fallback means this handles both cases, but the return value semantics differ:
- If the handler should return the **modified payload**, returning `{ ...payload, context_management }` is correct.
- If the handler should return the **modified event**, we'd need `{ ...event, payload: { ...payload, context_management } }`.

**Mitigation:** This is dead code (`anthropicContextEdits: false`), so it won't cause runtime issues. Needs empirical testing when hoard-lab enables it.

### 8. `selectedIndex` can go out of bounds when switching tier mode

**Location:** `adjustItem` → `tierMode` case (~line 895)

**Problem:** When toggling `tierMode`, `selectedIndex` is reset to 0, which is correct. But if the user rapidly toggles (e.g., press right twice), the first toggle changes the items array (from ~7 classic items to ~7 tiered items), resets index to 0, and invalidates. The second press adjusts item 0 in the new items list. This is fine.

However, there's an edge case: if `getItems()` returns a shorter list in one mode than the other, and the render hasn't happened yet, the cached `items` in `handleInput` could be stale. Looking at the code, `handleInput` calls `getItems()` fresh each time, so this is **not an issue**.

**Verdict:** OK, no bug here.

### 9. Tier 1 (Alert) is defined but never emits a notification

**Location:** Plan says Tier 1 should emit a notification at `S × 0.50`

**Problem:** The plan specifies: "Optional notification: '🐉 Context at {pct}% — light pruning will begin at {nextTierPct}%'". However, the implementation only shows Tier 1 as a yellow indicator in the panel UI. No `ctx.ui.notify()` call fires when crossing the Tier 1 threshold.

**Fix:** This could be added in the `turn_end` handler:

```typescript
if (v2.tieredMode && tier >= 1 && previousTier === 0) {
    ctx.hasUI && ctx.ui.notify(`🐉 Context at ${pct}% — light pruning begins at ${thresholds.lightPrune.toFixed(0)}%`, "info");
}
```

Requires tracking `previousTier` state.

---

## Code Quality

### 10. Duplicate JSDoc comment on `buildBreadcrumb`

**Location:** Lines ~257-266

**Problem:** There are two JSDoc comments stacked:
```typescript
/**
 * Build a breadcrumb string for a masked tool result.
 * Preserves that the tool call happened and roughly what it produced.
 */
/**
 * Build breadcrumb content for a masked tool result.
 * Returns the SAME content type as the original ...
 */
```

The first one is the old comment that should have been removed when the function was fixed.

**Fix:** Delete the first JSDoc block (lines ~257-260).

### 11. `getTierThresholds` doesn't clamp inputs

**Location:** `getTierThresholds` (~line 232)

**Problem:** If `summaryThreshold` is 0, all tiers derive to 0 (everything is always Tier 4). If it's > 100, derived tiers exceed 100%. If it's negative, tiers are negative. The `PERCENTAGE_PRESETS` array (10-95) constrains UI input, but settings can be manually edited.

**Fix (suggestion):** Clamp at the start:
```typescript
const s = Math.max(0, Math.min(100, summaryThreshold)) / 100;
```

### 12. Multiple `getTierThresholds` calls in single render

**Location:** `render()` method — called at lines ~952, ~972, ~1019, ~1037

**Problem:** Each render call computes `getTierThresholds` up to 4 times with the same inputs. It's a pure function with trivial computation, so the performance impact is negligible, but it clutters the code.

**Fix (suggestion):** Compute once at the top of the render method:
```typescript
const tieredActive = this.digestSettingsV2.tieredMode;
const thresholds = tieredActive ? getTierThresholds(...) : null;
const tier = tieredActive && this.contextUsage.percent !== null
    ? getCurrentTier(this.contextUsage.percent, thresholds!) : null;
```

### 13. `serializeMessages` doesn't handle `toolResult` role specifically

**Location:** `serializeMessages` (~line 452)

**Problem:** Tool result messages in pi have `role: "toolResult"` with `content` that can be a string or content block array, plus `toolName`, `toolCallId`, and `isError` fields. The serializer uses the generic `msg.content` path which works, but doesn't include `toolCallId` or `isError` status. For compaction prompts, knowing which tool calls errored is valuable context.

**Fix (suggestion):** Add tool-result-specific handling:
```typescript
if (role === "toolResult") {
    const errStr = msg.isError ? " [ERROR]" : "";
    return `[toolResult${toolInfo}${errStr}]\n${content}`;
}
```

### 14. Help text doesn't mention `debug` strategy or tiered mode

**Location:** `/digestion` help text (~line 1656)

**Problem:** The help text lists strategies "Default / Code / Tasks / Minimal" but omits "Debug" (added in compaction-templates.ts). It also doesn't mention tiered mode, `/digestion status` showing tier info, or the new panel items.

**Fix:** Update the help text to include Debug strategy and tiered mode documentation.

### 15. `/digestion status` doesn't show tiered mode info

**Location:** Status command handler (~line 1603)

**Problem:** The `status` subcommand only shows classic mode settings (trigger mode, reserve tokens, etc.). When tiered mode is active, it should show the current tier, summary threshold, and tier activation points.

**Fix:** Add V2 info after the existing status lines:
```typescript
const v2 = readDigestSettingsV2(cwd);
if (v2.tieredMode) {
    statusLines.push(`Tier mode: Tiered`);
    statusLines.push(`Summary threshold: ${v2.summaryThreshold}%`);
    // ... tier thresholds, current tier, etc.
}
```

---

## Verified OK

### Content type preservation
- ✅ `buildBreadcrumb` correctly returns `[{ type: "text", text }]` for array content, string for string content
- ✅ `applyLightPrune` truncation preserves content type (`isArray` check + conditional return)
- ✅ `applyHeavyPrune` handles both string and array assistant content separately
- ✅ No other functions modify `msg.content` without type-awareness

### Null safety
- ✅ `panelComponent?.getContextUsage()` uses optional chaining throughout
- ✅ `usage?.percent`, `usage?.contextWindow` guards before access
- ✅ `ctx.model?.provider`, `ctx.model?.maxTokens` properly guarded
- ✅ `getPanels()?.cwd` with `?? process.cwd()` fallback everywhere

### Event handler return types
- ✅ `session_before_compact`: returns `{ cancel: true }`, `{ compaction: {...} }`, or `undefined` (implicit return) — all valid per pi docs
- ✅ `context` event: returns `{ ...event, messages: filtered }` or `undefined` — correct
- ✅ `before_provider_request`: returns modified payload or `undefined` — correct shape

### Import consistency
- ✅ `STRATEGY_PRESETS` is imported from `../lib/compaction-templates.ts` (line 34)
- ✅ No local `STRATEGY_PRESETS` constant remains
- ✅ Local `StrategyPreset` interface is removed; the imported `STRATEGY_PRESETS` array type is inferred
- ✅ All 11 references to `STRATEGY_PRESETS` in the file use the imported version
- ✅ `buildFirstCompactionPrompt`, `buildAnchoredUpdatePrompt` imported and used correctly in `session_before_compact`

### Message filtering correctness
- ✅ `applyHygiene` correctly identifies `role === "toolResult"` and skips `isError` messages
- ✅ `applyHygiene` returns the original array reference when no masking needed (`toolResultIndices.length <= keepResults`), enabling the `filtered !== msgs` identity check
- ✅ `applyHeavyPrune` uses `assistantIndices.indexOf(idx)` for position tracking — O(n²) but on small arrays (typically <50 assistant messages), negligible

### LLM call error handling
- ✅ `resolveSummaryModel` returns `null` when no model available — checked before calling `complete()`
- ✅ `complete()` call is wrapped in try/catch — falls back to pi's default on any error
- ✅ Empty summary check (`if (!summary) return;`) prevents writing empty compaction entries
- ✅ User notification on failure via `ctx.ui.notify`

### Race conditions
- ✅ `compactionInProgress` and `pendingCompact` flags prevent double-trigger
- ✅ `context` event is synchronous message filtering — no state mutation race
- ✅ `session_before_compact` is serialized by pi (one compaction at a time)
- ✅ Panel state mutations (settings changes) are UI-thread-only, don't conflict with event handlers

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| **Critical** | 1 | Double-masking (#1) — produces wrong breadcrumb stats |
| **Potential** | 6 | Perf (#4), stale data (#5), no timeout (#6), payload shape (#7), no alert notification (#9), `0` falsy (#3) |
| **Quality** | 6 | Duplicate JSDoc (#10), unclamped threshold (#11), repeated computation (#12), serialization (#13), help text (#14), status command (#15) |
| **Verified OK** | 6 | Content types, null safety, return types, imports, filtering, error handling |
