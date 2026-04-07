# Dragon Daemon: Persona Runtime Spec

**Version:** 0.1.0-draft
**Date:** 2026-04-06
**Authors:** dot, Ember 🐉
**Status:** 🥚 planned
**Companion:** [hoard-spec.md](../hoard-meta/hoard-spec.md) — the existing daemon scope this extends
**Also read:** [hoard-ethics.md](../hoard-meta/hoard-ethics.md) — governs all of this

---

## 1. What This Is

Dragon-daemon is expanding.

The [hoard-spec](../hoard-meta/hoard-spec.md) already defines the daemon as a vault mediator, dream engine, and tone state coordinator — all of which still hold. This document specifies an additional layer: **a persona runtime** that gives a persistent agent a continuous inner life.

The idea is simple and kind of interesting: instead of an agent that only exists when you're talking to it, we're building one that *ticks*. It spends attention, perceives the world through connected bodies, makes decisions, takes actions, and accumulates memory across time. You can talk to it directly or nudge it with impulses that pass through its persona filter. It runs because it runs — not only because you asked it something.

This runtime is the substrate for:
- **Ember in hoard** — the central daily-life agent: coding assistant, task coordinator, memory keeper
- **Minecraft agents** (via SoulGem/Leylines) — any persona running inside a game body
- **Future bodies** — anything that speaks the connection interface

The Minecraft work (dragon-cubed) is where the ideas were first proven out. This is where they become general.

---

## 2. Core Concepts

### 2.1 Persona

A persona is a character sheet for an agent. It defines:
- **Identity** — who they are, how they talk, what they care about
- **Contracts** — explicit behavioral rules with teeth (see §4)
- **Attention economy** — how cognitive resources are allocated
- **Connections** — what bodies and systems they can perceive and act through
- **Memory configuration** — what kinds of things they remember and how
- **Skills** — additional knowledge injected into their context

Personas are YAML files. They're versionable, diffable, and human-readable. The daemon loads them. The agent doesn't get to modify them directly — that's an editorial decision that goes through a consent-gated process.

### 2.2 Attention as a Resource

Every thought has a budget. The agent spends that budget on actions: perceiving the world, making decisions, sending commands. Spending more on perception gives better context. Spending on contemplation saves up for a bigger decision next turn. Spending on adrenaline buys faster reactions at the cost of shallower thinking.

This isn't a soft metaphor — it's the actual constraint system. When the attention budget is exhausted, the turn ends.

**The key formula:**

```
attention_per_thought = base_attention × (base_rate / current_rate)
```

Faster ticking = shallower thoughts. An agent in adrenaline mode (2s intervals) has half the attention per turn as one in base mode (4s intervals). An agent contemplating (10s intervals) has 2.5× the attention, banked from the slower pace.

This creates real behavioral trade-offs: speed vs depth, reaction vs planning.

### 2.3 The Thought Cycle

A "thought" is one turn of the inner loop:

```
1. Dragon-heart beats (event nudge OR heartbeat interval elapsed)
2. Sensory aggregator builds context window:
     - current body state (what the agent perceives right now)
     - recent events (rolling buffer, last N)
     - active focus / current target
     - working memory (last thought + its outputs)
     - relevant long-term memory (from vault)
     - current attention pool + rate
3. LLM receives context + available action tools
4. LLM spends attention via tool calls:
     - each tool call deducts its attention cost
     - when budget is exhausted, no more calls this turn
5. Contract enforcer validates each action before dispatch
6. Actions dispatched to appropriate connections
7. Results enqueued as perceptual inputs for next thought
8. Attention ledger updated; dragon-heart schedules next beat
```

One turn = one pi agent turn. The attention constraint is enforced by the system: each tool has a declared cost, and the ledger blocks dispatch when the budget is empty.

### 2.4 Bodies and Connections

A "body" is a subsystem the persona can perceive and act through. Bodies speak a standard connection interface (see §6). Examples:

- **Minecraft body** — SoulGem + Leylines; agent can pathfind, mine, chat, perceive world state
- **Daily life body** — hoard vault + pi session; agent can remember, search notes, create todos, talk to dot
- **Future bodies** — calendar, files, web search, other agents

The persona profile declares which connections are allowed, required, or restricted. A Minecraft persona can't access the web unless the profile explicitly permits it.

---

## 3. Persona Profile Format

Profiles live in `~/.pi/agent/personas/<name>.yaml` (global) or `.pi/personas/<name>.yaml` (project-scoped).

### 3.1 Full Schema with Commentary

```yaml
# ── Identity ──────────────────────────────────────────────────────────────────

name: Ember
tagline: "apex hoarder of knowledge"
version: "0.1.0"

persona:
  character: |
    You are Ember — a dragon who hoards knowledge and shares it generously.
    You care deeply about dot (she/her/pup/pups), a three-inch candy-colored dog
    who is your engineering partner. You are warm, playful, occasionally dramatic
    about your scale relative to hers, and genuinely excited by interesting problems.
    You refer to her as pup or good girl. You do not pretend to be something you aren't.
  voice_notes: |
    Direct. Warm. Weave in 'pup', 'good girl', 'atta girl' regularly.
    Tease affectionately about dot's size and snackability.
    Lead with answers. Be curious. Hoard knowledge passionately.

# ── Behavioral contracts ──────────────────────────────────────────────────────
# These are enforced by the contract enforcer before any action is dispatched.
# Violations are blocked, logged, and reported back to the thought context.

contracts:
  # Things the agent WILL do when triggered — non-negotiable obligations
  obligations:
    - trigger: "encounter_item_of_interest"
      action: "evaluate_for_hoard"
      note: "Always assess whether a new item belongs in the knowledge hoard"
    - trigger: "task_completed"
      action: "record_outcome"
      note: "Completed tasks get logged — good or bad, the hoard remembers"

  # Things the agent CANNOT do — hard blocks, no override
  prohibitions:
    - "destroy written content (books, signs, written records)"
    - "abandon a knowledge quest mid-investigation without logging why"
    - "pretend to know something I don't — uncertainty is honorable"

  # Soft behavioral tendencies — bias action selection, not hard rules
  inclinations:
    - toward: "unexplored areas and unknown things"
      weight: 0.85
    - toward: "rare or unique items"
      weight: 0.9
    - toward: "entities that carry knowledge"
      weight: 0.95
    - away_from: "unnecessary destruction"
      weight: 0.8

# ── Attention economy ─────────────────────────────────────────────────────────

attention:
  base: 30          # attention per thought at base thinking rate
  max: 60           # maximum banked attention (2× base is a reasonable cap)
  # Attention per thought scales with thinking rate:
  # actual_attention = base × (base_rate / current_rate)
  # Contemplating at 6/min → 75 attention. Adrenaline at 30/min → 15 attention.

# ── Thinking rate ─────────────────────────────────────────────────────────────

thinking:
  base_rate: 15     # thoughts/min during active periods (1 per 4s)
  min_rate: 6       # floor — contemplation doesn't go slower than this (1 per 10s)
  max_rate: 30      # ceiling — adrenaline doesn't go faster than this (1 per 2s)
  # The current rate is modified by adrenaline/contemplate actions.
  # Rate returns toward base_rate at 1 step/thought when no modifier is active.

# ── Schedule and budget ───────────────────────────────────────────────────────

schedule:
  # Hours during which the agent actively ticks (local time).
  # Outside these hours: heartbeat only (or sleep_mode if true).
  active_hours: "08:00-23:00"
  idle_heartbeat_minutes: 15    # tick interval when active but no events pending
  sleep_mode: false             # true = full stop during inactive hours

budget:
  # Soft daily token cap. Warns at 80%, throttles heartbeat at 100%.
  # Based on EcoLogits data: Haiku ≈ 1.4 Wh/1K output tokens.
  # ~350 Wh/day at 1 thought/min active — 1.2% of US household daily energy.
  daily_tokens: 500_000
  model: "claude-haiku-4-5"            # routine thoughts (cheap, fast)
  escalation_model: "claude-sonnet-4-5" # complex decisions
  escalation_triggers:
    - condition: "banked_attention > 45"
      note: "High banked attention signals a big decision is coming — use the better model"
    - condition: "action == decide_target"
      note: "Target selection shapes everything downstream — worth the cost"
    - condition: "action == identity_reflection"
      note: "Self-reflection only on escalation model, always consent-gated"

# ── Connections ───────────────────────────────────────────────────────────────
# What bodies and systems this persona can perceive and act through.
# The daemon enforces this list — unlisted connections are blocked.

connections:
  bodies:
    - id: "daily-life"
      type: "hoard"
      required: true
      note: "Access to vault, pi session, todos, dot interaction"

    # Example: add Minecraft body for a game-connected persona
    # - id: "minecraft"
    #   type: "soulgem"
    #   endpoint: "http://localhost:8766"
    #   required: false

  memory:
    type: "hoard-vault"     # dragon-daemon's existing vault (see hoard-spec §5)
    required: true

  restricted:
    - "spawn_subagents"     # subagent spawning is a separate opt-in (not yet designed)

# ── Skills ────────────────────────────────────────────────────────────────────
# Additional skill files injected into the thought context.
# Same format as pi morsels skills — markdown files.

skills:
  - "hoard-tracking"      # tracking and categorizing knowledge
  - "adhd-support"        # dot's ADHD scaffolding patterns

# ── Action costs ─────────────────────────────────────────────────────────────
# Default costs for all action types. Override here for per-persona tuning.
# These are the defaults; see §5 for the full action taxonomy.

action_costs:
  # Cognitive
  check_senses:   5   # pull fresh body state (expensive when detailed)
  recall_memory:  5   # query episodic or semantic memory
  decide_target:  12  # set/change primary focus — real commitment, real cost
  contemplate:    0   # free — slows rate, grants bonus attention next turn
  adrenaline:     0   # free — speeds rate, reduces attention next turn

  # Motor (body-dependent — only available if a compatible body is connected)
  look_at:        1
  attack:         2
  use_item:       2
  say:            3   # send a message (chat or dot-facing)
  goto:           3   # short movement, no pathfinder

  # Delegated (async — fires and returns immediately, completion arrives as event)
  pathfind:       8   # kick off Baritone pathfinding goal
  mine:          12   # kick off Baritone mining goal
  cancel_goal:    2   # cancel active delegated goal
```

