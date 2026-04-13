# Psi Core Shell + Ember Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build psi, a Qt 6 / QML desktop application that connects to the storybook-daemon via SSE and renders Ember's thought stream, plus rename `body` → `nerve` and `doggy` → `sse` in the daemon.

**Architecture:** Daemon-first thin client. Psi connects to the daemon's SSE endpoint for the thought stream and polls `/state` for attention snapshots. All state lives in the daemon — psi is a view layer. Two daemon-side renames land first since psi depends on the renamed SSE interface.

**Tech Stack:** Go (daemon renames), Qt 6 / QML / C++ (psi), CMake (build system)

**Spec:** `docs/superpowers/specs/2026-04-13-psi-core-shell-design.md`

---

## File Structure

### Daemon Renames

| Current Path                       | New Path                          | Change                                                                                      |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `internal/body/body.go`            | `internal/nerve/nerve.go`         | Rename dir+file, package `body` → `nerve`, interface `Body` → `Nerve`, type `ToolDef` stays |
| `internal/body/hoard/hoard.go`     | `internal/nerve/hoard/hoard.go`   | Rename parent dir, update import path                                                       |
| `internal/body/hoard/watcher.go`   | `internal/nerve/hoard/watcher.go` | Rename parent dir only (no body import)                                                     |
| `internal/sensory/types.go`        | (same)                            | `BodyState` → `NerveState`, `BodyStates` → `NerveStates`                                    |
| `internal/sensory/aggregator.go`   | (same)                            | Parameter name `bodies` → `nerves`                                                          |
| `internal/thought/cycle.go`        | (same)                            | Import path, `body.Body` → `nerve.Nerve`, field/param/func renames                          |
| `internal/daemon/daemon.go`        | (same)                            | Import paths, variable/function/log/comment renames                                         |
| `internal/persona/types.go`        | (same)                            | `BodyConfig` → `NerveConfig`, `Bodies` → `Nerves`, YAML tag `bodies` → `nerves`             |
| `personas/ember.yaml`              | (same)                            | `bodies:` → `nerves:`                                                                       |
| `personas/ember-local.yaml`        | (same)                            | `bodies:` → `nerves:`                                                                       |
| `personas/maren.yaml`              | (same)                            | `bodies: []` → `nerves: []`                                                                 |
| `internal/psi/doggy/doggy.go`      | `internal/psi/sse/sse.go`         | Rename dir+file, package `doggy` → `sse`, all string literals                               |
| `internal/psi/doggy/doggy_test.go` | `internal/psi/sse/sse_test.go`    | Rename dir+file, package `doggy_test` → `sse_test`, import path                             |
| `internal/psi/psi.go`              | (same)                            | Comment update only                                                                         |
| `internal/daemon/daemon.go`        | (same)                            | Import alias `psidoggy` → `psisse`, switch case, error string                               |
| `internal/persona/types.go`        | (same)                            | Comment `// doggy \| mcp` → `// sse \| mcp`                                                 |
| `personas/*.yaml`                  | (same)                            | `type: doggy` → `type: sse`, `id: doggy` → `id: sse`                                        |

### Psi Application (all new files)

| File                          | Responsibility                                       |
| ----------------------------- | ---------------------------------------------------- |
| `psi/CMakeLists.txt`          | Qt 6 project config: Quick, Network, QuickControls2  |
| `psi/src/main.cpp`            | QML engine setup, C++ type registration, wiring      |
| `psi/src/sseconnection.h`     | SSE client class declaration                         |
| `psi/src/sseconnection.cpp`   | SSE streaming, reconnect with backoff, event parsing |
| `psi/src/thoughtmodel.h`      | QAbstractListModel declaration                       |
| `psi/src/thoughtmodel.cpp`    | Append-only thought event list model                 |
| `psi/src/daemonstate.h`       | Daemon state Q_PROPERTY model declaration            |
| `psi/src/daemonstate.cpp`     | State polling, SSE state event handling              |
| `psi/src/themeengine.h`       | Persona palette provider declaration                 |
| `psi/src/themeengine.cpp`     | Ember color palette as Q_PROPERTYs                   |
| `psi/qml/Main.qml`            | Window frame with layout regions                     |
| `psi/qml/SessionRail.qml`     | Left icon strip (48px)                               |
| `psi/qml/ConnectionBar.qml`   | Top connection health strip                          |
| `psi/qml/ThoughtStream.qml`   | Center ListView for thoughts                         |
| `psi/qml/ThoughtDelegate.qml` | Per-event renderer                                   |
| `psi/qml/StreamFilter.qml`    | Event type toggle buttons                            |
| `psi/qml/InputBar.qml`        | Bottom text input                                    |
| `psi/qml/StatePanel.qml`      | Right sidebar (~200px)                               |

---

## Task 1: Rename `body` → `nerve` (daemon)

All paths relative to `storybook-daemon/`.

**Files:**

- Rename: `internal/body/` → `internal/nerve/`
- Modify: `internal/sensory/types.go`
- Modify: `internal/sensory/aggregator.go`
- Modify: `internal/thought/cycle.go`
- Modify: `internal/daemon/daemon.go`
- Modify: `internal/persona/types.go`
- Modify: `personas/ember.yaml`, `personas/ember-local.yaml`, `personas/maren.yaml`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run existing tests to confirm green baseline**

```bash
cd storybook-daemon && go test ./...
```

Expected: all tests pass.

- [ ] **Step 2: Rename the directory**

```bash
cd storybook-daemon && git mv internal/body internal/nerve
```

- [ ] **Step 3: Rename `nerve/body.go` → `nerve/nerve.go` and update package + types**

```bash
cd storybook-daemon && git mv internal/nerve/body.go internal/nerve/nerve.go
```

Then edit `internal/nerve/nerve.go` — full replacement:

```go
// Package nerve defines the Nerve interface — the contract between the daemon
// and each external system the persona inhabits. Nerves are sensory connectors:
// they bridge the daemon to tools, repositories, and environments, carrying
// perception inward and action outward.
package nerve

import (
	"context"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// Nerve is a connected external system that the persona can sense and act within.
// Each nerve provides a state summary for the sensory aggregator and can execute
// tool calls routed to it by the thought cycle.
type Nerve interface {
	// ID returns the nerve's configured identifier (matches persona YAML).
	ID() string

	// Type returns the nerve type string (e.g. "hoard", "minecraft").
	Type() string

	// Start initializes the nerve's runtime resources (watchers, connections).
	// Called once after construction, before the dragon-heart starts beating.
	Start(ctx context.Context) error

	// Stop shuts down the nerve's runtime resources.
	// Called during daemon shutdown.
	Stop() error

	// State returns the current state summary for inclusion in the sensory snapshot.
	State(ctx context.Context) (sensory.NerveState, error)

	// Execute runs a nerve-specific action routed from the thought cycle.
	// name is the tool call name, args are the parsed arguments.
	// Returns the result string to enqueue as a perceptual event.
	Execute(ctx context.Context, name string, args map[string]any) (string, error)

	// Tools returns the list of tool definitions this nerve exposes to the LLM.
	// These are merged with built-in persona tools before each thought cycle.
	Tools() []ToolDef

	// Events returns a channel of sensory events pushed by this nerve.
	// The dragon-heart: events on this channel trigger immediate thought cycles.
	// Returns nil if this nerve does not produce asynchronous events.
	Events() <-chan sensory.Event
}

// ToolDef describes a tool that a nerve (or the persona itself) exposes to the LLM.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema object
}
```

- [ ] **Step 4: Update `internal/nerve/hoard/hoard.go` import path**

Replace the import:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
```

with:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
```

Then update all references in the file:

- `body.ToolDef` → `nerve.ToolDef` (line 108–109 area, the `Tools()` return type and constructor)
- Doc comment line 1: `"Body interface"` → `"Nerve interface"`
- `func (b *Body) State(ctx context.Context) (sensory.BodyState, error)` → `(sensory.NerveState, error)`
- `return sensory.BodyState{` → `return sensory.NerveState{`
- Log message `"dragon-body started"` → `"nerve started"` (line 59)

- [ ] **Step 5: Update `internal/sensory/types.go`**

Replace `BodyState` → `NerveState` and `BodyStates` → `NerveStates`:

```go
// Snapshot is the perceptual context assembled for a single thought cycle.
// It represents what the persona is currently "aware of."
type Snapshot struct {
	// Timestamp is when the snapshot was assembled.
	Timestamp time.Time

	// AttentionPool is the current attention level at snapshot time.
	AttentionPool int

	// NerveStates holds a summary of each connected nerve's current state.
	NerveStates []NerveState

	// RecentEvents holds the last N perceptual events from the event queue.
	RecentEvents []Event
}

// NerveState is a summary of one connected nerve at snapshot time.
type NerveState struct {
	// ID matches the nerve's configured ID.
	ID string

	// Type is the nerve type (hoard, minecraft, etc.)
	Type string

	// Summary is a short human-readable description of the nerve's current state.
	// This is what gets injected into the LLM context.
	Summary string

	// Raw is optional structured data for use in tool call routing.
	Raw map[string]any
}
```

- [ ] **Step 6: Update `internal/sensory/aggregator.go`**

Replace the `Snapshot` function signature and body references:

```go
// Snapshot assembles a perceptual snapshot from current nerve states and the event queue.
// Nerve states are provided by the caller (daemon assembles them from connected nerves).
// The event queue is drained into the snapshot.
func (a *Aggregator) Snapshot(attentionPool int, nerves []NerveState) Snapshot {
	a.mu.Lock()
	events := make([]Event, len(a.eventQueue))
	copy(events, a.eventQueue)
	// Drain the queue — events are consumed by the thought cycle.
	a.eventQueue = a.eventQueue[:0]
	a.mu.Unlock()

	return Snapshot{
		Timestamp:     time.Now(),
		AttentionPool: attentionPool,
		NerveStates:   nerves,
		RecentEvents:  events,
	}
}
```

Also update the `Aggregator` doc comment line 9: `"body state summaries"` → `"nerve state summaries"`.

- [ ] **Step 7: Update `internal/thought/cycle.go`**

Replace the import:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
```

with:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
```

Then rename all references:

- Field `bodies map[string]body.Body` → `nerves map[string]nerve.Nerve`
- Constructor parameter `bodies []body.Body` → `nerves []nerve.Nerve`
- `bodyMap := make(map[string]body.Body, len(bodies))` → `nerveMap := make(map[string]nerve.Nerve, len(nerves))`
- Loop variable updates in the constructor
- `gatherBodyStates` → `gatherNerveStates`
- Return type `[]sensory.BodyState` → `[]sensory.NerveState`
- `var states []sensory.BodyState` → `var states []sensory.NerveState`
- `snap.BodyStates` → `snap.NerveStates`

- [ ] **Step 8: Update `internal/daemon/daemon.go`**

Replace imports:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
hoardbody "github.com/dotBeeps/hoard/storybook-daemon/internal/body/hoard"
```

with:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/nerve"
hoardnerve "github.com/dotBeeps/hoard/storybook-daemon/internal/nerve/hoard"
```

Then rename all references throughout the file:

- `bodies, err := d.buildBodies(` → `nerves, err := d.buildNerves(`
- `var startedBodies []body.Body` → `var startedNerves []nerve.Nerve`
- `for _, b := range bodies` → `for _, n := range nerves`
- `b.Start(ctx)` → `n.Start(ctx)`
- `starting body` → `starting nerve` (error message)
- `b.ID()` → `n.ID()`
- `startedBodies = append(startedBodies, b)` → `startedNerves = append(startedNerves, n)`
- `for _, b := range startedBodies` → `for _, n := range startedNerves`
- `b.Stop()` → `n.Stop()`
- `"stopping body"` → `"stopping nerve"` (log message)
- `cycle := thought.New(d.persona, ledger, agg, bodies,` → `nerves,`
- `"bodies", len(bodies)` → `"nerves", len(nerves)` (log message)
- Comment line 92: `"Build and start bodies"` → `"Build and start nerves"`
- Comment line 134: `"e.g. doggy SSE stream"` → `"e.g. SSE stream"` (doggy rename comes in Task 2 but update comment here for consistency)
- `d.fanInBodyEvents(ctx, bodies,` → `d.fanInNerveEvents(ctx, nerves,`
- `func (d *Daemon) buildBodies(` → `func (d *Daemon) buildNerves(`
- Return type `([]body.Body, error)` → `([]nerve.Nerve, error)`
- `var bodies []body.Body` → `var nerves []nerve.Nerve`
- `d.persona.Bodies` → `d.persona.Nerves`
- `"body disabled"` → `"nerve disabled"` (log)
- `d.buildBody(cfg,` → `d.buildNerve(cfg,`
- `"building body"` → `"building nerve"` (error)
- `bodies = append(bodies, b)` → `nerves = append(nerves, n)`
- `"body loaded"` → `"nerve loaded"` (log)
- `func (d *Daemon) fanInBodyEvents(` → `func (d *Daemon) fanInNerveEvents(`
- Parameter `bodies []body.Body` → `nerves []nerve.Nerve`
- Loop `for _, b := range bodies` → `for _, n := range nerves`
- `b.Events()` → `n.Events()`
- `"body event channel closed"` → `"nerve event channel closed"` (log)
- `"body", id` → `"nerve", id` (log key)
- `"body event received"` → `"nerve event received"` (log)
- `func (d *Daemon) buildBody(cfg persona.BodyConfig,` → `func (d *Daemon) buildNerve(cfg persona.NerveConfig,`
- Return type `(body.Body, error)` → `(nerve.Nerve, error)`
- `"hoard body"` → `"hoard nerve"` (error)
- `hoardbody.New(` → `hoardnerve.New(`
- `"unsupported body type"` → `"unsupported nerve type"` (error)

- [ ] **Step 9: Update `internal/persona/types.go`**

Replace:

```go
Bodies     []BodyConfig      `yaml:"bodies"`
```

with:

```go
Nerves     []NerveConfig     `yaml:"nerves"`
```

Replace:

```go
// BodyConfig describes a connected body (external system) the persona inhabits.
type BodyConfig struct {
	ID      string  `yaml:"id"`
	Path    string  `yaml:"path"`
	Type    string  `yaml:"type"`   // hoard | minecraft | app | api
	Weight  float64 `yaml:"weight"` // fraction of attention budget claimed
	Enabled bool    `yaml:"enabled"`
}
```

with:

```go
// NerveConfig describes a connected nerve (external system) the persona inhabits.
type NerveConfig struct {
	ID      string  `yaml:"id"`
	Path    string  `yaml:"path"`
	Type    string  `yaml:"type"`   // hoard | minecraft | app | api
	Weight  float64 `yaml:"weight"` // fraction of attention budget claimed
	Enabled bool    `yaml:"enabled"`
}
```

- [ ] **Step 10: Update persona YAML files**

In `personas/ember.yaml` and `personas/ember-local.yaml`, replace:

```yaml
bodies:
  - id: hoard-git
```

with:

```yaml
nerves:
  - id: hoard-git
```

In `personas/maren.yaml`, replace:

```yaml
bodies: []
```

with:

```yaml
nerves: []
```

- [ ] **Step 11: Update `AGENTS.md` prose references**

Replace `body/` → `nerve/` in directory listings, `bodies` → `nerves` in prose, `body` → `nerve` where referring to the package concept. Keep any English uses of "body" that aren't about this package.

- [ ] **Step 12: Run tests**

```bash
cd storybook-daemon && go vet ./... && go test ./...
```

Expected: all tests pass, no vet warnings.

- [ ] **Step 13: Commit**

```bash
cd storybook-daemon && git add -A && git commit -m "refactor(daemon): rename body → nerve

Nerves are sensory connectors to external systems — the name reflects
that they bridge perception and action, not that the daemon inhabits them.

Renames: package body → nerve, Body interface → Nerve, BodyConfig → NerveConfig,
BodyState → NerveState, all imports/variables/log messages updated.
Persona YAML: bodies → nerves."
```

---

## Task 2: Rename `doggy` → `sse` (daemon)

All paths relative to `storybook-daemon/`.

**Files:**

- Rename: `internal/psi/doggy/` → `internal/psi/sse/`
- Modify: `internal/psi/psi.go`
- Modify: `internal/daemon/daemon.go`
- Modify: `internal/persona/types.go`
- Modify: `personas/ember.yaml`, `personas/ember-local.yaml`, `personas/maren.yaml`
- Modify: `AGENTS.md`

**Depends on:** Task 1 (daemon.go was modified)

- [ ] **Step 1: Run tests to confirm green baseline after Task 1**

```bash
cd storybook-daemon && go test ./...
```

