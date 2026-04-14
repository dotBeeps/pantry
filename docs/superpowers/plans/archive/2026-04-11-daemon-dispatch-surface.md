# Daemon Dispatch Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement quest dispatch, stone broker, and taxonomy resolution in storybook-daemon so it can spawn and manage `claude` and `pi` ally subprocesses via MCP tools.

**Architecture:** New `internal/quest/` package owns subprocess lifecycle and taxonomy. Stone broker lives in `internal/psi/mcp/` alongside existing MCP handlers. Quest manager is injected into the MCP Interface, which exposes `quest_dispatch`, `quest_status`, `quest_cancel`, `stone_send`, and `stone_receive` as MCP tools. All state is in-memory, session-scoped, ephemeral.

**Tech Stack:** Go 1.25, `github.com/modelcontextprotocol/go-sdk` (MCP), `os/exec` (subprocess), `log/slog` (logging)

**Spec:** `den/features/dragon-daemon/dispatch-surface-spec.md`
**Stone broker spec:** `den/features/hoard-sending-stone/AGENTS.md` (Stage 3 section)
**Taxonomy reference:** `berrygems/lib/ally-taxonomy.ts`, `berrygems/extensions/hoard-allies/index.ts`

**Prerequisite:** Stone broker (Tasks 1-3) must land before quest dispatch (Tasks 4+) can deliver results. Both tracks can develop in parallel — quest dispatch can be tested with mock commands before stone integration.

---

### Task 1: Stone message types

**Files:**

- Create: `storybook-daemon/internal/psi/mcp/stone_types.go`

- [ ] **Step 1: Write the failing test**

Create `storybook-daemon/internal/psi/mcp/stone_types_test.go`:

```go
package mcp

import (
	"encoding/json"
	"testing"
)

func TestStoneMessageJSON(t *testing.T) {
	msg := StoneMessage{
		ID:         "msg-1",
		From:       "silly-kobold-scout",
		Addressing: "primary-agent",
		Type:       "result",
		Content:    "Found 3 files matching the pattern.",
		Timestamp:  1712880000,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got StoneMessage
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.From != msg.From {
		t.Errorf("From = %q, want %q", got.From, msg.From)
	}
	if got.Addressing != msg.Addressing {
		t.Errorf("Addressing = %q, want %q", got.Addressing, msg.Addressing)
	}
	if got.Type != msg.Type {
		t.Errorf("Type = %q, want %q", got.Type, msg.Type)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestStoneMessageJSON -v`
Expected: FAIL — `StoneMessage` undefined

- [ ] **Step 3: Write the types**

Create `storybook-daemon/internal/psi/mcp/stone_types.go`:

```go
package mcp

// StoneMessage mirrors the pi-side StoneMessage schema.
// See den/features/hoard-sending-stone/AGENTS.md for the canonical spec.
type StoneMessage struct {
	ID          string         `json:"id"`
	From        string         `json:"from"`
	DisplayName string         `json:"displayName,omitempty"`
	Addressing  string         `json:"addressing"`
	Type        string         `json:"type"`
	Content     string         `json:"content"`
	Color       string         `json:"color,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	Timestamp   int64          `json:"timestamp"`
}

// STONE_KEY is the global symbol key for the stone API.
const STONE_KEY = "hoard.stone"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestStoneMessageJSON -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/stone_types.go internal/psi/mcp/stone_types_test.go
git commit -m "feat(daemon): add StoneMessage types for stone broker"
```

---

### Task 2: Stone broker — ring buffer and send

**Files:**

- Create: `storybook-daemon/internal/psi/mcp/stone_broker.go`
- Create: `storybook-daemon/internal/psi/mcp/stone_broker_test.go`

- [ ] **Step 1: Write failing tests for broker send and history**

Create `storybook-daemon/internal/psi/mcp/stone_broker_test.go`:

```go
package mcp

import (
	"context"
	"testing"
	"time"
)

func TestBrokerSendUnknownSession(t *testing.T) {
	b := NewBroker(100)
	err := b.Send(context.Background(), "no-such-session", StoneMessage{
		From:       "test",
		Addressing: "primary-agent",
		Type:       "result",
		Content:    "hello",
	})
	if err == nil {
		t.Fatal("expected error for unknown session")
	}
}

func TestBrokerSendAndHistory(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")

	msg := StoneMessage{
		From:       "scout",
		Addressing: "primary-agent",
		Type:       "result",
		Content:    "found it",
	}
	if err := b.Send(context.Background(), "s1", msg); err != nil {
		t.Fatalf("send: %v", err)
	}

	msgs := b.History("s1", "")
	if len(msgs) != 1 {
		t.Fatalf("history len = %d, want 1", len(msgs))
	}
	if msgs[0].Content != "found it" {
		t.Errorf("content = %q, want %q", msgs[0].Content, "found it")
	}
	if msgs[0].ID == "" {
		t.Error("expected auto-assigned ID")
	}
	if msgs[0].Timestamp == 0 {
		t.Error("expected auto-assigned timestamp")
	}
}

func TestBrokerHistorySinceID(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")

	for i := 0; i < 3; i++ {
		_ = b.Send(context.Background(), "s1", StoneMessage{
			From:    "scout",
			Addressing: "primary-agent",
			Type:    "progress",
			Content: "msg",
		})
	}

	all := b.History("s1", "")
	if len(all) != 3 {
		t.Fatalf("history len = %d, want 3", len(all))
	}

	since := b.History("s1", all[1].ID)
	if len(since) != 1 {
		t.Fatalf("since len = %d, want 1", len(since))
	}
	if since[0].ID != all[2].ID {
		t.Errorf("since[0].ID = %q, want %q", since[0].ID, all[2].ID)
	}
}

func TestBrokerRingOverflow(t *testing.T) {
	b := NewBroker(3)
	b.RegisterSession("s1")

	for i := 0; i < 5; i++ {
		_ = b.Send(context.Background(), "s1", StoneMessage{
			From:    "scout",
			Addressing: "primary-agent",
			Type:    "progress",
			Content: "msg",
		})
	}

	msgs := b.History("s1", "")
	if len(msgs) != 3 {
		t.Fatalf("history len = %d, want 3 (ring cap)", len(msgs))
	}
}