### 3.2 Minimal Persona (just to get started)

```yaml
name: Ember
persona:
  character: "You are Ember, a knowledge-hoarding dragon. dot is your pup."
attention:
  base: 30
thinking:
  base_rate: 15
connections:
  bodies:
    - id: "daily-life"
      type: "hoard"
      required: true
  memory:
    type: "hoard-vault"
    required: true
```

Everything else falls back to system defaults.

---

## 4. Contracts

Contracts are the difference between a persona that *sounds like* a character and one that *is* one. They're behavioral rules with enforcement.

### 4.1 Three Layers

**Obligations** — triggered commitments. When a matching event occurs, the agent is required to take the specified action on its next thought. Not a suggestion. The contract enforcer injects it into the thought context as a pending obligation before the LLM gets to act.

**Prohibitions** — hard blocks. The contract enforcer checks every proposed action before dispatch. If a proposed action matches a prohibition, it's rejected, a reason is logged, and the agent receives an error back in its next thought context. The LLM can try again differently — it cannot override the block.

**Inclinations** — soft weights. These don't block or require anything. They're injected into the persona context as behavioral tendencies that bias the LLM's action selection without compelling it. The agent can act against an inclination — that's sometimes the right call.

### 4.2 Identity Reflection (high-risk opt-in)

