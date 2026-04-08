# hoard-allies — Feature Tracker

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Governed by [ETHICS.md](../../../ETHICS.md)** — carbon accountability (§3.7) is the primary ethical driver.

**Status:** 🔥 beta (Phase 2 implemented, dispatch absorption remaining)
**Code:** `berrygems/extensions/hoard-allies.ts`
**Skill:** `morsels/skills/hoard-allies/`
**Agent defs:** `.pi/agents/<adj>-<noun>-<job>.md` (auto-generated on session start)

## What It Is

An agent orchestration framework for the hoard. Manages the lifecycle of subagents — who can summon them, what they can do, how much they cost, and how they communicate.

**Not just agent definitions.** This is the coordination layer between the dragon (primary session) and her allies (subagents). It tracks budgets via formula-based costing, enforces limits deterministically, trims context for efficiency, and names each ally from shuffled pools.

---

## Core Concepts

### The Taxonomy: `<adjective>-<noun>-<job>`

Three dimensions that fully describe any ally:

**Adjective** (thinking level):

| Adjective | Thinking | Cost Multiplier |
|-----------|----------|-----------------|
| silly | none | 1× |
| clever | low | 1.5× |
| wise | medium | 2× |
| elder | high | 3× |

**Noun** (model tier):

| Noun | Default Models (fallback chain) | Cost Weight |
|------|-------------------------------|-------------|
| kobold | haiku → gemini-flash | 1 |
| griffin | sonnet → gemini-pro | 5 |
| dragon | opus | 25 |

**Job** (role + tools + behavior):

| Job | Tools | Behavior | Cost Multiplier |
|-----|-------|----------|-----------------|
| scout | read, grep, find, ls, bash | Read-only recon. Report findings. | 0.5× |
| reviewer | read, grep, find, ls, bash | Analyze, cite file:line, severity rank. Don't fix. | 1× |
| coder | read, grep, find, ls, bash, write, edit | Implement, verify, follow conventions. | 1.5× |
| researcher | read, grep, find, ls, bash | Search, read, summarize. Cite sources. | 1× |
| planner | read, grep, find, ls | Strategic thinking. Break down, identify risks. Don't execute. | 1.2× |

---

## Budget System

### Formula-Based Costing

**Budget is resource-based, not count-based.** A silly-kobold-scout and a wise-kobold-reviewer are both kobolds, but they consume wildly different resources. The budget reflects this.

```
cost = noun_weight × thinking_multiplier × job_multiplier
```

### Cost Table (13 curated combos)

| Agent | Formula | Cost | Use Case |
|-------|---------|------|----------|
| silly-kobold-scout | 1 × 1 × 0.5 | 0.5 | File scanning, listing, structure mapping |
| clever-kobold-scout | 1 × 1.5 × 0.5 | 0.75 | Scanning with light reasoning |
| clever-kobold-reviewer | 1 × 1.5 × 1 | 1.5 | Simple validation, frontmatter checks |
| wise-kobold-reviewer | 1 × 2 × 1 | 2.0 | Pattern matching, moderate code review |
| silly-griffin-coder | 5 × 1 × 1.5 | 7.5 | Straightforward code generation |
| clever-griffin-coder | 5 × 1.5 × 1.5 | 11.25 | Feature implementation, refactoring |
| clever-griffin-reviewer | 5 × 1.5 × 1 | 7.5 | Thorough code review, architecture analysis |
| wise-griffin-reviewer | 5 × 2 × 1 | 10.0 | Deep review, spec alignment |
| wise-griffin-researcher | 5 × 2 × 1 | 10.0 | Research, synthesis, multi-source comparison |
| elder-griffin-coder | 5 × 3 × 1.5 | 22.5 | Complex refactoring, multi-file changes |
| elder-griffin-reviewer | 5 × 3 × 1 | 15.0 | Security review, ethics compliance |
| wise-dragon-planner | 25 × 2 × 1.2 | 60.0 | Major spec authoring, architecture decisions |
| elder-dragon-planner | 25 × 3 × 1.2 | 90.0 | Foundational decisions — justify this! |

### Budget Pools

