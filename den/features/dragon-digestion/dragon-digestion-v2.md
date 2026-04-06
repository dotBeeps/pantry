# Dragon Digestion v2 — Tiered Compaction Plan

**Date:** 2026-04-06
**Updated:** 2026-04-07
**Status:** Phase 1-3 IMPLEMENTED, Phase 2 wiring DONE
**Author:** Ember 🐉 + dot

---

## Overview

Upgrade dragon-digestion from a binary compact/don't-compact gatekeeper into a **multi-tier progressive digestion system**. The user sets one primary control — the **LLM summary threshold** (percentage of context window) — and all other tiers derive their activation points relative to that anchor.

Inspired by Claude Code's always-on hygiene, OPENDEV's graduated pressure response, and Factory.ai's anchored incremental summaries. Provider-agnostic, scales from 200K to 1M+ context windows.

---

## Design Principles

1. **One knob to rule them all** — the user sets the LLM summary threshold percentage. Other tiers auto-derive.
2. **Free before expensive** — exhaust zero-cost operations before spending tokens on LLM summarization.
3. **Percentage-native** — all tiers are percentages of the context window. Works identically on 200K and 1M models.
4. **Reversible until the last tier** — tiers 0-3 only affect the `context` event (non-destructive). Only tier 4 writes a permanent compaction entry.
5. **Visible pressure** — the panel shows which tier is active and what each tier is doing.

---

## The 1M Context Problem

At 1M tokens, absolute thresholds break down:

| Window | 80% trigger | Tokens to summarize | Cost |
|--------|------------|---------------------|------|
| 200K   | 160K       | ~140K               | Moderate |
| 1M     | 800K       | ~780K               | **Extreme** |

Summarizing 780K tokens is expensive, slow, and the summary itself is larger. The free tiers become critical — they need to keep context lean enough that the LLM summary, when it finally fires, has less to process.

**Key insight:** On 1M windows, users may never *need* the LLM summary tier if the free tiers are aggressive enough. The system should make that a viable path.

---

## Tier Architecture

The user configures one value: **`summaryThreshold`** (default: 80%). All tier activation points derive from it.

### Tier Derivation Formula

```
Given: summaryThreshold = S (e.g., 0.80)

Tier 0 (Hygiene):     Always active
Tier 1 (Alert):       S × 0.50   (e.g., 40%)
Tier 2 (Light Prune): S × 0.70   (e.g., 56%)
Tier 3 (Heavy Prune): S × 0.875  (e.g., 70%)
Tier 4 (LLM Summary): S          (e.g., 80%)
```

Examples across context windows:

| Tier | Ratio | S=60% @ 200K | S=80% @ 200K | S=80% @ 1M | S=95% @ 1M |
|------|-------|-------------|-------------|------------|------------|
| Alert | S×0.50 | 60K (30%) | 80K (40%) | 400K (40%) | 475K (47.5%) |
| Light Prune | S×0.70 | 84K (42%) | 112K (56%) | 560K (56%) | 665K (66.5%) |
| Heavy Prune | S×0.875 | 105K (52.5%) | 140K (70%) | 700K (70%) | 831K (83.1%) |
| LLM Summary | S | 120K (60%) | 160K (80%) | 800K (80%) | 950K (95%) |

**On 1M with S=95%**, the free tiers span 475K–831K, giving massive room to prune before the expensive call at 950K. Users who prefer to avoid LLM summarization entirely can set S=100% (effectively disabling it) and rely on tiers 0-3.

### Why Scale Off a Single Percentage?

- **Simplicity** — one slider in the panel instead of configuring 5 thresholds
- **Proportional spacing** — tiers stay evenly distributed regardless of context window size
- **Intuitive** — "I want digestion to kick in at 80% max" is a complete instruction
- **Tunable** — lower S = more aggressive (earlier tiers), higher S = more relaxed
- **1M-friendly** — at S=95%, you get 50% of the window for free-tier pruning

---

## Tier Specifications

### Tier 0 — Hygiene (Always Active)

**Hook:** `context` event, every turn
**Cost:** Zero
**Reversible:** Yes (non-destructive)