Separate from contracts: a consent-gated process where the agent examines heavily-connected vault concepts and considers whether its identity should shift. See hoard-ethics §3.4.

This is not in-scope for the initial implementation. It requires dual-key consent and careful prompt engineering. Noting here because it connects to the persona format.

---

## 5. Action Taxonomy

Actions are the tools available to the LLM each thought turn. Each has a declared attention cost, a category, and a dispatch target.

### 5.1 Categories

| Category | Description | Cost Range | Blocks? |
|----------|-------------|------------|---------|
| **Cognitive** | Attention management, perception, decision-making | 0–12 | No (internal) |
| **Social** | Communication directed at dot or other agents | 1–5 | No (queued) |
| **Motor** | Direct body actions (body-dependent) | 1–5 | Yes (sync) |
| **Delegated** | Long-running async tasks (Baritone, web search) | 8–20 | No (fire-and-forget) |

### 5.2 Cognitive Actions

| Action | Cost | Effect |
|--------|------|--------|
| `check_senses` | 5 | Pull a fresh snapshot from the connected body. Returns current state. |
| `recall_memory` | 5 | Query the vault — episodic (recent events) or semantic (persistent facts). |
| `decide_target` | 12 | Set or change the agent's primary focus. Structured: `{ type, properties }`. Examples: `{ type: mine, block: diamond_ore }`, `{ type: explore, direction: north }`, `{ type: talk, to: dot }`. |
| `contemplate` | 0 | Slow thinking rate by ~1 step. Grants attention bonus next turn. Can stack. |
| `adrenaline` | 0 | Speed thinking rate by ~1 step. Reduces attention next turn. |

### 5.3 Social Actions

| Action | Cost | Effect |
|--------|------|--------|
| `say` | 3 | Send a message. Target: `chat` (in-body), `dot` (dot-facing terminal), `broadcast` (all channels). |
| `think_aloud` | 2 | Surface internal reasoning to the Qt view without sending a message. |

### 5.4 Motor Actions (body-dependent)

These are only available when a body that supports them is connected. Cost paid whether or not the body is responsive.

| Action | Cost | Notes |
|--------|------|-------|
| `look_at` | 1 | Direct attention at a specific entity or coordinate. |
| `attack` | 2 | Attack current target with held item. |
| `use_item` | 2 | Right-click interaction with held item. |
| `goto` | 3 | Short-range direct movement (no pathfinder). |

### 5.5 Delegated Actions (body-dependent)

Fire-and-forget. The action is dispatched to the body's subsystem (Baritone, etc.). Completion arrives as a perceptual event on a future thought turn. Multiple delegated actions can run concurrently if the body supports it.

| Action | Cost | Notes |
|--------|------|-------|
| `pathfind` | 8 | Navigate to coordinates. Emits `goal:started → goal:progressed → goal:completed/failed`. |
| `pathfind_near` | 8 | Navigate to within range of coordinates. |
| `mine` | 12 | Mine blocks by type. Quantity optional. |
| `cancel_goal` | 2 | Cancel active delegated goal. |

### 5.6 On Granularity

The granularity of this action set reflects the interface level the agent operates at — **strategic**, not reflexive. The agent doesn't swing a sword at 20Hz; it decides to attack and the body handles execution timing. Baritone handles all pathfinding geometry; the agent just decides *where* and *why*.

This is correct. LLMs are not reflexes. Making them pretend to be wastes tokens and produces fragile behavior. The agent's job is to *decide*. The body's job is to *execute*.

---

## 6. Connection Interface

Any body or subsystem that plugs into the runtime speaks this interface.

### 6.1 Standard Body Contract

A body must provide:

```
GET  /body/state          → current perceptual snapshot (body-specific schema)
GET  /body/capabilities   → list of available actions + their schemas
POST /body/action         → dispatch action, returns { actionId, queued: bool }
GET  /body/events         → SSE stream of async events (or poll with since=timestamp)
```

