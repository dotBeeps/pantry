# Dragon Review #2: UX, ADHD Support, and Practical Implementation

**Reviewer perspective:** Senior developer experience engineer  
**Focus areas:** User experience, ADHD support, practical implementation  
**Date:** 2026-04-02

---

## Files Retrieved

1. `.pi/plans/tone-extension.md` (full) — The complete plan: tone, memory, daemon, ADHD, dreaming
2. `.pi/research/tone-extension-research.md` (full) — Memory systems, ADHD workflows, personality persistence research
3. `berrygems/extensions/ask.ts` (full) — Interactive user input patterns, themed borders, three interaction modes
4. `berrygems/extensions/todo-lists.ts` (full) — Floating panel UX, GIF mascots, Kitty protocol, AI vibe search
5. `berrygems/extensions/digestion-settings.ts` (full) — Settings panel, live-tweakable config, context bar, compaction control
6. `berrygems/styles/personality.md` (full) — Agent voice style, personality-driven writing
7. `berrygems/styles/formal.md` (full) — Professional/neutral writing style
8. `berrygems/styles/friendly.md` (full) — Warm-but-grounded writing style
9. `berrygems/styles/narrative.md` (full) — Story-driven change documentation
10. `berrygems/styles/minimal.md` (full) — Terse, zero-fluff writing style
11. `AGENTS.md` (full) — Project structure, conventions, inter-extension communication patterns

---

## UX Wins in the Current Plan (Keep These)

### 1. Personality/Tone Separation is Excellent
The distinction between "who the agent IS" (personality, always active, lives in vault) and "how documents are WRITTEN" (tone, per-document, lives in styles/) is genuinely well-conceived. The line — _"Write this README in formal tone" changes the README. It doesn't make me stop calling you pup."_ — is perfect UX copy and perfect architecture. **Ship this framing exactly as-is.**

### 2. Deterministic Graph Traversal (0 LLM Tokens)
`vault.ts` doing pure TypeScript graph assembly with `expand`, `expand-depth`, `expand-filter` frontmatter is the right call. The LLM seeing ~200-400 tokens of memory context is proportional and non-intrusive. The `summary` field for compact linked refs is a clever optimization. This avoids the "memory retrieval costs more than it saves" trap.

### 3. Graceful Degradation for the Daemon
"If the daemon isn't running or can't start, the extension works without it." This is critical. The daemon-as-accelerator pattern means the extension has zero hard dependencies on a Go binary that might not be built yet, might crash, or might be on a system without Go. **Never compromise on this.**

### 4. Warn-Don't-Block Guardrails
The guardrail philosophy — append warnings to `tool_result` rather than blocking `tool_call` — respects user agency. An ADHD user who finally got into flow and is writing fast does NOT need a modal interruption saying "this doesn't match formal tone." A note the agent sees is the right granularity.

### 5. Two-Tier Vault Architecture
Global memory (travels with the user) vs. project memory (stays with the repo) maps to how people actually think. "I like tabs" is universal. "This repo uses spaces" is local. The override hierarchy (project > global) matches pi's existing settings pattern, which means zero new mental models.

### 6. Token Budget Controls
Hard caps on injected memory (600 pinned, 1000 retrieved, configurable) with pruning in the `context` event is responsible engineering. Memory systems that grow unbounded eventually eat the context window and degrade the agent's primary function (coding).

### 7. Dream Preview (`/dream preview`)
Dry-run mode that shows what dreaming WOULD do without applying changes. This is the difference between a system users trust and a system users fear. Essential for building comfort with an automated memory curator.

---

## UX Concerns and Proposed Fixes

### 🔴 Critical: Vault Initialization Interview Will Overwhelm ADHD Users

**The problem:** The plan mentions "Interactive interview on first run. Extension detects empty/missing vault, asks the user about identity, preferences, project context, and scaffolds pinned notes from answers."

An ADHD user encountering a multi-question interview when they just wanted to start coding will experience this as a **gate**. Executive dysfunction means "answer questions about yourself before you can use this tool" is a recipe for abandonment. The user installed an extension to help them code, not to fill out a form.

**The fix: Zero-config first run with progressive discovery.**

```
First session: Extension creates vault silently with sensible defaults.
  → user.md has a single comment: "# Your preferences — Ember learns these over time"
  → project.md scaffolded from repo README/AGENTS.md if they exist
  → No interview. No questions. Just works.

After 3-5 sessions: Ember has observed enough to populate notes.
  → Dream cycle creates preference notes from observations.
  → Optionally: "Hey, I've been picking up on some preferences — 
     want to take 2 minutes to review what I've learned? /memory review"

If user WANTS to set up their vault manually:
  → /memory init — explicitly triggers the guided setup
  → This is opt-in, not a gate
```