- [ ] **Step 2: Rename the directory and files**

```bash
cd storybook-daemon && git mv internal/psi/doggy internal/psi/sse
cd storybook-daemon && git mv internal/psi/sse/doggy.go internal/psi/sse/sse.go
cd storybook-daemon && git mv internal/psi/sse/doggy_test.go internal/psi/sse/sse_test.go
```

- [ ] **Step 3: Update `internal/psi/sse/sse.go`**

Full replacement:

```go
// Package sse implements the HTTP+SSE psi interface that exposes the daemon's
// thought stream, attention state, and direct-message ingestion over a local
// HTTP server. This is dot's control surface — her window into the daemon.
package sse

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/soul"
)

// Interface is the SSE psi interface. It exposes the daemon's thought
// stream, attention state, and a direct-message channel to dot.
type Interface struct {
	id     string
	port   int
	ledger *attention.Ledger
	agg    *sensory.Aggregator
	log    *slog.Logger

	mu      sync.Mutex
	clients map[chan string]struct{}

	server *http.Server
	cancel context.CancelFunc
}

// New creates an SSE Interface. Wire must be called before Start to connect
// the thought stream.
func New(id string, port int, ledger *attention.Ledger, agg *sensory.Aggregator, log *slog.Logger) *Interface {
	return &Interface{
		id:      id,
		port:    port,
		ledger:  ledger,
		agg:     agg,
		log:     log,
		clients: make(map[chan string]struct{}),
	}
}

// Wire connects the SSE interface to the thought cycle output stream.
// Call this after the thought cycle is created, before the heart starts.
func (b *Interface) Wire(capture soul.OutputCapture) {
	capture.OnOutput(func(text string) {
		b.broadcastJSON(map[string]string{"type": "thought", "text": text})
	})
}

// ID returns the configured interface identifier.
func (b *Interface) ID() string { return b.id }

// Type returns the static discriminator string for this interface kind.
func (b *Interface) Type() string { return "sse" }

// Events returns nil — inbound messages are pushed directly to the aggregator
// via POST /message rather than via an events channel.
func (b *Interface) Events() <-chan sensory.Event { return nil }

// Start launches the HTTP server. It returns as soon as the server goroutine
// is running; ctx cancellation triggers a graceful shutdown.
func (b *Interface) Start(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/stream", b.handleStream)
	mux.HandleFunc("/state", b.handleState)
	mux.HandleFunc("/message", b.handleMessage)

	b.server = &http.Server{
		Addr:              fmt.Sprintf(":%d", b.port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverCtx, cancel := context.WithCancel(ctx)
	b.cancel = cancel

	go func() {
		b.log.Info("sse: listening", "port", b.port)
		if err := b.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			b.log.Error("sse: server error", "err", err)
		}
	}()

	go func() { //nolint:gosec // G118: independent goroutine manages graceful shutdown, not request-scoped
		<-serverCtx.Done()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutCancel()
		if err := b.server.Shutdown(shutCtx); err != nil { //nolint:contextcheck // Stop() has no ctx param; shutdown needs its own budget
			b.log.Error("sse: shutdown error", "err", err)
		}
	}()

	return nil
}

// Stop shuts the server down gracefully.
func (b *Interface) Stop() error {
	if b.cancel != nil {
		b.cancel()
	}
	return nil
}

// addClient registers a new SSE subscriber channel.
func (b *Interface) addClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[ch] = struct{}{}
}

// removeClient deregisters and closes an SSE subscriber channel.
func (b *Interface) removeClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
}

// broadcastJSON marshals v and fans it out to all connected SSE clients.
// Slow clients are skipped rather than blocked.
func (b *Interface) broadcastJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		b.log.Error("sse: broadcast marshal", "err", err)
		return
	}
	msg := "data: " + string(data)
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- msg:
		default:
			// Slow client — skip rather than block.
		}
	}
}

// handleStream serves the SSE endpoint. Each connected client receives
// thought events broadcast by Wire and keepalive pings every 30 s.
func (b *Interface) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := make(chan string, 32)
	b.addClient(ch)
	defer b.removeClient(ch)

	// Send an initial comment to unblock the client's HTTP connect immediately.
	_, _ = fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(w, "%s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			_, _ = fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

type stateSnapshot struct {
	Attention int    `json:"attention"`
	At        string `json:"at"`
}

// handleState returns a JSON snapshot of the current attention pool.
func (b *Interface) handleState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	snap := stateSnapshot{
		Attention: b.ledger.Pool(),
		At:        time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(snap); err != nil {
		b.log.Error("sse: state encode", "err", err)
	}
}

type messageRequest struct {
	Text string `json:"text"`
}

// handleMessage accepts a POST with {"text":"..."} and enqueues a "message"
// sensory event so the next thought cycle sees dot's input.
func (b *Interface) handleMessage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req messageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Text) == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}
	b.agg.Enqueue(sensory.Event{
		Source:  "sse",
		Kind:    "message",
		Content: req.Text,
		At:      time.Now(),
	})
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 4: Update `internal/psi/sse/sse_test.go`**

Replace package declaration and import:

```go
package sse_test
```

Replace import path:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/psi/doggy"
```

with:

```
"github.com/dotBeeps/hoard/storybook-daemon/internal/psi/sse"
```

Then rename all references throughout:

- `doggy.Interface` → `sse.Interface`
- `doggy.New(` → `sse.New(`
- Comment `"so the doggy server can bind"` → `"so the SSE server can bind"`
- `t.Fatal("doggy server did not start in time")` → `t.Fatal("sse server did not start in time")`
- All function names `TestDoggy_*` → `TestSSE_*` (e.g. `TestDoggy_GetState` → `TestSSE_GetState`)
- Helper function names `startTestIface` and `startTestIfaceFull` — keep as-is (they're generic)

- [ ] **Step 5: Update `internal/psi/psi.go` comment**

Replace:

```go
// Type returns the interface type string (e.g. "doggy", "mcp").
```

with:

```go
// Type returns the interface type string (e.g. "sse", "mcp").
```

- [ ] **Step 6: Update `internal/daemon/daemon.go`**

Replace import:

```go
psidoggy "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/doggy"
```

with:

```go
psisse "github.com/dotBeeps/hoard/storybook-daemon/internal/psi/sse"
```

In `buildInterface`, replace:

```go
case "doggy":
```

with:

```go
case "sse":
```

Replace:

```go
return psidoggy.New(cfg.ID, port, ledger, agg, d.log), nil
```

with:

```go
return psisse.New(cfg.ID, port, ledger, agg, d.log), nil
```

Replace error string:

```go
return nil, fmt.Errorf("unsupported interface type %q (supported: doggy, mcp)", cfg.Type)
```

with:

```go
return nil, fmt.Errorf("unsupported interface type %q (supported: sse, mcp)", cfg.Type)
```

Update comment (line 134 area, already partly done in Task 1):

```go
// Wire thought output to psi interfaces that act as output sinks (e.g. SSE stream).
```

- [ ] **Step 7: Update `internal/persona/types.go` comment**

Replace:

```go
Type    string `yaml:"type"` // doggy | mcp
```

with:

```go
Type    string `yaml:"type"` // sse | mcp
```

- [ ] **Step 8: Update persona YAML files**

In all three persona files (`ember.yaml`, `ember-local.yaml`, `maren.yaml`), replace:

```yaml
- id: doggy
  type: doggy
```

with:

```yaml
- id: sse
  type: sse
```

In `maren.yaml`, also update the comment:

```yaml
# Different port from Ember's SSE — each persona gets its own endpoint
```

- [ ] **Step 9: Update `AGENTS.md`**

Replace `doggy` → `sse` in directory listings, interface references, and the phase table. Keep any quotes that are historically accurate.

- [ ] **Step 10: Run tests**

```bash
cd storybook-daemon && go vet ./... && go test ./...
```

Expected: all tests pass, no vet warnings.

- [ ] **Step 11: Commit**

```bash
cd storybook-daemon && git add -A && git commit -m "refactor(daemon): rename doggy → sse

The SSE interface has no unique logic warranting its own taxonomy name.
'sse' describes the protocol it uses, which is sufficient.

Renames: package doggy → sse, Type() returns 'sse', all imports/logs/YAML updated."
```

---

## Task 3: Qt project scaffold

**Files:**

- Create: `psi/CMakeLists.txt`
- Create: `psi/src/main.cpp`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p psi/src psi/qml
```

- [ ] **Step 2: Create `psi/CMakeLists.txt`**

```cmake
cmake_minimum_required(VERSION 3.21)
project(psi VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Quick Network QuickControls2)

qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(psi
    src/main.cpp
    src/sseconnection.h src/sseconnection.cpp
    src/thoughtmodel.h src/thoughtmodel.cpp
    src/daemonstate.h src/daemonstate.cpp
    src/themeengine.h src/themeengine.cpp
)

qt_add_qml_module(psi
    URI Psi
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/SessionRail.qml
        qml/ConnectionBar.qml
        qml/ThoughtStream.qml
        qml/ThoughtDelegate.qml
        qml/StreamFilter.qml
        qml/InputBar.qml
        qml/StatePanel.qml
)

target_link_libraries(psi PRIVATE
    Qt6::Quick
    Qt6::Network
    Qt6::QuickControls2
)
```

- [ ] **Step 3: Create `psi/src/main.cpp` (stub — full wiring comes after C++ classes exist)**

```cpp
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    QQmlApplicationEngine engine;
    engine.loadFromModule("Psi", "Main");

    if (engine.rootObjects().isEmpty())
        return -1;

    return QGuiApplication::exec();
}
```

- [ ] **Step 4: Create stub QML and C++ files so CMake can configure**

Create minimal stubs for all files referenced in CMakeLists.txt. These will be replaced in subsequent tasks but need to exist for the build system to configure.

`psi/qml/Main.qml`:

```qml
import QtQuick
import QtQuick.Controls.Material

