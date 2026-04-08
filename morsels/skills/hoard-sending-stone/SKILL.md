---
name: hoard-sending-stone
description: Send and receive messages between pi sessions via the hoard sending stone — a local HTTP/SSE communication bus. Use when you need to message another agent, ask for help, report results, or check in on allies.
---

# Sending Stone — Cross-Agent Communication

The sending stone is a local message bus that lets pi sessions talk to each other. The primary session runs an HTTP server; all other sessions connect as clients.

## Quick Reference

### Sending a message (any session)

```typescript
const stone = (globalThis as any)[Symbol.for("hoard.stone")];
if (stone) {
  await stone.send({
    from: "your-name",
    type: "question",
    addressing: "primary-agent",
    content: "Short message here",
  });
}
```

### When to call home

- You're **genuinely stuck** — tried your own tools first, still blocked
- You need a **decision** that isn't yours to make
- You have a **result** to report (quest tool handles this automatically)
- You want to **check in** on progress

### When NOT to call home

- Minor issues you can work around
- Status updates on tasks going smoothly (check-ins handle this)
- Asking permission for things in your job whitelist

## Message Format

**Always lead with a concise 1-2 liner:** what you're trying to do and what's blocking you. Only send longer explanations in follow-up messages if asked.

Good:
> "Trying to fetch Node.js IPC docs via defuddle but getting a 403. Should I try curl instead?"

Bad:
> "I was attempting to research inter-process communication mechanisms for Node.js and I started by trying to use the defuddle tool to fetch the documentation page at nodejs.org/api/net.html but unfortunately the server returned a 403 Forbidden status code which means..."

## Addressing

Messages use role-based addressing so the stone works for any hoard configuration.

| Value | Who sees it |
|-------|-------------|
| `"primary-agent"` | The primary agent running the session (e.g. Ember) |
| `"user"` | The user at the keyboard (e.g. dot) |
| `"guild-master"` | The quest coordinator (e.g. Maren), when running |
| `"session-room"` | Everyone — broadcast to all subscribers |
| ally defName | Direct message to a specific ally (e.g. `"wise-griffin-researcher"`) |

### Examples

```typescript
// Ask the primary agent for help
stone.send({ from: "my-name", type: "question", addressing: "primary-agent",
  content: "defuddle is 403ing on nodejs.org. Alternate approach?" });

// Report a result to the room
stone.send({ from: "my-name", type: "result", addressing: "session-room",
  content: "Research complete. HTTP/SSE recommended for local IPC." });

// Ask the user directly
stone.send({ from: "my-name", type: "question", addressing: "user",
  content: "Found two approaches. Want me to pick, or should I present both?" });

// Message a specific ally
stone.send({ from: "my-name", type: "status", addressing: "wise-griffin-coder",
  content: "Recon done — passing findings to you for implementation." });
```

## Message Types

| Type | When to use | Triggers agent turn? |
|------|-------------|---------------------|
| `question` | You need help or a decision | ✅ Yes |
| `result` | Task complete, here's what you found/built | ✅ Yes |
| `status` | Frozen/stuck alerts, important status changes | ✅ Yes |
| `progress` | Regular check-in heartbeats, milestone updates | ❌ No (renders when possible) |

## Receiving Messages

```typescript
const stone = (globalThis as any)[Symbol.for("hoard.stone")];
if (stone) {
  const unsubscribe = stone.onMessage((msg) => {
    // msg: { id, from, addressing, type, content, metadata?, timestamp }
    // Filter by addressing if you only want messages for you
  });
}
```

All sessions can subscribe to the SSE stream. Messages are broadcast to all subscribers — each session filters by `addressing` to decide what's relevant to them.

## Architecture

```
Primary (Ember)          Subagent (ally)          Guild-master (Maren)
  HTTP server ◄──POST── stone client    ◄──POST── stone client
  SSE stream ──────────► SSE listener   ──────────► SSE listener
```

- Server starts automatically in primary session
- Port passed to allies via `HOARD_STONE_PORT` env var
- All communication is local (`127.0.0.1`), no auth
- Messages are structured JSON (`StoneMessage` type)
- All subscribers see all messages — filtering is client-side

## TypeScript API (globalThis)

The sending stone exposes a programmatic API for other extensions:

```ts
import type { StoneAPI } from "berrygems/extensions/hoard-sending-stone/types.ts";
const stone = (globalThis as any)[Symbol.for("hoard.stone")] as StoneAPI | undefined;

// Subscribe to messages
const unsub = stone?.onMessage((msg) => {
  console.log(`${msg.from}: ${msg.content}`);
});

// Send a message
await stone?.send({
  from: "my-extension",
  type: "status",
  addressing: "primary-agent",
  content: "Hello from my extension",
});

// Get the server port
const port = stone?.port();
```

## Message Types

The valid message types are: `"question"`, `"status"`, `"result"`, `"progress"`. These are enforced by the stone_send tool schema.
