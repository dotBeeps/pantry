# hoard-sending-stone — Feature Spec

> **Part of [Hoard](../../../AGENTS.md)** — the dragon's monorepo.
> **Status:** 🔥 beta — implemented and working
> **Lives in:** `berrygems/extensions/hoard-sending-stone/`

---

## What It Is

A local cross-agent communication bus for pi sessions. The primary session runs an HTTP/SSE server; subagent sessions connect as clients. Messages are structured, addressed, and rendered with per-agent colors in bordered boxes.

**Primary use case (working):** Async quest results. Quest tool dispatches allies and returns immediately. Each ally POSTs its result home via the stone. Results appear as bordered boxes in the primary session with themed colors per agent tier.

**Secondary use case (working):** Allies can send custom messages via the `stone_send` tool — questions to the primary agent, status updates to the user, messages to specific allies.

**Future use case:** Maren (quest coordinator) conducting budget interviews and streaming phase results.

---

## Architecture

```
Primary (Ember)          Subagent (ally)
  HTTP server ◄──POST── stone client (reads HOARD_STONE_PORT from env)
  SSE stream ───────► SSE listener (filters by addressing)
  stone_send tool        stone_send tool (progress, questions)
  stone messages         stone_receive tool (poll for replies)
  Custom renderer        tool_result injection (passive message delivery)
```

- Server starts on extension load (survives `/reload`)
- Port written to `~/.pi/hoard-sending-stone.json`
- `HOARD_STONE_PORT` env var passed to allies via spawn.ts
- `HOARD_ALLY_DEFNAME` env var identifies the ally
- All communication local (`127.0.0.1`), no auth

### Bidirectional Dialog (new)

Ally sessions now subscribe to the primary's SSE stream and can receive messages mid-task:

1. **SSE subscription** — ally connects to `GET /stream` on init, filters for messages addressed to its defName or `session-room`
2. **stone_receive tool** — ally-only tool that polls pending message buffer (200ms interval, max 120s wait)
3. **tool_result injection** — pending stone messages passively appended to any tool result (except stone_receive)
4. **SSE cleanup** — ally SSE connection destroyed on `session_shutdown`

Dialog pattern: ally sends question via `stone_send` → calls `stone_receive(wait: 60)` → primary answers via `stone_send(to: defName)` → ally receives reply and continues.

## Message Format

```typescript
interface StoneMessage {
  id: string;
  from: string; // ID: "primary-agent", "silly-kobold-scout", etc.
  displayName?: string; // Friendly: "Ember 🐉", "Kestrel", etc.
  addressing: string; // "primary-agent" | "user" | "guild-master" | "session-room" | ally defName
  type: "result" | "progress" | "question" | "check_in" | "status";
  content: string;
  color?: string; // deprecated — color derived from name
  metadata?: unknown;
  timestamp: number;
}
```

## Addressing & Turn Triggering

| Addressing        | Who sees it   | Triggers agent turn?                                 |
| ----------------- | ------------- | ---------------------------------------------------- |
| `"primary-agent"` | Agent (Ember) | If `type` is `"question"`, `"result"`, or `"status"` |
| `"user"`          | User (dot)    | Never                                                |
| `"guild-master"`  | Maren         | Never (future)                                       |
| `"session-room"`  | Everyone      | If `type` is `"question"`, `"result"`, or `"status"` |
| ally defName      | Specific ally | Never                                                |

**Turn triggering by message type:**

- `question` — ally needs help → triggers turn
- `result` — ally completed quest → triggers turn
- `status` — frozen/stuck alert → triggers turn
- `progress` — regular check-in heartbeat → non-triggering, renders when possible

## Rendering

**User sees:** Bordered box with truecolor per-agent names, word-wrapped to terminal width, truncated at `hoard.stone.maxLines` (default 8).

```
╭── 💬 Kestrel → Ember 🐉 (2:33 PM) ────────────────────╮
│ message content here, properly word-wrapped              │
│ to terminal width with consistent borders                │
╰──────────────────────────────────────────────────────────╯
```

