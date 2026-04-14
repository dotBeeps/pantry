# Quest Planning & Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file-backed task registry, stone federation bridge, and implement→review orchestration loop to the storybook-daemon so hoard allies gain structured plan/test/develop/review workflows.

**Architecture:** The storybook-daemon (Go MCP server) becomes the persistent orchestrator. Task state lives as markdown files with YAML frontmatter in a `quests/` directory. The stone federation bridge connects the daemon's in-process broker with pi's HTTP stone server. The orchestration loop dispatches implementer allies, runs tier-based review, and tracks everything through the task registry. Primary agents (pi or CC) create plans and tasks via MCP tools; the daemon handles everything from dispatch through review.

**Tech Stack:** Go 1.25, `gopkg.in/yaml.v3` (already in go.mod), `github.com/modelcontextprotocol/go-sdk` (already in go.mod), existing `internal/quest`, `internal/stone`, `internal/memory` patterns.

**Spec:** `docs/superpowers/specs/2026-04-12-quest-planning-tracking-design.md`

---

## File Structure

### New Files

| File                                                         | Responsibility                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| `storybook-daemon/internal/task/types.go`                    | Task/Plan frontmatter structs, status enum, review depth enum |
| `storybook-daemon/internal/task/registry.go`                 | Read/write/list/filter markdown task files on disk            |
| `storybook-daemon/internal/task/registry_test.go`            | Registry unit tests                                           |
| `storybook-daemon/internal/task/orchestrator.go`             | Implement→review state machine, drives quest dispatch         |
| `storybook-daemon/internal/task/orchestrator_test.go`        | Orchestration loop tests with mock broker/quest manager       |
| `storybook-daemon/internal/task/index.go`                    | Auto-generate `quests/index.md` from registry state           |
| `storybook-daemon/internal/psi/mcp/stone_federation.go`      | HTTP bridge: daemon broker ↔ pi stone HTTP server            |
| `storybook-daemon/internal/psi/mcp/stone_federation_test.go` | Federation bridge tests                                       |

### Modified Files

| File                                         | Changes                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `storybook-daemon/internal/psi/mcp/mcp.go`   | Add task/plan tool registrations and handlers, add federation field to Interface |
| `storybook-daemon/internal/quest/types.go`   | Add `TaskID` field to Quest struct                                               |
| `storybook-daemon/internal/quest/manager.go` | Thread `TaskID` through Dispatch                                                 |
| `storybook-daemon/internal/stone/types.go`   | Add `StatusCode` field for ally self-report                                      |

---

## Task 1: Stone Federation Bridge

The stone is the nervous system — build and validate it before anything else.

**Files:**

- Create: `storybook-daemon/internal/psi/mcp/stone_federation.go`
- Create: `storybook-daemon/internal/psi/mcp/stone_federation_test.go`
- Modify: `storybook-daemon/internal/psi/mcp/mcp.go:36-67` (Interface struct + New)
- Modify: `storybook-daemon/internal/psi/mcp/mcp.go:300-325` (handleRegisterSession)

### Concept

When a pi session registers with the daemon AND brings up its own HTTP stone server, the daemon needs to bridge the two: messages sent to the daemon broker get forwarded to the pi stone HTTP endpoint, and messages arriving at the pi stone get forwarded to the daemon broker. The bridge is per-session, activated when a session registers with a `stone_port` field.

- [ ] **Step 1: Write the failing test for Federation struct creation**

```go
// storybook-daemon/internal/psi/mcp/stone_federation_test.go
package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

func TestFederationForwardToBroker(t *testing.T) {
	// Simulate a pi stone HTTP server that receives POSTed messages.
	var received []stone.Message
	piStone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/message" {
			var msg stone.Message
			if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
				t.Errorf("pi stone decode: %v", err)
				http.Error(w, err.Error(), 400)
				return
			}
			received = append(received, msg)
			w.WriteHeader(200)
			return
		}
		http.NotFound(w, r)
	}))
	defer piStone.Close()

	broker := NewBroker(100)
	broker.RegisterSession("s1")

	fed := NewFederation(broker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Bridge this session to the pi stone server.
	fed.Bridge(ctx, "s1", piStone.URL)

	// Send a message via the broker — it should be forwarded to pi stone.
	err := broker.Send(ctx, "s1", stone.Message{
		From:       "primary-agent",
		Addressing: "session-room",
		Type:       "status",
		Content:    "hello from daemon",
	})
	if err != nil {
		t.Fatalf("broker send: %v", err)
	}

	// Give the subscriber goroutine time to forward.
	time.Sleep(50 * time.Millisecond)

	if len(received) != 1 {
		t.Fatalf("pi stone received %d messages, want 1", len(received))
	}
	if received[0].Content != "hello from daemon" {
		t.Errorf("content = %q, want %q", received[0].Content, "hello from daemon")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestFederationForwardToBroker -v`
Expected: FAIL — `NewFederation` undefined

- [ ] **Step 3: Implement Federation struct and Bridge method**

```go
// storybook-daemon/internal/psi/mcp/stone_federation.go
package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// Federation bridges the daemon's in-process Broker with pi-side HTTP stone
// servers. When a session registers with a stone_port, the federation subscribes
// to the broker for that session and forwards messages to the pi stone via HTTP
// POST. It also polls the pi stone for messages and injects them into the broker.
type Federation struct {
	broker  *Broker
	mu      sync.Mutex
	bridges map[string]*bridge // sessionID -> bridge
	log     *slog.Logger
}

type bridge struct {
	sessionID string
	stoneURL  string // e.g. "http://127.0.0.1:12345"
	cancel    context.CancelFunc
}

// NewFederation creates a Federation backed by the given Broker.
func NewFederation(broker *Broker) *Federation {
	return &Federation{
		broker:  broker,
		bridges: make(map[string]*bridge),
		log:     slog.Default(),
	}
}

// SetLogger configures the federation logger.
func (f *Federation) SetLogger(log *slog.Logger) {
	f.log = log
}

// Bridge activates bidirectional message forwarding between the daemon broker
// and the pi stone HTTP server at stoneURL for the given session.
// Safe to call multiple times — subsequent calls replace the previous bridge.
func (f *Federation) Bridge(ctx context.Context, sessionID, stoneURL string) {
	f.Unbridge(sessionID)

	bridgeCtx, cancel := context.WithCancel(ctx)
	b := &bridge{
		sessionID: sessionID,
		stoneURL:  stoneURL,
		cancel:    cancel,
	}

	f.mu.Lock()
	f.bridges[sessionID] = b
	f.mu.Unlock()

	// Forward: broker -> pi stone HTTP
	go f.forwardToPiStone(bridgeCtx, b)

	// Reverse: pi stone HTTP -> broker (poll-based)
	go f.pollFromPiStone(bridgeCtx, b)
}

// Unbridge tears down the federation for a session.
func (f *Federation) Unbridge(sessionID string) {
	f.mu.Lock()
	if b, ok := f.bridges[sessionID]; ok {
		b.cancel()
		delete(f.bridges, sessionID)
	}
	f.mu.Unlock()
}

// forwardToPiStone subscribes to broker messages for this session and POSTs
// each one to the pi stone HTTP endpoint.
func (f *Federation) forwardToPiStone(ctx context.Context, b *bridge) {
	ch, unsub := f.broker.Subscribe(b.sessionID)
	defer unsub()

	client := &http.Client{Timeout: 5 * time.Second}

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			f.postMessage(ctx, client, b.stoneURL, msg)
		case <-ctx.Done():
			return
		}
	}
}

// pollFromPiStone polls the pi stone's /stream or /messages endpoint and
// injects received messages into the daemon broker.
func (f *Federation) pollFromPiStone(ctx context.Context, b *bridge) {
	client := &http.Client{Timeout: 10 * time.Second}
	var lastID string

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			msgs := f.fetchMessages(ctx, client, b.stoneURL, lastID)
			for _, msg := range msgs {
				// Avoid echo: don't re-inject messages that originated from the broker.
				if msg.Metadata != nil {
					if _, ok := msg.Metadata["federated"]; ok {
						continue
					}
				}
				msg.Metadata = mergeMetadata(msg.Metadata, map[string]any{"federated": true})
				if err := f.broker.Send(ctx, b.sessionID, msg); err != nil {
					f.log.Warn("federation: inject to broker failed",
						"session", b.sessionID, "err", err)
				}
				lastID = msg.ID
			}
		case <-ctx.Done():
			return
		}
	}
}

func (f *Federation) postMessage(ctx context.Context, client *http.Client, stoneURL string, msg stone.Message) {
	// Tag outbound messages so the reverse poller can skip them.
	msg.Metadata = mergeMetadata(msg.Metadata, map[string]any{"federated": true})

	body, err := json.Marshal(msg)
	if err != nil {
		f.log.Warn("federation: marshal failed", "err", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, stoneURL+"/message", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		f.log.Warn("federation: POST to pi stone failed", "url", stoneURL, "err", err)
		return
	}
	resp.Body.Close()
}

func (f *Federation) fetchMessages(ctx context.Context, client *http.Client, stoneURL, sinceID string) []stone.Message {
	url := stoneURL + "/messages"
	if sinceID != "" {
		url += "?since_id=" + sinceID
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil // pi stone may not be up yet; silent retry
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil
	}

	var msgs []stone.Message
	if err := json.NewDecoder(resp.Body).Decode(&msgs); err != nil {
		return nil
	}
	return msgs
}

func mergeMetadata(base, extra map[string]any) map[string]any {
	if base == nil {
		return extra
	}
	for k, v := range extra {
		base[k] = v
	}
	return base
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestFederationForwardToBroker -v`
Expected: PASS

- [ ] **Step 5: Write test for reverse direction (pi stone → broker)**

