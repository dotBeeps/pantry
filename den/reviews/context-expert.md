# Dragon Council Review: Context Engineering

**Reviewer:** Context Engineering Expert  
**Date:** 2026-04-02  
**Documents Reviewed:** `hoard.md` (architecture plan), `pi-context-pipeline.md` (pi internals), `hoard-research.md` (research survey §2)  
**Verdict:** Architecturally sound with specific token budget and compaction risks that need addressing before implementation.

---

## 1. Token Budget Analysis

### The Claim
> Global pinned ≤ 300 tokens, project pinned ≤ 300 tokens, retrieved notes ≤ 1000 tokens

### The Reality

**Pinned notes (600 tokens total budget):**

Let's count what a realistic `user.md` looks like with Obsidian frontmatter:

```markdown
---
created: 2026-04-02T14:30:00Z
updated: 2026-04-02T14:30:00Z
tags: [identity, core]
pinned: true
source: user
---
# User

dot. she/her/pup/pups. Tabs, double quotes, semicolons.
Prefers direct, casual, playful communication.
ADHD — needs externalized task state, time anchoring.

See also: [[communication-style]], [[code-conventions]]
```

That's roughly **80-90 tokens** including frontmatter. The `dynamic.md`, `project.md`, and `tone.md` pinned notes will be similar. Four pinned notes at ~85 tokens each = **~340 tokens**. That's within the 600-token budget — barely.

**But here's the trap:** the plan says "and any note with `pinned: true` in frontmatter." That's an open-ended set. A user who pins 4 additional notes at 85 tokens each blows the budget to ~680 tokens. There's no enforcement mechanism described for the pinned budget — just a configuration number.

**Frontmatter tax per note:** YAML frontmatter with `created`, `updated`, `tags`, `confidence`, `pinned`, `source` costs **~35-45 tokens** per note. That's a fixed overhead. For retrieved notes at ~100 tokens each, frontmatter is 35-45% waste. The `summary` field in frontmatter for linked refs is smart — but it adds another 10-20 tokens per note that has one.

**Wikilink tax:** Each `[[wikilink]]` costs 4-6 tokens (brackets + name). A well-linked note with 3-4 wikilinks adds 15-25 tokens of link syntax that provides zero semantic value to the LLM. The LLM doesn't know what `[[code-conventions]]` resolves to unless the linked note is also injected.

**Retrieved notes (1000 tokens):**

At ~100 tokens per note (content after frontmatter), that's 10 notes max. With frontmatter included, it's ~140 tokens per note, so **7 notes**. With the graph expansion (linked summaries, tag clusters), you're looking at 5-6 notes with any meaningful depth.

This is tight but workable for a 200K context window. The concern isn't the absolute size — 1600 tokens is <1% of Claude's context. The concern is **signal density**.

### Recommendation

**Strip frontmatter before injection.** The LLM doesn't need `created`, `updated`, `confidence`, or `source` fields. Parse them in TypeScript for retrieval decisions, then inject only the content + a minimal header:

```markdown
## Memory: dot's code style [preference, high-confidence]
Tabs, double quotes, semicolons, trailing commas.
Confirmed across hoard, pi extensions, and personal projects.
```

This cuts per-note cost by 30-40%. Your 1000-token retrieved budget now fits 10-12 notes instead of 5-7.

**Hard-cap pinned notes.** Either limit to the 4 canonical pinned notes (`user.md`, `dynamic.md`, `project.md`, `tone.md`) or enforce a `maxPinnedNotes` setting with a clear error when exceeded. "Pinnable" is a foot-gun without a cap.

**Drop wikilinks from injected content.** Replace `[[code-conventions]]` with nothing (or the summary text if the linked note is being injected). Wikilinks are for graph traversal in TypeScript, not for the LLM's benefit.

---

## 2. Injection Strategy

### The Split: systemPrompt (pinned) vs. message (retrieved)

The plan injects pinned notes via `before_agent_start` → `systemPrompt` addition, and retrieved notes as a custom `message`. This is a smart split, but the attention implications need examination.

