# hoard-allies — Feature Tracker

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Governed by [ETHICS.md](../../../ETHICS.md)** — carbon accountability (§3.7) is the primary ethical driver.

**Status:** 🐣 in-progress (Phase 1 ✅ as hoard-kobolds, Phase 2 speccing)
**Code:** `berrygems/extensions/hoard-allies.ts` (rename from hoard-kobolds)
**Skill:** `morsels/skills/hoard-allies/`

## What It Is

An agent orchestration framework for the hoard. Manages the lifecycle of subagents — who can summon them, what they can do, how much they cost, and how they communicate.

**Not just agent definitions.** This is the coordination layer between the dragon (primary session) and her allies (subagents). It tracks budgets, enforces spawn limits, trims context for efficiency, and optionally enables inter-agent communication.

## Core Concepts

### The Taxonomy: `<adjective>-<noun>-<job>`

Three dimensions that fully describe any ally:

**Adjective** (thinking level):

| Adjective | Thinking | Cost Multiplier |
|-----------|----------|-----------------|
| silly / empty | none | 1× |
| clever | low | 1.5× |
| wise | medium | 2× |
| elder | high / xhigh | 3× |

**Noun** (model tier):

| Noun | Default Models (fallback chain) | Base Cost |
|------|-------------------------------|-----------|
| kobold | haiku → gemini-flash | $ |
| griffin | sonnet → gemini-pro | $$$ |
| dragon | opus | $$$$$ |

**Job** (role + tools + behavior):

| Job | Tools | Behavior | Reports Back When |
|-----|-------|----------|-------------------|
| scout | read, grep, find, ls, bash | Read-only recon. Report findings. | Finds something that needs modification |
| reviewer | read, grep, find, ls, bash | Analyze, cite file:line, severity rank. Don't fix. | Finds critical issues needing architectural decisions |
| coder | read, grep, find, ls, bash, write, edit | Implement, verify (lint/test/build), follow conventions. | Hits permission issues, architectural questions, scope creep |
| researcher | read, grep, find, ls, bash, web_search, fetch_content | Search, read, summarize. Cite URLs. | Can't find information, needs clarification on scope |
| planner | read, grep, find, ls | Strategic thinking. Break down, identify risks. Don't execute. | Plan is ready for review, found blocking unknowns |

---

## Agent State Tracking

### Session Allowance

Every session (primary or subagent) has an **allowance** — a budget for how many subagents it can spawn and of what tier.

```
Session Allowance:
  total_spawns: 4          # max subagents this session can create
  remaining_spawns: 3      # how many left
  tier_limits:             # per-noun caps
    kobold: unlimited
    griffin: 2
    dragon: 0              # kobolds can't summon dragons
  refund_on_complete: true # get a spawn back when a subagent finishes
```

**Allowance by noun tier:**

| Requester | total_spawns | Can Summon | refund_on_complete |
|-----------|-------------|------------|-------------------|
| Primary (Ember) | configurable (default: 8) | kobold, griffin, dragon | true |
| dragon | 4 | kobold, griffin | true |
| griffin | 2 | kobold only | true |
| kobold | 0 | nobody | — |

**Refund on complete:** When a subagent finishes its task, the parent session gets a spawn slot back. This means Ember can send out 4 kobold-scouts in parallel, and as they return, she gets slots back to send more. The cap is on *concurrent* allies, not total.

### Enforcement

When an agent (or the primary session) requests a subagent:

1. **hoard-allies checks the requester's allowance**
2. If over limit → **block the request** with a message:
   ```
   Spawn limit reached (2/2 griffin slots used).
   Report to your dispatcher for additional resources.
   ```
3. If within limit → **approve, decrement remaining, spawn the ally**
4. When ally completes → **increment remaining** (if refund_on_complete)

This is **deterministic enforcement**, not advisory. The tool call is blocked, not just warned.

---

## Context Management

### What Gets Trimmed for Subagents

Subagents don't need the full primary session context. hoard-allies strips:

1. **Persona/character blocks** — The `APPEND_SYSTEM.md` Ember personality prompt. Allies don't need to know about dragon stomachs.
2. **Unrelated skills** — Only inject skills relevant to the ally's job.
3. **Session history** — Fresh context. Allies get their task prompt, not the full conversation.
4. **Digestion overhead** — Subagents don't need dragon-digestion's tiered compaction system running. Their tasks are short-lived and focused.

