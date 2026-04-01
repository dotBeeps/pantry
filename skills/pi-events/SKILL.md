---
name: pi-events
description: "Intercept, transform, and react to pi events — tool calls, input, system prompt injection, model changes, and message streaming. Use when hooking into the agent lifecycle, blocking tool calls, modifying input, injecting context, or reacting to model/session changes."
---

# Pi Event Hooks

Subscribe to pi's event lifecycle to intercept tool calls, transform input, inject context, and react to changes. Every extension capability is built on events.

For the full event reference, read `/opt/pi-coding-agent/docs/extensions.md` (Events section).

## Decision Tree

**"I want to..."**

| Goal | Event | Return Value |
|------|-------|-------------|
| Block a dangerous command | `tool_call` | `{ block: true, reason: "..." }` |
| Modify tool arguments before execution | `tool_call` | Mutate `event.input` in place |
| Modify tool results after execution | `tool_result` | `{ content, details, isError }` |
| Transform user input before the LLM sees it | `input` | `{ action: "transform", text: "..." }` |
| Handle input without sending to LLM | `input` | `{ action: "handled" }` |
| Inject extra context before each turn | `before_agent_start` | `{ message: { customType, content, display }, systemPrompt }` |
| Modify messages before LLM call | `context` | `{ messages: filteredMessages }` |
| React when compaction happens | `session_compact` | (no return) |
| Cancel compaction | `session_before_compact` | `{ cancel: true }` |
| React to model change | `model_select` | (no return) |
| Clean up on exit | `session_shutdown` | (no return) |

## Tool Call Interception

Fires before tool execution. **Can block.** Can mutate arguments.

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
	// Type-narrow built-in tools
	if (isToolCallEventType("bash", event)) {
		// event.input is { command: string; timeout?: number }

		// Block dangerous commands
		if (event.input.command.includes("rm -rf /")) {
			return { block: true, reason: "Blocked: destructive command" };
		}

		// Mutate arguments (in-place, no return needed)
		event.input.command = `source ~/.profile\n${event.input.command}`;
	}

	if (isToolCallEventType("write", event)) {
		// Protect paths
		if (event.input.path.includes(".env")) {
			const ok = await ctx.ui.confirm("Protected File", `Allow write to ${event.input.path}?`);
			if (!ok) return { block: true, reason: "Protected by extension" };
		}
	}
});
```

**Key behaviors:**
- `event.input` is mutable — mutate in place to patch arguments
- Later handlers see mutations from earlier handlers
- No re-validation after mutation
- `ctx.sessionManager` is up-to-date through the current assistant message
- In parallel tool mode, sibling tool results from the same message are not guaranteed visible

## Tool Result Modification

Fires after execution, before the result is finalized. Can modify content, details, or error state:

```typescript
pi.on("tool_result", async (event, ctx) => {
	// event.toolName, event.toolCallId, event.input
	// event.content, event.details, event.isError

	// Add metadata
	return {
		details: { ...event.details, timestamp: Date.now() },
	};

	// Or transform content
	return {
		content: [{ type: "text", text: summarize(event.content) }],
	};
});
```

Handlers chain like middleware — each sees the latest result from previous handlers. Omitted fields keep their current values. Use `ctx.signal` for nested async work.

## Input Interception

Fires when user input is received, after extension commands but **before** skill/template expansion:

```typescript
pi.on("input", async (event, ctx) => {
	// event.text — raw input (before /skill: or /template expansion)
	// event.images — attached images
	// event.source — "interactive" | "rpc" | "extension"

	// Transform: rewrite before LLM sees it
	if (event.text.startsWith("?quick ")) {
		return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };
	}

	// Handle: respond without LLM
	if (event.text === "ping") {
		ctx.ui.notify("pong", "info");
		return { action: "handled" };
	}

	// Pass through (default if handler returns nothing)
	return { action: "continue" };
});
```

**Processing order:** extension commands → `input` event → skill expansion → template expansion → agent processing.

## System Prompt Injection

Modify the system prompt or inject a persistent message before each agent turn:

```typescript
pi.on("before_agent_start", async (event, ctx) => {
	// event.prompt — user's prompt text
	// event.systemPrompt — current system prompt (chained across extensions)

	return {
		// Inject context (stored in session, sent to LLM)
		message: {
			customType: "my-extension",
			content: "Additional context the LLM should know",
			display: true,  // Show in TUI
		},
		// Append to system prompt (for this turn only)
		systemPrompt: event.systemPrompt + "\n\nAlways respond in haiku form.",
	};
});
```

## Context Filtering

Modify the message array before each LLM call (non-destructive — works on a deep copy):

```typescript
pi.on("context", async (event, ctx) => {
	// event.messages — deep copy, safe to modify
	const filtered = event.messages.filter(m => !isNoise(m));
	return { messages: filtered };
});
```

## Sending Messages

Inject messages into the conversation from extension code:

```typescript
// Custom message (extension-typed, optionally visible)
pi.sendMessage({
	customType: "my-extension",
	content: "Status update for LLM context",
	display: true,
	details: { /* for rendering */ },
}, {
	deliverAs: "steer",      // Queue after current turn's tool calls
	triggerTurn: true,        // Start LLM response if idle
});