**Why this matters for ADHD:** The best onboarding is invisible. The user should feel the tool getting smarter, not feel interrogated. The interview can exist as an _option_, never as a _requirement_.

### 🔴 Critical: 15-Minute Periodic Dreams Are Too Aggressive

**The problem:** "Minimum 10 messages before first dream, then every 15 minutes background."

Every 15 minutes, the daemon is running an LLM call to curate memories. Even with a cheap model, this means:
- Unexpected API costs (user may not realize dreaming costs money)
- If using the session's model instead of Haiku, this could be expensive
- Background processing that the user didn't explicitly request
- Potential for the vault to feel like it's "changing under you" — you look away and your memories reorganized

**The fix: Conservative defaults with clear cost communication.**

```
Default dream triggers (in order of priority):
  1. Manual: /dream (always available)
  2. Session-end: dream after session close (via daemon, non-blocking)
  3. Compaction: dream on compacted content before it's summarized away
  
NOT default:
  4. Periodic: every N minutes (opt-in via settings, with cost estimate)
```

Show estimated cost per dream in `/dream` output: "This dream cycle used ~2K tokens on Haiku (~$0.001)." Users who care about costs will appreciate the transparency. Users who don't will ignore it.

### 🟡 Moderate: `/memory` Command Surface Is Too Wide

**The problem:** The `/memory` command has 10 subcommands: `search`, `open`, `edit`, `create`, `link`, `tag`, `remember`, `forget`, `graph`, plus the bare `/memory` summary. This is a power-user interface masquerading as a daily-use tool.

For an ADHD user, a command with 10 subcommands triggers choice paralysis. "What do I even use? Which one do I need?" The cognitive overhead of remembering subcommands defeats the purpose of a system designed to compensate for working memory limitations.

**The fix: Three tiers of `/memory` interaction.**

```
Tier 1 — Daily use (3 commands):
  /memory              → Show what Ember knows (vault summary)
  /memory remember X   → Quick note: "remember I hate yaml"
  /memory forget X     → Remove something: "forget the spaces thing"

Tier 2 — Exploration (available but not promoted):
  /memory search X     → Find notes
  /memory review       → Review recent observations (edit/confirm/reject)

Tier 3 — Power user (documented in /memory help, not in prompt):
  /memory edit, /memory create, /memory link, /memory tag, /memory graph
  These work but aren't in the agent's prompt guidelines.
  They're documented in the obsidian-cli skill and /memory help.
```

The agent itself should handle most Tier 3 operations automatically via the `memory` tool. The user rarely needs to manually create or link notes — that's what dreaming is for.

### 🟡 Moderate: Obsidian Vault Format Creates an Accessibility Cliff

**The problem:** The plan uses Obsidian-compatible vault format with `.obsidian/` directories, `[[wikilinks]]`, YAML frontmatter, and the whole Obsidian ecosystem expectation. This is great for dot (who uses Obsidian), but creates two issues:

1. **Non-Obsidian users** see `.obsidian/` directories and `[[wikilinks]]` in markdown and think "this is someone else's tool, not mine"
2. **The vault graph visualization** (`/memory graph`) only shows a text summary — the real graph is in Obsidian. Users without Obsidian can't see their memory graph.

**The fix: Obsidian-compatible, not Obsidian-dependent.**

- Don't create `.obsidian/` on first run. Create it only if the user has Obsidian installed OR explicitly requests it (`/memory obsidian-init`).
- `[[wikilinks]]` are fine — they're just a linking convention. But the extension should also work with plain `[text](path.md)` links if the user prefers.
- `/memory graph` should render a simple ASCII/text graph in-terminal, not just a summary. Something like:

```
  user.md ─── preferences/code-style.md
     │              │
     └── dynamic.md └── patterns/conventional-commits.md
                              │
                    sessions/2026-04-02.md
```

This makes the graph accessible without Obsidian. Users WITH Obsidian get the bonus of opening the vault in the graph view.

### 🟡 Moderate: ADHD Time Checks Need More Nuance

**The problem:** The plan injects time checks every 15 minutes as hidden messages. This is a good start, but the implementation is too simple:

```typescript
if (minutes > 0 && minutes % 15 < 2) {
    // inject time check
}
```

This doesn't account for:
- **Hyperfocus sessions** where the user is deeply productive and an interruption (even a hidden one that changes agent behavior) is harmful
- **Stalled sessions** where the user has been idle and time checks feel like nagging
- **Break timing** that doesn't align with task completion (being told "45 minutes" right when you're about to finish something)