```go
// Append to stone_federation_test.go
func TestFederationPollFromPiStone(t *testing.T) {
	// Simulate a pi stone that serves /messages with one message.
	piMsg := stone.Message{
		ID:         "pi-1",
		From:       "ally-scout",
		Addressing: "primary-agent",
		Type:       "result",
		Content:    "found 3 files",
		Timestamp:  time.Now().UnixMilli(),
	}
	piStone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/messages" {
			json.NewEncoder(w).Encode([]stone.Message{piMsg})
			return
		}
		if r.Method == http.MethodPost && r.URL.Path == "/message" {
			w.WriteHeader(200)
			return
		}
		http.NotFound(w, r)
	}))
	defer piStone.Close()

	broker := NewBroker(100)
	broker.RegisterSession("s1")

	fed := NewFederation(broker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fed.Bridge(ctx, "s1", piStone.URL)

	// Wait for the poller to pick up the message.
	time.Sleep(600 * time.Millisecond)

	msgs := broker.History("s1", "")
	found := false
	for _, m := range msgs {
		if m.Content == "found 3 files" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("broker history missing pi stone message; got %d messages", len(msgs))
	}
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestFederationPollFromPiStone -v`
Expected: PASS

- [ ] **Step 7: Write test for echo prevention**

```go
// Append to stone_federation_test.go
func TestFederationNoEcho(t *testing.T) {
	// Pi stone that echoes back anything POSTed to it via /messages.
	var posted []stone.Message
	piStone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/message" {
			var msg stone.Message
			json.NewDecoder(r.Body).Decode(&msg)
			posted = append(posted, msg)
			w.WriteHeader(200)
			return
		}
		if r.Method == http.MethodGet && r.URL.Path == "/messages" {
			// Return what was POSTed (simulating pi stone's ring buffer).
			json.NewEncoder(w).Encode(posted)
			return
		}
	}))
	defer piStone.Close()

	broker := NewBroker(100)
	broker.RegisterSession("s1")

	fed := NewFederation(broker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fed.Bridge(ctx, "s1", piStone.URL)

	// Send one message from the broker.
	broker.Send(ctx, "s1", stone.Message{
		From:       "primary-agent",
		Addressing: "session-room",
		Type:       "status",
		Content:    "ping",
	})

	// Wait for forward + poll cycle.
	time.Sleep(700 * time.Millisecond)

	// The broker should have exactly 1 message (the original), not 2 (echo).
	msgs := broker.History("s1", "")
	count := 0
	for _, m := range msgs {
		if m.Content == "ping" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("broker has %d 'ping' messages, want exactly 1 (echo prevention failed)", count)
	}
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestFederationNoEcho -v`
Expected: PASS

- [ ] **Step 9: Wire federation into Interface struct**

Modify `storybook-daemon/internal/psi/mcp/mcp.go`:

Add field to Interface struct (after `questMgr`):

```go
	federation *Federation
```

In `New()`, after creating `qm`:

```go
	fed := NewFederation(broker)
	fed.SetLogger(log)
```

Add `federation: fed` to the return struct.

Modify `handleRegisterSession` to activate the bridge when `stone_port` is provided:

Add to `registerSessionInput`:

```go
	StonePort int `json:"stone_port,omitempty" jsonschema:"pi-side stone HTTP port for federation bridging"`
```

Add to `handleRegisterSession`, after `b.broker.RegisterSession(input.SessionID)`:

```go
	if input.StonePort > 0 {
		stoneURL := fmt.Sprintf("http://127.0.0.1:%d", input.StonePort)
		b.federation.Bridge(context.Background(), input.SessionID, stoneURL)
		b.log.Info("mcp: stone federation bridged",
			"session_id", input.SessionID,
			"stone_port", input.StonePort,
		)
	}
```

- [ ] **Step 10: Run all broker and federation tests**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -v`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
cd storybook-daemon
git add internal/psi/mcp/stone_federation.go internal/psi/mcp/stone_federation_test.go internal/psi/mcp/mcp.go
git commit -m "feat(stone): add federation bridge between daemon broker and pi HTTP stone"
```

---

## Task 2: Task Registry Types

**Files:**

- Create: `storybook-daemon/internal/task/types.go`

- [ ] **Step 1: Write task types**

```go
// storybook-daemon/internal/task/types.go
package task

import "time"

// Status represents the lifecycle state of a task.
type Status string

const (
	StatusPending       Status = "pending"
	StatusInProgress    Status = "in_progress"
	StatusImplementing  Status = "implementing"
	StatusSpecReview    Status = "spec_review"
	StatusQualityReview Status = "quality_review"
	StatusCompleted     Status = "completed"
	StatusFailed        Status = "failed"
	StatusBlocked       Status = "blocked"
)

// IsTerminal returns true if the status is a final state.
func (s Status) IsTerminal() bool {
	return s == StatusCompleted || s == StatusFailed
}

// Tier maps to the ally taxonomy and determines default review depth.
type Tier string

const (
	TierKobold  Tier = "kobold"
	TierGriffin Tier = "griffin"
	TierDragon  Tier = "dragon"
)

// ReviewDepth controls how many review stages a task goes through.
type ReviewDepth string

const (
	ReviewNone     ReviewDepth = "none"
	ReviewSingle   ReviewDepth = "single"
	ReviewTwoStage ReviewDepth = "two_stage"
)

// DefaultReviewDepth returns the review depth for a tier.
// When tier is empty, defaults to two_stage (full superpowers model).
func DefaultReviewDepth(tier Tier) ReviewDepth {
	switch tier {
	case TierKobold:
		return ReviewNone
	case TierGriffin:
		return ReviewSingle
	case TierDragon:
		return ReviewTwoStage
	default:
		return ReviewTwoStage
	}
}

// Frontmatter is the YAML header of a task markdown file.
type Frontmatter struct {
	ID          string      `yaml:"id"`
	Status      Status      `yaml:"status"`
	Plan        string      `yaml:"plan,omitempty"`   // wikilink to parent plan
	Tier        Tier        `yaml:"tier"`
	ReviewDepth ReviewDepth `yaml:"review_depth"`
	BlockedBy   []string    `yaml:"blocked_by,omitempty"`
	AssignedTo  string      `yaml:"assigned_to,omitempty"`
	QuestID     string      `yaml:"quest_id,omitempty"`
	Created     string      `yaml:"created"`
	Updated     string      `yaml:"updated"`
	Tags        []string    `yaml:"tags,omitempty"`
}

// Task is a single work item with frontmatter and markdown body.
type Task struct {
	Frontmatter Frontmatter
	Body        string
}

// PlanFrontmatter is the YAML header of a plan markdown file.
type PlanFrontmatter struct {
	ID      string   `yaml:"id"`
	Status  string   `yaml:"status"` // active, completed, archived
	Tags    []string `yaml:"tags,omitempty"`
	Created string   `yaml:"created"`
	Updated string   `yaml:"updated"`
}

// Plan is a plan document with frontmatter and markdown body.
type Plan struct {
	Frontmatter PlanFrontmatter
	Body        string
}

// TaskSummary is a compact representation for list queries.
type TaskSummary struct {
	ID         string   `json:"id"`
	Status     Status   `json:"status"`
	Tier       Tier     `json:"tier"`
	Plan       string   `json:"plan,omitempty"`
	Tags       []string `json:"tags,omitempty"`
	AssignedTo string   `json:"assigned_to,omitempty"`
	BlockedBy  []string `json:"blocked_by,omitempty"`
	Title      string   `json:"title"` // first H1 from body
	Updated    string   `json:"updated"`
}

// StatusCode is reported by allies in their final stone result message.
type StatusCode string

const (
	CodeDone             StatusCode = "DONE"
	CodeDoneWithConcerns StatusCode = "DONE_WITH_CONCERNS"
	CodeNeedsContext     StatusCode = "NEEDS_CONTEXT"
	CodeBlocked          StatusCode = "BLOCKED"
)

// Now returns the current time in RFC3339 for frontmatter timestamps.
func Now() string {
	return time.Now().UTC().Format(time.RFC3339)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd storybook-daemon && go build ./internal/task/`
Expected: Success (no output)

- [ ] **Step 3: Commit**

```bash
cd storybook-daemon
git add internal/task/types.go
git commit -m "feat(task): add task registry type definitions"
```

---

## Task 3: Task Registry (Read/Write/List)

**Files:**

- Create: `storybook-daemon/internal/task/registry.go`
- Create: `storybook-daemon/internal/task/registry_test.go`

- [ ] **Step 1: Write failing test for Registry.WriteTask and ReadTask**

```go
// storybook-daemon/internal/task/registry_test.go
package task_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/task"
)

func TestRegistryWriteAndRead(t *testing.T) {
	dir := t.TempDir()
	reg, err := task.NewRegistry(dir)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	tk := &task.Task{
		Frontmatter: task.Frontmatter{
			ID:          "fix-progress",
			Status:      task.StatusPending,
			Plan:        "[[2026-04-12-reliability]]",
			Tier:        task.TierGriffin,
			ReviewDepth: task.ReviewSingle,
			Tags:        []string{"stone", "glm"},
		},
		Body: "# Fix Progress Check-in\n\n## Task\nGLM allies send too few progress updates.",
	}

	if err := reg.WriteTask(tk); err != nil {
		t.Fatalf("WriteTask: %v", err)
	}

	// Verify file exists on disk.
	path := filepath.Join(dir, "tasks", "fix-progress.md")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("file not written: %v", err)
	}
	if !strings.Contains(string(data), "status: pending") {
		t.Errorf("frontmatter missing status; got:\n%s", data)
	}

	// Read it back.
	got, err := reg.ReadTask("fix-progress")
	if err != nil {
		t.Fatalf("ReadTask: %v", err)
	}
	if got.Frontmatter.Tier != task.TierGriffin {
		t.Errorf("tier = %q, want %q", got.Frontmatter.Tier, task.TierGriffin)
	}
	if !strings.Contains(got.Body, "GLM allies") {
		t.Errorf("body lost content: %q", got.Body)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storybook-daemon && go test ./internal/task/ -run TestRegistryWriteAndRead -v`
Expected: FAIL — `task.NewRegistry` undefined

- [ ] **Step 3: Implement Registry**

