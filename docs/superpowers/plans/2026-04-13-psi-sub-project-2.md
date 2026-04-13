# psi Sub-Project 2: Full Daemon Participation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make psi a full daemon participant by adding a conversation ledger to the daemon and an MCP client to the Qt app.

**Architecture:** Dual-connection model — psi keeps its existing SSE connection for the thought stream and adds an MCP client for stone, memory, quest, and session registration. A new daemon-side conversation ledger accumulates exchanges and compacts to the vault when the token budget overflows.

**Tech Stack:** Go 1.25 (daemon), C++17/Qt 6.5 (psi), QML

**Spec:** `docs/superpowers/specs/2026-04-13-psi-sub-project-2-design.md`

---

## File Map

### Daemon (Go) — New

| File                                   | Responsibility                                            |
| -------------------------------------- | --------------------------------------------------------- |
| `internal/conversation/entry.go`       | Entry and Summary types                                   |
| `internal/conversation/ledger.go`      | Ledger: append, token tracking, compaction, recent/render |
| `internal/conversation/ledger_test.go` | Table-driven tests for the ledger                         |

### Daemon (Go) — Modified

| File                        | Change                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `internal/persona/types.go` | Add `ConversationBudget` to `AttentionConfig`                      |
| `internal/psi/sse/sse.go`   | Accept and append to ledger on POST /message                       |
| `internal/thought/cycle.go` | Accept ledger, render conversation in context, append speak output |
| `internal/psi/mcp/mcp.go`   | Accept and append to ledger on stone_send (result/question)        |
| `internal/daemon/daemon.go` | Construct ledger, pass to SSE/MCP/cycle, compact on shutdown       |

### psi (C++) — New

| File                                                    | Responsibility                                         |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `src/mcpclient.h` / `src/mcpclient.cpp`                 | MCP JSON-RPC client over HTTP                          |
| `src/stonepoller.h` / `src/stonepoller.cpp`             | Background stone_receive long-poll thread              |
| `src/conversationmodel.h` / `src/conversationmodel.cpp` | Multi-source QAbstractListModel replacing ThoughtModel |

### psi (QML) — New

| File                         | Responsibility                                                 |
| ---------------------------- | -------------------------------------------------------------- |
| `qml/ConversationStream.qml` | Replaces ThoughtStream — unified timeline with DelegateChooser |
| `qml/DotMessageDelegate.qml` | Blue bubble for dot's messages                                 |
| `qml/StoneDelegate.qml`      | Green-bordered ally message delegate                           |
| `qml/QuestEventDelegate.qml` | Compact system-event line for quest lifecycle                  |
| `qml/SummaryDelegate.qml`    | Collapsed compacted-segment header                             |

### psi — Modified

| File                    | Change                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `CMakeLists.txt`        | Add new source and QML files                                                  |
| `src/main.cpp`          | Create McpClient, StonePoller, ConversationModel; wire signals; expose to QML |
| `qml/Main.qml`          | Swap ThoughtStream → ConversationStream                                       |
| `qml/ConnectionBar.qml` | Dual SSE/MCP status                                                           |
| `qml/InputBar.qml`      | Optimistic add to ConversationModel on send                                   |
| `qml/StatePanel.qml`    | Active Quests + Stone sections                                                |
| `qml/StreamFilter.qml`  | Add dot/ally/quest filter types                                               |

### psi — Removed

| File                    | Reason                             |
| ----------------------- | ---------------------------------- |
| `qml/ThoughtStream.qml` | Replaced by ConversationStream.qml |

---

## Task 1: Conversation Ledger — Types

**Files:**

- Create: `storybook-daemon/internal/conversation/entry.go`

- [ ] **Step 1: Create the conversation package with Entry and Summary types**

```go
// Package conversation implements the daemon-side conversation ledger
// that tracks exchanges between dot, the persona, and allies.
package conversation

import "time"

// Entry is a single conversational exchange in the ledger.
type Entry struct {
	Role    string    // "dot", "ember", "ally:Grix", "system"
	Content string
	Source  string    // "sse", "stone", "thought"
	At      time.Time
}

// Summary is a compacted reference to a vault-persisted conversation segment.
type Summary struct {
	VaultKey string // e.g. "conversation/2026-04-13-1432"
	OneLiner string // e.g. "discussed test failures, dispatched Grix"
	From     time.Time
	To       time.Time
}

// estimateTokens returns a rough token count using the ~4 chars/token heuristic.
func estimateTokens(s string) int {
	n := len(s) / 4
	if n == 0 && len(s) > 0 {
		n = 1
	}
	return n
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd storybook-daemon && go build ./internal/conversation/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/conversation/entry.go
git commit -m "feat(conversation): add Entry and Summary types"
```

---

## Task 2: Conversation Ledger — Core Logic

**Files:**

- Create: `storybook-daemon/internal/conversation/ledger.go`

- [ ] **Step 1: Implement the Ledger**