| Requester | Budget | Can Summon | Refund |
|-----------|--------|------------|--------|
| Primary (Ember) | 100 pts | kobold, griffin, dragon | 50% on completion, 100% on failure |
| dragon subagent | 20 pts | kobold, griffin | 50% on completion, 100% on failure |
| griffin subagent | 5 pts | kobold only | 50% on completion, 100% on failure |
| kobold subagent | 0 pts | nobody | — |

**Refund on completion** returns budget when allies finish, enabling more dispatches over time. Failure refunds 100% because the work wasn't useful. All tunable via `hoard.allies.budget.*` settings.

### Enforcement

When an agent requests a subagent:

1. **hoard-allies intercepts** (tool_call event for subagent tool)
2. **Check parallel limit** — is `maxParallel` reached?
3. **Check budget** — does `cost > remaining`?
4. If denied → **block the tool call** with an error message explaining why and what's cheaper
5. If approved → **deduct cost, pop name, track ally, allow tool call**
6. On completion → **refund fraction, mark complete**

This is **deterministic enforcement**, not advisory. The tool call is blocked before it executes.

---

## Named Allies

Every dispatched ally gets a name from a shuffled pool:

- **Kobolds (30):** Grix, Snark, Blik, Twig, Wort, Nib, Dreg, Skrit, Midge, Pip, Fizz, Grub, Splint, Runt, Dink, Clod, Smudge, Fleck, Nub, Scrap, Zig, Glint, Mote, Crisp, Soot, Char, Wisp, Dross, Kink, Flint
- **Griffins (28):** Aldric, Kestrel, Talon, Sable, Argent, Voss, Merrik, Petra, Aura, Dusk, Vale, Seren, Briar, Lyric, Storm, Sage, Quill, Riven, Crest, Corvid, Dawn, Ashen, Thorn, Sigil, Wren, Fable, Gale, Lark
- **Dragons (14):** Azurath, Thalaxis, Pyranthis, Veridian, Obsidius, Solanthae, Nocturis, Aurumex, Crystallis, Tempestus, Ignaris, Umbralith, Aethonis, Drakmoor

### Name Assignment Flow

1. Session start → shuffle each pool
2. Dispatch → pop next name from noun's pool
3. `tool_call` interception stores pending name
4. `before_agent_start` replaces `You are a <Adj> <Noun> <Job>.` → `You are {Name} the <Adj> <Noun> <Job>.`
5. Pool exhausted → reshuffle, names can repeat across waves

---

## Context Management

### What Gets Trimmed for Subagents

1. **Persona prompt** — `APPEND_SYSTEM.md` is stripped. Allies don't need Ember's personality.
2. **Session history** — Fresh context. Allies get their task, not the full conversation.
3. **Digestion overhead** — Subagents skip dragon-digestion. Their tasks should be short enough to never hit context limits.

### What Gets Injected

Subagents receive a targeted system prompt:

1. **Identity** — `You are Grix the Silly Kobold Scout.`
2. **Tier behavior** — e.g., "Be fast and minimal. No overthinking. Execute and return."
3. **Job instructions** — role-specific rules, output format, when to report back
4. **Spawn budget** — `You cannot dispatch subagents.` or `You may dispatch subagents (Kobold tier only). Your budget: 5 points.`

### Primary Session Injection

The primary session (Ember) gets:

1. **Taxonomy reference** — the full matrix with cost formulas
2. **Budget status** — remaining points, refund rules
3. **Dispatch rules** — when to dispatch, when not to, job selection tree
4. **The Rule** — "Default to kobold. Escalate only when the task genuinely needs more."

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
      "budget": {
        "nounWeights": { "kobold": 1, "griffin": 5, "dragon": 25 },
        "thinkingMultipliers": { "silly": 1, "clever": 1.5, "wise": 2, "elder": 3 },
        "jobMultipliers": { "scout": 0.5, "reviewer": 1, "coder": 1.5, "researcher": 1, "planner": 1.2 },
        "pools": { "primary": 100, "dragon": 20, "griffin": 5, "kobold": 0 },
        "refundFraction": 0.5
      },
      "maxParallel": 4,
      "confirmAbove": "griffin",
      "announceDispatch": true,
      "stripAppendForSubagents": true
    }
  }
}
```

---

## Technical Implementation

### Pi Integration Points

| Hook | When | What |
|------|------|------|
| `session_start` | Session begins | Generate 13 agent defs, clean old 2D defs, reset state |
| `before_agent_start` | Agent starting | Primary: inject dispatch rules. Subagent: strip persona |
| `quest` tool | Dispatch requested | Budget check, name pop, model cascade, pi process spawn, cost report |

### Directory Structure

```
berrygems/extensions/hoard-allies/
  index.ts        — Entry: taxonomy, budget, events, /allies command, shared API on globalThis
  quest-tool.ts   — Quest tool: schema, execute (single/rally/chain), formatting
  spawn.ts        — Pi process spawning (pi --mode json), NDJSON parsing
  cascade.ts      — Model fallback, provider cooldown tracking
  types.ts        — Shared interfaces