```go
// storybook-daemon/internal/task/registry.go
package task

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

// Registry manages task and plan markdown files on disk.
type Registry struct {
	dir string // root quests/ directory
}

// NewRegistry creates a Registry rooted at dir. Creates subdirectories if needed.
func NewRegistry(dir string) (*Registry, error) {
	for _, sub := range []string{"tasks", "plans", "reviews"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o750); err != nil {
			return nil, fmt.Errorf("creating %s dir: %w", sub, err)
		}
	}
	return &Registry{dir: dir}, nil
}

// Dir returns the root directory path.
func (r *Registry) Dir() string { return r.dir }

// WriteTask writes a task to disk. Sets Created/Updated timestamps if empty.
func (r *Registry) WriteTask(t *Task) error {
	if t.Frontmatter.ID == "" {
		return errors.New("task ID is required")
	}
	if t.Frontmatter.Created == "" {
		t.Frontmatter.Created = Now()
	}
	t.Frontmatter.Updated = Now()

	if t.Frontmatter.ReviewDepth == "" {
		t.Frontmatter.ReviewDepth = DefaultReviewDepth(t.Frontmatter.Tier)
	}

	return r.writeMarkdown(filepath.Join("tasks", slugify(t.Frontmatter.ID)+".md"), t.Frontmatter, t.Body)
}

// ReadTask reads a task file by ID.
func (r *Registry) ReadTask(id string) (*Task, error) {
	path := filepath.Join(r.dir, "tasks", slugify(id)+".md")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading task %q: %w", id, err)
	}

	var fm Frontmatter
	body, err := parseFrontmatter(data, &fm)
	if err != nil {
		return nil, fmt.Errorf("parsing task %q: %w", id, err)
	}

	return &Task{Frontmatter: fm, Body: body}, nil
}

// UpdateTask reads, applies updates, and writes back. Returns the updated task.
func (r *Registry) UpdateTask(id string, apply func(*Task)) (*Task, error) {
	t, err := r.ReadTask(id)
	if err != nil {
		return nil, err
	}
	apply(t)
	if err := r.WriteTask(t); err != nil {
		return nil, err
	}
	return t, nil
}

// ListTasks returns summaries of all tasks, optionally filtered.
func (r *Registry) ListTasks(filter func(*Task) bool) ([]TaskSummary, error) {
	dir := filepath.Join(r.dir, "tasks")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("listing tasks: %w", err)
	}

	var results []TaskSummary
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var fm Frontmatter
		body, err := parseFrontmatter(data, &fm)
		if err != nil {
			continue
		}
		t := &Task{Frontmatter: fm, Body: body}
		if filter != nil && !filter(t) {
			continue
		}
		results = append(results, TaskSummary{
			ID:         fm.ID,
			Status:     fm.Status,
			Tier:       fm.Tier,
			Plan:       fm.Plan,
			Tags:       fm.Tags,
			AssignedTo: fm.AssignedTo,
			BlockedBy:  fm.BlockedBy,
			Title:      extractTitle(body),
			Updated:    fm.Updated,
		})
	}
	return results, nil
}

// WritePlan writes a plan document to disk.
func (r *Registry) WritePlan(p *Plan) error {
	if p.Frontmatter.ID == "" {
		return errors.New("plan ID is required")
	}
	if p.Frontmatter.Created == "" {
		p.Frontmatter.Created = Now()
	}
	p.Frontmatter.Updated = Now()
	if p.Frontmatter.Status == "" {
		p.Frontmatter.Status = "active"
	}

	return r.writeMarkdown(filepath.Join("plans", slugify(p.Frontmatter.ID)+".md"), p.Frontmatter, p.Body)
}

// ReadPlan reads a plan file by ID.
func (r *Registry) ReadPlan(id string) (*Plan, error) {
	path := filepath.Join(r.dir, "plans", slugify(id)+".md")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading plan %q: %w", id, err)
	}

	var fm PlanFrontmatter
	body, err := parseFrontmatter(data, &fm)
	if err != nil {
		return nil, fmt.Errorf("parsing plan %q: %w", id, err)
	}

	return &Plan{Frontmatter: fm, Body: body}, nil
}

// WriteReview writes a review document to the reviews/ directory.
func (r *Registry) WriteReview(taskID, reviewType, content string) error {
	filename := slugify(taskID) + "-" + slugify(reviewType) + ".md"
	path := filepath.Join(r.dir, "reviews", filename)
	return os.WriteFile(path, []byte(content), 0o600)
}

// ── Internal helpers ───────────────────────────────────────

func (r *Registry) writeMarkdown(relPath string, frontmatter any, body string) error {
	fmBytes, err := yaml.Marshal(frontmatter)
	if err != nil {
		return fmt.Errorf("marshaling frontmatter: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("---\n")
	sb.Write(fmBytes)
	sb.WriteString("---\n\n")
	sb.WriteString(body)
	if !strings.HasSuffix(body, "\n") {
		sb.WriteString("\n")
	}

	path := filepath.Join(r.dir, relPath)
	return os.WriteFile(path, []byte(sb.String()), 0o600)
}

func parseFrontmatter[T any](data []byte, fm *T) (string, error) {
	s := string(data)
	if !strings.HasPrefix(s, "---\n") {
		return "", errors.New("missing frontmatter delimiter")
	}
	rest := s[4:]
	end := strings.Index(rest, "\n---\n")
	if end < 0 {
		return "", errors.New("unclosed frontmatter")
	}
	fmRaw := rest[:end]
	body := strings.TrimPrefix(rest[end+5:], "\n")

	if err := yaml.Unmarshal([]byte(fmRaw), fm); err != nil {
		return "", fmt.Errorf("parsing frontmatter YAML: %w", err)
	}
	return strings.TrimSpace(body), nil
}

func extractTitle(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimPrefix(line, "# ")
		}
	}
	return ""
}

var nonSlug = regexp.MustCompile(`[^a-z0-9\-]`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return '-'
		}
		return r
	}, s)
	s = nonSlug.ReplaceAllString(s, "")
	s = regexp.MustCompile(`-{2,}`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "untitled"
	}
	return s
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/task/ -run TestRegistryWriteAndRead -v`
Expected: PASS

- [ ] **Step 5: Write test for ListTasks with filters**

```go
// Append to registry_test.go
func TestRegistryListWithFilter(t *testing.T) {
	dir := t.TempDir()
	reg, err := task.NewRegistry(dir)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	tasks := []task.Task{
		{
			Frontmatter: task.Frontmatter{ID: "task-a", Status: task.StatusPending, Tier: task.TierKobold, Tags: []string{"stone"}},
			Body:        "# Task A\nDo thing A.",
		},
		{
			Frontmatter: task.Frontmatter{ID: "task-b", Status: task.StatusCompleted, Tier: task.TierGriffin, Tags: []string{"stone"}},
			Body:        "# Task B\nDo thing B.",
		},
		{
			Frontmatter: task.Frontmatter{ID: "task-c", Status: task.StatusPending, Tier: task.TierGriffin, Tags: []string{"glm"}},
			Body:        "# Task C\nDo thing C.",
		},
	}
	for i := range tasks {
		if err := reg.WriteTask(&tasks[i]); err != nil {
			t.Fatalf("WriteTask %s: %v", tasks[i].Frontmatter.ID, err)
		}
	}

	// Filter: pending only.
	pending, err := reg.ListTasks(func(tk *task.Task) bool {
		return tk.Frontmatter.Status == task.StatusPending
	})
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(pending) != 2 {
		t.Errorf("pending count = %d, want 2", len(pending))
	}

	// Filter: by tag "glm".
	glm, err := reg.ListTasks(func(tk *task.Task) bool {
		for _, tag := range tk.Frontmatter.Tags {
			if tag == "glm" {
				return true
			}
		}
		return false
	})
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(glm) != 1 {
		t.Errorf("glm count = %d, want 1", len(glm))
	}
	if glm[0].Title != "Task C" {
		t.Errorf("title = %q, want %q", glm[0].Title, "Task C")
	}
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/task/ -run TestRegistryListWithFilter -v`
Expected: PASS

- [ ] **Step 7: Write test for UpdateTask**

```go
// Append to registry_test.go
func TestRegistryUpdateTask(t *testing.T) {
	dir := t.TempDir()
	reg, err := task.NewRegistry(dir)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	tk := &task.Task{
		Frontmatter: task.Frontmatter{ID: "update-me", Status: task.StatusPending, Tier: task.TierGriffin},
		Body:        "# Update Me\nOriginal body.",
	}
	reg.WriteTask(tk)

	updated, err := reg.UpdateTask("update-me", func(t *task.Task) {
		t.Frontmatter.Status = task.StatusImplementing
		t.Frontmatter.AssignedTo = "keen-kobold-scout"
	})
	if err != nil {
		t.Fatalf("UpdateTask: %v", err)
	}
	if updated.Frontmatter.Status != task.StatusImplementing {
		t.Errorf("status = %q, want %q", updated.Frontmatter.Status, task.StatusImplementing)
	}
	if updated.Frontmatter.AssignedTo != "keen-kobold-scout" {
		t.Errorf("assigned_to = %q, want %q", updated.Frontmatter.AssignedTo, "keen-kobold-scout")
	}

	// Read from disk to confirm persistence.
	reread, _ := reg.ReadTask("update-me")
	if reread.Frontmatter.Status != task.StatusImplementing {
		t.Errorf("re-read status = %q, want %q", reread.Frontmatter.Status, task.StatusImplementing)
	}
}
```

- [ ] **Step 8: Run all task tests**