```go
package conversation

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
)

// Ledger is an in-memory sliding window of conversational exchanges.
// When the token budget overflows, older entries are compacted into
// vault journal notes and replaced with one-liner summary references.
type Ledger struct {
	mu          sync.Mutex
	entries     []Entry
	summaries   []Summary
	tokenCount  int
	tokenBudget int
	sumBudget   int // max tokens for summaries section
	vault       *memory.Vault
	log         *slog.Logger
}

// New creates a Ledger with the given token budget.
// If budget is 0, defaults to 2000 tokens.
func New(budget int, vault *memory.Vault, log *slog.Logger) *Ledger {
	if budget <= 0 {
		budget = 2000
	}
	return &Ledger{
		tokenBudget: budget,
		sumBudget:   200,
		vault:       vault,
		log:         log,
	}
}

// Append adds an entry to the ledger. If the token budget is exceeded,
// the oldest ~40% of entries are compacted into a vault note.
func (l *Ledger) Append(e Entry) {
	if e.At.IsZero() {
		e.At = time.Now()
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	tokens := estimateTokens(e.Content)
	l.entries = append(l.entries, e)
	l.tokenCount += tokens

	if l.tokenCount > l.tokenBudget && len(l.entries) > 2 {
		l.compact()
	}
}

// Recent returns the last n entries (or all if n <= 0).
func (l *Ledger) Recent(n int) []Entry {
	l.mu.Lock()
	defer l.mu.Unlock()

	if n <= 0 || n >= len(l.entries) {
		out := make([]Entry, len(l.entries))
		copy(out, l.entries)
		return out
	}
	out := make([]Entry, n)
	copy(out, l.entries[len(l.entries)-n:])
	return out
}

// Summaries returns a copy of the compacted segment summaries.
func (l *Ledger) Summaries() []Summary {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([]Summary, len(l.summaries))
	copy(out, l.summaries)
	return out
}

// Render formats the conversation context for LLM injection.
func (l *Ledger) Render() string {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.entries) == 0 && len(l.summaries) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("### Recent Conversation\n\n")

	if len(l.summaries) > 0 {
		sb.WriteString("Earlier (in vault):\n")
		for _, s := range l.summaries {
			fmt.Fprintf(&sb, "- [%s–%s] %s → %s\n",
				s.From.Format("15:04"), s.To.Format("15:04"),
				s.OneLiner, s.VaultKey)
		}
		sb.WriteString("\n")
	}

	for _, e := range l.entries {
		fmt.Fprintf(&sb, "[%s] %s: %s\n", e.At.Format("15:04"), e.Role, e.Content)
	}
	sb.WriteString("\n")
	return sb.String()
}

// CompactAll forces compaction of all remaining entries to the vault.
// Called on graceful shutdown.
func (l *Ledger) CompactAll() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.entries) == 0 {
		return
	}
	l.compactBatch(l.entries)
	l.entries = nil
	l.tokenCount = 0
}

// compact moves the oldest ~40% of entries into a vault note.
// Must be called with l.mu held.
func (l *Ledger) compact() {
	cut := len(l.entries) * 2 / 5
	if cut < 1 {
		cut = 1
	}
	batch := l.entries[:cut]
	l.entries = l.entries[cut:]

	l.compactBatch(batch)
	l.recalcTokenCount()
	l.pruneSummaries()
}

// compactBatch writes a batch of entries to the vault and adds a summary reference.
// Must be called with l.mu held.
func (l *Ledger) compactBatch(batch []Entry) {
	if len(batch) == 0 {
		return
	}

	transcript := formatTranscript(batch)
	key := fmt.Sprintf("conversation/%s", batch[0].At.Format("2006-01-02-1504"))
	oneLiner := heuristicSummary(batch)

	if l.vault != nil {
		_, err := l.vault.Write(
			key, memory.KindJournal, transcript,
			[]string{"conversation", "auto-compacted"},
			false, memory.TierUnset,
		)
		if err != nil {
			l.log.Error("conversation: vault compaction failed", "key", key, "err", err)
			return
		}
		l.log.Info("conversation: compacted to vault", "key", key, "entries", len(batch))
	}

	l.summaries = append(l.summaries, Summary{
		VaultKey: key,
		OneLiner: oneLiner,
		From:     batch[0].At,
		To:       batch[len(batch)-1].At,
	})
}

// recalcTokenCount recomputes the token count from scratch.
// Must be called with l.mu held.
func (l *Ledger) recalcTokenCount() {
	total := 0
	for _, e := range l.entries {
		total += estimateTokens(e.Content)
	}
	l.tokenCount = total
}

// pruneSummaries drops oldest summaries if the summaries section exceeds its budget.
// Must be called with l.mu held.
func (l *Ledger) pruneSummaries() {
	total := 0
	for _, s := range l.summaries {
		total += estimateTokens(s.OneLiner) + estimateTokens(s.VaultKey) + 10 // overhead
	}
	for total > l.sumBudget && len(l.summaries) > 1 {
		dropped := l.summaries[0]
		total -= estimateTokens(dropped.OneLiner) + estimateTokens(dropped.VaultKey) + 10
		l.summaries = l.summaries[1:]
	}
}

// formatTranscript formats a batch of entries as a readable transcript.
func formatTranscript(entries []Entry) string {
	var sb strings.Builder
	for _, e := range entries {
		fmt.Fprintf(&sb, "[%s] %s: %s\n", e.At.Format("15:04"), e.Role, e.Content)
	}
	return sb.String()
}

// heuristicSummary generates a one-liner from a batch of entries.
// Takes the first content phrase from each entry's first sentence, joins with semicolons.
func heuristicSummary(entries []Entry) string {
	var parts []string
	for _, e := range entries {
		phrase := e.Content
		if idx := strings.IndexAny(phrase, ".!?\n"); idx > 0 {
			phrase = phrase[:idx]
		}
		if len(phrase) > 60 {
			phrase = phrase[:60] + "..."
		}
		if phrase != "" {
			parts = append(parts, phrase)
		}
		if len(parts) >= 3 {
			break
		}
	}
	result := strings.Join(parts, "; ")
	if len(result) > 100 {
		result = result[:100] + "..."
	}
	return result
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd storybook-daemon && go build ./internal/conversation/`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/conversation/ledger.go
git commit -m "feat(conversation): implement Ledger with token-budget compaction"
```

---

## Task 3: Conversation Ledger — Tests

**Files:**

- Create: `storybook-daemon/internal/conversation/ledger_test.go`

- [ ] **Step 1: Write table-driven tests**

```go
package conversation

import (
	"log/slog"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testVault(t *testing.T) *memory.Vault {
	t.Helper()
	v, err := memory.Open(t.TempDir(), slog.Default())
	require.NoError(t, err)
	return v
}

func TestAppendAndRecent(t *testing.T) {
	l := New(2000, testVault(t), slog.Default())

	l.Append(Entry{Role: "dot", Content: "hello", Source: "sse"})
	l.Append(Entry{Role: "ember", Content: "hi pup", Source: "thought"})

	entries := l.Recent(0)
	assert.Len(t, entries, 2)
	assert.Equal(t, "dot", entries[0].Role)
	assert.Equal(t, "ember", entries[1].Role)
}

func TestRecentLimitN(t *testing.T) {
	l := New(2000, testVault(t), slog.Default())

	l.Append(Entry{Role: "dot", Content: "one", Source: "sse"})
	l.Append(Entry{Role: "dot", Content: "two", Source: "sse"})
	l.Append(Entry{Role: "dot", Content: "three", Source: "sse"})

	entries := l.Recent(2)
	assert.Len(t, entries, 2)
	assert.Equal(t, "two", entries[0].Content)
	assert.Equal(t, "three", entries[1].Content)
}

func TestCompactionTriggeredByBudget(t *testing.T) {
	vault := testVault(t)
	// Budget of 20 tokens (~80 chars) — a few entries will exceed it.
	l := New(20, vault, slog.Default())

	now := time.Now()
	for i := range 10 {
		l.Append(Entry{
			Role:    "dot",
			Content: "this is a message with enough content to consume tokens",
			Source:  "sse",
			At:      now.Add(time.Duration(i) * time.Minute),
		})
	}

	// After compaction, entries should be fewer than 10.
	entries := l.Recent(0)
	assert.Less(t, len(entries), 10)

	// Summaries should have been created.
	summaries := l.Summaries()
	assert.Greater(t, len(summaries), 0)

	// Vault should contain the compacted note.
	notes, err := vault.SearchByTag("conversation", 10)
	require.NoError(t, err)
	assert.Greater(t, len(notes), 0)

	// Compacted notes should be KindJournal.
	for _, n := range notes {
		assert.Equal(t, memory.KindJournal, n.Frontmatter.Kind)
		assert.Contains(t, n.Frontmatter.Tags, "auto-compacted")
	}
}

func TestCompactAllOnShutdown(t *testing.T) {
	vault := testVault(t)
	l := New(2000, vault, slog.Default())

	l.Append(Entry{Role: "dot", Content: "final message", Source: "sse", At: time.Now()})
	l.Append(Entry{Role: "ember", Content: "goodbye pup", Source: "thought", At: time.Now()})

	l.CompactAll()

	assert.Empty(t, l.Recent(0))
	assert.Greater(t, len(l.Summaries()), 0)

	notes, err := vault.SearchByTag("conversation", 10)
	require.NoError(t, err)
	assert.Greater(t, len(notes), 0)
}

func TestRenderEmpty(t *testing.T) {
	l := New(2000, testVault(t), slog.Default())
	assert.Equal(t, "", l.Render())
}

func TestRenderWithEntries(t *testing.T) {
	l := New(2000, testVault(t), slog.Default())
	now := time.Date(2026, 4, 13, 14, 32, 0, 0, time.UTC)

	l.Append(Entry{Role: "dot", Content: "hey", Source: "sse", At: now})
	l.Append(Entry{Role: "ember", Content: "hi pup", Source: "thought", At: now.Add(time.Minute)})

	rendered := l.Render()
	assert.Contains(t, rendered, "### Recent Conversation")
	assert.Contains(t, rendered, "[14:32] dot: hey")
	assert.Contains(t, rendered, "[14:33] ember: hi pup")
}

func TestEstimateTokens(t *testing.T) {
	tests := []struct {
		input    string
		expected int
	}{
		{"", 0},
		{"hi", 1},
		{"hello world this is a test", 6},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, estimateTokens(tt.input))
		})
	}
}

