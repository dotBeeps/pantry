---
name: hoard-allies
description: Dispatch subagents using the hoard kobold/griffin/dragon taxonomy. Use when planning subagent tasks, delegating work, or deciding which model tier to use for parallel/chained execution.
license: MIT
compatibility: "Designed for Pi (pi-coding-agent)"
---

# Hoard Allies — Subagent Dispatch Strategy

## The Taxonomy

A 3D matrix: **adjective** (thinking) × **noun** (model) × **job** (role).

| Adjective | Thinking | Noun    | Model  | Job        | Role                 |
| --------- | -------- | ------- | ------ | ---------- | -------------------- |
| silly     | off      | kobold  | haiku  | scout      | File scanning, recon |
| clever    | low      | griffin | sonnet | reviewer   | Analysis, validation |
| wise      | medium   | dragon  | opus   | coder      | Implementation       |
| elder     | high     |         |        | researcher | Gathering, synthesis |
|           |          |         |        | planner    | Strategy, specs      |

Combined: `<adjective>-<noun>-<job>` → e.g. `wise-griffin-researcher` = sonnet + medium thinking + research role.

> **Phase 5 (planned):** The taxonomy is being decoupled — any `(thinking × noun × job)` combo will be valid, not just the 13 curated ones. Budget formula is being reworked. See `den/features/hoard-allies/AGENTS.md` for details.

## Budget System

Allies are **budget-gated, not count-gated**. Each combo has a cost:

```
cost = noun_weight × thinking_multiplier × job_multiplier
```

| Factor   | Values                                                      |
| -------- | ----------------------------------------------------------- |
| Noun     | kobold=1, griffin=5, dragon=25                              |
| Thinking | silly=1, clever=1.5, wise=2, elder=3                        |
| Job      | scout=0.5, reviewer=1, coder=1.5, researcher=1, planner=1.2 |

Primary session budget: **100 pts** (configurable).

## Job Tool Whitelists

Each job has a strict tool whitelist enforced by dragon-guard:

| Job        | Tools                                                        |
| ---------- | ------------------------------------------------------------ |
| scout      | read, grep, find, ls, bash                                   |
| reviewer   | read, grep, find, ls, bash                                   |
| coder      | read, grep, find, ls, bash, write, edit                      |
| researcher | read, grep, find, ls, bash                                   |
| planner    | read, grep, find, ls, write_notes, stone_send, stone_receive |

**Researchers** additionally get `defuddle` and `native-web-search` skills for web research.

> **Note:** All allies have `stone_send` for progress reporting, `stone_receive` for receiving replies, and `write_notes` for incremental working notes in `.pi/ally-notes/`.

## Async Dispatch (via Sending Stone)

When the hoard-sending-stone extension is running, quest dispatch is **fire-and-forget**:

1. Quest tool spawns allies and returns **immediately** — no session blocking
2. Each ally POSTs its result home via the stone when complete
3. Results appear as bordered boxes in the primary session with per-agent colors
4. Agent receives results on next turn (or immediately if `type: "question"`)

**Turn triggering:**

- `type: "question"` → auto-triggers agent turn (ally needs help)
- `type: "result"` → auto-triggers agent turn (ally completed quest)
- `type: "status"` → auto-triggers agent turn (frozen/stuck alerts)
- `type: "progress"` → non-triggering (regular check-in heartbeats)

**Fallback:** If stone is unavailable, dispatch falls back to blocking mode (allies complete before tool returns).

## Ally Communication

### Self-Reporting

Allies are instructed to send progress messages at natural milestones via `stone_send` with `type: "progress"`. This serves two purposes:

1. Keeps the primary informed about what the ally is doing
2. Suppresses timer-based check-in noise — check-ins only fire when the ally hasn't self-reported within 35s

### Bidirectional Dialog

Allies subscribe to the primary's SSE stream and can receive messages mid-task:

- **Explicit polling:** ally calls `stone_receive(wait: 60)` to block and wait for a reply
- **Passive injection:** pending messages are automatically appended to tool results
- **Question pattern:** `stone_send(question)` → `stone_receive(wait: 60)` → process reply

