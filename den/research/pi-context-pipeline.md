# Pi's Context Building Pipeline

**A complete trace of how user input becomes what the LLM sees**

---

## Overview

Pi's context assembly pipeline is a multi-stage process that transforms user input into a complete provider payload. Each stage can be intercepted and modified by extensions, compaction logic, session state, and settings. This document traces the complete flow with exact event signatures, return types, and mutation points.

### High-Level Flow

```
User Input
    ↓
Input Event (extensions can intercept/transform)
    ↓
Skill/Template Expansion
    ↓
Before Agent Start Event (inject messages, modify system prompt)
    ↓
Context Assembly:
  ├─ System Prompt (built from skills, modified by extensions)
  ├─ Session History (from JSONL, modified by compaction)
  ├─ Messages from Session (converted to provider format)
  └─ Context Event (extensions can filter/modify messages)
    ↓
Build Provider Payload
    ↓
Before Provider Request Event (inspect or replace payload)
    ↓
Provider Call
```

---

## Stage 1: User Input Capture

### Trigger
User types and presses Enter in interactive mode, or message arrives via RPC/API.

### What Happens
Input text + attached images arrive at the extension event system.

### Event Signature: `input`

```typescript
interface InputEvent {
  text: string;                    // Raw user input (before skill/template expansion)
  images?: Array<{                 // Attached images, if any
    type: "base64" | "path" | "url";
    data: string;
  }>;
  source: "interactive" | "rpc" | "extension";  // Where input came from
}

// Handler return type
type InputEventResult = 
  | { action: "continue" }                        // Pass through (default)
  | { action: "transform"; text: string; images?: ... }  // Modify before expansion
  | { action: "handled" };                        // Skip agent entirely
```

### Handler Signature

```typescript
pi.on("input", async (event, ctx) => {
  // event.text - raw input before skill/template expansion
  // event.images - attached images
  // event.source - where it came from
  
  return { action: "continue" };  // or transform/handled
});
```

### What Extensions Can Modify
- `event.text` (via transform)
- `event.images` (via transform)
- **Skip processing entirely** (return `{ action: "handled" }`)

### What Happens Next
1. **If `handled`**: Extension shows own feedback, agent never runs
2. **If `transform`**: Modified text proceeds to skill/template expansion
3. **If `continue`**: Original text proceeds unchanged

### Timing
Extensions are checked first. If any extension defines `/command` with this name, they run before input event fires.

---

## Stage 2: Skill & Template Expansion

### Trigger
User input contains `/skill:name` or `/template:name` commands.

### What Happens
Pi expands the reference to the full skill or template content:

```
Input: "/skill:pdf-tools extract page 5"
  ↓
Skill content loaded from disk/memory
  ↓
Appended as:
  User: extract page 5

Expanded input becomes: [full SKILL.md content]\nUser: extract page 5
```

### Where Skills Come From
- Discovery phase at startup scans:
  - `~/.pi/agent/skills/` (global)
  - `~/.agents/skills/` (global)
  - `.pi/skills/` (project)
  - `.agents/skills/` (project)
  - `packages` in settings.json
  - `--skill <path>` CLI flag

### System Prompt Inclusion
Each skill's `name` and `description` are injected into the system prompt in XML format (per Agent Skills spec):

```xml
<skills>
  <skill name="pdf-tools">
    <description>Extract and process PDF content...</description>
  </skill>
  <skill name="brave-search">
    <description>Web search via Brave Search API...</description>
  </skill>
</skills>
```

### What This Stage Produces
- Expanded user input (if skill/template)
- List of active skills for system prompt
- User is now ready to proceed to `before_agent_start`

---

## Stage 3: Before Agent Start

### Trigger
After skill expansion, before agent loop begins.

### Event Signature: `before_agent_start`

```typescript
interface BeforeAgentStartEvent {
  prompt: string;              // Final user prompt text (after skill expansion)
  images?: ImageContent[];     // Attached images, if any
  systemPrompt: string;        // Current system prompt
}

// Handler return type
type BeforeAgentStartResult = {
  message?: {                  // Inject a custom message into session
    customType: string;        // Extension identifier
    content: string | (TextContent | ImageContent)[];
    display: boolean;          // Show in TUI
    details?: Record<string, any>;  // Extension-specific metadata
  };
  systemPrompt?: string;       // Replace system prompt for this turn (chained)
};
```