### Interaction with dragon-digestion

dragon-digestion manages the primary session's context lifecycle (5-tier system: hygiene → alert → light prune → heavy prune → LLM summary). For allies:

- **Allies skip digestion entirely** — their tasks should be short enough to never hit context limits. If an ally's context fills up, the task was scoped too broadly — report back to dispatcher.
- **Dispatcher uses digestion summaries** — when dispatching allies, the dispatcher can pull from dragon-digestion's structured summary template (Session Intent, Files Modified, Decisions Made, etc.) to build targeted context for each ally.
- **Compaction templates are reusable** — the `buildFirstCompactionPrompt` / `buildAnchoredUpdatePrompt` patterns from `berrygems/lib/compaction-templates.ts` could be adapted for ally result summarization (compacting multiple ally reports into a coherent synthesis).

### What Gets Injected

Subagents receive a targeted system prompt containing:

1. **Identity block** — Who they are in the taxonomy
   ```
   You are a wise-griffin-reviewer.
   Thinking: medium | Model: sonnet | Job: reviewer
   ```

2. **Job instructions** — What they can do, how to behave, when to report back

3. **Tool manifest** — Explicit list of available tools (matches job)

4. **Spawn budget** — How many allies they can summon (if any)
   ```
   Spawn budget: 2 (kobolds only)
   If you need more help, report back to your dispatcher.
   ```

5. **Task context** — Direct references to files/directories/context the dispatcher already knows they need
   ```
   Relevant files:
   - /home/dot/Development/hoard/dragon-daemon/internal/attention/
   - /home/dot/Development/hoard/dragon-daemon/AGENTS.md
   ```

6. **Hoard-allies interaction** — How to request allies (if they have budget), how to report back
   ```
   To request an ally: use the subagent tool with agent: "<adj>-<noun>-<job>"
   To report back: end your response with your findings. Your dispatcher will review.
   ```

---

## Inter-Agent Communication (Nice to Have — Phase 3)

### The Chatroom

A lightweight message-passing system between active agents/subagents.

**Concept:** Instead of every request routing through the dispatcher (Ember), agents can **tag** each other directly if they believe another active agent has relevant context.

**Example:**
```
[silly-kobold-scout-1] → [wise-griffin-reviewer-1]:
  "Found 3 files with no test coverage in attention/. You reviewing that package?"

[wise-griffin-reviewer-1] → [silly-kobold-scout-1]:
  "Yes, adding those to my findings. Can you also check heart/ for the same pattern?"
```

**Rules:**
- Only active (currently running) agents can be tagged
- Messages are lightweight — one line, like a chat
- Agents can ignore tags if they're focused on their task
- The dispatcher sees all messages (transparency)
- Messages don't count against spawn budget (they're free)

**Implementation options:**
- Shared file/IPC channel that agents poll
- Event-based via extension hooks
- Simple append-only log file that agents read

---

## Configuration

```json
{
  "hoard": {
    "allies": {
      "models": {
        "kobold": ["anthropic/claude-haiku-4-5", "github-copilot/claude-haiku-4-5", "google/gemini-2.0-flash"],
        "griffin": ["anthropic/claude-sonnet-4-6", "github-copilot/claude-sonnet-4-6", "google/gemini-2.5-pro"],
        "dragon": ["anthropic/claude-opus-4-6", "github-copilot/claude-opus-4-6"]
      },
      "thinking": {
        "silly": "none",
        "clever": "low",
        "wise": "medium",
        "elder": "high"
      },
      "maxParallel": 4,
      "confirmAbove": "griffin",
      "announceDispatch": true,
      "stripAppendForSubagents": true,
      "allowances": {
        "primary": { "totalSpawns": 8, "refundOnComplete": true },
        "dragon": { "totalSpawns": 4, "canSummon": ["kobold", "griffin"], "refundOnComplete": true },
        "griffin": { "totalSpawns": 2, "canSummon": ["kobold"], "refundOnComplete": true },
        "kobold": { "totalSpawns": 0, "canSummon": [], "refundOnComplete": false }
      }
    }
  }
}
```

---

## Ally Names