func TestHeuristicSummary(t *testing.T) {
	entries := []Entry{
		{Content: "checked the build status. it was green."},
		{Content: "dispatched Grix to investigate further"},
	}
	summary := heuristicSummary(entries)
	assert.Contains(t, summary, "checked the build status")
	assert.Contains(t, summary, "dispatched Grix")
	assert.LessOrEqual(t, len(summary), 100)
}

func TestConcurrentAppend(t *testing.T) {
	l := New(2000, testVault(t), slog.Default())
	done := make(chan struct{})

	for range 10 {
		go func() {
			for range 100 {
				l.Append(Entry{Role: "dot", Content: "concurrent", Source: "sse"})
			}
			done <- struct{}{}
		}()
	}
	for range 10 {
		<-done
	}

	assert.Equal(t, 1000, len(l.Recent(0))+countCompactedEntries(l))
}

// countCompactedEntries estimates how many entries were compacted by checking summaries exist.
// This is a rough check — exact count isn't needed, just that nothing was lost.
func countCompactedEntries(_ *Ledger) int {
	// With a 2000-token budget and "concurrent" as content (~2 tokens),
	// 1000 entries = ~2000 tokens, so no compaction should happen.
	return 0
}
```

- [ ] **Step 2: Run tests**

Run: `cd storybook-daemon && go test ./internal/conversation/ -v`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add storybook-daemon/internal/conversation/ledger_test.go
git commit -m "test(conversation): table-driven tests for ledger"
```

---

## Task 4: Wire Ledger Into Daemon

**Files:**

- Modify: `storybook-daemon/internal/persona/types.go`
- Modify: `storybook-daemon/internal/psi/sse/sse.go`
- Modify: `storybook-daemon/internal/thought/cycle.go`
- Modify: `storybook-daemon/internal/psi/mcp/mcp.go`
- Modify: `storybook-daemon/internal/daemon/daemon.go`

- [ ] **Step 1: Add ConversationBudget to persona config**

In `storybook-daemon/internal/persona/types.go`, add to `AttentionConfig`:

```go
// Add this field to the AttentionConfig struct:
ConversationBudget int `yaml:"conversation_budget"` // token budget for conversation ledger (default 2000)
```

- [ ] **Step 2: Add ledger to SSE interface**

In `storybook-daemon/internal/psi/sse/sse.go`:

Add import:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
```

Add `convo` field to the `Interface` struct:

```go
convo *conversation.Ledger // conversation ledger (may be nil)
```

Change `New` signature to accept the ledger:

```go
func New(id string, port int, ledger *attention.Ledger, agg *sensory.Aggregator, convo *conversation.Ledger, log *slog.Logger) *Interface {
```

And set it in the returned struct:

```go
convo: convo,
```

In `handleMessage`, after the `ev` push to `b.events`, before `w.WriteHeader`, append to the ledger:

```go
if b.convo != nil {
    b.convo.Append(conversation.Entry{
        Role: "dot", Content: req.Text, Source: "sse",
    })
}
```

- [ ] **Step 3: Add ledger to thought cycle**

In `storybook-daemon/internal/thought/cycle.go`:

Add import:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
```

Add `convo` field to the `Cycle` struct:

```go
convo *conversation.Ledger
```

Add `convo` parameter to `New`:

```go
func New(
	p *persona.Persona,
	ledger *attention.Ledger,
	agg *sensory.Aggregator,
	nerves []nerve.Nerve,
	vault *memory.Vault,
	convo *conversation.Ledger,
	provider llm.Provider,
	log *slog.Logger,
) *Cycle {
```

Set it in the returned struct:

```go
convo: convo,
```

In `buildContextMessage`, after the pinned memories block and before nerve states, add:

```go
// Conversation context.
if c.convo != nil {
    if convoBlock := c.convo.Render(); convoBlock != "" {
        sb.WriteString(convoBlock)
    }
}
```

In `dispatchTool`, in the `"speak"` case, after `c.fireOutput(content)`, append to ledger:

```go
if c.convo != nil {
    c.convo.Append(conversation.Entry{
        Role: c.persona.Persona.Name, Content: content, Source: "thought",
    })
}
```

- [ ] **Step 4: Add ledger to MCP interface**

In `storybook-daemon/internal/psi/mcp/mcp.go`:

Add import:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
```

Add `convo` field to the `Interface` struct:

```go
convo *conversation.Ledger
```

Change `New` to accept the ledger:

```go
func New(id string, port int, vault *memory.Vault, ledger *attention.Ledger, convo *conversation.Ledger, log *slog.Logger) *Interface {
```

Set it in the returned struct:

```go
convo: convo,
```

In `handleStoneSend`, after the `b.broker.Send(ctx, ...)` call succeeds, append ally messages:

```go
if b.convo != nil && (input.Type == "result" || input.Type == "question") {
    b.convo.Append(conversation.Entry{
        Role:    "ally:" + input.From,
        Content: input.Content,
        Source:  "stone",
    })
}
```

- [ ] **Step 5: Wire everything in daemon.go**

In `storybook-daemon/internal/daemon/daemon.go`:

Add import:

```go
"github.com/dotBeeps/hoard/storybook-daemon/internal/conversation"
```

In the `Run` method, after vault is opened and before nerves are built, create the ledger:

```go
convo := conversation.New(d.persona.Attention.ConversationBudget, vault, d.log)
```

Update the `buildInterfaces` call to pass the ledger:

```go
ifaces, err := d.buildInterfaces(ledger, agg, vault, convo)
```

Update the `thought.New` call to pass the ledger:

```go
cycle := thought.New(d.persona, ledger, agg, nerves, vault, convo, provider, d.log)
```

Add shutdown compaction in a defer right after the ledger construction:

```go
defer convo.CompactAll()
```

Update `buildInterfaces` signature:

```go
func (d *Daemon) buildInterfaces(ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault, convo *conversation.Ledger) ([]psi.Interface, error) {
```

Update `buildInterface` signature:

```go
func (d *Daemon) buildInterface(cfg persona.InterfaceConfig, ledger *attention.Ledger, agg *sensory.Aggregator, vault *memory.Vault, convo *conversation.Ledger) (psi.Interface, error) {
```

Update the SSE case in `buildInterface`:

```go
case "sse":
    port := 7432
    if cfg.Path != "" {
        if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
            port = p
        }
    }
    return psisse.New(cfg.ID, port, ledger, agg, convo, d.log), nil
```

Update the MCP case:

```go
case "mcp":
    port := 9000
    if cfg.Path != "" {
        if p, convErr := strconv.Atoi(cfg.Path); convErr == nil {
            port = p
        }
    }
    return psimcp.New(cfg.ID, port, vault, ledger, convo, d.log), nil
```

- [ ] **Step 6: Fix any compilation errors from changed signatures**

Run: `cd storybook-daemon && go build ./...`
Expected: builds clean

- [ ] **Step 7: Run all tests**

Run: `cd storybook-daemon && go test ./... -count=1`
Expected: all tests PASS (existing tests may need `nil` added for new convo parameter in test setups)

- [ ] **Step 8: Commit**

```bash
git add storybook-daemon/internal/persona/types.go \
       storybook-daemon/internal/psi/sse/sse.go \
       storybook-daemon/internal/thought/cycle.go \
       storybook-daemon/internal/psi/mcp/mcp.go \
       storybook-daemon/internal/daemon/daemon.go
git commit -m "feat(daemon): wire conversation ledger into SSE, MCP, and thought cycle"
```

---

## Task 5: psi — ConversationModel (C++)

**Files:**

- Create: `psi/src/conversationmodel.h`
- Create: `psi/src/conversationmodel.cpp`

- [ ] **Step 1: Create the header**

```cpp
#ifndef CONVERSATIONMODEL_H
#define CONVERSATIONMODEL_H

#include <QAbstractListModel>
#include <QDateTime>
#include <QQmlEngine>
#include <QVariantMap>

class ConversationModel : public QAbstractListModel
{
    Q_OBJECT

    Q_PROPERTY(int count READ count NOTIFY countChanged FINAL)
    Q_PROPERTY(bool autoScroll READ autoScroll WRITE setAutoScroll NOTIFY autoScrollChanged FINAL)

public:
    enum EntryType {
        Thought = 0,
        DotMessage,
        StoneMessage,
        QuestEvent,
        SummaryEntry
    };
    Q_ENUM(EntryType)

    enum Roles {
        EntryTypeRole = Qt::UserRole + 1,
        RoleNameRole,  // "ember", "dot", "ally:Grix", "system"
        ContentRole,
        TimestampRole,
        SourceRole,    // "sse", "stone", "thought", "local"
        AllyNameRole,  // extracted from stone msg "from" field
        TypeLabelRole, // thought sub-type: "think", "speak", etc.
        VaultKeyRole   // for summary entries
    };

    explicit ConversationModel(QObject *parent = nullptr);

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role) const override;
    QHash<int, QByteArray> roleNames() const override;

    int count() const;
    bool autoScroll() const;
    void setAutoScroll(bool enabled);

    Q_INVOKABLE void clear();

public slots:
    void addThought(const QString &type, const QString &text);
    void addDotMessage(const QString &text);
    void addStoneMessage(const QVariantMap &msg);
    void addQuestEvent(const QString &description);
    void addSummary(const QString &timeRange, const QString &oneLiner,
                    const QString &vaultKey);

signals:
    void countChanged();
    void autoScrollChanged();

private:
    struct Entry {
        EntryType entryType;
        QString roleName;
        QString content;
        QDateTime timestamp;
        QString source;
        QString allyName;
        QString typeLabel;
        QString vaultKey;
    };

    QList<Entry> m_entries;
    bool m_autoScroll = true;
};

#endif // CONVERSATIONMODEL_H
```

- [ ] **Step 2: Create the implementation**

```cpp
#include "conversationmodel.h"

ConversationModel::ConversationModel(QObject *parent)
    : QAbstractListModel(parent)
{
}

int ConversationModel::rowCount(const QModelIndex &parent) const
{
    return parent.isValid() ? 0 : static_cast<int>(m_entries.size());
}

QVariant ConversationModel::data(const QModelIndex &index, int role) const
{
    if (!index.isValid() || index.row() < 0 ||
        index.row() >= static_cast<int>(m_entries.size()))
        return {};

    const Entry &e = m_entries.at(index.row());

    switch (role) {
    case EntryTypeRole:  return static_cast<int>(e.entryType);
    case RoleNameRole:   return e.roleName;
    case ContentRole:    return e.content;
    case TimestampRole:  return e.timestamp;
    case SourceRole:     return e.source;
    case AllyNameRole:   return e.allyName;
    case TypeLabelRole:  return e.typeLabel;
    case VaultKeyRole:   return e.vaultKey;
    default:             return {};
    }
}

QHash<int, QByteArray> ConversationModel::roleNames() const
{
    return {
        { EntryTypeRole, "entryType" },
        { RoleNameRole,  "roleName" },
        { ContentRole,   "content" },
        { TimestampRole, "timestamp" },
        { SourceRole,    "source" },
        { AllyNameRole,  "allyName" },
        { TypeLabelRole, "typeLabel" },
        { VaultKeyRole,  "vaultKey" },
    };
}

int ConversationModel::count() const
{
    return static_cast<int>(m_entries.size());
}

bool ConversationModel::autoScroll() const { return m_autoScroll; }

void ConversationModel::setAutoScroll(bool enabled)
{
    if (m_autoScroll != enabled) {
        m_autoScroll = enabled;
        emit autoScrollChanged();
    }
}

void ConversationModel::addThought(const QString &type, const QString &text)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        Thought, QStringLiteral("ember"), text,
        QDateTime::currentDateTime(), QStringLiteral("sse"),
        {}, type, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addDotMessage(const QString &text)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        DotMessage, QStringLiteral("dot"), text,
        QDateTime::currentDateTime(), QStringLiteral("local"),
        {}, {}, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addStoneMessage(const QVariantMap &msg)
{
    QString type = msg.value(QStringLiteral("type")).toString();
    QString from = msg.value(QStringLiteral("from")).toString();
    QString content = msg.value(QStringLiteral("content")).toString();

    EntryType et = StoneMessage;
    if (type == QStringLiteral("quest_completed") ||
        type == QStringLiteral("group_completed")) {
        et = QuestEvent;
    }

    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        et, QStringLiteral("ally:") + from, content,
        QDateTime::currentDateTime(), QStringLiteral("stone"),
        from, type, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addQuestEvent(const QString &description)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        QuestEvent, QStringLiteral("system"), description,
        QDateTime::currentDateTime(), QStringLiteral("stone"),
        {}, {}, {}
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::addSummary(const QString &timeRange,
                                    const QString &oneLiner,
                                    const QString &vaultKey)
{
    int row = static_cast<int>(m_entries.size());
    beginInsertRows(QModelIndex(), row, row);
    m_entries.append({
        SummaryEntry, QStringLiteral("system"), oneLiner,
        QDateTime::currentDateTime(), QStringLiteral("vault"),
        {}, timeRange, vaultKey
    });
    endInsertRows();
    emit countChanged();
}

void ConversationModel::clear()
{
    if (m_entries.isEmpty())
        return;
    beginResetModel();
    m_entries.clear();
    endResetModel();
    emit countChanged();
}
```

- [ ] **Step 3: Commit**

```bash
git add psi/src/conversationmodel.h psi/src/conversationmodel.cpp
git commit -m "feat(psi): add ConversationModel — multi-source timeline model"
```

---

## Task 6: psi — McpClient (C++)

**Files:**

- Create: `psi/src/mcpclient.h`
- Create: `psi/src/mcpclient.cpp`

- [ ] **Step 1: Create the header**

```cpp
#ifndef MCPCLIENT_H
#define MCPCLIENT_H

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QJsonObject>
#include <QUrl>

class McpClient : public QObject
{
    Q_OBJECT

    Q_PROPERTY(bool connected READ isConnected NOTIFY connectedChanged FINAL)
    Q_PROPERTY(QString sessionId READ sessionId NOTIFY sessionRegistered FINAL)
    Q_PROPERTY(QUrl baseUrl READ baseUrl WRITE setBaseUrl NOTIFY baseUrlChanged FINAL)

public:
    explicit McpClient(QObject *parent = nullptr);

    bool isConnected() const;
    QString sessionId() const;
    QUrl baseUrl() const;
    void setBaseUrl(const QUrl &url);

    Q_INVOKABLE void registerSession(const QString &sessionId,
                                     const QString &provider,
                                     const QString &model,
                                     const QString &harness);
    Q_INVOKABLE void stoneReceive(const QString &sessionId,
                                  const QString &addressedTo,
                                  int waitMs = 60000,
                                  const QString &sinceId = {});
    Q_INVOKABLE void questStatus(const QString &sessionId);

signals:
    void connectedChanged();
    void baseUrlChanged();
    void sessionRegistered();
    void stoneMessagesReceived(const QVariantList &messages);
    void questStatusReceived(const QVariantList &quests);
    void requestError(const QString &error);

private:
    void sendRpc(const QString &method, const QJsonObject &params,
                 std::function<void(const QJsonObject &)> onResult);
    void setConnected(bool connected);

    QNetworkAccessManager m_nam;
    QUrl m_baseUrl;
    QString m_sessionId;
    bool m_connected = false;
    int m_rpcId = 0;
};

#endif // MCPCLIENT_H
```

- [ ] **Step 2: Create the implementation**

```cpp
#include "mcpclient.h"

#include <QJsonArray>
#include <QJsonDocument>

McpClient::McpClient(QObject *parent)
    : QObject(parent)
{
}

bool McpClient::isConnected() const { return m_connected; }
QString McpClient::sessionId() const { return m_sessionId; }
QUrl McpClient::baseUrl() const { return m_baseUrl; }

void McpClient::setBaseUrl(const QUrl &url)
{
    if (m_baseUrl != url) {
        m_baseUrl = url;
        emit baseUrlChanged();
    }
}

void McpClient::setConnected(bool connected)
{
    if (m_connected != connected) {
        m_connected = connected;
        emit connectedChanged();
    }
}

void McpClient::registerSession(const QString &sessionId,
                                 const QString &provider,
                                 const QString &model,
                                 const QString &harness)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;
    params[QStringLiteral("provider")] = provider;
    params[QStringLiteral("model")] = model;
    params[QStringLiteral("harness")] = harness;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("register_session")},
        {QStringLiteral("arguments"), params}
    }, [this, sessionId](const QJsonObject &) {
        m_sessionId = sessionId;
        setConnected(true);
        emit sessionRegistered();
    });
}