### Handler Signature

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - user's prompt (after skill expansion)
  // event.images - images attached to prompt
  // event.systemPrompt - current system prompt
  
  return {
    message: {
      customType: "my-extension",
      content: "Additional context for LLM",
      display: true,
    },
    systemPrompt: event.systemPrompt + "\n\nExtra rules...",
  };
});
```

### What Can Be Modified

**System Prompt:**
- Extensions can chain modifications
- Each extension modifies the previous one's result
- Final prompt sent to LLM includes all modifications

**Injected Messages:**
- Stored in session (persistent)
- Sent to LLM as actual messages
- Can include images
- Extensions can emit their own context at turn time

### System Prompt Construction

The base system prompt includes:
1. **Role definition**: "You are pi, a coding agent..."
2. **Available tools**: One-line descriptions of all active tools + custom tool prompts
3. **Guidelines**: How to use tools, etc.
4. **Available skills**: XML-formatted skill names and descriptions
5. **Default instructions**: Error handling, file operations, etc.
6. **Custom additions**: Via `before_agent_start` handlers (chained)
7. **Model-specific rules**: Thinking token limits, etc.

### Side Effects
- Injected messages are appended to session (permanent)
- System prompt modifications only apply to this turn
- Agent state is now ready for context assembly

---

## Stage 4: Context Assembly - Session Load

### Trigger
Immediately before LLM call, context needs to be assembled.

### Session File Format
Sessions are JSONL files with entries forming a tree:

```
~/.pi/agent/sessions/--<cwd_hash>--/<timestamp>_<uuid>.jsonl
```

Each line is a JSON entry:

```typescript
// Header (first line, no id/parentId)
{ type: "session", version: 3, id: "uuid", cwd: "/path", timestamp: "2024..." }

// Messages form the tree
{ type: "message", id: "a1b2c3d4", parentId: null, message: {...} }
{ type: "message", id: "b2c3d4e5", parentId: "a1b2c3d4", message: {...} }

// Metadata
{ type: "model_change", id: "...", provider: "anthropic", modelId: "..." }
{ type: "thinking_level_change", id: "...", thinkingLevel: "high" }
{ type: "compaction", id: "...", summary: "...", firstKeptEntryId: "..." }
{ type: "branch_summary", id: "...", summary: "...", fromId: "..." }

// Extension state (not in context)
{ type: "custom", id: "...", customType: "my-ext", data: {...} }

// Extension messages (in context)
{ type: "custom_message", id: "...", customType: "my-ext", content: "..." }
```

### buildSessionContext() Process

The session manager walks from the current leaf entry backwards to the root, building the context:

```typescript
// Pseudo-code
function buildSessionContext(sessionManager) {
  const entries = sessionManager.getEntries();  // All entries
  const branch = sessionManager.getBranch();    // Walk from leaf to root
  const messages = [];

  for (const entry of branch) {
    if (entry.type === "message") {
      messages.push(entry.message);  // UserMessage, AssistantMessage, ToolResultMessage, etc.
    }
    else if (entry.type === "compaction") {
      // Insert summary at this point
      messages.push({
        role: "compactionSummary",
        summary: entry.summary,
        tokensBefore: entry.tokensBefore,
      });
      // Only include messages from firstKeptEntryId onwards
      messages = messages.filter(m => entryId >= entry.firstKeptEntryId);
    }
    else if (entry.type === "branch_summary") {
      // Convert to message
      messages.push({
        role: "branchSummary",
        summary: entry.summary,
        fromId: entry.fromId,
      });
    }
    else if (entry.type === "custom_message") {
      // Custom message from extension
      messages.push({
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        details: entry.details,
      });
    }
  }

  return {
    messages,
    model: sessionManager.getCurrentModel(),
    thinkingLevel: sessionManager.getCurrentThinkingLevel(),
  };
}
```

### Message Types in Context

All message types that can be in context:

```typescript
// User-sent message
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

// LLM response
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  provider: string;
  model: string;
  usage: Usage;
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted";
  timestamp: number;
}

// Tool result
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: any;              // Tool-specific metadata
  isError: boolean;
  timestamp: number;
}