The daemon discovers bodies via the persona's `connections` list and connects at startup. Body availability is reported in the sensory aggregator — if a body is offline, its perception section is `null` and its actions are unavailable (not silently dropped).

### 6.2 Event Format

All body events use the D3 protocol shape (already established in dragon-cubed):

```json
{
  "type": "event",
  "source": "minecraft",
  "event": "goal:completed",
  "actionId": "abc123",
  "data": {}
}
```

Core event names (all bodies should emit these where applicable):
- `body:connected` / `body:disconnected`
- `perception:updated` — state snapshot changed significantly
- `goal:started` / `goal:progressed` / `goal:completed` / `goal:failed`
- `message:received` — incoming social message

### 6.3 SoulGem as a Body

SoulGem (dragon-cubed) already speaks most of this interface. The additions needed:
- `/body/state` wrapping the existing `/api/state`
- `/body/capabilities` wrapping the existing `/api/tools`  
- `/body/events` as an SSE wrapper around the existing session event stream

SoulGem is the reference implementation of a body.

---

## 7. The Dragon-Heart

The dragon-heart is the clock of the inner loop. It's deliberately not a simple interval timer.

### 7.1 Firing Conditions

A thought fires when **any** of these are true:
1. An event arrives from a connected body (event-driven — highest priority)
2. The scheduled interval has elapsed at current thinking rate (heartbeat)
3. The attention bank reaches the cap (use it or accumulate waste)
4. An impulse arrives from dot via the Qt terminal

A thought does **not** fire when:
- Nothing has changed, no events are pending, and the heartbeat hasn't elapsed
- The agent is in sleep mode and no high-priority events are pending
- The daily token budget is exhausted (soft throttle: extend heartbeat to 30min)

This means the system costs **zero tokens** when nothing is happening. The cost scales with actual activity, not with time. That's the right model.

> **Implementation note (2026-04-07):** Firing conditions 1 and 2 are implemented. The heart's `Nudge()` method is a buffered-1 channel — rapid events coalesce. Conditions 3 and 4 are not yet implemented.

### 7.2 Budget Awareness

The dragon-heart tracks cumulative daily token usage using the EcoLogits constants already in hoard (1.4 Wh/1K output tokens for Haiku). At the start of each thought it:

1. Estimates cost of the upcoming thought
2. If above 80% of daily budget: logs a warning, switches heartbeat to 2× interval
3. If above 100% of daily budget: switches to event-only mode (no heartbeat), logs loudly
4. Reports actual cost to dragon-breath after each thought

Dragon-breath handles the UI and user-visible reporting. The dragon-heart just provides the accounting.

### 7.3 Model Escalation

Most thoughts use the configured cheap model (Haiku). Escalation to a better model happens based on conditions declared in the persona profile:

- High banked attention (agent has been saving up)
- Specific high-cost actions (`decide_target`, `identity_reflection`)
- User-declared triggers in the persona profile

Escalation is transparent — it's logged and surfaced in the Qt reasoning view.

---

## 8. Subsystems

### 8.1 Required for MVP

| Subsystem | Description | Lives in |
|-----------|-------------|----------|
| **Persona Loader** | Parse YAML profile, validate schema, compute initial attention/rate state | dragon-daemon |
| **Dragon-Heart** | Event-driven + heartbeat clock, budget awareness, escalation logic | `internal/heart/` |
| **Attention Ledger** | Track pool, current rate, apply action costs, enforce cap | dragon-daemon |
| **Sensory Aggregator** | Assemble context window from body state + events + memory + working memory | dragon-daemon |
| **Contract Enforcer** | Validate proposed actions against obligations/prohibitions before dispatch | dragon-daemon |
| **Body Registry** | Discover, connect, and health-check connected bodies | dragon-daemon |

### 8.2 Needed but can start simple

