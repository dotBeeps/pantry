// Package mcp implements an MCP (Model Context Protocol) server psi interface
// that exposes the daemon's memory vault, attention state, and session
// registration to external AI coding tools via streamable HTTP.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	gomcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/quest"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/stone"
)

// session holds the metadata from a register_session call.
type session struct {
	SessionID string `json:"session_id"`
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	Harness   string `json:"harness"`
}

// Interface is the MCP server psi interface. It exposes the daemon's memory
// vault and attention state to external AI coding tools via the Model Context
// Protocol.
type Interface struct {
	id       string
	port     int
	vault    *memory.Vault
	ledger   *attention.Ledger
	broker   *Broker
	questMgr *quest.Manager
	log      *slog.Logger

	mu       sync.Mutex
	sessions map[string]session

	server *http.Server
	cancel context.CancelFunc
}

// New creates an MCP Interface that serves on the given port.
// questMgr may be nil; a default Manager will be created internally.
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

// ID returns the configured interface identifier.
func (b *Interface) ID() string { return b.id }

// Type returns the static discriminator string for this interface kind.
func (b *Interface) Type() string { return "mcp" }

// Events returns nil — the MCP interface does not emit inbound sensory events.
func (b *Interface) Events() <-chan sensory.Event { return nil }

// Start launches the MCP streamable HTTP server. It returns as soon as the
// server goroutine is running; ctx cancellation triggers graceful shutdown.
func (b *Interface) Start(ctx context.Context) error {
	mcpServer := b.buildServer()

	handler := gomcp.NewStreamableHTTPHandler(func(_ *http.Request) *gomcp.Server {
		return mcpServer
	}, nil)

	mux := http.NewServeMux()
	mux.Handle("/mcp", handler)

	b.server = &http.Server{
		Addr:              fmt.Sprintf(":%d", b.port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	serverCtx, cancel := context.WithCancel(ctx)
	b.cancel = cancel

	go func() {
		b.log.Info("mcp: listening", "port", b.port)
		if err := b.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			b.log.Error("mcp: server error", "err", err)
		}
	}()

	go func() { //nolint:gosec // independent goroutine manages graceful shutdown, not request-scoped
		<-serverCtx.Done()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutCancel()
		if err := b.server.Shutdown(shutCtx); err != nil { //nolint:contextcheck // Stop() has no ctx param; shutdown needs its own budget
			b.log.Error("mcp: shutdown error", "err", err)
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

// buildServer constructs and configures the MCP server with all tool handlers.
func (b *Interface) buildServer() *gomcp.Server {
	server := gomcp.NewServer(
		&gomcp.Implementation{
			Name:    "storybook-daemon",
			Version: "v0.1.0",
		},
		nil,
	)

	b.registerTools(server)

	return server
}

// ── Tool input/output types ─────────────────────────────────

type registerSessionInput struct {
	SessionID string `json:"session_id" jsonschema:"unique session identifier"`
	Provider  string `json:"provider" jsonschema:"AI provider name (e.g. anthropic)"`
	Model     string `json:"model" jsonschema:"model identifier (e.g. claude-sonnet-4-6)"`
	Harness   string `json:"harness" jsonschema:"client harness name (e.g. claude-code)"`
}

type registerSessionOutput struct {
	Status    string `json:"status"`
	SessionID string `json:"session_id"`
}

type memorySearchInput struct {
	Query string `json:"query" jsonschema:"search query for the memory vault"`
	Limit int    `json:"limit,omitempty" jsonschema:"maximum results to return (default 10)"`
}

type memoryReadInput struct {
	Title string `json:"title" jsonschema:"note title/key to read"`
}

type memoryWriteInput struct {
	Title   string   `json:"title" jsonschema:"note title/key"`
	Kind    string   `json:"kind" jsonschema:"note kind: observation, insight, decision, wondering, or fragment"`
	Content string   `json:"content" jsonschema:"note content body"`
	Tags    []string `json:"tags,omitempty" jsonschema:"optional tags for the note"`
}

type memoryWriteOutput struct {
	Status string `json:"status"`
	Key    string `json:"key"`
}

type attentionStateOutput struct {
	Pool   int    `json:"pool"`
	Status string `json:"status"`
}

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
	Messages []stone.Message `json:"messages"`
}

type questDispatchInput struct {
	SessionID string               `json:"session_id" jsonschema:"session that owns these quests"`
	Mode      string               `json:"mode" jsonschema:"dispatch mode: single, rally, or chain"`
	Quests    []quest.QuestRequest `json:"quests" jsonschema:"quests to dispatch"`
	FailFast  bool                 `json:"fail_fast,omitempty" jsonschema:"cancel remaining rally quests on first failure"`
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

type stubOutput struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// ── Tool registration ───────────────────────────────────────

func (b *Interface) registerTools(server *gomcp.Server) {
	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "register_session",
		Description: "Register an AI coding session with the daemon. Call this at startup so the daemon knows who is connected.",
	}, b.handleRegisterSession)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "memory_search",
		Description: "Search the persona's memory vault for notes matching a query.",
	}, b.handleMemorySearch)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "memory_read",
		Description: "Read a specific note from the memory vault by title.",
	}, b.handleMemoryRead)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "memory_write",
		Description: "Write a new note to the persona's memory vault.",
	}, b.handleMemoryWrite)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "attention_state",
		Description: "Returns the current attention pool level and status.",
	}, b.handleAttentionState)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "stone_send",
		Description: "Send a message via the sending stone. Messages are routed to the specified recipient within the session.",
	}, b.handleStoneSend)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "stone_receive",
		Description: "Receive messages from the sending stone. Long-polls up to wait_ms for new messages addressed to the specified recipient.",
	}, b.handleStoneReceive)

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
}