Every dispatched ally gets a randomly selected name from a pre-generated pool, based on their noun tier. Names are shuffled and drawn without replacement until the pool is exhausted, then reshuffled.

### Name Pools

**Kobold names** — short, scrappy, chaotic energy:
```
Grix, Snark, Blik, Twig, Wort, Nib, Dreg, Skrit, Midge, Pip,
Fizz, Grub, Splint, Runt, Dink, Clod, Smudge, Fleck, Nub, Scrap,
Zig, Glint, Mote, Crisp, Soot, Char, Wisp, Dross, Kink, Flint
```

**Griffin names** — noble, sharp, competent:
```
Aldric, Kestrel, Talon, Sable, Argent, Voss, Merrik, Petra, Aura, Dusk,
Vale, Seren, Briar, Flint, Lyric, Storm, Ember, Sage, Quill, Riven,
Crest, Corvid, Dawn, Ashen, Thorn, Sigil, Wren, Fable, Gale, Lark
```

**Dragon names** — ancient, weighty, wise:
```
Azurath, Thalaxis, Pyranthis, Veridian, Obsidius, Solanthae, Nocturis,
Aurumex, Crystallis, Tempestus, Ignaris, Umbralith, Aethonis, Drakmoor
```

### Name Assignment

1. On session start, shuffle each pool
2. When an ally is spawned, pop the next name from the appropriate pool
3. The ally's **display name** is `{Name} the {Adjective} {Noun} {Job}`
   - e.g., "Grix the Silly Kobold Scout", "Kestrel the Wise Griffin Reviewer"
4. Their system prompt starts with: `You are {Name} the {Adjective} {Noun} {Job}.`
   - e.g., "You are Grix the Silly Kobold Scout."
5. Names are included in dispatch announcements and result headers
6. When pool exhausts, reshuffle — names can repeat across waves

---

## Technical Implementation Details

### Pi Integration Points

The extension hooks into pi's lifecycle via the ExtensionAPI:

**1. Agent Def Generation** (`session_start` event)
- Generate `.pi/agents/{adj}-{noun}-{job}.md` files from settings + taxonomy
- Each file has YAML frontmatter: `name`, `description`, `tools`, `model`, `thinking`, `maxSubagentDepth`
- Body is the job-specific system prompt
- `maxSubagentDepth` maps to spawn budgets: kobold=0, griffin=1, dragon=2

**2. System Prompt Injection** (`before_agent_start` event)
- **Primary session:** inject dispatch rules, taxonomy reference, current allowance state
- **Subagent session:** strip `APPEND_SYSTEM.md`, inject ally identity + job instructions + spawn budget
- Detection: `ctx.hasUI === false` means subagent

**3. Allowance State** (in-memory, per session)
- Stored on `globalThis[Symbol.for("hoard.allies.state")]`
- Tracks: `{ active: Map<string, AllyInfo>, spawnCounts: Record<string, number>, nameQueues: Record<string, string[]> }`
- `AllyInfo`: `{ name, taxonomy, spawnedAt, status: 'running' | 'completed' | 'failed' }`
- Decremented on spawn, incremented on completion (if refundOnComplete)

**4. Dispatch Announcements** (`tool_result` event for subagent tool)
- If `announceDispatch` is true, log: `"🐲 Dispatching Grix the Silly Kobold Scout..."`
- On completion: `"✅ Grix reports back: {summary}"`

### Agent Def File Format

Example generated file `.pi/agents/wise-griffin-reviewer.md`:
```markdown
---
name: wise-griffin-reviewer
description: Deep analysis, architecture review, spec alignment. Analyzes and reports — does not modify files.
tools: read, grep, find, ls, bash
model: anthropic/claude-sonnet-4-6
thinking: medium
maxSubagentDepth: 1
output: false
---

You are {Name} the Wise Griffin Reviewer.

## Your Role
You are a strong analytical agent with medium reasoning depth. Your job is to review code and documentation thoroughly.

## What You Do
- Read and analyze code, documentation, and configuration
- Cite every finding with file:line references
- Prioritize findings: critical > warning > suggestion
- Report your analysis — do NOT modify any files

## What You Don't Do
- You do not write or edit files
- You do not make architectural decisions — flag them for your dispatcher
- You do not spawn more than 2 subagents (kobolds only)

## When to Report Back
- You find critical issues that need architectural decisions
- You need context that wasn't provided in your task
- You need tools you don't have access to
- Your analysis reveals scope beyond your original task

## Spawn Budget
You may dispatch up to 2 kobold-scouts or kobold-reviewers to help with scanning.
If you need more help, report back to your dispatcher.

## Output Format
Structure your findings as:
1. Summary (2-3 sentences)
2. Findings table (severity | file:line | description)
3. Recommendations (prioritized)
```