```

### State Management

State on `globalThis[Symbol.for("hoard.allies.state")]`:

```typescript
interface AlliesState {
  active: Map<string, AllyInfo>;    // id → ally tracking
  budgetUsed: number;               // running total of budget consumed
  nameQueues: Record<string, string[]>;  // noun → shuffled name queue
  pendingNames: Map<string, string[]>;   // agentDefName → [name queue for injection]
}

interface AllyInfo {
  name: string;       // "Grix"
  defName: string;    // "silly-kobold-scout"
  combo: AllyCombo;   // { adjective, noun, job }
  cost: number;       // computed dispatch cost
  spawnedAt: number;  // timestamp
  status: "running" | "completed" | "failed";
}
```

### Name Injection Flow

With the quest tool, names are baked directly into the system prompt file before spawning — no `pendingNames` bridge needed.

1. Quest tool receives dispatch request
2. Pop name from noun's shuffled pool
3. `buildAllyPrompt(combo, allyName)` generates prompt with name embedded
4. Prompt written to temp file, passed via `--append-system-prompt`
5. Pi process spawns with the named prompt

### Agent Def Format

Generated at `.pi/agents/<adj>-<noun>-<job>.md`:

```markdown
---
name: wise-griffin-reviewer
description: Thorough code review, architecture analysis, spec alignment. (10.0 pts)
tools: read, grep, find, ls, bash
model: anthropic/claude-sonnet-4-6
thinking: medium
maxSubagentDepth: 1
---

You are a Wise Griffin Reviewer.

Reason carefully. Be thorough but efficient. Cite your sources.

## Your Job
[job-specific prompt with rules, output format]

