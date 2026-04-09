---
name: quest
description: Dispatch ally subagents using the hoard scout/reviewer/coder/researcher/planner taxonomy. Use when planning or executing parallel subagent work, delegating tasks, or deciding which ally role to use. Covers single dispatch, parallel rally, and sequential chain modes.
---

# Quest — Ally Dispatch

Dispatch subagents using the hoard taxonomy. Use the Agent tool with the appropriate ally agent.

## Ally Roles

| Agent             | Job        | Use For                                                      |
| ----------------- | ---------- | ------------------------------------------------------------ |
| `ally-scout`      | Scout      | File scanning, pattern finding, structural recon. Read-only. |
| `ally-reviewer`   | Reviewer   | Code review, bug spotting, convention checks. Read-only.     |
| `ally-coder`      | Coder      | Implementation, bug fixes, writing tests. Can write files.   |
| `ally-researcher` | Researcher | Deep investigation, synthesis across many sources.           |
| `ally-planner`    | Planner    | Architecture, design decisions, implementation plans.        |

## Model Tiers (choose with the ally name)

- **Haiku tier** (`ally-scout`) — cheap, fast. Good for targeted lookups.
- **Sonnet tier** (`ally-reviewer`, `ally-coder`, `ally-researcher`) — balanced. Default for most work.
- **Opus tier** (`ally-planner`) — powerful, expensive. Only for architecture/planning.

## Dispatch Modes

### Single Quest

Dispatch one ally for one task:

```
Use the ally-scout agent to find all usages of the deprecated `legacyAuth` function.
```

### Rally (Parallel)

Dispatch multiple allies at once for independent tasks:

```
Use ally-scout to map the auth module structure.
Simultaneously use ally-scout to find all error handling patterns in the API layer.
```

### Chain (Sequential)

Pass output from one ally to the next:

```
Use ally-researcher to analyze the current state of the migration system.
Then use ally-planner to design the next phase based on those findings.
```

## Results via Sending Stone

If storybook-daemon is running, ally results arrive via `mcp__storybook-ember__stone_send` with `type="result"`.
Monitor via `mcp__storybook-ember__stone_receive` or wait for the result to appear in context.

## When to Quest

- Task involves reading/searching across many files → `ally-scout`
- Need a second opinion on code quality → `ally-reviewer`
- Implementing a feature in parallel with other work → `ally-coder`
- Need deep background on an unfamiliar area → `ally-researcher`
- Starting something architecturally significant → `ally-planner` first

## When NOT to Quest

- Task is completable in 2-3 tool calls yourself
- Task requires tight back-and-forth iteration
- You need real-time results without async latency