Run: `cd storybook-daemon && go test ./internal/task/ -v`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
cd storybook-daemon
git add internal/task/types.go internal/task/registry.go internal/task/registry_test.go
git commit -m "feat(task): add file-backed markdown task registry with YAML frontmatter"
```

---

## Task 4: Index Generator

**Files:**

- Create: `storybook-daemon/internal/task/index.go`
- Modify: `storybook-daemon/internal/task/registry_test.go`

- [ ] **Step 1: Write failing test for GenerateIndex**

```go
// Append to registry_test.go
func TestGenerateIndex(t *testing.T) {
	dir := t.TempDir()
	reg, err := task.NewRegistry(dir)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{
			ID: "task-a", Status: task.StatusPending, Tier: task.TierKobold,
			Plan: "[[my-plan]]", Tags: []string{"stone"},
		},
		Body: "# Task A\nDo thing.",
	})
	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{
			ID: "task-b", Status: task.StatusCompleted, Tier: task.TierGriffin,
			Plan: "[[my-plan]]", Tags: []string{"stone", "glm"},
		},
		Body: "# Task B\nDone thing.",
	})

	content, err := reg.GenerateIndex()
	if err != nil {
		t.Fatalf("GenerateIndex: %v", err)
	}

	if !strings.Contains(content, "[[task-a]]") {
		t.Error("index missing wikilink to task-a")
	}
	if !strings.Contains(content, "[[task-b]]") {
		t.Error("index missing wikilink to task-b")
	}
	if !strings.Contains(content, "#stone") {
		t.Error("index missing #stone tag")
	}
	if !strings.Contains(content, "Completed") {
		t.Error("index missing Completed section")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storybook-daemon && go test ./internal/task/ -run TestGenerateIndex -v`
Expected: FAIL — `reg.GenerateIndex` undefined

- [ ] **Step 3: Implement GenerateIndex**

```go
// storybook-daemon/internal/task/index.go
package task

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// GenerateIndex builds the quest board index.md content from current task state.
func (r *Registry) GenerateIndex() (string, error) {
	all, err := r.ListTasks(nil)
	if err != nil {
		return "", err
	}

	// Group by status.
	groups := map[Status][]TaskSummary{}
	tagCounts := map[string]int{}
	planTasks := map[string][]TaskSummary{}

	for _, s := range all {
		groups[s.Status] = append(groups[s.Status], s)
		for _, tag := range s.Tags {
			tagCounts[tag]++
		}
		if s.Plan != "" {
			planTasks[s.Plan] = append(planTasks[s.Plan], s)
		}
	}

	var sb strings.Builder
	sb.WriteString("# Quest Board\n\n")

	// Active plans summary.
	if len(planTasks) > 0 {
		sb.WriteString("## Active Plans\n\n")
		for plan, tasks := range planTasks {
			completed := 0
			for _, t := range tasks {
				if t.Status == StatusCompleted {
					completed++
				}
			}
			sb.WriteString(fmt.Sprintf("- %s — %d/%d completed\n", plan, completed, len(tasks)))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("## Tasks by Status\n\n")

	// Ordered status display.
	statusOrder := []Status{
		StatusImplementing, StatusSpecReview, StatusQualityReview,
		StatusInProgress, StatusPending, StatusBlocked, StatusCompleted, StatusFailed,
	}

	for _, status := range statusOrder {
		tasks, ok := groups[status]
		if !ok || len(tasks) == 0 {
			continue
		}
		sb.WriteString(fmt.Sprintf("### %s\n\n", statusLabel(status)))
		for _, t := range tasks {
			tagStr := ""
			for _, tag := range t.Tags {
				tagStr += " #" + tag
			}
			detail := ""
			if t.AssignedTo != "" {
				detail = fmt.Sprintf(" (%s assigned)", t.AssignedTo)
			}
			if len(t.BlockedBy) > 0 {
				blockers := make([]string, len(t.BlockedBy))
				for i, b := range t.BlockedBy {
					blockers[i] = "[[" + b + "]]"
				}
				detail = fmt.Sprintf(" — blocked by %s", strings.Join(blockers, ", "))
			}
			sb.WriteString(fmt.Sprintf("- [[%s]]%s — %s%s\n", t.ID, tagStr, t.Title, detail))
		}
		sb.WriteString("\n")
	}

	// Tag cloud.
	if len(tagCounts) > 0 {
		sb.WriteString("## Tags\n\n")
		tags := make([]string, 0, len(tagCounts))
		for tag := range tagCounts {
			tags = append(tags, tag)
		}
		sort.Strings(tags)
		parts := make([]string, len(tags))
		for i, tag := range tags {
			parts[i] = fmt.Sprintf("#%s (%d)", tag, tagCounts[tag])
		}
		sb.WriteString(strings.Join(parts, " · ") + "\n")
	}

	return sb.String(), nil
}

// WriteIndex writes the generated index to quests/index.md.
func (r *Registry) WriteIndex() error {
	content, err := r.GenerateIndex()
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(r.dir, "index.md"), []byte(content), 0o600)
}

func statusLabel(s Status) string {
	switch s {
	case StatusImplementing:
		return "Implementing"
	case StatusSpecReview:
		return "Spec Review"
	case StatusQualityReview:
		return "Quality Review"
	case StatusInProgress:
		return "In Progress"
	case StatusPending:
		return "Pending"
	case StatusBlocked:
		return "Blocked"
	case StatusCompleted:
		return "Completed"
	case StatusFailed:
		return "Failed"
	default:
		return string(s)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/task/ -run TestGenerateIndex -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon
git add internal/task/index.go internal/task/registry_test.go
git commit -m "feat(task): add auto-generated quest board index.md with wikilinks and tags"
```

---

## Task 5: Link Quests to Tasks

**Files:**

- Modify: `storybook-daemon/internal/quest/types.go:22-45`
- Modify: `storybook-daemon/internal/quest/types.go:57-72` (QuestInfo)
- Modify: `storybook-daemon/internal/quest/types.go:74-89` (DispatchRequest/QuestRequest)
- Modify: `storybook-daemon/internal/stone/types.go`

- [ ] **Step 1: Add TaskID to Quest and QuestRequest**

In `storybook-daemon/internal/quest/types.go`, add to Quest struct after `GroupID string`:

```go
	TaskID    string
```

Add to QuestRequest after `Thinking`:

```go
	TaskID   string `json:"task_id,omitempty"`
```

Add to QuestInfo after `GroupID`:

```go
	TaskID     string `json:"task_id,omitempty"`
```

In `Quest.Info()`, add after `GroupID: q.GroupID`:

```go
		TaskID:     q.TaskID,
```

- [ ] **Step 2: Add StatusCode to stone.Message**

In `storybook-daemon/internal/stone/types.go`, add after `Timestamp`:

```go
	StatusCode string `json:"status_code,omitempty"` // DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED
```

- [ ] **Step 3: Verify everything compiles**

Run: `cd storybook-daemon && go build ./...`
Expected: Success

- [ ] **Step 4: Commit**

```bash
cd storybook-daemon
git add internal/quest/types.go internal/stone/types.go
git commit -m "feat(quest): link quests to tasks via TaskID, add StatusCode to stone messages"
```

---

## Task 6: MCP Task Tool Handlers

**Files:**

- Modify: `storybook-daemon/internal/psi/mcp/mcp.go` (input/output types, registration, handlers)

- [ ] **Step 1: Add task input/output types to mcp.go**

Add after the `questCancelOutput` type (before `stubOutput`):

```go
// ── Task tool input/output types ──────────────────────────

type taskCreateInput struct {
	SessionID   string   `json:"session_id" jsonschema:"session creating the task"`
	ID          string   `json:"id" jsonschema:"unique task identifier (becomes filename)"`
	Tier        string   `json:"tier" jsonschema:"kobold, griffin, or dragon"`
	ReviewDepth string   `json:"review_depth,omitempty" jsonschema:"none, single, or two_stage (default from tier)"`
	PlanID      string   `json:"plan_id,omitempty" jsonschema:"parent plan ID (wikilink added automatically)"`
	Tags        []string `json:"tags,omitempty" jsonschema:"freeform tags"`
	BlockedBy   []string `json:"blocked_by,omitempty" jsonschema:"task IDs that must complete first"`
	Body        string   `json:"body" jsonschema:"markdown body (task description, acceptance criteria, context)"`
}

type taskCreateOutput struct {
	Status string `json:"status"`
	ID     string `json:"id"`
	Path   string `json:"path"`
}

type taskUpdateInput struct {
	SessionID  string   `json:"session_id" jsonschema:"session owning this update"`
	ID         string   `json:"id" jsonschema:"task ID to update"`
	Status     string   `json:"status,omitempty" jsonschema:"new status"`
	Tags       []string `json:"tags,omitempty" jsonschema:"replace tags (omit to keep current)"`
	BlockedBy  []string `json:"blocked_by,omitempty" jsonschema:"replace blocked_by (omit to keep current)"`
	BodyAppend string   `json:"body_append,omitempty" jsonschema:"markdown to append to body"`
}

type taskUpdateOutput struct {
	Status string `json:"status"`
	ID     string `json:"id"`
	State  string `json:"state"` // current task status after update
}

type taskGetInput struct {
	SessionID string `json:"session_id" jsonschema:"session requesting the task"`
	ID        string `json:"id" jsonschema:"task ID to read"`
}

type taskListInput struct {
	SessionID string `json:"session_id" jsonschema:"session requesting the list"`
	Status    string `json:"status,omitempty" jsonschema:"filter by status"`
	Tag       string `json:"tag,omitempty" jsonschema:"filter by tag"`
	PlanID    string `json:"plan_id,omitempty" jsonschema:"filter by plan"`
	Tier      string `json:"tier,omitempty" jsonschema:"filter by tier"`
}

type taskListOutput struct {
	Tasks []taskListEntry `json:"tasks"`
}

type taskListEntry struct {
	ID         string   `json:"id"`
	Status     string   `json:"status"`
	Tier       string   `json:"tier"`
	Title      string   `json:"title"`
	Tags       []string `json:"tags,omitempty"`
	AssignedTo string   `json:"assigned_to,omitempty"`
	BlockedBy  []string `json:"blocked_by,omitempty"`
	Updated    string   `json:"updated"`
}

type taskExecuteInput struct {
	SessionID string   `json:"session_id" jsonschema:"session kicking off execution"`
	IDs       []string `json:"ids" jsonschema:"task IDs to execute"`
	Parallel  bool     `json:"parallel,omitempty" jsonschema:"run independent tasks in parallel (default false)"`
}

type taskExecuteOutput struct {
	Status  string `json:"status"`
	GroupID string `json:"group_id,omitempty"`
	Message string `json:"message"`
}

type planCreateInput struct {
	SessionID string `json:"session_id" jsonschema:"session creating the plan"`
	ID        string `json:"id" jsonschema:"plan identifier (becomes filename)"`
	Body      string `json:"body" jsonschema:"full plan markdown body"`
}

type planCreateOutput struct {
	Status string `json:"status"`
	ID     string `json:"id"`
	Path   string `json:"path"`
}

type planStatusInput struct {
	SessionID string `json:"session_id" jsonschema:"session requesting plan status"`
	ID        string `json:"id" jsonschema:"plan ID"`
}

type planStatusOutput struct {
	ID        string         `json:"id"`
	Status    string         `json:"status"`
	Tasks     []taskListEntry `json:"tasks"`
	Completed int            `json:"completed"`
	Total     int            `json:"total"`
}
```

- [ ] **Step 2: Add taskRegistry field to Interface and wire in New()**

Add to Interface struct after `questMgr`:

```go
	taskReg    *task.Registry
```

Add import:

```go
	"github.com/dotBeeps/hoard/storybook-daemon/internal/task"
```

In `New()`, after creating `qm`, before `return`:

```go
	// Task registry defaults to quests/ in the current working directory.
	// Callers can override via configuration.
	questsDir := "quests"
	taskReg, err := task.NewRegistry(questsDir)
	if err != nil {
		log.Warn("mcp: task registry init failed, tasks disabled", "err", err)
	}
```

Add `taskReg: taskReg` to the return struct (nil-safe — handlers check).

- [ ] **Step 3: Register task tools in registerTools()**

Add after the `quest_cancel` registration:

```go
	// ── Task tools ──
	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "task_create",
		Description: "Create a task in the quest registry. Returns the task ID and file path.",
	}, b.handleTaskCreate)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "task_update",
		Description: "Update a task's status, tags, blocked_by, or append to its body.",
	}, b.handleTaskUpdate)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "task_get",
		Description: "Read a task file by ID. Returns the full markdown content.",
	}, b.handleTaskGet)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "task_list",
		Description: "List tasks with optional filters by status, tag, plan, or tier.",
	}, b.handleTaskList)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "task_execute",
		Description: "Kick off the implement→review loop for one or more tasks. Returns immediately; progress arrives via stone.",
	}, b.handleTaskExecute)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "plan_create",
		Description: "Create a plan document in the quest registry.",
	}, b.handlePlanCreate)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "plan_status",
		Description: "Get aggregate status of all tasks under a plan.",
	}, b.handlePlanStatus)