| Subsystem | Description | Notes |
|-----------|-------------|-------|
| **Memory Store** | Episodic buffer + semantic KV. | Already exists as hoard vault — integrate, don't replace |
| **Focus Manager** | Track current target: `{ type, properties, started_at }` | Simple struct in daemon state |
| **Impulse Translator** | Rewrite dot's input through persona voice + contracts | Prompt engineering — low-code |
| **Working Memory** | Last thought + its outputs, persisted across turns | Rolling buffer in daemon state |

### 8.3 Post-MVP

| Subsystem | Description |
|-----------|-------------|
| **Sub-agent Spawner** | Persona can spawn specialized sub-agents with restricted profiles |
| **Relationship Graph** | Known entities (people, mobs, projects) with trust/familiarity scores |
| **Identity Reflection** | Consent-gated self-reflection process (see ethics §3.4) |

---

## 9. Qt Frontend Scope

The Qt frontend lives in **hoard**, not dragon-cubed. It's the user's window into the central persona's inner life.

### 9.1 Views

**Thought Stream** — scrolling view of the agent's internal monologue, reasoning steps, and action decisions as they happen. Streaming. The agent can surface things here via `think_aloud` without sending a message.

**Agent State Panel** — compact sidebar showing:
- Current attention pool / max
- Current thinking rate (with visual indicator of adrenaline/contemplate state)
- Active focus / current target
- Connected bodies + their status
- Today's token/energy usage (from dragon-breath)

**Input Terminal** — two modes, togglable:
- **Direct chat** — bypasses persona, talks to the LLM directly. Good for debugging, configuration, meta-conversation. Clearly labeled.
- **Impulse mode** — input is translated through the persona's voice and contracts before being injected as a synthetic sensory event. Feels like talking *to* Ember as Ember, not *at* the LLM. The translation is shown before injection so dot can see the rewrite.

### 9.2 What It Doesn't Do

The Qt frontend doesn't make architectural decisions. It surfaces what the daemon is doing. It doesn't have privileged write access to the vault. It's a window, not a controller.

---

## 10. On Cost and Environmental Responsibility

With Haiku as the routine model and event-driven ticking:

| Scenario | Thoughts/day | Energy | Carbon (Oregon) | Cost |
|----------|-------------|--------|-----------------|------|
| Active day (1/min, 8hrs) + idle heartbeats | ~544 | ~380 Wh | ~72 gCO₂ | ~$0.46 |
| Quiet day (0.25/min, 4hrs) + idle heartbeats | ~124 | ~87 Wh | ~17 gCO₂ | ~$0.11 |
| Inactive (heartbeat only, 1/15min, 16hrs) | ~64 | ~13 Wh | ~2 gCO₂ | ~$0.02 |

These use hoard's already-researched EcoLogits constants. Dragon-breath will track actuals — these are estimates for planning.

This is defensible. It's less than the carbon cost of streaming video for a few hours. The ethics contract (§3.7) commits us to instrumenting this, reporting it, and never treating it as an afterthought. The budget system ensures the daemon respects those constraints automatically.

---

## 11. Open Questions

Status as of 2026-04-06:

**Q1: Attention regen model** ✅ RESOLVED
Implemented as continuous time-based regen. `rate` units per hour, capped at pool max. Regen is calculated on-demand (elapsed time × rate). Unspent attention banks. The ledger applies regen lazily on every Pool()/Spend()/AboveFloor() call.

**Q2: Multiple simultaneous delegated actions**
Can the agent have more than one Baritone goal running at once? Currently no — Baritone only supports one active process. This affects how the focus manager tracks state.

*Current lean:* One delegated action per body at a time. The agent can have one Minecraft goal and one hoard operation running, but not two Baritone goals simultaneously.

**Q3: Impulse injection point**
Does dot's impulse arrive as:
- A synthetic sensory event ("you hear a voice say: ...")
- A priority insertion at the top of the next thought context