// ── Tool handlers ───────────────────────────────────────────

func (b *Interface) handleRegisterSession(_ context.Context, _ *gomcp.CallToolRequest, input registerSessionInput) (*gomcp.CallToolResult, registerSessionOutput, error) {
	s := session{
		SessionID: input.SessionID,
		Provider:  input.Provider,
		Model:     input.Model,
		Harness:   input.Harness,
	}

	b.mu.Lock()
	b.sessions[input.SessionID] = s
	b.mu.Unlock()

	b.broker.RegisterSession(input.SessionID)

	b.log.Info("mcp: session registered",
		"session_id", input.SessionID,
		"provider", input.Provider,
		"model", input.Model,
		"harness", input.Harness,
	)

	return nil, registerSessionOutput{
		Status:    "registered",
		SessionID: input.SessionID,
	}, nil
}

func (b *Interface) handleMemorySearch(_ context.Context, _ *gomcp.CallToolRequest, input memorySearchInput) (*gomcp.CallToolResult, any, error) {
	limit := input.Limit
	if limit <= 0 {
		limit = 10
	}

	notes, err := b.vault.Search(input.Query, limit)
	if err != nil {
		return nil, nil, fmt.Errorf("searching vault: %w", err)
	}

	type noteResult struct {
		Key     string   `json:"key"`
		Kind    string   `json:"kind"`
		Tags    []string `json:"tags"`
		Summary string   `json:"summary"`
		Updated string   `json:"updated"`
	}

	results := make([]noteResult, 0, len(notes))
	for _, n := range notes {
		results = append(results, noteResult{
			Key:     n.Frontmatter.Key,
			Kind:    string(n.Frontmatter.Kind),
			Tags:    n.Frontmatter.Tags,
			Summary: n.Summary(),
			Updated: n.Frontmatter.Updated,
		})
	}

	data, err := json.Marshal(results)
	if err != nil {
		return nil, nil, fmt.Errorf("marshaling search results: %w", err)
	}

	return &gomcp.CallToolResult{
		Content: []gomcp.Content{
			&gomcp.TextContent{Text: string(data)},
		},
	}, nil, nil
}