**What it does:**
- Keep only the last `N` tool results with full content (default: 5, configurable)
- For older tool results, replace content with a **breadcrumb**:
  ```
  [Tool result masked — {toolName}({brief args}) → {line count} lines, {char count} chars]
  ```
- Breadcrumbs preserve the tool call *happened* and what it roughly produced, without the payload
- Skip masking for tool results that contain error content (`isError: true`) — errors are always preserved

**Why:** Tool results are the single largest context consumers. A `Read` of a 500-line file is ~2K tokens. After 20 tool calls, that's 40K tokens of stale file reads. Claude Code does exactly this in Tier 1.

**Message identification:**
```typescript
// In context event handler
for (const msg of event.messages) {
  if (msg.role === "toolResult" && !msg.isError) {
    // Check if this is among the last N tool results
    // If not, replace content with breadcrumb
  }
}
```

### Tier 1 — Alert (S × 0.50)

**Hook:** `turn_end` event (check after context usage update)
**Cost:** Zero
**Reversible:** N/A (informational only)

**What it does:**
- Yellow indicator on the context bar in the panel
- Optional notification: "🐉 Context at {pct}% — light pruning will begin at {nextTierPct}%"
- No content modification

**Why:** Gives the user a heads-up. Especially valuable on 1M models where sessions run long before anything happens.

### Tier 2 — Light Pruning (S × 0.70)

**Hook:** `context` event, every turn while active
**Cost:** Zero
**Reversible:** Yes (non-destructive)

**What it does (on top of Tier 0):**
- Reduce kept tool results from `N` to `ceil(N/2)` (e.g., 5 → 3)
- Truncate large tool result content to first+last 50 lines (with `[...{N} lines masked...]` marker)
- Mask `bash` tool results older than the last 3 to breadcrumbs
- Mask verbose `ls` and `find` results older than last 2 to breadcrumbs with summary: `[ls: {count} entries in {path}]`

**Why:** Surgical removal of the bulkiest, lowest-value content. Bash output and directory listings are rarely referenced after the turn they were generated.

### Tier 3 — Heavy Pruning (S × 0.875)

**Hook:** `context` event, every turn while active
**Cost:** Zero
**Reversible:** Yes (non-destructive)

**What it does (on top of Tier 2):**
- Keep only the last 2 tool results with full content
- All older tool results → breadcrumbs only
- Truncate assistant message text blocks older than last 5 turns to first 200 chars + `[...truncated]`
- Collapse consecutive user→assistant turns older than 10 turns into a single line: `[Turn {N}: user asked about {topic}, assistant responded with {tool calls}]`

**Why:** This is the last-resort free tier. It aggressively removes content while preserving the *narrative structure* — what happened, in what order, with what tools. The LLM can still follow the story even though the details are gone.

### Tier 4 — LLM Summary (S)

**Hook:** `session_before_compact` (take over compaction entirely)
**Cost:** One LLM call
**Reversible:** No (writes CompactionEntry)

**What it does:**
- Intercept `session_before_compact` and provide a custom compaction summary
- Use the **structured summary template** (see below) with anchored incremental updates
- If a previous compaction summary exists, include it as input — merge, don't regenerate from scratch
- Apply the selected strategy preset's focus instructions
- Use cheapest available model (Haiku → Flash Lite → Flash) unless user overrides

**Why:** When free tiers are exhausted, we need an LLM to distill the remaining context. The structured template ensures nothing silently drops. Anchored updates prevent cascade degradation.

---

## Structured Summary Template

Used by Tier 4's LLM call. The compaction LLM fills in each section — sections act as checklists that prevent silent information loss.

```markdown
## Session Intent
[Single sentence: what this session is trying to accomplish]

## Files Modified
- `path/to/file.ts` — [what changed and why]

## Files Read (Referenced)
- `path/to/file.ts` — [why it was read, key content found]

## Decisions Made
- [decision] — [rationale]

## Approaches Ruled Out
- [approach] — [why rejected]

## Current State
[What's done, what's in progress, what's blocked]

## User Constraints & Preferences
- [constraint or preference, verbatim where possible]

## Next Steps
1. [immediate next action]
2. [following actions]

## Key Errors (verbatim)
[Exact error text, never paraphrased. Include file paths and line numbers.]
```