**Agent sees:** Structured markdown with all fields mapped:

```
**Stone Message**
- **From:** Kestrel (clever-kobold-scout)
- **To:** Ember 🐉 (primary-agent)
- **Time:** 2:33 PM
- **Message:** content here
```

## Color System

Per-agent truecolor derived from display name hash + noun tier base hue:

- Kobold: green range (hue ~120°)
- Griffin: blue range (hue ~220°)
- Dragon: magenta range (hue ~280°)
- Primary agent: gold range (hue ~45°)
- User: cyan range (hue ~185°)
- Guild master: amber range (hue ~35°)

Each ally gets a ±30° offset based on their name hash, so allies of the same tier are distinguishable.

## Server Endpoints

```
POST /message    body: Partial<StoneMessage>  (id + timestamp added by server)
GET  /stream     SSE stream (all messages broadcast to all subscribers)
GET  /health     { status: "ok", port, messageCount }
```

## Files

```
berrygems/extensions/hoard-sending-stone/
├── index.ts    — extension entry: server lifecycle, SSE, stone_send/stone_receive tools, ally SSE subscription, tool_result injection
├── server.ts   — HTTP server (Node.js built-in, zero deps)
├── client.ts   — thin POST client for subagents
├── renderer.ts — bordered message rendering with per-agent truecolor
└── types.ts    — StoneMessage, StoneAPI, STONE_KEY
```

## Tool Prompt Integration

Both `stone_send` and `stone_receive` (ally-only) include `promptSnippet` and `promptGuidelines` in their `registerTool()` calls. This is **required** for the tools to appear in pi's system prompt "Available tools" and "Guidelines" sections. Without them, extension tools are invisible to the LLM — it only sees bare XML schema blocks.

See `extension-designer` skill for the full pattern.

## Integration Points

- **spawn.ts** — passes `HOARD_STONE_PORT` + `HOARD_ALLY_DEFNAME` + `HOARD_ALLY_NAME` to ally processes
- **quest-tool.ts** — fire-and-forget dispatch when stone available; `postResultToStone` on ally completion; stone-aware check-in suppression tracks messages from active allies; heartbeat pulse (⏱ 15s) during active quests
- **hoard-allies/index.ts** — stone message handler: try immediate `sendMessage`, fall back to queue for next turn; `write_notes` tool for chunked exploration workflow; metadata passthrough for urgent messages
- **dragon-guard** — `stone_send`, `stone_receive`, `write_notes` whitelisted for all ally jobs
- **ally-status-tool.ts** — shows recent stone messages alongside stderr buffer in `ally_status` output

## @ Mentions & Urgency

`@Name` or `@everyone` in a stone_send message automatically sets `metadata.urgent: true`. The renderer responds with:

- Warm red-orange border (instead of dim)
- ⚡ badge in the message header
- Bold + urgent-colored highlighting on `@mentions` in content

Allies are instructed to treat urgent messages as "drop what you're doing" signals.

---

## CC-side Implementation (Stage 3) — in progress 2026-04-11

> **Status:** 🪨 planned — storybook-daemon currently registers `stone_send`, `stone_receive`, and `quest_status` as stubs. Any Claude Code ally calling `mcp__storybook-ember__stone_send` gets `{status: "not_implemented"}` and silently drops the message.

### Current state

The pi-side stone (documented above) is fully working inside a single pi process tree. The gap is cross-harness: Claude Code sessions can't participate, because the CC-side transport is MCP over stdio to `storybook-daemon`, and those three tool handlers were scaffolded but never implemented.

Evidence:

- `storybook-daemon/internal/psi/mcp/mcp.go:204-217` — `stone_send` / `stone_receive` / `quest_status` all wired to `b.handleStub`
- `storybook-daemon/internal/psi/mcp/mcp.go:361` — `handleStub` returns literal `{status: "not_implemented", message: "This tool is not yet implemented. It will be wired in a future phase."}`
- `cc-plugin/agents/ally-scout.md` and siblings reference these tools in their system prompts. They compile and dispatch but all message traffic goes to the stub — CC allies can't report results back to their parent CC session or to a pi primary.