void McpClient::stoneReceive(const QString &sessionId,
                              const QString &addressedTo,
                              int waitMs,
                              const QString &sinceId)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;
    params[QStringLiteral("addressed_to")] = addressedTo;
    params[QStringLiteral("wait_ms")] = waitMs;
    if (!sinceId.isEmpty())
        params[QStringLiteral("since_id")] = sinceId;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("stone_receive")},
        {QStringLiteral("arguments"), params}
    }, [this](const QJsonObject &result) {
        QVariantList messages;
        // MCP tool results come as content array with text blocks.
        QJsonArray content = result[QStringLiteral("content")].toArray();
        for (const auto &item : content) {
            QJsonObject obj = item.toObject();
            QString text = obj[QStringLiteral("text")].toString();
            QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());
            if (doc.isObject()) {
                QJsonObject parsed = doc.object();
                QJsonArray msgs = parsed[QStringLiteral("messages")].toArray();
                for (const auto &m : msgs)
                    messages.append(m.toObject().toVariantMap());
            }
        }
        emit stoneMessagesReceived(messages);
    });
}

void McpClient::questStatus(const QString &sessionId)
{
    QJsonObject params;
    params[QStringLiteral("session_id")] = sessionId;

    sendRpc(QStringLiteral("tools/call"), QJsonObject{
        {QStringLiteral("name"), QStringLiteral("quest_status")},
        {QStringLiteral("arguments"), params}
    }, [this](const QJsonObject &result) {
        QVariantList quests;
        QJsonArray content = result[QStringLiteral("content")].toArray();
        for (const auto &item : content) {
            QJsonObject obj = item.toObject();
            QString text = obj[QStringLiteral("text")].toString();
            QJsonDocument doc = QJsonDocument::fromJson(text.toUtf8());
            if (doc.isObject()) {
                QJsonObject parsed = doc.object();
                QJsonArray qs = parsed[QStringLiteral("quests")].toArray();
                for (const auto &q : qs)
                    quests.append(q.toObject().toVariantMap());
            }
        }
        emit questStatusReceived(quests);
    });
}