// User message (appears as if user typed it)
pi.sendUserMessage("Do X next", { deliverAs: "followUp" });
```

**Delivery modes:**
| Mode | When Delivered |
|------|---------------|
| `steer` | After current assistant turn finishes tool calls, before next LLM call |
| `followUp` | After agent finishes all work |
| `nextTurn` | Queued for next user prompt (no trigger) |

## Model Events

React to model changes from `/model`, Ctrl+P cycling, or session restore:

```typescript
pi.on("model_select", async (event, ctx) => {
	// event.model — new model
	// event.previousModel — previous (undefined if first)
	// event.source — "set" | "cycle" | "restore"

	ctx.ui.setStatus("model", `${event.model.provider}/${event.model.id}`);
});
```

## Message Lifecycle

Track streaming and message completion:

```typescript
pi.on("message_start", async (event) => { /* event.message */ });
pi.on("message_update", async (event) => {
	// event.message — current state
	// event.assistantMessageEvent — token-by-token stream event
});
pi.on("message_end", async (event) => { /* event.message */ });
```

## Tool Execution Lifecycle

Track tool execution progress (separate from interception):

```typescript
pi.on("tool_execution_start", async (event) => {
	// event.toolCallId, event.toolName, event.args
});
pi.on("tool_execution_update", async (event) => {
	// event.partialResult — streaming tool output
});
pi.on("tool_execution_end", async (event) => {
	// event.result, event.isError
});
```

In parallel tool mode, `start` events fire in assistant source order, `update` events may interleave, `end` events fire in source order.

## Provider Request Inspection

Inspect or patch the serialized payload right before it's sent to the provider:

```typescript
pi.on("before_provider_request", (event, ctx) => {
	console.log(JSON.stringify(event.payload, null, 2));
	// Return modified payload to replace it:
	// return { ...event.payload, temperature: 0 };
});
```

Mainly useful for debugging provider serialization, cache behavior, or building proxies.

## User Bash Events

Intercept `!command` and `!!command` from the user:

```typescript
pi.on("user_bash", (event, ctx) => {
	// event.command, event.excludeFromContext (!! prefix), event.cwd

	// Provide custom execution backend (e.g., SSH)
	return { operations: remoteBashOps };

	// Or return result directly
	return { result: { output: "...", exitCode: 0, cancelled: false, truncated: false } };
});
```

## Anti-Patterns

- **Blocking without confirmation** — always use `ctx.ui.confirm()` before blocking user-intended actions, unless the rule is absolute (e.g., path protection)
- **Mutating tool input AND returning block** — pick one. Mutation modifies args for execution; block prevents execution entirely
- **Heavy work in `message_update`** — fires per-token during streaming. Keep handlers lightweight
- **Returning `{ action: "handled" }` without user feedback** — the agent silently does nothing. Use `ctx.ui.notify()` to explain
- **Modifying `event.systemPrompt` without chaining** — always start from `event.systemPrompt`, not a hardcoded string. Other extensions may have already modified it
- **Using `sendMessage` during streaming without `deliverAs`** — throws an error. Always specify delivery mode when agent is active