**System prompt placement (pinned notes):**

The plan says: "Our addition goes at the end, so it's fresh in the LLM's attention." This is correct for Anthropic's implementation — system prompt content at the end gets slightly higher attention weight due to recency. But there's a subtlety: the system prompt is **cached** by pi's prompt caching. If pinned notes change between turns (a dream updates `user.md` mid-session), the cache breaks, and you pay full input tokens for the entire system prompt again.

For truly stable pinned notes (identity, project overview), system prompt is optimal. For anything that might change mid-session, it's wasteful.

**Custom message placement (retrieved notes):**

> "Custom messages via `message` are **persistent** — they're stored in the session JSONL and survive turns."

This is the critical design decision. **Retrieved memory notes become permanent conversation history.** Every turn after injection, those notes consume context tokens. By turn 15, you might have 5 injections × 1000 tokens = 5000 tokens of stale memory messages that the LLM keeps re-reading.

The plan acknowledges this with the `context` event pruning (stage 2 of the two-stage system), but the session JSONL still grows. After compaction, those messages either get summarized (adding their content to the compaction summary — see §3) or pruned (losing potentially useful memories).

### Attention Dynamics

LLMs exhibit a well-documented attention pattern:
1. **System prompt** — moderate attention, stable across turns
2. **Early conversation messages** — declining attention as conversation grows
3. **Recent messages** — highest attention

Pinned notes in the system prompt get stable, moderate attention. Retrieved notes as early custom messages get **declining attention over time**. By turn 10, a memory injected on turn 1 is in the "forgotten middle" of the context.

### Recommendation

**Don't inject retrieved notes as persistent messages. Inject them as transient context via the `context` event instead.**

Pattern:
1. `before_agent_start`: inject pinned notes into `systemPrompt` (stable, cached)
2. `context` event: inject retrieved notes by **prepending** them to the message list as a synthetic user message or system context block, **freshly assembled each turn**

This way:
- Retrieved notes are always recent (near the end of context, high attention)
- They don't accumulate in session JSONL
- They don't bloat compaction summaries
- They can change between turns without penalty
- Budget control is trivial — you assemble fresh each turn with current budget

The `before_agent_start` → `message` return is a trap for memory injection because persistence is the opposite of what you want for dynamic context. Use it for things that **should** be part of the conversation record (like ADHD time checks with `display: false`). Don't use it for retrieved memories.

If you must use `before_agent_start` for retrieved notes (e.g., for session auditability), tag them with a `customType` like `"memory-injection"` and **always strip prior injections** in the `context` event before re-injecting fresh ones. The plan hints at this but doesn't make it explicit.

---

## 3. Compaction Interaction

### The Risk

The plan hooks `session_before_compact` to "preserve memories." But the interaction is more nuanced than "preserve" vs. "lose."

**Default compaction behavior** (from the pipeline doc):

Pi's compaction generates an LLM summary with this structure:
```markdown
## Goal
## Constraints & Preferences
## Progress
## Key Decisions
## Next Steps
## Critical Context
<read-files>
<modified-files>
```

If retrieved memory notes are in the message stream when compaction triggers, the compaction LLM will **include memory content in its summary**. This means:

1. `user.md` content ("dot prefers tabs") gets summarized into "Constraints & Preferences"
2. Project observations get folded into "Key Decisions" or "Critical Context"
3. The compaction summary now contains a mix of **session work** and **injected memories**

On the next compaction, the summary-of-summary includes memories again. Over 3-4 compactions, memory content **accumulates in compaction summaries** even though the original notes haven't changed. The compaction LLM can't distinguish "this was injected context" from "this was discussed in conversation."

**The bloat trajectory:**

```
Session start: 1600 tokens of memory injection
Compaction 1: Summary includes memory → ~400 tokens of memory in summary
Session continues: 1600 tokens fresh injection + 400 tokens in summary = 2000 tokens of memory
Compaction 2: Summary includes both → ~600 tokens of memory in summary
...
Compaction N: Memory content grows in summaries while also being re-injected fresh
```

