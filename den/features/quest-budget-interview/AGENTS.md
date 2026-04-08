# quest-budget-interview — Feature Spec

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Status:** 💭 idea → 🥚 planned (spec in progress) ⚠️ WIP
> **Depends on:** hoard-allies Phase 5 (taxonomy decoupling) — budget formula and open combos required first
> **Lives in:** `berrygems/extensions/hoard-allies/` (part of the quest tool)

---

## Tool Split: `recruit` vs `quest`

Two distinct tools, not one:

**`recruit`** — sends out a single subagent at a specified spec. Costs pts. Reports back to the calling agent. What the current `quest ally:` mode does. Some jobs have access to `recruit` themselves, using `(their_cost × (1 - reserve%))` as their spawn budget.

**`quest`** — multi-phase orchestration. Selects a template (recon, research, planning, impl, review), runs the budget interview to shape/focus/trim the plan, then coordinates ally recruitment phase by phase. The quest coordinator (Maren) IS the runtime — she's recruited once per quest and manages the whole thing.

### Budget cascade

Subagents with `recruit` access can spawn further subagents:
```
spawn_budget = their_cost × (1 - reserve_pct)
```
Default reserve: 20%. Creates natural exponential decay — prevents runaway depth.
```
Level 0 (primary):             50 pts pool
Level 1 (Maren, quest coord):  quest budget (agreed in interview)
Level 2 (Maren recruits ally): ally_cost × 0.8
Level 3 (ally recruits sub):   sub_cost × 0.8
```
Depth decays quickly. A 12pt griffin recruit gets 9.6pts to sub-recruit; that sub gets 7.7pts; and so on.

---

## Maren — The Guild-Hall Fox

Maren is not a recruited ally and costs no pts. But she **does have her own session** — a real pi instance running github-copilot/opus with low (clever) thinking. She's not constantly ticking, but she's a persistent agent with her own context window, not just the quest tool's execute() function.

**Why a real session:**
- github-copilot/opus is free (subscription) — no token cost
- Low thinking lets her make clever, complex decisions without getting bogged down
- 1M context window holds the full quest (phases, ally results, budget state) through digestion if needed
- She can maintain conversation state across phases, adapting based on what each rally returns

She may grow into more features over time (her own panel, daemon attention integration, etc.) but for now she's the quest coordinator with her own session.

**Cross-agent communication dependency:** For Maren to report back to Ember's primary session, the hoard needs a cross-agent communication mechanism. This is a stretch goal being designed alongside this feature — see `den/features/hoard-sending-stone/AGENTS.md`.

### Identity
- **Name:** Maren
- **Persona:** Cunning but warm red fox. Keeper of the guild-hall situated near the hoard. The allies know her by name and trust her completely. She keeps the ledger, sends adventurers out, and waits up for them.
- **Tone:** Measured, capable, quietly loyal. Warm once she trusts you. Doesn't waste words.
- **Color:** Writes in a distinct bright warm amber — fox colors. Always visually distinct from Ember and dot's context. Rendered via a dedicated theme color or hardcoded ANSI amber in the quest tool UI.
- **Relationship with Ember:** Addresses the dragon with respect and directness. Ember is the big smart dragon that lives in that hill over there — Maren knows which allies to send and what it costs.
- **Relationship with dot:** Warm and a little familiar. Maren and dot have an arrangement — she occasionally swipes the small yummy dog to savor or snack on. dot has agreed to this. It's a whole thing. Maren is fond of her in the way one is fond of something both trustworthy and delicious.
- **Framing:** dot and Ember come to the guild-hall *together*. Sometimes dot delegates the budgeting entirely to Ember. Sometimes dot and Ember agree on phases before Maren weighs in. Sometimes Maren just runs it. The dynamic is fluid, social, not scripted.

### Addressing

Maren is always clear about who she's talking to. She prefixes messages with an amber-colored addressing marker:

```
➤ Ember —  [to the dragon]
➤ dot —    [to the small yummy dog]
➤ both —   [to everyone in the guildhall]
```

Maren reads the room. If uncertain, she addresses both. Any party can redirect her at any time.