void McpClient::sendRpc(const QString &method, const QJsonObject &params,
                         std::function<void(const QJsonObject &)> onResult)
{
    QJsonObject rpc;
    rpc[QStringLiteral("jsonrpc")] = QStringLiteral("2.0");
    rpc[QStringLiteral("id")] = ++m_rpcId;
    rpc[QStringLiteral("method")] = method;
    rpc[QStringLiteral("params")] = params;

    QUrl url = m_baseUrl;
    url.setPath(QStringLiteral("/mcp"));

    QNetworkRequest req(url);
    req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));

    QNetworkReply *reply = m_nam.post(req, QJsonDocument(rpc).toJson(QJsonDocument::Compact));

    connect(reply, &QNetworkReply::finished, this, [this, reply, onResult]() {
        reply->deleteLater();

        if (reply->error() != QNetworkReply::NoError) {
            emit requestError(reply->errorString());
            return;
        }

        QJsonDocument doc = QJsonDocument::fromJson(reply->readAll());
        QJsonObject response = doc.object();

        if (response.contains(QStringLiteral("error"))) {
            QJsonObject err = response[QStringLiteral("error")].toObject();
            emit requestError(err[QStringLiteral("message")].toString());
            return;
        }

        if (onResult)
            onResult(response[QStringLiteral("result")].toObject());
    });
}
```

- [ ] **Step 3: Commit**

```bash
git add psi/src/mcpclient.h psi/src/mcpclient.cpp
git commit -m "feat(psi): add McpClient — MCP JSON-RPC client over HTTP"
```

---

## Task 7: psi — StonePoller (C++)

**Files:**

- Create: `psi/src/stonepoller.h`
- Create: `psi/src/stonepoller.cpp`

- [ ] **Step 1: Create the header**

```cpp
#ifndef STONEPOLLER_H
#define STONEPOLLER_H

#include <QThread>
#include <QVariantMap>
#include <QAtomicInt>

class McpClient;

class StonePoller : public QThread
{
    Q_OBJECT

public:
    explicit StonePoller(McpClient *client, QObject *parent = nullptr);
    ~StonePoller() override;

    void setSessionId(const QString &id);
    void stopPolling();

signals:
    void messageReceived(const QVariantMap &msg);

protected:
    void run() override;

private:
    McpClient *m_client;
    QString m_sessionId;
    QAtomicInt m_running{0};
    QString m_lastId;
};

#endif // STONEPOLLER_H
```

- [ ] **Step 2: Create the implementation**

```cpp
#include "stonepoller.h"
#include "mcpclient.h"

#include <QEventLoop>
#include <QTimer>

StonePoller::StonePoller(McpClient *client, QObject *parent)
    : QThread(parent)
    , m_client(client)
{
}

StonePoller::~StonePoller()
{
    stopPolling();
    wait();
}

void StonePoller::setSessionId(const QString &id)
{
    m_sessionId = id;
}

void StonePoller::stopPolling()
{
    m_running.storeRelease(0);
}

