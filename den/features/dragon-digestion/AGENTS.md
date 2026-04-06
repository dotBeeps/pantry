# dragon-digestion

**Status:** 🔥 beta
**Code:** `berrygems/extensions/dragon-digestion.ts`

## What It Does

Tiered compaction system for pi. Five tiers of progressive context management — from lightweight hygiene passes through full structural summarization. Auto-triggers based on token usage; each tier escalates compression aggressiveness.

## Known Issues / Blockers

- `anthropicContextEdits` support is dead-coded — blocked on `dragon-lab` (auth-aware provider header manager)
- Un-logged dev work from the 2026-04-06 session may not be captured in history

## What's Here

- `dragon-digestion-v2.md` — spec for v2 features including tier overrides and anchored updates
- `compaction-techniques.md` — research on LLM compaction strategies
- `dragon-digestion-review.md` — internal design review
- `pi-context-pipeline.md` — research on pi's context pipeline internals
- `review-context-expert.md` — external expert review of the compaction approach