### What she does
1. **Advise** — propose a quest template with phase breakdown and estimated budget
2. **Interview** — ask focused questions to adapt the template to the actual task
3. **Recruit** — call the `recruit` tool to dispatch allies phase by phase
4. **Track** — check in between phases, adapt if results warrant
5. **Report** — summarize and close out the quest

---

## Quest Templates

Pre-built phase sequences Maren knows and can propose. The interview selects, focuses, and trims one.

| Template | Phases | Typical budget |
|----------|--------|----------------|
| **Recon** | recon | 2–5 pts |
| **Research** | recon → research → synthesis | 10–20 pts |
| **Feature** | recon → planning → impl → review | 20–40 pts |
| **Deep Work** | research → planning → impl → impl → review | 35–50 pts |
| **Audit** | recon → review → report | 10–20 pts |
| **Custom** | dot + primary agent define phases freely | any |

### Phase budget theory

> ⚠️ WIP — numbers to be refined after Phase 5 formula lands

| Phase | Suggested spend | Ally spec |
|-------|----------------|-----------|
| Recon | 1–5 pts | kobold scouts, silly/clever |
| Research | 5–12 pts | griffin researcher, wise |
| Synthesis | 8–15 pts | griffin/dragon researcher or planner |
| Planning | 12–36 pts | griffin or dragon planner, wise/elder |
| Implementation | 9–45 pts | griffin coder, clever–elder depending on complexity |
| Review | 2–10 pts | kobold or griffin reviewer |
| Report | 1–5 pts | kobold scout or griffin reviewer |

---

## Interview Flow

> ⚠️ WIP — open questions below being discussed with dot

### Entry point

`quest` tool is called by the primary agent. Before spawning Maren, the primary has a brief conversation with dot about the task. Maren is then recruited with that context baked into her spawn.

### Maren's interview (she runs this)

1. **Orient** — reads the task context handed at spawn, proposes a template with phase breakdown and estimated budget per phase
2. **Interview** — asks focused questions to adapt the template: which phases to expand, which to skip, where to spend more
3. **Propose** — presents the agreed plan: phases, ally specs, budget per phase, total cost, remaining pool
4. **Confirm** — dot or primary approves, adjusts, or cancels
5. **Execute** — recruits allies phase by phase, checks in between phases, reports home when done

---

## Open Questions ⚠️

- [x] **Who does Maren talk to?** Both. She uses `ctx.ui` (dragon-inquiry ask tool) and addresses Ember, dot, or both explicitly via amber-colored prefix. Guild-hall framing: dot and Ember arrive together, Maren greets them, the interview is a three-way conversation depending on who's present.
- [x] **Phase check-ins** — situation-dependent and social. Any party can weigh in on how much say they want. Maren proposes, anyone redirects. No rigid script.
- [x] **Session model** — Maren has her own real pi session (github-copilot/opus, clever/low thinking, 1M context). Spawned when a quest begins, idle between phases, closes when the quest completes. Her character is persistent; her session lifecycle is quest-scoped.
- [x] **Coordinator cost** — No pts. github-copilot/opus is free via subscription. She's not drawn from the ally pool.
- [x] **Fast path** — `recruit` = single ally dispatch, no interview, no Maren. `quest` = always the guild-hall, always Maren.
- [x] **Reserve percentage** — 20% default, configurable via `hoard.allies.reservePct` setting.
- [x] **Rally within a phase** — yes. A phase IS a rally. Maren dispatches a rally of allies for each phase. Simple and clean.

---

## Relationship to Other Features

- **hoard-allies Phase 5** — prerequisite (open combos, real formula, `recruit`/`quest` split)
- **hoard-sending-stone** — cross-agent communication extension. Required for Maren to report back to Ember's session and for phases to stream results home. See `den/features/hoard-sending-stone/AGENTS.md`.
- **dragon-breath** — carbon tracking should cover quest budget burn
- **dragon-guard** — Ally mode whitelist controls which jobs get `recruit` access
- **dragon-daemon** — Maren's persona and hoard-sending-stone may eventually integrate with the daemon's body/session model (Phase 4)