ApplicationWindow {
    visible: true
    width: 1200
    height: 800
    title: "psi"
    Material.theme: Material.Dark
}
```

Create empty stub files for all other QML and C++ files:

```bash
touch psi/src/sseconnection.h psi/src/sseconnection.cpp
touch psi/src/thoughtmodel.h psi/src/thoughtmodel.cpp
touch psi/src/daemonstate.h psi/src/daemonstate.cpp
touch psi/src/themeengine.h psi/src/themeengine.cpp
touch psi/qml/SessionRail.qml psi/qml/ConnectionBar.qml
touch psi/qml/ThoughtStream.qml psi/qml/ThoughtDelegate.qml
touch psi/qml/StreamFilter.qml psi/qml/InputBar.qml
touch psi/qml/StatePanel.qml
```

- [ ] **Step 5: Verify CMake configures**

```bash
cd psi && cmake -B build -DCMAKE_PREFIX_PATH=$QT6_DIR
```

Expected: configures without errors. May warn about empty source files — that's fine.

- [ ] **Step 6: Commit**

```bash
git add psi/ && git commit -m "feat(psi): scaffold Qt 6 project with CMake

Empty shell: CMakeLists.txt, main.cpp, stub files for all C++ classes
and QML components. Configures with Qt 6.5+ (Quick, Network, QuickControls2)."
```

---

## Task 4: ThemeEngine

**Files:**

- Create: `psi/src/themeengine.h`
- Create: `psi/src/themeengine.cpp`

- [ ] **Step 1: Write `psi/src/themeengine.h`**

```cpp
#ifndef THEMEENGINE_H
#define THEMEENGINE_H

#include <QObject>
#include <QColor>
#include <QQmlEngine>

class ThemeEngine : public QObject
{
    Q_OBJECT
    QML_NAMED_ELEMENT(Theme)
    QML_SINGLETON

    Q_PROPERTY(QColor background READ background CONSTANT FINAL)
    Q_PROPERTY(QColor surface READ surface CONSTANT FINAL)
    Q_PROPERTY(QColor surfaceRaised READ surfaceRaised CONSTANT FINAL)
    Q_PROPERTY(QColor border READ border CONSTANT FINAL)
    Q_PROPERTY(QColor accent READ accent CONSTANT FINAL)
    Q_PROPERTY(QColor accentMuted READ accentMuted CONSTANT FINAL)
    Q_PROPERTY(QColor text READ text CONSTANT FINAL)
    Q_PROPERTY(QColor textMuted READ textMuted CONSTANT FINAL)
    Q_PROPERTY(QColor textDim READ textDim CONSTANT FINAL)

    // Semantic event type colors (fixed, don't shift with persona).
    Q_PROPERTY(QColor colorThink READ colorThink CONSTANT FINAL)
    Q_PROPERTY(QColor colorSpeak READ colorSpeak CONSTANT FINAL)
    Q_PROPERTY(QColor colorText READ colorText CONSTANT FINAL)
    Q_PROPERTY(QColor colorObserve READ colorObserve CONSTANT FINAL)
    Q_PROPERTY(QColor colorBeat READ colorBeat CONSTANT FINAL)

    // Guard tier ring colors.
    Q_PROPERTY(QColor tierPuppy READ tierPuppy CONSTANT FINAL)
    Q_PROPERTY(QColor tierDog READ tierDog CONSTANT FINAL)
    Q_PROPERTY(QColor tierAlly READ tierAlly CONSTANT FINAL)
    Q_PROPERTY(QColor tierDragon READ tierDragon CONSTANT FINAL)

public:
    explicit ThemeEngine(QObject *parent = nullptr);

    // Persona palette (Ember).
    QColor background() const;
    QColor surface() const;
    QColor surfaceRaised() const;
    QColor border() const;
    QColor accent() const;
    QColor accentMuted() const;
    QColor text() const;
    QColor textMuted() const;
    QColor textDim() const;

    // Event type colors.
    QColor colorThink() const;
    QColor colorSpeak() const;
    QColor colorText() const;
    QColor colorObserve() const;
    QColor colorBeat() const;

    // Guard tier colors.
    QColor tierPuppy() const;
    QColor tierDog() const;
    QColor tierAlly() const;
    QColor tierDragon() const;
};

#endif // THEMEENGINE_H
```

- [ ] **Step 2: Write `psi/src/themeengine.cpp`**

```cpp
#include "themeengine.h"

ThemeEngine::ThemeEngine(QObject *parent)
    : QObject(parent)
{
}

// Ember persona palette.
QColor ThemeEngine::background() const { return QColor("#1a1a1a"); }
QColor ThemeEngine::surface() const { return QColor("#141414"); }
QColor ThemeEngine::surfaceRaised() const { return QColor("#1e1e1e"); }
QColor ThemeEngine::border() const { return QColor("#2a2a2a"); }
QColor ThemeEngine::accent() const { return QColor("#e85d26"); }
QColor ThemeEngine::accentMuted() const { return QColor("#e8a849"); }
QColor ThemeEngine::text() const { return QColor("#cccccc"); }
QColor ThemeEngine::textMuted() const { return QColor("#888888"); }
QColor ThemeEngine::textDim() const { return QColor("#555555"); }

// Semantic event type colors (fixed across personas).
QColor ThemeEngine::colorThink() const { return QColor("#9b7dd4"); }
QColor ThemeEngine::colorSpeak() const { return QColor("#e8a849"); }
QColor ThemeEngine::colorText() const { return QColor("#cccccc"); }
QColor ThemeEngine::colorObserve() const { return QColor("#5bc4bf"); }
QColor ThemeEngine::colorBeat() const { return QColor("#555555"); }

// Guard tier ring colors.
QColor ThemeEngine::tierPuppy() const { return QColor("#4ade80"); }
QColor ThemeEngine::tierDog() const { return QColor("#3b82f6"); }
QColor ThemeEngine::tierAlly() const { return QColor("#f59e0b"); }
QColor ThemeEngine::tierDragon() const { return QColor("#e85d26"); }
```

- [ ] **Step 3: Build**

```bash
cd psi && cmake --build build 2>&1 | head -30
```

Expected: ThemeEngine compiles (other stubs may produce warnings — that's fine for now).

- [ ] **Step 4: Commit**

```bash
git add psi/src/themeengine.h psi/src/themeengine.cpp && git commit -m "feat(psi): add ThemeEngine with Ember palette

QML_SINGLETON exposing persona-tinted colors and fixed semantic event
type colors. Only Ember palette ships in sub-project 1."
```

---

## Task 5: SseConnection

**Files:**

- Create: `psi/src/sseconnection.h`
- Create: `psi/src/sseconnection.cpp`

- [ ] **Step 1: Write `psi/src/sseconnection.h`**

```cpp
#ifndef SSECONNECTION_H
#define SSECONNECTION_H