// Bash execution (from ! or !! commands)
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  excludeFromContext?: boolean;  // true if !! prefix
  timestamp: number;
}

// Custom message from extension
interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;           // Shown in TUI
  details?: any;
  timestamp: number;
}

// Branch summary (when navigating tree)
interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;            // Markdown-formatted summary
  fromId: string;             // Entry we navigated from
  timestamp: number;
}

// Compaction summary
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;            // Markdown-formatted summary
  tokensBefore: number;
  timestamp: number;
}
```

### Compaction Logic

If a `CompactionEntry` is on the current branch:

1. **Trigger**: `buildSessionContext()` encounters a compaction entry
2. **Action**: 
   - Insert `CompactionSummaryMessage` at that point in messages
   - Filter messages to only include those from `firstKeptEntryId` onwards
   - Messages before are discarded (replaced by summary)

```
Before compaction:
  [user] → [asst] → [tool] → [user] → [asst] → [tool] → [asst]
   entry0   entry1   entry2   entry3   entry4   entry5   entry6

Compaction at entry3 with firstKeptEntryId = entry3:
  [summary] → [user] → [asst] → [tool] → [asst]
  (compaction)  entry3   entry4   entry5   entry6
```

3. **Multiple compactions**: Each compaction starts from the previous one's `firstKeptEntryId`, preserving accumulated context
4. **Token accounting**: New compaction recalculates `tokensBefore` from the current LLM context

### What Extensions Can Observe
- Current messages before modification
- Current compaction state
- Branch structure

### Side Effects
- Compaction summary inserted into message stream
- Old messages filtered out
- Remaining context is now ready for `context` event

---

## Stage 5: Context Event (Extension Filtering)

### Trigger
After session context is built but before provider payload is assembled.

### Event Signature: `context`

```typescript
interface ContextEvent {
  messages: AgentMessage[];  // Deep copy - safe to modify
}

// Handler return type
type ContextEventResult = {
  messages?: AgentMessage[];  // Modified message list
};
```

### Handler Signature

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - deep copy of all messages that will be sent to LLM
  
  // Filter, reorder, or replace messages non-destructively
  const filtered = event.messages.filter(m => !shouldPrune(m));
  
  return { messages: filtered };
});
```

### What Can Be Modified
- Add messages
- Remove messages
- Reorder messages
- Replace entire message list
- **Cannot** modify individual message properties (modifying the returned array is the only interface)

### Use Cases
- Filter out tool results that are too large
- Remove sensitive information
- Reorder for emphasis
- Inject additional context

### Important Notes
- **Safe to modify**: You receive a deep copy, not the session's original
- **Non-destructive**: Session is not affected, only this turn's payload
- **Chaining**: Multiple handlers chain; later handlers see previous handler's modifications
- **Deep copy**: Each message is cloned, safe to mutate

---

## Stage 6: System Prompt Assembly

### Trigger
During LLM request preparation.

### Sources

1. **Base prompt** (hardcoded in pi)
2. **Available tools section**: One-line descriptions from active tools + custom tool prompts
3. **Tools with promptSnippet**: Included in `Available tools` section
4. **Tools with promptGuidelines**: Added to `Guidelines` section
5. **Available skills section**: XML with skill names and descriptions
6. **Custom additions**: From `before_agent_start` handler modifications

### Tool Inclusion

Built-in tools always included (can be disabled with `--no-tools` or `pi.setActiveTools()`):
- `read` - Read file contents
- `bash` - Execute shell commands
- `write` - Write files
- `edit` - Edit files with exact text replacement
- `grep` - Search file contents
- `find` - Find files by glob pattern
- `ls` - List directory contents

Custom tools registered via `pi.registerTool()`:
```typescript
pi.registerTool({
  name: "my_tool",
  description: "What this tool does",  // Short, shown to LLM
  promptSnippet: "One-line usage hint",  // Optional, in "Available tools"
  promptGuidelines: [               // Optional, in "Guidelines"
    "When to use this tool...",
    "Best practices..."
  ],
  parameters: Type.Object({...}),
  async execute(...) { ... }
});
```

### Skill Inclusion

All discovered skills injected as XML (per Agent Skills spec):

