# dragon-cubed 🐉³
Agentic control for Minecraft via a custom protocol stack + Baritone + NeoForge.

## The Vision
A high-level agentic bridge that lets LLMs control a Minecraft player with:
- **D3-Leylines** as the nervous system — player state, world telemetry, extension host
- **D3-Rumble** translating between Leylines and Baritone's goal system
- **D3-SoulGem** as the brain — agent dispatch, LLM prompt construction, pi integration

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  D3-SoulGem  (Go + optional Qt frontend)            │
│  · Agent dispatcher + monitor                       │
│  · LLM prompt construction from Leylines state      │
│  · Dynamic tool synthesis from reported capabilities │
│  · CLI commands + pi extension (tool interception)  │
└──────────────────────┬──────────────────────────────┘
                       │ JSON over WebSocket
┌──────────────────────▼──────────────────────────────┐
│  D3-Leylines  (NeoForge client-side mod)            │
│  · Player state + capability broadcast              │
│  · Command listener                                 │
│  · Extension host (NeoForge service interface)      │
│                                                     │
│  ├── D3-Rumble  (Baritone compat extension)         │
│  │   · Translates D3 commands → Baritone goals      │
│  │   · Emits goal lifecycle events (start/progress/ │
│  │     complete/fail) back through Leylines         │
│  │   · Exposes: ICustomGoalProcess, IMineProcess    │
│  │                                                  │
│  └── [chat/server events — core Leylines]           │
│      · Chat messages, join/leave, death, system     │
│      · Ambient world telemetry — always on          │
└─────────────────────────────────────────────────────┘
```

## Components

### D3-Leylines (NeoForge Mod)
The nervous system. Runs client-side as a NeoForge mod. Tracks player state and available capabilities, broadcasts over WebSocket, and listens for commands from SoulGem. Hosts the extension system via NeoForge service interfaces.

Chat and server event handling is **core** (not an extension) — it's ambient world telemetry and an agent without it is half-blind.

**Extension protocol:** On connect, Leylines sends a capability handshake listing all loaded extensions and their supported operations. SoulGem uses this to synthesize tool definitions dynamically.

### D3-Rumble (Leyline Extension)
Baritone compatibility layer. Registers as a Leylines extension and provides a translation layer between D3 commands and Baritone's Java API. Models Baritone's async goal system properly — emitting `goal:started`, `goal:progressed`, `goal:completed`, `goal:failed` events rather than fire-and-forget.

Exposes direct `ICustomGoalProcess` and `IMineProcess` access, avoiding chat command fragility entirely.

### D3-SoulGem (Go)
The orchestrator. Connects to Leylines over WebSocket and handles:
- **Dynamic tool synthesis** — on capability handshake, generates pi tool definitions matching what Leylines actually has loaded
- **LLM prompt construction** — converts Leylines state/events into well-structured prompts
- **Agent dispatch + monitoring** — manages agent lifecycle via pi
- **CLI** — command-line interface for inspecting and controlling agents
- **Pi extension** — registers tools with pi via command interception; LLM tool calls route through SoulGem → Leylines

Optional Qt frontend for visual agent monitoring and dispatch.

## Roadmap

### Phase 1: D3-Leylines Core
- [ ] Initialize NeoForge 1.21.x client-side mod in `leylines/`
- [ ] WebSocket server (Netty) with JSON message protocol
- [ ] Player state broadcaster (position, health, inventory, dimension)
- [ ] Chat + server event handling (core — not extension)
- [ ] Extension host (NeoForge service interface for extensions)
- [ ] Capability handshake on connect

### Phase 2: D3-Rumble
- [ ] NeoForge mod in `rumble/` that depends on Leylines
- [ ] Baritone API dependency + service registration
- [ ] Command → Baritone goal translation
- [ ] Async goal lifecycle events (start/progress/complete/fail)
- [ ] `ICustomGoalProcess` and `IMineProcess` support

### Phase 3: D3-SoulGem
- [ ] Go project scaffold in `soulgem/`
- [ ] WebSocket client connecting to Leylines
- [ ] Capability handshake parsing + dynamic tool synthesis
- [ ] Pi extension scaffold (tool interception → Leylines commands)
- [ ] LLM prompt construction from state/events
- [ ] Agent dispatch + monitoring
- [ ] CLI interface
- [ ] Optional Qt frontend

## Protocol

### Transport
JSON over WebSocket. LLM call latency dwarfs socket overhead — optimize for debuggability first.

### Capability Handshake (Leylines → SoulGem, on connect)
```json
{
  "type": "handshake",
  "version": "1.0.0",
  "extensions": [
    {
      "id": "d3-rumble",
      "version": "1.0.0",
      "capabilities": ["pathfind", "mine", "build", "follow", "goto"]
    }
  ],
  "core_capabilities": ["chat", "player_state", "inventory", "world_query"]
}
```

### State Broadcast (Leylines → SoulGem, periodic + on change)
```json
{
  "type": "state",
  "player": {
    "position": { "x": 0, "y": 64, "z": 0 },
    "health": 20.0,
    "food": 20,
    "dimension": "minecraft:overworld",
    "inventory": []
  }
}
```

### Command (SoulGem → Leylines)
```json
{
  "type": "command",
  "id": "cmd-uuid",
  "capability": "d3-rumble",
  "action": "pathfind",
  "params": { "x": 100, "y": 64, "z": 100 }
}
```

### Event (Leylines → SoulGem, async)
```json
{
  "type": "event",
  "cmd_id": "cmd-uuid",
  "event": "goal:progressed",
  "data": { "eta_ticks": 240 }
}
```
