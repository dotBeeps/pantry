# V2 Dispatch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storybook-daemon quest dispatch spawn real allies with system prompts, env filtering, model cascade retry, and rally/chain group orchestration.

**Architecture:** Layered decomposition in `internal/quest/` — `command.go` (subprocess construction + env), `cascade.go` (retry logic), `orchestrate.go` (rally/chain), `manager.go` (slimmed entry point). New `internal/stone/` package holds the shared `Message` type imported by both `quest/` and `psi/mcp/`.

**Tech Stack:** Go 1.25, `os/exec`, `sync`, `sync/atomic`, stdlib `testing` + `cmp`.

---

## File Map

| Path                                    | Change                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| `internal/stone/types.go`               | NEW — shared Message type and Key constant                         |
| `internal/stone/types_test.go`          | NEW — JSON round-trip verification                                 |
| `internal/psi/mcp/stone_types.go`       | DELETE — moved to stone/                                           |
| `internal/psi/mcp/stone_types_test.go`  | DELETE — coverage moved to stone/                                  |
| `internal/psi/mcp/stone_broker.go`      | MODIFY — StoneMessage → stone.Message                              |
| `internal/psi/mcp/stone_broker_test.go` | MODIFY — import path update                                        |
| `internal/psi/mcp/mcp.go`               | MODIFY — wire broker→manager, fail_fast field, stone.Message       |
| `internal/quest/types.go`               | MODIFY — add Group, done/doneOnce, SessionPath, GroupID, FailFast  |
| `internal/quest/command.go`             | NEW — BuildCommand, env filtering, harness/thinking/effort mapping |
| `internal/quest/command_test.go`        | NEW — full pipeline via test harness                               |
| `internal/quest/cascade.go`             | NEW — IsRetryable, CooldownTracker, Cascader                       |
| `internal/quest/cascade_test.go`        | NEW — retryable detection, cooldown, exhaustion                    |
| `internal/quest/manager.go`             | REWRITE — BrokerSender v2, cascade retry loop, group dispatch      |
| `internal/quest/orchestrate.go`         | NEW — watchRally, runChain, resolveOutput, stone events            |
| `internal/quest/orchestrate_test.go`    | NEW — chain threading, rally fail-fast                             |
| `internal/quest/manager_test.go`        | MODIFY — NewManager signature (add daemonPort)                     |
| `internal/quest/integration_test.go`    | MODIFY — NewManager signature + test harness integration test      |

All paths relative to `storybook-daemon/`.

---

## Task 1: Stone shared type migration

**Files:**

- Create: `internal/stone/types.go`
- Create: `internal/stone/types_test.go`
- Modify: `internal/psi/mcp/stone_broker.go`
- Modify: `internal/psi/mcp/stone_broker_test.go`
- Modify: `internal/psi/mcp/mcp.go`
- Delete: `internal/psi/mcp/stone_types.go`
- Delete: `internal/psi/mcp/stone_types_test.go`

- [ ] **Step 1: Write the test for the new stone package**

Create `internal/stone/types_test.go`:

```go
package stone_test

import (
	"encoding/json"
	"testing"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

func TestMessageJSONRoundTrip(t *testing.T) {
	msg := stone.Message{
		ID:         "stone-1",
		From:       "silly-kobold-scout",
		Addressing: "primary-agent",
		Type:       "result",
		Content:    "finished",
		Timestamp:  1234567890,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got stone.Message
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got.ID != msg.ID || got.From != msg.From || got.Content != msg.Content {
		t.Errorf("round-trip mismatch: got %+v", got)
	}
}

func TestKeyConstant(t *testing.T) {
	if stone.Key != "hoard.stone" {
		t.Errorf("Key = %q, want %q", stone.Key, "hoard.stone")
	}
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```
cd storybook-daemon && go test ./internal/stone/...
```

Expected: `cannot find package`

- [ ] **Step 3: Create `internal/stone/types.go`**

```go
package stone

// Message mirrors the pi-side StoneMessage schema.
// See den/features/hoard-sending-stone/AGENTS.md for the canonical spec.
type Message struct {
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

// Key is the global symbol key for the stone API.
const Key = "hoard.stone"
```

- [ ] **Step 4: Run stone tests — must pass**

```
cd storybook-daemon && go test ./internal/stone/...
```

Expected: `PASS`

- [ ] **Step 5: Update `internal/psi/mcp/stone_broker.go`**

Replace the entire file. `sessionRing` and all method signatures move from `StoneMessage` to `stone.Message`:

```go
package mcp

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
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
	msgs []stone.Message
	subs []chan stone.Message
}

// NewBroker creates a Broker with the given ring buffer capacity per session.
func NewBroker(ringCap int) *Broker {
	return &Broker{
		sessions: make(map[string]*sessionRing),
		cap:      ringCap,
	}
}

// RegisterSession adds a new session ring. Idempotent — no-op if already registered.
func (b *Broker) RegisterSession(sessionID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.sessions[sessionID]; !ok {
		b.sessions[sessionID] = &sessionRing{}
	}
}

// UnregisterSession removes the session, closing all subscriber channels.
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

