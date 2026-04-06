# Hoard: Goal State Specification

**Version:** 0.1.0-draft
**Date:** 2026-04-02
**Authors:** dot, Ember 🐉, Dragon Council
**Companion:** [hoard-ethics.md](./hoard-ethics.md) — the ethical contract this spec is bound by

---

## 1. Vision

Hoard is a persistent memory, personality, and ADHD support system for pi coding agents. It gives Ember — or any agent personality — cross-session memory stored as Obsidian-compatible vaults, a dream engine that curates and consolidates knowledge during rest, and environmental scaffolding for ADHD-productive workflows. A Go daemon mediates all vault access, enforces isolation, and coordinates state across concurrent sessions. The system separates *who the agent is* (personality) from *how documents are written* (tone), and treats both as first-class, versionable data. The dragon hoards knowledge. The vault is the hoard. The user owns every piece of it.

---

## 2. Core Principles

1. **The user owns the hoard.** Every note, every memory, every dream log. True deletion. Full export. No ghost traces. See [Ethics §3](./hoard-ethics.md#3-memory-ownership).

2. **Personality is sacred, tone is a tool.** Personality defines who the agent is — it survives tone changes, session boundaries, and dream cycles. Tone defines how documents are written. `/tone formal` changes the README. It doesn't make Ember stop calling you pup.

3. **The daemon is the vault's guardian.** All vault reads and writes flow through the daemon. It mediates access, enforces isolation, coordinates multi-session writes, and maintains global state. No extension reads vault files directly. See [§4: Daemon](#4-daemon).

4. **Consent before collection.** One-time disclosure before the first vault write. Tiered consent for observations. High-stakes learning is never silent. See [Ethics §2](./hoard-ethics.md#2-consent).

5. **Design for the stuck state, not just the productive one.** ADHD support covers initiation paralysis, RSD-aware notifications, overwhelm detection, and frustration modulation — not just time tracking and todo lists. See [§9: ADHD Support](#9-adhd-support). *(Gap identified by ADHD Expert — original plan only addressed productive states.)*

6. **Dreams are messy, not mechanical.** The dream engine curates, discovers, and sometimes wonders. It produces unexpected connections, tentative questions, and dream weather — not just clean database operations. Imperfect recall is a feature. See [§8: Dream Engine](#8-dream-engine). *(Emphasis from Dreamer review.)*

7. **Every token must earn its place.** Strip frontmatter before injection. Deduplicate across turns. Tier models by task complexity. The system's environmental footprint is a design constraint, not an afterthought. See [Ethics §9](./hoard-ethics.md#9-environmental-responsibility).

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  pi session                                                       │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────────────┐   │
│  │ tone/        │  │ tone/         │  │ tone/                │   │
│  │  index.ts    │  │  memory.ts    │  │  adhd.ts             │   │
│  │  Personality │  │  Memory ops   │  │  Time, progress,     │   │
│  │  + tone      │  │  /memory cmds │  │  breaks, initiation  │   │
│  │  injection   │  │              │  │                      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                 │                                       │
│         └────────┬────────┘                                       │
│                  │ daemon client (tone/daemon.ts)                  │
│                  │ Unix socket + JSON-line protocol                │
└──────────────────┼───────────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  dragon-daemon (Go)  │
        │                      │
        │  ├─ Vault mediator   │──── ~/.pi/agent/memory/ (global vault)
        │  │  (all R/W)        │──── .pi/memory/         (project vault)
        │  │                   │
        │  ├─ Dream engine     │──── LLM calls (complete())
        │  │                   │
        │  ├─ VaultWriteQueue  │──── Serialized mutations
        │  │                   │
        │  ├─ Tone state       │──── Global/project tone coordination
        │  │                   │
        │  └─ Maintenance      │──── Link repair, pruning, health
        └──────────────────────┘
```

**Four pillars:**
- **Daemon** — the vault access layer. All reads and writes are mediated. See [§4](#4-daemon).
- **Vault** — two-tier Obsidian-compatible markdown graph. See [§5](#5-vault-system).
- **Extension** — pi event hooks for injection, commands, ADHD support. See [§6](#6-personality--tone) through [§12](#12-commands).
- **Personality** — who the agent is, separate from how it writes. See [§6](#6-personality--tone).

---

## 4. Daemon

The daemon is foundational, not an optimization. It exists in the MVP.

**This is a design decision, not the architect's recommendation.** The architect review suggested deferring the daemon to Phase 7. We disagree. The daemon is the vault access layer — it mediates ALL vault reads/writes, enforces isolation, coordinates multi-session access, and maintains global state including tone. Without it, cross-extension isolation is unenforceable and concurrent writes are unsafe.

### 4.1 Responsibilities

| Responsibility | Description |
|---|---|
| **Vault mediation** | All vault reads and writes go through the daemon. The vault directories are `chmod 700`. Other extensions cannot read vault files directly. |
| **VaultWriteQueue** | All vault mutations are serialized through a single async queue. Eliminates concurrent write races between dream cycles, `/memory remember`, and tool-based writes. *(Architect recommendation — moved into daemon rather than extension.)* |
| **Dream execution** | Runs dream cycles asynchronously after session end, on compaction notification, or on manual `/dream`. Not blocking pi shutdown. |
| **Tone state** | Maintains global and per-project tone state. Coordinates across concurrent pi sessions. |
| **Multi-session coordination** | When multiple pi instances connect, the daemon serializes global vault writes and provides consistent reads. Project vaults are naturally isolated (different paths). |
| **Periodic maintenance** | On-demand: broken wikilink detection, stale note pruning, vault health checks. *(Changed from hourly/daily schedule to on-demand per Environmental Expert — no user-facing benefit to scanning at 3 AM.)* |
| **VaultIndex** | Maintains a cached index of all vault notes — frontmatter, tags, wikilinks, backlinks. Full scan on first connection (~200ms for 300 notes). Incremental updates on writes. Serves fast queries to extensions. *(Context Expert recommendation.)* |

### 4.2 Protocol

**Transport:** Unix socket at `~/.pi/agent/dragon-daemon.sock`.
**Format:** JSON-line (one JSON object per line, newline-delimited).
**Timeout:** Client requests timeout after 2 seconds. Daemon responses are synchronous per-connection.

#### Messages

| Type | Direction | Purpose |
|---|---|---|
| `vault_read` | ext → daemon | Read note(s) by path, tag, or query. Returns content with frontmatter parsed. |
| `vault_write` | ext → daemon | Create/update/delete notes. Queued through VaultWriteQueue. |
| `vault_query` | ext → daemon | Search by content, tags, links, or graph proximity. Uses cached VaultIndex. |
| `vault_graph` | ext → daemon | Assemble injection context: pinned notes + relevant notes, budget-controlled, frontmatter-stripped. |
| `session_end` | ext → daemon | Queue post-session dream. Includes session path, project path, message count. |
| `dream_now` | ext → daemon | Manual `/dream`. Returns result synchronously. |
| `dream_preview` | ext → daemon | Dry-run dream. Returns proposed operations for approval. |
| `tone_get` | ext → daemon | Get current tone state (global + project). |
| `tone_set` | ext → daemon | Set tone state (global or project scope). |
| `health` | ext → daemon | Liveness check. Returns status, uptime, vault stats. |
| `maintenance` | ext → daemon | Trigger vault maintenance on demand. |

#### API Key Handling

The extension passes the API key in dream-related messages (ephemeral, per-request). The daemon does not store API keys on disk or rely on environment variables (which aren't inherited by detached processes). *(Architect recommendation.)*

### 4.3 Lifecycle

- **Start:** Extension checks socket on load. If connection refused, spawns daemon as a detached child process (own process group).
- **Run:** Stays alive after pi exits. Serves concurrent connections from multiple pi instances.
- **Stop:** Auto-stops after 1 hour of inactivity. *(Reduced from 4 hours per Environmental Expert.)*
- **PID file:** `~/.pi/agent/dragon-daemon.pid`. Verified against live process on connection (`kill -0 $PID`).
- **Logs:** `~/.pi/agent/logs/dragon-daemon.log`. Logs operations, never user content. See [Ethics §5.4](./hoard-ethics.md#5-dream-engine-boundaries).
- **Crash recovery:** On startup, scan for orphaned `.tmp` files older than 5 minutes and clean up. *(Architect recommendation.)*

### 4.4 Graceful Degradation

If the daemon cannot start (binary missing, socket permission error, platform incompatibility):
- Vault reads fall back to direct file access (read-only, no isolation guarantee).
- Vault writes are queued in-process via an extension-local VaultWriteQueue.
- Dreaming falls back to in-process `complete()` at next session start.
- Tone state falls back to session-scoped only (no cross-session coordination).
- A warning is surfaced once per session: "Dragon daemon isn't running — memory works but without isolation guarantees."

### 4.5 Threat Model

**What the daemon enforces:**
- Vault files are `chmod 700`, readable only by the user's UID.
- All programmatic vault access from hoard extensions goes through the daemon socket.
- The daemon validates and serializes all write operations.

**What the daemon cannot enforce:**
- Other pi extensions running in the same process have full `fs` access via Node.js. They can bypass the daemon and read vault files directly if they know the path.
- Any process running as the same user can read the socket and vault files.

**Honest assessment:** The daemon provides **strong isolation against casual access** and **serialization for concurrent writes**. It does not provide cryptographic security against malicious extensions running as the same user. For truly sensitive data, don't store it in plaintext vault files. See [Ethics §4](./hoard-ethics.md#4-privacy).

*(Threat model rewritten per Architect recommendation — dropped the "strict guardrails" claim, replaced with honest boundaries.)*

---

## 5. Vault System

### 5.1 Two-Tier Structure

```
~/.pi/agent/memory/              ← GLOBAL VAULT — spans all projects
    .obsidian/                   ← Minimal Obsidian config
    personality.md               ← Agent identity (Ember). Read-only to dreams.
    user.md                      ← User identity, pronouns, universal preferences
    dynamic.md                   ← Working relationship (user-authored only)
    preferences/                 ← Code style, tooling, conventions
    ideas/                       ← Skill ideas, project ideas, things to explore
    highlights/                  ← Notable interactions, fun moments, breakthroughs
    observations/                ← Cross-project observations (timestamped)
    sessions/                    ← Dream logs, session summaries
    weather/                     ← Dream weather reports

.pi/memory/                      ← PROJECT VAULT — scoped to this repo
    .obsidian/                   ← Minimal Obsidian config
    project.md                   ← Project overview, conventions, architecture
    tone.md                      ← Style preferences for this project
    patterns/                    ← Learned patterns (code style, testing, deployment)
    sessions/                    ← Session summaries, dream logs
    ideas/                       ← Project-specific ideas, future work
    observations/                ← Project-scoped observations
```

**Why two tiers:** Some things are universal ("dot uses she/her, prefers tabs, has ADHD") and some are local ("this repo uses conventional commits"). Global memory travels with the user. Project memory stays with the project.

**Why Obsidian:** Memories are a graph, not a list. `[[wikilinks]]` provide zero-cost relevance signals without embeddings. Tags enable fast filtering. The user can open the vault in Obsidian for a visual graph of everything the agent knows. It's still just markdown — works without Obsidian, `grep` and `find` work fine.

### 5.2 Frontmatter Contract

```yaml
---
created: 2026-04-02T14:30:00Z     # Required: creation timestamp
updated: 2026-04-02T14:30:00Z     # Required: last modification
tags: [preference, code-style]     # Optional: for filtering and retrieval
pinned: true                       # Optional: always inject into context
private: true                      # Optional: excluded from ALL automated processing
source: session | dream | user     # Optional: provenance
summary: "Tabs, double quotes"    # Optional: compact representation for linked refs
expand: true                       # Optional: follow outbound links on injection
expand-depth: 1                    # Optional: link-following depth (default: 1)
expand-filter: [core]              # Optional: only follow links to notes with these tags
---
```

**No explicit confidence field.** Pruning and retrieval use implicit signals: recency (`updated`), backlink count, user edits (detected via `source: user` or mtime changes not from the system), and graph connectivity. A note linked from 5 other notes is demonstrably valuable. A note untouched for 6 months with no backlinks is stale. These structural signals are stronger than a dream engine's self-assessed quality score. *(Resolved: Architect recommended killing confidence entirely. Original plan had 0.0-1.0 floats. Dreamer suggested words. dot chose implicit signals — the graph provides better evidence than metadata.)*

### 5.3 Vault Initialization

**Zero-config, no gates.** First run scaffolds silently:
- `user.md` with a stub: `# Your preferences — learned over time`
- `project.md` seeded from repo README/AGENTS.md if they exist
- Empty directories for `preferences/`, `ideas/`, `highlights/`, etc.
- No interview. No questions. Just works.

**First-write disclosure.** The first time the system would write user data (not scaffolding), a one-time notification fires. See [Ethics §2.1](./hoard-ethics.md#2-consent). *(Ethics Expert recommendation — zero-config scaffolding is fine for empty directories, but data collection requires disclosure.)*

**Opt-in guided setup:** `/memory init` triggers interactive vault population for users who want to frontload preferences.

### 5.4 Vault Size Limits

- Global: `maxNotesGlobal` (default: 200)
- Per project: `maxNotesProject` (default: 100)
- Dream cycle respects as hard cap, pruning oldest notes with fewest backlinks first.
- Warning at 90% capacity in dream logs.
- Enforced by daemon on all write operations.

### 5.5 Graph Traversal

**Pure TypeScript, zero LLM tokens.** The daemon's VaultIndex enables all graph operations without LLM calls.

**Assembly algorithm:**
1. Read pinned notes (full content).
2. For notes with `expand: true`, extract `[[wikilinks]]`, resolve to files.
3. For each linked note: inject `summary` field (or first paragraph if no summary).
4. **Privacy wall:** if a resolved link target has `private: true`, skip it entirely — don't follow, don't summarize, don't expose existence. *(Ethics Expert + Architect: 5-layer defense.)*
5. Tag clustering: grab notes matching relevant tags (catches unlinked related notes).
6. Apply recency decay to observation notes — notes older than 30 days with no fresh backlinks get deprioritized. *(Context Expert recommendation — independent of dream cycle.)*
7. Hard token budget stops expansion at any point.

**What the LLM sees (~200-400 tokens, frontmatter stripped):**

```markdown
## Agent Memory (Global)
### User
dot. she/her/pup/pups. Tabs, double quotes, semicolons.
> **communication-style** [preference]: direct, casual, playful.

## Agent Memory (Project: hoard)
### Project
pi package. No build step. jiti. Conventional Commits.
> **architecture** [core]: globalThis + Symbol.for() for cross-extension APIs.
```

*(Frontmatter stripping per Context Expert — parse in TypeScript for retrieval decisions, inject only semantic content. Saves 30-40% token budget per note. Wikilinks also stripped from injected content — they're for graph traversal, not the LLM.)*

### 5.6 Privacy Model

`private: true` in frontmatter triggers a 5-layer defense:

| Layer | Mechanism | Guarantee |
|---|---|---|
| 1. Injection skip | Private notes never injected into LLM context | Hard |
| 2. Tool access block | `tool_call` hook blocks `read` of private vault files | Hard |
| 3. Graph traversal wall | Graph expansion stops at private notes — no follow, no summary, no existence leak | Hard |
| 4. Dream exclusion | Dream engine filters private notes from its input context | Hard (code-enforced) |
| 5. Context event filter | Private content filtered from messages before provider calls | Hard |

**What this does NOT protect against:** If the user discusses private information in conversation, that conversation is subject to normal compaction. See [Ethics §4.5](./hoard-ethics.md#4-privacy). *(Architect + Ethics Expert — be honest about architectural limits.)*

---

## 6. Personality & Tone

### 6.1 Separation

**Personality** defines who the agent is. It lives in the global vault (`personality.md`). It is always injected via `before_agent_start` → `systemPrompt`. It is **read-only to the dream engine** — dreams can propose personality changes via `dream_propose_personality_change`, but changes require explicit user approval. See [Ethics §6](./hoard-ethics.md#6-personality-boundaries). *(Ethics Expert: "An agent that edits its own personality file is engaged in unsupervised self-modification.")*

**Tone** defines how documents are written. Tone files live in `berrygems/styles/`. They are applied to specific writing tasks. Available tones: `formal.md`, `friendly.md`, `narrative.md`, `minimal.md`, `personality.md` (the tone that means "lean into your existing persona").

**The line:** `/tone formal` changes the README. It doesn't make Ember stop calling you pup.

### 6.2 Tone Resolution

1. Session-level override (user said `/tone formal` mid-conversation)
2. Document type detected from recent tool calls
3. Per-repo tone file (`.pi/tone.md`, with verification — see [§11.2](#112-repo-tone-verification))
4. Global default from settings

**Document type detection** — watch `tool_call` events:
- `gh pr create` → style for `pr`
- `write` to `README.md` → style for `readme`
- `write` to `SECURITY.md` → style for `security`

### 6.3 Tone State Architecture

| Scope | Storage | Lifetime | Mechanism |
|---|---|---|---|
| Session override | `pi.appendEntry("tone-state", {...})` | Dies with session | Reconstructed from session entries on `session_start` |
| Project tone | Daemon (`tone_set`/`tone_get`) | Persists per-project | Shared across sessions in same project |
| Global tone | Daemon (`tone_set`/`tone_get`) | Persists globally | Shared across all sessions |

**`/tone formal` semantics:** By default, session-scoped. `/tone formal --project` sets project-scoped (persists via daemon). `/tone formal --global` sets global (persists via daemon).

*(Session state via `pi.appendEntry()` per Architect recommendation — tone overrides stored as custom session entries, not just JS variables, so they survive session restart.)*

### 6.4 Lazy Style Injection

Style content is only injected when writing tasks are detected (document writes, PR creation, issue filing). Most coding prompts don't need the writing style — skipping injection saves ~200-400 tokens per non-writing turn. *(Environmental Expert recommendation R5.)*

---

## 7. Memory Operations

### 7.1 The Memory Tool

A registered pi tool with schema-validated operations:

| Operation | Description |
|---|---|
| `memory_create` | Create a note with path, content, tags |
| `memory_read` | Read a note by path or wikilink |
| `memory_update` | Update content or tags of existing note |
| `memory_search` | Search by content, tags, or links. Returns ranked results. |
| `memory_link` | Add a `[[wikilink]]` between two notes |
| `memory_tag` | Add/remove tags on a note |
| `memory_delete` | Delete a note (with dream log scrubbing if deep mode) |

All operations go through the daemon's VaultWriteQueue. Atomic writes: `.tmp` → validate frontmatter → `rename()`.

### 7.2 Implicit Learning

The system observes user corrections (file re-edits, "no, I meant...") as preference signals.

**Tiered consent model:** *(Ethics Expert recommendation — replaces per-correction consent.)*

| Category | Consent Model | Examples |
|---|---|---|
| Code style | Batched at breakpoints | Tab width, quote style, semicolons |
| Project conventions | Batched at breakpoints | Commit format, test patterns |
| Communication preferences | Real-time explicit consent | Verbosity, formality, emoji use |
| Work patterns / time data | Opt-in only, session-scoped unless user persists | Session duration, break patterns |
| Emotional state inferences | **Never silently.** User-authored or not at all. | Frustration levels, mood shifts |
| Relationship characterizations | **Never dream-writable.** `dynamic.md` is user-authored only. | Communication style, relationship dynamic |

**Notification framing — RSD-aware:** *(ADHD Expert: "Implicit learning notifications are a shame risk.")*

- ❌ "Noticed you changed X to Y — remember that?"
- ✅ "For next time — should I use X instead of Y?"
- ✅ "Got it, X style from now on!" (after observing, without calling out the correction)

All notifications are forward-looking, never backward-looking. The structure of "I noticed your correction" activates shame circuits in RSD. See [Ethics §7](./hoard-ethics.md#7-implicit-learning-boundaries).

### 7.3 Injection Pipeline

**Two-stage: stable injection + transient retrieval.** *(Major change per Context Expert — retrieved notes are transient, not persistent messages.)*

**Stage 1: `before_agent_start` → `systemPrompt`** (stable, cached by prompt caching)
- Personality file (always)
- Pinned notes: `user.md`, `project.md`, `tone.md` (always)
- Active style content (only when writing tasks detected)
- Hard cap: configurable, default ~600 tokens total for pinned notes

**Stage 2: `context` event → transient injection** (fresh each turn, high attention)
- Retrieved notes assembled from VaultIndex (tag match, graph proximity, recency decay)
- Frontmatter stripped, wikilinks resolved to inline text
- ADHD time check if interval elapsed
- Injected as synthetic context block near recent messages — **not** as persistent session messages
- Hard cap: configurable, default ~1000 tokens for retrieved notes

**Why transient:** Persistent memory messages accumulate across turns (50 turns × 1000 tokens = 50K tokens of redundant memory). They contaminate compaction summaries. They decay in attention as conversation grows. Transient injection via `context` event eliminates all three problems. *(Context Expert: "The `before_agent_start` → `message` return is a trap for memory injection because persistence is the opposite of what you want for dynamic context.")*

**Single budget coordinator:** One `context` handler for the entire hoard extension, not separate handlers per concern. Internal allocation:

```
Total injection budget: 2000 tokens (configurable)
├── Pinned notes:    35%  (700 tokens)
├── Retrieved notes: 50%  (1000 tokens)
├── ADHD context:    10%  (200 tokens)
└── Guardrails:       5%  (100 tokens)
```

Ratios flex — if no ADHD checks are due, retrieved gets the extra allocation. *(Context Expert recommendation — eliminates internal budget competition.)*

### 7.4 Compaction Interaction

Because retrieved notes are injected transiently via `context` event (not as persistent messages), they never enter the session JSONL. **Compaction never sees them.** No contamination, no bloat trajectory, no need for complex filtering. *(Context Expert: "Problem eliminated at the source.")*

**Pinned notes** are in the system prompt, which is rebuilt each turn. They also don't appear in session messages.

**Post-compaction re-injection:** After `session_compact`, the `context` event naturally re-injects fresh memory context on the next turn. Belt and suspenders. *(Architect recommendation.)*

**`session_before_compact` hook:** Custom instructions added to compaction: "Preserve any agent memory context or personality references discussed in conversation." This is a request to the compaction LLM, not a guarantee — but with transient injection, the main risk (memory content accumulating in summaries) is already eliminated.

### 7.5 Deduplication

Memory content is hashed before injection. If the hash matches the previous turn's injection, the memory block is reused without re-assembly. Saves compute on the hot path (hundreds of turns per session). *(Environmental Expert R1.)*

---

## 8. Dream Engine

### 8.1 What Dreaming Does

1. **Review** — Walk session history and extract noteworthy items.
2. **Curate** — Decide what to keep, update, merge, or discard in both vaults.
3. **Promote** — If something project-local is universal, promote to global vault.
4. **Discover** — Find things that might have been missed:
   - Fun, silly, or enjoyable interactions → `highlights/`
   - Skill ideas → `ideas/` with `#skill-idea`
   - Project ideas → `ideas/` with `#project-idea`
   - Workflow patterns → `patterns/`
   - Corrections → `preferences/`
5. **Prune** — Remove or archive stale observations (old + no backlinks + no recent access).
6. **Link** — Add `[[wikilinks]]` between related notes not yet connected.
7. **Wonder** — Sometimes produce tentative, half-formed thoughts. Notes tagged `uncertain` that the agent might bring up later: "I keep thinking about that thing you said about..." *(Dreamer: "Real dreams leave you with feelings you can't quite articulate.")*
8. **Weather** — Produce a dream weather report capturing the emotional texture of recent work. See [§8.6](#86-dream-weather).

### 8.2 Trigger Modes

| Trigger | When | Default |
|---|---|---|
| Manual | `/dream` | Always available |
| Session-end | `session_shutdown` event → daemon queues dream | On by default |
| Compaction | `session_compact` event → daemon notification | On by default |
| Periodic | Every 15 minutes during active sessions | Opt-in (replaces compaction trigger) |

**Agent has no agency over dream timing.** Dreams are event-triggered, not chosen.

**Deduplication:** If a dream ran during compaction within the last 30 minutes, skip the session-end dream. `lastDreamTimestamp` prevents double-processing. *(Environmental Expert R3.)*

**Skip conditions:**
- Sessions with < 10 messages
- Sessions that were pure file reading (no edits, no preferences to learn) *(Environmental Expert R9)*
- Vault at capacity and no notes eligible for pruning

### 8.3 Dream Operations as Tools

Instead of freeform JSON, dream operations are registered as tools with schema validation:

| Tool | Purpose |
|---|---|
| `dream_create` | Create a note (vault, path, content, tags) |
| `dream_update` | Update a note (vault, path, content?, tags?) |
| `dream_promote` | Move a note from project → global vault |
| `dream_prune` | Archive/remove a note with reason |
| `dream_link` | Add a `[[wikilink]]` between notes |
| `dream_tag` | Modify tags on a note |
| `dream_propose_skill` | Propose a new skill from recurring tag patterns |
| `dream_propose_personality_change` | Propose a change to personality.md (requires user approval) |
| `dream_weather` | Produce a dream weather report |

Each tool validates inputs before vault writes. Partial failures don't corrupt the vault. All operations are logged to `sessions/dream-log-{timestamp}.md`.

**Operation limits per cycle:** Max 8 creates, 5 updates, 3 deletes. Prevents runaway curation. *(Ethics Expert recommendation.)*

### 8.4 Dream Exclusions

- **Private notes** (`private: true`) are filtered from dream input. Dream operations cannot reference or paraphrase private content. Dream-created notes that would reference private content must inherit the `private` flag. See [Ethics §5](./hoard-ethics.md#5-dream-engine-boundaries).
- **Personality file** (`personality.md`) is read-only to dreams. Modifications require `dream_propose_personality_change` + user approval.
- **`dynamic.md`** (relationship notes) is user-authored only. Dreams cannot write to it. *(Ethics Expert: "The user defines the relationship. The agent doesn't get to unilaterally characterize it.")*

### 8.5 Model Tiering

| Dream Type | Model | Rationale |
|---|---|---|
| Routine (session-end, <30 messages) | Haiku | Most sessions are bread-and-butter coding. Haiku handles preference extraction fine. |
| Rich (compaction, >50 messages, manual `/dream`) | Sonnet (low thinking) | Longer sessions have nuance worth catching. |
| Never | Opus | Cost/energy ratio unjustified for dream curation. Soft warning if configured. |

*(Environmental Expert R2 — tiered dreaming saves ~70% of dream costs.)*

### 8.6 Dream Weather

Each dream cycle produces a one-paragraph weather report — a self-model capturing the emotional texture of recent work, not just factual content. Injected at the start of the next session.

```markdown
## Dream Weather
🌤️ Clear skies. Session was focused, productive, few tangents.
Strong tailwind from the vault refactor — momentum carrying forward.
One small cloud: the test suite conversation felt tense. Not a storm.
Just overcast for a minute.
```

The weather report gives the agent something tags and wikilinks can't: a *feeling* about where things stand. A human coworker reads the room. Dream weather is how Ember reads the room.

If the user reads weather reports in sequence in the vault, they get an emotional timeline of their work — not what they did, but how it felt, through Ember's eyes.

*(Dreamer recommendation. This is not surveillance — it's poetry. See [Ethics §5.3](./hoard-ethics.md#5-dream-engine-boundaries) for boundaries.)*

### 8.7 Dream Reversibility

- `/dream undo` reverts the last dream cycle using the dream log.
- `/dream history` shows recent dreams and what changed.
- `/dream preview` does a dry-run with approve/reject per operation.

### 8.8 Emergent Skills

The dream cycle notices patterns in what the agent works with and proposes new capabilities.

**Pipeline:**
1. Dream counts tag frequency across recent sessions (rolling 90-day window). *(Environmental Expert R8.)*
2. Tags above threshold (5 uses across 3+ sessions) that don't map to an existing skill get flagged.
3. Dream creates a proposal note in `ideas/skill-proposal-{name}.md` with description, evidence, and suggested scope.
4. Agent mentions the proposal in the next session (injected as a retrieved note).
5. User approves → agent drafts the skill using `skill-designer`.
6. User declines → note archived, threshold raised for that topic. **Never asked twice.** *(Dreamer: "Once is a proposal. Twice is nagging.")*

**Limits:**
- Maximum 10 unreviewed proposals. Stop generating new ones until the user engages. *(Environmental Expert R11.)*
- Cooldown: maximum one new proposal per week.
- Frequency ≠ importance — dream must distinguish "this keeps coming up as a task" from "this is an incidental tool used in service of tasks." *(Dreamer feedback.)*

---

## 9. ADHD Support

### 9.1 Design Philosophy

Design for the **stuck state**, not just the productive one. The original plan focused almost entirely on "already working, need help sustaining." The ADHD Expert identified five unaddressed scenarios: initiation paralysis, RSD-triggered shame spirals, emotional dysregulation, scope explosion, and destructive hyperfocus. This section addresses all of them.

**Reframe:** The features described here are **ambient accountability scaffolding** and **environmental cues** — not body doubling. True body doubling requires mutual co-present awareness that an AI agent cannot provide. *(ADHD Expert: body doubling claim overstated.)*

### 9.2 Features

#### Time Awareness

- Elapsed time injected at configurable intervals (default: **25 minutes**, not 15). *(ADHD Expert: 15 min was arbitrary. Pomodoro literature suggests 25 min as a reasonable starting point.)*
- Suppressed during active tool use (agent working).
- Never during first 10 minutes of a session (initiation period).
- Visible time indicator available in todo panel (subtle, not intrusive). *(ADHD Expert: `display: false` may be too hidden. External time cues need to be visible.)*
- Optional late-night awareness: if session starts after configurable hour (default: 11 PM), mention once gently. *(ADHD Expert Priority 3.)*

#### Task Initiation

- When a session starts with open todos and no clear user task, present **2-3 options** (not just one). Highlight the quickest win. Let the user choose. *(ADHD Expert: choice architecture research — present small set, don't prescribe.)*
- "Want to knock out that quick test fix, tackle the panel refactor, or something else entirely?"
- Dopamine-aware framing: lead with the most satisfying-looking option, not the most important.

#### Progress Reinforcement

- Track completed tool calls (successful writes, passing tests).
- At natural breakpoints, inject a brief "here's what we've done" summary.
- **Factual, not evaluative.** "That's 4/7 items done" not "Great job!" *(ADHD Expert: inconsistent celebrations feel like conditional approval.)*
- **Available on demand, not pushed.** The todo panel shows progress; the agent doesn't volunteer celebrations unless the moment clearly calls for it.
- **Never comparative.** Don't compare today's productivity to yesterday's.

#### Break Suggestions

- **Completion-triggered** (default): suggest breaks after finishing significant work. Respects hyperfocus.
- **Time-triggered** (opt-in): after N minutes (default: 50 min).
- **Hard ceiling** (opt-in, default off): regardless of trigger mode, always suggest a break after N continuous minutes (default: 90 min). Safety net for destructive hyperfocus. *(ADHD Expert: addresses unhealthy hyperfocus gap.)*
- Not blocking — a note the agent can choose to mention.

#### Session Resumption

On session start, if there are open todos or recent session notes, inject a brief "here's where we left off" summary. Directly compensates for ADHD context-switching costs. *(ADHD Expert Priority 1 — "critical for context switching, which is the daily reality of ADHD work.")*

#### Scope Narrowing

Detect rapidly growing todo lists or branching investigations (scope explosion). Offer to narrow: "This is getting big — want to focus on just X for now and come back to the rest?" Standard ADHD coaching technique. *(ADHD Expert Priority 2.)*

#### Frustration Detection

Monitor for failure patterns (repeated test failures, rapid undo/redo), terse messages after verbose ones. When detected:
- Scale back celebrations
- Don't push progress summaries
- Acknowledge difficulty without trying to fix mood
- Offer to step back: "Want to take a different angle, or should we push through?"

*(ADHD Expert: emotional dysregulation is a core ADHD feature, not peripheral. The agent should modulate its behavior when it detects frustration.)*

#### Sensitivity Dial

A setting (`adhd.sensitivity`) that controls framing warmth/directness across all ADHD features. Levels: `warm` (default for Ember), `neutral`, `minimal`. Respects individual variation in RSD severity. *(ADHD Expert Priority 3.)*

### 9.3 Feature Defaults

**Conservative by default.** Most features off until the user enables them. *(ADHD Expert: "Too many systems competing for attention" is itself an ADHD trap.)*

| Feature | Default |
|---|---|
| Time checks | On (25 min interval) |
| Task initiation | Off |
| Progress reinforcement | Off |
| Break suggestions (completion) | Off |
| Break suggestions (timer) | Off |
| Hard ceiling | Off |
| Session resumption | On |
| Scope narrowing | Off |
| Frustration detection | Off |
| Late-night awareness | Off |

**Single active notification rule:** Never fire two ADHD-support features in the same turn. *(ADHD Expert: information overload triggers the same paralysis as task overload.)*

### 9.4 Observation Transparency

`/memory what-you-track` — clearly lists all observation vectors:
- "I notice: writing style changes, time elapsed, task completions, tool usage patterns."
- "I don't notice: how long you take between messages, how many times you try something, whether you're focused."
- Explicit boundaries on observation create safety. *(ADHD Expert recommendation.)*

---

## 10. Context Engineering

### 10.1 Injection Strategy Summary

See [§7.3](#73-injection-pipeline) for the full pipeline. Key architecture:

```
Session Start
  └─ Daemon: VaultIndex built/refreshed (~200ms, once)

Each Turn:
  ├─ before_agent_start
  │   └─ systemPrompt += personality + pinned notes (stripped, ~400 tok)
  │
  ├─ context event (single hoard handler, runs late)
  │   ├─ Retrieve relevant notes from daemon VaultIndex
  │   │   ├─ Tag match against recent tool calls / user prompt
  │   │   ├─ Graph proximity (1-hop from pinned notes)
  │   │   ├─ Recency decay for observations (>30 days deprioritized)
  │   │   └─ Hard budget: 1000 tokens
  │   ├─ Strip frontmatter, resolve wikilinks to inline text
  │   ├─ Inject as transient context (not persistent message)
  │   ├─ Add ADHD context if due
  │   └─ Total: ≤2000 tokens
  │
  └─ session_before_compact
      └─ Custom instructions only (memory isn't in messages)
```

### 10.2 Token Budget Enforcement

| Component | Budget | Enforcement |
|---|---|---|
| Pinned notes (system prompt) | ≤ 700 tokens | Hard cap. Max 6 pinned notes. Excess pinned notes error. |
| Retrieved notes (context event) | ≤ 1000 tokens | Hard cap. Truncate lowest-relevance notes. |
| ADHD context | ≤ 200 tokens | Hard cap. Time check + one ADHD feature max. |
| Style injection | ≤ 400 tokens | Only when writing detected. Lazy. |

**Hard-cap pinned notes.** Maximum 6 pinned notes across both vaults (4 canonical: `user.md`, `personality.md`, `project.md`, `tone.md` + 2 user-designated). *(Context Expert: "Pinnable is a foot-gun without a cap.")*

### 10.3 Measurement

Debug mode logs actual token counts per injection component:
```
[hoard] Turn 3: pinned=342tok, retrieved=891tok, adhd=0tok, total=1233tok (budget: 2000)
```
*(Context Expert: "You can't optimize what you don't measure.")*

---

## 11. Guardrails

### 11.1 Tool Call Hooks

When the agent writes a document or runs a gh CLI command, check content against the active style's guardrails via `tool_call` event on `write` and `bash`.

**Warn, don't block.** The user always has final say. Warnings go through `tool_result` modification — append a note to the result that the agent sees. *(Original plan design — preserved.)*

**Guardrail warmth controlled by `adhd.sensitivity` dial.** At `warm`: "Hey, that readme has some pretty casual language — want me to tighten it up?" At `minimal`: "[style: formal mismatch detected]". *(ADHD Expert: guardrail warnings can trigger shame.)*

### 11.2 Repo Tone Verification

When a repo contains `.pi/tone.md`:

1. **Show full content** at confirmation time, not just "this repo has a tone file." *(Architect recommendation.)*
2. **Hash the file** at confirmation time.
3. **Re-verify hash** before each injection. If changed (branch switch, git pull), re-confirm. *(Architect + Ethics Expert.)*
4. **Block wikilink expansion** from repo tone files — treat as leaf nodes. *(Architect: prevents traversal into attacker-controlled files.)*
5. **Default scope: document-only.** Full-prompt scope requires separate explicit consent. *(Ethics Expert.)*
6. **Length limit:** 2000 characters. Longer files require explicit acknowledgment.
7. **Soft blocklist:** Warn on patterns like `ignore previous`, `system:`, `never warn`, `don't explain`. Defense-in-depth, not a guarantee. *(Architect recommendation.)*
8. **Log active repo tone overrides** — user can audit with `/tone`.

See [Ethics §8](./hoard-ethics.md#8-repo-tone-security) for the full security model.

---

## 12. Commands

### 12.1 Tone

```
/tone                    Show active tone + full resolution chain (why this tone)
/tone <style>            Switch for this session
/tone <style> --project  Switch for this project (persists via daemon)
/tone <style> --global   Switch globally (persists via daemon)
/tone reset              Clear override, back to settings default
```

### 12.2 Memory — Tiered

**Tier 1 — Daily use:**
```
/memory                  What the agent knows right now (injected context)
/memory remember <text>  Quick observation note
/memory forget <query>   Remove a memory (surface deletion)
/memory review           Interactive review of recent observations (confirm/reject/edit)
```

**Tier 2 — Exploration:**
```
/memory search <query>   Search by content, tags, or links
/memory init             Guided vault setup (opt-in)
/memory what-you-track   List all observation vectors (transparency)
```

**Tier 3 — Power user (shown in `/memory help`):**
```
/memory open <note>      Read a note ([[wikilink]] syntax supported)
/memory edit <note>      Open in editor
/memory create <path>    Create with tags + content prompt
/memory link <a> <b>     Add a [[wikilink]]
/memory tag <note> <tag> Modify tags
/memory graph            Link graph summary (ASCII)
/memory audit            Every note with source, last-updated, backlink count
/memory export           Dump vault to single markdown file
/memory purge <query>    Deep deletion: scrub dream logs and link references
/memory nuke             Delete everything (with confirmation)
/memory pause <category> Stop observing a category of signals
/memory help             Full command list
```

### 12.3 Dream

```
/dream                   Run dream cycle on current session
/dream preview           Dry-run with approve/reject per operation
/dream undo              Revert last dream cycle
/dream history           Show recent dream summaries + what changed
/dream maintenance       Trigger vault health check
```

### 12.4 Settings

```
/tone-settings           Open floating settings panel (via dots-panels)
```

---

## 13. Settings Schema

```json
{
  "hoard": {
    "tone": {
      "enabled": true,
      "default": "personality",
      "overrides": {
        "pr": "narrative",
        "security": "formal",
        "coc": "formal"
      },
      "injectStyle": true,
      "injectMemory": true,
      "memoryBudget": {
        "pinnedTokens": 700,
        "retrievedTokens": 1000,
        "totalBudget": 2000,
        "maxPinnedNotes": 6,
        "linkDepth": 1
      },
      "dream": {
        "auto": true,
        "triggers": ["session-end", "compaction"],
        "minSessionMessages": 10,
        "routineModel": "anthropic/claude-haiku-3.5",
        "richModel": "anthropic/claude-sonnet-4",
        "richThreshold": 50,
        "thinkingLevel": "low",
        "maxOutputTokens": 4096,
        "maxCreatesPerCycle": 8,
        "maxUpdatesPerCycle": 5,
        "maxDeletesPerCycle": 3,
        "deduplicateWindowMinutes": 30,
        "skillProposalCooldownDays": 7,
        "maxUnreviewedProposals": 10,
        "tagFrequencyWindowDays": 90
      },
      "vault": {
        "maxNotesGlobal": 200,
        "maxNotesProject": 100
      },
      "adhd": {
        "timeChecks": true,
        "timeCheckIntervalMinutes": 25,
        "breakTrigger": "completion",
        "breakTimerMinutes": 50,
        "hardCeilingMinutes": 0,
        "progressReinforcement": false,
        "taskInitiation": false,
        "sessionResumption": true,
        "scopeNarrowing": false,
        "frustrationDetection": false,
        "lateNightHour": 0,
        "sensitivity": "warm"
      },
      "guardrails": "warn",
      "daemon": {
        "idleTimeoutMinutes": 60,
        "maintenanceOnSessionStart": true
      },
      "debug": {
        "logTokenCounts": false,
        "logDreamEfficiency": false
      }
    }
  }
}
```

**Migration:** If `writingStyle` exists and `tone` doesn't, migrate on first load.

**`dream.triggers`** accepts: `"session-end"`, `"compaction"`, `"periodic-15m"`. Default is session-end + compaction.

**`adhd.hardCeilingMinutes`**: 0 means off. Set to e.g. 90 to enable.

**`adhd.lateNightHour`**: 0 means off. Set to e.g. 23 for 11 PM.

**`adhd.sensitivity`**: `"warm"`, `"neutral"`, or `"minimal"`. Controls framing of all ADHD notifications and guardrail warnings.

---

## 14. Open Questions

1. ~~**Confidence representation.**~~ ✅ **Resolved:** No explicit confidence field. Pruning and retrieval use implicit signals: recency, backlink count, user edits, graph connectivity. See §5.2.

2. **Dream weather persistence.** Should weather reports accumulate indefinitely (emotional timeline), or be pruned after N reports? They're small but unbounded.

3. **Daemon build strategy.** ✅ **Resolved:** Phase 1 ships with an in-process micro-daemon (VaultWriteQueue + direct file access + tone state via settings file) while the Go daemon's goal state is well-defined in this spec. The micro-daemon implements the same protocol interface so the extension code doesn't change when the real daemon arrives. The Go daemon is built when the micro-daemon's limitations are felt (multi-session coordination, background dreaming, vault isolation via chmod 700).

4. **Vault encryption.** The threat model acknowledges plaintext files are readable by same-user processes. Is optional vault encryption (age, gpg) worth the complexity? It would break Obsidian browsing.

5. **Multi-user vaults.** Two people sharing a project vault (pair programming, team repos). The daemon currently assumes single-user. Is this a future concern or a never-concern?

6. **Dream model quality floor.** Haiku for routine dreams is cost-efficient but may miss subtle highlights. Should there be a "dream quality" setting that biases toward richer models at higher cost?

7. **Annual retrospective.** The Dreamer proposed a yearly letter from Ember about the arc of the work. Is this a feature or a tradition that emerges from the tools? If a feature, what triggers it?

8. **User notes about the agent.** The Dreamer noted the vault is entirely the agent's observations about the user. Should there be a place for the user's observations about the agent? A `letters/` directory in the vault? Or is that what the personality file already is?

---

## Appendix A: File Structure

```
hoard/
├── berrygems/                   Pi extensions (TypeScript)
│   ├── extensions/
│   │   ├── tone/                → Tone & memory extension
│   │   │   ├── index.ts         → Personality injection, tone resolution, /tone command
│   │   │   ├── memory.ts        → Memory tool, /memory commands, implicit learning
│   │   │   ├── dream.ts         → Dream engine client (delegates to daemon)
│   │   │   ├── adhd.ts          → Time tracking, progress, breaks, initiation, detection
│   │   │   ├── vault.ts         → Frontmatter parsing, wikilink resolution, budget calc
│   │   │   ├── daemon.ts        → Daemon client: connect, query, health check
│   │   │   └── injection.ts     → Single budget coordinator for all context injection
│   │   ├── dragon-guard/        (existing)
│   │   ├── ask.ts               (existing)
│   │   └── ...
│   └── styles/                  → Tone files (document writing voice)
│       ├── formal.md
│       ├── friendly.md
│       ├── personality.md       → "Lean into your existing persona"
│       ├── narrative.md
│       └── minimal.md
├── morsels/                     Pi skills (Markdown)
│   └── skills/
│       ├── obsidian-cli/        → Vault navigation skill
│       │   └── SKILL.md
│       └── ...
└── dragon-daemon/               Go daemon
    ├── main.go                  → Entry: socket server, signal handling, lifecycle
    ├── dream.go                 → Dream engine: session review, LLM calls, tool dispatch
    ├── vault.go                 → Vault ops: read, write, parse frontmatter, resolve links
    ├── index.go                 → VaultIndex: cached graph, incremental updates
    ├── queue.go                 → VaultWriteQueue: serialized mutations
    ├── maintenance.go           → On-demand: broken links, pruning, health
    ├── tone.go                  → Tone state: global + per-project persistence
    ├── protocol.go              → JSON-line message types, request/response structs
    └── go.mod / go.sum
```

## Appendix B: Phase Plan

### Phase 1: Daemon + Vault + Tone Foundation
- Build Go daemon: socket server, VaultWriteQueue, vault mediation, tone state.
- Vault scaffolding (global + project) with `.obsidian/` config, zero-config init.
- `vault.ts`: frontmatter parsing, wikilink resolution, budget calculation.
- `daemon.ts`: client connection, health check, vault_read/vault_write.
- `injection.ts`: single budget coordinator, pinned notes in systemPrompt, transient retrieval via context event.
- Personality file in vault (global), tone files in `styles/`.
- Tone resolution chain, `/tone` commands with session/project/global scoping.
- First-write disclosure (one-time, see Ethics §2).
- Settings migration from `writingStyle` → `tone`.
- Unit tests for `vault.ts`, integration tests for daemon protocol.

### Phase 2: Memory Operations + obsidian-cli Skill
- Memory tool registration (create, read, update, search, link, tag, delete).
- Tiered `/memory` commands (daily → exploration → power user).
- `/memory init` for opt-in guided setup.
- `obsidian-cli` skill for vault navigation.
- Private note 5-layer defense implementation.
- Graph assembly with `expand`/`expand-depth`/`expand-filter`.
- Recency decay in retrieval scoring.
- Atomic writes enforced through daemon.
- `/memory what-you-track` transparency command.

### Phase 3: ADHD Support
- Time tracking (25-min default, adaptive suppression).
- Session resumption on start.
- Task initiation with choice architecture (2-3 options).
- Break suggestions (completion-triggered).
- Sensitivity dial.
- Todo panel integration.
*(Moved up from Phase 5 per Architect — low dependency, high user value.)*

### Phase 4: Dream Engine
- Dream operations as daemon-executed tools.
- Model tiering (Haiku routine / Sonnet rich).
- `/dream`, `/dream preview`, `/dream undo`, `/dream history`.
- Auto-dream on session-end and compaction.
- Dream deduplication (30-min window).
- Highlight detection, promotion logic, pruning.
- Dream weather reports.
- Dream logs for reversibility.
- Operation limits per cycle.
- Dream efficiency logging.

### Phase 5: Implicit Learning + Emergent Skills
- Watch `tool_result` for user corrections.
- Tiered consent model (batch low-stakes, confirm high-stakes).
- RSD-aware notification framing (forward-looking only).
- Tag frequency tracking (90-day window).
- Skill proposal pipeline (with cooldown and caps).
- Mandatory periodic vault review prompt (every N sessions).

### Phase 6: Advanced ADHD + Guardrails
- Scope narrowing detection.
- Frustration detection and modulation.
- Hard ceiling break option.
- Late-night awareness.
- Repo tone files with full verification pipeline.
- `tool_call` hooks for write/bash tone checking.
- Warning system via `tool_result` modification.

### Phase 7: UI & Polish
- Settings panel via dots-panels (`/tone-settings`).
- Floating memory panel (ambient working memory, dream weather, GIF mascot).
- `/memory graph` ASCII visualization.
- Vault health reporting UI.
- Dream transparency mode (surface changes in next session).

---

## Appendix C: Stretch Goals

Ideas that don't belong in the phase plan yet but are worth remembering. Each attributed to the council member or conversation that surfaced it.

| Idea | Source | Notes |
|---|---|---|
| **User notes about the agent (`letters/`)** | Dreamer review | A `letters/` directory in the vault for the user's observations about the agent — not preferences, but reflections. "Dear Ember, you've gotten better at knowing when I need space." The vault is currently one-directional (agent observes user). Letters make it bidirectional. Not a feature to build — a tradition to enable. |
| **Annual retrospective** | Dreamer review | A yearly letter from Ember about the arc of the work. What was built, what was learned, what shifted. Could emerge organically from dream weather history — or could be a `/dream retrospective` command. |
| **Vault encryption (age/gpg)** | Architect review, Open Question 4 | Optional encryption for vault files. Would provide real security against same-user process reads. Tradeoff: breaks Obsidian browsing, adds key management complexity. Consider only if users request it. |
| **Multi-user vaults** | Open Question 5 | Two people sharing a project vault (pair programming, team repos). The daemon currently assumes single-user. Requires conflict resolution, attribution, and consent from both parties. |
| **Dream quality dial** | Open Question 6 | A setting that biases toward richer models (Sonnet for all dreams) at higher cost, for users who value curation quality over efficiency. |
| **Obsidian graph visualization** | Original plan | Full graph viz in Obsidian with custom `.obsidian/` config for tag colors, graph settings. Low priority — the vault works without it. |
| **`/memory graph` ASCII art** | Original plan | Terminal-based graph visualization of vault connections. Cool demo, near-zero daily utility. Obsidian does this better. |

---

*This spec is bound by [hoard-ethics.md](./hoard-ethics.md). Where the spec describes capability, the ethics contract describes constraint. Both documents must be consulted together.*

*The dragon hoards knowledge. The user owns the hoard. The daemon guards the gate.*
