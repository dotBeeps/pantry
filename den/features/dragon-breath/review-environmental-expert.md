# 🌿 Environmental Efficiency Review: Hoard Architecture

**Reviewer:** Verdant — Environmental Efficiency Expert, Dragon Council  
**Date:** 2026-04-02  
**Documents reviewed:** `.pi/plans/hoard.md`, `.pi/research/hoard-research.md`  
**Stance:** Friend to the architect. Looking to help you build this sustainably, not to kill it.

---

## Executive Summary

The hoard architecture is thoughtful and well-bounded — the vault size limits, token budgets, and skip conditions show you've already been thinking about cost. But some design choices compound in ways that aren't obvious until you do the napkin math. The dream engine is the biggest concern: it turns every session into two LLM calls (session-end + compaction), and for an active developer, that adds up fast. The per-prompt overhead is moderate but persistent. The daemon is overbuilt for the I/O it actually does.

**Overall verdict:** Sustainable with targeted changes. The bones are good. A few knobs need turning.

---

## 1. Dream Engine Cost

### The Math

Each dream cycle: **Sonnet, low thinking, ~4K output tokens.**

Input for a dream call includes:
- Session content (summarized): ~2,000–4,000 tokens
- Dream system prompt + instructions: ~1,500 tokens
- Existing vault contents (pinned + recent): ~1,500–2,000 tokens
- **Total input per dream: ~5,000–7,500 tokens**
- **Total output per dream: ~4,000 tokens (budget cap)**

**Per-dream cost (Sonnet 4, April 2026 pricing):**
- Input: ~7K tokens × $3/MTok = **$0.021**
- Output: ~4K tokens × $15/MTok = **$0.060**
- **Per dream: ~$0.08**

**Default triggers: session-end + compaction.**

For an active developer doing 5–10 sessions/day:
- Session-end dreams: 5–10/day
- Compaction dreams: varies — maybe 2–5/day for long sessions (compaction fires when context fills up, heavy coding sessions can trigger it 1–2 times)
- **Conservative estimate: 7–15 dream cycles/day**
- **Daily cost: $0.56–$1.20**
- **Monthly cost: $17–$36**
- **Annual cost: $200–$430**