```

- [ ] **Step 4: Implement task handlers**

Add after the existing `handleQuestCancel` function:

```go
// ── Task handlers ──────────────────────────────────────────

func (b *Interface) handleTaskCreate(_ context.Context, _ *gomcp.CallToolRequest, input taskCreateInput) (*gomcp.CallToolResult, taskCreateOutput, error) {
	if b.taskReg == nil {
		return nil, taskCreateOutput{}, fmt.Errorf("task registry not initialized")
	}

	tier := task.Tier(input.Tier)
	reviewDepth := task.ReviewDepth(input.ReviewDepth)
	if reviewDepth == "" {
		reviewDepth = task.DefaultReviewDepth(tier)
	}

	plan := ""
	if input.PlanID != "" {
		plan = "[[" + input.PlanID + "]]"
	}

	t := &task.Task{
		Frontmatter: task.Frontmatter{
			ID:          input.ID,
			Status:      task.StatusPending,
			Plan:        plan,
			Tier:        tier,
			ReviewDepth: reviewDepth,
			Tags:        input.Tags,
			BlockedBy:   input.BlockedBy,
		},
		Body: input.Body,
	}

	if err := b.taskReg.WriteTask(t); err != nil {
		return nil, taskCreateOutput{}, fmt.Errorf("writing task: %w", err)
	}

	b.taskReg.WriteIndex() // best-effort index rebuild

	b.log.Info("mcp: task created", "id", input.ID, "tier", input.Tier)

	return nil, taskCreateOutput{
		Status: "created",
		ID:     input.ID,
		Path:   "quests/tasks/" + input.ID + ".md",
	}, nil
}

func (b *Interface) handleTaskUpdate(_ context.Context, _ *gomcp.CallToolRequest, input taskUpdateInput) (*gomcp.CallToolResult, taskUpdateOutput, error) {
	if b.taskReg == nil {
		return nil, taskUpdateOutput{}, fmt.Errorf("task registry not initialized")
	}

	updated, err := b.taskReg.UpdateTask(input.ID, func(t *task.Task) {
		if input.Status != "" {
			t.Frontmatter.Status = task.Status(input.Status)
		}
		if input.Tags != nil {
			t.Frontmatter.Tags = input.Tags
		}
		if input.BlockedBy != nil {
			t.Frontmatter.BlockedBy = input.BlockedBy
		}
		if input.BodyAppend != "" {
			t.Body += "\n\n" + input.BodyAppend
		}
	})
	if err != nil {
		return nil, taskUpdateOutput{}, fmt.Errorf("updating task: %w", err)
	}

	b.taskReg.WriteIndex() // best-effort index rebuild

	return nil, taskUpdateOutput{
		Status: "updated",
		ID:     input.ID,
		State:  string(updated.Frontmatter.Status),
	}, nil
}

func (b *Interface) handleTaskGet(_ context.Context, _ *gomcp.CallToolRequest, input taskGetInput) (*gomcp.CallToolResult, any, error) {
	if b.taskReg == nil {
		return nil, nil, fmt.Errorf("task registry not initialized")
	}

	t, err := b.taskReg.ReadTask(input.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("reading task: %w", err)
	}

	// Return raw markdown as text content for maximum flexibility.
	content, _ := json.Marshal(map[string]any{
		"id":       t.Frontmatter.ID,
		"status":   t.Frontmatter.Status,
		"tier":     t.Frontmatter.Tier,
		"tags":     t.Frontmatter.Tags,
		"body":     t.Body,
		"updated":  t.Frontmatter.Updated,
	})

	return &gomcp.CallToolResult{
		Content: []gomcp.Content{
			&gomcp.TextContent{Text: string(content)},
		},
	}, nil, nil
}