#include <QObject>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QQmlEngine>
#include <QTimer>
#include <QUrl>

class SseConnection : public QObject
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged FINAL)
    Q_PROPERTY(QUrl baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged FINAL)

public:
    explicit SseConnection(QObject *parent = nullptr);

    bool isConnected() const;
    QUrl baseUrl() const;
    void setBaseUrl(const QUrl &url);

    Q_INVOKABLE void connectToServer();
    Q_INVOKABLE void disconnect();
    Q_INVOKABLE void sendMessage(const QString &text);

signals:
    void connectedChanged();
    void baseUrlChanged();
    void thoughtReceived(const QString &type, const QString &text);
    void stateReceived(const QJsonObject &state);
    void messageSent();
    void messageError(const QString &error);

private slots:
    void onStreamReadyRead();
    void onStreamFinished();
    void onStreamError(QNetworkReply::NetworkError error);
    void onReconnectTimer();
    void onKeepaliveTimeout();

private:
    void startStream();
    void scheduleReconnect();
    void resetBackoff();
    void parseSSE(const QByteArray &chunk);
    void processEvent(const QString &data);

    QNetworkAccessManager m_nam;
    QNetworkReply *m_streamReply = nullptr;
    QTimer m_reconnectTimer;
    QTimer m_keepaliveTimer;
    QUrl m_baseUrl;
    QByteArray m_buffer;
    bool m_connected = false;
    bool m_intentionalDisconnect = false;
    int m_backoffMs = 1000;
    static constexpr int MaxBackoffMs = 30000;
    static constexpr int KeepaliveTimeoutMs = 45000;
};

#endif // SSECONNECTION_H
```

- [ ] **Step 2: Write `psi/src/sseconnection.cpp`**

```cpp
#include "sseconnection.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkRequest>

SseConnection::SseConnection(QObject *parent)
    : QObject(parent)
{
    m_reconnectTimer.setSingleShot(true);
    connect(&m_reconnectTimer, &QTimer::timeout,
            this, &SseConnection::onReconnectTimer);

    m_keepaliveTimer.setSingleShot(true);
    m_keepaliveTimer.setInterval(KeepaliveTimeoutMs);
    connect(&m_keepaliveTimer, &QTimer::timeout,
            this, &SseConnection::onKeepaliveTimeout);
}

bool SseConnection::isConnected() const { return m_connected; }

QUrl SseConnection::baseUrl() const { return m_baseUrl; }

void SseConnection::setBaseUrl(const QUrl &url)
{
    if (m_baseUrl != url) {
        m_baseUrl = url;
        emit baseUrlChanged();
    }
}

void SseConnection::connectToServer()
{
    m_intentionalDisconnect = false;
    resetBackoff();
    startStream();
}

void SseConnection::disconnect()
{
    m_intentionalDisconnect = true;
    m_reconnectTimer.stop();
    m_keepaliveTimer.stop();

    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }
}

void SseConnection::sendMessage(const QString &text)
{
    QUrl url = m_baseUrl;
    url.setPath("/message");

    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    QJsonObject body;
    body["text"] = text;
    QByteArray payload = QJsonDocument(body).toJson(QJsonDocument::Compact);

    QNetworkReply *reply = m_nam.post(req, payload);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() == QNetworkReply::NoError) {
            emit messageSent();
        } else {
            emit messageError(reply->errorString());
        }
    });
}

void SseConnection::startStream()
{
    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    m_buffer.clear();

    QUrl url = m_baseUrl;
    url.setPath("/stream");

    QNetworkRequest req(url);
    req.setRawHeader("Accept", "text/event-stream");
    req.setAttribute(QNetworkRequest::CacheLoadControlAttribute,
                     QNetworkRequest::AlwaysNetwork);

    m_streamReply = m_nam.get(req);

    connect(m_streamReply, &QNetworkReply::readyRead,
            this, &SseConnection::onStreamReadyRead);
    connect(m_streamReply, &QNetworkReply::finished,
            this, &SseConnection::onStreamFinished);
    connect(m_streamReply, &QNetworkReply::errorOccurred,
            this, &SseConnection::onStreamError);
}

void SseConnection::onStreamReadyRead()
{
    if (!m_connected) {
        m_connected = true;
        resetBackoff();
        emit connectedChanged();
    }

    m_keepaliveTimer.start();

    QByteArray data = m_streamReply->readAll();
    parseSSE(data);
}

void SseConnection::parseSSE(const QByteArray &chunk)
{
    m_buffer.append(chunk);

    // SSE events are separated by double newlines.
    while (true) {
        int idx = m_buffer.indexOf("\n\n");
        if (idx == -1)
            break;

        QByteArray block = m_buffer.left(idx);
        m_buffer.remove(0, idx + 2);

        // Parse the block — each line is either "data: ..." or ": comment".
        const QList<QByteArray> lines = block.split('\n');
        for (const QByteArray &line : lines) {
            if (line.startsWith("data:")) {
                QString data = QString::fromUtf8(line.mid(5)).trimmed();
                processEvent(data);
            }
            // Comments (": keepalive") are silently consumed — the keepalive
            // timer was already reset in onStreamReadyRead.
        }
    }
}

void SseConnection::processEvent(const QString &data)
{
    QJsonParseError err;
    QJsonDocument doc = QJsonDocument::fromJson(data.toUtf8(), &err);
    if (err.error != QJsonParseError::NoError || !doc.isObject())
        return;

    QJsonObject obj = doc.object();
    QString type = obj.value("type").toString();

    if (type == "thought" || type == "think" || type == "speak" ||
        type == "text" || type == "observe" || type == "beat") {
        QString text = obj.value("text").toString();
        emit thoughtReceived(type, text);
    } else if (type == "state") {
        emit stateReceived(obj);
    }
}

void SseConnection::onStreamFinished()
{
    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }

    if (m_streamReply) {
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (!m_intentionalDisconnect)
        scheduleReconnect();
}

void SseConnection::onStreamError(QNetworkReply::NetworkError /*error*/)
{
    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }
}

void SseConnection::onReconnectTimer()
{
    if (!m_intentionalDisconnect)
        startStream();
}

void SseConnection::onKeepaliveTimeout()
{
    // No data for 45s — treat as disconnected and reconnect.
    if (m_streamReply) {
        m_streamReply->abort();
        m_streamReply->deleteLater();
        m_streamReply = nullptr;
    }

    if (m_connected) {
        m_connected = false;
        emit connectedChanged();
    }

    scheduleReconnect();
}

void SseConnection::scheduleReconnect()
{
    m_reconnectTimer.start(m_backoffMs);
    m_backoffMs = qMin(m_backoffMs * 2, MaxBackoffMs);
}

void SseConnection::resetBackoff()
{
    m_backoffMs = 1000;
}
```

- [ ] **Step 3: Build**

```bash
cd psi && cmake --build build 2>&1 | head -30
```

Expected: SseConnection compiles.

- [ ] **Step 4: Commit**

```bash
git add psi/src/sseconnection.h psi/src/sseconnection.cpp && git commit -m "feat(psi): add SseConnection with reconnect and event parsing

QNetworkAccessManager streaming client for the daemon's SSE endpoint.
Exponential backoff reconnect (1s → 30s), 45s keepalive timeout,
typed signals for thought events and state updates."
```

---

## Task 6: ThoughtModel

**Files:**

- Create: `psi/src/thoughtmodel.h`
- Create: `psi/src/thoughtmodel.cpp`

- [ ] **Step 1: Write `psi/src/thoughtmodel.h`**

```cpp
#ifndef THOUGHTMODEL_H
#define THOUGHTMODEL_H

#include <QAbstractListModel>
#include <QDateTime>
#include <QQmlEngine>

class ThoughtModel : public QAbstractListModel
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(int count READ count NOTIFY countChanged FINAL)
    Q_PROPERTY(bool autoScroll READ autoScroll WRITE setAutoScroll NOTIFY autoScrollChanged FINAL)

public:
    enum Roles {
        TypeRole = Qt::UserRole + 1,
        TextRole,
        TimestampRole,
        NerveRole
    };

    explicit ThoughtModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    int count() const;
    bool autoScroll() const;
    void setAutoScroll(bool enabled);

    Q_INVOKABLE void clear();

public slots:
    void addThought(const QString &type, const QString &text,
                    const QString &nerve = QString());

signals:
    void countChanged();
    void autoScrollChanged();