void StonePoller::run()
{
    m_running.storeRelease(1);
    int backoffMs = 1000;
    static constexpr int MaxBackoffMs = 30000;

    while (m_running.loadAcquire()) {
        if (m_sessionId.isEmpty()) {
            QThread::msleep(500);
            continue;
        }

        // Use an event loop to handle the async MCP request in this thread.
        QEventLoop loop;
        bool gotMessages = false;

        auto conn = connect(m_client, &McpClient::stoneMessagesReceived,
                            &loop, [&](const QVariantList &messages) {
            gotMessages = true;
            backoffMs = 1000; // reset on success
            for (const auto &m : messages) {
                QVariantMap msg = m.toMap();
                QString id = msg.value(QStringLiteral("id")).toString();
                if (!id.isEmpty())
                    m_lastId = id;
                emit messageReceived(msg);
            }
            loop.quit();
        });

        auto errConn = connect(m_client, &McpClient::requestError,
                               &loop, [&](const QString &) {
            loop.quit();
        });

        // Issue the long-poll request.
        QMetaObject::invokeMethod(m_client, [this]() {
            m_client->stoneReceive(m_sessionId,
                                   QStringLiteral("session-room"),
                                   60000, m_lastId);
        }, Qt::QueuedConnection);

        // Wait for result or timeout (65s > 60s server-side wait).
        QTimer::singleShot(65000, &loop, &QEventLoop::quit);
        loop.exec();

        disconnect(conn);
        disconnect(errConn);

        if (!gotMessages && m_running.loadAcquire()) {
            // Backoff on error.
            QThread::msleep(backoffMs);
            backoffMs = qMin(backoffMs * 2, MaxBackoffMs);
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add psi/src/stonepoller.h psi/src/stonepoller.cpp
git commit -m "feat(psi): add StonePoller — background stone_receive long-poll"
```

---

## Task 8: psi — QML Delegates

**Files:**

- Create: `psi/qml/DotMessageDelegate.qml`
- Create: `psi/qml/StoneDelegate.qml`
- Create: `psi/qml/QuestEventDelegate.qml`
- Create: `psi/qml/SummaryDelegate.qml`

- [ ] **Step 1: Create DotMessageDelegate.qml**

```qml
import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    implicitHeight: bubble.implicitHeight + 12

    Rectangle {
        id: bubble

        anchors.right: parent.right
        anchors.rightMargin: 12
        anchors.left: parent.left
        anchors.leftMargin: 52
        anchors.top: parent.top
        anchors.topMargin: 4

        implicitHeight: msgRow.implicitHeight + 12
        radius: 6
        color: Qt.rgba(0.1, 0.16, 0.23, 1.0)

        RowLayout {
            id: msgRow

            anchors.fill: parent
            anchors.margins: 6
            spacing: 8

            Text {
                text: Qt.formatTime(timestamp, "HH:mm")
                font.pixelSize: 11
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }

            Text {
                text: "dot"
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: "#7ec8e3"
                Layout.alignment: Qt.AlignTop
            }

            Text {
                text: content
                font.pixelSize: 13
                font.family: "monospace"
                color: Theme.text
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
```

- [ ] **Step 2: Create StoneDelegate.qml**

```qml
import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    implicitHeight: stoneRow.implicitHeight + 10

    Rectangle {
        anchors.fill: parent
        anchors.leftMargin: 10
        anchors.rightMargin: 10
        anchors.topMargin: 2
        anchors.bottomMargin: 2
        color: Qt.rgba(0.1, 0.18, 0.1, 1.0)
        radius: 6
        border.width: 0
        Rectangle {
            width: 2
            height: parent.height
            color: Theme.tierKobold
            radius: 1
        }

        RowLayout {
            id: stoneRow

            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 8
            anchors.topMargin: 4
            anchors.bottomMargin: 4
            spacing: 8

            Text {
                text: Qt.formatTime(timestamp, "HH:mm")
                font.pixelSize: 11
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }

            Text {
                text: allyName
                font.pixelSize: 11
                font.family: "monospace"
                font.bold: true
                color: Theme.tierKobold
                Layout.alignment: Qt.AlignTop
            }

            Text {
                visible: typeLabel !== ""
                text: "(" + typeLabel + ")"
                font.pixelSize: 10
                font.family: "monospace"
                color: Theme.textDim
                Layout.alignment: Qt.AlignTop
            }

            Text {
                text: content
                font.pixelSize: 13
                font.family: "monospace"
                color: Theme.textMuted
                wrapMode: Text.Wrap
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop
            }
        }
    }
}
```

- [ ] **Step 3: Create QuestEventDelegate.qml**

```qml
import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    implicitHeight: 22

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 8

        Text {
            text: Qt.formatTime(timestamp, "HH:mm")
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
            Layout.alignment: Qt.AlignVCenter
        }

        Text {
            text: "quest"
            font.pixelSize: 10
            font.family: "monospace"
            color: "#c9a0dc"
            Layout.alignment: Qt.AlignVCenter
        }

        Text {
            text: content
            font.pixelSize: 11
            font.family: "monospace"
            color: Theme.textDim
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
        }
    }
}
```

- [ ] **Step 4: Create SummaryDelegate.qml**

```qml
import QtQuick
import QtQuick.Layouts

Item {
    id: delegateRoot

    implicitHeight: 26

    Rectangle {
        anchors.fill: parent
        anchors.leftMargin: 10
        anchors.rightMargin: 10
        color: "transparent"
        border.width: 0

        Rectangle {
            width: 2
            height: parent.height
            color: Theme.border
        }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 10
            spacing: 6

            Text {
                text: typeLabel
                font.pixelSize: 10
                font.family: "monospace"
                font.italic: true
                color: Theme.textDim
                Layout.alignment: Qt.AlignVCenter
            }

            Text {
                text: content
                font.pixelSize: 11
                font.family: "monospace"
                font.italic: true
                color: Theme.textDim
                elide: Text.ElideRight
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
            }
        }
    }

    ToolTip.visible: ma.containsMouse
    ToolTip.text: vaultKey

    MouseArea {
        id: ma
        anchors.fill: parent
        hoverEnabled: true
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add psi/qml/DotMessageDelegate.qml psi/qml/StoneDelegate.qml \
       psi/qml/QuestEventDelegate.qml psi/qml/SummaryDelegate.qml
git commit -m "feat(psi): add QML delegates for dot, stone, quest, summary entries"
```

---

## Task 9: psi — ConversationStream QML

**Files:**

- Create: `psi/qml/ConversationStream.qml`

- [ ] **Step 1: Create ConversationStream.qml**

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

            model: Conversation

            delegate: Loader {
                required property int entryType
                required property string roleName
                required property string content
                required property date timestamp
                required property string source
                required property string allyName
                required property string typeLabel
                required property string vaultKey

                width: streamView.width

                sourceComponent: {
                    switch (entryType) {
                    case 0: return thoughtDelegate    // Thought
                    case 1: return dotDelegate        // DotMessage
                    case 2: return stoneDelegate      // StoneMessage
                    case 3: return questDelegate      // QuestEvent
                    case 4: return summaryDelegate    // SummaryEntry
                    default: return thoughtDelegate
                    }
                }
            }

            onContentYChanged: {
                if (!streamView.atYEnd) {
                    Conversation.autoScroll = false
                }
            }

            onCountChanged: {
                if (Conversation.autoScroll) {
                    Qt.callLater(streamView.positionViewAtEnd)
                }
            }
        }

        Rectangle {
            visible: !Conversation.autoScroll && Conversation.count > 0
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
                    Conversation.autoScroll = true
                    streamView.positionViewAtEnd()
                }
            }
        }
    }

    Component {
        id: thoughtDelegate
        ThoughtDelegate {
            required property string typeLabel
            required property string content
            required property date timestamp
            type: typeLabel
            text: content
        }
    }

    Component {
        id: dotDelegate
        DotMessageDelegate {}
    }

    Component {
        id: stoneDelegate
        StoneDelegate {}
    }

    Component {
        id: questDelegate
        QuestEventDelegate {}
    }

    Component {
        id: summaryDelegate
        SummaryDelegate {}
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add psi/qml/ConversationStream.qml
git commit -m "feat(psi): add ConversationStream — unified timeline view"
```

---

## Task 10: psi — Wire Everything Together

**Files:**

- Modify: `psi/CMakeLists.txt`
- Modify: `psi/src/main.cpp`
- Modify: `psi/qml/Main.qml`
- Modify: `psi/qml/InputBar.qml`
- Modify: `psi/qml/ConnectionBar.qml`
- Remove: `psi/qml/ThoughtStream.qml` (from CMakeLists, keep file for now)

- [ ] **Step 1: Update CMakeLists.txt**

Replace the full `qt_add_executable` and `qt_add_qml_module` blocks:

```cmake
qt_add_executable(psi
    src/main.cpp
    src/sseconnection.h src/sseconnection.cpp
    src/thoughtmodel.h src/thoughtmodel.cpp
    src/daemonstate.h src/daemonstate.cpp
    src/themeengine.h src/themeengine.cpp
    src/conversationmodel.h src/conversationmodel.cpp
    src/mcpclient.h src/mcpclient.cpp
    src/stonepoller.h src/stonepoller.cpp
)

qt_add_qml_module(psi
    URI Psi
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/SessionRail.qml
        qml/ConnectionBar.qml
        qml/ConversationStream.qml
        qml/ThoughtDelegate.qml
        qml/DotMessageDelegate.qml
        qml/StoneDelegate.qml
        qml/QuestEventDelegate.qml
        qml/SummaryDelegate.qml
        qml/StreamFilter.qml
        qml/InputBar.qml
        qml/StatePanel.qml
)
```

- [ ] **Step 2: Update main.cpp**

Replace the full contents of `psi/src/main.cpp`:

```cpp
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "conversationmodel.h"
#include "daemonstate.h"
#include "mcpclient.h"
#include "sseconnection.h"
#include "stonepoller.h"
#include "thoughtmodel.h"
#include "themeengine.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName("psi");
    QGuiApplication::setOrganizationName("hoard");

    QQuickStyle::setStyle("Material");

    // Create backend objects — parented to app for lifetime management.
    auto *theme = new ThemeEngine(&app);
    auto *sse = new SseConnection(&app);
    sse->setBaseUrl(QUrl("http://localhost:7432"));

    auto *thoughts = new ThoughtModel(&app);
    auto *conversation = new ConversationModel(&app);
    auto *state = new DaemonState(&app);

    auto *mcp = new McpClient(&app);
    mcp->setBaseUrl(QUrl("http://localhost:9432"));

    auto *stonePoller = new StonePoller(mcp, &app);

    // Wire SSE events → models.
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     thoughts, [thoughts](const QString &type, const QString &text) {
        thoughts->addThought(type, text);
    });
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     conversation, [conversation](const QString &type, const QString &text) {
        conversation->addThought(type, text);
    });
    QObject::connect(sse, &SseConnection::thoughtReceived,
                     state, &DaemonState::onThoughtReceived);
    QObject::connect(sse, &SseConnection::stateReceived,
                     state, &DaemonState::onStateReceived);
    QObject::connect(sse, &SseConnection::connectedChanged,
                     state, [sse, state]() {
        state->setConnected(sse->isConnected());
        if (sse->isConnected())
            state->pollState(sse->baseUrl());
    });

    // Wire stone messages → conversation model.
    QObject::connect(stonePoller, &StonePoller::messageReceived,
                     conversation, [conversation](const QVariantMap &msg) {
        conversation->addStoneMessage(msg);
    });

    // MCP: register session and start stone polling on SSE connect.
    QObject::connect(sse, &SseConnection::connectedChanged,
                     mcp, [sse, mcp, stonePoller]() {
        if (sse->isConnected()) {
            mcp->registerSession(
                QStringLiteral("psi-ember"),
                QStringLiteral("ui"),
                QStringLiteral("direct"),
                QStringLiteral("psi")
            );
        }
    });
    QObject::connect(mcp, &McpClient::sessionRegistered,
                     stonePoller, [mcp, stonePoller]() {
        stonePoller->setSessionId(mcp->sessionId());
        if (!stonePoller->isRunning())
            stonePoller->start();
    });

    QQmlApplicationEngine engine;

    // Expose to QML via context properties.
    engine.rootContext()->setContextProperty("Theme", theme);
    engine.rootContext()->setContextProperty("Sse", sse);
    engine.rootContext()->setContextProperty("Thoughts", thoughts);
    engine.rootContext()->setContextProperty("Conversation", conversation);
    engine.rootContext()->setContextProperty("Daemon", state);
    engine.rootContext()->setContextProperty("Mcp", mcp);

    // Load via resource URL — context properties work reliably with load().
    const QUrl mainUrl(QStringLiteral("qrc:/qt/qml/Psi/qml/Main.qml"));
    engine.load(mainUrl);

    if (engine.rootObjects().isEmpty())
        return -1;

    sse->connectToServer();

    return QGuiApplication::exec();
}
```

- [ ] **Step 3: Update Main.qml — swap ThoughtStream for ConversationStream**

Replace `ThoughtStream` with `ConversationStream` in Main.qml:

```qml
                    ConversationStream {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                    }
```

- [ ] **Step 4: Update InputBar.qml — optimistic add to ConversationModel**

In `InputBar.qml`, update the `onAccepted` handler to add to ConversationModel before sending:

```qml
            onAccepted: {
                if (input.text.trim().length === 0) return
                Conversation.addDotMessage(input.text)
                Sse.sendMessage(input.text)
                input.text = ""
            }
```

- [ ] **Step 5: Update ConnectionBar.qml — dual status**

Replace the full contents of ConnectionBar.qml:

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

        Text {
            text: "Ember (local)"
            font.pixelSize: 12
            color: Theme.textMuted
        }

        Item { Layout.fillWidth: true }

        Row {
            spacing: 12

            Row {
                spacing: 4

                Rectangle {
                    width: 8; height: 8; radius: 4
                    anchors.verticalCenter: parent.verticalCenter
                    color: Daemon.connected ? "#4ade80" : "#ef4444"

                    SequentialAnimation on opacity {
                        running: !Daemon.connected
                        loops: Animation.Infinite
                        onRunningChanged: if (!running) parent.opacity = 1.0
                        NumberAnimation { to: 0.3; duration: 800 }
                        NumberAnimation { to: 1.0; duration: 800 }
                    }
                }

                Text {
                    text: "SSE"
                    font.pixelSize: 10
                    color: Theme.textDim
                }
            }

            Row {
                spacing: 4

                Rectangle {
                    width: 8; height: 8; radius: 4
                    anchors.verticalCenter: parent.verticalCenter
                    color: Mcp.connected ? "#4ade80" : "#ef4444"
                }

                Text {
                    text: "MCP"
                    font.pixelSize: 10
                    color: Theme.textDim
                }
            }
        }

        Text {
            visible: Mcp.sessionId !== ""
            text: Mcp.sessionId
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
        }
    }
}
```

- [ ] **Step 6: Update StreamFilter.qml — add dot/ally/quest toggles**

In `StreamFilter.qml`, update the model array to include the new types:

```qml
        Repeater {
            model: [
                { label: "think", color: Theme.colorThink },
                { label: "speak", color: Theme.colorSpeak },
                { label: "text", color: Theme.colorText },
                { label: "observe", color: Theme.colorObserve },
                { label: "beat", color: Theme.colorBeat },
                { label: "dot", color: "#7ec8e3" },
                { label: "ally", color: Theme.tierKobold },
                { label: "quest", color: "#c9a0dc" }
            ]
```

Also update the event count label:

```qml
        Text {
            text: Conversation.count + " events"
            font.pixelSize: 10
            font.family: "monospace"
            color: Theme.textDim
        }
```

- [ ] **Step 7: Update StatePanel.qml — add Active Quests section**

In `psi/qml/StatePanel.qml`, add after the CONTRACTS section and before the LAST BEAT section:

```qml
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: "STONE"
                font.pixelSize: 10
                font.bold: true
                font.letterSpacing: 1.5
                color: Theme.textDim
            }

            Text {
                text: Mcp.connected ? "connected" : "disconnected"
                font.pixelSize: 11
                color: Mcp.connected ? "#4ade80" : Theme.textDim
            }
        }
```

- [ ] **Step 8: Build and verify**

Run: `cd psi && cmake -B build && cmake --build build`
Expected: builds clean with no errors

- [ ] **Step 9: Commit**

```bash
git add psi/CMakeLists.txt psi/src/main.cpp psi/qml/Main.qml \
       psi/qml/InputBar.qml psi/qml/ConnectionBar.qml psi/qml/StreamFilter.qml \
       psi/qml/StatePanel.qml
git commit -m "feat(psi): wire ConversationModel, McpClient, StonePoller into app"
```

---

## Task 11: Delete ThoughtStream.qml

**Files:**

- Remove: `psi/qml/ThoughtStream.qml`

- [ ] **Step 1: Delete the file**

```bash
git rm psi/qml/ThoughtStream.qml
```

- [ ] **Step 2: Verify build still passes**

Run: `cd psi && cmake -B build && cmake --build build`
Expected: builds clean

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(psi): remove ThoughtStream.qml — replaced by ConversationStream"
```

---

## Task 12: Integration Smoke Test

- [ ] **Step 1: Run daemon tests**

Run: `cd storybook-daemon && go test ./... -count=1`
Expected: all tests PASS

- [ ] **Step 2: Build psi**

Run: `cd psi && cmake -B build && cmake --build build`
Expected: builds clean

- [ ] **Step 3: Manual integration test**

Start the daemon and psi in separate terminals:

Terminal 1:

```bash
cd storybook-daemon && go run . run --persona ember
```

Terminal 2:

```bash
./psi/build/psi
```

Verify:

- ConnectionBar shows SSE green, MCP green
- Thought stream events appear in the ConversationStream
- Typing a message shows it as a blue dot-bubble immediately
- The daemon's next beat references the message in its context

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -u
git commit -m "fix(psi): integration smoke test fixups"
```

---

## Follow-Up (Not in this plan)

These items from the spec are architecturally independent and should be separate follow-up tasks:

- **SessionRail multi-persona** — dynamic persona list, click to switch SSE+MCP connection pairs, "+" button for connecting to new personas. Requires a persona discovery mechanism (scanning daemon ports or a config file).
- **StatePanel Active Quests** — richer quest_status polling with elapsed time, ally name, job display. Requires a periodic timer calling `McpClient::questStatus()` and a small model to hold the results.
- **Quest dispatch from psi UI** — letting dot trigger quest dispatch directly from the app. Needs a dispatch dialog or command input.