**The fix: Activity-aware time injection.**

```typescript
// Only inject time context when:
// 1. There's been actual activity (messages in the last 5 min)
// 2. It's been at least N minutes (configurable)
// 3. We're at a natural breakpoint (just completed a task, tests passed, etc.)

// DON'T inject if:
// 1. User is in the middle of a multi-step task (todo items in progress)
// 2. Last user message was < 2 minutes ago (they're actively typing)
// 3. Context already mentions time recently
```

The agent should CHOOSE whether to mention time to the user — the injection just gives it the data. The current plan does this right with `display: false`, but the injection frequency needs to be smarter.

### 🟢 Minor: Dream Output Could Be Noisy

**The problem:** The dream system produces structured operations (create, update, promote, prune, link, tag). After each dream, the user might wonder "what changed?" but the dream summary is a single line: "Processed 47 messages. Created 2 highlights, promoted 1 preference, pruned 3 stale observations, added 5 links."

This is simultaneously too much information (did I need to know about 5 new links?) and too little (what was pruned? Should I be worried?).

**The fix: Tiered dream reporting.**

```
After auto-dream (session end): 
  Silent. No notification unless something notable happened.
  "Notable" = new preference learned, idea captured, or highlight saved.
  Notification: "💤 Ember dreamed: learned 1 new preference, saved 1 highlight"

After manual /dream:
  Full report with expandable details.
  Show each operation with reasoning.
  Offer /dream undo for the last dream cycle.

After /dream preview:
  Show proposed operations grouped by category.
  Let user approve/reject individual operations.
  "Apply all" / "Apply selected" / "Cancel"
```

### 🟢 Minor: `/tone` Command Should Show More Context

**The problem:** `/tone` shows "current style + any session overrides." But users need to understand WHY a particular tone is active.

**The fix:** `/tone` output should show the resolution chain:

```
Current tone: formal
  Why: Document override for README.md → repo override (.pi/settings.json)
  Session override: none
  
  Available: formal, friendly, narrative, minimal, personality
  Switch: /tone <name>
```

---

## ADHD-Specific Recommendations

### 1. Body Doubling is the Killer Feature — Lean Into It

The research correctly identifies body doubling as a core ADHD strategy. The plan mentions it but doesn't prioritize it. The existing todo panel with animated GIF mascots IS body doubling — a persistent, friendly presence that makes you feel less alone.

**Recommendation:** The tone extension should enhance body doubling, not replace it:
- The personality injection should include awareness of the todo panel state ("I can see you have 3 items left on the sprint panel")
- Progress reinforcement should reference visible artifacts ("look at that progress bar moving!")
- The agent should feel like a co-worker who can see your desk, not a disembodied voice

### 2. Task Initiation Support > Task Tracking

ADHD users don't struggle with knowing what to do — they struggle with starting. The plan's ADHD section focuses heavily on tracking (time, progress, todos) but not on initiation.

**Recommendation: Add "what should I start with?" support.**
- When the user starts a session with multiple open todos, the agent should suggest ONE thing to start with (not present all options equally)
- Dopamine-aware ordering means: suggest the most satisfying-looking task first, not the most important one
- "Want to knock out that quick bug fix before tackling the refactor?" is more helpful than a prioritized list
- This should be a `before_agent_start` injection when there are open todos and the user hasn't given a clear task

### 3. Break Suggestions Should Be Earned, Not Timed

**The problem:** "After 45-60 minutes of high activity, gently suggest a break."

Timed breaks fight ADHD hyperfocus, which is one of ADHD's superpowers. If the user is in flow, a break suggestion is counterproductive.

**The fix:** Trigger break suggestions on **completion**, not time:
- After finishing a significant task (all todos in a tag marked done, PR submitted, tests green)
- After a frustrating debug session (multiple failed attempts visible in history)
- After context has been compacted (natural pause point — "we just digested, good time to stretch")
- NEVER in the middle of active work

### 4. Celebrate Completions Warmly But Briefly

The plan mentions "celebrate completions warmly (this is Ember — 'atta pup' is a feature)." This is correct but needs calibration:
- Small completion: brief acknowledgment in the flow ("✓ done, onto the next one")
- Medium completion: warm note ("nice, that's 4/6 done on the sprint 🐾")  
- Big completion (all todos done, PR merged, release shipped): full celebration, this is where personality shines

The digestion panel's animated dragon phases (🐉 → 🔥 → ✨ → 💭 → ⚗️ → 📜) set a good precedent for delightful-but-functional feedback. Apply the same philosophy to completions.

### 5. Working Memory Externalization via Memory Panel