```xml
<skills>
  <skill name="pdf-tools">
    <description>Extract text and tables from PDF files...</description>
  </skill>
  <skill name="brave-search">
    <description>Web search via Brave Search API...</description>
  </skill>
</skills>
```

When agent uses a skill, full SKILL.md loaded via `read` tool on-demand.

### Final Prompt Structure

```
# System Prompt

[Role and capabilities]

## Available tools

[Built-in tools: read, bash, write, edit, grep, find, ls]
[Custom tools with promptSnippet]

## Guidelines

[Default guidelines]
[Custom tool promptGuidelines]

## Available skills

<skills>
  <skill name="..."><description>...</description></skill>
</skills>

[Additional guidelines and rules]

[Modifications from before_agent_start handlers]
```

---

## Stage 7: Provider Payload Assembly

### Trigger
When LLM request is about to be sent.

### Payload Structure

The provider-specific payload is built based on the model's API:

```typescript
// Anthropic Messages API (claude-*)
{
  model: "claude-sonnet-4-5",
  system: [
    { type: "text", text: "System prompt..." },
    // Cache blocks if using prompt caching
  ],
  messages: [
    { role: "user", content: [...] },
    { role: "assistant", content: [...] },
    { role: "user", content: [...] },
  ],
  max_tokens: 16384,
  thinking: { type: "enabled", budget_tokens: 10000 },  // If thinking enabled
  tools: [
    { name: "bash", input_schema: {...} },
    // ... all active tools
  ],
}

// OpenAI API (gpt-4o)
{
  model: "gpt-4o",
  system: "System prompt...",
  messages: [...],
  max_tokens: 16384,
  tools: [...],
}

// Google Gemini
{
  model: "gemini-2-0-flash",
  system_instruction: { parts: [{ text: "System prompt..." }] },
  contents: [...],
  tools: [...],
}
```

### Message Conversion

Session messages are converted to provider format:

```
AgentMessage (pi's format)
  ↓
Provider-specific format (Anthropic/OpenAI/Google)
  ↓
JSON serialized
  ↓
Sent to provider
```

### Tool Definitions

Each tool is converted to provider-specific format:

```typescript
// Input schema from pi.registerTool({ parameters: Type.Object({...}) })
{
  name: "bash",
  description: "Execute shell commands",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string" },
      timeout: { type: "number" }
    },
    required: ["command"]
  }
}
```

### Thinking Configuration

If thinking is enabled (default off):

```typescript
// Anthropic (supports thinking)
{
  thinking: {
    type: "enabled",
    budget_tokens: 10240  // From thinkingBudgets setting or model default
  }
}

// OpenAI (extended thinking)
{
  thinking: {
    type: "enabled",
    budget_tokens: 8000
  }
}

// Google (not supported)
// Thinking is added as a separate message role pre-call
```

### Reserved Token Calculation

Tokens reserved for LLM response:

```
Available tokens = contextWindow - reserveTokens
```

Default `reserveTokens`: 16384 tokens (configurable in settings)

This is used to:
1. Determine compaction threshold
2. Calculate `max_tokens` for LLM response

---

## Stage 8: Before Provider Request (Final Interception)

### Trigger
After provider payload is built, right before request is sent.

### Event Signature: `before_provider_request`

```typescript
interface BeforeProviderRequestEvent {
  payload: Record<string, any>;  // Complete provider payload
}

// Handler return type
type BeforeProviderRequestResult = 
  | void                         // Keep payload unchanged
  | Record<string, any>;         // Replace entire payload
```

### Handler Signature

```typescript
pi.on("before_provider_request", (event, ctx) => {
  // event.payload - complete provider-specific payload
  // Can inspect or modify
  
  console.log(JSON.stringify(event.payload, null, 2));
  
  // Optional: replace payload
  // return { ...event.payload, temperature: 0 };
});
```

### Chaining
- Handlers run in extension load order
- Each handler's return value becomes next handler's input
- `undefined` keeps current payload
- Any other value replaces payload

### Use Cases
- Inspect what's being sent to provider
- Modify temperature, max_tokens, etc.
- Log payloads for debugging
- Replace payload entirely (proxy, override)

### Important Notes
- Last chance to modify before LLM call
- This is the actual payload the provider receives
- No validation after modification
- Errors in payload may not be caught until provider responds

