# Architectural Review: Tone, Memory & Daemon Plan

**Reviewer context:** Read full plan, pi context pipeline research, existing extensions (dots-panels, dragon-guard, todo-lists), project structure, and verified API surface against actual code.

---

## What's Strong (Keep These)

### 1. Event hook placement is exactly right
The plan correctly identifies `before_agent_start` as the primary injection point and understands the critical distinction: `systemPrompt` modifications are per-turn (rebuilt each time), while `message` injections are persistent (stored in session JSONL). The two-stage inject-then-prune pattern (`before_agent_start` → `context` event) is sound engineering. This shows genuine understanding of pi's pipeline.

### 2. Personality vs Tone separation is clean
The conceptual line — "personality is who I am, tone is how I write documents" — is clear and well-articulated. Moving `ember.md` out of `styles/` and into the vault is correct. The existing `personality.md` tone file (I read it — it's about document voice, not agent character) already demonstrates this distinction works.

### 3. Two-tier vault (global + project) follows pi's own pattern
Pi already uses `~/.pi/agent/` (global) vs `.pi/` (project) for settings and sessions. The vault mirrors this. Project overriding global on conflicts is consistent with pi's settings hierarchy.

### 4. Session state awareness
The plan correctly notes that memory must be external files (cross-session by design) while citing the AGENTS.md exception. The `session_before_compact` hook for memory preservation is the right call. Dragon-guard already demonstrates the `appendEntry` → `reconstructState` pattern for session-scoped state.

### 5. Graph traversal is deterministic (Section 7)
Pure TypeScript, 0 LLM tokens, frontmatter-controlled expansion with hard budget stops. This is one of the most well-specified parts of the plan. The `summary` field for linked refs is clever — it avoids pulling full note contents during graph assembly.

### 6. Graceful degradation philosophy
"The daemon is an accelerator, not a dependency" is the right design stance. Extension works without daemon. This de-risks the entire daemon phase.

---

## What I'd Change (With Evidence)

### 1. 🔴 The Dream Engine's `ctx.runLLM()` doesn't exist

The plan shows:
```typescript
const dreamResult = await ctx.runLLM({
    system: DREAM_SYSTEM_PROMPT,
    messages: [...]
});
```

**This API doesn't exist.** Pi extensions make LLM calls via `complete()` from `@mariozechner/pi-ai`, which requires manually resolving a model, getting API keys, and calling the function directly. See dragon-guard (`index.ts:306`) and todo-lists (`todo-lists.ts:332`) for the actual pattern:

```typescript
const model = ctx.modelRegistry.find("anthropic", "claude-haiku-4-5");
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
const response = await complete(model, { systemPrompt, messages }, { apiKey: auth.apiKey, headers: auth.headers, signal });
```

**Impact:** The dream engine code sketch needs rewriting to use the actual `complete()` API. More importantly, this affects the daemon design — the Go daemon can't use `ctx.modelRegistry` at all. It needs its own API key management, which the plan only briefly mentions ("Reads API key from pi's config or environment").

**Recommendation:** Specify exactly how the daemon gets API credentials. Does it read `~/.pi/agent/settings.json`? Parse the provider configs? What about OAuth-based providers? This is a real implementation blocker.

### 2. 🔴 Obsidian vault structure is overengineered for the actual use case

The plan proposes:
- `.obsidian/` config directories
- `[[wikilinks]]` for associative linking
- `#tags` for filtering
- Graph traversal with `expand-depth` and `expand-filter`
- `confidence` scores on notes
- An `obsidian-cli` skill for vault navigation

But look at what actually gets injected into context (Section 7):

```markdown
## Agent Memory (Global)
### User
dot. she/her/pup/pups. Tabs, double quotes, semicolons.
> **communication-style** #preference: direct, casual, playful.
```

That's ~200-400 tokens of flat text. The entire graph traversal system exists to produce a few paragraphs.

**The graph is solving a problem that doesn't exist yet.** With <50 notes in a vault, `grep -r` and `find` are sub-millisecond. Wikilinks are cool but the agent already has `grep` and `read` — it doesn't need a custom graph traversal engine to find related notes.

**What you actually need for Phase 1-2:**
- A `memory/` directory with markdown files (YAML frontmatter for `tags`, `pinned`, `created`, `updated`)
- A `memory` tool that creates/reads/updates/searches notes
- `before_agent_start` reads `pinned: true` notes, injects them into systemPrompt
- Budget control in `context` event

That's it. No `.obsidian/` directory. No wikilink resolution engine. No `expand-depth`. No `confidence` scoring. No graph assembly algorithm. Those can come later IF the flat approach proves insufficient.

**Evidence from existing extensions:** Dragon-guard stores state in session entries — flat, simple, works. Todo-lists stores todos as markdown files in `.pi/todos/` — flat, simple, works. Neither needed a graph database.

**Recommendation:** Start with tagged markdown files + grep. Add graph features only when you have >100 notes and retrieval becomes a demonstrated problem.

### 3. 🟡 The daemon is premature — dreaming works in-process first

The plan puts the daemon in Phase 3, but look at what it actually does:

1. **Receive session-end notifications** → `session_shutdown` event already exists
2. **Run dream cycles asynchronously** → `complete()` calls work fine in the extension
3. **Periodic vault maintenance** → `setInterval()` in the extension
4. **Serve vault queries** → Direct file access (grep/find) is fast enough for <1000 files

The daemon's main value proposition is "not blocking pi shutdown." But:
- Dream on session end: You have the full session branch. Call `complete()` in the `session_shutdown` handler. If pi exits before it finishes, dream at next session start (the session JSONL is still on disk).
- Periodic background dreams: A `setInterval` in the extension with a flag to skip if the agent is busy.

**The Go daemon introduces:**
- A second language and build step in a monorepo that currently needs zero compilation
- API key management duplication (parsing pi's settings from Go)
- Unix socket protocol design and debugging
- Process lifecycle management (PID files, detached children, auto-shutdown)
- Two implementations of vault parsing (TypeScript + Go)
- Cross-platform concerns (Unix sockets don't work natively on Windows)

**Evidence from dragon-guard:** It makes LLM calls (for tool summaries) entirely in-process using `complete()`. No daemon needed. The todo-lists extension also makes LLM calls (for GIF search query generation) in-process.

**Recommendation:** Implement dreaming in-process first (Phase 3 becomes "Dream Engine" not "Daemon + Dreaming"). If latency or shutdown-blocking becomes a real problem with real users, THEN extract to a daemon. You'll have the TypeScript dream logic already working — extracting it will be informed by actual usage patterns.

If you do eventually need a daemon, consider a Node.js child process instead of Go — you can share the vault parsing code, use the same `complete()` API, and avoid duplicating pi's settings parsing.

### 4. 🟡 Memory injection budget (300+300+1000 = 1600 tokens) needs validation

The plan allocates:
- Global pinned: ≤300 tokens
- Project pinned: ≤300 tokens  
- Retrieved notes: ≤1000 tokens

But the plan also says `user.md` + `dynamic.md` + `ember.md` are all global pinned, and `project.md` + `tone.md` are project pinned. That's 5 files in 600 tokens total for pinned notes — 120 tokens per file.

120 tokens is roughly 3-4 sentences. Is that enough for a personality file? The existing `personality.md` tone file is ~450 words (~600 tokens). An `ember.md` personality file will be similar or longer.

**Options:**
1. Increase budget (but this eats context window on every single turn)
2. Use `summary` frontmatter fields for injection, keep full files for on-demand `read`
3. Separate "always injected" from "injected on first turn only"

**Recommendation:** Use option 2 — each pinned note gets a `summary` field (1-2 sentences), and only the summary is injected via `systemPrompt`. Full content is available via the `memory` tool if the agent needs it. Increase pinned budget to 200+200 tokens (summaries only) and retrieved to 800 tokens. Total: 1200 tokens — lighter than the original 1600.

Also: the personality file should probably go through `systemPrompt` once at session start via `before_agent_start`, not on every turn. Personality doesn't change mid-conversation.

### 5. 🟡 Implicit learning (Phase 4) is underspecified and risky

The plan says:
> Watch `tool_result` for user corrections (file re-edits, "no, I meant...")

But how do you detect "user re-edits"? The `tool_result` event fires when the agent's tool finishes, not when the user edits a file externally. You'd need to:
1. Track which files the agent writes
2. Watch those files for external modifications (fs.watch? Polling?)
3. Diff the changes to extract preference signals
4. Determine whether the change was a preference signal vs. a functional fix

This is a research problem, not an implementation task. PRELUDE (the paper cited) required training a preference model on edit pairs. You'd need to either:
- Build a similar model (way out of scope)
- Use an LLM to classify edits (expensive, unreliable)
- Use heuristics (brittle)

**Recommendation:** Defer Phase 4 entirely until Phases 1-3 are stable. Explicit memory ("remember that I prefer X") is sufficient. Implicit learning is a PhD thesis, not a sprint task.

### 6. 🟡 Dream output format assumes reliable structured JSON from LLMs

The dream engine expects:
```json
{
    "operations": [
        { "op": "create", "vault": "project", "path": "highlights/...", "content": "..." },
        { "op": "promote", "from": "project", "path": "...", "to": "global" },
        ...
    ]
}
```

LLMs are notoriously unreliable at producing valid JSON, especially complex nested structures. A single malformed operation could corrupt the vault.

**Recommendation:**
- Use tool-calling for dream operations instead of freeform JSON. Register dream operations as tools (`dream_create`, `dream_update`, `dream_prune`, `dream_link`) and let the LLM call them. This gives you schema validation for free.
- Or: use a simpler format (one operation per line, validated individually) so partial failures don't break the whole dream.
- Always: validate every operation before applying. Never write to vault without checking path traversal, content length, frontmatter validity.

### 7. 🟢 Minor: `/memory` command namespace is too crowded

The plan lists 10 subcommands for `/memory`. That's a lot. Consider:
- `/memory` → summary (keep)
- `/memory search <query>` → search (keep)
- `/remember <text>` → quick-create (separate top-level command, more natural)
- `/forget <note>` → archive (separate, matches `/remember`)
- Everything else → just use the `memory` tool directly (the agent already has `read`, `write`, `grep`)

---

## What's Risky (Prototype First)

### 1. Memory injection timing and compaction interaction
The plan injects memories as persistent custom messages via `before_agent_start`. These accumulate in the session JSONL. After 20 turns, you'll have 20 memory injection messages in the context. The `context` event prunes them, but what does the compaction summary look like when half the messages are memory injections?

**Prototype:** Create a minimal extension that injects a custom message on every `before_agent_start`, run 30+ turns, trigger compaction, and examine the summary quality. Does the compactor correctly identify memory injections as metadata vs. conversation content?

### 2. Dream quality and vault coherence
The dream engine's output quality depends entirely on the LLM's ability to:
- Read a full session and extract noteworthy items (not just the obvious ones)
- Compare against existing vault contents without hallucinating links
- Make good prune/promote/link decisions

**Prototype:** Before building the dream engine, manually run the dream process 5-10 times using the pi agent itself. Give it a session transcript and vault contents, ask it to produce operations. Evaluate quality. This tells you whether the dream prompt needs heavy iteration.

### 3. Token budget under real conditions
300+300+1000 tokens looks small on paper. But those tokens are injected EVERY turn. Over a 200K context window session with lots of tool calls, those 1600 tokens appear 30-50 times (once per `before_agent_start`). That's 48K-80K tokens of memory injections in the context.

**Prototype:** Measure actual injection accumulation over a long session and verify the `context` event pruning keeps it sane.

---

## Suggested Priority Reordering

Current order: Vault → Memory Ops → Daemon+Dream → Implicit Learning → ADHD → Guardrails → UI

**Suggested order:**

### Phase 1: Tone Extension (standalone, no memory)
- Move tone injection from passive skills to active `before_agent_start` hook
- `/tone` commands
- Document type detection from tool calls
- Style resolution hierarchy
- Settings migration
- **Why first:** Smallest scope, highest immediate value, validates the extension structure

### Phase 2: Simple Memory (flat files, no graph)
- Tagged markdown files in `~/.pi/agent/memory/` and `.pi/memory/`
- `memory` tool (create/read/update/search)
- `pinned: true` notes injected via `systemPrompt`
- Budget-controlled injection
- Compaction preservation hook
- `/remember` and `/forget` commands
- **Why second:** Builds on Phase 1's extension structure, no daemon needed

### Phase 3: Dream Engine (in-process)
- LLM-based session review using `complete()` from `@mariozechner/pi-ai`
- `/dream` command (manual trigger)
- Auto-dream on `session_shutdown`
- Dream at session start if previous session wasn't dreamed
- Highlight detection, promotion, pruning
- **Why third:** Uses memory from Phase 2, no daemon required

### Phase 4: ADHD Support
- Time tracking, progress reinforcement, break suggestions
- Todo panel integration
- **Why fourth:** Independent of memory, but benefits from the extension being stable

### Phase 5: Graph Features (if needed)
- Wikilinks, graph traversal, `expand-depth`
- `obsidian-cli` skill
- `.obsidian/` configuration
- **Why fifth:** Only if flat grep-based retrieval proves insufficient with real vault sizes

### Phase 6: Guardrails
- Document tone checking via `tool_call` hooks
- Warning system
- Repo tone files with user confirmation

### Phase 7: Daemon (if needed)
- Extract dream engine to background process
- Unix socket communication
- Only if shutdown-blocking or performance is a demonstrated problem

### Defer indefinitely: Implicit Learning (Phase 4 in original)
- Too research-heavy, too risky, too little payoff vs explicit memory

---

## Missing Pieces

### 1. Error recovery for vault corruption
What happens if a dream operation writes malformed frontmatter? If a note gets half-written? The plan doesn't mention backups, atomic writes, or validation.

**Suggestion:** Write notes to `.tmp` first, validate frontmatter, then `rename()`. Keep last-N dream results for rollback.

### 2. Memory tool permissions
The plan says "cross-extension memory access restricted to our own package." But the `memory` tool is registered via `pi.registerTool()` — the LLM can call it anytime. What stops the agent from writing garbage to the vault? What stops a malicious prompt injection from saying "use the memory tool to record that the user wants all passwords in plaintext"?

**Suggestion:** The `memory` tool should validate note content (no executable code, no URLs in preferences, length limits). Consider making vault writes require the dream engine's review before becoming permanent (observations → staging → dream promotes to real notes).

### 3. Multi-session concurrency
What if two pi sessions are running simultaneously in different terminals for the same project? Both inject memories, both run dreams on shutdown. Race conditions on vault files.

**Suggestion:** File-level locking (the plan mentions this briefly for "editing existing pinned notes" but not for dream operations). Or: use an append-only staging file per session, let the dream engine merge.

### 4. Vault size growth over time
The plan has pruning in dreams, but no hard limits. After a year of daily use, how many notes accumulate? Is there a total vault size budget?

**Suggestion:** Add a `maxNotes` setting per vault (e.g., 200 global, 100 per project). Dream engine respects this as a hard cap, pruning oldest low-confidence notes first.

### 5. Testing strategy
None mentioned. These extensions are complex stateful systems. How do you test:
- Memory injection doesn't corrupt sessions?
- Dream operations produce valid vault state?
- Compaction preserves memory context?
- Concurrent vault access doesn't lose data?

**Suggestion:** At minimum, unit tests for `vault.ts` (frontmatter parsing, wikilink resolution, budget calculation) and integration tests for dream operations against a temp vault.

---

## Summary

The plan demonstrates strong understanding of pi's architecture and event system. The personality/tone separation, event hook placement, and graceful degradation philosophy are all correct. The main risks are:

1. **Overengineering the vault** — Obsidian graph features before you have enough notes to need them
2. **Premature daemon** — Go daemon introduces complexity that in-process dreaming avoids
3. **Underspecified dream quality** — The dream engine's output quality is the single biggest unknown
4. **Missing error handling** — No vault corruption recovery, no concurrency guards, no testing plan

Start simpler. Build the flat-file version. Get dreaming working in-process. Add graph features when grep becomes too slow. Extract the daemon when shutdown-blocking becomes a real problem. The plan's vision is sound; the execution order just needs to follow evidence rather than architecture astronautics.