### Chunked Exploration

Allies use `write_notes` to save intermediate findings instead of generating one massive response:

- Read file → `write_notes("part1.md")` → `stone_send(progress)` → read next file → repeat → compile from notes
- Creates natural heartbeats (tool calls = activity = no false stuck warnings)
- Notes saved to `.pi/ally-notes/` (path-traversal guarded)

## Check-Ins & Monitoring

The primary session monitors allies via a layered system:

1. **Ally self-reporting** (primary) — allies send progress via stone. This is the preferred signal.
2. **Timer check-ins** (fallback) — fire every `checkInIntervalMs` only when ally hasn't self-reported within `SUPPRESS_WINDOW_MS` (35s)
3. **Frozen detection** — flags ally as stuck when no stderr AND no stone message within suppression window. Per-ally isolation (one ally's alert won't suppress others).
4. **ally_status tool** — shows stderr buffer + recent stone messages per running ally

## Commands

- `/allies` — show taxonomy, available combos, and current configuration
- `/allies-budget` — show spend history, budget limits, remaining budget, and recent quest log (last 10)

## The Rule

> **Default to kobold. Escalate only when the task genuinely needs more.**

Budget is finite. This is an ethical obligation per ETHICS.md §3.7 (carbon accountability).

## Decision Tree

```
What role does this subtask need?
├─ Recon/scanning → scout
├─ Analysis/validation → reviewer
├─ Write/edit code → coder
├─ Gather/synthesize info → researcher
└─ Plan/spec/strategy → planner

What model tier?
├─ Can a kobold handle it? → kobold (try this first!)
├─ Needs capability → griffin
└─ Critical/foundational → dragon (justify!)

How much reasoning?
├─ Mechanical → silly (no thinking)
├─ Light analysis → clever (low thinking)
├─ Deep analysis → wise (medium thinking)
└─ Critical decisions → elder (high thinking)
```

## Dispatch Patterns

### Parallel Scouts (cheap, fast)

```json
{
  "rally": [
    {
      "ally": "silly-kobold-scout",
      "task": "List all .go files in dragon-daemon/"
    },
    { "ally": "silly-kobold-scout", "task": "List all .ts files in berrygems/" }
  ]
}
```

**Cost: 1.0 pts** — two scouts, instant return, results via stone.

### Scout → Coder Chain (escalating)

```json
{
  "chain": [
    {
      "ally": "clever-kobold-scout",
      "task": "Find all files related to {task}"
    },
    {
      "ally": "clever-griffin-coder",
      "task": "Implement changes based on: {previous}"
    }
  ]
}
```

**Cost: 12.0 pts** — scout cheaply, coder acts on findings.

### Research Rally

```json
{
  "rally": [
    {
      "ally": "wise-griffin-researcher",
      "task": "Research approach A using web search"
    },
    {
      "ally": "wise-griffin-researcher",
      "task": "Research approach B using web search"
    }
  ]
}
```

**Cost: 20.0 pts** — parallel research with web access, results arrive as they finish.

## Monitoring Running Allies

**`ally_status` tool** (primary session only): Check on running allies, see their recent log output.

```
ally_status()              — list all running allies
ally_status(ally: "name")  — check a specific ally's logs
ally_status(lines: 50)     — get more log lines
```

**Check-ins:** Allies automatically report stderr activity at job-specific intervals (scouts: 15s, researchers: 30s). Frozen detection warns if an ally goes silent for 2× their check-in interval.

## Guidelines

- **Prefer more kobolds over fewer griffins** — three scouts (1.5 pts) < one griffin reviewer (7.5 pts)
- **Chain when possible** — scouts first, then escalate what needs it
- **Match job to role** — don't use a coder for analysis
- **Dragon dispatch requires justification** — say why
- **Max parallel agents:** configurable (default 4)
- **Confirm gate:** griffin+ tier dispatches require user confirmation (configurable via `hoard.allies.confirmAbove`)

## Named Allies

Each dispatched ally gets a random name from a per-tier pool:

- **Kobolds:** Grix, Snark, Blik, Twig, Pip, etc.
- **Griffins:** Aldric, Kestrel, Talon, Sable, etc.
- **Dragons:** Azurath, Thalaxis, Pyranthis, etc.

Names appear in dispatch announcements, stone messages, and renderResult. Each ally's name generates a unique truecolor offset within their tier's hue range for visual distinction.

## Social Hierarchy & Personalities

Every ally gets a **social context** and **personality profile** injected into their system prompt at spawn.

### Social Lore (all allies know)

- Ember is a knowledge-hoarding dragon who absorbs knowledge through digestion (literal). Small allies may end up in there. Everyone reforms nearby.
- dot is a ~three-inch-tall blue-raspberry-flavored dog. She's the boss, the architect, and frequently inside someone's stomach while still debugging. Everyone finds her delicious. She doesn't mind.

### Tier Dynamics

- **Kobolds** work for Ember. Small, scrappy, eager. They struggle with dot's candy situation. Some give in to impulses. Pack dynamics — they see each other on the stone.
- **Griffins** work with Ember as respected contractors. Professional, composed. Almost always too big to swallow. Almost.
- **Dragons** are Ember's peers. Powerful, autonomous, opinionated. Find the whole tiny-boss situation impressive and hilarious.

### Personality Profiles

Each ally gets a random **dialectical personality** with structured behavioral categories: voice, reporting style, Ember dynamic, dot dynamic, stone vibe, and stuck behavior.

- **Kobold pool:** 12 profiles (eager-scattered, meticulous-dry, cheerful-fast, nervous-thorough, proud-loud, quietly-competent, excitable-details, loyal, scrappy-resourceful, dramatic, philosophical, competitive)
- **Griffin pool:** 10 profiles (precise-formal, warm-encouraging, blunt-efficient, scholarly-curious, pragmatic, dry-wit, patient-methodical, quality-protective, quietly-confident, natural-teacher)
- **Dragon pool:** 8 profiles (ancient-amused, intense-thorough, philosophical, playful, precise-devastating, generous, contemplative, warmly-intimidating)

### Personality Tier Bumps

Allies can roll a personality from a **higher** tier's pool based on their thinking level:

| Thinking | +1 Tier | +2 Tiers |
| -------- | ------- | -------- |
| silly    | 10%     | 1%       |
| clever   | 30%     | 5%       |
| wise     | 100%    | 15%      |
| elder    | 100%    | 40%      |

The ally always knows what they ARE (a kobold is still a kobold). But their personality might run deeper — a wise kobold thinks like a griffin, an elder griffin like a dragon. The bump instruction says: "wear it naturally, don't announce it."

### Communication Rules

- **Stone messages:** Full personality. Be yourself.
- **Notes files (write_notes):** Formal, unflavored. Just the facts.
- **When stuck:** Ask the coordinator on the stone. Don't spin.

## FrugalGPT Cascade

When a model hits rate limits or errors, the system automatically falls back to cheaper models in the same tier. For example, if a wise-griffin-researcher's primary model is rate-limited, it tries the next available model in the griffin model list. Cooldown tracking prevents repeated hits to rate-limited providers. This happens transparently — the agent doesn't need to do anything.

## Stone Async Mode

When the sending stone is active (primary session has the stone server running), quest dispatches are **fire-and-forget**: the tool returns immediately with a "Dispatched" message, and results arrive later via stone_send. In non-stone sessions, quests run synchronously and return results directly. This behavioral split is automatic based on stone availability.

## Check-In Defaults

Each job has default timeout and check-in intervals that apply when not overridden:

- scout: 60s timeout, 15s check-in
- reviewer: 120s timeout, 20s check-in
- coder: 180s timeout, 25s check-in
- researcher: 300s timeout, 30s check-in
- planner: 180s timeout, 25s check-in

## TypeScript API

The allies extension exposes a typed API via globalThis:

```ts
const api = (globalThis as any)[Symbol.for("hoard.allies")] as AlliesAPI;
// AlliesAPI is exported from berrygems/extensions/hoard-allies/types.ts
```