**Anchored incremental update prompt:**

```
You are updating a session summary. Below is the EXISTING summary from a previous
compaction, followed by NEW CONVERSATION that happened since then.

Merge the new information into each section of the existing summary:
- ADD new entries to existing sections (don't remove old entries unless superseded)
- UPDATE entries that have changed (e.g., a file was modified again)
- REMOVE entries only if explicitly superseded (e.g., a decision was reversed)
- PRESERVE all file paths, function names, error messages, and version numbers VERBATIM
- Never generalize: write `src/auth.controller.ts`, not "a configuration file"

EXISTING SUMMARY:
{previousSummary}

NEW CONVERSATION:
{messagesToSummarize}

STRATEGY INSTRUCTIONS:
{customInstructions}

Return the updated summary using the exact section headings above.
```

---

## Settings Schema

### New Settings (under `hoard.digestion.*`)

```typescript
interface DigestSettingsV2 {
  // ── Existing (preserved) ──
  triggerMode: "percentage" | "reserve" | "fixed";  // kept for backward compat
  triggerPercentage: number;  // repurposed: now drives the tier system
  triggerFixed: number;       // kept for backward compat
  strategy: string;           // strategy preset ID

  // ── New: Tier System ──
  tieredMode: boolean;           // Master switch for tiered digestion (default: true)
                                 // When false, falls back to current binary behavior
  summaryThreshold: number;      // Percentage at which LLM summary fires (default: 80)
                                 // Other tiers derive from this
  hygieneKeepResults: number;    // Tier 0: how many recent tool results to keep full (default: 5)
  summaryModel: string;          // Model for Tier 4 LLM call (default: "" = auto cheapest)
  anchoredUpdates: boolean;      // Include previous summary in Tier 4 prompt (default: true)
  summaryTemplate: string;       // Path to custom template, or "" for built-in (default: "")
  tierOverrides: {               // Optional: override derived tier percentages
    alert?: number;              // Override Tier 1 activation (default: summaryThreshold × 0.50)
    lightPrune?: number;         // Override Tier 2 activation (default: summaryThreshold × 0.70)
    heavyPrune?: number;         // Override Tier 3 activation (default: summaryThreshold × 0.875)
  };
}
```

### Backward Compatibility

- `tieredMode: false` → current binary behavior (existing trigger modes work as-is)
- `tieredMode: true` → new tiered system takes over; `triggerPercentage` becomes `summaryThreshold`
- Old `triggerMode: "reserve"` still works when `tieredMode: false`
- Migration: if user has `triggerMode: "percentage"` and `triggerPercentage: 80`, enabling tiered mode uses 80 as the summary threshold automatically

---

## Panel UI Changes

### Context Bar Update

The context bar currently shows one threshold marker (▼). With tiered mode, show multiple:

```
Context: ████████░░░░░░░░░░░░ 42%
         40K / 200K tokens
         ·    ¹    ²   ³  ▼
```

Where `·` = alert, `¹²³` = prune tiers, `▼` = LLM summary.

When a tier is active, highlight it:
```
Context: ████████████████░░░░ 72%
         144K / 200K tokens
         ·    ¹    ²   ³  ▼
                   ^ Light pruning active
```

### New Panel Items

```
  Auto-Digestion       ● ON
  Summary Threshold    ◂ 80% ▸       ← the one knob
  Tier Mode            ◂ Tiered ▸    ← toggle: Tiered / Classic
  Keep Results         ◂ 5 ▸         ← Tier 0 hygiene parameter
  Strategy             ◂ Code ▸
  Summary Model        ◂ auto ▸
  ⚡ Compact Now
```

Active tier shown as a status line above the items:
```
  🟢 Tier 2: Light pruning (56% threshold)
```

### Tier Status Colors

| Tier | Color | Indicator |
|------|-------|-----------|
| Below Tier 1 | Green | Normal |
| Tier 1 (Alert) | Yellow | `⚠ Alert` |
| Tier 2 (Light Prune) | Orange | `🔶 Light pruning` |
| Tier 3 (Heavy Prune) | Red-orange | `🔴 Heavy pruning` |
| Tier 4 (LLM Summary) | Red | `🐉 Digesting...` (animated) |