---

## Stage 9: LLM Response & Tool Execution

### Tool Execution Events

```
Assistant response arrives with tool calls
  ↓
For each tool call (in parallel or sequentially):
  ├─ tool_execution_start
  ├─ tool_call (can block)
  ├─ Tool executes
  ├─ tool_execution_update (streaming)
  ├─ tool_result (can modify result)
  └─ tool_execution_end
  ↓
Tool results sent back to LLM
```

### Event Signature: `tool_call`

```typescript
interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  input: Record<string, any>;  // Mutable - affects execution
}

// Handler return type
type ToolCallResult = {
  block: boolean;              // true = don't execute
  reason?: string;             // Why it was blocked
} | void;
```

### Handler Signature

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  // event.toolName - name of tool being called
  // event.toolCallId - unique ID for this call
  // event.input - mutable parameters
  
  // Block dangerous commands
  if (isToolCallEventType("bash", event)) {
    if (event.input.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command" };
    }
    // Or mutate to inject prefix
    event.input.command = `set -e\n${event.input.command}`;
  }
});
```

### Event Signature: `tool_result`

```typescript
interface ToolResultEvent {
  toolName: string;
  toolCallId: string;
  input: Record<string, any>;
  content: (TextContent | ImageContent)[];
  details?: any;
  isError: boolean;
}

// Handler return type
type ToolResultResult = {
  content?: (TextContent | ImageContent)[];
  details?: any;
  isError?: boolean;
};
```

### Handler Signature

```typescript
pi.on("tool_result", async (event, ctx) => {
  // event.toolName - which tool ran
  // event.content - output text/images
  // event.details - metadata
  // event.isError - whether tool errored
  
  // Modify result (chained middleware style)
  if (event.toolName === "bash") {
    const enhanced = await enhanceOutput(event.content);
    return { content: enhanced };
  }
});
```

### Chaining
- Handlers run in extension load order
- Each handler sees latest result after previous handler changes
- Partial returns merge with current state
- Later handlers see all previous modifications

### Side Effects
- Tool result message appended to session
- Modified result sent to LLM (not original)
- Session state reflects actual sent content

---

## Stage 10: Turn Completion & Message Storage

### Trigger
After all tool calls complete and before next LLM call.

### What Gets Saved to Session

```
For each turn:
  ├─ AssistantMessage (with thinking if enabled)
  ├─ For each tool call result:
  │  └─ ToolResultMessage
  └─ All stored to session JSONL

After all tool results:
  └─ New turn_end event fired
```

### Session Message Entry Format

```json
{
  "type": "message",
  "id": "entry_id",
  "parentId": "previous_entry_id",
  "timestamp": "2024-12-03T14:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "Response..." },
      { "type": "toolCall", "id": "call_1", "name": "bash", "arguments": {...} }
    ],
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "usage": { "input": 1000, "output": 200, ... },
    "stopReason": "toolUse",
    "timestamp": 1701619200000
  }
}
```

### Persistence

- Entry written atomically to session JSONL
- Tree structure updated (parentId points to previous entry)
- Session file location: `~/.pi/agent/sessions/--<cwd_hash>--/<timestamp>_<uuid>.jsonl`
- **Does not trigger compaction** (that's on next user prompt)

### Event Signature: `turn_end`

```typescript
interface TurnEndEvent {
  turnIndex: number;
  message: AssistantMessage;
  toolResults: ToolResultMessage[];
}
```

### Handler Signature

```typescript
pi.on("turn_end", async (event, ctx) => {
  // event.turnIndex - which turn (0-based)
  // event.message - assistant response
  // event.toolResults - all tool results from this turn
  
  // Can react to turn completion
  // Cannot modify messages (they're already saved)
});
```

---

## Stage 11: Compaction Check & Optional Auto-Compaction

### Trigger
When next user prompt arrives, before agent starts.

### Compaction Threshold

Auto-compaction triggers when:

```
estimatedTokens > contextWindow - reserveTokens
```

Where:
- `contextWindow` = model's context window (e.g., 200,000 for Claude)
- `reserveTokens` = configured or default 16,384 tokens
- `estimatedTokens` = token estimate for all messages + system prompt

### Compaction Settings

From `~/.pi/agent/settings.json` or `.pi/settings.json`:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

- **`enabled`**: true = auto-compact when threshold hit
- **`reserveTokens`**: tokens to keep free for response (triggers at `contextWindow - this`)
- **`keepRecentTokens`**: how many recent tokens to preserve (not compacted)

### Event Signature: `session_before_compact`

```typescript
interface SessionBeforeCompactEvent {
  preparation: CompactionPreparation;
  branchEntries: SessionEntry[];
  customInstructions?: string;
  signal: AbortSignal;
}