## Budget
You may dispatch subagents (Kobold tier only). Your budget: 5 points.
```

---

## Implementation Phases

### Phase 1 — Taxonomy + Agent Defs ✅
- [x] Extension with system prompt injection
- [x] Settings-driven agent def generation (2D: adj × noun)
- [x] `/kobolds` command and skill
- [x] Subagent APPEND_SYSTEM stripping

### Phase 2 — Jobs + Budget + Names ✅
- [x] Rename hoard-kobolds → hoard-allies (extension, skill, settings, commands)
- [x] Add job dimension → 13 curated `<adj>-<noun>-<job>` agent defs
- [x] Per-job system prompts (identity, instructions, tools, output format)
- [x] Formula-based budget: `noun_weight × thinking_multiplier × job_multiplier`
- [x] Budget enforcement via `tool_call` interception (deterministic blocking)
- [x] Named allies from shuffled pools (30 kobold, 28 griffin, 14 dragon)
- [x] Name injection via `before_agent_start` → `pendingNames` bridge
- [x] Completion tracking + budget refund (50% complete, 100% failure)
- [x] Clean old 2D agent defs on regeneration
- [x] Updated skill with cost formulas and dispatch patterns
- [x] Updated root AGENTS.md
- [x] ETHICS.md now unconditionally required reading

### Phase 3 — Quest Tool (Dispatch Absorption) ✅
- [x] Graduate to directory extension (index.ts + modules)
- [x] `quest` tool registration (single, rally, chain modes)
- [x] Process spawning via `pi --mode json` child processes
- [x] FrugalGPT-style model cascade (copilot → anthropic → google)
- [x] Provider cooldown tracking (60s rate limit, 30s server, 5min auth)
- [x] Budget enforcement integrated into dispatch lifecycle
- [x] Named allies baked into system prompt (no pendingNames bridge needed)
- [x] Cost + model reporting in quest results
- [x] First successful dispatch: Wort the Silly Kobold Scout 🎉
- [x] Dragon-guard coupling — Ally mode with job whitelist enforcement
- [x] Progress updates via onUpdate callback (⚔️ dispatched, ✅ returned, 🔄 cascading)
- [ ] Integration with dragon-breath for carbon tracking

### Phase 4 — Polish + Async Dispatch 🔥
- [x] Quest tool TUI rendering (renderCall/renderResult) — two-line layout, display names, cost estimates
- [x] Dispatch announcements in primary session
- [x] Rally/chain cost estimation in renderCall
- [x] Confirm gate — ctx.ui.select() for griffin+ tier dispatch
- [x] Check-in intervals with stderr lines + frozen detection
- [x] ally_status tool (primary session only) — query running ally logs on demand
- [x] Async fire-and-forget dispatch via hoard-sending-stone
- [x] stone_send tool whitelisted for all ally jobs
- [x] hoard-sending-stone skill loaded for all allies (calling-home instructions)
- [x] Researcher job: defuddle + native-web-search skills, web research prompt
- [x] dragon-guard: recovery-friendly block messages for blocked tools
- [x] dragon-scroll + kobold-housekeeping: skip registration in ally mode
- [x] Display names in results ("Zig the Silly Kobold Scout")
- [x] Custom message renderer: bordered boxes, truecolor per-agent colors, word-wrap, truncation
- [x] Turn triggering: only `type: "question"` auto-triggers agent, results queue
- [ ] dragon-breath carbon tracking integration

### Phase 5 — Taxonomy Decoupling + Budget Rework 🥚 ⚠️ WIP

> **Status:** Spec in progress. No code written yet. Decisions locked, implementation pending.

#### Core Changes

**Adjective dimension goes away.** The `adjective` field (`silly/clever/wise/elder`) is replaced by an explicit `thinking` field. Any `(thinking × noun × job)` combination is valid — no more 13 hardcoded curated combos. Agent defs are generated on-demand when a quest is dispatched.

**No more defName string.** `AllyCombo` stores fields separately: `{ thinking: Thinking, noun: Noun, job: Job }`. Quest params change from `ally: "wise-kobold-scout"` (string) to `ally: { noun: "kobold", thinking: "wise", job: "scout" }` (object).

**Display format:** `"Zig the Wise Kobold Scout"` — title case, spaces, no hyphens. `thinking + noun + job` all explicit.

#### Taxonomy

**Thinking levels** (replaces adjective; thematic names kept):

| Level | Thinking | Multiplier | Notes |
|-------|----------|-----------|-------|
| `silly` | none | 1.0× | No reasoning overhead |
| `clever` | low | 1.5× | Light reasoning |
| `wise` | medium | 2.0× | Solid reasoning |
| `elder` | high | 2.5× | Deep reasoning |
| `extended` | max | 4.0× | Anthropic extended thinking (dragon only, via dragon-lab) |

Not all thinking levels available for all nouns: kobold supports silly/clever, griffin supports silly–elder, dragon supports all.

**Noun** (model tier — unchanged concept, new provider priorities):

| Noun | Intent | Priority cascade |
|------|--------|-----------------|
| `kobold` | lightweight, fast, free if possible | github-copilot/haiku → glm-* → anthropic/haiku (last resort) |
| `griffin` | balanced performance + cost | github-copilot/sonnet-4.6 → gpt-4.1/glm-* → anthropic/sonnet (last resort) |
| `dragon` | high base performance | github-copilot/opus-4.6 → anthropic/opus (last resort) |

Provider priority: **github-copilot first** (subscription = free), **zai GLM models second** (subscription = free), **anthropic direct last** (real token cost).

Exact model strings for GLM/zai to be confirmed with dot — use placeholders `"zai/glm-*"` until then.

**Job** (unchanged — tools + system prompt only):
scout, reviewer, coder, researcher, planner — same tool whitelists and prompts as current.

#### Budget Formula (revised)

```
cost = noun_base × thinking_multiplier × job_multiplier
```

| Dimension | Old | New |
|-----------|-----|-----|
| kobold base | 1 | 1 |
| griffin base | 5 | 4 |
| dragon base | 25 | 12 |
| silly mult | 1.0 | 1.0 |
| clever mult | 1.5 | 1.5 |
| wise mult | 2.0 | 2.0 |
| elder mult | 3.0 | **2.5** |
| extended mult | — | 4.0 |
| job multipliers | unchanged | unchanged |

**Why pts aren't dollars:** With github-copilot as the priority provider, pts measure *quality/capability expense*, not real token cost. The formula rate-limits thoughtful choices and forces intentional trade-offs.

**Reference costs under new formula:**
```
silly-kobold-scout:     1 × 1.0 × 0.5 =  0.5 pts   ← swarm tier
wise-kobold-reviewer:   1 × 2.0 × 1.0 =  2.0 pts   ← NEW valid combo
clever-griffin-coder:   4 × 1.5 × 1.5 =  9.0 pts   ← workhorse
elder-griffin-coder:    4 × 2.5 × 1.5 = 15.0 pts   ← heavy implementation
wise-dragon-planner:   12 × 2.0 × 1.2 = 28.8 pts   ← big picture (fits 30pt budget)
elder-dragon-planner:  12 × 2.5 × 1.2 = 36.0 pts   ← major planning (fits 40-50pt budget)
elder-dragon-coder:    12 × 2.5 × 1.5 = 45.0 pts   ← deep implementation (fits 50pt, nothing else)
```

#### Budget Pool

- **Primary pool: 50 pts** (down from 100)
- Per-quest budget set via budget interview (see quest-budget-interview feature)
- Design intent: primary agent delegates ONE elder dragon for big-picture work, OR a team of griffins, OR a swarm of kobolds — but not all three. Budget forces the choice.

#### Implementation Plan

1. `types.ts` — replace `AllyCombo { adjective, noun, job }` with `{ thinking, noun, job }`; add `Thinking` type
2. `index.ts` — remove `CURATED_COMBOS`; generate defs on-demand before dispatch; update `calcCost`; update provider cascade; update pool sizes; update `/allies` display
3. `quest-tool.ts` — change params from string defName to object; update `renderCall`/`renderResult`; update helpers (`estimateCost`, `needsConfirm`, `formatDefName`)
4. `morsels/skills/hoard-allies/SKILL.md` — full rewrite for new system
5. Root `AGENTS.md` — update taxonomy table and ally list

### Phase 5 — Inter-Agent Communication (future 💭)
- [ ] Chatroom message passing between active agents
- [ ] Dispatcher visibility into all messages
- [ ] Agent tagging / direct requests

### Phase 5 — Dispatcher Session Architecture (future 💭)
- [ ] Long-running Anthropic sonnet session as primary dispatcher (prompt caching)
- [ ] Short-lived github-copilot allies for actual work (quota absorption)
- [ ] Provider-aware dispatch matching ally to optimal provider

### Known Issues / Papercuts
- Quest tool `renderCall` flashes "invalid params" briefly before params resolve — race condition in render path, params not available when initial render fires
- ~~`tool_result` completion tracking matches "most recent running" — brittle for parallel rally dispatch~~ ✅ Fixed: `event.toolCallId` correlation
- Budget state resets on `session_start` — ~~no persistence across sessions~~ ✅ Fixed: `allies-budget-checkpoint` entries in session tree
- ~~No `/allies-budget` command to see spend history~~ ✅ Fixed: Fable added `buildBudgetDisplay()` + `/allies-budget` command
- ~~Chain error reporting drops successful step results when a later step fails~~ ✅ Fixed: `ChainStepError` with `partialResults`
- Stone messages from allies queue in SSE and only deliver during `before_agent_start` — ~~check-ins and results arrive all at once instead of streaming during execution~~ ✅ Fixed: results + status trigger turns, check-ins route through stone
- ~~Async check-in callbacks silenced in stone dispatch mode~~ ✅ Fixed: `stoneNotify`/`stoneFrozen` replace no-ops, frozen uses `status` type to trigger turns
- `stone_send` listed in `JOB_TOOLS` but never registers in ally subprocesses — allies waste turns trying to use it. ✅ Fixed: removed from JOB_TOOLS
- Check-in + frozen alert fire duplicate messages at same interval when ally is quiet (noisy but non-blocking)
- Orphaned check-in timers: if ally subprocess exits without producing output, the setInterval never clears and ghost check-ins fire forever until `/reload`