### Scope change (2026-04-11)

Task #6 was originally "wire the stubs to the existing pi-side HTTP stone." During Stage 2 cross-model reliability work, dot approved expanding scope to include a native Go in-process broker inside `storybook-daemon` so the CC-side and pi-side can federate rather than one becoming a client of the other.

Rationale:

- The pi-side server is per-session and dies with the session. A CC session outlives any individual pi subagent, so a CC ally talking through the pi port is fragile when the pi primary exits mid-conversation.
- Federating at the daemon layer means the CC stone and the pi stone become peers, not master/slave. Primary and allies can be either harness.
- The in-process broker is ~200 lines and can reuse the existing `register_session` plumbing for scoping.

### Architecture

```
CC ally (claude-code)                    pi ally (pi json mode)
  stdio MCP tool call                      HOARD_STONE_PORT env var
    │                                         │
    ▼                                         ▼
storybook-daemon                          pi primary process
  broker (new)                              hoard-sending-stone server
  ├─ per-session rings                      ├─ POST /message
  ├─ subscribe channels                     ├─ GET /stream (SSE)
  └─ federation bridge ────────────────────►└─ GET /health
      (HTTP client to pi stone when
       a pi session has registered a
       room on the same session ID)
```

The daemon broker is authoritative for CC-side sessions; it forwards to the pi-side HTTP stone only when the same session ID is also registered by a pi primary (e.g. when a CC session spawns a pi primary that spawns allies).

### API shape

All three tools take an input object whose first field is `session_id: string` — scoped to the session registered via existing `register_session`. Messages are validated against the same `StoneMessage` schema documented above in the pi-side spec.

| Tool            | Input                                              | Output                                                                                |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `stone_send`    | `{session_id, from, to, type, content, metadata?}` | `{status: "sent", id, timestamp}`                                                     |
| `stone_receive` | `{session_id, addressed_to, wait_ms?, since_id?}`  | `{messages: StoneMessage[]}` (long-poll up to `wait_ms`, default 60s)                 |
| `quest_status`  | `{session_id, quest_id}`                           | `{status: "pending"\|"running"\|"done"\|"failed", result?, messages: StoneMessage[]}` |

### Per-session scoping

The `register_session` handler at `internal/psi/mcp/mcp.go:222` already tracks `b.sessions[input.SessionID]`. The broker extends that map entry with a per-session ring buffer and subscriber list. Unknown session IDs return an error — no implicit session creation, because stone messages without a room are meaningless.

### Files to add / touch

```
storybook-daemon/internal/psi/mcp/
├── mcp.go                — swap stone_send/stone_receive/quest_status off handleStub
├── stone_broker.go (new) — ring buffer, subscriber channels, federation dial
├── stone_types.go (new)  — Go mirror of StoneMessage schema
└── stone_broker_test.go (new) — table-driven tests for send/receive/quest_status

storybook-daemon/README.md — document the broker surface
```

### Reference implementation

The pi-side `berrygems/extensions/hoard-sending-stone/server.ts` is the design reference: single in-memory `Set<subscriber>`, broadcast on publish, SSE stream. The Go version replaces SSE with long-poll (MCP is request/response — no streaming), and Set with a per-session ring so late subscribers can replay recent history via `since_id`.

### Not in scope for Stage 3

- Multi-host federation (two daemons on different machines) — session ID collisions are impossible in practice, but handshake/auth design is deferred.
- Persistent storage of messages across daemon restarts — stone is ephemeral by design, matching the pi-side.
- Changing the existing pi-side HTTP stone — it stays as-is; the daemon broker is the second peer.

### Validation plan

1. Unit tests on `stone_broker.go` — send with unknown session → error, subscribe + send → delivery, `since_id` replay.
2. Parity harness quest using CC ally + pi primary pattern — extend `allies-parity/runner/run.ts` to spawn `claude` as ally.
3. Manual CC-to-CC quest with two cc-plugin ally definitions to verify in-process path without involving pi at all.
