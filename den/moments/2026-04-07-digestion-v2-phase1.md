# Dragon Digestion v2 — Phase 1 Session Snapshot

**Date:** 2026-04-07 ~00:30
**Session:** Late-night research + implementation sprint
**Participants:** Ember 🐉 + dot (very melty by the end)

---

## What Happened

### Research Phase
- Investigated pi-mono source code for Anthropic `context_management` API compatibility
- **Key finding:** `before_provider_request` payload passthrough confirmed — extra fields reach the API at runtime via `{ ...params, stream: true }` spread in `client.messages.stream()`
- **Key finding:** Beta header is the only blocker — `context-management-2025-06-27` not in pi's default headers
- **Key finding:** Three edit types available: `clear_tool_uses_20250919`, `clear_thinking_20251015`, `compact_20260112` (server-side compaction!)
- **Resolution:** Beta header can be injected entirely via `~/.pi/agent/models.json` provider headers — no pi-mono PR needed

### Implementation Phase
- Two parallel workers deployed:
  - **Worker A:** Tier engine in `dragon-digestion.ts` (+293 lines)
  - **Worker B:** Compaction templates in `lib/compaction-templates.ts` (153 lines, new file)
- Both completed with zero new type errors

## Files Changed

### Created
- `berrygems/lib/compaction-templates.ts` — Structured summary template, strategy presets, prompt builders
- `~/.pi/agent/models.json` — Anthropic beta header config for `context_management`
- `den/moments/2026-04-07-digestion-v2-phase1.md` — This snapshot

### Modified
- `berrygems/extensions/dragon-digestion.ts` — Added tier engine (types, pure functions, message filters, event handlers)
- `den/plans/dragon-digestion-v2.md` — Updated status, Anthropic section rewritten with source findings, config-only approach

## What's Implemented

### Tier Engine (`dragon-digestion.ts`)
- `DigestSettingsV2` interface + `DEFAULT_DIGEST_V2` defaults
- `getTierThresholds(summaryThreshold, overrides)` — derives 4 tier activation points from one knob
- `getCurrentTier(usagePercent, thresholds)` — returns active tier 0-4
- `applyHygiene(messages, keepResults)` — Tier 0, always-on tool result masking with breadcrumbs
- `applyLightPrune(messages, keepResults)` — Tier 2, reduced keep + truncation
- `applyHeavyPrune(messages)` — Tier 3, aggressive masking + assistant text truncation
- `readDigestSettingsV2(cwd)` — reads all new settings from `hoard.digestion.*`
- `context` event handler — applies tier-appropriate filtering when `tieredMode: true`
- `before_provider_request` handler — injects Anthropic `context_management` edits when enabled
- `shouldTrigger()` — updated to use Tier 4 threshold in tiered mode
- `getContextUsage()` added to panel component

### Compaction Templates (`lib/compaction-templates.ts`)
- `STRUCTURED_SUMMARY_TEMPLATE` — 8-section markdown format
- `STRATEGY_PRESETS` — default, code, task, minimal, debug
- `buildFirstCompactionPrompt()` — first compaction prompt builder
- `buildAnchoredUpdatePrompt()` — incremental merge prompt builder
- `getStrategyById()` — lookup with fallback

### Config
- `~/.pi/agent/models.json` — adds `context-management-2025-06-27` to Anthropic beta headers

## What's NOT Done Yet

- [ ] **Phase 2 wiring:** `session_before_compact` handler to actually use templates for compaction takeover
- [ ] **Phase 3:** Panel UI — tier markers on context bar, summary threshold slider, tier mode toggle
- [ ] **Phase 4:** Observability — compaction history, tier savings tracking, thrashing detection
- [ ] **Phase 5:** Advanced — `/digestion preview`, custom strategies, task-boundary awareness
- [ ] **Testing:** Enable `tieredMode: true` and run a real session to verify tier transitions
- [ ] **Anthropic testing:** Enable `anthropicContextEdits: true` and verify `context_management` reaches the API

## Key Design Decisions Made This Session

1. **Config-only beta header:** `models.json` provider headers instead of `pi.registerProvider()` code or pi-mono PR
2. **Dual-path architecture:** Generic tiers via `context` event + Anthropic-specific `context_management` as additive layer
3. **`compact_20260112` for Tier 4a:** Server-side compaction with our strategy instructions on Anthropic models
4. **`tieredMode: false` default:** Opt-in during development, flip after testing

## Type Check Status

9 pre-existing errors (all `session_switch`/`session_fork` type mismatches across 4 extensions). Zero new errors from this session's changes.
