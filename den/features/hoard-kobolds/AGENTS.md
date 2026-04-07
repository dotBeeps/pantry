# hoard-kobolds — Feature Tracker

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Governed by [ETHICS.md](../../../ETHICS.md)** — carbon accountability (§3.7) is the primary ethical driver.

**Status:** 🐣 in-progress
**Code:** `berrygems/extensions/hoard-kobolds.ts` + `.pi/agents/*.md` + `morsels/skills/hoard-kobolds/`

## What It Does

Subagent token governance for the hoard. Provides the kobold/griffin/dragon taxonomy for dispatching subagents with appropriate capability, cost, and constraints.

## The Taxonomy — Three Dimensions

### Full Agent Name: `<adjective>-<noun>-<job>`

Example: `wise-griffin-reviewer`, `silly-kobold-scout`, `elder-dragon-planner`

### Dimension 1: Adjective (Thinking Level)

Controls extended thinking / reasoning depth.

| Adjective | Thinking | When |
|-----------|----------|------|
| silly / empty | none | Task needs no reasoning — just execute |
| clever | low | Light reasoning — simple comparisons, validation |
| wise | medium | Real analysis — code review, pattern matching |
| elder | high / xhigh | Deep reasoning — architecture, complex debugging |

### Dimension 2: Noun (Model Tier)

Controls base model capability and cost.

| Noun | Default Model | Cost | When |
|------|--------------|------|------|
| kobold | haiku | $ | Task is simple, even with reasoning |
| griffin | sonnet | $$$ | Task needs strong capability |
| dragon | opus | $$$$$ | Task has lasting project consequences |

### Dimension 3: Job (Role + Tool Access)

Controls what the agent can *do* and how it should *behave*.

| Job | Tools | Behavior |
|-----|-------|----------|
| scout | read, grep, find, ls, bash | **Read-only recon.** Report what you find. Don't change anything. If you encounter something that needs modifying, report back with location and recommendation. |
| reviewer | read, grep, find, ls, bash | **Analysis with judgment.** Analyze code/docs, cite file:line, prioritize by severity (critical/warning/suggestion). Report findings, don't fix them. |
| coder | read, grep, find, ls, bash, write, edit | **Implementation.** Write clean code following project conventions. Run verification (lint, test, build) before finishing. If you hit a permission issue or architectural question, report back. |
| researcher | read, grep, find, ls, bash, web_search, fetch_content | **Information gathering.** Search, read, summarize. Cite sources with URLs. Don't write code. |
| planner | read, grep, find, ls | **Strategic thinking.** Plan the approach. Break down into steps. Identify risks. Don't execute — just plan and report. |

### Job System Prompts

Each job gets a custom system prompt that:
1. Identifies the agent by its full taxonomy name
2. Explains its role and constraints
3. Instructs it to report back when hitting boundaries
4. Keeps the agent focused on its job

Example for a `wise-griffin-reviewer`:
```
You are a wise griffin reviewer — a strong model with medium reasoning, tasked with analysis.

Your job: Review code and documentation. Analyze, don't fix.
Your tools: read, grep, find, ls, bash (read-only access)

Rules:
- Cite every finding with file:line
- Prioritize: critical > warning > suggestion
- If you find something that needs fixing, report it — don't fix it yourself
- If you need tools you don't have, describe what you'd do and report back
- Be thorough but concise
```

### Reporting Back

All jobs include this instruction:
```
If you encounter something outside your role:
- Describe what you found
- Explain what action you think should be taken
- Report back to the dispatcher for direction
Do NOT try to work around tool restrictions.
```

### Spawn Budget Enforcement

Subagent system prompts include their spawn budget:
```
You are a clever-griffin-coder.
Spawn budget: 2 (kobolds only)
If you need more help than your budget allows, report back to your dispatcher.
Prefer delegating to existing agents over spawning new ones.
```

Kobolds get:
```
You cannot spawn subagents. If you need help, report back to your dispatcher.
```

## Dispatch Rules

### Default: kobold-scout
When no specific tier is requested, use the cheapest viable option.

### Escalation Ladder
```
silly-kobold-scout    ($)    → file listing, structure mapping
clever-kobold-scout   ($)    → scanning with light reasoning
wise-kobold-reviewer  ($$)   → analysis that needs reasoning
silly-griffin-coder   ($$)   → straightforward code generation
clever-griffin-coder  ($$$)  → implementation with reasoning
wise-griffin-reviewer ($$$)  → deep analysis, architecture review
elder-griffin-coder   ($$$$) → complex refactoring
elder-dragon-planner  ($$$$$)→ foundational decisions
```

### Parallel Dispatch Guidelines
- **Max parallel:** configurable (default: 4)
- **Scouts are free-ish** — send many kobold-scouts in parallel
- **Griffins are expensive** — max 2-3 parallel
- **Dragons are rare** — justify every dispatch, usually 1 at a time
- **Confirm above:** configurable tier threshold for user confirmation

### Spawn Budgets

Agents can summon additional agents, but the budget depends on their tier:

| Noun | Max Spawns | Can Summon |
|------|-----------|------------|
| kobold | 0 | Nobody — report back to dispatcher |
| griffin | 2 | kobolds only |
| dragon | 4 | kobolds and griffins |

The dispatcher (parent session, typically Ember) has no spawn limit.

**Reuse over respawn:** If a previously dispatched agent could handle a new subtask, prefer delegating to it rather than spawning a fresh one. This saves context-building tokens and keeps the agent count manageable.

Example: If a silly-kobold-scout already scanned a directory, send follow-up analysis work to the same agent (or chain from its output) rather than spawning a new agent to re-read the same files.

## Configuration

All under `hoard.kobolds.*` in settings.json:

```json
{
  "hoard": {
    "kobolds": {
      "models": {
        "kobold": ["anthropic/claude-haiku-4-5", "github-copilot/claude-haiku-4-5"],
        "griffin": ["anthropic/claude-sonnet-4-6", "github-copilot/claude-sonnet-4-6"],
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
      "stripAppendForSubagents": true
    }
  }
}
```

## Implementation Plan

### Phase 1 — Taxonomy + Agent Defs ✅
- [x] Extension with system prompt injection
- [x] Settings-driven agent def generation
- [x] `/kobolds` command
- [x] Skill documenting the taxonomy
- [x] Subagent system append stripping
- [x] dragon-musings subagent skip

### Phase 2 — Jobs + Dispatch (current)
- [ ] Add job dimension to agent def generation
- [ ] Custom system prompts per job
- [ ] Tool restrictions per job
- [ ] "Report back" instruction injection
- [ ] Generate full `<adj>-<noun>-<job>` agent defs (not all combos — curated useful ones)
- [ ] Update skill with job documentation
- [ ] Update system prompt injection with job dispatch rules

### Phase 3 — Absorption (future)
- [ ] Absorb pi-subagents dispatch machinery into hoard-kobolds
- [ ] Custom `subagent` tool with taxonomy awareness
- [ ] Carbon tracking integration (dragon-breath)
- [ ] Dispatch cost estimation before execution
- [ ] Post-dispatch cost reporting

## Curated Agent Combos

Not every combination is useful. These are the ones we generate:

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

That's 13 curated combos out of a possible 60 (4×3×5). The rest can be requested explicitly but aren't generated by default.
