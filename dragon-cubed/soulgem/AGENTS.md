# AGENTS.md — D3-SoulGem

Go orchestrator. Connects to D3-Leylines over WebSocket, synthesizes pi tool
definitions from the capability handshake, and bridges LLM tool calls to Minecraft.
Read `../AGENTS.md` first.

## Setup

```bash
cd soulgem/
go build ./...          # verify it compiles
go run . serve          # run against a live Leylines instance
```

Prerequisites: Go 1.23+. No other tooling required.

## Running

```bash
# Connect to Leylines on default ports, start API on :8766
go run . serve

# Custom addresses
go run . serve --leylines ws://localhost:8765/leylines --api :8766

# Build a binary
go build -o bin/soulgem .
./bin/soulgem serve
```

SoulGem exits cleanly on Ctrl+C (SIGINT/SIGTERM). Leylines reconnects automatically
on disconnect with a 3-second delay.

## Pi Extension

The pi extension is at `extension/soulgem.js`. Install it:

```bash
ln -s $(pwd)/extension/soulgem.js ~/.pi/extensions/soulgem.js
```

It fetches tool definitions from `GET /api/tools` at session start and registers them
with pi. Tool calls are forwarded to `POST /api/command` and block until Leylines
resolves the goal.

Set `SOULGEM_URL` to override the default `http://localhost:8766`:
```bash
SOULGEM_URL=http://localhost:9000 pi
```

## HTTP API

All endpoints on the API server (default `:8766`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Connection status + Leylines version |
| `GET` | `/api/tools` | Synthesized tool definitions (from current handshake) |
| `GET` | `/api/state` | Current PlayerState snapshot |
| `GET` | `/api/context` | Assembled LLM context string |
| `POST` | `/api/command` | Dispatch command → blocks until goal resolves |

### POST /api/command

Request:
```json
{ "capability": "d3-rumble", "action": "pathfind", "params": { "x": 100, "y": 64, "z": 100 } }
```

Response (success):
```json
{ "cmdId": "abc123", "completed": true, "event": "goal:completed", "data": {} }
```

Response (failure):
```json
{ "cmdId": "abc123", "completed": false, "event": "goal:failed", "data": { "reason": "path_calc_failed" } }
```

Command timeout: 90 seconds. Returns `504` if Leylines doesn't resolve in time.

## Package Structure

```
soulgem/
├── main.go                     ← entry point
├── cmd/
│   ├── root.go                 ← cobra root command
│   └── serve.go                ← `soulgem serve` — wires everything together
├── internal/
│   ├── leylines/
│   │   ├── client.go           ← reconnecting WebSocket client
│   │   ├── protocol.go         ← wire types (mirrors Messages.kt)
│   │   └── session.go          ← state, event history, pending command futures
│   ├── tools/
│   │   └── synthesizer.go      ← HandshakeMessage → []ToolDefinition
│   ├── prompt/
│   │   └── builder.go          ← PlayerState + events → LLM context string
│   └── api/
│       └── server.go           ← HTTP bridge for the pi extension
└── extension/
    └── soulgem.js              ← pi extension (symlink to ~/.pi/extensions/)
```

## Architecture Rules

- **`context.Context` is always the first parameter.** Never store it in a struct.
- **Wrap errors with context:** `fmt.Errorf("doing X: %w", err)` — never bare `err`.
- **`internal/leylines/protocol.go` is the source of truth for Go wire types** — keep it in sync with `leylines/src/main/kotlin/dev/dragoncubed/leylines/protocol/Messages.kt`.
- **`/api/command` blocks until goal resolves.** The 90-second timeout is in `session.go:commandTimeout`. Adjust if mining long sessions need more.
- **Tool synthesis is pure** — `SynthesizeFromHandshake` has no side effects; add new capability mappings in `tools/synthesizer.go` when Rumble gains capabilities.
- **The pi extension only calls SoulGem** — it never speaks directly to Leylines.

## Adding a New Capability

When D3-Rumble adds a new capability (e.g. `"build"`):
1. Add a case in `tools/synthesizer.go` → `rumbleToolFor("build")` with full ToolDefinition
2. The pi extension picks it up automatically on next session start (no JS changes needed)
3. Update this AGENTS.md capability docs

## Versions & Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `github.com/gorilla/websocket` | 1.5.3 | WebSocket client for Leylines |
| `github.com/spf13/cobra` | 1.9.1 | CLI framework |
| `golang.org/x/sync` | latest | `errgroup` for goroutine coordination |
| Go | 1.23+ | stdlib: `log/slog`, `net/http`, `encoding/json` |