interface CompactionPreparation {
  messagesToSummarize: AgentMessage[];  // Messages being summarized
  turnPrefixMessages: AgentMessage[];   // Split turn prefix (if any)
  previousSummary?: string;             // Previous compaction summary
  fileOps: { readFiles: string[]; modifiedFiles: string[] };
  tokensBefore: number;
  firstKeptEntryId: string;
  isSplitTurn: boolean;
  settings: CompactionSettings;
}

// Handler return type
type SessionBeforeCompactResult = {
  cancel?: boolean;             // Cancel compaction
  compaction?: {                // Or provide custom summary
    summary: string;
    firstKeptEntryId: string;
    tokensBefore: number;
    details?: any;
  };
};
```

### Handler Signature

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;
  
  // Cancel if you want
  if (shouldNotCompact()) {
    return { cancel: true };
  }
  
  // Or provide custom summary
  if (wantCustomSummary()) {
    const summary = await generateCustomSummary(preparation);
    return {
      compaction: {
        summary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        tokensBefore: preparation.tokensBefore,
        details: { /* your custom data */ },
      }
    };
  }
  
  // Or let default run
});
```

### Default Compaction Process

If no extension cancels or provides custom summary:

1. **Walk backwards** from newest message to accumulate tokens
2. **Stop at** `keepRecentTokens` (default 20,000)
3. **Collect messages** from previous boundary to this point for summarization
4. **Generate summary** via LLM with structured prompt:

```markdown
## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements mentioned by user]

## Progress
### Done
- [x] [Completed tasks]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [What should happen next]

## Critical Context
- [Data needed to continue]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

5. **Append CompactionEntry** with:
   - `summary`: LLM-generated summary
   - `firstKeptEntryId`: where to resume from
   - `tokensBefore`: token count before compaction
   - `details`: file operations (default) or custom data (from extension)

### Compaction Entry Structure

```json
{
  "type": "compaction",
  "id": "comp_1234",
  "parentId": "prev_entry",
  "timestamp": "2024-12-03T14:10:00.000Z",
  "summary": "User discussed X, Y, Z. Decided to use approach A because B was slower.",
  "firstKeptEntryId": "entry_5678",
  "tokensBefore": 95000,
  "details": {
    "readFiles": ["src/main.ts", "src/utils.ts"],
    "modifiedFiles": ["src/main.ts"]
  }
}
```

### What Gets Sent to LLM After Compaction

```
[System Prompt]
[Summary Message (from CompactionEntry)]
[Messages from firstKeptEntryId onwards]
[New user prompt]
```

### Event Signature: `session_compact`

```typescript
interface SessionCompactEvent {
  compactionEntry: CompactionEntry;
  fromExtension: boolean;  // true if extension provided it
}
```

### Handler Signature

```typescript
pi.on("session_compact", async (event, ctx) => {
  // React to compaction completion
  // event.compactionEntry - the saved compaction
  // event.fromExtension - whether extension provided custom summary
});
```

---

## Complete Message Flow Example

### Scenario: 3-turn conversation with compaction

```
Turn 1: User prompt → LLM response with tool calls → Tool results → Saved to session
Turn 2: User prompt → Compaction triggered → LLM response → Saved to session  
Turn 3: User prompt → LLM response → Saved to session
```

### Session JSONL file contents

```json
{"type":"session","version":3,"id":"uuid-123","cwd":"/project","timestamp":"2024-12-03T14:00:00Z"}
{"type":"message","id":"m1","parentId":null,"timestamp":"2024-12-03T14:00:01Z","message":{"role":"user","content":"Start coding"}}
{"type":"message","id":"m2","parentId":"m1","timestamp":"2024-12-03T14:00:02Z","message":{"role":"assistant","content":[...]}}
{"type":"message","id":"m3","parentId":"m2","timestamp":"2024-12-03T14:00:03Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"read"}}
{"type":"message","id":"m4","parentId":"m3","timestamp":"2024-12-03T14:00:04Z","message":{"role":"user","content":"Next step"}}
{"type":"compaction","id":"comp1","parentId":"m4","timestamp":"2024-12-03T14:05:00Z","summary":"User started with...","firstKeptEntryId":"m4","tokensBefore":50000}
{"type":"message","id":"m5","parentId":"comp1","timestamp":"2024-12-03T14:05:01Z","message":{"role":"assistant","content":[...]}}
{"type":"message","id":"m6","parentId":"m5","timestamp":"2024-12-03T14:05:02Z","message":{"role":"user","content":"Final step"}}
{"type":"message","id":"m7","parentId":"m6","timestamp":"2024-12-03T14:05:03Z","message":{"role":"assistant","content":[...]}}
```

### What LLM Sees on Each Turn

**Turn 1 (before compaction):**
```
[System Prompt]
[User: Start coding]
```

**Turn 2 (compaction triggers):**
```
[System Prompt]
[CompactionSummary from comp1]
[User: Next step]  ← messages from firstKeptEntryId onwards
```

**Turn 3:**
```
[System Prompt]
[CompactionSummary from comp1]
[User: Next step]
[Assistant: ...]
[User: Final step]
```

---

## Extension Hook Reference

### All Events in Order of Occurrence

| Event | Timing | Modifies | Return Value |
|-------|--------|----------|--------------|
| `session_directory` | CLI startup | session dir | `{ sessionDir: string }` |
| `session_start` | Session loaded | — | — |
| `input` | User types | text/images | `{ action: "continue" \| "transform" \| "handled" }` |
| `before_agent_start` | Before agent | system prompt, inject message | `{ systemPrompt?, message? }` |
| `agent_start` | Agent begins | — | — |
| `message_start` | Message starts | — | — |
| `turn_start` | Turn begins | — | — |
| `context` | Before LLM call | messages | `{ messages? }` |
| `before_provider_request` | Payload ready | payload | `Record<string, any> \| void` |
| `tool_execution_start` | Tool starts | — | — |
| `tool_call` | Before tool runs | tool input | `{ block?, reason? } \| void` |
| `tool_execution_update` | Tool streaming | — | — |
| `tool_result` | After tool finishes | result | `{ content?, details?, isError? }` |
| `tool_execution_end` | Tool done | — | — |
| `turn_end` | Turn complete | — | — |
| `agent_end` | Agent finishes | — | — |
| `session_before_compact` | Compaction check | compaction | `{ cancel?, compaction? }` |
| `session_compact` | Compaction done | — | — |

---

## Token Accounting & Context Window

### Token Estimation

Pi estimates tokens for:
- System prompt
- All messages (user, assistant, tool results)
- Tool schemas
- Think tokens (if enabled)

### Available Tokens

```
Available = ContextWindow - ReserveTokens
```

Example:
```
Claude 3.5 Sonnet:
  ContextWindow: 200,000
  ReserveTokens: 16,384 (configured)
  Available: 183,616
  
When tokens exceed available:
  → Compaction triggered
  → Old messages summarized and removed
  → Context reset to fit within window
```

### Compaction Trigger Point

```typescript
if (estimatedTokens > contextWindow - reserveTokens) {
  // TRIGGER COMPACTION
  // Cut point found by walking backwards to keepRecentTokens
  // Default keepRecentTokens: 20,000
}
```

### Thinking Tokens

Thinking is budget-limited separately:

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10240
  }
}
```

From settings:
```json
{
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768,
    "xhigh": 65536
  }
}
```

---

## Key Design Principles

### 1. Non-Destructive Extension Modifications

- Context event: extensions receive deep copy, session unaffected
- tool_call: mutations affect only this execution
- tool_result: chaining middleware style
- before_agent_start: system prompt is re-assembled each turn

### 2. Session Persistence

- Every message/compaction/summary saved to JSONL immediately
- Tree structure allows branching at any point
- Full history available via `/tree` command
- No out-of-band state required

### 3. Progressive Disclosure

- Skill descriptions in system prompt by default
- Full SKILL.md loaded on-demand via `read` tool
- Extensions can check what's in context via `context` event
- Custom tools advertised via promptSnippet

### 4. Compaction Preserves Context

- Recent messages always kept (keepRecentTokens)
- Older content summarized by LLM, not truncated
- File operations accumulated across compactions
- Branch context preserved via branch_summary entries

### 5. Multi-Provider Transparency

- payload before sending visible via before_provider_request
- Same events for Anthropic, OpenAI, Google, custom providers
- Provider-specific formatting happens late (stage 7)
- Extensions work across all providers

---

## Common Extension Patterns

### Pattern 1: Add Context at Turn Time

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    message: {
      customType: "my-ext",
      content: "Additional context based on session state",
      display: true,
    }
  };
});
```

### Pattern 2: Gate Dangerous Operations

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (isDangerous(event.toolName, event.input)) {
    const ok = await ctx.ui.confirm("Really?", "This operation is dangerous");
    if (!ok) return { block: true, reason: "User declined" };
  }
});
```

