---
name: ally-status
description: Check the status of running ally subagents and the storybook-daemon. Use when you want to know if an ally has reported in, check daemon attention level, or verify the MCP connection is live.
---

# Ally Status

Check daemon state and any pending ally messages.

## Check Attention State

```
mcp__storybook-ember__attention_state()
```

Returns `pool` (current attention points) and `status` (healthy / low / floor).
If status is `floor`, avoid dispatching new allies — the daemon is depleted.

## Drain Pending Stone Messages

```
mcp__storybook-ember__stone_receive(wait=5)
```

Polls for any results or progress updates from running allies.
Call with a short `wait` to drain the queue without blocking.

## Register This Session

```
mcp__storybook-ember__register_session(
  session_id="<unique-id>",
  provider="anthropic",
  model="claude-sonnet-4-6",
  harness="claude-code"
)
```

Tells the daemon who is connected. Call once at session start.

## When to Use

- After dispatching allies — check if results have arrived
- Before dispatching expensive allies — verify attention is above floor
- When debugging a stalled quest — check if the ally sent a question you missed
- At session start — register so the daemon knows you're connected
