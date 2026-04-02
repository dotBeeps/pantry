# Extension API Reference

## Extension Locations

| Location | Scope |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | Global (all projects) |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory) |
| `.pi/extensions/*.ts` | Project-local |
| `.pi/extensions/*/index.ts` | Project-local (subdirectory) |

## Available Imports

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension types, `DynamicBorder`, `BorderedLoader`, `getMarkdownTheme`, `keyHint`, `isToolCallEventType`, `withFileMutationQueue`, `truncateHead`, `truncateTail` |
| `@sinclair/typebox` | `Type` for tool parameter schemas |
| `@mariozechner/pi-ai` | `StringEnum` for Google-compatible enums |
| `@mariozechner/pi-tui` | TUI components: `Text`, `Box`, `Container`, `Spacer`, `Markdown`, `Image`, `SelectList`, `SettingsList`, `Input`, `Editor`, `matchesKey`, `Key`, `truncateToWidth`, `visibleWidth`, `wrapTextWithAnsi`, `CURSOR_MARKER` |

## Event Lifecycle

```
session_start → user prompt → input → before_agent_start → agent_start
  → turn_start → context → before_provider_request
    → tool_execution_start → tool_call → tool_execution_update → tool_result → tool_execution_end
  → turn_end → agent_end
```

### Session Events
- `session_start` — Initial session load
- `session_switch` — After `/new` or `/resume`
- `session_fork` — After `/fork`
- `session_tree` — After `/tree` navigation
- `session_shutdown` — On exit (cleanup)
- `session_before_compact` / `session_compact` — Compaction hooks

### Agent Events
- `before_agent_start` — Can inject message, modify system prompt
- `agent_start` / `agent_end` — Per user prompt
- `turn_start` / `turn_end` — Per LLM response + tool calls
- `context` — Modify messages before LLM call (non-destructive)

### Tool Events
- `tool_call` — Before execution, can block or mutate `event.input`
- `tool_result` — After execution, can modify result

### Input Events
- `input` — After command check, before skill/template expansion. Return `{ action: "transform", text }`, `{ action: "handled" }`, or `{ action: "continue" }`

## ExtensionContext (ctx)

| Property/Method | Description |
|----------------|-------------|
| `ctx.ui` | UI methods (dialogs, widgets, custom components) |
| `ctx.hasUI` | `false` in print/JSON mode |
| `ctx.cwd` | Current working directory |
| `ctx.sessionManager` | Read-only session state |
| `ctx.modelRegistry` / `ctx.model` | Model access |
| `ctx.signal` | Abort signal during active turns |
| `ctx.isIdle()` / `ctx.abort()` | Control flow |
| `ctx.getContextUsage()` | Token usage info |
| `ctx.compact()` | Trigger compaction |
| `ctx.getSystemPrompt()` | Current system prompt |
| `ctx.shutdown()` | Graceful shutdown |

## ExtensionAPI (pi) Methods

| Method | Description |
|--------|-------------|
| `pi.on(event, handler)` | Subscribe to events |
| `pi.registerTool(def)` | Register LLM-callable tool |
| `pi.registerCommand(name, opts)` | Register `/command` |
| `pi.registerShortcut(key, opts)` | Register keyboard shortcut |
| `pi.registerFlag(name, opts)` | Register CLI flag |
| `pi.registerMessageRenderer(type, fn)` | Custom message rendering |
| `pi.sendMessage(msg, opts)` | Inject custom message (`steer`, `followUp`, `nextTurn`) |
| `pi.sendUserMessage(content, opts)` | Send as-if user typed it |
| `pi.appendEntry(type, data)` | Persist state (NOT in LLM context) |
| `pi.setSessionName(name)` | Set session display name |
| `pi.setLabel(entryId, label)` | Bookmark entry for `/tree` |
| `pi.exec(cmd, args, opts)` | Shell execution |
| `pi.getActiveTools()` / `pi.getAllTools()` / `pi.setActiveTools(names)` | Tool management |
| `pi.setModel(model)` | Switch model |
| `pi.getThinkingLevel()` / `pi.setThinkingLevel(level)` | Thinking control |
| `pi.events` | Shared event bus between extensions |

## ctx.ui Methods

| Method | Description |
|--------|-------------|
| `ctx.ui.select(title, options)` | Selection dialog |
| `ctx.ui.confirm(title, message, opts?)` | Yes/no dialog (supports `timeout`) |
| `ctx.ui.input(title, placeholder?)` | Text input |
| `ctx.ui.editor(title, prefill?)` | Multi-line editor |
| `ctx.ui.notify(msg, level)` | Non-blocking notification |
| `ctx.ui.custom<T>(factory, opts?)` | Full custom component |
| `ctx.ui.setStatus(id, text)` | Footer status line |
| `ctx.ui.setWidget(id, content, opts?)` | Widget above/below editor |
| `ctx.ui.setFooter(factory)` | Replace footer |
| `ctx.ui.setEditorText(text)` | Prefill editor |
| `ctx.ui.setEditorComponent(factory)` | Replace editor (vim, etc.) |
| `ctx.ui.setTitle(text)` | Terminal title |
| `ctx.ui.setWorkingMessage(text?)` | Streaming work indicator |
| `ctx.ui.theme` | Current theme object |

## Tool renderCall / renderResult Context

Both receive a `context` object with:
- `context.args` — Current tool call arguments
- `context.state` — Shared row-local state across call and result
- `context.lastComponent` — Previously returned component (reuse pattern)
- `context.invalidate()` — Request rerender of this tool row
- `context.toolCallId`, `context.cwd`, `context.executionStarted`, `context.argsComplete`, `context.isPartial`, `context.expanded`, `context.showImages`, `context.isError`