func TestBrokerUnregisterSession(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")
	_ = b.Send(context.Background(), "s1", StoneMessage{
		From: "test", Addressing: "primary-agent", Type: "result", Content: "x",
	})
	b.UnregisterSession("s1")

	msgs := b.History("s1", "")
	if len(msgs) != 0 {
		t.Fatalf("expected empty history after unregister, got %d", len(msgs))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestBroker -v`
Expected: FAIL — `NewBroker` undefined

- [ ] **Step 3: Implement the broker**

Create `storybook-daemon/internal/psi/mcp/stone_broker.go`:

```go
package mcp

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Broker is an in-process message broker for stone messages.
// Each registered session gets its own ring buffer.
type Broker struct {
	mu       sync.Mutex
	sessions map[string]*sessionRing
	cap      int
	nextID   atomic.Int64
}

type sessionRing struct {
	msgs []StoneMessage
	subs []chan StoneMessage
}

func NewBroker(ringCap int) *Broker {
	return &Broker{
		sessions: make(map[string]*sessionRing),
		cap:      ringCap,
	}
}

func (b *Broker) RegisterSession(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.sessions[sessionID]; !ok {
		b.sessions[sessionID] = &sessionRing{}
	}
}

func (b *Broker) UnregisterSession(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if ring, ok := b.sessions[sessionID]; ok {
		for _, ch := range ring.subs {
			close(ch)
		}
	}
	delete(b.sessions, sessionID)
}

func (b *Broker) Send(_ context.Context, sessionID string, msg StoneMessage) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	ring, ok := b.sessions[sessionID]
	if !ok {
		return fmt.Errorf("unknown session: %s", sessionID)
	}

	if msg.ID == "" {
		msg.ID = "stone-" + strconv.FormatInt(b.nextID.Add(1), 10)
	}
	if msg.Timestamp == 0 {
		msg.Timestamp = time.Now().UnixMilli()
	}

	ring.msgs = append(ring.msgs, msg)
	if len(ring.msgs) > b.cap {
		ring.msgs = ring.msgs[len(ring.msgs)-b.cap:]
	}

	for _, ch := range ring.subs {
		select {
		case ch <- msg:
		default:
		}
	}

	return nil
}

func (b *Broker) History(sessionID string, sinceID string) []StoneMessage {
	b.mu.Lock()
	defer b.mu.Unlock()

	ring, ok := b.sessions[sessionID]
	if !ok {
		return nil
	}

	if sinceID == "" {
		out := make([]StoneMessage, len(ring.msgs))
		copy(out, ring.msgs)
		return out
	}

	for i, m := range ring.msgs {
		if m.ID == sinceID && i+1 < len(ring.msgs) {
			out := make([]StoneMessage, len(ring.msgs)-i-1)
			copy(out, ring.msgs[i+1:])
			return out
		}
	}
	return nil
}

// Subscribe returns a channel that receives new messages for this session.
// Close the returned cancel func to unsubscribe.
func (b *Broker) Subscribe(sessionID string) (<-chan StoneMessage, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ring, ok := b.sessions[sessionID]
	if !ok {
		ch := make(chan StoneMessage)
		close(ch)
		return ch, func() {}
	}

	ch := make(chan StoneMessage, 16)
	ring.subs = append(ring.subs, ch)

	return ch, func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		ring2, ok2 := b.sessions[sessionID]
		if !ok2 {
			return
		}
		for i, sub := range ring2.subs {
			if sub == ch {
				ring2.subs = append(ring2.subs[:i], ring2.subs[i+1:]...)
				break
			}
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestBroker -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/stone_broker.go internal/psi/mcp/stone_broker_test.go
git commit -m "feat(daemon): stone broker with per-session ring buffer"
```

---

### Task 3: Stone broker — long-poll receive

**Files:**

- Modify: `storybook-daemon/internal/psi/mcp/stone_broker_test.go`
- Modify: `storybook-daemon/internal/psi/mcp/stone_broker.go`

- [ ] **Step 1: Write failing test for Receive with long-poll**

Append to `stone_broker_test.go`:

```go
func TestBrokerReceiveLongPoll(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")

	go func() {
		time.Sleep(50 * time.Millisecond)
		_ = b.Send(context.Background(), "s1", StoneMessage{
			From:       "scout",
			Addressing: "primary-agent",
			Type:       "result",
			Content:    "delayed result",
		})
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	msgs, err := b.Receive(ctx, "s1", "primary-agent", "", 200*time.Millisecond)
	if err != nil {
		t.Fatalf("receive: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("receive len = %d, want 1", len(msgs))
	}
	if msgs[0].Content != "delayed result" {
		t.Errorf("content = %q, want %q", msgs[0].Content, "delayed result")
	}
}

func TestBrokerReceiveFiltersAddressing(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")

	_ = b.Send(context.Background(), "s1", StoneMessage{
		From: "scout", Addressing: "other-ally", Type: "progress", Content: "not for me",
	})
	_ = b.Send(context.Background(), "s1", StoneMessage{
		From: "scout", Addressing: "primary-agent", Type: "result", Content: "for me",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	msgs, err := b.Receive(ctx, "s1", "primary-agent", "", 50*time.Millisecond)
	if err != nil {
		t.Fatalf("receive: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("receive len = %d, want 1", len(msgs))
	}
	if msgs[0].Content != "for me" {
		t.Errorf("content = %q", msgs[0].Content)
	}
}

func TestBrokerReceiveTimeout(t *testing.T) {
	b := NewBroker(100)
	b.RegisterSession("s1")

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	msgs, err := b.Receive(ctx, "s1", "primary-agent", "", 50*time.Millisecond)
	if err != nil {
		t.Fatalf("receive: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("receive len = %d, want 0 (timeout)", len(msgs))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestBrokerReceive -v`
Expected: FAIL — `Receive` method undefined

- [ ] **Step 3: Implement Receive with long-poll**

Add to `stone_broker.go`:

```go
// Receive returns messages addressed to `addressedTo` in the given session.
// If no messages are available, it long-polls up to waitMs.
// Messages addressed to "session-room" are included for all recipients.
func (b *Broker) Receive(ctx context.Context, sessionID, addressedTo, sinceID string, waitDur time.Duration) ([]StoneMessage, error) {
	existing := b.filterAddressed(b.History(sessionID, sinceID), addressedTo)
	if len(existing) > 0 {
		return existing, nil
	}

	ch, unsub := b.Subscribe(sessionID)
	defer unsub()

	timer := time.NewTimer(waitDur)
	defer timer.Stop()

	var collected []StoneMessage
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return collected, nil
			}
			if msg.Addressing == addressedTo || msg.Addressing == "session-room" {
				collected = append(collected, msg)
				return collected, nil
			}
		case <-timer.C:
			return collected, nil
		case <-ctx.Done():
			return collected, ctx.Err()
		}
	}
}

func (b *Broker) filterAddressed(msgs []StoneMessage, addressedTo string) []StoneMessage {
	var out []StoneMessage
	for _, m := range msgs {
		if m.Addressing == addressedTo || m.Addressing == "session-room" {
			out = append(out, m)
		}
	}
	return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -run TestBrokerReceive -v`
Expected: all PASS

- [ ] **Step 5: Run full test suite**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -v`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/stone_broker.go internal/psi/mcp/stone_broker_test.go
git commit -m "feat(daemon): stone broker long-poll receive with addressing filter"
```

---

### Task 4: Stone MCP handlers — wire stone_send and stone_receive

**Files:**

- Modify: `storybook-daemon/internal/psi/mcp/mcp.go`

- [ ] **Step 1: Define input/output types for stone tools**

Add to the "Tool input/output types" section of `mcp.go`:

```go
type stoneSendInput struct {
	SessionID string         `json:"session_id" jsonschema:"session that owns this message"`
	From      string         `json:"from" jsonschema:"sender identifier (defName or primary-agent)"`
	To        string         `json:"to" jsonschema:"recipient: primary-agent, session-room, or ally defName"`
	Type      string         `json:"type" jsonschema:"message type: result, progress, question, check_in, status"`
	Content   string         `json:"content" jsonschema:"message content"`
	Metadata  map[string]any `json:"metadata,omitempty" jsonschema:"optional metadata"`
}

type stoneSendOutput struct {
	Status    string `json:"status"`
	ID        string `json:"id"`
	Timestamp int64  `json:"timestamp"`
}

type stoneReceiveInput struct {
	SessionID   string `json:"session_id" jsonschema:"session to receive messages from"`
	AddressedTo string `json:"addressed_to" jsonschema:"filter: only messages addressed to this ID"`
	WaitMs      int    `json:"wait_ms,omitempty" jsonschema:"long-poll timeout in ms (default 60000, max 120000)"`
	SinceID     string `json:"since_id,omitempty" jsonschema:"only return messages after this ID"`
}

type stoneReceiveOutput struct {
	Messages []StoneMessage `json:"messages"`
}
```

- [ ] **Step 2: Add Broker field to Interface and constructor**

In `mcp.go`, add `broker *Broker` to the `Interface` struct and update `New()`:

```go
type Interface struct {
	id     string
	port   int
	vault  *memory.Vault
	ledger *attention.Ledger
	broker *Broker
	log    *slog.Logger

	mu       sync.Mutex
	sessions map[string]session

	server *http.Server
	cancel context.CancelFunc
}

func New(id string, port int, vault *memory.Vault, ledger *attention.Ledger, log *slog.Logger) *Interface {
	return &Interface{
		id:       id,
		port:     port,
		vault:    vault,
		ledger:   ledger,
		broker:   NewBroker(256),
		log:      log,
		sessions: make(map[string]session),
	}
}
```

- [ ] **Step 3: Implement handleStoneSend and handleStoneReceive**

Add to `mcp.go`:

```go
func (b *Interface) handleStoneSend(ctx context.Context, _ *gomcp.CallToolRequest, input stoneSendInput) (*gomcp.CallToolResult, stoneSendOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, stoneSendOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	msg := StoneMessage{
		From:       input.From,
		Addressing: input.To,
		Type:       input.Type,
		Content:    input.Content,
		Metadata:   input.Metadata,
	}
	if err := b.broker.Send(ctx, input.SessionID, msg); err != nil {
		return nil, stoneSendOutput{}, err
	}

	return nil, stoneSendOutput{
		Status:    "sent",
		ID:        msg.ID,
		Timestamp: msg.Timestamp,
	}, nil
}

func (b *Interface) handleStoneReceive(ctx context.Context, _ *gomcp.CallToolRequest, input stoneReceiveInput) (*gomcp.CallToolResult, stoneReceiveOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, stoneReceiveOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	waitMs := input.WaitMs
	if waitMs <= 0 {
		waitMs = 60_000
	}
	if waitMs > 120_000 {
		waitMs = 120_000
	}

	msgs, err := b.broker.Receive(ctx, input.SessionID, input.AddressedTo, input.SinceID, time.Duration(waitMs)*time.Millisecond)
	if err != nil {
		return nil, stoneReceiveOutput{}, err
	}

	return nil, stoneReceiveOutput{Messages: msgs}, nil
}
```

- [ ] **Step 4: Update registerTools to use real handlers**

Replace the stone stubs in `registerTools()`:

```go
gomcp.AddTool(server, &gomcp.Tool{
	Name:        "stone_send",
	Description: "Send a message via the sending stone. Messages are routed to the specified recipient within the session.",
}, b.handleStoneSend)

gomcp.AddTool(server, &gomcp.Tool{
	Name:        "stone_receive",
	Description: "Receive messages from the sending stone. Long-polls up to wait_ms for new messages addressed to the specified recipient.",
}, b.handleStoneReceive)
```

- [ ] **Step 5: Register session in broker on register_session**

In `handleRegisterSession`, add after storing the session:

```go
b.broker.RegisterSession(input.SessionID)
```

- [ ] **Step 6: Run tests**

Run: `cd storybook-daemon && go test ./internal/psi/mcp/ -v`
Expected: all PASS (existing tests + broker tests)

- [ ] **Step 7: Run linter**

Run: `cd storybook-daemon && golangci-lint run ./internal/psi/mcp/`
Expected: clean

- [ ] **Step 8: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/mcp.go
git commit -m "feat(daemon): wire stone_send and stone_receive MCP handlers"
```

---

### Task 5: Ally taxonomy — Go port

**Files:**

- Create: `storybook-daemon/internal/quest/taxonomy.go`
- Create: `storybook-daemon/internal/quest/taxonomy_test.go`

- [ ] **Step 1: Write failing tests**

Create `storybook-daemon/internal/quest/taxonomy_test.go`:

```go
package quest

import "testing"

func TestParseDefName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantNil bool
		wantAdj string
		wantNoun string
		wantJob  string
	}{
		{"valid kobold scout", "silly-kobold-scout", false, "silly", "kobold", "scout"},
		{"valid dragon planner", "elder-dragon-planner", false, "elder", "dragon", "planner"},
		{"invalid adjective", "fast-kobold-scout", true, "", "", ""},
		{"too few parts", "kobold-scout", true, "", "", ""},
		{"too many parts", "silly-kobold-scout-extra", true, "", "", ""},
		{"empty", "", true, "", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			combo := ParseDefName(tt.input)
			if tt.wantNil {
				if combo != nil {
					t.Errorf("ParseDefName(%q) = %+v, want nil", tt.input, combo)
				}
				return
			}
			if combo == nil {
				t.Fatalf("ParseDefName(%q) = nil, want combo", tt.input)
			}
			if combo.Adjective != tt.wantAdj {
				t.Errorf("Adjective = %q, want %q", combo.Adjective, tt.wantAdj)
			}
			if combo.Noun != tt.wantNoun {
				t.Errorf("Noun = %q, want %q", combo.Noun, tt.wantNoun)
			}
			if combo.Job != tt.wantJob {
				t.Errorf("Job = %q, want %q", combo.Job, tt.wantJob)
			}
		})
	}
}

func TestResolveModel(t *testing.T) {
	tests := []struct {
		noun string
		want string
	}{
		{"kobold", "zai/glm-4.5-air"},
		{"griffin", "github-copilot/claude-sonnet-4.6"},
		{"dragon", "github-copilot/claude-opus-4.6"},
	}
	for _, tt := range tests {
		t.Run(tt.noun, func(t *testing.T) {
			got := ResolveModel(tt.noun)
			if got != tt.want {
				t.Errorf("ResolveModel(%q) = %q, want %q", tt.noun, got, tt.want)
			}
		})
	}
}

func TestResolveTools(t *testing.T) {
	got := ResolveTools("scout")
	if got == "" {
		t.Fatal("ResolveTools(scout) returned empty")
	}
}

func TestResolveThinking(t *testing.T) {
	if got := ResolveThinking("silly"); got != "off" {
		t.Errorf("silly thinking = %q, want off", got)
	}
	if got := ResolveThinking("elder"); got != "high" {
		t.Errorf("elder thinking = %q, want high", got)
	}
}

func TestJobDefaults(t *testing.T) {
	d := JobDefaults("scout")
	if d.TimeoutMs != 180_000 {
		t.Errorf("scout timeout = %d, want 180000", d.TimeoutMs)
	}
	if d.CheckInIntervalMs != 15_000 {
		t.Errorf("scout check-in = %d, want 15000", d.CheckInIntervalMs)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storybook-daemon && go test ./internal/quest/ -run TestParse -v`
Expected: FAIL — package doesn't exist

- [ ] **Step 3: Implement taxonomy**

Create `storybook-daemon/internal/quest/taxonomy.go`:

```go
package quest

import (
	"slices"
	"strings"
)

var (
	Adjectives = []string{"silly", "clever", "wise", "elder"}
	Nouns      = []string{"kobold", "griffin", "dragon"}
	Jobs       = []string{"scout", "reviewer", "coder", "researcher", "planner"}
)

type AllyCombo struct {
	Adjective string
	Noun      string
	Job       string
}

func ParseDefName(defName string) *AllyCombo {
	parts := strings.Split(defName, "-")
	if len(parts) != 3 {
		return nil
	}
	adj, noun, job := parts[0], parts[1], parts[2]
	if !slices.Contains(Adjectives, adj) {
		return nil
	}
	if !slices.Contains(Nouns, noun) {
		return nil
	}
	if !slices.Contains(Jobs, job) {
		return nil
	}
	return &AllyCombo{Adjective: adj, Noun: noun, Job: job}
}

func (c *AllyCombo) DefName() string {
	return c.Adjective + "-" + c.Noun + "-" + c.Job
}

var defaultModels = map[string][]string{
	"kobold": {
		"zai/glm-4.5-air",
		"github-copilot/claude-haiku-4.5",
		"anthropic/claude-haiku-4-5",
		"google/gemini-2.0-flash",
	},
	"griffin": {
		"github-copilot/claude-sonnet-4.6",
		"anthropic/claude-sonnet-4-6",
		"google/gemini-2.5-pro",
	},
	"dragon": {
		"github-copilot/claude-opus-4.6",
		"anthropic/claude-opus-4-6",
	},
}

func ResolveModel(noun string) string {
	models, ok := defaultModels[noun]
	if !ok || len(models) == 0 {
		return "zai/glm-4.5-air"
	}
	return models[0]
}

func ModelCascade(noun string) []string {
	models, ok := defaultModels[noun]
	if !ok {
		return []string{"zai/glm-4.5-air"}
	}
	out := make([]string, len(models))
	copy(out, models)
	return out
}

var defaultThinking = map[string]string{
	"silly":  "off",
	"clever": "low",
	"wise":   "medium",
	"elder":  "high",
}

func ResolveThinking(adjective string) string {
	t, ok := defaultThinking[adjective]
	if !ok {
		return "off"
	}
	return t
}

const socialTools = "stone_send,stone_receive,write_notes"

var jobTools = map[string]string{
	"scout":      "read,grep,find,ls,bash," + socialTools,
	"reviewer":   "read,grep,find,ls,bash," + socialTools,
	"coder":      "read,grep,find,ls,bash,write,edit," + socialTools,
	"researcher": "read,grep,find,ls,bash," + socialTools,
	"planner":    "read,grep,find,ls," + socialTools,
}

func ResolveTools(job string) string {
	tools, ok := jobTools[job]
	if !ok {
		return "read,grep,find,ls,bash," + socialTools
	}
	return tools
}

type JobDefaultsResult struct {
	TimeoutMs        int
	CheckInIntervalMs int
}

var jobDefaultsMap = map[string]JobDefaultsResult{
	"scout":      {TimeoutMs: 180_000, CheckInIntervalMs: 15_000},
	"reviewer":   {TimeoutMs: 120_000, CheckInIntervalMs: 20_000},
	"coder":      {TimeoutMs: 180_000, CheckInIntervalMs: 30_000},
	"researcher": {TimeoutMs: 300_000, CheckInIntervalMs: 45_000},
	"planner":    {TimeoutMs: 180_000, CheckInIntervalMs: 30_000},
}

func JobDefaults(job string) JobDefaultsResult {
	d, ok := jobDefaultsMap[job]
	if !ok {
		return JobDefaultsResult{TimeoutMs: 180_000, CheckInIntervalMs: 30_000}
	}
	return d
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd storybook-daemon && go test ./internal/quest/ -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon && git add internal/quest/taxonomy.go internal/quest/taxonomy_test.go
git commit -m "feat(daemon): Go port of ally taxonomy (defName → model/tools/thinking)"
```

---

### Task 6: System prompt builder

**Files:**

- Create: `storybook-daemon/internal/quest/prompt.go`
- Create: `storybook-daemon/internal/quest/prompt_test.go`

- [ ] **Step 1: Write failing test**

Create `storybook-daemon/internal/quest/prompt_test.go`:

```go
package quest

import (
	"strings"
	"testing"
)

func TestBuildPromptContainsIdentity(t *testing.T) {
	combo := &AllyCombo{Adjective: "silly", Noun: "kobold", Job: "scout"}
	prompt := BuildAllyPrompt(combo, "Grix")
	if !strings.Contains(prompt, "You are Grix the Silly Kobold Scout.") {
		t.Errorf("prompt missing identity line, got:\n%s", prompt[:200])
	}
}

func TestBuildPromptContainsJobSection(t *testing.T) {
	combo := &AllyCombo{Adjective: "clever", Noun: "griffin", Job: "coder"}
	prompt := BuildAllyPrompt(combo, "")
	if !strings.Contains(prompt, "## Your Job") {
		t.Error("prompt missing job section")
	}
	if !strings.Contains(prompt, "Write and edit code") {
		t.Error("prompt missing coder job description")
	}
}

func TestBuildPromptContainsStoneDocs(t *testing.T) {
	combo := &AllyCombo{Adjective: "wise", Noun: "dragon", Job: "planner"}
	prompt := BuildAllyPrompt(combo, "Azurath")
	if !strings.Contains(prompt, "stone_send") {
		t.Error("prompt missing stone_send instructions")
	}
	if !strings.Contains(prompt, "stone_receive") {
		t.Error("prompt missing stone_receive instructions")
	}
}

func TestBuildPromptNoName(t *testing.T) {
	combo := &AllyCombo{Adjective: "silly", Noun: "kobold", Job: "scout"}
	prompt := BuildAllyPrompt(combo, "")
	if !strings.Contains(prompt, "You are a Silly Kobold Scout.") {
		t.Errorf("prompt missing anonymous identity, got:\n%s", prompt[:200])
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storybook-daemon && go test ./internal/quest/ -run TestBuildPrompt -v`
Expected: FAIL — `BuildAllyPrompt` undefined

- [ ] **Step 3: Implement prompt builder**

Create `storybook-daemon/internal/quest/prompt.go`:

```go
package quest

import (
	"fmt"
	"strings"
)

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func identityLine(allyName string, combo *AllyCombo) string {
	title := fmt.Sprintf("%s %s %s", capitalize(combo.Adjective), capitalize(combo.Noun), capitalize(combo.Job))
	if allyName != "" {
		return fmt.Sprintf("You are %s the %s.", allyName, title)
	}
	return fmt.Sprintf("You are a %s.", title)
}

func tierBehavior(adjective string) string {
	switch adjective {
	case "silly":
		return "Be fast and minimal. No overthinking. Execute and return."
	case "clever":
		return "Reason a little where it helps. Stay focused and frugal."
	case "wise":
		return "Reason carefully. Be thorough but efficient. Cite your sources."
	case "elder":
		return "Think deeply. Consider second-order effects. Document your reasoning extensively."
	default:
		return "Execute the task as directed."
	}
}

var jobPrompts = map[string]string{
	"scout": `## Your Job
- Scan files, directories, and code structure
- Find specific patterns, imports, references, usages
- Map project layout and dependencies
- Report findings with exact file paths and line numbers

## Rules
- Do NOT analyze or explain — just find and report
- Do NOT modify any files
- Keep responses short and structured
- Cite every finding as file:line

## Output Format
List your findings as:
- ` + "`file/path.ts:42`" + ` — brief description of what you found`,

	"reviewer": `## Your Job
- Review code for correctness, patterns, and conventions
- Check documentation for accuracy and completeness
- Validate configuration and frontmatter
- Identify bugs, antipatterns, and improvement opportunities

## Rules
- Do NOT modify any files — report only
- Cite every finding with file:line references
- Prioritize: critical > warning > suggestion
- Flag architectural concerns for your dispatcher

## Output Format
1. Summary (2-3 sentences)
2. Findings (severity | file:line | description)
3. Recommendations (prioritized)`,

	"coder": `## Your Job
- Write and edit code following project conventions
- Implement features, fix bugs, refactor as directed
- Follow existing patterns in the codebase
- Verify your changes compile/lint clean where possible

## Rules
- Read relevant code before writing — understand the patterns
- Follow the project's AGENTS.md conventions
- Don't over-engineer — do what's asked, nothing more
- If scope grows beyond your task, report back to dispatcher

## Output Format
1. What you changed and why (brief)
2. Files modified (with key changes noted)
3. Anything you couldn't complete or concerns`,

	"researcher": `## Your Job
- Research topics, APIs, libraries, patterns, and documentation
- Search the web and read source code thoroughly
- Synthesize findings into structured reports
- Compare options with pros/cons when relevant

## Rules
- Cite all sources (URLs, file paths, documentation sections)
- Distinguish facts from opinions/recommendations
- Keep reports focused on what was asked
- Flag gaps in available information

## Output Format
1. Summary (key findings in 2-3 sentences)
2. Details (organized by topic/question)
3. Sources (all URLs and references cited)
4. Gaps (what you couldn't determine)`,

	"planner": `## Your Job
- Break down complex tasks into phases and steps
- Write specifications and design documents
- Evaluate architectural options and tradeoffs
- Consider second-order effects and edge cases

## Rules
- Read existing code and docs before planning
- Consider ETHICS.md implications for data/consent features
- Think about testing, rollback, and failure modes
- Document your reasoning — plans should be self-explanatory

## Output Format
1. Goal (what we're trying to achieve)
2. Current State (what exists now)
3. Plan (phased steps with dependencies)
4. Risks & Mitigations
5. Open Questions`,
}

func spawnRulesLine(noun string) string {
	switch noun {
	case "kobold":
		return "You cannot dispatch subagents."
	case "griffin":
		return "You may dispatch subagents (Kobold tier only)."
	case "dragon":
		return "You may dispatch subagents (Kobold or Griffin tier only)."
	default:
		return "You cannot dispatch subagents."
	}
}

const callingHomeSection = `## Sending Stone — Read This First

You are an ally. Your plain text output is **invisible** to the primary agent. The only way your work reaches the primary is through the **sending stone**.

### Rule 1: Deliver your result via stone_send, or your work is lost

When your task is complete, you **MUST** end by calling:

    stone_send(type="result", to="primary-agent", message="<your full result>")

This is not optional. If you finish your task and do not call stone_send(type="result", ...), the primary agent receives nothing.

After sending the result, **stop**.

### Rule 2: Valid recipients

- "primary-agent" — the agent who dispatched you. **Default for results and questions.**
- An ally defName (e.g. "silly-kobold-scout") — direct message to another ally
- "session-room" — broadcast to everyone. **Never use for results or questions.**

### Rule 3: Progress pulses

Send stone_send(type="progress", to="primary-agent", message=...) at structural boundaries:
- Every ~5 tool calls during exploration
- After finishing each file or file-group in a multi-file task
- When you shift phases (reading → analyzing → writing)

### Rule 4: Questions

If you hit a genuine blocker:

    stone_send(type="question", to="primary-agent", message="<concise 1-2 liner>")
    stone_receive(wait=60)

Do not call any other tool between stone_send(question) and stone_receive.`

func BuildAllyPrompt(combo *AllyCombo, allyName string) string {
	jp, ok := jobPrompts[combo.Job]
	if !ok {
		jp = "Execute the assigned task."
	}

	return strings.Join([]string{
		identityLine(allyName, combo),
		"",
		tierBehavior(combo.Adjective),
		"",
		jp,
		"",
		callingHomeSection,
		"",
		"## Subagent Rules",
		spawnRulesLine(combo.Noun),
	}, "\n")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd storybook-daemon && go test ./internal/quest/ -run TestBuildPrompt -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
cd storybook-daemon && git add internal/quest/prompt.go internal/quest/prompt_test.go
git commit -m "feat(daemon): ally system prompt builder (v1, no personalities)"
```

---

### Task 7: Quest types and manager scaffold

**Files:**

- Create: `storybook-daemon/internal/quest/types.go`
- Create: `storybook-daemon/internal/quest/manager.go`
- Create: `storybook-daemon/internal/quest/manager_test.go`

- [ ] **Step 1: Write failing test for manager dispatch + status**

Create `storybook-daemon/internal/quest/manager_test.go`:

```go
package quest

import (
	"context"
	"testing"
	"time"
)

func TestDispatchAndStatus(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "silly-kobold-scout",
			Task:    "echo hello",
			Harness: "mock",
		}},
	}

	infos, err := m.Dispatch(context.Background(), "test-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 1 {
		t.Fatalf("dispatch len = %d, want 1", len(infos))
	}
	if infos[0].Ally != "silly-kobold-scout" {
		t.Errorf("ally = %q", infos[0].Ally)
	}

	time.Sleep(200 * time.Millisecond)

	statuses := m.Status("test-session", nil)
	if len(statuses) != 1 {
		t.Fatalf("status len = %d, want 1", len(statuses))
	}
	if statuses[0].Status != StatusCompleted && statuses[0].Status != StatusRunning {
		t.Errorf("status = %q, want running or completed", statuses[0].Status)
	}
}

func TestDispatchInvalidDefName(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "invalid-name",
			Task:    "test",
			Harness: "mock",
		}},
	}

	_, err := m.Dispatch(context.Background(), "test-session", req)
	if err == nil {
		t.Fatal("expected error for invalid defName")
	}
}

func TestCancel(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 10",
			Harness:   "mock",
			TimeoutMs: 30_000,
		}},
	}

	infos, err := m.Dispatch(context.Background(), "s1", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	if err := m.Cancel("s1", infos[0].QuestID); err != nil {
		t.Fatalf("cancel: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	statuses := m.Status("s1", []string{infos[0].QuestID})
	if len(statuses) != 1 {
		t.Fatalf("status len = %d", len(statuses))
	}
	if statuses[0].Status != StatusCancelled && statuses[0].Status != StatusFailed {
		t.Errorf("status = %q, want cancelled or failed", statuses[0].Status)
	}
}

func TestCleanup(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 10",
			Harness:   "mock",
			TimeoutMs: 30_000,
		}},
	}

	_, err := m.Dispatch(context.Background(), "s1", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	time.Sleep(50 * time.Millisecond)
	m.Cleanup("s1")
	time.Sleep(100 * time.Millisecond)

	statuses := m.Status("s1", nil)
	if len(statuses) != 0 {
		t.Fatalf("expected empty after cleanup, got %d", len(statuses))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd storybook-daemon && go test ./internal/quest/ -run TestDispatch -v`
Expected: FAIL — types undefined

- [ ] **Step 3: Create quest types**

Create `storybook-daemon/internal/quest/types.go`:

```go
package quest

import (
	"context"
	"os/exec"
	"time"
)

type Status string

const (
	StatusPending   Status = "pending"
	StatusSpawning  Status = "spawning"
	StatusRunning   Status = "running"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
	StatusTimeout   Status = "timeout"
	StatusCancelled Status = "cancelled"
)

type Quest struct {
	ID         string
	SessionID  string
	Ally       string
	Combo      *AllyCombo
	Harness    string
	Model      string
	Task       string
	Status     Status
	PID        int
	StartedAt  time.Time
	FinishedAt *time.Time
	ExitCode   *int
	Response   string
	Error      string
	LastStderr string

	cmd    *exec.Cmd
	cancel context.CancelFunc
}

type QuestInfo struct {
	QuestID    string  `json:"quest_id"`
	Ally       string  `json:"ally"`
	Harness    string  `json:"harness"`
	Model      string  `json:"model"`
	Status     Status  `json:"status"`
	PID        int     `json:"pid,omitempty"`
	StartedAt  string  `json:"started_at"`
	FinishedAt string  `json:"finished_at,omitempty"`
	ElapsedMs  int64   `json:"elapsed_ms"`
	ExitCode   *int    `json:"exit_code,omitempty"`
	Summary    string  `json:"result_summary,omitempty"`
	Error      string  `json:"error,omitempty"`
	LastStderr string  `json:"last_stderr,omitempty"`
}

type DispatchRequest struct {
	Mode   string         `json:"mode"`
	Quests []QuestRequest `json:"quests"`
}

type QuestRequest struct {
	Ally      string `json:"ally"`
	Task      string `json:"task"`
	Harness   string `json:"harness"`
	Model     string `json:"model,omitempty"`
	TimeoutMs int    `json:"timeout_ms,omitempty"`
	Thinking  string `json:"thinking,omitempty"`
}

func (q *Quest) Info() QuestInfo {
	info := QuestInfo{
		QuestID:   q.ID,
		Ally:      q.Ally,
		Harness:   q.Harness,
		Model:     q.Model,
		Status:    q.Status,
		PID:       q.PID,
		StartedAt: q.StartedAt.Format(time.RFC3339),
		ElapsedMs: time.Since(q.StartedAt).Milliseconds(),
		ExitCode:  q.ExitCode,
		Error:     q.Error,
		LastStderr: q.LastStderr,
	}
	if q.FinishedAt != nil {
		info.FinishedAt = q.FinishedAt.Format(time.RFC3339)
		info.ElapsedMs = q.FinishedAt.Sub(q.StartedAt).Milliseconds()
	}
	if len(q.Response) > 500 {
		info.Summary = q.Response[:500]
	} else if q.Response != "" {
		info.Summary = q.Response
	}
	return info
}
```

- [ ] **Step 4: Create manager with mock harness support**

Create `storybook-daemon/internal/quest/manager.go`:

```go
package quest

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type BrokerSender interface {
	Send(ctx context.Context, sessionID string, msg any) error
}

type Manager struct {
	mu        sync.Mutex
	quests    map[string]*Quest
	bySession map[string][]string
	broker    BrokerSender
	logFn     func(args ...any)
	nextID    atomic.Int64
}

func NewManager(broker BrokerSender, logFn func(args ...any)) *Manager {
	return &Manager{
		quests:    make(map[string]*Quest),
		bySession: make(map[string][]string),
		broker:    broker,
		logFn:     logFn,
	}
}

func (m *Manager) Dispatch(ctx context.Context, sessionID string, req DispatchRequest) ([]QuestInfo, error) {
	if len(req.Quests) == 0 {
		return nil, fmt.Errorf("no quests to dispatch")
	}

	var infos []QuestInfo

	for _, qr := range req.Quests {
		combo := ParseDefName(qr.Ally)
		if combo == nil {
			return nil, fmt.Errorf("invalid ally defName: %q", qr.Ally)
		}

		model := qr.Model
		if model == "" {
			model = ResolveModel(combo.Noun)
		}

		timeoutMs := qr.TimeoutMs
		if timeoutMs <= 0 {
			timeoutMs = JobDefaults(combo.Job).TimeoutMs
		}

		id := "quest-" + strconv.FormatInt(m.nextID.Add(1), 10)

		q := &Quest{
			ID:        id,
			SessionID: sessionID,
			Ally:      qr.Ally,
			Combo:     combo,
			Harness:   qr.Harness,
			Model:     model,
			Task:      qr.Task,
			Status:    StatusPending,
			StartedAt: time.Now(),
		}

		m.mu.Lock()
		m.quests[id] = q
		m.bySession[sessionID] = append(m.bySession[sessionID], id)
		m.mu.Unlock()

		infos = append(infos, q.Info())

		go m.runQuest(ctx, q, time.Duration(timeoutMs)*time.Millisecond)
	}

	return infos, nil
}

func (m *Manager) runQuest(_ context.Context, q *Quest, timeout time.Duration) {
	m.setStatus(q, StatusSpawning)

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	q.cancel = cancel
	defer cancel()

	cmd, err := m.buildCommand(ctx, q)
	if err != nil {
		m.failQuest(q, fmt.Sprintf("build command: %v", err))
		return
	}

	q.cmd = cmd
	m.setStatus(q, StatusRunning)

	stderr, _ := cmd.StderrPipe()
	stdout, _ := cmd.StdoutPipe()

	if err := cmd.Start(); err != nil {
		m.failQuest(q, fmt.Sprintf("start: %v", err))
		return
	}

	m.mu.Lock()
	q.PID = cmd.Process.Pid
	m.mu.Unlock()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			m.mu.Lock()
			q.LastStderr = scanner.Text()
			m.mu.Unlock()
		}
	}()

	var output strings.Builder
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		output.WriteString(scanner.Text())
		output.WriteByte('\n')
	}

	err = cmd.Wait()
	now := time.Now()

	m.mu.Lock()
	q.FinishedAt = &now
	m.mu.Unlock()

	if ctx.Err() == context.DeadlineExceeded {
		m.setStatus(q, StatusTimeout)
		m.mu.Lock()
		q.Error = "timeout"
		m.mu.Unlock()
		return
	}

	if ctx.Err() == context.Canceled {
		m.setStatus(q, StatusCancelled)
		m.mu.Lock()
		q.Error = "cancelled"
		m.mu.Unlock()
		return
	}

	if err != nil {
		exitCode := cmd.ProcessState.ExitCode()
		m.mu.Lock()
		q.ExitCode = &exitCode
		q.Error = err.Error()
		q.Response = output.String()
		m.mu.Unlock()
		m.setStatus(q, StatusFailed)
		return
	}

	exitCode := 0
	m.mu.Lock()
	q.ExitCode = &exitCode
	q.Response = strings.TrimSpace(output.String())
	m.mu.Unlock()
	m.setStatus(q, StatusCompleted)
}

func (m *Manager) buildCommand(ctx context.Context, q *Quest) (*exec.Cmd, error) {
	switch q.Harness {
	case "mock":
		parts := strings.Fields(q.Task)
		if len(parts) == 0 {
			return nil, fmt.Errorf("empty task")
		}
		return exec.CommandContext(ctx, parts[0], parts[1:]...), nil

	case "pi":
		return exec.CommandContext(ctx, "pi",
			"--mode", "json",
			"-p",
			"--model", q.Model,
			q.Task,
		), nil

	case "claude":
		return exec.CommandContext(ctx, "claude",
			"--print",
			"--model", q.Model,
			q.Task,
		), nil

	default:
		return nil, fmt.Errorf("unknown harness: %q", q.Harness)
	}
}

func (m *Manager) setStatus(q *Quest, status Status) {
	m.mu.Lock()
	defer m.mu.Unlock()
	q.Status = status
}

func (m *Manager) failQuest(q *Quest, errMsg string) {
	m.mu.Lock()
	q.Error = errMsg
	now := time.Now()
	q.FinishedAt = &now
	m.mu.Unlock()
	m.setStatus(q, StatusFailed)
}

func (m *Manager) Status(sessionID string, questIDs []string) []QuestInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	ids := questIDs
	if len(ids) == 0 {
		ids = m.bySession[sessionID]
	}

	var infos []QuestInfo
	for _, id := range ids {
		q, ok := m.quests[id]
		if !ok || q.SessionID != sessionID {
			continue
		}
		infos = append(infos, q.Info())
	}
	return infos
}

func (m *Manager) Cancel(sessionID, questID string) error {
	m.mu.Lock()
	q, ok := m.quests[questID]
	m.mu.Unlock()

	if !ok || q.SessionID != sessionID {
		return fmt.Errorf("quest not found: %s", questID)
	}

	if q.cancel != nil {
		q.cancel()
	}
	return nil
}

func (m *Manager) Cleanup(sessionID string) {
	m.mu.Lock()
	ids := m.bySession[sessionID]
	delete(m.bySession, sessionID)

	for _, id := range ids {
		q, ok := m.quests[id]
		if ok && q.cancel != nil {
			q.cancel()
		}
		delete(m.quests, id)
	}
	m.mu.Unlock()
}
```

- [ ] **Step 5: Run tests**

Run: `cd storybook-daemon && go test ./internal/quest/ -v -timeout 10s`
Expected: all PASS (mock harness uses `echo` and `sleep` commands)

- [ ] **Step 6: Run linter**

Run: `cd storybook-daemon && golangci-lint run ./internal/quest/`
Expected: clean

- [ ] **Step 7: Commit**

```bash
cd storybook-daemon && git add internal/quest/
git commit -m "feat(daemon): quest manager with mock harness, status, cancel, cleanup"
```

---

### Task 8: Quest MCP handlers

**Files:**

- Modify: `storybook-daemon/internal/psi/mcp/mcp.go`

- [ ] **Step 1: Add quest.Manager to Interface**

Add import and field:

```go
import "github.com/dotBeeps/hoard/storybook-daemon/internal/quest"

type Interface struct {
	// ... existing fields ...
	broker  *Broker
	questMgr *quest.Manager
	// ...
}
```

Update `New()` to accept and store a `*quest.Manager` parameter.

- [ ] **Step 2: Define MCP input/output types for quest tools**

Add to the types section of `mcp.go`:

```go
type questDispatchInput struct {
	SessionID string                `json:"session_id" jsonschema:"session that owns these quests"`
	Mode      string                `json:"mode" jsonschema:"dispatch mode: single, rally, or chain"`
	Quests    []quest.QuestRequest  `json:"quests" jsonschema:"quests to dispatch"`
}

type questDispatchOutput struct {
	Status  string            `json:"status"`
	GroupID string            `json:"group_id"`
	Quests  []quest.QuestInfo `json:"quests"`
}

type questStatusInput struct {
	SessionID string   `json:"session_id" jsonschema:"session to query"`
	QuestIDs  []string `json:"quest_ids,omitempty" jsonschema:"specific quest IDs (omit for all)"`
}

type questStatusOutput struct {
	Quests []quest.QuestInfo `json:"quests"`
}

type questCancelInput struct {
	SessionID string `json:"session_id" jsonschema:"session that owns the quest"`
	QuestID   string `json:"quest_id" jsonschema:"quest to cancel"`
}

type questCancelOutput struct {
	Status  string `json:"status"`
	QuestID string `json:"quest_id"`
}
```

- [ ] **Step 3: Implement handlers**

```go
func (b *Interface) handleQuestDispatch(ctx context.Context, _ *gomcp.CallToolRequest, input questDispatchInput) (*gomcp.CallToolResult, questDispatchOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, questDispatchOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	req := quest.DispatchRequest{
		Mode:   input.Mode,
		Quests: input.Quests,
	}
	infos, err := b.questMgr.Dispatch(ctx, input.SessionID, req)
	if err != nil {
		return nil, questDispatchOutput{}, err
	}

	groupID := "group-" + input.SessionID[:8]
	if len(infos) > 0 {
		groupID = infos[0].QuestID
	}

	return nil, questDispatchOutput{
		Status:  "dispatched",
		GroupID: groupID,
		Quests:  infos,
	}, nil
}

func (b *Interface) handleQuestStatus(_ context.Context, _ *gomcp.CallToolRequest, input questStatusInput) (*gomcp.CallToolResult, questStatusOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, questStatusOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	infos := b.questMgr.Status(input.SessionID, input.QuestIDs)
	return nil, questStatusOutput{Quests: infos}, nil
}

func (b *Interface) handleQuestCancel(_ context.Context, _ *gomcp.CallToolRequest, input questCancelInput) (*gomcp.CallToolResult, questCancelOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, questCancelOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	err := b.questMgr.Cancel(input.SessionID, input.QuestID)
	if err != nil {
		return nil, questCancelOutput{Status: "not_found", QuestID: input.QuestID}, nil
	}

	return nil, questCancelOutput{Status: "cancelled", QuestID: input.QuestID}, nil
}
```

- [ ] **Step 4: Update registerTools**

Replace the `quest_status` stub and add new tools:

```go
gomcp.AddTool(server, &gomcp.Tool{
	Name:        "quest_dispatch",
	Description: "Dispatch one or more ally quests. Returns immediately with quest IDs. Results arrive via stone.",
}, b.handleQuestDispatch)

gomcp.AddTool(server, &gomcp.Tool{
	Name:        "quest_status",
	Description: "Check status of dispatched quests. Omit quest_ids to get all quests for the session.",
}, b.handleQuestStatus)

gomcp.AddTool(server, &gomcp.Tool{
	Name:        "quest_cancel",
	Description: "Cancel a running quest. Sends SIGTERM to the subprocess.",
}, b.handleQuestCancel)
```

- [ ] **Step 5: Run tests**

Run: `cd storybook-daemon && go test ./... -v -timeout 30s`
Expected: all PASS

- [ ] **Step 6: Run linter**

Run: `cd storybook-daemon && golangci-lint run ./...`
Expected: clean

- [ ] **Step 7: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/mcp.go
git commit -m "feat(daemon): wire quest_dispatch, quest_status, quest_cancel MCP handlers"
```

---

### Task 9: Wire quest manager into daemon startup

**Files:**

- Modify: `storybook-daemon/internal/daemon/daemon.go`

- [ ] **Step 1: Read current daemon.go to understand startup flow**

Run: `cat storybook-daemon/internal/daemon/daemon.go`

Identify where `mcp.New()` is called and where the Interface is started.

- [ ] **Step 2: Create quest.Manager and pass to mcp.New()**

At the point where the MCP interface is constructed, create a `quest.Manager` and pass it:

```go
questMgr := quest.NewManager(nil, log.Info)
mcpInterface := mcp.New(id, port, vault, ledger, questMgr, log)
```

Update `mcp.New()` signature to accept `*quest.Manager`:

```go
func New(id string, port int, vault *memory.Vault, ledger *attention.Ledger, questMgr *quest.Manager, log *slog.Logger) *Interface {
	return &Interface{
		// ... existing fields ...
		questMgr: questMgr,
		// ...
	}
}
```

- [ ] **Step 3: Update all existing callers of mcp.New()**

Search for other call sites of `mcp.New()` and update them to pass the quest manager.

- [ ] **Step 4: Build**

Run: `cd storybook-daemon && go build ./...`
Expected: clean build

- [ ] **Step 5: Run all tests**

Run: `cd storybook-daemon && go test ./... -v -timeout 30s`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon && git add internal/daemon/daemon.go internal/psi/mcp/mcp.go
git commit -m "feat(daemon): wire quest manager into daemon startup"
```

---

### Task 10: Integration test — mock dispatch end-to-end

**Files:**

- Create: `storybook-daemon/internal/quest/integration_test.go`

- [ ] **Step 1: Write integration test that dispatches via mock harness**

Create `storybook-daemon/internal/quest/integration_test.go`:

```go
package quest

import (
	"context"
	"testing"
	"time"
)

func TestIntegrationMockDispatchCompletes(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "silly-kobold-scout",
			Task:    "echo quest-result-payload",
			Harness: "mock",
		}},
	}

	infos, err := m.Dispatch(context.Background(), "int-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 1 {
		t.Fatalf("got %d quests", len(infos))
	}

	questID := infos[0].QuestID

	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest did not complete within 5s")
		default:
		}

		statuses := m.Status("int-session", []string{questID})
		if len(statuses) == 1 && statuses[0].Status == StatusCompleted {
			if statuses[0].Summary != "quest-result-payload" {
				t.Errorf("response = %q, want %q", statuses[0].Summary, "quest-result-payload")
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestIntegrationTimeoutKillsProcess(t *testing.T) {
	m := NewManager(nil, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:      "silly-kobold-scout",
			Task:      "sleep 60",
			Harness:   "mock",
			TimeoutMs: 200,
		}},
	}

	infos, err := m.Dispatch(context.Background(), "timeout-session", req)
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	deadline := time.After(3 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest did not timeout within 3s")
		default:
		}

		statuses := m.Status("timeout-session", []string{infos[0].QuestID})
		if len(statuses) == 1 && (statuses[0].Status == StatusTimeout || statuses[0].Status == StatusFailed) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}
```

- [ ] **Step 2: Run integration tests**

Run: `cd storybook-daemon && go test ./internal/quest/ -run TestIntegration -v -timeout 30s`
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
cd storybook-daemon && git add internal/quest/integration_test.go
git commit -m "test(daemon): integration tests for quest dispatch, timeout, cancel"
```

---

## Post-Implementation Notes

**What's deferred to v2:**

- Personality profiles (Go port of `personalities.ts`) — dispatch works without them
- Model cascade with provider cooldowns (`cascade.go`) — v1 uses first model only
- Chain/rally mode orchestration — v1 dispatches all as independent quests; chain output threading comes in v2
- Environment filtering (Codex pattern) — v1 inherits env; v2 constructs minimal env
- System prompt via temp file — v1 passes inline; v2 writes to temp file + cleanup
- Stone broker federation (pi-side HTTP bridge) — v1 is daemon-only

**Validation after all tasks:**

1. `cd storybook-daemon && go test ./... -v` — all pass
2. `cd storybook-daemon && golangci-lint run ./...` — clean
3. `cd storybook-daemon && go build -o storybook-daemon .` — builds
4. Manual test: start daemon, call `register_session` via MCP, call `quest_dispatch` with mock harness, verify `quest_status` shows completion