func (b *Interface) handleTaskList(_ context.Context, _ *gomcp.CallToolRequest, input taskListInput) (*gomcp.CallToolResult, taskListOutput, error) {
	if b.taskReg == nil {
		return nil, taskListOutput{}, fmt.Errorf("task registry not initialized")
	}

	summaries, err := b.taskReg.ListTasks(func(t *task.Task) bool {
		if input.Status != "" && string(t.Frontmatter.Status) != input.Status {
			return false
		}
		if input.Tier != "" && string(t.Frontmatter.Tier) != input.Tier {
			return false
		}
		if input.PlanID != "" {
			expected := "[[" + input.PlanID + "]]"
			if t.Frontmatter.Plan != expected {
				return false
			}
		}
		if input.Tag != "" {
			found := false
			for _, tag := range t.Frontmatter.Tags {
				if tag == input.Tag {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	})
	if err != nil {
		return nil, taskListOutput{}, fmt.Errorf("listing tasks: %w", err)
	}

	entries := make([]taskListEntry, len(summaries))
	for i, s := range summaries {
		entries[i] = taskListEntry{
			ID:         s.ID,
			Status:     string(s.Status),
			Tier:       string(s.Tier),
			Title:      s.Title,
			Tags:       s.Tags,
			AssignedTo: s.AssignedTo,
			BlockedBy:  s.BlockedBy,
			Updated:    s.Updated,
		}
	}

	return nil, taskListOutput{Tasks: entries}, nil
}

func (b *Interface) handlePlanCreate(_ context.Context, _ *gomcp.CallToolRequest, input planCreateInput) (*gomcp.CallToolResult, planCreateOutput, error) {
	if b.taskReg == nil {
		return nil, planCreateOutput{}, fmt.Errorf("task registry not initialized")
	}

	p := &task.Plan{
		Frontmatter: task.PlanFrontmatter{
			ID: input.ID,
		},
		Body: input.Body,
	}

	if err := b.taskReg.WritePlan(p); err != nil {
		return nil, planCreateOutput{}, fmt.Errorf("writing plan: %w", err)
	}

	b.log.Info("mcp: plan created", "id", input.ID)

	return nil, planCreateOutput{
		Status: "created",
		ID:     input.ID,
		Path:   "quests/plans/" + input.ID + ".md",
	}, nil
}

func (b *Interface) handlePlanStatus(_ context.Context, _ *gomcp.CallToolRequest, input planStatusInput) (*gomcp.CallToolResult, planStatusOutput, error) {
	if b.taskReg == nil {
		return nil, planStatusOutput{}, fmt.Errorf("task registry not initialized")
	}

	expected := "[[" + input.ID + "]]"
	summaries, err := b.taskReg.ListTasks(func(t *task.Task) bool {
		return t.Frontmatter.Plan == expected
	})
	if err != nil {
		return nil, planStatusOutput{}, fmt.Errorf("listing plan tasks: %w", err)
	}

	completed := 0
	entries := make([]taskListEntry, len(summaries))
	for i, s := range summaries {
		if s.Status == task.StatusCompleted {
			completed++
		}
		entries[i] = taskListEntry{
			ID:         s.ID,
			Status:     string(s.Status),
			Tier:       string(s.Tier),
			Title:      s.Title,
			Tags:       s.Tags,
			AssignedTo: s.AssignedTo,
			BlockedBy:  s.BlockedBy,
			Updated:    s.Updated,
		}
	}

	return nil, planStatusOutput{
		ID:        input.ID,
		Status:    "active",
		Tasks:     entries,
		Completed: completed,
		Total:     len(entries),
	}, nil
}

func (b *Interface) handleTaskExecute(_ context.Context, _ *gomcp.CallToolRequest, input taskExecuteInput) (*gomcp.CallToolResult, taskExecuteOutput, error) {
	// Stub — orchestration loop implemented in Task 7.
	return nil, taskExecuteOutput{
		Status:  "not_implemented",
		Message: "Task execution orchestration is not yet wired. Use task_create/update to manage tasks manually, and quest_dispatch to execute them.",
	}, nil
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd storybook-daemon && go build ./...`
Expected: Success

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon
git add internal/psi/mcp/mcp.go
git commit -m "feat(mcp): add task_create/update/get/list and plan_create/status MCP tools"
```

---

## Task 7: Orchestration Loop

**Files:**

- Create: `storybook-daemon/internal/task/orchestrator.go`
- Create: `storybook-daemon/internal/task/orchestrator_test.go`
- Modify: `storybook-daemon/internal/psi/mcp/mcp.go` (wire handleTaskExecute to orchestrator)

### Concept

The Orchestrator reads task files, dispatches implementer allies via quest_dispatch, listens for stone results, runs review stages based on review_depth, updates task files, and regenerates the index. It uses the existing quest.Manager for dispatch and the Broker for stone communication.

- [ ] **Step 1: Define the Orchestrator interface contracts**

The orchestrator needs two interfaces from its consumers:

```go
// storybook-daemon/internal/task/orchestrator.go
package task

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// QuestDispatcher dispatches ally quests and checks their status.
// Defined in the consumer (task) package per Go convention.
type QuestDispatcher interface {
	Dispatch(ctx context.Context, sessionID string, req DispatchRequest) ([]QuestInfoSnapshot, string, error)
}

// DispatchRequest mirrors quest.DispatchRequest to avoid import cycle.
type DispatchRequest struct {
	Mode     string         `json:"mode"`
	Quests   []QuestReq     `json:"quests"`
	FailFast bool           `json:"fail_fast,omitempty"`
}

type QuestReq struct {
	Ally      string `json:"ally"`
	Task      string `json:"task"`
	Model     string `json:"model,omitempty"`
	TaskID    string `json:"task_id,omitempty"`
	TimeoutMs int    `json:"timeout_ms,omitempty"`
}

type QuestInfoSnapshot struct {
	QuestID string `json:"quest_id"`
	Status  string `json:"status"`
}

// StoneSender sends and receives stone messages.
type StoneSender interface {
	Send(ctx context.Context, sessionID string, msg StoneMsg) error
	Receive(ctx context.Context, sessionID, addressedTo, sinceID string, wait time.Duration) ([]StoneMsg, error)
}

// StoneMsg mirrors stone.Message to avoid import cycle.
type StoneMsg struct {
	ID          string         `json:"id"`
	From        string         `json:"from"`
	Addressing  string         `json:"addressing"`
	Type        string         `json:"type"`
	Content     string         `json:"content"`
	StatusCode  string         `json:"status_code,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	Timestamp   int64          `json:"timestamp"`
}

// Orchestrator drives the implement→review loop for tasks.
type Orchestrator struct {
	reg        *Registry
	dispatcher QuestDispatcher
	stone      StoneSender
	log        *slog.Logger
	maxRetries int

	mu      sync.Mutex
	running map[string]context.CancelFunc // taskID -> cancel
}

// NewOrchestrator creates an Orchestrator backed by the given registry,
// quest dispatcher, and stone sender.
func NewOrchestrator(reg *Registry, dispatcher QuestDispatcher, stone StoneSender, log *slog.Logger) *Orchestrator {
	return &Orchestrator{
		reg:        reg,
		dispatcher: dispatcher,
		stone:      stone,
		log:        log,
		maxRetries: 2,
		running:    make(map[string]context.CancelFunc),
	}
}

// Execute starts the implement→review loop for the given tasks.
// If parallel is true, independent tasks run concurrently.
// This method returns immediately; progress is reported via stone.
func (o *Orchestrator) Execute(ctx context.Context, sessionID string, taskIDs []string, parallel bool) error {
	if parallel {
		for _, id := range taskIDs {
			id := id
			go o.executeOne(ctx, sessionID, id)
		}
		return nil
	}

	go func() {
		for _, id := range taskIDs {
			if ctx.Err() != nil {
				return
			}
			o.executeOne(ctx, sessionID, id)
		}
	}()
	return nil
}

func (o *Orchestrator) executeOne(ctx context.Context, sessionID, taskID string) {
	taskCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	o.mu.Lock()
	o.running[taskID] = cancel
	o.mu.Unlock()
	defer func() {
		o.mu.Lock()
		delete(o.running, taskID)
		o.mu.Unlock()
	}()

	t, err := o.reg.ReadTask(taskID)
	if err != nil {
		o.log.Error("orchestrator: read task failed", "task", taskID, "err", err)
		return
	}

	// Check dependencies.
	for _, dep := range t.Frontmatter.BlockedBy {
		depTask, err := o.reg.ReadTask(dep)
		if err != nil || depTask.Frontmatter.Status != StatusCompleted {
			o.updateStatus(taskID, StatusBlocked)
			o.sendStatus(ctx, sessionID, taskID, "blocked", fmt.Sprintf("dependency %q not completed", dep))
			return
		}
	}

	// Phase 1: Implementation.
	o.updateStatus(taskID, StatusImplementing)
	implResult, statusCode, err := o.dispatchAndWait(taskCtx, sessionID, taskID, t, "implement")
	if err != nil {
		o.updateStatus(taskID, StatusFailed)
		o.sendStatus(ctx, sessionID, taskID, "failed", fmt.Sprintf("implementation dispatch failed: %v", err))
		return
	}

	// Save implementation output.
	o.reg.WriteReview(taskID, "implementation", implResult)

	if t.Frontmatter.ReviewDepth == ReviewNone || statusCode == string(CodeBlocked) || statusCode == string(CodeNeedsContext) {
		if statusCode == string(CodeBlocked) || statusCode == string(CodeNeedsContext) {
			o.updateStatus(taskID, StatusBlocked)
			o.sendStatus(ctx, sessionID, taskID, "blocked", implResult)
		} else {
			o.updateStatus(taskID, StatusCompleted)
			o.sendStatus(ctx, sessionID, taskID, "completed", "implementation complete (no review)")
		}
		o.reg.WriteIndex()
		return
	}

	// Phase 2: Spec review.
	o.updateStatus(taskID, StatusSpecReview)
	for attempt := 0; attempt <= o.maxRetries; attempt++ {
		reviewResult, reviewCode, err := o.dispatchAndWait(taskCtx, sessionID, taskID, t, "spec-review")
		if err != nil {
			o.updateStatus(taskID, StatusFailed)
			o.sendStatus(ctx, sessionID, taskID, "failed", fmt.Sprintf("spec review dispatch failed: %v", err))
			return
		}
		o.reg.WriteReview(taskID, "spec-review", reviewResult)

		if reviewCode == string(CodeDone) || reviewCode == string(CodeDoneWithConcerns) {
			break // spec review passed
		}

		if attempt < o.maxRetries {
			// Re-dispatch implementer with reviewer feedback.
			o.updateStatus(taskID, StatusImplementing)
			o.reg.UpdateTask(taskID, func(tk *task.Task) {
				tk.Body += fmt.Sprintf("\n\n## Spec Review Feedback (attempt %d)\n\n%s", attempt+1, reviewResult)
			})
			implResult, statusCode, err = o.dispatchAndWait(taskCtx, sessionID, taskID, t, "implement")
			if err != nil {
				o.updateStatus(taskID, StatusFailed)
				return
			}
			o.reg.WriteReview(taskID, "implementation", implResult)
			o.updateStatus(taskID, StatusSpecReview)
		} else {
			o.updateStatus(taskID, StatusFailed)
			o.sendStatus(ctx, sessionID, taskID, "failed", fmt.Sprintf("spec review failed after %d retries", o.maxRetries))
			o.reg.WriteIndex()
			return
		}
	}

	// Phase 3: Quality review (if two_stage).
	if t.Frontmatter.ReviewDepth == ReviewTwoStage {
		o.updateStatus(taskID, StatusQualityReview)
		for attempt := 0; attempt <= o.maxRetries; attempt++ {
			reviewResult, reviewCode, err := o.dispatchAndWait(taskCtx, sessionID, taskID, t, "quality-review")
			if err != nil {
				o.updateStatus(taskID, StatusFailed)
				o.sendStatus(ctx, sessionID, taskID, "failed", fmt.Sprintf("quality review dispatch failed: %v", err))
				return
			}
			o.reg.WriteReview(taskID, "quality-review", reviewResult)

			if reviewCode == string(CodeDone) || reviewCode == string(CodeDoneWithConcerns) {
				break
			}

			if attempt < o.maxRetries {
				o.updateStatus(taskID, StatusImplementing)
				o.reg.UpdateTask(taskID, func(tk *task.Task) {
					tk.Body += fmt.Sprintf("\n\n## Quality Review Feedback (attempt %d)\n\n%s", attempt+1, reviewResult)
				})
				implResult, _, err = o.dispatchAndWait(taskCtx, sessionID, taskID, t, "implement")
				if err != nil {
					o.updateStatus(taskID, StatusFailed)
					return
				}
				o.reg.WriteReview(taskID, "implementation", implResult)
				o.updateStatus(taskID, StatusQualityReview)
			} else {
				o.updateStatus(taskID, StatusFailed)
				o.sendStatus(ctx, sessionID, taskID, "failed", fmt.Sprintf("quality review failed after %d retries", o.maxRetries))
				o.reg.WriteIndex()
				return
			}
		}
	}

	// All reviews passed.
	o.updateStatus(taskID, StatusCompleted)
	o.sendStatus(ctx, sessionID, taskID, "completed", "all reviews passed")
	o.reg.WriteIndex()
}

func (o *Orchestrator) dispatchAndWait(ctx context.Context, sessionID, taskID string, t *Task, phase string) (string, string, error) {
	ally := o.allyForPhase(t.Frontmatter.Tier, phase)
	prompt := o.buildPrompt(t, phase)

	infos, _, err := o.dispatcher.Dispatch(ctx, sessionID, DispatchRequest{
		Mode: "single",
		Quests: []QuestReq{{
			Ally:   ally,
			Task:   prompt,
			TaskID: taskID,
		}},
	})
	if err != nil {
		return "", "", err
	}
	if len(infos) == 0 {
		return "", "", fmt.Errorf("no quest dispatched")
	}

	// Wait for result via stone. The ally will stone_send(type="result") when done.
	addressedTo := "primary-agent"
	deadline := 5 * time.Minute
	msgs, err := o.stone.Receive(ctx, sessionID, addressedTo, "", deadline)
	if err != nil {
		return "", "", fmt.Errorf("waiting for stone result: %w", err)
	}

	// Find the result message from this ally.
	for _, m := range msgs {
		if m.Type == "result" {
			return m.Content, m.StatusCode, nil
		}
	}

	return "", "", fmt.Errorf("no result message received within deadline")
}

func (o *Orchestrator) allyForPhase(tier Tier, phase string) string {
	switch phase {
	case "implement":
		switch tier {
		case TierKobold:
			return "keen-kobold-scout"
		case TierDragon:
			return "dread-dragon-planner"
		default:
			return "grim-griffin-coder"
		}
	case "spec-review", "quality-review":
		switch tier {
		case TierDragon:
			return "dread-dragon-reviewer"
		default:
			return "grim-griffin-reviewer"
		}
	default:
		return "keen-kobold-scout"
	}
}

func (o *Orchestrator) buildPrompt(t *Task, phase string) string {
	switch phase {
	case "implement":
		return fmt.Sprintf("You are implementing a task. Complete the work described below and report your result via stone_send(type=\"result\").\n\nInclude a status_code in your result: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.\n\n---\n\n%s", t.Body)
	case "spec-review":
		return fmt.Sprintf("You are reviewing an implementation for spec compliance. Read the task description and the implementation output. Report DONE if it meets all acceptance criteria, or DONE_WITH_CONCERNS/BLOCKED with specific issues.\n\n---\n\nTask:\n%s", t.Body)
	case "quality-review":
		return fmt.Sprintf("You are reviewing code quality. The implementation passed spec review. Check for: correctness, error handling, performance, maintainability. Report DONE or DONE_WITH_CONCERNS with specific issues.\n\n---\n\nTask:\n%s", t.Body)
	default:
		return t.Body
	}
}

func (o *Orchestrator) updateStatus(taskID string, status Status) {
	o.reg.UpdateTask(taskID, func(t *Task) {
		t.Frontmatter.Status = status
	})
}

func (o *Orchestrator) sendStatus(ctx context.Context, sessionID, taskID, status, message string) {
	o.stone.Send(ctx, sessionID, StoneMsg{
		From:       "orchestrator",
		Addressing: "primary-agent",
		Type:       "status",
		Content:    fmt.Sprintf("[task:%s] %s: %s", taskID, status, message),
	})
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd storybook-daemon && go build ./internal/task/`
Expected: Success

- [ ] **Step 3: Write orchestrator test with mock dispatcher and stone**

```go
// storybook-daemon/internal/task/orchestrator_test.go
package task_test

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/task"
)

type mockDispatcher struct {
	dispatched []task.DispatchRequest
}

func (m *mockDispatcher) Dispatch(_ context.Context, _ string, req task.DispatchRequest) ([]task.QuestInfoSnapshot, string, error) {
	m.dispatched = append(m.dispatched, req)
	return []task.QuestInfoSnapshot{{QuestID: "q-1", Status: "pending"}}, "", nil
}

type mockStone struct {
	resultContent    string
	resultStatusCode string
}

func (m *mockStone) Send(_ context.Context, _ string, _ task.StoneMsg) error { return nil }
func (m *mockStone) Receive(_ context.Context, _, _, _ string, _ time.Duration) ([]task.StoneMsg, error) {
	return []task.StoneMsg{{
		Type:       "result",
		Content:    m.resultContent,
		StatusCode: m.resultStatusCode,
	}}, nil
}

func TestOrchestratorNoReview(t *testing.T) {
	dir := t.TempDir()
	reg, _ := task.NewRegistry(dir)

	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{
			ID:          "simple-task",
			Status:      task.StatusPending,
			Tier:        task.TierKobold,
			ReviewDepth: task.ReviewNone,
		},
		Body: "# Simple Task\nCount fish files.",
	})

	disp := &mockDispatcher{}
	stone := &mockStone{resultContent: "found 3 files", resultStatusCode: "DONE"}

	orch := task.NewOrchestrator(reg, disp, stone, slog.Default())
	orch.Execute(context.Background(), "s1", []string{"simple-task"}, false)

	// Give the goroutine time to complete.
	time.Sleep(100 * time.Millisecond)

	tk, _ := reg.ReadTask("simple-task")
	if tk.Frontmatter.Status != task.StatusCompleted {
		t.Errorf("status = %q, want %q", tk.Frontmatter.Status, task.StatusCompleted)
	}
	if len(disp.dispatched) != 1 {
		t.Errorf("dispatched %d quests, want 1", len(disp.dispatched))
	}
}

func TestOrchestratorWithSpecReview(t *testing.T) {
	dir := t.TempDir()
	reg, _ := task.NewRegistry(dir)

	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{
			ID:          "reviewed-task",
			Status:      task.StatusPending,
			Tier:        task.TierGriffin,
			ReviewDepth: task.ReviewSingle,
		},
		Body: "# Reviewed Task\nFix the bug.",
	})

	disp := &mockDispatcher{}
	stone := &mockStone{resultContent: "fixed", resultStatusCode: "DONE"}

	orch := task.NewOrchestrator(reg, disp, stone, slog.Default())
	orch.Execute(context.Background(), "s1", []string{"reviewed-task"}, false)

	time.Sleep(200 * time.Millisecond)

	tk, _ := reg.ReadTask("reviewed-task")
	if tk.Frontmatter.Status != task.StatusCompleted {
		t.Errorf("status = %q, want %q", tk.Frontmatter.Status, task.StatusCompleted)
	}
	// Should dispatch: implement + spec-review = 2.
	if len(disp.dispatched) != 2 {
		t.Errorf("dispatched %d quests, want 2 (implement + spec review)", len(disp.dispatched))
	}
}