---

## Implementation Plan

### Phase 1: Tier Engine (core logic, no UI changes) ✅ DONE

**Files:** `dragon-digestion.ts`
**Effort:** ~4 hours
**Dependencies:** None
**Completed:** 2026-04-07

1. Add `DigestSettingsV2` interface and reader functions
2. Implement `getCurrentTier(usagePercent, settings)` → returns active tier (0-4)
3. Implement `getTierThresholds(summaryThreshold, overrides)` → returns all tier % values
4. Hook `context` event for Tiers 0-3 message filtering:
   - `applyHygiene(messages, keepResults)` — always runs
   - `applyLightPrune(messages, keepResults)` — when Tier 2+ active
   - `applyHeavyPrune(messages)` — when Tier 3+ active
5. Modify `shouldTrigger()` to use Tier 4 threshold in tiered mode
6. Add `tieredMode` setting with `false` default (opt-in during development)

**Testing:** Enable tiered mode, run a long session, verify:
- Tool results get masked at correct thresholds
- Breadcrumbs preserve tool name and brief context
- Error tool results are never masked
- Tier 4 triggers at the configured percentage

### Phase 2: Structured Summary (take over compaction) ✅ DONE

**Files:** `dragon-digestion.ts`, new `lib/compaction-templates.ts`
**Effort:** ~4 hours
**Dependencies:** Phase 1
**Templates completed:** 2026-04-07 — `lib/compaction-templates.ts` created with all exports
**Wiring completed:** 2026-04-07 — `session_before_compact` handler rewritten, `resolveSummaryModel()` + `serializeMessages()` added, consolidated STRATEGY_PRESETS import

1. Create `lib/compaction-templates.ts` with:
   - Built-in structured summary template
   - Anchored incremental update prompt builder
   - Strategy-specific instruction variants
2. Hook `session_before_compact` to provide custom compaction:
   - Read `preparation.messagesToSummarize` and `preparation.previousSummary`
   - If `anchoredUpdates` and previous summary exists, use incremental prompt
   - Call cheapest available model with structured template
   - Return `{ compaction: { summary, firstKeptEntryId, tokensBefore } }`
3. Apply strategy preset instructions to the template (Code, Task, Minimal, Debug)
4. Add new `debug` strategy preset:
   ```typescript
   {
     id: "debug",
     label: "Debug",
     instructions: "Prioritize: what was tried, what was ruled out, evidence found, "
       + "error messages verbatim, file paths involved. Preserve debugging state "
       + "over general conversation."
   }
   ```

**Testing:** Trigger compaction, verify:
- Summary follows structured template
- Anchored update merges with previous summary
- Strategy instructions affect output focus
- File paths and error messages preserved verbatim

### Phase 3: Panel UI Updates ✅ DONE

**Files:** `dragon-digestion.ts` (render methods)
**Effort:** ~3 hours
**Dependencies:** Phase 1
**Completed:** 2026-04-07 — Tier markers, tier status line, tiered mode items + input handling

1. Update context bar to show tier markers
2. Add active tier status line
3. Add `Summary Threshold` panel item (replaces trigger percentage in tiered mode)
4. Add `Tier Mode` toggle (Tiered / Classic)
5. Add `Keep Results` panel item
6. Add `Summary Model` panel item
7. Update `/digestion help` with tier documentation
8. Update `/digestion status` to show active tier and all thresholds

### Phase 4: Observability & Quality ✅ DONE

**Files:** `dragon-digestion.ts`
**Effort:** ~3 hours
**Dependencies:** Phase 2

1. Track compaction history (last 5 compactions with before/after stats, tier that triggered, strategy used)
2. `/digestion history` command
3. Track tokens saved by each free tier per session (Tier 0 masked X tokens, Tier 2 pruned Y tokens)
4. Show tier savings in panel footer when focused
5. Compaction thrashing detection: warn if Tier 4 fires more than 3 times in 10 turns