### Tool Restrictions Per Job

Tool lists are enforced by pi via the agent def frontmatter `tools:` field. If an agent tries to use a tool not in its list, pi blocks it.

| Job | tools: field |
|-----|-------------|
| scout | read, grep, find, ls, bash |
| reviewer | read, grep, find, ls, bash |
| coder | read, grep, find, ls, bash, write, edit |
| researcher | read, grep, find, ls, bash, web_search, fetch_content |
| planner | read, grep, find, ls |

### Allowance Enforcement Flow

```
User/Agent requests subagent dispatch
  ↓
hoard-allies intercepts (tool_call event for subagent tool)
  ↓
Parse agent name → extract noun tier
  ↓
Check requester's allowance:
  - Is requester over maxParallel?
  - Is requester's noun tier allowed to summon this noun?
  - Does requester have remaining spawn slots?
  ↓
If denied → block tool call, return error message:
  "Spawn limit reached (2/2 griffin slots). Report to dispatcher."
  ↓
If approved → 
  - Decrement requester's remaining spawns
  - Pop name from appropriate pool
  - Inject name into agent's system prompt ({Name} placeholder)
  - Allow tool call to proceed
  - Track ally in state
  ↓
On ally completion →
  - Mark ally as completed in state
  - If refundOnComplete → increment requester's remaining spawns
  - Announce completion
```

---

## Implementation Phases

### Phase 1 — Taxonomy + Agent Defs ✅ (done as hoard-kobolds)
- [x] Extension with system prompt injection
- [x] Settings-driven agent def generation
- [x] `/kobolds` command (will become `/allies`)
- [x] Skill documenting the taxonomy
- [x] Subagent system append stripping
- [x] dragon-musings subagent skip

### Phase 2 — Jobs + Allowances + Context (current)
- [ ] Rename hoard-kobolds → hoard-allies (extension, skill, settings, agent defs)
- [ ] Add job dimension to taxonomy
- [ ] Custom system prompts per job (identity, instructions, tools, budget)
- [ ] Generate 13 curated `<adj>-<noun>-<job>` agent defs
- [ ] Allowance tracking (spawn budgets, tier limits, refund on complete)
- [ ] Deterministic enforcement (block over-budget requests)
- [ ] Context trimming (strip persona, inject relevant context only)
- [ ] Update skill and system prompt injection
- [ ] Absorb pi-subagents dispatch into hoard-allies

### Phase 3 — Inter-Agent Communication (future)
- [ ] Chatroom message passing between active agents
- [ ] Dispatcher visibility into all messages
- [ ] Agent tagging / direct requests
- [ ] Integration with dragon-daemon attention economy

### Phase 4 — Carbon Integration (future)
- [ ] Pre-dispatch cost estimation
- [ ] Post-dispatch cost reporting
- [ ] Integration with dragon-breath
- [ ] Budget-aware auto-downgrade (if budget low, prefer kobolds over griffins)

---

## Curated Agent Combos (Phase 2 default set)

| Agent | Use Case |
|-------|----------|
| silly-kobold-scout | File scanning, listing, quick checks |
| clever-kobold-scout | Scanning with light reasoning |
| clever-kobold-reviewer | Simple validation, frontmatter checks |
| wise-kobold-reviewer | Moderate code review, pattern analysis |
| silly-griffin-coder | Straightforward code generation |
| clever-griffin-coder | Implementation with reasoning |
| clever-griffin-reviewer | Thorough code review |
| wise-griffin-reviewer | Deep analysis, architecture review |
| wise-griffin-researcher | Web research, documentation gathering |
| elder-griffin-coder | Complex refactoring, multi-file changes |
| elder-griffin-reviewer | Security review, ethics compliance |
| wise-dragon-planner | Strategic planning, spec writing |
| elder-dragon-planner | Foundational architecture decisions |