func TestOrchestratorBlockedDependency(t *testing.T) {
	dir := t.TempDir()
	reg, _ := task.NewRegistry(dir)

	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{ID: "dep-task", Status: task.StatusPending, Tier: task.TierKobold},
		Body:        "# Dep\nNot done yet.",
	})
	reg.WriteTask(&task.Task{
		Frontmatter: task.Frontmatter{
			ID:        "blocked-task",
			Status:    task.StatusPending,
			Tier:      task.TierKobold,
			BlockedBy: []string{"dep-task"},
		},
		Body: "# Blocked\nNeeds dep.",
	})

	disp := &mockDispatcher{}
	stone := &mockStone{resultContent: "n/a", resultStatusCode: "DONE"}

	orch := task.NewOrchestrator(reg, disp, stone, slog.Default())
	orch.Execute(context.Background(), "s1", []string{"blocked-task"}, false)

	time.Sleep(100 * time.Millisecond)

	tk, _ := reg.ReadTask("blocked-task")
	if tk.Frontmatter.Status != task.StatusBlocked {
		t.Errorf("status = %q, want %q", tk.Frontmatter.Status, task.StatusBlocked)
	}
	if len(disp.dispatched) != 0 {
		t.Errorf("dispatched %d quests, want 0 (should be blocked)", len(disp.dispatched))
	}
}
```

- [ ] **Step 4: Run orchestrator tests**

Run: `cd storybook-daemon && go test ./internal/task/ -v`
Expected: All PASS

- [ ] **Step 5: Wire handleTaskExecute to the orchestrator**

In `mcp.go`, add `orchestrator *task.Orchestrator` field to Interface struct.

In `New()`, after creating `taskReg`:

```go
	var orch *task.Orchestrator
	if taskReg != nil {
		// Adapter: bridge quest.Manager to task.QuestDispatcher interface.
		// This will be a thin wrapper created in a follow-up or inline here.
		orch = task.NewOrchestrator(taskReg, nil, nil, log)
	}
```

Replace the `handleTaskExecute` stub body:

```go
func (b *Interface) handleTaskExecute(ctx context.Context, _ *gomcp.CallToolRequest, input taskExecuteInput) (*gomcp.CallToolResult, taskExecuteOutput, error) {
	if b.taskReg == nil {
		return nil, taskExecuteOutput{}, fmt.Errorf("task registry not initialized")
	}

	// TODO: wire orchestrator with real dispatcher/stone adapters in Task 8.
	return nil, taskExecuteOutput{
		Status:  "accepted",
		Message: fmt.Sprintf("Execution started for %d task(s)", len(input.IDs)),
	}, nil
}
```

- [ ] **Step 6: Verify all tests pass**

Run: `cd storybook-daemon && go test ./... 2>&1 | tail -20`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
cd storybook-daemon
git add internal/task/orchestrator.go internal/task/orchestrator_test.go internal/psi/mcp/mcp.go
git commit -m "feat(task): add orchestration loop with implement→review state machine"
```

---

## Task 8: Wire Orchestrator to Real Quest/Stone Adapters

**Files:**

- Create: `storybook-daemon/internal/task/adapters.go`
- Modify: `storybook-daemon/internal/psi/mcp/mcp.go` (wire real adapters in New, update handleTaskExecute)

- [ ] **Step 1: Create adapter wrappers**

The orchestrator uses its own interface types to avoid import cycles. We need thin adapters that wrap the real `quest.Manager` and `mcp.Broker`.

```go
// storybook-daemon/internal/task/adapters.go
package task

import (
	"context"
	"time"
)

// QuestManagerAdapter wraps a quest.Manager behind the QuestDispatcher interface.
// The concrete type is provided by the caller to avoid import cycles.
type QuestManagerAdapter struct {
	DispatchFn func(ctx context.Context, sessionID string, mode string, quests []QuestReq, failFast bool) ([]QuestInfoSnapshot, string, error)
}

func (a *QuestManagerAdapter) Dispatch(ctx context.Context, sessionID string, req DispatchRequest) ([]QuestInfoSnapshot, string, error) {
	return a.DispatchFn(ctx, sessionID, req.Mode, req.Quests, req.FailFast)
}

// BrokerAdapter wraps a stone Broker behind the StoneSender interface.
type BrokerAdapter struct {
	SendFn    func(ctx context.Context, sessionID string, msg StoneMsg) error
	ReceiveFn func(ctx context.Context, sessionID, addressedTo, sinceID string, wait time.Duration) ([]StoneMsg, error)
}

func (a *BrokerAdapter) Send(ctx context.Context, sessionID string, msg StoneMsg) error {
	return a.SendFn(ctx, sessionID, msg)
}

func (a *BrokerAdapter) Receive(ctx context.Context, sessionID, addressedTo, sinceID string, wait time.Duration) ([]StoneMsg, error) {
	return a.ReceiveFn(ctx, sessionID, addressedTo, sinceID, wait)
}
```

- [ ] **Step 2: Wire adapters in mcp.go New()**

In `New()`, replace the `orch` creation with:

```go
	var orch *task.Orchestrator
	if taskReg != nil {
		questAdapter := &task.QuestManagerAdapter{
			DispatchFn: func(ctx context.Context, sessionID, mode string, quests []task.QuestReq, failFast bool) ([]task.QuestInfoSnapshot, string, error) {
				qReqs := make([]quest.QuestRequest, len(quests))
				for i, q := range quests {
					qReqs[i] = quest.QuestRequest{
						Ally:   q.Ally,
						Task:   q.Task,
						Model:  q.Model,
						TaskID: q.TaskID,
					}
				}
				infos, groupID, err := qm.Dispatch(ctx, sessionID, quest.DispatchRequest{
					Mode:     mode,
					Quests:   qReqs,
					FailFast: failFast,
				})
				if err != nil {
					return nil, "", err
				}
				snapshots := make([]task.QuestInfoSnapshot, len(infos))
				for i, info := range infos {
					snapshots[i] = task.QuestInfoSnapshot{
						QuestID: info.QuestID,
						Status:  string(info.Status),
					}
				}
				return snapshots, groupID, nil
			},
		}

		stoneAdapter := &task.BrokerAdapter{
			SendFn: func(ctx context.Context, sessionID string, msg task.StoneMsg) error {
				return broker.Send(ctx, sessionID, stone.Message{
					ID:         msg.ID,
					From:       msg.From,
					Addressing: msg.Addressing,
					Type:       msg.Type,
					Content:    msg.Content,
					StatusCode: msg.StatusCode,
					Metadata:   msg.Metadata,
					Timestamp:  msg.Timestamp,
				})
			},
			ReceiveFn: func(ctx context.Context, sessionID, addressedTo, sinceID string, wait time.Duration) ([]task.StoneMsg, error) {
				msgs, err := broker.Receive(ctx, sessionID, addressedTo, sinceID, wait)
				if err != nil {
					return nil, err
				}
				result := make([]task.StoneMsg, len(msgs))
				for i, m := range msgs {
					result[i] = task.StoneMsg{
						ID:         m.ID,
						From:       m.From,
						Addressing: m.Addressing,
						Type:       m.Type,
						Content:    m.Content,
						StatusCode: m.StatusCode,
						Metadata:   m.Metadata,
						Timestamp:  m.Timestamp,
					}
				}
				return result, nil
			},
		}

		orch = task.NewOrchestrator(taskReg, questAdapter, stoneAdapter, log)
	}
```

Add `orchestrator: orch` to the Interface return.

- [ ] **Step 3: Update handleTaskExecute to use the orchestrator**

```go
func (b *Interface) handleTaskExecute(ctx context.Context, _ *gomcp.CallToolRequest, input taskExecuteInput) (*gomcp.CallToolResult, taskExecuteOutput, error) {
	if b.taskReg == nil || b.orchestrator == nil {
		return nil, taskExecuteOutput{}, fmt.Errorf("task system not initialized")
	}

	if err := b.orchestrator.Execute(ctx, input.SessionID, input.IDs, input.Parallel); err != nil {
		return nil, taskExecuteOutput{}, fmt.Errorf("starting task execution: %w", err)
	}

	return nil, taskExecuteOutput{
		Status:  "accepted",
		Message: fmt.Sprintf("Execution started for %d task(s). Progress arrives via stone.", len(input.IDs)),
	}, nil
}
```

- [ ] **Step 4: Verify compilation and tests**

Run: `cd storybook-daemon && go build ./... && go test ./... 2>&1 | tail -20`
Expected: All build + all tests PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon
git add internal/task/adapters.go internal/psi/mcp/mcp.go
git commit -m "feat(task): wire orchestrator to real quest manager and stone broker via adapters"
```

---

## Task 9: Pi-Side Stone Port Discovery for Federation

**Files:**

- Modify: `berrygems/extensions/hoard-sending-stone/index.ts`

The pi-side stone already writes its port to `~/.pi/hoard-sending-stone.json` on startup. The daemon needs to discover this port when it dispatches pi allies so it can activate the federation bridge. There are two integration paths:

**Path A (daemon reads discovery file):** When the daemon dispatches a pi ally, it reads `~/.pi/hoard-sending-stone.json` to find the pi stone port, then calls `federation.Bridge()` for that session. This requires no pi-side changes — the daemon just checks the file before dispatching.

**Path B (pi tells daemon via MCP):** Pi primary sessions call `register_session` on the daemon MCP and include `stone_port`. This requires a pi-side daemon connector extension or a hook in hoard-sending-stone that calls the daemon after the stone HTTP server starts.

Path A is simpler and doesn't require pi-side changes. The daemon already has filesystem access.

- [ ] **Step 1: Add stone port discovery to daemon quest dispatch**

In `storybook-daemon/internal/quest/command.go`, add a function that reads the pi stone port:

```go
// discoverPiStonePort reads ~/.pi/hoard-sending-stone.json for the pi-side stone port.
// Returns 0 if the file doesn't exist or is unreadable.
func discoverPiStonePort() int {
	home, err := os.UserHomeDir()
	if err != nil {
		return 0
	}
	data, err := os.ReadFile(filepath.Join(home, ".pi", "hoard-sending-stone.json"))
	if err != nil {
		return 0
	}
	var info struct {
		Port int `json:"port"`
	}
	if json.Unmarshal(data, &info) != nil {
		return 0
	}
	return info.Port
}
```

- [ ] **Step 2: Wire discovery into federation activation**

In `storybook-daemon/internal/psi/mcp/mcp.go`, after the quest manager dispatches a pi-harness quest, check for the pi stone port and bridge:

Add a method to Interface:

```go
// BridgePiStoneIfNeeded checks for a running pi stone server and activates
// the federation bridge for the given session.
func (b *Interface) BridgePiStoneIfNeeded(sessionID string) {
	port := quest.DiscoverPiStonePort()
	if port > 0 && port != b.port {
		stoneURL := fmt.Sprintf("http://127.0.0.1:%d", port)
		b.federation.Bridge(context.Background(), sessionID, stoneURL)
		b.log.Info("mcp: pi stone federation auto-bridged",
			"session_id", sessionID,
			"pi_stone_port", port,
		)
	}
}
```

Call this from `handleQuestDispatch` after dispatching pi-harness quests.

- [ ] **Step 3: Test federation activation**

Start daemon, start a pi session (which writes `~/.pi/hoard-sending-stone.json`), dispatch a quest from CC. Check daemon logs for "pi stone federation auto-bridged".

- [ ] **Step 4: Commit**

```bash
cd storybook-daemon
git add internal/quest/command.go internal/psi/mcp/mcp.go
git commit -m "feat(stone): auto-discover pi stone port and activate federation bridge on dispatch"
```

---

## Task 10: Graphify Integration

**Files:**

- Create: `storybook-daemon/internal/graphify/graphify.go`

The daemon triggers graphify rebuilds when task files change and queries the graph for context enrichment before dispatching allies.

- [ ] **Step 1: Create graphify package with rebuild trigger**

```go
// storybook-daemon/internal/graphify/graphify.go
package graphify

import (
	"fmt"
	"log/slog"
	"os/exec"
	"sync"
	"time"
)

// Hooks provides graphify rebuild and query capabilities.
type Hooks struct {
	vaults []string // paths to index
	log    *slog.Logger

	mu          sync.Mutex
	lastRebuild time.Time
	debounce    time.Duration
}

// NewHooks creates graphify hooks for the given vault paths.
func NewHooks(vaults []string, log *slog.Logger) *Hooks {
	return &Hooks{
		vaults:   vaults,
		log:      log,
		debounce: 5 * time.Second,
	}
}

// TriggerRebuild runs graphify on the configured vault paths.
// Debounced: ignores calls within 5s of the last rebuild.
func (h *Hooks) TriggerRebuild() {
	h.mu.Lock()
	if time.Since(h.lastRebuild) < h.debounce {
		h.mu.Unlock()
		return
	}
	h.lastRebuild = time.Now()
	h.mu.Unlock()

	for _, vault := range h.vaults {
		cmd := exec.Command("python3", "-c",
			fmt.Sprintf("from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('%s'))", vault))
		if out, err := cmd.CombinedOutput(); err != nil {
			h.log.Warn("graphify rebuild failed", "vault", vault, "err", err, "output", string(out))
		} else {
			h.log.Info("graphify rebuild complete", "vault", vault)
		}
	}
}

// QueryRelated searches the graphify graph for nodes related to the given
// tags and wikilinks. Returns markdown snippets suitable for injection into
// ally prompts. This is a placeholder for the graph query interface —
// the actual implementation depends on graphify's query API.
func (h *Hooks) QueryRelated(tags []string, wikilinks []string) string {
	// TODO: implement actual graphify graph query.
	// For now, return empty — allies work without enrichment,
	// and this gets wired once graphify's query API is stable.
	return ""
}
```

- [ ] **Step 2: Wire rebuild hook into registry writes**

In `storybook-daemon/internal/psi/mcp/mcp.go`, add `graphify *graphify.Hooks` field to Interface.

In `New()`, create the hooks:

```go
	var gh *graphify.Hooks
	if taskReg != nil {
		gh = graphify.NewHooks([]string{questsDir}, log)
	}
```

In `handleTaskCreate` and `handleTaskUpdate`, after `b.taskReg.WriteIndex()`:

```go
	if b.graphify != nil {
		go b.graphify.TriggerRebuild()
	}
```

- [ ] **Step 3: Verify compilation**

Run: `cd storybook-daemon && go build ./...`
Expected: Success

- [ ] **Step 4: Commit**

```bash
cd storybook-daemon
git add internal/graphify/graphify.go internal/psi/mcp/mcp.go
git commit -m "feat(graphify): add rebuild hooks triggered on task registry writes"
```

---

## Task 11: Update Skills and Agent Definitions

**Files:**

- Modify: `morsels/skills/hoard-allies/SKILL.md`
- Modify: `den/features/hoard-allies/AGENTS.md`

- [ ] **Step 1: Update hoard:quest SKILL.md**

Add task workflow documentation to the skill: how to create plans, register tasks, kick off execution, and monitor progress. Include the status codes, tier-based review depth, and the new MCP tools.

- [ ] **Step 2: Update AGENTS.md**

Add Phase N (next available) documenting the task registry and orchestration loop: what was built, what tools are available, what the implement→review flow looks like.

- [ ] **Step 3: Commit**

```bash
git add morsels/skills/hoard-allies/SKILL.md den/features/hoard-allies/AGENTS.md
git commit -m "docs(allies): document task registry, orchestration loop, and new MCP tools"
```