The plan mentions a settings panel but doesn't propose a **memory panel**. For ADHD users, being able to glance at what the agent knows is powerful working memory support.

**Recommendation: Phase 7 should include a floating memory panel.**
- Shows pinned notes (who am I, what's this project)
- Shows recent observations (what has Ember learned lately)
- Shows current session context (what are we working on)
- Lightweight — maybe 3-5 lines, expandable on focus
- Updates after dream cycles

This is like having your notes visible on a second monitor — you don't always look, but knowing they're there reduces anxiety.

---

## Privacy and Comfort Recommendations

### 1. The System Should NEVER Feel Like Surveillance

**The risk:** A system that watches your edits, observes your corrections, tracks your time, profiles your preferences, and runs background processing on your sessions can easily feel like surveillance rather than support.

**The mitigation:**

**Transparency is non-negotiable:**
- First time memory is injected, the agent should mention it: "I'm pulling in some context from our previous sessions — you can see what I know with `/memory`"
- First time a dream cycle runs, the agent should mention it: "I just reviewed our session and saved a few observations — `/dream history` to see what"
- The `private: true` frontmatter flag is good but should be more prominent: `/memory private <note>` as a first-class command

**User should always be able to see what the agent sees:**
- `/memory` should show exactly what gets injected (not just a summary of the vault, but "here's what I'm putting in the context window right now")
- The memory panel (recommended above) makes this ambient, not interrogative

**Observation signals should be visible (not hidden):**
- When the agent detects a preference from a correction, it should say so: "Noticed you changed X to Y — I'll remember that"
- The user should be able to say "don't remember that" and have it immediately forgotten
- PRELUDE-style implicit learning is powerful but needs this consent layer

### 2. Vault Contents Should Be Easy to Audit

The Obsidian vault format is good for this — it's just markdown files. But make it easier:
- `/memory audit` — list every note with its confidence score, source, and last-updated date
- `/memory export` — dump the full vault to a single markdown file for review
- `/memory nuke` — delete everything and start fresh (with confirmation)

### 3. Dream Operations Should Be Reversible

Every dream cycle should create a backup or log that enables undo:
- Store dream operations in `sessions/dream-log-{timestamp}.md`
- `/dream undo` reverts the last dream cycle
- `/dream history` shows what each dream changed

### 4. Cross-Extension Memory Access Is Correctly Restricted

The plan says "Restricted to our own package extensions only. No external extension access to vault." This is correct. The `globalThis` + `Symbol.for()` pattern used by dots-panels should NOT expose memory contents. Memory is private to the tone extension.

---

## What Should Be User-Facing vs. Invisible

### Always Visible
- Current active tone (`/tone`)
- What memory is being injected (memory panel or `/memory`)
- Dream results (notifications after dreams)
- Time elapsed (in status bar, not as interruptions)
- Progress on todos (existing panel, enhanced with agent awareness)

### Visible on Request
- Full vault contents (`/memory`, `/memory search`, Obsidian)
- Dream history and details (`/dream history`)
- Tone resolution chain (`/tone` verbose)
- Guardrail warnings (in tool results, not blocking)
- Settings (`/digestion`-style panel for tone settings)

### Invisible (Working Behind the Scenes)
- Graph traversal and token budgeting
- Frontmatter parsing and wikilink resolution
- Daemon communication protocol
- Implicit preference detection (but RESULTS should be visible)
- Memory pruning and confidence decay
- Context event pruning of stale injections

---

## Suggested Changes to Command Structure

### Current Plan:
```
/tone, /tone <style>, /tone reset
/memory (10 subcommands)
/dream, /dream preview, /dream history, /dream auto
```

### Proposed:
```
/tone                    → Show active tone + resolution chain
/tone <style>            → Switch for this session
/tone reset              → Clear session override

/memory                  → What Ember knows right now (injected context)
/memory remember <text>  → Quick observation
/memory forget <query>   → Remove a memory
/memory review           → Interactive review of recent observations
/memory help             → Full subcommand list for power users

/dream                   → Run dream cycle now
/dream preview           → Dry-run with approve/reject
/dream undo              → Revert last dream
/dream history           → Show recent dreams

/tone-settings           → Open floating settings panel (like /digestion)
```

**Key changes:**
- `/memory` is simplified to 4 daily-use commands + help
- `/dream undo` added for reversibility  
- `/tone-settings` is separate from `/tone` (action vs. configuration)
- Power-user `/memory` subcommands are documented but not promoted
- No `/dream auto` toggle as a command — it's in settings panel

---

## What to Prototype and Test with Real ADHD Users First

### Priority 1: Memory Injection Feel
**Test:** Does memory injection feel helpful or creepy?
- Show 5 ADHD users a session where the agent mentions something from a previous session
- Ask: "Did this feel like the agent remembered you, or like it was tracking you?"
- Iterate on the phrasing of memory injection until it feels like a friend remembering, not a database querying

### Priority 2: Vault Initialization Flow  
**Test:** Zero-config vs. interview
- Give 5 users the zero-config version (silent setup, progressive discovery)
- Give 5 users the interview version
- Measure: time to first productive interaction, abandonment rate, satisfaction
- Hypothesis: zero-config wins by a large margin for ADHD users

### Priority 3: Time Check Frequency and Phrasing
**Test:** When do time checks help vs. annoy?
- Run a 90-minute session with an ADHD user
- Inject time checks at different frequencies (every 10, 15, 20, 30 min)
- Ask after each check: "Was that helpful right now?" (yes/no/annoying)
- Find the sweet spot — it will likely be longer than 15 minutes

### Priority 4: Break Suggestion Timing
**Test:** Completion-triggered vs. time-triggered breaks
- Give half the users time-triggered breaks (50 min)
- Give half completion-triggered breaks (after finishing a task)
- Measure: perceived helpfulness, actual break-taking rate, session satisfaction
- Hypothesis: completion-triggered breaks are taken more often and appreciated more

### Priority 5: Dream Transparency
**Test:** How much dream reporting do users want?
- Show dream summaries at three detail levels (silent, brief, full)
- Ask: "Which felt right?"
- Hypothesis: most users want brief by default with full available on request

### Priority 6: The Memory Panel (Floating)
**Test:** Does a persistent memory summary reduce anxiety?
- A/B test: sessions with and without a floating memory panel
- Measure: frequency of "what do you know about me" type questions
- Hypothesis: the panel reduces these questions because the info is ambient

---

## Architecture Notes from Existing Extensions

### Pattern: Themed Consistency
All three existing extensions (`ask.ts`, `todo-lists.ts`, `digestion-settings.ts`) share patterns that the tone extension should follow:

1. **`globalThis` + `Symbol.for()` for cross-extension communication** — Memory and personality should NOT be on `globalThis`. Only the panel manager API uses this pattern. Memory is private.

2. **Settings namespace `dotsPiEnhancements`** — The tone extension's settings under `dotsPiEnhancements.tone` follows this convention correctly.

3. **`/command` + tool registration pattern** — Commands for user interaction, tools for agent interaction. `/tone` is a command, `memory` is a tool. Correct.

4. **Panel lifecycle: create → render → invalidate → dispose** — The digestion panel and todo panel both follow this. The tone settings panel should too.

5. **Context ref pattern** — `let ctxRef: ExtensionContext | null = null` set on `session_start`, used throughout. The tone extension should do the same.

6. **Fun language in system messages** — ask.ts uses "Pup got distracted by a squirrel 🐿️" and "good girl chose yes." digestion-settings.ts uses dragon metaphors for compaction. The tone extension should continue this — memory operations should have personality in their system messages ("Ember remembered that 🐉" not "Memory saved successfully").

### Pattern: The ask.ts UX Model
`ask.ts` provides three clear interaction modes (select, confirm, text) with escape-to-cancel. The vault initialization interview, if it ever runs, should use this same tool — it already exists and users already understand it. Don't build a custom interview UI.

### Pattern: GIF Mascots as Ambient Presence
The todo panel's AI-powered GIF selection (generating search queries from todo content) is delightful. The memory/dream system could use the same pattern for its panels — a sleeping dragon GIF for the dream panel, a searching dragon for memory browse.

---

## Summary Assessment

The plan is ambitious, well-researched, and architecturally sound. The core ideas — personality/tone separation, Obsidian-compatible memory vaults, deterministic graph traversal, graceful daemon degradation — are excellent. The main UX risks are:

1. **Onboarding friction** — the vault initialization interview needs to be optional, not a gate
2. **Background processing anxiety** — periodic dreams need conservative defaults and cost transparency
3. **Command surface area** — `/memory` has too many subcommands for the target user
4. **Time-based interruptions** — break suggestions and time checks should be activity-aware, not clock-based
5. **Observation consent** — implicit learning needs a visible consent layer ("I noticed X — should I remember that?")

The existing extensions demonstrate a mature UX vocabulary: playful language, non-blocking overlays, configurable settings panels, and AI-powered delight features. The tone extension should follow these patterns exactly, not invent new ones.

**The fundamental question this system needs to answer:** Does it feel like having a thoughtful friend who pays attention, or like having a monitoring system that writes reports? The difference is in the UX details above, not the architecture.