For energy, using [IEA/Anthropic estimates](https://iea.org) of ~0.002–0.005 kWh per Sonnet request:
- **7–15 dreams/day × 0.003 kWh = 0.02–0.05 kWh/day**
- **Annual: ~7–18 kWh** just from dreaming
- That's roughly equivalent to charging a laptop for 2–4 days

### Is It Sustainable?

**Financially:** $17–$36/month is meaningful for an individual developer's tooling budget, but not catastrophic. It's roughly a Netflix subscription. The question is whether it *feels* worth it — if 60% of dream cycles produce no vault changes (short or repetitive sessions), that's $10–$20/month wasted.

**Environmentally:** 7–18 kWh/year from dreaming alone is modest in absolute terms but non-trivial relative to the actual coding assistance (which the developer would be paying for anyway). Dreaming is *additional* compute that doesn't directly help write code — it's maintenance overhead.

### Concern: Compaction + Session-End Double-Dreaming

A long session that triggers compaction will dream *twice* — once on compaction, once on session end. The session-end dream reviews content that was already partially processed by the compaction dream. This is redundant work.

**Recommendation:** If a dream ran during compaction within the last N minutes of session end, skip the session-end dream. Add a `lastDreamTimestamp` to avoid double-processing.

---

## 2. Per-Prompt Overhead (Context Inflation)

### What Gets Injected Every Turn

From the plan:
- **Pinned notes (system prompt):** ~600 tokens (300 global + 300 project budget)
- **Retrieved memory (custom message):** ~1,000 tokens
- **Time checks:** ~20 tokens every 15 minutes (negligible)
- **Progress reinforcement:** ~50–100 tokens at breakpoints (intermittent)
- **Active style content:** ~200–400 tokens (style file injected)

**Total per-turn overhead: ~1,800–2,100 tokens of additional input context.**

### Cumulative Cost

An active developer sending 50–100 prompts per session, 5–10 sessions per day:
- **Low end:** 250 prompts/day × 1,800 tokens = 450K additional input tokens/day
- **High end:** 1,000 prompts/day × 2,100 tokens = 2.1M additional input tokens/day

**Daily overhead cost (Sonnet input pricing $3/MTok):**
- Low: 450K × $3/MTok = **$1.35/day**
- High: 2.1M × $3/MTok = **$6.30/day**

**Monthly: $40–$190 in additional input token costs.**

This is the bigger number. Not the dreams — the *context inflation on every single prompt*. 1,800 tokens doesn't sound like much, but it compounds across hundreds of prompts.

### The Compounding Problem

These tokens aren't free in another sense: they consume context window space. In a 200K context window, 2K tokens is 1%. But context isn't infinite — as conversation grows, those 2K tokens of memory/style/time injection are competing with actual code context, file contents, and tool results. Near compaction (when the window is fullest), every token matters.

**Worse:** the injected memory messages are *persistent* in session JSONL. They accumulate across turns. If memory is injected at `before_agent_start` as a custom message each turn, and you have 50 turns, that's 50 × 1,000 = 50,000 tokens of memory messages in the session history — even though they're all saying roughly the same thing.

### Recommendation: Deduplicate Memory Injection

Don't inject a new memory message every turn. Options:
1. **Inject once at session start**, then only inject *changes* (new observations, updated notes)
2. **Use `context` event to prune** stale memory messages before they reach the LLM — the plan mentions this but should make it the *default* behavior, not optional
3. **Hash the memory content** — if it hasn't changed since last injection, skip the message
4. **Put pinned notes in system prompt only** (already planned) — these are rebuilt each turn anyway, so they don't accumulate in session history

This alone could reduce cumulative overhead by 60–80%.

---

## 3. Daemon Periodic Tasks

### What the Daemon Does

- **Hourly:** Scan vaults for broken `[[wikilinks]]` — pure file I/O, grep across ~300 files
- **Daily:** Prune notes with `confidence < 0.3`, older than 30 days, no backlinks — file I/O + frontmatter parsing
- **On demand:** Full vault health check

### Resource Usage

A Go daemon sitting idle:
- **Memory:** ~5–15 MB RSS (Go runtime + socket listener)
- **CPU:** Effectively zero when idle
- **Disk I/O during scans:** Scanning 300 markdown files is ~1–2 MB of reads, takes <100ms on SSD

**Annual energy cost of keeping the daemon alive:**
- ~5 MB RAM × 8,760 hours = negligible (RAM power draw is fractional)
- Periodic file scans: ~0.001 kWh/year
- **Total: essentially zero**

### Is It Justified?

The daemon's environmental cost is a rounding error. The real question is *complexity* cost — another process to manage, another socket, PID files, auto-start logic, graceful degradation paths.

**But:** The plan already says "Phase 7: Daemon (If Needed)" and "graceful degradation preserved." The in-process `complete()` approach for Phase 3 is the right call.

### Recommendation

The daemon is fine *if it ever gets built*. But:
- **Don't build it unless Phase 3 reveals a blocking performance issue.** The plan already says this — enforce it.
- **Move hourly/daily maintenance to on-demand.** Run broken-link scan when `/dream maintenance` is called, or at session start (once per day, tracked by timestamp file). There's no user-facing benefit to scanning for broken links at 3 AM when nobody's working.
- **If the daemon does get built:** auto-stop after 1 hour of inactivity, not 4. An active developer will restart it naturally. 4 hours of idle daemon after the last session ends is waste.

---

## 4. Model Selection Impact

### Energy Per Request (Estimates, April 2026)

| Model | Params (est.) | Energy/Request | Relative Cost | Output $/MTok |
|-------|--------------|----------------|---------------|---------------|
| Haiku 3.5 | ~20B | ~0.0005 kWh | 1× | $1.00 |
| Sonnet 4 | ~70B | ~0.003 kWh | 6× | $15.00 |
| Opus 4 | ~200B+ | ~0.010 kWh | 20× | $75.00 |

*These are estimates based on public pricing ratios and published efficiency data. Actual energy varies by datacenter, hardware, and load.*

### Dream Cycle Model Comparison

For 10 dream cycles/day:

| Model | Daily Energy | Daily Cost | Monthly Cost |
|-------|-------------|------------|--------------|
| Haiku | 0.005 kWh | $0.01 | $0.30 |
| Sonnet | 0.03 kWh | $0.80 | $24 |
| Opus | 0.10 kWh | $5.50 | $165 |

**Haiku is 6× cheaper and 6× more energy-efficient than Sonnet for dreaming.**

### Is Haiku Sufficient?

Dream tasks are:
- Review session content (summarization — Haiku excels at this)
- Extract noteworthy items (pattern matching — Haiku is fine)
- Decide what to keep/update/merge (structured decision — Haiku can do this)
- Generate frontmatter + markdown notes (templated output — Haiku is great)
- Follow instructions for structured tool calls (Haiku handles tool calling well)

What Haiku might struggle with:
- Subtle highlight detection ("was this moment *fun*?") — needs some taste
- Nuanced promotion decisions (project → global) — needs judgment
- Discovering implicit ideas mentioned in passing — needs reading between lines

### Recommendation: Default to Haiku, Escalate When Needed

**Tier the dream cycle:**
1. **Routine dreams (session-end, <30 messages):** Haiku. Most sessions are bread-and-butter coding. Haiku can extract preferences and patterns just fine.
2. **Rich dreams (compaction, >50 messages, or manual `/dream`):** Sonnet. Longer sessions have more nuance worth catching. Manual dreams imply the user wants quality.
3. **Never Opus for dreaming.** The plan's "configurable model" is a footgun if someone sets it to Opus. Add a soft warning or cap.

This tiered approach would save ~70% on dream costs for a typical usage pattern (most sessions are short).

---

## 5. Vault Scaling

### Current Limits
- 200 global notes + 100 per project
- Graph traversal on every prompt (deterministic TypeScript, 0 LLM tokens)

### I/O Cost Per Prompt

Graph assembly algorithm:
1. Read pinned notes: ~5–10 files, ~50KB total
2. Extract `[[wikilinks]]` from expanded notes: string parsing, in-memory
3. Resolve links to files: `find`/`stat` calls, ~10–20 lookups
4. Tag clustering: `grep` or in-memory tag index, ~50–100 files scanned
5. Token budgeting: in-memory truncation

**Per-prompt I/O: ~100–200KB of file reads, ~50–100 stat() calls.**

On modern SSD with OS page cache: **<5ms.** After the first prompt (cold cache), subsequent prompts hit warm cache: **<1ms.**

### Scaling to 50+ Projects

With 50 projects × 100 notes each = 5,000 project notes + 200 global = **5,200 total notes.**

But only ONE project vault is active at a time (the current working directory). So per-prompt I/O is still just:
- 200 global notes (scanned for tags/pinned)
- 100 project notes (scanned for tags/pinned)
- **300 notes max per prompt**

**This scales fine.** The vault-per-project design is the right call — you never traverse all 5,200 notes at once.

### Potential Issue: Global Vault at 200 Notes

If the global vault hits 200 notes and tag clustering scans all of them on every prompt:
- 200 files × ~500 bytes frontmatter = 100KB of parsing
- Still <5ms with caching

**Not a problem today.** Could become one at 1,000+ notes if limits are raised.

### Recommendation

- **Current limits are fine.** 300 notes per prompt is well within I/O budget.
- **Add a frontmatter cache** — parse frontmatter once at session start, invalidate on vault writes. Avoids re-parsing 300 YAML headers every turn. Saves ~3ms/prompt × hundreds of prompts = noticeable improvement.
- **Consider a tag index file** — `vault/.tags.json` rebuilt by dream/maintenance, avoids grep-scanning all files for tag queries. This is a standard Obsidian plugin pattern.
- **Don't raise the limits casually.** 200/100 is a good default. If someone needs more, they're probably hoarding (ironic) notes that should be pruned.

---

## 6. Emergent Skills Pipeline

### What It Does

1. Dream counts tag frequency across recent sessions
2. Tags above threshold (5 uses across 3+ sessions) get flagged
3. Dream creates a skill proposal note

### Cost Analysis

**Tag counting:** Pure string operations on frontmatter tags + extracted keywords. No LLM calls. The data is already in vault notes — just count occurrences.

**Storage:** One small JSON or markdown note per skill proposal. Negligible.

**LLM cost:** Zero additional — tag analysis happens *within* the existing dream cycle. The dream prompt already includes vault contents; tag frequency is just another instruction in the dream system prompt.

### Potential Accumulation

Over months:
- Tag vocabulary grows: hundreds of unique tags
- Frequency table grows: one entry per tag per session
- Skill proposals accumulate: could be dozens of unreviewed proposals

**But:** This is all small data. A tag frequency table for 500 tags across 100 sessions is ~50KB. Skill proposals are markdown files. This is not "expensive processing" — it's bookkeeping.

### Recommendation

- **This is lightweight. No changes needed.**
- **One suggestion:** Expire old frequency data. Tags from 6+ months ago shouldn't influence today's skill proposals. Add a rolling window (e.g., last 90 days) to the frequency counter. Keeps the data fresh and bounded.
- **Cap unreviewed proposals** at ~10. If the user hasn't reviewed 10 skill proposals, stop generating new ones until they engage with `/dream history` or the proposals are surfaced. Avoids unbounded accumulation of ignored suggestions.

---

## 7. Recommendations Summary

### High Impact (Do These)

| # | Recommendation | Saves | Effort |
|---|---------------|-------|--------|
| **R1** | **Deduplicate memory injection** — don't inject identical memory messages every turn. Hash content, skip if unchanged. Prune old memory messages in `context` event by default. | ~60–80% of context inflation overhead ($25–$150/month) | Medium |
| **R2** | **Tier dream models** — Haiku for routine session-end dreams, Sonnet for rich/manual dreams | ~70% of dream costs ($12–$25/month) | Low |
| **R3** | **Skip redundant dreams** — if dreamed during compaction within last 30 min, skip session-end dream | ~30% fewer dream cycles | Low |
| **R4** | **Add frontmatter cache** — parse vault YAML once per session, invalidate on writes | Eliminates redundant I/O across hundreds of prompts | Medium |

### Medium Impact (Should Do)

| # | Recommendation | Saves | Effort |
|---|---------------|-------|--------|
| **R5** | **Lazy style injection** — only inject style content when writing tasks are detected (not every prompt). Most coding prompts don't need the writing style. | ~200–400 tokens/prompt on non-writing turns | Low |
| **R6** | **Reduce daemon idle timeout** from 4h to 1h | Minor energy, reduces background process lifetime | Trivial |
| **R7** | **Move periodic maintenance to on-demand** — broken link scans at session start (daily), not hourly | Eliminates unnecessary background I/O | Low |
| **R8** | **Rolling window for tag frequency** — last 90 days, not all-time | Keeps emergent skills data bounded | Low |

### Low Impact but Good Practice

| # | Recommendation | Rationale |
|---|---------------|-----------|
| **R9** | **Add dream skip conditions** — skip for sessions <10 messages (already planned), also skip for sessions that were pure file reading (no edits, no preferences to learn) | Avoids vacuous dreams |
| **R10** | **Log dream efficiency** — track how many dreams produce 0 vault changes. If >50%, the trigger threshold is too low. | Data-driven tuning |
| **R11** | **Cap skill proposals at 10 unreviewed** | Prevents unbounded accumulation |
| **R12** | **Add a tag index file** (`vault/.tags.json`) rebuilt on vault writes | Avoids repeated grep-scanning for tag queries |

### Anti-Recommendations (Don't Do These)

| What | Why Not |
|------|---------|
| Remove dreaming entirely | The memory curation value is real — just make it cheaper |
| Use embeddings/vector DB for memory retrieval | Adds infrastructure, energy cost of embedding generation, and complexity. The wikilink graph + tag system is more efficient for this scale. |
| Run dreams on every compaction AND session-end AND periodic | Pick two triggers max. Three is redundant. |
| Default to Opus for anything | The plan correctly avoids this, but "configurable model" without guardrails is a trap |

---

## 8. Total Environmental Footprint Estimate

### Before Recommendations

| Component | Daily Energy | Monthly Cost | Annual kWh |
|-----------|-------------|--------------|------------|
| Dream cycles (10/day, Sonnet) | 0.03 kWh | $24 | 11 kWh |
| Context inflation (500 prompts/day) | included in normal API use | $90 (additional input tokens) | — |
| Daemon (idle) | ~0 | ~0 | ~0.5 kWh |
| Vault I/O | ~0 | ~0 | ~0 |
| **Total additional** | **~0.03 kWh/day** | **~$114/month** | **~12 kWh/year** |

### After Recommendations (R1–R4)

| Component | Daily Energy | Monthly Cost | Annual kWh |
|-----------|-------------|--------------|------------|
| Dream cycles (7/day, mostly Haiku) | 0.005 kWh | $3 | 2 kWh |
| Context inflation (deduplicated) | included in normal API use | $25 (additional input tokens) | — |
| Daemon (1h timeout) | ~0 | ~0 | ~0.2 kWh |
| Vault I/O (cached) | ~0 | ~0 | ~0 |
| **Total additional** | **~0.005 kWh/day** | **~$28/month** | **~2.5 kWh/year** |

**Reduction: ~75% in cost, ~80% in energy.**

---

## 9. Final Thoughts

This architecture is not environmentally reckless. It's a memory system for a single developer's coding assistant — not a fleet of agents processing millions of requests. The total footprint (even before optimization) is comparable to running a home server or a couple of extra monitor-hours per day.

The biggest win is **R1 (deduplicating memory injection)**. It's where the most tokens are burned for the least marginal value. Injecting the same 1,000 tokens of memory context 500 times a day when it changes maybe twice is the definition of waste.

The second biggest win is **R2 (Haiku for routine dreams)**. Most session-end dreams are processing unremarkable coding sessions. Haiku can handle "extract preferences and patterns from 20 messages of TypeScript editing" without breaking a sweat.

The architecture's smartest environmental decision is already made: **deterministic graph traversal with zero LLM tokens for memory retrieval.** The wikilink + tag system avoids the embedding generation and vector search costs that most memory systems impose. Keep this. It's the right call at this scale.

Build it. Just build it with the cheap model for dreams and don't inject the same memory 500 times.

🐉🌿

---

*Reviewed with care for both the hoard and the world it lives in.*
