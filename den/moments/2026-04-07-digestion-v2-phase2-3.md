# Dragon Digestion v2 — Phase 2+3 Session Snapshot

**Date:** 2026-04-07
**Session:** Morning implementation sprint

---

## What Happened

### Phase 2: Compaction Takeover (Completed)
- Imported `complete` from `@mariozechner/pi-ai` for LLM calls
- Consolidated STRATEGY_PRESETS — removed local 4-preset array, now imports 5-preset version from `lib/compaction-templates.ts` (adds `debug`)
- Added `resolveSummaryModel()` — resolves cheapest available model or user-configured one
- Added `serializeMessages()` — converts message array to prompt text
- Rewrote `session_before_compact` handler — in tiered mode: extracts preparation data, builds structured/anchored prompt, makes LLM call, returns custom compaction entry
- Graceful fallback: if any step fails, pi's default compaction takes over

### Phase 3: Panel UI (Completed)
- Tiered mode shows different items: Summary Threshold, Tier Mode, Keep Results, Summary Model
- Context bar shows tier markers (¹²³▼) at activation positions
- Tier status line with color coding (green→yellow→red)
- All new controls are interactive with settings persistence
- Classic mode rendering completely untouched

### Bugfixes (Critical)
- **OAuth 401 bug:** `registerProvider("anthropic", { headers })` strips OAuth betas (`oauth-2025-04-20`, `claude-code-20250219`) from `anthropic-beta` header. Removed the call entirely. Anthropic context_management deferred to hoard-lab extension.
- **`content.some is not a function` bug:** `buildBreadcrumb()` returned a string, but pi's Anthropic provider calls `content.some()` expecting an array. Fixed: now preserves original content type (array → `[{ type: "text", text: breadcrumb }]`, string → string).
- **Same fix applied to `applyLightPrune` truncation** — was producing string content from array content.

## Files Changed

### Modified
- `berrygems/extensions/dragon-digestion.ts` — Phase 2 wiring, Phase 3 UI, bugfixes (1371 → ~1650 lines)
- `den/plans/dragon-digestion-v2.md` — Status updates, blocked items noted

### Deleted
- `~/.pi/agent/models.json` — models.json approach abandoned (validator rejects headers-only config)

## Bugs Found & Fixed

### OAuth 401
- **Cause:** `pi.registerProvider("anthropic", { headers: { "anthropic-beta": "..." } })` uses `mergeHeaders()` which does `Object.assign` — our value REPLACES the built-in one, stripping OAuth-specific betas
- **Impact:** All OAuth users get 401 on every API call
- **Fix:** Removed `registerProvider` call. Anthropic `context_management` feature deferred to hoard-lab
- **Root cause:** No way to APPEND to comma-delimited header values from extension-land

### content.some crash
- **Cause:** `buildBreadcrumb()` returned a string, set as `msg.content`. Pi's `convertContentBlocks(msg.content)` expects `(TextContent | ImageContent)[]` and calls `content.some()` → TypeError
- **Impact:** Crashes when tiered mode is enabled and hygiene masking activates
- **Fix:** `buildBreadcrumb()` now returns `[{ type: "text", text: breadcrumb }]` when original content was an array, string when it was a string

## What's NOT Done Yet

- [ ] **Phase 4:** Observability (compaction history, tier savings, thrashing detection)
- [ ] **hoard-lab extension:** Provider beta feature manager (planned, spec in progress)
- [ ] **Anthropic context_management:** Blocked on safe header injection (hoard-lab)
- [ ] **Testing:** Enable tieredMode and verify end-to-end

## Type Check Status

9 pre-existing errors (all `session_switch`/`session_fork`). Zero new errors.