private:
    struct Entry {
        QString type;
        QString text;
        QDateTime timestamp;
        QString nerve;
    };

    QList<Entry> m_entries;
    bool m_autoScroll = true;
};

#endif // THOUGHTMODEL_H
```

- [ ] **Step 2: Write `psi/src/thoughtmodel.cpp`**

```cpp
#include "thoughtmodel.h"

ThoughtModel::ThoughtModel(QObject *parent)
    : QAbstractListModel(parent)
{
}

int ThoughtModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : static_cast<int>(m_entries.size());
}

QVariant ThoughtModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() < 0 ||
        index.row() >= static_cast<int>(m_entries.size()))
        return {};

    const Entry &e = m_entries.at(index.row());

    switch (role) {
    case TypeRole:
        return e.type;
    case TextRole:
        return e.text;
    case TimestampRole:
        return e.timestamp;
    case NerveRole:
        return e.nerve;
    default:
        return {};
    }
}

QHash<int, QByteArray> ThoughtModel::roleNames() const
{
    return {
        { TypeRole, "type" },
        { TextRole, "text" },
        { TimestampRole, "timestamp" },
        { NerveRole, "nerve" },
    };
}

int ThoughtModel::count() const
{
    return static_cast<int>(m_entries.size());
}

bool ThoughtModel::autoScroll() const { return m_autoScroll; }

void ThoughtModel::setAutoScroll(bool enabled)
{
    if (m_autoScroll != enabled) {
        m_autoScroll = enabled;
        emit autoScrollChanged();
    }
}

void ThoughtModel::addThought(const QString &type, const QString &text,
                              const QString &nerve)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({ type, text, QDateTime::currentDateTime(), nerve });
    endInsertRows();
    emit countChanged();
}

void ThoughtModel::clear()
{
    if (m_entries.isEmpty())
        return;
    beginResetModel();
    m_entries.clear();
    endResetModel();
    emit countChanged();
}
```

- [ ] **Step 3: Build**

```bash
cd psi && cmake --build build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add psi/src/thoughtmodel.h psi/src/thoughtmodel.cpp && git commit -m "feat(psi): add ThoughtModel (QAbstractListModel)

Append-only list model backing the thought stream ListView.
Roles: type, text, timestamp, nerve. Auto-scroll tracking."
```

---

## Task 7: DaemonState

**Files:**

- Create: `psi/src/daemonstate.h`
- Create: `psi/src/daemonstate.cpp`

- [ ] **Step 1: Write `psi/src/daemonstate.h`**

```cpp
#ifndef DAEMONSTATE_H
#define DAEMONSTATE_H

#include <QDateTime>
#include <QJsonArray>
#include <QNetworkAccessManager>
#include <QObject>
#include <QQmlEngine>
#include <QTimer>
#include <QUrl>

class DaemonState : public QObject
{
    Q_OBJECT
    QML_ELEMENT

    Q_PROPERTY(int attention READ attention NOTIFY attentionChanged FINAL)
    Q_PROPERTY(QJsonArray nerves READ nerves NOTIFY nervesChanged FINAL)
    Q_PROPERTY(QJsonArray contracts READ contracts NOTIFY contractsChanged FINAL)
    Q_PROPERTY(QDateTime lastBeat READ lastBeat NOTIFY lastBeatChanged FINAL)
    Q_PROPERTY(bool connected READ isConnected WRITE setConnected NOTIFY connectedChanged FINAL)

public:
    explicit DaemonState(QObject *parent = nullptr);

    int attention() const;
    QJsonArray nerves() const;
    QJsonArray contracts() const;
    QDateTime lastBeat() const;
    bool isConnected() const;
    void setConnected(bool connected);

    Q_INVOKABLE void pollState(const QUrl &baseUrl);

public slots:
    void onStateReceived(const QJsonObject &state);
    void onThoughtReceived(const QString &type, const QString &text);

signals:
    void attentionChanged();
    void nervesChanged();
    void contractsChanged();
    void lastBeatChanged();
    void connectedChanged();

private:
    QNetworkAccessManager m_nam;
    int m_attention = 0;
    QJsonArray m_nerves;
    QJsonArray m_contracts;
    QDateTime m_lastBeat;
    bool m_connected = false;
};

#endif // DAEMONSTATE_H
```

- [ ] **Step 2: Write `psi/src/daemonstate.cpp`**

```cpp
#include "daemonstate.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>

DaemonState::DaemonState(QObject *parent)
    : QObject(parent)
{
}

int DaemonState::attention() const { return m_attention; }
QJsonArray DaemonState::nerves() const { return m_nerves; }
QJsonArray DaemonState::contracts() const { return m_contracts; }
QDateTime DaemonState::lastBeat() const { return m_lastBeat; }
bool DaemonState::isConnected() const { return m_connected; }

void DaemonState::setConnected(bool connected)
{
    if (m_connected != connected) {
        m_connected = connected;
        emit connectedChanged();
    }
}

void DaemonState::pollState(const QUrl &baseUrl)
{
    QUrl url = baseUrl;
    url.setPath("/state");

    QNetworkRequest req(url);
    QNetworkReply *reply = m_nam.get(req);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError)
            return;

        QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        if (!doc.isObject())
            return;

        QJsonObject obj = doc.object();

        int att = obj.value("attention").toInt();
        if (att != m_attention) {
            m_attention = att;
            emit attentionChanged();
        }

        QJsonArray newNerves = obj.value("nerves").toArray();
        if (newNerves != m_nerves) {
            m_nerves = newNerves;
            emit nervesChanged();
        }

        QJsonArray newContracts = obj.value("contracts").toArray();
        if (newContracts != m_contracts) {
            m_contracts = newContracts;
            emit contractsChanged();
        }
    });
}

void DaemonState::onStateReceived(const QJsonObject &state)
{
    int att = state.value("attention").toInt();
    if (att != m_attention) {
        m_attention = att;
        emit attentionChanged();
    }

    QJsonArray newNerves = state.value("nerves").toArray();
    if (newNerves != m_nerves) {
        m_nerves = newNerves;
        emit nervesChanged();
    }

    QJsonArray newContracts = state.value("contracts").toArray();
    if (newContracts != m_contracts) {
        m_contracts = newContracts;
        emit contractsChanged();
    }
}

void DaemonState::onThoughtReceived(const QString &type, const QString &text)
{
    Q_UNUSED(text)
    if (type == "beat") {
        m_lastBeat = QDateTime::currentDateTime();
        emit lastBeatChanged();
    }
}
```

- [ ] **Step 3: Build**

```bash
cd psi && cmake --build build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add psi/src/daemonstate.h psi/src/daemonstate.cpp && git commit -m "feat(psi): add DaemonState model

Q_PROPERTY model for attention level, nerves, contracts, last beat.
Updated from SSE state events and /state HTTP polling."
```

---

## Task 8: Wire main.cpp and create Main.qml shell

**Files:**

- Modify: `psi/src/main.cpp`
- Replace: `psi/qml/Main.qml`
- Replace: `psi/qml/SessionRail.qml`
- Replace: `psi/qml/ConnectionBar.qml`

- [ ] **Step 1: Update `psi/src/main.cpp` with full wiring**

```cpp
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "daemonstate.h"
#include "sseconnection.h"
#include "thoughtmodel.h"
#include "themeengine.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    // Create backend objects.
    SseConnection sse;
    sse.setBaseUrl(QUrl("http://localhost:7432"));

    ThoughtModel thoughts;
    DaemonState state;

    // Wire SSE events → model updates.
    QObject::connect(&sse, &SseConnection::thoughtReceived,
                     &thoughts, [&thoughts](const QString &type, const QString &text) {
        thoughts.addThought(type, text);
    });
    QObject::connect(&sse, &SseConnection::thoughtReceived,
                     &state, &DaemonState::onThoughtReceived);
    QObject::connect(&sse, &SseConnection::stateReceived,
                     &state, &DaemonState::onStateReceived);
    QObject::connect(&sse, &SseConnection::connectedChanged,
                     &state, [&sse, &state]() {
        state.setConnected(sse.isConnected());
        if (sse.isConnected())
            state.pollState(sse.baseUrl());
    });

    // Expose to QML.
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("Sse", &sse);
    engine.rootContext()->setContextProperty("Thoughts", &thoughts);
    engine.rootContext()->setContextProperty("State", &state);

    engine.loadFromModule("Psi", "Main");

    if (engine.rootObjects().isEmpty())
        return -1;

    // Auto-connect on startup.
    sse.connectToServer();

    return QGuiApplication::exec();
}
```

- [ ] **Step 2: Write `psi/qml/Main.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

