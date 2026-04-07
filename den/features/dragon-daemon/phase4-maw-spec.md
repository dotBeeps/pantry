# Phase 4 — Maw Spec

## What it is

**Maw** — the dragon's mouth. A body that talks to dot.

The daemon runs in the background, thinking thoughts and writing to the vault. Maw is how dot watches. It's an HTTP+SSE body inside `dragon-daemon` that exposes the daemon's inner life to a Qt/QML desktop window. The window is read-mostly: dot can see everything the daemon does and send it a direct message, nothing more.

Impulse mode (persona-voice rewrite before injection) is intentionally excluded — that's an agent-to-agent channel, not a dot-to-agent channel.

---

## Repository layout

```
hoard/
├── dragon-daemon/
│   └── internal/body/maw.go    ← daemon-side HTTP+SSE body
└── maw/                         ← Qt/QML desktop app
    ├── CMakeLists.txt
    ├── main.cpp
    ├── main.qml
    └── qml/
        ├── ThoughtStream.qml
        ├── StatePanel.qml
        ├── InputBar.qml
        └── MawConnection.qml   ← QNetworkReply SSE client
```

---

## Daemon body: `internal/body/maw.go`

Implements `body.Body` (Start/Stop lifecycle).

**On Start:**
1. Registers `OutputCapture` hook — every `think`/`speak`/text-block the thought cycle produces is broadcast as a `thought` SSE event.
2. Starts `net/http` server on configurable port (default `:7432`, `hoard.maw.port` in settings).
3. Registers with daemon body registry.

**On Stop:**
1. Drains SSE clients gracefully.
2. Closes listener.

### Routes

| Method | Path | Response |
|---|---|---|
| `GET` | `/stream` | SSE event stream (keep-alive, `text/event-stream`) |
| `GET` | `/state` | Current snapshot (JSON) |
| `POST` | `/message` | Direct input injection |

### SSE event shapes

```json
// Thought output — from OutputCapture hook
{"type": "think",  "text": "...", "persona": "ember"}
{"type": "speak",  "text": "..."}
{"type": "text",   "text": "..."}

// Observation arriving — from body sensory events
{"type": "observe", "text": "...", "body": "hoard"}

// Heartbeat
{"type": "beat", "event": "start"}
{"type": "beat", "event": "end"}

// State change — emitted on any change to attention, bodies, contracts
{"type": "state", "attention": 72, "bodies": ["hoard"], "contracts": [...]}
```

### State snapshot

```json
{
  "attention": 72,
  "bodies": [
    {"name": "hoard", "status": "active"},
    {"name": "maw",   "status": "active"}
  ],
  "contracts": [
    {"id": "minimum-rest",       "status": "ok"},
    {"id": "attention-honesty",  "status": "ok"},
    {"id": "framing-honesty",    "status": "warning"}
  ],
  "lastBeat": "2026-04-07T14:32:00Z",
  "memoryToday": 14
}
```

### Settings

```json
{
  "hoard": {
    "maw": {
      "enabled": true,
      "port": 7432,
      "allowedOrigins": ["http://localhost"]
    }
  }
}
```

---

## Qt app: `maw/`

**Tech:** Qt 6 + QML. Native SSE client via `QNetworkAccessManager` + streaming `QNetworkReply` read loop — no WebEngine.

### Three views

#### 1. Thought Stream (main pane)
Scrolling live feed of daemon output. Entries are type-coded by icon and colour:

| Type | Icon | Colour |
|---|---|---|
| `think` | 💭 | muted purple |
| `speak` | 🔥 | amber |
| `text` | — | default |
| `observe` | 👁️ | teal, body tag shown |
| `beat` | ✅ / pulse | grey |

Auto-scrolls to bottom unless dot has scrolled up (standard terminal behavior).

#### 2. State Panel (right sidebar)
- Attention gauge — animated `NumberAnimation` arc
- Body list — name + coloured status dot
- Contract list — name + 🟢🟡🔴 based on status field
- Last beat time (relative: "3s ago")
- Memory count today

#### 3. Input Bar (bottom strip)
Single-line text input. Enter → `POST /message {"text": "..."}`. Mode label shows "direct". No impulse mode.

---

## Sub-phases

### Phase 4A — Maw body
`internal/body/maw.go` with:
- HTTP server lifecycle (Start/Stop)
- SSE broadcaster with client registry
- `OutputCapture` hook → thought events
- `GET /stream`, `GET /state`, `POST /message`
- State snapshot builder (reads ledger + body registry + enforcer)
- Tests for route handlers and SSE broadcast

### Phase 4B — Qt scaffold + thought stream
- `maw/CMakeLists.txt` with Qt6::Quick, Qt6::Network
- `main.cpp` + `main.qml` skeleton
- `MawConnection.qml` — SSE client, reconnects on drop
- `ThoughtStream.qml` — `ListView` with type-coded delegates, auto-scroll

### Phase 4C — State panel
- `StatePanel.qml` — attention arc, body list, contract indicators
- Wired to `MawConnection` state events (not polling)

### Phase 4D — Input bar
- `InputBar.qml` — single-line input, POST /message on Enter
- Visual feedback on send (brief highlight)

---

## Open questions (deferred)

- **Authentication** — maw serves localhost only for now. If daemon runs on a remote machine, we need token auth on `/stream` and `/message`.
- **Observation events** — bodies need a hook point to emit to the SSE broadcaster. May require a small addition to the sensory event pipeline.
- **Contract status changes** — the enforcer doesn't currently emit live events; state panel will poll `/state` on beat events as a starting point.