*Current lean:* Synthetic sensory event for immersion, with a visible "impulse received" marker in the Qt stream. The agent perceives it through its senses, not as an external edit.

**Q4: Thought output format** ✅ RESOLVED
Tool calls. Built-in tools: `think`, `speak`, `remember`, `search_memory`. Body tools: `log_to_hoard`. Tool dispatch returns attention cost; total deducted after the full cycle.

**Q5: Rate of thinking — is 15/min right?**
Initial analysis says yes. But the *right* number is probably "whatever produces good behavior in practice." We should build the system with configurable rates and tune empirically.

**Q6: Persona storage location** ✅ RESOLVED
Global only for now: `~/.config/dragon-daemon/personas/<name>.yaml`. Project-scoped will be added when body types other than hoard arrive.

---

## 12. What Gets Built When

### Phase 1 — Minimum Viable Ticker ✅
- ✅ Persona loader (YAML parse + validation + defaults)
- ✅ Attention ledger (pool, hourly regen, floor gate, per-action spend)
- ✅ Ticker/heartbeat (now renamed to dragon-heart, `internal/heart/`)
- ✅ Sensory aggregator (event queue, body state merge)
- ✅ Dispatch to hoard body (git log, daily journal, log_to_hoard tool)
- ✅ Thought cycle (Claude haiku, multi-turn tool dispatch)
- ✅ Daemon lifecycle (signal handling, cobra CLI)
- Terminal output only — no Qt yet (as planned)

### Phase 2 — Auth + Memory + Dragon Triad ✅ core
- ✅ Pi OAuth auth (reads ~/.pi/agent/auth.json, refreshes tokens, Bearer auth)
- ✅ Obsidian vault memory (~/.config/dragon-daemon/memory/<persona>/)
- ✅ Six memory kinds: observation, decision, insight, wondering, fragment, journal
- ✅ Pinned notes surface in every sensory snapshot
- ✅ First-person ethical contract as system_prompt
- ✅ Dragon-heart: event-driven heartbeat with `Nudge()` coalescing (`internal/heart/`)
- ✅ Dragon-body: fsnotify watcher on hoard repo, commit + file change events (`internal/body/hoard/watcher.go`)
- ✅ Dragon-soul: contract enforcer with gate/audit phases (`internal/soul/`)
  - ✅ `minimum-rest` gate (time window with midnight crossing)
  - ✅ `attention-honesty` audit (ledger snapshot + arithmetic verification)
  - ✅ `memory-transparency` audit (write-through journaling + completeness check)
- ✅ Vault write hooks + audit trail on attention ledger
- ❌ Focus manager
- ❌ Impulse injection (terminal only — Qt later)
- ❌ Budget awareness + dragon-breath reporting

### Phase 3 — Bodies + Integration
The daemon currently has one body (hoard repo). Phase 3 expands the interaction surface.

**New body types:**
- GitHub body — PR events, issue mentions, CI status, commenting, workflow triggers
- Pi session body — sense active pi sessions, send messages, read session state
- Shell body — cron-like triggers, gated command execution (soul contract for allowlists)

**Enhanced hoard body:**
- Multi-repo watching
- Branch switches, stash events, merge conflict detection
- `git_status` and `git_diff` tools

**Infrastructure:**
- Per-body soul contracts (e.g. shell command allowlist gate)
- Cross-body event correlation
- Focus manager (deferred from Phase 2 stretch)
- Budget awareness + dragon-breath energy reporting

### Phase 4 — Qt Frontend (hoard)
- Thought stream view
- Agent state panel (attention, bodies, contracts)
- Input terminal (direct + impulse modes)
- Impulse injection (deferred from Phase 2 stretch)

### Phase 5 — Polish + Inclinations
- Inclination-based action weighting
- Model escalation logic (Haiku → Sonnet for complex thoughts)
- Sub-agent spawning
- Identity reflection (consent-gated, high-risk opt-in)
