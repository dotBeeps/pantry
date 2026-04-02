---
name: pi-sessions
description: "Manage session state, branching, compaction, and persistence in pi extensions. Use when building stateful extensions, custom compaction strategies, session event handlers, or working with the session tree."
---

# Pi Sessions & State

How pi stores conversation history, manages branches, handles compaction, and how extensions should manage state. Essential reading for any extension that persists data or hooks into session lifecycle.

For the full session format, read `/opt/pi-coding-agent/docs/session.md`. For compaction internals, read `/opt/pi-coding-agent/docs/compaction.md`.

## Session Tree Model

Sessions are **JSONL files** with a tree structure. Each entry has `id` and `parentId` — branching happens in-place without creating new files.

```
[user] ─── [assistant] ─── [user] ─── [assistant] ─┬─ [user]  ← current leaf
                                                    │
                                                    └─ [branch_summary] ─── [user]  ← alternate
```

Key concepts:
- **Leaf** — the current position in the tree (`ctx.sessionManager.getLeafId()`)
- **Branch** — path from leaf to root (`ctx.sessionManager.getBranch()`)
- **`/tree`** — navigate to any point, continue from there, all history preserved
- **`/fork`** — create a new session file from the current branch

## State Management

**Rule:** Store state in tool result `details`, never in external files. External files break branching — state diverges from the conversation tree.

```typescript
// Store state
async execute(toolCallId, params, signal, onUpdate, ctx) {
	items.push(params.text);
	return {
		content: [{ type: "text", text: "Added" }],
		details: { items: [...items] },  // Full snapshot for reconstruction
	};
}
```

### Reconstruction Pattern

Rebuild state from the session branch on every session event:

```typescript
const reconstructState = (ctx: ExtensionContext) => {
	items = [];
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "toolResult"
		    && entry.message.toolName === "my_tool") {
			items = entry.message.details?.items ?? [];
		}
	}
};

pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));
```

### Extension-Only Persistence

For state that should NOT be in LLM context (bookmarks, UI preferences):

```typescript
pi.appendEntry("my-extension-state", { preferences: { ... } });
```

These `custom` entries are in the tree but invisible to the LLM. Reconstruct them the same way — scan `entry.type === "custom" && entry.customType === "my-extension-state"`.

## Compaction

When context grows too long, compaction summarizes older messages while keeping recent ones.

### When It Triggers

```
Auto: tokens > contextWindow - reserveTokens    (default reserveTokens: 16384)
Manual: /compact [custom instructions]
```

### How It Works

1. Walk backward from newest message until `keepRecentTokens` (default 20k) is accumulated
2. Summarize everything before the cut point
3. Append a `CompactionEntry` with summary and `firstKeptEntryId`
4. Session reloads — LLM sees: summary + messages from `firstKeptEntryId` onward

### reserveTokens Double Duty

`reserveTokens` controls **two things:**
- **Trigger threshold** — when to fire compaction
- **Output budget** — compaction LLM gets `0.8 × reserveTokens` as `max_tokens`

Writing a very large `reserveTokens` triggers compaction earlier but inflates the summary budget (may hit API limits). A small `reserveTokens` triggers late and limits summary quality.

For extensions that decouple the trigger from the budget, write a safe value (e.g., 16384) to settings and enforce the actual trigger through hooks. See `references/pi-internals.md` in `extension-designer`.

### Custom Compaction

Intercept compaction to cancel, modify, or fully replace the summary:

```typescript
pi.on("session_before_compact", async (event, ctx) => {
	const { preparation, branchEntries, customInstructions, signal } = event;

	// preparation.messagesToSummarize — messages to summarize
	// preparation.previousSummary — previous compaction summary (iterative)
	// preparation.firstKeptEntryId — where kept messages start
	// preparation.tokensBefore — context tokens before compaction
	// preparation.fileOps — extracted file operations

	// Cancel:
	return { cancel: true };

	// Custom summary:
	return {
		compaction: {
			summary: "Your custom summary...",
			firstKeptEntryId: preparation.firstKeptEntryId,
			tokensBefore: preparation.tokensBefore,
			details: { readFiles: [...], modifiedFiles: [...] },
		},
	};
});
```

### Proactive Compaction

For trigger points earlier than pi's native threshold, pi won't fire on its own. Check your threshold in `turn_end` and call `ctx.compact()`:

```typescript
pi.on("turn_end", async (_event, ctx) => {
	const usage = ctx.getContextUsage();
	if (usage && usage.tokens > myThreshold && !compactionInProgress) {
		ctx.compact({
			customInstructions: "Focus on code changes and technical decisions",
			onComplete: () => { compactionInProgress = false; },
			onError: () => { compactionInProgress = false; },
		});
		compactionInProgress = true;
	}
});
```

Guard against double-fire — don't call `compact()` if one is already in progress.

### Compaction Event Ordering Gotcha

`compaction_start` fires **before** `session_before_compact`. Pi's interactive mode sets its hardcoded "Compacting context..." label on `compaction_start`. No extension hook can replace this label — use `ctx.ui.setStatus()` to show your own label alongside it.

## Branch Summarization

When `/tree` navigates to a different branch, pi can summarize the abandoned branch:

```typescript
pi.on("session_before_tree", async (event, ctx) => {
	const { preparation, signal } = event;
	// preparation.targetId, oldLeafId, commonAncestorId
	// preparation.entriesToSummarize, userWantsSummary

	// Cancel navigation:
	return { cancel: true };

	// Custom summary (only used if userWantsSummary is true):
	if (preparation.userWantsSummary) {
		return { summary: { summary: "Your summary...", details: {} } };
	}
});
```

## Context Usage

Check how full the context window is:

```typescript
const usage = ctx.getContextUsage();
if (usage) {
	usage.tokens;         // Current token count
	usage.contextWindow;  // Model's context window
	usage.percent;        // Usage percentage (0-100)
}
```

## Message Types

Session entries contain `AgentMessage` objects. Key roles:

| Role | Description |
|------|-------------|
| `user` | User messages (text + images) |
| `assistant` | LLM responses (text + thinking + tool calls) with usage stats |
| `toolResult` | Tool execution results with `details` for state |
| `bashExecution` | User `!command` results |
| `custom` | Extension-injected messages (in LLM context if `display: true`) |
| `compactionSummary` | Compaction summary |
| `branchSummary` | Branch summarization summary |

## Anti-Patterns

- **Storing state in files** — breaks branching; state diverges from conversation tree. Use tool `details`.
- **Missing session event handlers** — state goes stale on branch switch/fork. Handle all four: `session_start`, `session_switch`, `session_fork`, `session_tree`.
- **Calling `compact()` without double-fire guard** — compaction is async; multiple calls stack up and cause errors.
- **Assuming `reserveTokens` only controls triggering** — it also caps the compaction LLM output budget.
- **Using `pi.sendMessage` for state** — messages go to LLM context. Use `pi.appendEntry` for extension-only persistence.
