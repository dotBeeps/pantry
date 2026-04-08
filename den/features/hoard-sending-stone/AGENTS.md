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
  SSE stream             stone_send tool (whitelisted for all jobs)
  stone_send tool
  Custom renderer        
```

- Server starts on extension load (survives `/reload`)
- Port written to `~/.pi/hoard-sending-stone.json`
- `HOARD_STONE_PORT` env var passed to allies via spawn.ts
- `HOARD_ALLY_DEFNAME` env var identifies the ally
- All communication local (`127.0.0.1`), no auth

## Message Format

```typescript
interface StoneMessage {
  id: string;
  from: string;           // ID: "primary-agent", "silly-kobold-scout", etc.
  displayName?: string;   // Friendly: "Ember 🐉", "Kestrel", etc.
  addressing: string;     // "primary-agent" | "user" | "guild-master" | "session-room" | ally defName
  type: "result" | "progress" | "question" | "check_in" | "status";
  content: string;
  color?: string;         // deprecated — color derived from name
  metadata?: unknown;
  timestamp: number;
}
```

## Addressing & Turn Triggering

| Addressing | Who sees it | Triggers agent turn? |
|-----------|-------------|---------------------|
| `"primary-agent"` | Agent (Ember) | If `type` is `"question"`, `"result"`, or `"status"` |
| `"user"` | User (dot) | Never |
| `"guild-master"` | Maren | Never (future) |
| `"session-room"` | Everyone | If `type` is `"question"`, `"result"`, or `"status"` |
| ally defName | Specific ally | Never |

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
├── index.ts    — extension entry: server lifecycle, SSE, renderer, stone_send tool
├── server.ts   — HTTP server (Node.js built-in, zero deps)
├── client.ts   — thin POST client for subagents
└── types.ts    — StoneMessage, StoneAPI, STONE_KEY
```

## Integration Points

- **spawn.ts** — passes `HOARD_STONE_PORT` + `HOARD_ALLY_DEFNAME` to ally processes
- **quest-tool.ts** — fire-and-forget dispatch when stone available; `postResultToStone` on ally completion
- **hoard-allies/index.ts** — stone message handler: try immediate `sendMessage`, fall back to queue for next turn
- **dragon-guard** — `stone_send` whitelisted for all ally jobs