// Send delivers msg to the session ring buffer and all active subscribers.
// It auto-assigns ID and Timestamp if they are zero.
func (b *Broker) Send(_ context.Context, sessionID string, msg stone.Message) error {
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

// History returns all messages for the session. If sinceID is non-empty, only
// messages after that ID are returned. Returns nil for an unknown session.
func (b *Broker) History(sessionID string, sinceID string) []stone.Message {
	b.mu.Lock()
	defer b.mu.Unlock()

	ring, ok := b.sessions[sessionID]
	if !ok {
		return nil
	}

	if sinceID == "" {
		out := make([]stone.Message, len(ring.msgs))
		copy(out, ring.msgs)
		return out
	}

	for i, m := range ring.msgs {
		if m.ID == sinceID && i+1 < len(ring.msgs) {
			out := make([]stone.Message, len(ring.msgs)-i-1)
			copy(out, ring.msgs[i+1:])
			return out
		}
	}
	return nil
}

// Subscribe returns a channel that receives new messages for this session and a
// cancel func that removes the subscription.
func (b *Broker) Subscribe(sessionID string) (<-chan stone.Message, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ring, ok := b.sessions[sessionID]
	if !ok {
		ch := make(chan stone.Message)
		close(ch)
		return ch, func() {}
	}

	ch := make(chan stone.Message, 16)
	ring.subs = append(ring.subs, ch)

	cancel := func() {
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

	return ch, cancel
}

// Receive returns messages addressed to addressedTo in the given session.
// Long-polls up to waitDur. Returns empty slice on timeout.
func (b *Broker) Receive(ctx context.Context, sessionID, addressedTo, sinceID string, waitDur time.Duration) ([]stone.Message, error) {
	existing := b.filterAddressed(b.History(sessionID, sinceID), addressedTo)
	if len(existing) > 0 {
		return existing, nil
	}

	ch, unsub := b.Subscribe(sessionID)
	defer unsub()

	timer := time.NewTimer(waitDur)
	defer timer.Stop()

	var collected []stone.Message
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

func (b *Broker) filterAddressed(msgs []stone.Message, addressedTo string) []stone.Message {
	var out []stone.Message
	for _, m := range msgs {
		if m.Addressing == addressedTo || m.Addressing == "session-room" {
			out = append(out, m)
		}
	}
	return out
}
```

- [ ] **Step 6: Update `stone_broker_test.go` — replace `StoneMessage` with `stone.Message`**

Open `internal/psi/mcp/stone_broker_test.go`. Add import:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
```

Replace every occurrence of `StoneMessage{` with `stone.Message{` and every `[]StoneMessage` with `[]stone.Message`. Remove any local reference to `STONE_KEY` / replace with `stone.Key`.

- [ ] **Step 7: Update `internal/psi/mcp/mcp.go` — switch to `stone.Message`**

Add import `"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"`.

Change `stoneReceiveOutput`:

```go
type stoneReceiveOutput struct {
	Messages []stone.Message `json:"messages"`
}
```

In `handleStoneSend`, change `msg := StoneMessage{` to `msg := stone.Message{`.

- [ ] **Step 8: Delete the old stone_types files**

```
rm storybook-daemon/internal/psi/mcp/stone_types.go
rm storybook-daemon/internal/psi/mcp/stone_types_test.go
```

- [ ] **Step 9: Build and test everything**

```
cd storybook-daemon && go build ./... && go test ./...
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
cd storybook-daemon && git add internal/stone/ internal/psi/mcp/
git commit -m "feat(stone): extract shared Message type to internal/stone package

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Quest types — Group, done channel, new fields

**Files:**

- Modify: `internal/quest/types.go`

- [ ] **Step 1: Update `internal/quest/types.go`**

Replace the file with the following (adding Group, done/doneOnce to Quest, FailFast to DispatchRequest, json:"-" on QuestRequest.Harness):

```go
package quest

import (
	"context"
	"os/exec"
	"sync"
	"time"
)

// Status represents the lifecycle state of a quest.
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

// Quest holds all runtime state for a single ally subprocess.
type Quest struct {
	ID          string
	SessionID   string
	GroupID     string
	Ally        string
	Combo       *AllyCombo
	Harness     string
	Model       string
	Task        string
	SessionPath string // pi only: path to --session jsonl file
	Status      Status
	PID         int
	StartedAt   time.Time
	FinishedAt  *time.Time
	ExitCode    *int
	Response    string
	Error       string
	LastStderr  string

	cmd      *exec.Cmd
	cancel   context.CancelFunc
	done     chan struct{} // closed when quest reaches a terminal status
	doneOnce sync.Once
}

// Group tracks a set of quests dispatched together in rally or chain mode.
type Group struct {
	ID       string
	Mode     string   // "rally" or "chain"
	QuestIDs []string
	FailFast bool     // rally only: cancel remaining on first failure
	done     chan struct{}
}

// QuestInfo is the externally-visible snapshot of a quest.
type QuestInfo struct {
	QuestID    string `json:"quest_id"`
	GroupID    string `json:"group_id,omitempty"`
	Ally       string `json:"ally"`
	Harness    string `json:"harness"`
	Model      string `json:"model"`
	Status     Status `json:"status"`
	PID        int    `json:"pid,omitempty"`
	StartedAt  string `json:"started_at"`
	FinishedAt string `json:"finished_at,omitempty"`
	ElapsedMs  int64  `json:"elapsed_ms"`
	ExitCode   *int   `json:"exit_code,omitempty"`
	Summary    string `json:"result_summary,omitempty"`
	Error      string `json:"error,omitempty"`
	LastStderr string `json:"last_stderr,omitempty"`
}

// DispatchRequest is the top-level payload sent to Manager.Dispatch.
type DispatchRequest struct {
	Mode     string         `json:"mode"`
	Quests   []QuestRequest `json:"quests"`
	FailFast bool           `json:"fail_fast,omitempty"` // rally only
}

// QuestRequest describes one ally invocation within a dispatch.
type QuestRequest struct {
	Ally      string `json:"ally"`
	Task      string `json:"task"`
	Harness   string `json:"-"` // derived from model; only settable in Go (e.g. "test", "mock")
	Model     string `json:"model,omitempty"`
	TimeoutMs int    `json:"timeout_ms,omitempty"`
	Thinking  string `json:"thinking,omitempty"`
}

// Info returns a snapshot of the quest suitable for external consumption.
func (q *Quest) Info() QuestInfo {
	info := QuestInfo{
		QuestID:    q.ID,
		GroupID:    q.GroupID,
		Ally:       q.Ally,
		Harness:    q.Harness,
		Model:      q.Model,
		Status:     q.Status,
		PID:        q.PID,
		StartedAt:  q.StartedAt.Format(time.RFC3339),
		ElapsedMs:  time.Since(q.StartedAt).Milliseconds(),
		ExitCode:   q.ExitCode,
		Error:      q.Error,
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

- [ ] **Step 2: Build to confirm no breakage**

```
cd storybook-daemon && go build ./...
```

Expected: clean (existing code still references the exported fields that remain).

- [ ] **Step 3: Commit**

```bash
cd storybook-daemon && git add internal/quest/types.go
git commit -m "feat(quest): add Group type, done channel, SessionPath/GroupID fields

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Command construction

**Files:**

- Create: `internal/quest/command.go`
- Create: `internal/quest/command_test.go`

- [ ] **Step 1: Write `command_test.go` (failing)**

```go
package quest

import (
	"context"
	"strings"
	"testing"
)

func makeCommandTestQuest(t *testing.T, harness string) *Quest {
	t.Helper()
	combo := ParseDefName("silly-kobold-scout")
	if combo == nil {
		t.Fatal("ParseDefName returned nil")
	}
	return &Quest{
		ID:      "quest-cmd-1",
		Ally:    "silly-kobold-scout",
		Combo:   combo,
		Harness: harness,
		Model:   "zai/glm-4.5-air",
		Task:    "say hello",
		done:    make(chan struct{}),
	}
}

func TestBuildCommand_TestHarness_RunsEcho(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	args := result.Cmd.Args
	if len(args) == 0 || (!strings.HasSuffix(args[0], "echo") && args[0] != "echo") {
		t.Errorf("expected echo command, got %v", args)
	}
}

func TestBuildCommand_CleanupRemovesFiles(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	// Cleanup should not panic and should succeed silently
	result.Cleanup()
	result.Cleanup() // idempotent: second call should not panic
}

func TestBuildCommand_HoardOverlayVars(t *testing.T) {
	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 7777)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	env := result.Cmd.Env
	checkEnv := func(want string) {
		t.Helper()
		for _, e := range env {
			if e == want {
				return
			}
		}
		t.Errorf("env var %q not found in subprocess env", want)
	}
	checkEnv("HOARD_GUARD_MODE=ally")
	checkEnv("HOARD_ALLY_DEFNAME=silly-kobold-scout")
	checkEnv("HOARD_ALLY_NAME=silly-kobold-scout")
	checkEnv("HOARD_STONE_PORT=7777")
}

func TestBuildCommand_BlockedEnvVarsStripped(t *testing.T) {
	t.Setenv("MY_SECRET", "super-secret")
	t.Setenv("MY_API_KEY", "key-value")
	t.Setenv("GITHUB_TOKEN", "gh-token")
	t.Setenv("AWS_ACCESS_KEY_ID", "aws-key")
	t.Setenv("SAFE_VAR", "keep-this")

	q := makeCommandTestQuest(t, "test")
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	blocked := []string{"MY_SECRET=", "MY_API_KEY=", "GITHUB_TOKEN=", "AWS_ACCESS_KEY_ID="}
	for _, b := range blocked {
		for _, e := range result.Cmd.Env {
			if strings.HasPrefix(e, b) {
				t.Errorf("blocked var %q leaked into env", b)
			}
		}
	}

	var sawSafe bool
	for _, e := range result.Cmd.Env {
		if e == "SAFE_VAR=keep-this" {
			sawSafe = true
		}
	}
	if !sawSafe {
		t.Error("SAFE_VAR not found in subprocess env")
	}
}

func TestBuildCommand_AnthropicKeyPiBlocked(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")

	q := makeCommandTestQuest(t, "pi")
	q.Model = "zai/glm-4.5-air"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	for _, e := range result.Cmd.Env {
		if strings.HasPrefix(e, "ANTHROPIC_API_KEY=") {
			t.Error("ANTHROPIC_API_KEY leaked into pi harness env")
		}
	}
}

func TestBuildCommand_AnthropicKeyClaudeAllowed(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")

	q := makeCommandTestQuest(t, "claude")
	q.Model = "anthropic/claude-haiku-4-5"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	var found bool
	for _, e := range result.Cmd.Env {
		if e == "ANTHROPIC_API_KEY=sk-ant-test" {
			found = true
		}
	}
	if !found {
		t.Error("ANTHROPIC_API_KEY should be allowed for claude harness")
	}
}

func TestBuildCommand_PiArgs(t *testing.T) {
	q := makeCommandTestQuest(t, "pi")
	q.Model = "zai/glm-4.5-air"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	joined := strings.Join(result.Cmd.Args, " ")
	for _, want := range []string{"--mode", "text", "-p", "--model", "zai/glm-4.5-air",
		"--append-system-prompt", "--thinking", "off", "--session"} {
		if !strings.Contains(joined, want) {
			t.Errorf("pi args missing %q; full args: %s", want, joined)
		}
	}
	if q.SessionPath == "" {
		t.Error("SessionPath not set for pi harness")
	}
}

func TestBuildCommand_ClaudeArgs(t *testing.T) {
	q := makeCommandTestQuest(t, "claude")
	q.Model = "anthropic/claude-haiku-4-5"
	result, err := BuildCommand(context.Background(), q, 9999)
	if err != nil {
		t.Fatalf("BuildCommand: %v", err)
	}
	defer result.Cleanup()

	joined := strings.Join(result.Cmd.Args, " ")
	for _, want := range []string{"--print", "--model", "anthropic/claude-haiku-4-5",
		"--append-system-prompt-file", "--effort", "low"} {
		if !strings.Contains(joined, want) {
			t.Errorf("claude args missing %q; full args: %s", want, joined)
		}
	}
}

func TestResolveHarness(t *testing.T) {
	tests := []struct {
		model string
		want  string
	}{
		{"anthropic/claude-haiku-4-5", "claude"},
		{"anthropic/claude-sonnet-4-6", "claude"},
		{"zai/glm-4.5-air", "pi"},
		{"github-copilot/claude-haiku-4.5", "pi"},
		{"google/gemini-2.0-flash", "pi"},
	}
	for _, tt := range tests {
		t.Run(tt.model, func(t *testing.T) {
			got := resolveHarness(tt.model)
			if got != tt.want {
				t.Errorf("resolveHarness(%q) = %q, want %q", tt.model, got, tt.want)
			}
		})
	}
}

func TestThinkingEffortMapping(t *testing.T) {
	thinkingTests := []struct{ adj, want string }{
		{"silly", "off"}, {"clever", "low"}, {"wise", "medium"}, {"elder", "high"},
	}
	for _, tt := range thinkingTests {
		if got := piThinking(tt.adj); got != tt.want {
			t.Errorf("piThinking(%q) = %q, want %q", tt.adj, got, tt.want)
		}
	}

	effortTests := []struct{ adj, want string }{
		{"silly", "low"}, {"clever", "medium"}, {"wise", "high"}, {"elder", "max"},
	}
	for _, tt := range effortTests {
		if got := claudeEffort(tt.adj); got != tt.want {
			t.Errorf("claudeEffort(%q) = %q, want %q", tt.adj, got, tt.want)
		}
	}
}

func TestShouldBlock(t *testing.T) {
	tests := []struct {
		key, harness string
		want         bool
	}{
		{"MY_API_KEY", "pi", true},
		{"MY_SECRET", "pi", true},
		{"MY_TOKEN", "pi", true},
		{"MY_PASSWORD", "pi", true},
		{"MY_CREDENTIAL_FILE", "pi", true},
		{"AWS_REGION", "pi", true},
		{"GITHUB_TOKEN", "pi", true},
		{"OPENAI_API_KEY", "pi", true},
		{"AZURE_CLIENT_ID", "pi", true},
		{"GCP_PROJECT", "pi", true},
		{"ANTHROPIC_API_KEY", "pi", true},
		{"ANTHROPIC_API_KEY", "claude", false},
		{"HOME", "pi", false},
		{"PATH", "pi", false},
		{"SAFE_VAR", "pi", false},
		{"HOARD_GUARD_MODE", "pi", false},
	}
	for _, tt := range tests {
		t.Run(tt.key+"/"+tt.harness, func(t *testing.T) {
			got := shouldBlock(tt.key, tt.harness)
			if got != tt.want {
				t.Errorf("shouldBlock(%q, %q) = %v, want %v", tt.key, tt.harness, got, tt.want)
			}
		})
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```
cd storybook-daemon && go test ./internal/quest/ -run TestBuildCommand 2>&1 | head -20
```

Expected: `undefined: BuildCommand`

- [ ] **Step 3: Create `internal/quest/command.go`**

```go
package quest

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// CommandResult holds the built command and a cleanup function for temp files.
type CommandResult struct {
	Cmd     *exec.Cmd
	Cleanup func()
}

// BuildCommand constructs the subprocess command for a quest.
// It creates a temp directory, writes the system prompt, sets env, and returns
// a Cleanup func that removes the temp dir. The caller must defer result.Cleanup().
func BuildCommand(ctx context.Context, q *Quest, daemonPort int) (*CommandResult, error) {
	tmpDir, err := os.MkdirTemp("", "hoard-quest-"+q.ID+"-")
	if err != nil {
		return nil, fmt.Errorf("creating temp dir: %w", err)
	}
	cleanup := func() { os.RemoveAll(tmpDir) }

	prompt := BuildAllyPrompt(q.Combo, q.Ally)
	promptFile := filepath.Join(tmpDir, "system.md")
	if err := os.WriteFile(promptFile, []byte(prompt), 0600); err != nil {
		cleanup()
		return nil, fmt.Errorf("writing system prompt: %w", err)
	}

	harness := q.Harness
	if harness == "" {
		harness = resolveHarness(q.Model)
	}

	env := buildEnv(harness, daemonPort, q)

	var cmd *exec.Cmd
	switch harness {
	case "pi":
		sessionFile := filepath.Join(tmpDir, "session.jsonl")
		q.SessionPath = sessionFile
		tools := ResolveTools(q.Combo.Job)
		thinking := piThinking(q.Combo.Adjective)
		cmd = exec.CommandContext(ctx, "pi",
			"--mode", "text",
			"-p",
			"--model", q.Model,
			"--append-system-prompt", promptFile,
			"--tools", tools,
			"--thinking", thinking,
			"--session", sessionFile,
			"Task: "+q.Task,
		)

	case "claude":
		tools := ResolveTools(q.Combo.Job)
		effort := claudeEffort(q.Combo.Adjective)
		cmd = exec.CommandContext(ctx, "claude",
			"--print",
			"--model", q.Model,
			"--append-system-prompt-file", promptFile,
			"--allowedTools", tools,
			"--effort", effort,
			q.Task,
		)

	case "test":
		// Full pipeline (prompt written, env filtered) but runs echo instead of pi/claude.
		// Used in integration tests when API keys are unavailable.
		cmd = exec.CommandContext(ctx, "echo", "Task: "+q.Task)

	default:
		cleanup()
		return nil, fmt.Errorf("unknown harness: %q", harness)
	}

	cmd.Env = env
	return &CommandResult{Cmd: cmd, Cleanup: cleanup}, nil
}

// resolveHarness derives the subprocess harness from the model's provider prefix.
// "anthropic/*" → claude CLI; everything else → pi.
func resolveHarness(model string) string {
	provider, _, found := strings.Cut(model, "/")
	if found && provider == "anthropic" {
		return "claude"
	}
	return "pi"
}

// piThinking maps an ally adjective to a pi --thinking level.
func piThinking(adjective string) string {
	switch adjective {
	case "clever":
		return "low"
	case "wise":
		return "medium"
	case "elder":
		return "high"
	default:
		return "off"
	}
}

// claudeEffort maps an ally adjective to a claude --effort level.
func claudeEffort(adjective string) string {
	switch adjective {
	case "clever":
		return "medium"
	case "wise":
		return "high"
	case "elder":
		return "max"
	default:
		return "low"
	}
}

// blockedSuffixes are env var key suffixes that indicate sensitive credentials.
var blockedSuffixes = []string{
	"_API_KEY", "_SECRET", "_TOKEN", "_PASSWORD", "_CREDENTIAL",
}

// blockedPrefixes are env var key prefixes for cloud/external service namespaces.
var blockedPrefixes = []string{
	"AWS_", "GITHUB_", "OPENAI_", "AZURE_", "GCP_",
}

// shouldBlock reports whether an env var with the given key should be stripped
// from the subprocess environment. ANTHROPIC_API_KEY is allowed for the claude harness only.
func shouldBlock(key, harness string) bool {
	if key == "ANTHROPIC_API_KEY" {
		return harness != "claude"
	}
	for _, suffix := range blockedSuffixes {
		if strings.HasSuffix(key, suffix) {
			return true
		}
	}
	for _, prefix := range blockedPrefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

// buildEnv constructs the subprocess environment: inherit os.Environ(), strip blocked vars,
// then overlay hoard-specific vars.
func buildEnv(harness string, daemonPort int, q *Quest) []string {
	raw := os.Environ()
	filtered := make([]string, 0, len(raw)+4)
	for _, kv := range raw {
		eq := strings.IndexByte(kv, '=')
		if eq < 0 {
			continue
		}
		if !shouldBlock(kv[:eq], harness) {
			filtered = append(filtered, kv)
		}
	}
	return append(filtered,
		"HOARD_GUARD_MODE=ally",
		"HOARD_ALLY_DEFNAME="+q.Combo.DefName(),
		"HOARD_ALLY_NAME="+q.Ally,
		fmt.Sprintf("HOARD_STONE_PORT=%d", daemonPort),
	)
}
```

- [ ] **Step 4: Run command tests**

```
cd storybook-daemon && go test ./internal/quest/ -run "TestBuildCommand|TestResolveHarness|TestThinkingEffort|TestShouldBlock" -v 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Full build and test**

```
cd storybook-daemon && go build ./... && go test ./...
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon && git add internal/quest/command.go internal/quest/command_test.go
git commit -m "feat(quest): command construction — BuildCommand with env filtering and harness resolution

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Cascade retry

**Files:**

- Create: `internal/quest/cascade.go`
- Create: `internal/quest/cascade_test.go`

- [ ] **Step 1: Write `cascade_test.go` (failing)**

```go
package quest_test

import (
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/quest"
)

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name      string
		stderr    string
		exitCode  int
		retryable bool
		cooldown  time.Duration
	}{
		{"rate limit 429", "error 429 rate limit exceeded", 1, true, 30 * time.Second},
		{"rate limit text", "rate limit reached for model", 1, true, 30 * time.Second},
		{"server error 500", "internal server error 500", 1, true, 10 * time.Second},
		{"server error 502", "502 bad gateway", 1, true, 10 * time.Second},
		{"server error 503", "503 service unavailable", 1, true, 10 * time.Second},
		{"server error 504", "gateway timeout 504", 1, true, 10 * time.Second},
		{"auth error", "unauthorized 401", 1, false, 0},
		{"not found", "404 model not found", 1, false, 0},
		{"clean exit", "", 0, false, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			retryable, cooldown := quest.IsRetryable(tt.stderr, tt.exitCode)
			if retryable != tt.retryable {
				t.Errorf("retryable = %v, want %v", retryable, tt.retryable)
			}
			if tt.retryable && cooldown != tt.cooldown {
				t.Errorf("cooldown = %v, want %v", cooldown, tt.cooldown)
			}
		})
	}
}

func TestCooldownTracker_FreshProviderNotCooled(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	if tracker.IsCooledDown("anthropic") {
		t.Error("fresh provider should not be cooled down")
	}
}

func TestCooldownTracker_RecordedProviderIsCooled(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	tracker.Record("anthropic", 100*time.Millisecond)
	if !tracker.IsCooledDown("anthropic") {
		t.Error("provider should be cooled down after Record")
	}
}

func TestCooldownTracker_CooldownExpires(t *testing.T) {
	tracker := quest.NewCooldownTracker()
	tracker.Record("anthropic", 50*time.Millisecond)
	time.Sleep(100 * time.Millisecond)
	if tracker.IsCooledDown("anthropic") {
		t.Error("cooldown should have expired")
	}
}

func TestCascader_NextModel_SkipsFirst(t *testing.T) {
	c := quest.NewCascader()
	// kobold cascade: zai → github-copilot → anthropic → google
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model")
	}
	if next == "zai/glm-4.5-air" {
		t.Error("next model should not be the same as failed model")
	}
}

func TestCascader_NextModel_SkipsCooled(t *testing.T) {
	c := quest.NewCascader()
	// Cool down the second model's provider
	c.RecordFailure("github-copilot/claude-haiku-4.5", 10*time.Second)
	// After failing zai, next should skip github-copilot (cooled) and go to anthropic
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model")
	}
	if next == "github-copilot/claude-haiku-4.5" {
		t.Error("should skip cooled provider; got github-copilot model")
	}
}

func TestCascader_NextModel_Exhausted(t *testing.T) {
	c := quest.NewCascader()
	// dragon only has 2 models; after failing both there's nothing left
	c.RecordFailure("anthropic/claude-opus-4-6", 10*time.Second)
	_, ok := c.NextModel("dragon", "anthropic/claude-opus-4-6")
	if ok {
		t.Error("should be exhausted after last model")
	}
}

func TestCascader_RecordFailure_SetsCooldown(t *testing.T) {
	c := quest.NewCascader()
	c.RecordFailure("zai/glm-4.5-air", 50*time.Millisecond)
	// zai provider should be cooled
	next, ok := c.NextModel("kobold", "zai/glm-4.5-air")
	if !ok {
		t.Fatal("expected a next model after failure")
	}
	// next model should not be from the zai provider
	if next == "zai/glm-4.5-air" {
		t.Error("should not return the failed model")
	}
}
```

- [ ] **Step 2: Run to confirm failure**

```
cd storybook-daemon && go test ./internal/quest/ -run TestIsRetryable 2>&1 | head -5
```

Expected: `undefined: quest.IsRetryable`

- [ ] **Step 3: Create `internal/quest/cascade.go`**

```go
package quest

import (
	"strings"
	"sync"
	"time"
)

// IsRetryable inspects subprocess stderr and exit code to determine whether a
// quest failure is transient and should trigger a cascade retry.
func IsRetryable(stderr string, exitCode int) (retryable bool, cooldown time.Duration) {
	lower := strings.ToLower(stderr)
	if strings.Contains(lower, "429") || strings.Contains(lower, "rate limit") {
		return true, 30 * time.Second
	}
	for _, code := range []string{"500", "502", "503", "504"} {
		if strings.Contains(lower, code) {
			return true, 10 * time.Second
		}
	}
	return false, 0
}

// providerOf extracts the provider prefix from a model string.
// "zai/glm-4.5-air" → "zai", "anthropic/claude-haiku-4-5" → "anthropic".
func providerOf(model string) string {
	provider, _, _ := strings.Cut(model, "/")
	return provider
}

// CooldownTracker records per-provider cooldown deadlines.
// Cooldowns are account-wide (not per-session), so a single tracker lives on the Manager.
type CooldownTracker struct {
	mu        sync.Mutex
	providers map[string]time.Time // provider → cooled-until
}

// NewCooldownTracker creates an empty tracker.
func NewCooldownTracker() *CooldownTracker {
	return &CooldownTracker{providers: make(map[string]time.Time)}
}

// IsCooledDown reports whether the given provider is still within its cooldown window.
func (t *CooldownTracker) IsCooledDown(provider string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	until, ok := t.providers[provider]
	return ok && time.Now().Before(until)
}

// Record marks the provider as cooled for the given duration.
func (t *CooldownTracker) Record(provider string, dur time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.providers[provider] = time.Now().Add(dur)
}

// Cascader manages model cascade retries with cooldown tracking.
// One Cascader lives on the Manager (account-wide, not per-session).
type Cascader struct {
	cooldowns *CooldownTracker
}

// NewCascader creates a Cascader with a fresh cooldown tracker.
func NewCascader() *Cascader {
	return &Cascader{cooldowns: NewCooldownTracker()}
}

// NextModel returns the next model to try after failedModel within the noun's
// cascade chain, skipping any providers currently in cooldown.
// Returns "", false if the cascade is exhausted.
func (c *Cascader) NextModel(noun, failedModel string) (string, bool) {
	chain := ModelCascade(noun)
	failedIdx := -1
	for i, m := range chain {
		if m == failedModel {
			failedIdx = i
			break
		}
	}
	if failedIdx < 0 {
		return "", false
	}
	for _, m := range chain[failedIdx+1:] {
		if !c.cooldowns.IsCooledDown(providerOf(m)) {
			return m, true
		}
	}
	return "", false
}

// RecordFailure marks the provider of failedModel as cooled for dur.
func (c *Cascader) RecordFailure(failedModel string, dur time.Duration) {
	c.cooldowns.Record(providerOf(failedModel), dur)
}
```

- [ ] **Step 4: Run cascade tests**

```
cd storybook-daemon && go test ./internal/quest/ -run "TestIsRetryable|TestCooldown|TestCascader" -v 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 5: Build and full test**

```
cd storybook-daemon && go build ./... && go test ./...
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon && git add internal/quest/cascade.go internal/quest/cascade_test.go
git commit -m "feat(quest): cascade retry — IsRetryable, CooldownTracker, Cascader

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Manager rewrite

**Files:**

- Modify: `internal/quest/manager.go` (full rewrite)

The manager gains: updated `BrokerSender` interface (stone.Message + History), `daemonPort` and `cascader` and `groups` fields, `newQuest`/`terminateQuest`/`execCommand` helpers, cascade retry loop in `runQuest`, group-aware `Dispatch`, and `setStatus` that closes `q.done` on terminal status.

The mock harness is retained alongside "test" so existing unit tests continue without modification.

- [ ] **Step 1: Verify existing tests pass before touching manager.go**

```
cd storybook-daemon && go test ./internal/quest/ -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL)"
```

Note the passing tests. All must pass after the rewrite.

- [ ] **Step 2: Rewrite `internal/quest/manager.go`**

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

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// BrokerSender is the interface the manager uses to post stone events.
// Defined in the consumer package per Go convention.
type BrokerSender interface {
	Send(ctx context.Context, sessionID string, msg stone.Message) error
	History(sessionID string, sinceID string) []stone.Message
}

// Manager owns the lifecycle of all running quests and groups.
type Manager struct {
	mu         sync.Mutex
	quests     map[string]*Quest
	groups     map[string]*Group
	bySession  map[string][]string
	broker     BrokerSender
	cascader   *Cascader
	daemonPort int
	logFn      func(args ...any)
	nextID     atomic.Int64
}

// NewManager constructs a Manager. broker may be nil (no stone events posted).
func NewManager(broker BrokerSender, daemonPort int, logFn func(args ...any)) *Manager {
	return &Manager{
		quests:     make(map[string]*Quest),
		groups:     make(map[string]*Group),
		bySession:  make(map[string][]string),
		broker:     broker,
		cascader:   NewCascader(),
		daemonPort: daemonPort,
		logFn:      logFn,
	}
}

// Dispatch validates all requests, registers quests, and starts goroutines.
// Returns QuestInfo snapshots immediately — quests run asynchronously.
// For chain mode the returned infos cover all steps; quest IDs are pre-allocated.
func (m *Manager) Dispatch(ctx context.Context, sessionID string, req DispatchRequest) ([]QuestInfo, string, error) {
	if len(req.Quests) == 0 {
		return nil, "", fmt.Errorf("no quests to dispatch")
	}
	if req.Mode == "single" && len(req.Quests) != 1 {
		return nil, "", fmt.Errorf("mode %q requires exactly 1 quest, got %d", req.Mode, len(req.Quests))
	}
	for _, qr := range req.Quests {
		if ParseDefName(qr.Ally) == nil {
			return nil, "", fmt.Errorf("invalid ally defName: %q", qr.Ally)
		}
	}

	switch req.Mode {
	case "single":
		qr := req.Quests[0]
		q := m.newQuest(sessionID, qr, "")
		timeout := m.resolveTimeout(qr, q.Combo)

		m.mu.Lock()
		m.quests[q.ID] = q
		m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
		m.mu.Unlock()

		go m.runQuest(q, timeout)
		return []QuestInfo{q.Info()}, "", nil

	case "rally":
		groupID := "group-" + strconv.FormatInt(m.nextID.Add(1), 10)
		group := &Group{
			ID:       groupID,
			Mode:     "rally",
			FailFast: req.FailFast,
			done:     make(chan struct{}),
		}

		var infos []QuestInfo
		var quests []*Quest
		for _, qr := range req.Quests {
			q := m.newQuest(sessionID, qr, groupID)
			timeout := m.resolveTimeout(qr, q.Combo)
			group.QuestIDs = append(group.QuestIDs, q.ID)

			m.mu.Lock()
			m.quests[q.ID] = q
			m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
			m.mu.Unlock()

			quests = append(quests, q)
			infos = append(infos, q.Info())
			go m.runQuest(q, timeout)
		}

		m.mu.Lock()
		m.groups[groupID] = group
		m.mu.Unlock()

		go m.watchRally(ctx, group, quests, sessionID)
		return infos, groupID, nil

	case "chain":
		groupID := "group-" + strconv.FormatInt(m.nextID.Add(1), 10)
		group := &Group{
			ID:   groupID,
			Mode: "chain",
			done: make(chan struct{}),
		}

		var infos []QuestInfo
		var quests []*Quest
		for _, qr := range req.Quests {
			q := m.newQuest(sessionID, qr, groupID)
			group.QuestIDs = append(group.QuestIDs, q.ID)

			m.mu.Lock()
			m.quests[q.ID] = q
			m.bySession[sessionID] = append(m.bySession[sessionID], q.ID)
			m.mu.Unlock()

			quests = append(quests, q)
			infos = append(infos, q.Info())
		}

		m.mu.Lock()
		m.groups[groupID] = group
		m.mu.Unlock()

		go m.runChain(ctx, group, quests, req.Quests, sessionID)
		return infos, groupID, nil

	default:
		return nil, "", fmt.Errorf("unknown dispatch mode: %q", req.Mode)
	}
}

func (m *Manager) newQuest(sessionID string, qr QuestRequest, groupID string) *Quest {
	id := "quest-" + strconv.FormatInt(m.nextID.Add(1), 10)
	combo := ParseDefName(qr.Ally)
	model := qr.Model
	if model == "" {
		model = ResolveModel(combo.Noun)
	}
	harness := qr.Harness // "test" or "mock" for tests; "" derives from model in runQuest
	return &Quest{
		ID:        id,
		SessionID: sessionID,
		GroupID:   groupID,
		Ally:      qr.Ally,
		Combo:     combo,
		Harness:   harness,
		Model:     model,
		Task:      qr.Task,
		Status:    StatusPending,
		StartedAt: time.Now(),
		done:      make(chan struct{}),
	}
}

func (m *Manager) resolveTimeout(qr QuestRequest, combo *AllyCombo) time.Duration {
	ms := qr.TimeoutMs
	if ms <= 0 {
		ms = JobDefaults(combo.Job).TimeoutMs
	}
	return time.Duration(ms) * time.Millisecond
}

// runQuest runs a quest to completion, retrying with cascade on retryable failures.
// The quest goroutine owns the quest from spawning through termination.
func (m *Manager) runQuest(q *Quest, timeout time.Duration) {
	// Create a cancellable root for this quest's lifetime.
	questCtx, questCancel := context.WithCancel(context.Background())
	m.mu.Lock()
	q.cancel = questCancel
	m.mu.Unlock()
	defer questCancel()

	m.setStatus(q, StatusSpawning)

	for {
		runCtx, runCancel := context.WithTimeout(questCtx, timeout)

		var cmd *exec.Cmd
		var cleanup func()

		if q.Harness == "mock" {
			// Internal test-only harness: run task as shell command directly.
			parts := strings.Fields(q.Task)
			if len(parts) == 0 {
				runCancel()
				m.terminateQuest(q, StatusFailed, "empty task")
				return
			}
			cmd = exec.CommandContext(runCtx, parts[0], parts[1:]...)
			cleanup = func() {}
		} else {
			result, err := BuildCommand(runCtx, q, m.daemonPort)
			if err != nil {
				runCancel()
				m.terminateQuest(q, StatusFailed, fmt.Sprintf("build command: %v", err))
				return
			}
			cmd = result.Cmd
			cleanup = result.Cleanup
		}

		m.setStatus(q, StatusRunning)
		response, runErr := m.execCommand(runCtx, q, cmd)
		cleanup()

		// Capture context state before cancelling the run context.
		timedOut := runCtx.Err() == context.DeadlineExceeded
		cancelled := questCtx.Err() == context.Canceled
		runCancel()

		if cancelled {
			m.terminateQuest(q, StatusCancelled, "cancelled")
			return
		}
		if timedOut {
			m.terminateQuest(q, StatusTimeout, "timeout")
			return
		}

		if runErr != nil {
			// Attempt cascade retry.
			var exitCode int
			m.mu.Lock()
			if q.ExitCode != nil {
				exitCode = *q.ExitCode
			}
			stderr := q.LastStderr
			m.mu.Unlock()

			retryable, cooldown := IsRetryable(stderr, exitCode)
			if retryable {
				nextModel, ok := m.cascader.NextModel(q.Combo.Noun, q.Model)
				if ok {
					m.cascader.RecordFailure(q.Model, cooldown)
					m.logFn("quest cascade: ", q.ID, " failing model=", q.Model, " → next=", nextModel, " cooldown=", cooldown)
					select {
					case <-questCtx.Done():
						m.terminateQuest(q, StatusCancelled, "cancelled during cascade cooldown")
						return
					case <-time.After(cooldown):
					}
					m.mu.Lock()
					q.Model = nextModel
					q.Harness = resolveHarness(nextModel)
					m.mu.Unlock()
					continue // retry with new model
				}
			}
			m.terminateQuest(q, StatusFailed, runErr.Error())
			return
		}

		m.mu.Lock()
		q.Response = response
		m.mu.Unlock()
		m.terminateQuest(q, StatusCompleted, "")
		return
	}
}

// execCommand starts the command, collects stdout/stderr, and waits for exit.
// Sets q.PID, q.FinishedAt, q.LastStderr, q.ExitCode on the quest (under mutex).
// Returns trimmed stdout and the wait error.
func (m *Manager) execCommand(ctx context.Context, q *Quest, cmd *exec.Cmd) (response string, err error) {
	stderrPipe, pipeErr := cmd.StderrPipe()
	if pipeErr != nil {
		return "", fmt.Errorf("stderr pipe: %w", pipeErr)
	}
	stdoutPipe, pipeErr := cmd.StdoutPipe()
	if pipeErr != nil {
		return "", fmt.Errorf("stdout pipe: %w", pipeErr)
	}

	if startErr := cmd.Start(); startErr != nil {
		return "", fmt.Errorf("start: %w", startErr)
	}

	m.mu.Lock()
	q.PID = cmd.Process.Pid
	m.mu.Unlock()

	var (
		lastStderr string
		stderrMu   sync.Mutex
		stderrDone = make(chan struct{})
	)
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			stderrMu.Lock()
			lastStderr = scanner.Text()
			stderrMu.Unlock()
		}
	}()

	var out strings.Builder
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		out.WriteString(scanner.Text())
		out.WriteByte('\n')
	}

	<-stderrDone
	waitErr := cmd.Wait()

	stderrMu.Lock()
	finalStderr := lastStderr
	stderrMu.Unlock()

	now := time.Now()
	m.mu.Lock()
	q.FinishedAt = &now
	q.LastStderr = finalStderr
	if waitErr != nil {
		code := cmd.ProcessState.ExitCode()
		q.ExitCode = &code
	} else {
		code := 0
		q.ExitCode = &code
	}
	m.mu.Unlock()

	return strings.TrimSpace(out.String()), waitErr
}

// setStatus updates the quest status and closes q.done on terminal states.
func (m *Manager) setStatus(q *Quest, status Status) {
	m.mu.Lock()
	q.Status = status
	terminal := status == StatusCompleted || status == StatusFailed ||
		status == StatusTimeout || status == StatusCancelled
	m.mu.Unlock()

	if terminal {
		q.doneOnce.Do(func() { close(q.done) })
	}
}

// terminateQuest sets FinishedAt and Error (if non-empty), then calls setStatus.
func (m *Manager) terminateQuest(q *Quest, status Status, errMsg string) {
	now := time.Now()
	m.mu.Lock()
	if q.FinishedAt == nil {
		q.FinishedAt = &now
	}
	if errMsg != "" && q.Error == "" {
		q.Error = errMsg
	}
	m.mu.Unlock()
	m.setStatus(q, status)
}

// Status returns snapshots for the given quest IDs, or all quests in the session.
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

// Cancel cancels a single quest by ID.
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

// Cleanup cancels all quests for a session and removes them from the manager.
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

- [ ] **Step 3: Update existing test files for new `Dispatch` signature**

`Dispatch` now returns `([]QuestInfo, string, error)` — 3 values. Update callers in `manager_test.go` and `integration_test.go`.

In `manager_test.go`, replace every:

```go
infos, err := m.Dispatch(...)
```

with:

```go
infos, _, err := m.Dispatch(...)
```

In `integration_test.go`, same replacement.

- [ ] **Step 4: Update `NewManager` calls in test files**

In `manager_test.go` and `integration_test.go`, replace every:

```go
m := NewManager(nil, t.Log)
```

with:

```go
m := NewManager(nil, 0, t.Log)
```

- [ ] **Step 5: Run all quest tests**

```
cd storybook-daemon && go test ./internal/quest/ -v 2>&1 | grep -E "^(=== RUN|--- PASS|--- FAIL|FAIL|ok)"
```

Expected: all previously-passing tests still pass. (The command and cascade tests from Tasks 3–4 also pass.)

- [ ] **Step 6: Full build**

```
cd storybook-daemon && go build ./...
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd storybook-daemon && git add internal/quest/manager.go internal/quest/manager_test.go internal/quest/integration_test.go
git commit -m "feat(quest): manager rewrite — BrokerSender v2, cascade retry loop, group dispatch

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Orchestrate — rally, chain, stone events

**Files:**

- Create: `internal/quest/orchestrate.go`
- Create: `internal/quest/orchestrate_test.go`

- [ ] **Step 1: Write `orchestrate_test.go` (failing)**

```go
package quest_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/quest"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// mockBroker records sent messages and serves them via History.
type mockBroker struct {
	mu   sync.Mutex
	msgs []stone.Message
}

func (b *mockBroker) Send(_ context.Context, _ string, msg stone.Message) error {
	b.mu.Lock()
	b.msgs = append(b.msgs, msg)
	b.mu.Unlock()
	return nil
}

func (b *mockBroker) History(_ string, _ string) []stone.Message {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]stone.Message, len(b.msgs))
	copy(out, b.msgs)
	return out
}

func (b *mockBroker) messagesOfType(typ string) []stone.Message {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []stone.Message
	for _, m := range b.msgs {
		if m.Type == typ {
			out = append(out, m)
		}
	}
	return out
}

func waitQuestStatus(t *testing.T, m *quest.Manager, sessionID, questID string, want quest.Status, deadline time.Duration) {
	t.Helper()
	end := time.After(deadline)
	for {
		select {
		case <-end:
			t.Fatalf("quest %s did not reach status %q within %v", questID, want, deadline)
		default:
		}
		statuses := m.Status(sessionID, []string{questID})
		if len(statuses) == 1 && statuses[0].Status == want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestRally_AllComplete_PostsGroupCompleted(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, groupID, err := m.Dispatch(context.Background(), "rally-session", quest.DispatchRequest{
		Mode: "rally",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "hello", Harness: "mock"},
			{Ally: "silly-kobold-scout", Task: "world", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 2 {
		t.Fatalf("expected 2 infos, got %d", len(infos))
	}
	if groupID == "" {
		t.Fatal("expected non-empty groupID")
	}

	// Wait for both quests to complete.
	for _, info := range infos {
		waitQuestStatus(t, m, "rally-session", info.QuestID, quest.StatusCompleted, 5*time.Second)
	}

	// group_completed should arrive shortly after.
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("group_completed event not received within 2s")
		default:
		}
		if msgs := broker.messagesOfType("group_completed"); len(msgs) > 0 {
			msg := msgs[0]
			if msg.Metadata["mode"] != "rally" {
				t.Errorf("group_completed mode = %v, want rally", msg.Metadata["mode"])
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestRally_FailFast_CancelsRemaining(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "failfast-session", quest.DispatchRequest{
		Mode:     "rally",
		FailFast: true,
		Quests: []quest.QuestRequest{
			// First quest fails immediately (false command).
			{Ally: "silly-kobold-scout", Task: "false", Harness: "mock", TimeoutMs: 5000},
			// Second quest would sleep forever if not cancelled.
			{Ally: "silly-kobold-scout", Task: "sleep 60", Harness: "mock", TimeoutMs: 5000},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	// Both quests should reach a terminal state (failed or cancelled) within deadline.
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quests did not terminate within 5s")
		default:
		}
		statuses := m.Status("failfast-session", []string{infos[0].QuestID, infos[1].QuestID})
		allTerminal := true
		for _, s := range statuses {
			if s.Status != quest.StatusFailed && s.Status != quest.StatusCancelled && s.Status != quest.StatusTimeout {
				allTerminal = false
			}
		}
		if len(statuses) == 2 && allTerminal {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestChain_Sequential_SubstitutesPrevious(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, groupID, err := m.Dispatch(context.Background(), "chain-session", quest.DispatchRequest{
		Mode: "chain",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "echo step-one-result", Harness: "mock"},
			// {previous} will be substituted with step 1's output.
			{Ally: "silly-kobold-scout", Task: "echo step-two-got-{previous}", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}
	if len(infos) != 2 {
		t.Fatalf("expected 2 infos, got %d", len(infos))
	}
	if groupID == "" {
		t.Fatal("expected non-empty groupID for chain")
	}

	// Wait for both quests to complete.
	for _, info := range infos {
		waitQuestStatus(t, m, "chain-session", info.QuestID, quest.StatusCompleted, 8*time.Second)
	}

	// Second quest's task should have had {previous} substituted.
	statuses := m.Status("chain-session", []string{infos[1].QuestID})
	if len(statuses) != 1 {
		t.Fatal("quest 2 status not found")
	}
	// The echo output of quest 2 should reference step-one-result (substituted).
	if !strings.Contains(statuses[0].Summary, "step-two-got-") {
		t.Errorf("chain substitution: summary = %q, expected to contain step-two-got-", statuses[0].Summary)
	}
}

func TestChain_StepFails_CancelsRemaining(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "chain-fail-session", quest.DispatchRequest{
		Mode: "chain",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "false", Harness: "mock", TimeoutMs: 5000},
			{Ally: "silly-kobold-scout", Task: "echo should-not-run", Harness: "mock", TimeoutMs: 5000},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	// Both quests should reach terminal state.
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quests did not terminate within 5s")
		default:
		}
		statuses := m.Status("chain-fail-session", []string{infos[0].QuestID, infos[1].QuestID})
		if len(statuses) == 2 {
			s0 := statuses[0].Status
			s1 := statuses[1].Status
			if (s0 == quest.StatusFailed || s0 == quest.StatusTimeout) &&
				(s1 == quest.StatusCancelled) {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestQuestCompleted_PostedToStone(t *testing.T) {
	broker := &mockBroker{}
	m := quest.NewManager(broker, 0, t.Log)

	infos, _, err := m.Dispatch(context.Background(), "stone-session", quest.DispatchRequest{
		Mode: "single",
		Quests: []quest.QuestRequest{
			{Ally: "silly-kobold-scout", Task: "echo hi", Harness: "mock"},
		},
	})
	if err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	waitQuestStatus(t, m, "stone-session", infos[0].QuestID, quest.StatusCompleted, 5*time.Second)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatal("quest_completed not posted within 2s")
		default:
		}
		if msgs := broker.messagesOfType("quest_completed"); len(msgs) > 0 {
			msg := msgs[0]
			if msg.Metadata["ally"] != "silly-kobold-scout" {
				t.Errorf("quest_completed ally = %v", msg.Metadata["ally"])
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
}
```

- [ ] **Step 2: Run to confirm failure**

```
cd storybook-daemon && go test ./internal/quest/ -run "TestRally|TestChain|TestQuestCompleted" 2>&1 | head -10
```

Expected: FAIL (orchestrate methods undefined or stone events not posted).

- [ ] **Step 3: Create `internal/quest/orchestrate.go`**

```go
package quest

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// watchRally monitors all quests in a rally group. When all quests reach terminal
// state it posts group_completed. If FailFast is set, the first failure cancels remaining quests.
func (m *Manager) watchRally(ctx context.Context, group *Group, quests []*Quest, sessionID string) {
	var wg sync.WaitGroup
	var failed atomic.Int64

	for _, q := range quests {
		q := q
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-q.done
			if q.Status == StatusFailed || q.Status == StatusTimeout {
				failed.Add(1)
				if group.FailFast {
					for _, other := range quests {
						if other.ID != q.ID {
							_ = m.Cancel(q.SessionID, other.ID)
						}
					}
				}
			}
			m.postQuestCompleted(ctx, q)
		}()
	}

	wg.Wait()

	f := int(failed.Load())
	s := len(quests) - f
	m.postGroupCompleted(ctx, group, sessionID, s, f)
	group.done = make(chan struct{}) // satisfy potential waiters
	close(group.done)
}

// runChain runs chain quests sequentially, threading output via {previous} substitution.
// On any step failure, remaining quests are cancelled.
func (m *Manager) runChain(ctx context.Context, group *Group, quests []*Quest, requests []QuestRequest, sessionID string) {
	succeeded := 0
	failed := 0
	var previous string

	for i, q := range quests {
		qr := requests[i]

		// Substitute {previous} into the task before running.
		m.mu.Lock()
		q.Task = strings.ReplaceAll(q.Task, "{previous}", previous)
		m.mu.Unlock()

		timeout := m.resolveTimeout(qr, q.Combo)
		m.runQuest(q, timeout)

		if q.Status != StatusCompleted {
			failed++
			// Cancel and mark remaining quests as cancelled.
			for _, remaining := range quests[i+1:] {
				m.terminateQuest(remaining, StatusCancelled, "chain step failed")
				m.postQuestCompleted(ctx, remaining)
			}
			m.postQuestCompleted(ctx, q)
			m.postGroupCompleted(ctx, group, sessionID, succeeded, failed)
			close(group.done)
			return
		}

		succeeded++
		previous = m.resolveOutput(ctx, q, sessionID)
		m.postQuestCompleted(ctx, q)
	}

	m.postGroupCompleted(ctx, group, sessionID, succeeded, failed)
	close(group.done)
}

// resolveOutput determines the best output string for a completed quest.
// Resolution order: stone result message → pi session log → stdout.
func (m *Manager) resolveOutput(ctx context.Context, q *Quest, sessionID string) string {
	// 1. Stone result message from ally.
	if m.broker != nil {
		msgs := m.broker.History(sessionID, "")
		for i := len(msgs) - 1; i >= 0; i-- {
			msg := msgs[i]
			if msg.From == q.Ally && msg.Type == "result" && msg.Content != "" {
				return msg.Content
			}
		}
	}

	// 2. Pi session log (JSONL at q.SessionPath).
	if q.SessionPath != "" {
		if content := readLastAssistantFromSession(q.SessionPath); content != "" {
			return content
		}
	}

	// 3. Stdout fallback (claude --print gives clean text; pi --mode text also works).
	m.mu.Lock()
	resp := q.Response
	m.mu.Unlock()
	return resp
}

// readLastAssistantFromSession scans a pi JSONL session file and returns the content
// of the last assistant message. Returns "" if the file is missing or has no assistant turn.
func readLastAssistantFromSession(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var last string
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		var line map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue
		}
		if role, _ := line["role"].(string); role == "assistant" {
			if content, _ := line["content"].(string); content != "" {
				last = content
			}
		}
	}
	return last
}

// postQuestCompleted posts a quest_completed stone event for a finished quest.
// No-op if broker is nil.
func (m *Manager) postQuestCompleted(ctx context.Context, q *Quest) {
	if m.broker == nil {
		return
	}
	elapsed := int64(0)
	m.mu.Lock()
	if q.FinishedAt != nil {
		elapsed = q.FinishedAt.Sub(q.StartedAt).Milliseconds()
	}
	exitCode := 0
	if q.ExitCode != nil {
		exitCode = *q.ExitCode
	}
	summary := q.Response
	if q.Error != "" {
		summary = q.Error
	}
	if len(summary) > 500 {
		summary = summary[:500]
	}
	sessionID := q.SessionID
	m.mu.Unlock()

	msg := stone.Message{
		From:       "quest-manager",
		Addressing: "primary-agent",
		Type:       "quest_completed",
		Content:    summary,
		Metadata: map[string]any{
			"quest_id":   q.ID,
			"ally":       q.Ally,
			"status":     string(q.Status),
			"exit_code":  exitCode,
			"elapsed_ms": elapsed,
			"group_id":   q.GroupID,
		},
	}
	_ = m.broker.Send(ctx, sessionID, msg)
}

// postGroupCompleted posts a group_completed stone event.
// No-op if broker is nil.
func (m *Manager) postGroupCompleted(ctx context.Context, group *Group, sessionID string, succeeded, failed int) {
	if m.broker == nil {
		return
	}
	total := succeeded + failed
	content := fmt.Sprintf("%s completed: %d/%d succeeded", group.Mode, succeeded, total)
	msg := stone.Message{
		From:       "quest-manager",
		Addressing: "primary-agent",
		Type:       "group_completed",
		Content:    content,
		Metadata: map[string]any{
			"group_id":  group.ID,
			"mode":      group.Mode,
			"total":     total,
			"succeeded": succeeded,
			"failed":    failed,
		},
	}
	_ = m.broker.Send(ctx, sessionID, msg)
}
```

- [ ] **Step 4: Run orchestrate tests**

```
cd storybook-daemon && go test ./internal/quest/ -run "TestRally|TestChain|TestQuestCompleted" -v -timeout 30s 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 5: Full build and test**

```
cd storybook-daemon && go build ./... && go test ./... -timeout 60s
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd storybook-daemon && git add internal/quest/orchestrate.go internal/quest/orchestrate_test.go
git commit -m "feat(quest): orchestrate — rally/chain groups, resolveOutput, stone lifecycle events

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Integration test update

**Files:**

- Modify: `internal/quest/integration_test.go`

Add a test that exercises the full BuildCommand pipeline (prompt written to tmpfile, env filtered, cleanup removes tmpfile) via the test harness, confirming the quest completes end-to-end without real API keys.

- [ ] **Step 1: Add test harness integration test to `integration_test.go`**

Append to the existing file:

```go
func TestIntegrationTestHarness_FullPipeline(t *testing.T) {
	// Exercises BuildCommand (prompt file, env filtering, temp cleanup) without API keys.
	m := NewManager(nil, 0, t.Log)

	req := DispatchRequest{
		Mode: "single",
		Quests: []QuestRequest{{
			Ally:    "silly-kobold-scout",
			Task:    "describe the codebase",
			Harness: "test", // echo harness: full pipeline, no real subprocess
		}},
	}

	infos, _, err := m.Dispatch(context.Background(), "int-test-session", req)
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
			t.Fatal("test harness quest did not complete within 5s")
		default:
		}
		statuses := m.Status("int-test-session", []string{questID})
		if len(statuses) == 1 && statuses[0].Status == StatusCompleted {
			if statuses[0].Summary == "" {
				t.Error("expected non-empty response from test harness (echo)")
			}
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
}
```

- [ ] **Step 2: Run integration tests**

```
cd storybook-daemon && go test ./internal/quest/ -run TestIntegration -v -timeout 30s
```

Expected: all PASS including the new test.

- [ ] **Step 3: Commit**

```bash
cd storybook-daemon && git add internal/quest/integration_test.go
git commit -m "test(quest): add full pipeline integration test via test harness

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: MCP wiring

**Files:**

- Modify: `internal/psi/mcp/mcp.go`

Wire the real broker into the quest manager, add `fail_fast` to `questDispatchInput`, use the real group ID from `Dispatch`, and import `internal/stone` for the updated type.

- [ ] **Step 1: Update `mcp.go`**

**In `New()`** — create broker first, then pass to manager:

```go
func New(id string, port int, vault *memory.Vault, ledger *attention.Ledger, log *slog.Logger) *Interface {
	broker := NewBroker(256)
	qm := quest.NewManager(broker, port, func(args ...any) { log.Info(fmt.Sprint(args...)) })
	return &Interface{
		id:       id,
		port:     port,
		vault:    vault,
		ledger:   ledger,
		broker:   broker,
		questMgr: qm,
		log:      log,
		sessions: make(map[string]session),
	}
}
```

**`questDispatchInput`** — add `FailFast`:

```go
type questDispatchInput struct {
	SessionID string               `json:"session_id" jsonschema:"session that owns these quests"`
	Mode      string               `json:"mode" jsonschema:"dispatch mode: single, rally, or chain"`
	Quests    []quest.QuestRequest `json:"quests" jsonschema:"quests to dispatch"`
	FailFast  bool                 `json:"fail_fast,omitempty" jsonschema:"cancel remaining rally quests on first failure"`
}
```

**`handleQuestDispatch`** — use real group ID from `Dispatch`:

```go
func (b *Interface) handleQuestDispatch(ctx context.Context, _ *gomcp.CallToolRequest, input questDispatchInput) (*gomcp.CallToolResult, questDispatchOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, questDispatchOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	req := quest.DispatchRequest{
		Mode:     input.Mode,
		Quests:   input.Quests,
		FailFast: input.FailFast,
	}
	infos, groupID, err := b.questMgr.Dispatch(ctx, input.SessionID, req)
	if err != nil {
		return nil, questDispatchOutput{}, err
	}

	return nil, questDispatchOutput{
		Status:  "dispatched",
		GroupID: groupID,
		Quests:  infos,
	}, nil
}
```

Remove the old fake groupID construction (`"group-" + input.SessionID[:8]` block).

- [ ] **Step 2: Build to confirm everything compiles**

```
cd storybook-daemon && go build ./...
```

Expected: clean. `*Broker` satisfies `quest.BrokerSender` because:

- `Send(_ context.Context, sessionID string, msg stone.Message) error` ✓ (Task 1)
- `History(sessionID string, sinceID string) []stone.Message` ✓ (Task 1)

- [ ] **Step 3: Run all tests**

```
cd storybook-daemon && go test ./... -timeout 60s
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd storybook-daemon && git add internal/psi/mcp/mcp.go
git commit -m "feat(mcp): wire broker to quest manager, add fail_fast, real group ID from Dispatch

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Validation Checklist

After all tasks complete:

- [ ] `cd storybook-daemon && go build ./...` — clean
- [ ] `cd storybook-daemon && go test ./... -timeout 60s` — all pass
- [ ] `stone/types_test.go` — JSON round-trip for `stone.Message` passes
- [ ] `command_test.go` — all `shouldBlock`, harness resolution, pi/claude args, env overlay tests pass
- [ ] `cascade_test.go` — all IsRetryable, cooldown, cascade exhaustion tests pass
- [ ] `orchestrate_test.go` — rally all-complete, fail-fast, chain threading, chain abort all pass
- [ ] `integration_test.go` — test harness full pipeline (prompt written, env filtered) completes

---

## Self-Review

**Spec coverage check:**

| Spec Section                                           | Covered by                                      |
| ------------------------------------------------------ | ----------------------------------------------- |
| Harness resolution from provider prefix                | Task 3 `resolveHarness`                         |
| Pi CLI args (mode/model/prompt/tools/thinking/session) | Task 3 `BuildCommand`                           |
| Claude CLI args (print/model/prompt/tools/effort)      | Task 3 `BuildCommand`                           |
| Test harness (echo, full pipeline)                     | Task 3 + Task 7                                 |
| Thinking/effort level mapping                          | Task 3 `piThinking`/`claudeEffort`              |
| Session file for pi (deterministic path)               | Task 3 `q.SessionPath`                          |
| Env blocklist + ANTHROPIC_API_KEY special case         | Task 3 `shouldBlock`/`buildEnv`                 |
| Overlay vars (HOARD_GUARD_MODE, DEFNAME, NAME, PORT)   | Task 3 `buildEnv`                               |
| Temp file lifecycle (Cleanup)                          | Task 3 `CommandResult.Cleanup`                  |
| Retryable detection (429, 5xx) + cooldowns             | Task 4 `IsRetryable`                            |
| Cascade chains (kobold/griffin/dragon)                 | Task 4 `Cascader` using existing `ModelCascade` |
| Status stays "running" during cascade retry            | Task 5 — no setStatus call between retries      |
| Rally: concurrent dispatch + group_completed           | Task 6 `watchRally`                             |
| Rally fail-fast: cancel remaining on first failure     | Task 6 `watchRally` + test                      |
| Chain: sequential + {previous} substitution            | Task 6 `runChain`                               |
| Chain abort: remaining marked cancelled                | Task 6 `runChain`                               |
| Output resolution: stone → session log → stdout        | Task 6 `resolveOutput`                          |
| quest_completed event per quest                        | Task 6 `postQuestCompleted`                     |
| group_completed event per group                        | Task 6 `postGroupCompleted`                     |
| StoneMessage → internal/stone/types.go                 | Task 1                                          |
| BrokerSender narrowed to stone.Message + History       | Task 5                                          |
| Broker wired to quest manager in mcp.New()             | Task 8                                          |
| fail_fast in questDispatchInput                        | Task 8                                          |
| Real group ID returned from Dispatch                   | Task 5 + 8                                      |
| single mode validates exactly 1 quest                  | Task 5 `Dispatch`                               |

**Type consistency check:** `stone.Message` used everywhere after Task 1. `Dispatch` returns `([]QuestInfo, string, error)` — used correctly in Task 5 manager, Task 8 mcp handler, and Task 7 test updates. `NewManager(broker, daemonPort, logFn)` — updated in all call sites (Task 5 manager, Task 8 mcp.New, Task 7 test files).