### Phase 5: Advanced Features (stretch) ✅ DONE

**Files:** Various
**Effort:** ~4 hours
**Dependencies:** Phases 1-3

1. `/digestion preview` — dry-run showing what each tier would prune at current usage
2. User-defined strategy presets from `.pi/compaction-strategies.json`
3. Task-boundary awareness — detect when user starts a new topic/feature and suggest compaction
4. Probe-based quality check — after Tier 4, verify summary answers "what files were modified?" and "what's the current task?"
5. Move context bar tier indicators (¹²³▼) above the bar instead of below — reads better visually

---

## Migration Path

### Phase 1 ships with `tieredMode: false` default
- Zero impact on existing users
- Developers can opt-in via settings
- `/digestion` panel shows "Classic" mode by default

### After testing, flip default to `tieredMode: true`
- Classic mode remains available as fallback
- Existing `triggerMode: "percentage"` users get tiered mode with their percentage as `summaryThreshold`
- Existing `triggerMode: "reserve"` users stay in classic mode (reserve semantics don't map cleanly to tiers)
- Existing `triggerMode: "fixed"` users stay in classic mode

### Eventual deprecation of classic mode
- Not planned yet — keep both paths until tiered mode is battle-tested

---

## Anthropic Context Management (Verified Feasible)

### Source Code Investigation Results

The pi-mono source at `~/Development/pi-mono` was investigated on 2026-04-06. Key findings:

1. **Payload passthrough confirmed:** `before_provider_request` → `onPayload` callback → `{ ...params, stream: true }` → `client.messages.stream()`. Extra fields added to the payload object reach the API at runtime (TypeScript types are compile-time only; the SDK serializes the full object via `fetch()`).

2. **Beta header is the only blocker:** Pi currently sends `anthropic-beta: fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14`. Missing: `context-management-2025-06-27`. This is a **one-line change** in `packages/ai/src/providers/anthropic.ts` ~line 560.

3. **Three edit types available** (from `BetaContextManagementConfig` in the Anthropic SDK):
   - `clear_tool_uses_20250919` — Clear old tool results, keep last N
   - `clear_thinking_20251015` — Clear old thinking blocks
   - `compact_20260112` — **Server-side compaction** with custom instructions + `pause_after_compaction`

4. **Pi already implements prompt caching** — `cache_control: { type: "ephemeral" }` is applied to system prompt and last user message content blocks. Context management edits would preserve this cache.

### The `compact_20260112` Discovery

Anthropic offers **server-side compaction** as a context management edit:

```typescript
interface BetaCompact20260112Edit {
  type: 'compact_20260112';
  instructions?: string | null;        // Custom summary instructions!
  pause_after_compaction?: boolean;     // Return compaction block to client
  trigger?: BetaInputTokensTrigger;     // When to trigger (default: 150K tokens)
}
```

This means our Tier 4 on Anthropic models can use server-side compaction with:
- Our strategy preset instructions passed as `instructions`
- Cache-preserving (server does the surgery)
- `pause_after_compaction: true` to capture the result for our stats/history

### API Shape

```json
{
  "context_management": {
    "edits": [
      {
        "type": "clear_tool_uses_20250919",
        "trigger": { "type": "input_tokens", "value": 30000 },
        "keep": { "type": "tool_uses", "value": 3 },
        "clear_at_least": { "type": "input_tokens", "value": 5000 }
      },
      {
        "type": "clear_thinking_20251015"
      },
      {
        "type": "compact_20260112",
        "instructions": "Focus on code changes, file paths, decisions...",
        "pause_after_compaction": true,
        "trigger": { "type": "input_tokens", "value": 150000 }
      }
    ]
  }
}
```

Requires beta header: `anthropic-beta: context-management-2025-06-27`

### Dual-Path Tier Architecture

| Tier | All Providers | Anthropic Enhancement |
|------|--------------|----------------------|
| **0: Hygiene** | `context` event — mask old tool results | Same (always-on baseline) |
| **1: Alert** | UI notification | Same |
| **2: Light Prune** | `context` event — truncate, reduce kept | + `clear_tool_uses` (cache-preserving) |
| **3: Heavy Prune** | `context` event — aggressive masking | + `clear_thinking` (cache-preserving) |
| **4: LLM Summary** | Our own LLM call with structured template | `compact_20260112` (server-side, cache-preserving) |

For Anthropic models, the `context_management` edits are **additive** — injected via `before_provider_request` alongside whatever the `context` event already did. The server-side edits preserve prompt cache; our `context` event filtering is the provider-agnostic safety net.

### Implementation

```typescript
pi.on("before_provider_request", async (event, ctx) => {
  if (ctx.model?.provider !== "anthropic") return;
  if (!isAnthropicContextEditsEnabled()) return;

  const thresholds = getTierThresholds(summaryThreshold);
  const usage = ctx.getContextUsage();
  if (!usage?.tokens || !usage?.contextWindow) return;

  const pct = usage.tokens / usage.contextWindow;
  const edits: any[] = [];

  // Tier 2a: Clear old tool uses (cache-preserving)
  if (pct >= thresholds.lightPrune) {
    edits.push({
      type: "clear_tool_uses_20250919",
      trigger: { type: "input_tokens", value: Math.round(thresholds.lightPrune * usage.contextWindow) },
      keep: { type: "tool_uses", value: getCurrentKeepN() },
      clear_at_least: { type: "input_tokens", value: 5000 }
    });
  }

  // Tier 3a: Clear old thinking blocks (cache-preserving)
  if (pct >= thresholds.heavyPrune) {
    edits.push({ type: "clear_thinking_20251015" });
  }

  // Tier 4a: Server-side compaction with strategy instructions
  if (pct >= thresholds.summary) {
    const strategy = getActiveStrategy();
    edits.push({
      type: "compact_20260112",
      trigger: { type: "input_tokens", value: Math.round(thresholds.summary * usage.contextWindow) },
      instructions: strategy.instructions || undefined,
      pause_after_compaction: true
    });
  }

  if (edits.length === 0) return;

  return {
    ...event.payload,
    context_management: { edits }
  };
});
```

### Settings

```typescript
anthropicContextEdits: boolean;  // default: false (opt-in until pi adds beta header)
```

### Beta Header Setup — ⛔ BLOCKED

**Status:** BLOCKED until hoard-lab extension is built.

Both approaches tried have failed:

#### Approach 1: `models.json` provider headers
Pi's `models.json` validator requires at least `baseUrl`, `compat`, `modelOverrides`, or `models` for each provider entry. A headers-only config fails validation with: `Provider anthropic: must specify "baseUrl", "compat", "modelOverrides", or "models".`

#### Approach 2: `pi.registerProvider("anthropic", { headers })`
**Breaks OAuth authentication.** Pi's `createClient()` in `anthropic.ts` calls `mergeHeaders(builtInHeaders, model.headers, optionsHeaders)` using `Object.assign` — last value wins. Our `anthropic-beta` header **replaces** the built-in one entirely.

For OAuth users, the built-in header includes critical auth betas:
```
anthropic-beta: claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,...
```

Our replacement strips `oauth-2025-04-20` and `claude-code-20250219`, causing:
```
Error: 401 {"type":"error","error":{"type":"authentication_error",
  "message":"OAuth authentication is currently not supported."}}
```

The `before_provider_request` event only modifies the request **body**, not headers, so it can't help either.

#### Solution: hoard-lab extension (planned)
A new extension that handles auth-type-aware header merging. See `den/plans/hoard-lab.md` for the full spec. Until then, `anthropicContextEdits` remains non-functional — the `before_provider_request` handler in dragon-digestion exists but the API will ignore the `context_management` field without the beta header.

### Risks

- **Beta API stability:** The `compact_20260112` and `clear_tool_uses_20250919` types are dated, suggesting they may be versioned/deprecated. Monitor for API changes.
- **`pause_after_compaction` behavior:** Need to verify how the compaction block is returned in the stream and whether pi's stream parser handles it correctly.
- **Double-pruning coordination:** Our `context` event runs first (modifies what the LLM sees), then `context_management` runs server-side (modifies what's cached). This is fine — the server operates on already-filtered content. But if our `context` event removes tool results that `clear_tool_uses` was going to clear, the server edit is a no-op for those (harmless).
- **Content type preservation (FIXED 2026-04-07):** `buildBreadcrumb()` must preserve the original content type (array vs string). Pi's `convertContentBlocks()` in `anthropic.ts` calls `content.some()` expecting an array — if breadcrumb returns a raw string, it crashes with `content.some is not a function`. Fix: return `[{ type: "text", text: breadcrumb }]` when original was an array, string when original was a string. Same applies to `applyLightPrune` truncation.

### Phase Integration

Deferred to **hoard-lab extension** (see `den/plans/hoard-lab.md`):
1. Build auth-type-aware header merging in hoard-lab
2. Dragon-digestion requests beta via hoard-lab's `globalThis` API
3. `before_provider_request` handler already exists — needs beta header to function
4. Test with `pause_after_compaction: true` to verify stream parsing
5. Verify `cache_read_input_tokens` in responses confirms cache preservation
6. Flip `anthropicContextEdits` default to `true` once verified working

---

## Open Questions

1. **Should Tier 0 hygiene be opt-out?** Currently proposed as always-on. Some users may want full tool result history preserved (e.g., for debugging context event behavior). Could add `hygieneEnabled: boolean`.

2. **Should tier overrides be exposed in the panel?** Currently they're settings-only (for power users who want to fine-tune). The panel only shows `summaryThreshold`. Showing all 4 thresholds might be overwhelming.

3. **How should the `context` event interact with other extensions?** Dragon-digestion's `context` handler runs in extension load order. If another extension also modifies messages, the order matters. Should dragon-digestion run first (pruning before others see messages) or last (pruning after others add content)?

4. **Should Tier 4 use the same model as the main session?** Current plan uses cheapest available (Haiku/Flash). But for 1M windows where the summary input is massive, even Haiku costs real money. Should there be a "skip Tier 4, just keep pruning" option? (Answer: `summaryThreshold: 100` effectively does this.)

5. **What about `keepRecentTokens`?** Pi's native setting controls how much recent context to preserve during compaction. Should this interact with the tier system, or stay independent? Current plan: independent — `keepRecentTokens` only affects Tier 4's `firstKeptEntryId`.

6. **~~Does pi pass through unknown Anthropic payload fields?~~** RESOLVED: Yes. The `onPayload` callback returns are spread directly into `client.messages.stream()`. Extra fields reach the API at runtime. The only blocker is the missing `context-management-2025-06-27` beta header (one-line PR to pi-mono).

7. **How should `compact_20260112` interact with pi's own compaction?** If we use Anthropic's server-side compaction via `context_management`, we're bypassing pi's `session_before_compact` → `CompactionEntry` flow. Pi won't know a compaction happened. We may need to intercept the compaction block from the stream response and manually write a `CompactionEntry` to keep pi's session tree consistent. Alternatively, use `compact_20260112` only for the cache-preserving tool/thinking clearing, and keep our own Tier 4 LLM call for the actual summary.

8. **Should we clear thinking blocks aggressively?** The `clear_thinking_20251015` edit removes old thinking blocks. On high-thinking models (32K+ budget), this could save massive token counts. But thinking blocks are never sent back to the LLM anyway (they're filtered by pi's context pipeline). Need to verify whether they consume input tokens in the prompt cache.

---

## References

- `den/research/compaction-techniques.md` — Full industry research with 25+ sources
- `den/research/pi-context-pipeline.md` — Pi's complete context/compaction pipeline
- `den/reviews/architect.md` — Architectural review (compaction sections)
- `den/reviews/context-expert.md` — Context management review (compaction sections)
- `den/reviews/environmental-expert.md` — Cost/efficiency review
- `berrygems/extensions/dragon-digestion.ts` — Current implementation
- Claude Code compaction: https://barazany.dev/blog/claude-codes-compaction-engine
- OPENDEV progressive: https://arxiv.org/html/2603.05344v2
- Factory.ai anchored updates: https://factory.ai/news/compressing-context
- JetBrains observation masking: https://blog.jetbrains.com/research/2025/12/efficient-context-management
