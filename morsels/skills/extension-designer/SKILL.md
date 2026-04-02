---
name: extension-designer
description: "Design and build pi extensions with custom tools, TUI components, overlays, commands, and event hooks. Use when creating or modifying pi extensions, registering custom tools, building interactive TUI components, or working with .pi/extensions/ files."
---

# Extension Designer

Design, scaffold, and implement pi extensions following the extension API, TUI component system, and best practices from production examples.

## When to Use

- Creating a new pi extension from scratch
- Adding custom tools callable by the LLM
- Building interactive TUI components (overlays, selectors, widgets)
- Registering commands, shortcuts, or event hooks
- Managing stateful extensions with session persistence

## Inputs to Gather

Before starting, ask 2–4 of these (skip what's already clear):

1. What should the extension do? (tool, command, event hook, UI component)
2. Does it need persistent state across sessions?
3. Should it have custom TUI rendering (overlays, widgets, custom tool rendering)?
4. Does it need npm dependencies?

## Architecture Decision Tree

- **LLM needs to call it?** → Register a tool via `pi.registerTool()`
- **User triggers it manually?** → Register a command via `pi.registerCommand()`
- **Reacts to events?** → Subscribe with `pi.on("event_name", ...)`
- **Needs persistent UI?** → Use `ctx.ui.setWidget()` or `ctx.ui.setStatus()`
- **Needs interactive modal?** → Use `ctx.ui.custom()` (fullscreen or overlay)
- **Needs state across branches?** → Store state in tool result `details`, reconstruct from session
- **Needs npm deps?** → Use directory structure with `package.json`

## Extension Structure

### Single File
```
~/.pi/agent/extensions/my-extension.ts
```

### Directory (multi-file or with deps)
```
~/.pi/agent/extensions/my-extension/
├── index.ts           # Entry point (default export)
├── components.ts      # TUI components
├── package.json       # Only if npm deps needed
└── package-lock.json
```

## Skeleton

Every extension exports a default function receiving `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register tools, commands, event handlers, shortcuts
}
```

## Custom Tools

Register tools the LLM can call. Use `StringEnum` from `@mariozechner/pi-ai` for string enums (required for Google compatibility). Use `Type` from `@sinclair/typebox` for parameter schemas.

```typescript
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  parameters: Type.Object({
    action: StringEnum(["list", "add", "remove"] as const),
    text: Type.Optional(Type.String({ description: "Item text" })),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: "Result for LLM" }],
      details: { /* for rendering & state reconstruction */ },
    };
  },
  renderCall(args, theme, context) { /* return Component */ },
  renderResult(result, { expanded, isPartial }, theme, context) { /* return Component */ },
});
```

### Tool Rules

- Signal errors by **throwing** — never return `isError` manually
- Use `onUpdate?.()` for streaming progress
- Check `signal?.aborted` for cancellation
- Store full state in `details` for branch-correct reconstruction
- Use `withFileMutationQueue()` if mutating files

## TUI Components

All components implement `{ render(width): string[], handleInput?(data): void, invalidate(): void }`.

### Key Imports
```typescript
import { Text, Box, Container, Spacer, Markdown, SelectList, SettingsList } from "@mariozechner/pi-tui";
import { matchesKey, Key, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { DynamicBorder, BorderedLoader, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
```

### Overlays (Popovers)

Render floating components on top of existing content:

```typescript
const result = await ctx.ui.custom<ResultType | null>(
  (tui, theme, keybindings, done) => new MyComponent(theme, done),
  {
    overlay: true,
    overlayOptions: {
      anchor: "center",        // 9 positions: center, top-left, top-center, etc.
      width: "60%",            // number or percentage
      maxHeight: "80%",
      minWidth: 40,
      margin: 2,
    },
  }
);
```

### Rendering Rules

- Each line from `render()` must NOT exceed `width` — use `truncateToWidth()`
- Cache rendered output; clear in `invalidate()`
- Call `tui.requestRender()` after state changes in `handleInput`
- Use `theme` from callback — never import theme directly
- Rebuild themed content in `invalidate()` override (theme may change)

## State Management

Store state in tool result `details` for proper branching:

```typescript
// Reconstruct on session events
pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
pi.on("session_switch", async (_event, ctx) => reconstructState(ctx));
pi.on("session_fork", async (_event, ctx) => reconstructState(ctx));
pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

const reconstructState = (ctx: ExtensionContext) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.role === "toolResult"
        && entry.message.toolName === "my_tool") {
      const details = entry.message.details as MyDetails;
      // Rebuild in-memory state from details
    }
  }
};
```

## Commands & Shortcuts

Register `/commands` for user-triggered actions and keyboard shortcuts for quick access:

```typescript
pi.registerCommand("myext", {
	description: "Manage my extension",
	handler: async (args, ctx) => {
		const parts = (args ?? "").trim().split(/\s+/);
		switch (parts[0]) {
			case "open": ctx.ui.notify(doOpen(), "info"); return;
			case "close": ctx.ui.notify(doClose(), "info"); return;
			default: ctx.ui.notify("Usage: /myext open|close", "info");
		}
	},
});

pi.registerShortcut("alt+m", {
	description: "Toggle my extension",
	handler: async () => { toggle(); },
});
```

## Prompt Integration

Help the LLM discover and use your tool correctly with `promptSnippet` and `promptGuidelines`:

```typescript
pi.registerTool({
	name: "my_tool",
	// ...
	promptSnippet: "One-line summary shown in system prompt",
	promptGuidelines: [
		"Use X for this, Y for that — be specific about when to use each action",
		"Don't do Z — explain the common mistake",
	],
});
```

- `promptSnippet` — one line, always visible in the prompt. Make it scannable.
- `promptGuidelines` — array of usage hints. Each should teach the LLM one behavior.

## Inter-Extension Communication

Extensions **cannot import each other** — pi's jiti loader isolates module caches. Use these patterns instead:

### globalThis API (for shared infrastructure)

```typescript
// Publisher extension
const API_KEY = Symbol.for("my-namespace.api");
(globalThis as any)[API_KEY] = { method1, method2, property };

// Consumer extension
function getApi(): any { return (globalThis as any)[Symbol.for("my-namespace.api")]; }
getApi()?.method1();  // Always use optional chaining — publisher may not be loaded yet
```

### pi.events (for notifications)

```typescript
pi.events.emit("my-ext:ready", { version: 1 });
pi.events.on("my-ext:ready", (data) => { /* react */ });
```

For panel extensions specifically, see the `dot-panels` skill.

## Anti-Patterns

❌ **Storing state in external files** — breaks branching; state diverges from conversation tree.
✅ Store state in tool result `details` and reconstruct from session entries.

❌ **Using `Type.Union`/`Type.Literal` for string enums** — breaks Google API.
✅ Use `StringEnum(["a", "b"] as const)` from `@mariozechner/pi-ai`.

❌ **Importing theme at module level** — theme can change at runtime.
✅ Use `theme` from callbacks (`ctx.ui.custom`, `renderResult`, etc.).

❌ **Returning large untruncated output from tools** — overwhelms context.
✅ Use `truncateHead`/`truncateTail` from `@mariozechner/pi-coding-agent`.

❌ **Fire-and-forget overlays without `done()` callback** — leaks UI state.
✅ Always call `done()` on escape/cancel/confirm to close overlays.

## Quality Checklist

- [ ] Extension exports a default function receiving `ExtensionAPI`
- [ ] Tools use `StringEnum` for string enums, `Type` for schemas
- [ ] State stored in tool result `details`, reconstructed from session
- [ ] Session events handled: `session_start`, `session_switch`, `session_fork`, `session_tree`
- [ ] TUI lines respect `width` parameter (use `truncateToWidth`)
- [ ] Cached render output cleared in `invalidate()`
- [ ] Theme accessed from callbacks, not module-level imports
- [ ] `done()` called in all overlay exit paths (escape, cancel, confirm)
- [ ] Tool errors signaled by throwing, not return values
- [ ] `signal?.aborted` checked for cancellation in long-running tools

## Reference

For detailed API docs and patterns, read these files:
- [Extension API](references/extension-api.md) — Full event list, ctx methods, registration APIs
- [TUI Patterns](references/tui-patterns.md) — Copy-paste patterns for common UI needs

For panel-specific development, load the `dot-panels` skill.