func (b *Interface) handleMemoryRead(_ context.Context, _ *gomcp.CallToolRequest, input memoryReadInput) (*gomcp.CallToolResult, any, error) {
	note, err := b.vault.Get(input.Title)
	if err != nil {
		return nil, nil, fmt.Errorf("reading note %q: %w", input.Title, err)
	}

	type noteDetail struct {
		Key     string   `json:"key"`
		Kind    string   `json:"kind"`
		Tags    []string `json:"tags"`
		Pinned  bool     `json:"pinned"`
		Created string   `json:"created"`
		Updated string   `json:"updated"`
		Content string   `json:"content"`
	}

	detail := noteDetail{
		Key:     note.Frontmatter.Key,
		Kind:    string(note.Frontmatter.Kind),
		Tags:    note.Frontmatter.Tags,
		Pinned:  note.Frontmatter.Pinned,
		Created: note.Frontmatter.Created,
		Updated: note.Frontmatter.Updated,
		Content: note.Content,
	}

	data, err := json.Marshal(detail)
	if err != nil {
		return nil, nil, fmt.Errorf("marshaling note detail: %w", err)
	}

	return &gomcp.CallToolResult{
		Content: []gomcp.Content{
			&gomcp.TextContent{Text: string(data)},
		},
	}, nil, nil
}

func (b *Interface) handleMemoryWrite(_ context.Context, _ *gomcp.CallToolRequest, input memoryWriteInput) (*gomcp.CallToolResult, memoryWriteOutput, error) {
	kind := memory.Kind(input.Kind)

	// Validate kind.
	switch kind {
	case memory.KindObservation, memory.KindInsight, memory.KindDecision,
		memory.KindWondering, memory.KindFragment:
		// valid
	default:
		return nil, memoryWriteOutput{}, fmt.Errorf("invalid note kind %q: must be observation, insight, decision, wondering, or fragment", input.Kind)
	}

	note, err := b.vault.Write(input.Title, kind, input.Content, input.Tags, false, memory.TierUnset)
	if err != nil {
		return nil, memoryWriteOutput{}, fmt.Errorf("writing note %q: %w", input.Title, err)
	}

	return nil, memoryWriteOutput{
		Status: "written",
		Key:    note.Frontmatter.Key,
	}, nil
}

func (b *Interface) handleAttentionState(_ context.Context, _ *gomcp.CallToolRequest, _ struct{}) (*gomcp.CallToolResult, attentionStateOutput, error) {
	return nil, attentionStateOutput{
		Pool:   b.ledger.Pool(),
		Status: b.ledger.Status(),
	}, nil
}

func (b *Interface) handleStoneSend(ctx context.Context, _ *gomcp.CallToolRequest, input stoneSendInput) (*gomcp.CallToolResult, stoneSendOutput, error) {
	b.mu.Lock()
	_, ok := b.sessions[input.SessionID]
	b.mu.Unlock()
	if !ok {
		return nil, stoneSendOutput{}, fmt.Errorf("unknown session: %s", input.SessionID)
	}

	// Pre-stamp ID and Timestamp so we can echo them back; broker will no-op
	// its own stamping when it sees non-zero values.
	now := time.Now().UnixMilli()
	id := "stone-" + strconv.FormatInt(now, 10)

	msg := stone.Message{
		ID:         id,
		From:       input.From,
		Addressing: input.To,
		Type:       input.Type,
		Content:    input.Content,
		Metadata:   input.Metadata,
		Timestamp:  now,
	}
	if err := b.broker.Send(ctx, input.SessionID, msg); err != nil {
		return nil, stoneSendOutput{}, err
	}

	return nil, stoneSendOutput{
		Status:    "sent",
		ID:        id,
		Timestamp: now,
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

	if groupID == "" && len(infos) > 0 {
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

type stubInput struct {
	// empty — stubs accept no meaningful input
}

func (b *Interface) handleStub(_ context.Context, _ *gomcp.CallToolRequest, _ stubInput) (*gomcp.CallToolResult, stubOutput, error) {
	return nil, stubOutput{
		Status:  "not_implemented",
		Message: "This tool is not yet implemented. It will be wired in a future phase.",
	}, nil
}