This is a slow leak. Not catastrophic, but it degrades compaction quality over time.

### The Plan's Hook

The plan says you can:
- Provide a custom compaction summary that preserves key memories
- Cancel compaction (aggressive)
- Re-inject after compaction via `session_compact`

**Option 1 (custom summary)** is dangerous — you're now responsible for ALL compaction quality, not just memory. One bug in your summary generation and the agent loses critical session context.

**Option 2 (cancel)** is a non-starter for obvious reasons.

**Option 3 (re-inject after)** doesn't help because the damage is in the summary generation, not in what comes after.

### Recommendation

**Strip memory injections before compaction sees them.**

Use `session_before_compact` to modify `preparation.messagesToSummarize`: filter out any messages with `customType: "memory-injection"` before the compaction LLM processes them. The compaction summary should contain only actual session work.

Actually — looking at the `session_before_compact` event signature more carefully:

```typescript
interface SessionBeforeCompactEvent {
  preparation: CompactionPreparation;
  branchEntries: SessionEntry[];
  customInstructions?: string;
  // ...
}
```

You get `messagesToSummarize` but the return type only allows `cancel` or providing a complete custom `compaction`. You can't selectively filter messages from the default compaction pipeline.

**This means you have two clean options:**

1. **Use `customInstructions`** — if the compaction LLM accepts custom instructions, add: "Ignore any messages with customType 'memory-injection' — these are injected context, not session content." But this relies on the compaction LLM following instructions perfectly, which is fragile.

2. **Take over compaction entirely** — provide a custom summary that explicitly excludes memory content. This is more work but more reliable. You'd call the same compaction LLM yourself, but with filtered messages. This is the correct approach if you want guarantees.

3. **Best option: don't put memory in persistent messages at all** (see §2 recommendation). If memory is injected only via the `context` event as transient context, it never enters the session JSONL, and compaction never sees it. Problem eliminated at the source.

---

## 4. Two-Stage Inject-Then-Prune

### The Pattern

```
before_agent_start: inject everything relevant (generous)
     ↓
context event: prune if approaching budget (conservative)
```

### Assessment: Elegant in Theory, Fragile in Practice