ApplicationWindow {
    id: root

    visible: true
    width: 1200
    height: 800
    title: "psi"

    Material.theme: Material.Dark
    Material.accent: Theme.accent

    color: Theme.background

    RowLayout {
        anchors.fill: parent
        spacing: 0

        SessionRail {
            Layout.fillHeight: true
            Layout.preferredWidth: 48
        }

        Rectangle {
            width: 1
            Layout.fillHeight: true
            color: Theme.border
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            ConnectionBar {
                Layout.fillWidth: true
                Layout.preferredHeight: 32
            }

            Rectangle {
                height: 1
                Layout.fillWidth: true
                color: Theme.border
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0

                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 0

                    ThoughtStream {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                    }

                    Rectangle {
                        height: 1
                        Layout.fillWidth: true
                        color: Theme.border
                    }

                    InputBar {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 48
                    }
                }

                Rectangle {
                    width: 1
                    Layout.fillHeight: true
                    color: Theme.border
                }

                StatePanel {
                    Layout.fillHeight: true
                    Layout.preferredWidth: 200
                }
            }
        }
    }
}
```

- [ ] **Step 3: Write `psi/qml/SessionRail.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 4
        spacing: 8

        // Active persona icon.
        Rectangle {
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            radius: 8
            color: Theme.surfaceRaised
            border.width: 2
            border.color: Theme.tierDragon

            Text {
                anchors.centerIn: parent
                text: "E"
                font.pixelSize: 18
                font.bold: true
                color: Theme.text
            }

            // Connection status dot.
            Rectangle {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: -2
                width: 10
                height: 10
                radius: 5
                color: State.connected ? "#4ade80" : "#ef4444"
                border.width: 1
                border.color: Theme.surface
            }
        }

        Item { Layout.fillHeight: true }

        // Placeholder add button.
        Rectangle {
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            radius: 8
            color: "transparent"
            border.width: 1
            border.color: Theme.border

            Text {
                anchors.centerIn: parent
                text: "+"
                font.pixelSize: 20
                color: Theme.textDim
            }
        }
    }
}
```

- [ ] **Step 4: Write `psi/qml/ConnectionBar.qml`**

```qml
import QtQuick
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        // Persona name + provider.
        Text {
            text: "Ember (local)"
            font.pixelSize: 12
            color: Theme.textMuted
        }

        Item { Layout.fillWidth: true }

        // SSE connection indicator.
        Row {
            spacing: 6

            Rectangle {
                width: 8
                height: 8
                radius: 4
                anchors.verticalCenter: parent.verticalCenter
                color: State.connected ? "#4ade80" : "#ef4444"

                SequentialAnimation on opacity {
                    running: !State.connected
                    loops: Animation.Infinite
                    NumberAnimation { to: 0.3; duration: 800 }
                    NumberAnimation { to: 1.0; duration: 800 }
                }
            }

            Text {
                text: State.connected ? "SSE connected" : "SSE disconnected"
                font.pixelSize: 11
                color: Theme.textDim
            }
        }
    }
}
```

- [ ] **Step 5: Build and verify**

```bash
cd psi && cmake --build build
```

Expected: builds cleanly.

- [ ] **Step 6: Commit**

```bash
git add psi/src/main.cpp psi/qml/Main.qml psi/qml/SessionRail.qml psi/qml/ConnectionBar.qml && git commit -m "feat(psi): wire main.cpp + shell layout with SessionRail and ConnectionBar

Main.qml: RowLayout shell with session rail (48px), center column
(connection bar + thought stream + input bar), and state panel.
main.cpp wires SSE → ThoughtModel → DaemonState signal connections."
```

---

## Task 9: ThoughtStream + ThoughtDelegate

**Files:**

- Replace: `psi/qml/ThoughtStream.qml`
- Replace: `psi/qml/ThoughtDelegate.qml`

- [ ] **Step 1: Write `psi/qml/ThoughtStream.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    id: streamRoot

    color: Theme.background

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        StreamFilter {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
        }

        Rectangle {
            height: 1
            Layout.fillWidth: true
            color: Theme.border
        }

        ListView {
            id: streamView

            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 2
            cacheBuffer: 2000

            model: Thoughts

            delegate: ThoughtDelegate {
                required property string type
                required property string text
                required property date timestamp
                required property string nerve
                width: streamView.width
            }

            // Auto-scroll: track bottom unless user scrolled up.
            onContentYChanged: {
                if (!streamView.atYEnd) {
                    Thoughts.autoScroll = false
                }
            }

            onCountChanged: {
                if (Thoughts.autoScroll) {
                    Qt.callLater(streamView.positionViewAtEnd)
                }
            }
        }

        // Scroll-to-bottom button (visible when detached).
        Rectangle {
            visible: !Thoughts.autoScroll && Thoughts.count > 0
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: 140
            Layout.preferredHeight: 28
            Layout.bottomMargin: 8
            radius: 14
            color: Theme.surfaceRaised
            border.width: 1
            border.color: Theme.border

            Text {
                anchors.centerIn: parent
                text: "scroll to bottom"
                font.pixelSize: 11
                color: Theme.textMuted
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    Thoughts.autoScroll = true
                    streamView.positionViewAtEnd()
                }
            }
        }
    }
}
```

- [ ] **Step 2: Write `psi/qml/ThoughtDelegate.qml`**

```qml
import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    implicitHeight: row.implicitHeight + 8

    readonly property color typeColor: {
        switch (type) {
        case "think": return Theme.colorThink
        case "speak": return Theme.colorSpeak
        case "observe": return Theme.colorObserve
        case "beat": return Theme.colorBeat
        default: return Theme.colorText
        }
    }

    readonly property string typeLabel: {
        switch (type) {
        case "think": return "think"
        case "speak": return "speak"
        case "observe": return nerve ? ("observe:" + nerve) : "observe"
        case "beat": return "beat"
        default: return ""
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "transparent"

        RowLayout {
            id: row

            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            anchors.topMargin: 4
            anchors.bottomMargin: 4
            spacing: 8

            // Timestamp.
            Text {
                text: Qt.formatTime(timestamp, "HH:mm")
                font.pixelSize: 11
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }

            // Type label.
            Text {
                visible: typeLabel !== ""
                text: typeLabel
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: delegateRoot.typeColor
                Layout.preferredWidth: 80
                Layout.alignment: Qt.AlignTop
            }

            // Content.
            Text {
                text: delegateRoot.text
                font.pixelSize: 13
                font.family: "monospace"
                color: delegateRoot.typeColor
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
```

- [ ] **Step 3: Build**

```bash
cd psi && cmake --build build
```

- [ ] **Step 4: Commit**

```bash
git add psi/qml/ThoughtStream.qml psi/qml/ThoughtDelegate.qml && git commit -m "feat(psi): add ThoughtStream and ThoughtDelegate

ListView backed by ThoughtModel with auto-scroll tracking, scroll-to-bottom
button, and per-event coloring. Monospace font, timestamp + type label + text."
```

---

## Task 10: InputBar

**Files:**

- Replace: `psi/qml/InputBar.qml`

- [ ] **Step 1: Write `psi/qml/InputBar.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        TextField {
            id: input

            Layout.fillWidth: true
            Layout.fillHeight: true
            placeholderText: State.connected ? "message Ember..." : "disconnected"
            enabled: State.connected
            font.pixelSize: 13
            font.family: "monospace"
            color: Theme.text
            placeholderTextColor: Theme.textDim

            background: Rectangle {
                color: "transparent"
            }

            onAccepted: {
                if (input.text.trim().length === 0) return
                Sse.sendMessage(input.text)
                input.text = ""
            }
        }

        // Send indicator — brief amber highlight on success.
        Rectangle {
            id: sendIndicator

            Layout.preferredWidth: 6
            Layout.preferredHeight: 6
            Layout.alignment: Qt.AlignVCenter
            radius: 3
            color: Theme.accentMuted
            opacity: 0

            SequentialAnimation {
                id: sendFlash
                NumberAnimation {
                    target: sendIndicator; property: "opacity"
                    to: 1; duration: 100
                }
                NumberAnimation {
                    target: sendIndicator; property: "opacity"
                    to: 0; duration: 400
                }
            }

            Connections {
                target: Sse
                function onMessageSent() { sendFlash.start() }
            }
        }
    }
}
```

- [ ] **Step 2: Build**

```bash
cd psi && cmake --build build
```

- [ ] **Step 3: Commit**

```bash
git add psi/qml/InputBar.qml && git commit -m "feat(psi): add InputBar

Single-line TextField, Enter sends POST /message, amber flash on success.
Disabled with 'disconnected' placeholder when SSE is down."
```

---

## Task 11: StatePanel

**Files:**

- Replace: `psi/qml/StatePanel.qml`

- [ ] **Step 1: Write `psi/qml/StatePanel.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 16

        // Section: Attention.
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "ATTENTION"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Rectangle {
                    Layout.fillWidth: true
                    height: 8
                    radius: 4
                    color: Theme.border

                    Rectangle {
                        width: parent.width * Math.min(State.attention / 1000, 1.0)
                        height: parent.height
                        radius: 4
                        color: {
                            let ratio = State.attention / 1000
                            if (ratio > 0.5) return "#4ade80"
                            if (ratio > 0.25) return Theme.accentMuted
                            return "#ef4444"
                        }

                        Behavior on width {
                            NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
                        }
                    }
                }

                Text {
                    text: State.attention + " / 1000"
                    font.pixelSize: 11
                    font.family: "monospace"
                    color: Theme.textMuted
                }
            }
        }

        // Section: Nerves.
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "NERVES"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                visible: State.nerves.length === 0
                text: "no nerves connected"
                font.pixelSize: 11
                color: Theme.textDim
                font.italic: true
            }

            Repeater {
                model: State.nerves

                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: modelData.active ? "#4ade80" : Theme.textDim
                    }

                    Text {
                        text: modelData.name || modelData.id || "nerve"
                        font.pixelSize: 12
                        color: Theme.text
                    }
                }
            }
        }

        // Section: Contracts.
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "CONTRACTS"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                visible: State.contracts.length === 0
                text: "no contracts loaded"
                font.pixelSize: 11
                color: Theme.textDim
                font.italic: true
            }

            Repeater {
                model: State.contracts

                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: 6

                    Rectangle {
                        width: 8
                        height: 8
                        radius: 4
                        color: {
                            let s = modelData.status || "ok"
                            if (s === "ok") return "#4ade80"
                            if (s === "warning") return Theme.accentMuted
                            return "#ef4444"
                        }
                    }

                    Text {
                        text: modelData.name || modelData.id || "contract"
                        font.pixelSize: 12
                        color: Theme.text
                    }
                }
            }
        }

        // Section: Last beat.
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "LAST BEAT"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                id: beatLabel
                font.pixelSize: 12
                font.family: "monospace"
                color: Theme.textMuted

                readonly property bool hasBeat: State.lastBeat.getTime() > 0
                text: hasBeat ? beatAge() : "no beats yet"

                function beatAge(): string {
                    let ms = Date.now() - State.lastBeat.getTime()
                    let s = Math.floor(ms / 1000)
                    if (s < 60) return s + "s ago"
                    let m = Math.floor(s / 60)
                    return m + "m ago"
                }

                Timer {
                    running: beatLabel.hasBeat
                    interval: 1000
                    repeat: true
                    onTriggered: beatLabel.text = beatLabel.beatAge()
                }
            }
        }

        Item { Layout.fillHeight: true }
    }
}
```

- [ ] **Step 2: Build**

```bash
cd psi && cmake --build build
```

- [ ] **Step 3: Commit**

```bash
git add psi/qml/StatePanel.qml && git commit -m "feat(psi): add StatePanel sidebar