### Pattern 3: Custom Compaction

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  const summary = await myModel.summarize(preparation.messagesToSummarize);
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { custom: "data" },
    }
  };
});
```

### Pattern 4: Filter Messages

```typescript
pi.on("context", async (event, ctx) => {
  // Remove sensitive information
  const filtered = event.messages.filter(m => {
    if (m.role === "toolResult" && m.toolName === "bash") {
      return !containsSensitive(m.content);
    }
    return true;
  });
  return { messages: filtered };
});
```

### Pattern 5: Stateful Tool with Persistence

```typescript
let state = {};

export default function (pi: ExtensionAPI) {
  // Restore state on session load
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "my-tool") {
        state = entry.data;
      }
    }
  });

  // Execute tool
  pi.registerTool({
    name: "my_tool",
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      state.count++;
      
      // Persist state for next session
      pi.appendEntry("my-tool", state);
      
      return {
        content: [{ type: "text", text: `Count: ${state.count}` }],
        details: state
      };
    }
  });
}
```

---

## Troubleshooting Context Issues

### Q: Why doesn't my modification appear in the LLM's response?

**Check:**
1. Did you modify in the right event? (`before_agent_start`, `context`, `before_provider_request`)
2. Did you return the modified value?
3. Is your extension loading? (check `/extensions` or logs)
4. Are changes being chained correctly?

### Q: Tool result got truncated, what happened?

**Default limits:**
- 2000 lines max
- 50KB max
- Tool results in compaction are further truncated to 2000 chars

Use `truncateHead` or `truncateTail` utilities to control truncation.

### Q: Compaction happened but my messages are gone

**This is expected.** Messages before `firstKeptEntryId` are intentionally removed and replaced by summary. Only the summary is sent to the LLM for the compacted section.

Check `/tree` to see full history (not sent to LLM but preserved in session).

### Q: Extensions can't communicate

**Isolation problem.** Each extension loads in its own jiti context. Use:
- `globalThis + Symbol.for()` for shared APIs
- `pi.events` for event coordination
- `pi.appendEntry()` for session-based state sharing

### Q: Need to inspect what's being sent to provider

Use `before_provider_request` event:

```typescript
pi.on("before_provider_request", (event, ctx) => {
  console.log(JSON.stringify(event.payload, null, 2));
});
```

---

## Final Summary

Pi's context pipeline is a sophisticated, extensible system that:

1. **Captures input** via events (can intercept/transform)
2. **Expands skills/templates** (injected into context)
3. **Builds system prompt** from tools, skills, custom additions
4. **Loads session messages** from JSONL tree (with compaction logic)
5. **Allows filtering** via context event
6. **Formats for provider** (Anthropic/OpenAI/Google/custom)
7. **Intercepts before send** for final modifications
8. **Executes tools** with blocking/modification points
9. **Processes results** with chaining middleware
10. **Persists to session** (JSONL with full history)
11. **Auto-compacts** when needed (with LLM-generated summaries)
12. **Branching support** via tree structure and branch summaries

Every stage can be intercepted and modified by extensions without breaking the core flow. Session state is persistent and survives restarts, compactions, and branches.