**The elegance:** separation of concerns. Stage 1 is about relevance (what's useful?). Stage 2 is about budget (what fits?). Each event handler has a clear responsibility.

**The fragility:** extension ordering.

Pi's events are chained — handlers run in extension load order. If another extension also injects content in `before_agent_start` and another extension also prunes in `context`, the interactions are unpredictable:

```
Extension A (memory): injects 1600 tokens in before_agent_start
Extension B (ADHD):   injects 200 tokens in before_agent_start  
Extension C (other):  injects 500 tokens in before_agent_start
     ↓
Extension A (memory): prunes own injections in context event
Extension C (other):  also prunes in context event — but might prune YOUR messages
```

**Key question:** can your `context` handler distinguish your own injections from other extensions' messages? Yes — via `customType`. But can you trust other extensions not to prune YOUR messages? No. There's no ownership model in the `context` event. Any handler can remove any message.

**Another fragility:** the `context` event receives a deep copy. Your handler prunes memory injections, but a later handler might re-add them (unlikely) or add content that pushes context over budget after your pruning (likely). There's no global budget coordinator.

### The Budget Competition Problem

With multiple context-injecting extensions, who owns the budget?

```
Context window: 200,000 tokens
System prompt:   ~8,000 tokens (base + tools + skills)
Reserve:         16,384 tokens
Available:      175,616 tokens
Session history: ~150,000 tokens (growing)
Memory budget:    1,600 tokens
ADHD budget:        200 tokens
Other extensions:     ? tokens
```

When session history grows large, compaction triggers. But before compaction, your memory injections are competing with actual conversation for the same space. If session history is 174,000 tokens and you inject 1,600 tokens of memory, you've pushed total context to 183,600+ tokens — potentially triggering compaction earlier than necessary. Your memory injection effectively **reduces the user's working conversation length** by 1,600 tokens.

At 1,600 tokens this is negligible. But if the user configures `retrievedTokens: 5000` and pins 10 notes, the budget becomes material.

### Recommendation

**Coordinate budgets internally.** Since tone, memory, ADHD, and guardrails are all in the same extension package, use a single budget coordinator:

```typescript
const TOTAL_INJECTION_BUDGET = 2000; // configurable
const allocations = {
  pinned: 0.35,     // 700 tokens
  retrieved: 0.50,  // 1000 tokens
  adhd: 0.10,       // 200 tokens
  guardrails: 0.05, // 100 tokens
};
```

A single `context` handler for the entire hoard extension, not separate handlers per concern. This eliminates internal competition and gives you one clean place to make budget tradeoffs.

**For external extension competition:** document your `customType` values and budget expectations. There's no platform-level solution for this — it's a pi limitation. Your extension should be a good citizen by keeping total injection under 2000 tokens by default.

---

## 5. Graph Traversal Cost

### The Claim
> `vault.ts` assembles memory context in pure TypeScript — no LLM calls for graph traversal.

### File I/O Analysis

**Vault scan on session start:**
- Global vault: up to 200 notes × `fs.readFile()` = 200 file reads
- Project vault: up to 100 notes × `fs.readFile()` = 100 file reads
- Total: 300 file reads to build the in-memory graph

**Per-note parsing cost:**
- Read file: ~0.5ms (SSD, small markdown files)
- Parse YAML frontmatter: ~0.1ms (simple regex or `yaml.parse()`)
- Extract wikilinks: ~0.05ms (regex scan)
- Total per note: ~0.65ms

**Full vault scan:** 300 notes × 0.65ms = **~195ms**. Acceptable for session start. Not acceptable per-turn.

**Per-turn assembly (the hot path):**

For each `before_agent_start` / `context` event:
1. Read pinned notes: 4 file reads (~2ms)
2. Expand linked notes (depth 1): ~4-8 linked notes × 1 file read = ~4ms
3. Tag clustering: if pre-indexed, ~0ms (in-memory filter). If not, grep over 300 files = **~150ms**.

**The real question:** does the plan cache the vault index?

The plan describes `vault.ts` with parse/resolve/search functions but doesn't explicitly mention caching. If every turn re-scans the vault, you're paying 150-200ms per turn for tag clustering. If the vault is indexed once at session start and updated on writes, the per-turn cost drops to <5ms.

### Recommendation

**Build a VaultIndex at session start, update incrementally.**

```typescript
interface VaultIndex {
  notes: Map<string, NoteMetadata>;  // path → parsed frontmatter + links
  byTag: Map<string, Set<string>>;   // tag → set of paths
  backlinks: Map<string, Set<string>>; // path → set of paths linking TO it
  lastScan: number;
}
```

- Full scan on `session_start` event (~200ms, acceptable)
- Incremental update when the `memory` tool writes a note (update 1 entry, ~1ms)
- Skip re-scan on `before_agent_start` — use cached index
- Invalidate on `session_compact` (dream may have changed vault)

**Watch for daemon/dream race conditions.** If the daemon updates the vault while a pi session is active, the cached index is stale. The plan mentions "append-only for new observations" which is safe for the index (new files won't break existing lookups), but edits to pinned notes could cause stale reads. A simple file-watcher or mtime check on pinned notes (4 files) is cheap insurance.

**The 200-note limit is your best friend here.** At 200 notes, everything fits in memory. Don't over-engineer this — a flat `Map<string, NoteMetadata>` with 200 entries is trivially fast to scan, filter, and sort. No need for vector DBs, embeddings, or fancy indexing. The wikilink graph IS your relevance signal.

---

## 6. Dream Injection & Stale Observations

### The Risk

Dreams produce vault changes (new notes, updated notes, promoted notes) that get injected in the next session. The concern: **stale dream observations polluting context.**

**Scenario:**

1. Session A: working on panel refactor. Dream creates `observations/panel-refactor-approach.md` with notes about the implementation strategy.
2. Session B (2 weeks later): panel refactor is done, merged, shipped. But the observation note is still in the vault with `confidence: 0.8` and recent `updated` timestamp.
3. Memory retrieval picks up the stale note because it matches tags (`#panels`, `#refactor`) from Session B's project context.
4. The LLM sees outdated implementation notes and may reference deprecated approaches.

**Another scenario:**

1. Dream extracts a preference: "dot prefers X" with `confidence: 0.6`.
2. Three sessions later, dot explicitly contradicts X.
3. The next dream should catch this — but if dreams are skipped (short sessions, dream disabled), the stale preference persists indefinitely.

### Assessment

The plan has **decay mechanisms** but they're all in the dream cycle:
- Pruning: "remove stale observations (old + low confidence + no links)"
- Confidence adjustment: "find patterns across observations"
- Promotion/demotion based on recurrence

If dreams run reliably, staleness is self-correcting. If dreams are skipped (sessions under 10 messages, dream disabled, daemon not running), stale notes accumulate.

### Recommendation

**Add a staleness signal to retrieval, independent of dreaming.**

When `vault.ts` assembles retrieved notes, apply a **recency decay** to relevance scoring:

```typescript
function relevanceScore(note: NoteMetadata, context: TaskContext): number {
  const tagMatch = countMatchingTags(note, context);
  const linkProximity = graphDistance(note, context.currentNotes);
  const recency = daysSince(note.updated);
  
  // Observations older than 30 days with no recent backlinks get penalized
  const decay = note.tags.includes('observation') && recency > 30 
    ? Math.max(0.3, 1 - (recency - 30) / 90)  // Linear decay from day 30-120
    : 1.0;
  
  return (tagMatch * 0.4 + linkProximity * 0.3 + note.confidence * 0.3) * decay;
}
```

This ensures stale observations naturally fall below the retrieval threshold even without dream pruning. Pinned notes are exempt (they're always injected regardless of score).

**For contradicted preferences:** the `memory` tool should support explicit contradiction — when the agent notices a preference conflict, it should update the existing note rather than creating a new one. The dream cycle handles this, but the agent should also handle it in real-time when the contradiction is explicit.

---

## 7. Recommendations: Maximum Signal-to-Noise Architecture

If I were architecting this context flow from scratch, here's what I'd do differently — and what I'd keep.

### Keep (the plan gets these right)

1. **Obsidian vault as graph storage.** Wikilinks are a zero-cost relevance signal that doesn't require embeddings. For 200 notes, this is the right complexity level.

2. **Deterministic TypeScript graph traversal.** No LLM tokens for retrieval. The `expand`/`expand-depth`/`expand-filter` frontmatter system is clever and cheap.

3. **Separation of personality and tone.** Personality in system prompt (stable, cached). Tone per document type (dynamic, targeted). Clean separation.

4. **Dream as consolidation.** Memory pruning/promotion via periodic LLM review is the right pattern. Doing it outside the main conversation loop is correct.

5. **Two-tier vault hierarchy.** Global (travels with user) vs. project (stays with repo). Clean, intuitive, matches pi's own settings hierarchy.

### Change

1. **Inject retrieved notes transiently, not persistently.**

   The single most impactful change. Use `context` event to inject fresh retrieved notes each turn, not `before_agent_start` → `message`. This:
   - Eliminates compaction contamination (§3)
   - Keeps attention fresh (§2)  
   - Simplifies budget control (§4)
   - Removes the need for complex pruning of stale injections

   Pinned notes stay in `systemPrompt` (stable, cached, high-value).

2. **Strip frontmatter from injected content.**

   Parse frontmatter for TypeScript decisions. Inject only semantic content with a minimal header. Save 30-40% token budget per note.

   Instead of:
   ```markdown
   ---
   created: 2026-04-02T14:30:00Z
   updated: 2026-04-02T14:30:00Z
   tags: [preference, code-style]
   confidence: 0.9
   source: session
   ---
   # dot prefers tabs over spaces
   
   Corrected spaces to tabs in [[project-hoard]]. Confirmed in
   [[2026-04-02-style-session]] when setting up the #commit skill.
   
   See also: [[code-conventions]], [[user]]
   ```
   (~130 tokens)

   Inject:
   ```markdown
   **dot prefers tabs over spaces** *(high confidence)*
   Corrected spaces to tabs in hoard. Confirmed when setting up commit skill.
   ```
   (~35 tokens)

   That's a 73% reduction. Your 1000-token retrieved budget now holds **28 notes** instead of 7.

3. **Single budget coordinator, not per-concern handlers.**

   One `context` handler for the entire hoard extension. Internal allocation: pinned (35%), retrieved (50%), ADHD (10%), guardrails (5%). Adjust ratios based on what's available — if no ADHD checks are due, retrieved gets the extra 10%.

4. **Cache the vault index.**

   Full scan on session start. Incremental updates on writes. Mtime check on pinned notes per turn (~0.1ms for 4 `stat()` calls). Never re-scan the full vault mid-session.

5. **Add recency decay to retrieval scoring.**

   Independent of dream cycles. Observations older than 30 days with no fresh backlinks get exponentially deprioritized. Prevents stale context without relying on dream reliability.

6. **Measure and log actual token costs.**

   Add a debug mode that logs actual token counts for each injection component:
   ```
   [memory] Turn 3: pinned=342tok, retrieved=891tok, adhd=0tok, total=1233tok (budget: 1600)
   ```
   You can't optimize what you don't measure. The budget numbers in the plan are estimates — real notes with real wikilinks and real frontmatter will vary.

### Architecture Summary

```
Session Start
  └─ VaultIndex.scan() → cached graph (200ms, once)

Each Turn:
  ├─ before_agent_start
  │   └─ systemPrompt += pinned notes (stripped frontmatter, ~400 tokens)
  │       ├─ user.md (identity)
  │       ├─ dynamic.md (relationship)  
  │       ├─ project.md (project context)
  │       └─ tone.md (active style)
  │
  ├─ context event (single handler, runs late)
  │   ├─ Retrieve relevant notes from VaultIndex
  │   │   ├─ Tag match against recent tool calls / user prompt
  │   │   ├─ Graph proximity to pinned notes (1-hop)
  │   │   ├─ Recency decay for observations
  │   │   └─ Hard budget: 1000 tokens
  │   ├─ Strip frontmatter, resolve wikilinks to inline text
  │   ├─ Inject as synthetic context block (not persistent message)
  │   ├─ Add ADHD time check if interval elapsed
  │   └─ Total injection: ≤1600 tokens
  │
  └─ session_before_compact
      └─ (No action needed — memory isn't in session messages)

Dream Cycle (session end / compaction):
  └─ Review session → update vault → VaultIndex invalidated
```

**Total context cost per turn: ~1200-1600 tokens.** Less than 1% of a 200K context window. High signal density because every injected token carries semantic value (no frontmatter, no wikilink syntax, no timestamps the LLM doesn't need).

**Compaction interaction: none.** Memory lives outside the session message stream. Compaction summarizes only actual work. Clean separation.

**Attention profile: optimal.** Pinned notes in system prompt (stable attention). Retrieved notes injected fresh near recent messages (high attention). No "forgotten middle" problem.

---

## Summary Verdict

The plan's context architecture is **80% correct**. The vault structure, graph traversal, dream consolidation, and budget philosophy are all sound. The two changes that matter most:

1. **Transient injection via `context` event** instead of persistent messages via `before_agent_start`. This single change eliminates compaction contamination, attention decay, and session bloat simultaneously.

2. **Strip frontmatter before injection.** Obsidian metadata is for TypeScript, not for the LLM. This triples your effective note capacity within the same token budget.

Everything else — caching, decay scoring, budget coordination — is optimization on top of a solid foundation. The bones are good. The injection plumbing needs redirecting.

---

*Context is not about how much you can fit. It's about how much signal you can pack per token. Every frontmatter field the LLM reads but doesn't need is a token stolen from something it does need.*