Attention gauge with color-shifting progress bar, nerve list with status
dots, contract list with severity coloring, live-updating last beat timer."
```

---

## Task 12: StreamFilter

**Files:**

- Replace: `psi/qml/StreamFilter.qml`

- [ ] **Step 1: Write `psi/qml/StreamFilter.qml`**

```qml
import QtQuick
import QtQuick.Controls.Material
import QtQuick.Layouts

Rectangle {
    color: Theme.surface

    // Filter state — all types visible by default.
    // Future: wire to a QSortFilterProxyModel for actual filtering.
    // For now, these are visual toggles that track state for when
    // the proxy model is added.

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 4

        Text {
            text: "STREAM"
            font.pixelSize: 10
            font.bold: true
            font.letterSpacing: 1.5
            color: Theme.textDim
            Layout.rightMargin: 8
        }

        Repeater {
            model: [
                { label: "think", color: Theme.colorThink },
                { label: "speak", color: Theme.colorSpeak },
                { label: "text", color: Theme.colorText },
                { label: "observe", color: Theme.colorObserve },
                { label: "beat", color: Theme.colorBeat }
            ]

            Rectangle {
                required property var modelData
                property bool active: true

                Layout.preferredHeight: 22
                Layout.preferredWidth: label.implicitWidth + 16
                radius: 4
                color: active ? Qt.rgba(modelData.color.r, modelData.color.g,
                                        modelData.color.b, 0.15) : "transparent"
                border.width: 1
                border.color: active ? modelData.color : Theme.border

                Text {
                    id: label
                    anchors.centerIn: parent
                    text: modelData.label
                    font.pixelSize: 10
                    font.family: "monospace"
                    color: active ? modelData.color : Theme.textDim
                }

                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: parent.active = !parent.active
                }
            }
        }

        Item { Layout.fillWidth: true }

        Text {
            text: Thoughts.count + " events"
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
        }
    }
}
```

- [ ] **Step 2: Build**

```bash
cd psi && cmake --build build
```

- [ ] **Step 3: Commit**

```bash
git add psi/qml/StreamFilter.qml && git commit -m "feat(psi): add StreamFilter toggle bar

Visual toggle buttons for thought event types (think, speak, text,
observe, beat). Filter state tracked for future QSortFilterProxyModel integration."
```

---

## Task 13: Integration verification

**Files:** None modified — verification only.

- [ ] **Step 1: Build the full project**

```bash
cd psi && cmake -B build -DCMAKE_PREFIX_PATH=$QT6_DIR && cmake --build build
```

Expected: compiles cleanly with no errors.

- [ ] **Step 2: Start the daemon**

In a separate terminal:

```bash
cd storybook-daemon && go run ./cmd/daemon --persona personas/ember-local.yaml
```

Wait for `"daemon ready"` in the daemon log.

- [ ] **Step 3: Launch psi**

```bash
cd psi && ./build/psi
```

Expected:

- Window opens with dark Ember theme
- ConnectionBar shows "SSE connected" with green dot
- SessionRail shows "E" icon with green connection dot
- ThoughtStream populates as daemon fires thought cycles

- [ ] **Step 4: Test input**

Type a message in the InputBar and press Enter.
Expected: amber flash, daemon processes message, response appears in thought stream.

- [ ] **Step 5: Test connection health**

Kill the daemon process. Expected: ConnectionBar switches to "SSE disconnected" with pulsing red dot. InputBar shows "disconnected" and disables.

Restart the daemon. Expected: psi reconnects automatically, status returns to green.

- [ ] **Step 6: Verify state panel**

After connecting, the attention gauge should show the current pool value from `/state`.

- [ ] **Step 7: Final commit (if any cleanup needed)**

If integration testing reveals issues, fix them and commit:

```bash
git add -A && git commit -m "fix(psi): integration test fixes"
```

---

## Summary

| Task | Description                            | Depends On          |
| ---- | -------------------------------------- | ------------------- |
| 1    | body → nerve rename                    | —                   |
| 2    | doggy → sse rename                     | 1                   |
| 3    | Qt project scaffold                    | —                   |
| 4    | ThemeEngine                            | 3                   |
| 5    | SseConnection                          | 3                   |
| 6    | ThoughtModel                           | 3                   |
| 7    | DaemonState                            | 3                   |
| 8    | Main.qml + SessionRail + ConnectionBar | 4, 5, 6, 7          |
| 9    | ThoughtStream + ThoughtDelegate        | 8                   |
| 10   | InputBar                               | 8                   |
| 11   | StatePanel                             | 8                   |
| 12   | StreamFilter                           | 9                   |
| 13   | Integration verification               | 1, 2, all psi tasks |

Tasks 1–2 (daemon) and 3–7 (psi scaffold + C++ classes) can run in parallel.
Tasks 9, 10, 11 can run in parallel after Task 8.
