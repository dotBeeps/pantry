# dragon-lab

**Status:** 🥚 planned
**Code:** `berrygems/extensions/dragon-lab.ts` *(does not exist yet)*

## What It Does

Auth-aware provider beta header manager for pi. Solves a header merge problem in `pi.registerProvider()` where providing custom headers completely replaces `anthropic-beta` instead of appending — breaking OAuth beta users with 401s.

Unblocks `anthropicContextEdits` in dragon-digestion.

## Blocking

- `dragon-digestion` — `anthropicContextEdits` is dead-coded pending this feature

## What's Here

- `hoard-lab.md` — full spec with three implementation options, load-order notes, and open questions
- `research-oauth-headers.md` — research on Anthropic OAuth beta header requirements and the specific 401 failure mode
- `research-context-pipeline.md` — pi-mono context management investigation (Anthropic native context edits API)
