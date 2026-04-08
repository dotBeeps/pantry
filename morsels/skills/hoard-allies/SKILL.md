---
name: hoard-allies
description: Dispatch subagents using the hoard kobold/griffin/dragon taxonomy. Use when planning subagent tasks, delegating work, or deciding which model tier to use for parallel/chained execution.
---

# Hoard Allies — Subagent Dispatch Strategy

## The Taxonomy

A 3D matrix: **adjective** (thinking) × **noun** (model) × **job** (role).

| Adjective | Thinking | Noun | Model | Job | Role |
|-----------|----------|------|-------|-----|------|
| silly | none | kobold | haiku | scout | File scanning, recon |
| clever | low | griffin | sonnet | reviewer | Analysis, validation |
| wise | medium | dragon | opus | coder | Implementation |
| elder | high | | | researcher | Gathering, synthesis |
| | | | | planner | Strategy, specs |

Combined: `<adjective>-<noun>-<job>` → e.g. `wise-griffin-researcher` = sonnet + medium thinking + research role.

> **Phase 5 (planned):** The taxonomy is being decoupled — any `(thinking × noun × job)` combo will be valid, not just the 13 curated ones. Budget formula is being reworked. See `den/features/hoard-allies/AGENTS.md` for details.

## Budget System

Allies are **budget-gated, not count-gated**. Each combo has a cost:

```
cost = noun_weight × thinking_multiplier × job_multiplier
```

| Factor | Values |
|--------|--------|
| Noun | kobold=1, griffin=5, dragon=25 |
| Thinking | silly=1, clever=1.5, wise=2, elder=3 |
| Job | scout=0.5, reviewer=1, coder=1.5, researcher=1, planner=1.2 |

Primary session budget: **100 pts** (configurable).

## Job Tool Whitelists

Each job has a strict tool whitelist enforced by dragon-guard:

| Job | Tools |
|-----|-------|
| scout | read, grep, find, ls, bash, stone_send |
| reviewer | read, grep, find, ls, bash, stone_send |
| coder | read, grep, find, ls, bash, write, edit, stone_send |
| researcher | read, grep, find, ls, bash, stone_send |
| planner | read, grep, find, ls, stone_send |

**All jobs** get the `stone_send` tool for cross-agent communication and the `hoard-sending-stone` skill for guidance on when/how to call home.

**Researchers** additionally get `defuddle` and `native-web-search` skills for web research.

## Async Dispatch (via Sending Stone)

When the hoard-sending-stone extension is running, quest dispatch is **fire-and-forget**:

1. Quest tool spawns allies and returns **immediately** — no session blocking
2. Each ally POSTs its result home via the stone when complete
3. Results appear as bordered boxes in the primary session with per-agent colors
4. Agent receives results on next turn (or immediately if `type: "question"`)

**Turn triggering:**
- `type: "question"` → auto-triggers agent (ally needs help)
- `type: "result"` → queued, agent sees it on next natural turn
- All other types → queued silently

**Fallback:** If stone is unavailable, dispatch falls back to blocking mode (allies complete before tool returns).

## Calling Home

All allies can send messages via the `stone_send` tool:

```
stone_send(to: "primary-agent", message: "short description of issue")
```

**Rules:** Lead with a concise 1-2 liner — what you're doing and what's blocking you. Only send longer explanations in follow-up messages if asked. Exhaust your own tools before calling home.

See the `hoard-sending-stone` skill for full messaging details.

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
{ "rally": [
  { "ally": "silly-kobold-scout", "task": "List all .go files in dragon-daemon/" },
  { "ally": "silly-kobold-scout", "task": "List all .ts files in berrygems/" }
]}
```
**Cost: 1.0 pts** — two scouts, instant return, results via stone.

### Scout → Coder Chain (escalating)
```json
{ "chain": [
  { "ally": "clever-kobold-scout", "task": "Find all files related to {task}" },
  { "ally": "clever-griffin-coder", "task": "Implement changes based on: {previous}" }
]}
```
**Cost: 12.0 pts** — scout cheaply, coder acts on findings.

### Research Rally
```json
{ "rally": [
  { "ally": "wise-griffin-researcher", "task": "Research approach A using web search" },
  { "ally": "wise-griffin-researcher", "task": "Research approach B using web search" }
]}
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
