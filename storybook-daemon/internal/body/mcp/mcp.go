// Package mcp implements an MCP (Model Context Protocol) server body that
// exposes the daemon's memory vault, attention state, and session registration
// to external AI coding tools via streamable HTTP.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	gomcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// session holds the metadata from a register_session call.
type session struct {
	SessionID string `json:"session_id"`
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	Harness   string `json:"harness"`
}

// Body is the MCP server body. It exposes the daemon's memory vault and
// attention state to external AI coding tools via the Model Context Protocol.
type Body struct {
	id     string
	port   int
	vault  *memory.Vault
	ledger *attention.Ledger
	log    *slog.Logger

	mu       sync.Mutex
	sessions map[string]session

	server *http.Server
	cancel context.CancelFunc
}

// New creates an MCP Body that serves on the given port.
func New(id string, port int, vault *memory.Vault, ledger *attention.Ledger, log *slog.Logger) *Body {
	return &Body{
		id:       id,
		port:     port,
		vault:    vault,
		ledger:   ledger,
		log:      log,
		sessions: make(map[string]session),
	}
}

// ID returns the configured body identifier.
func (b *Body) ID() string { return b.id }

// Type returns the static discriminator string for this body kind.
func (b *Body) Type() string { return "mcp" }

// Tools returns nil — the MCP body exposes tools via the MCP protocol, not
// through the daemon's internal tool routing.
func (b *Body) Tools() []body.ToolDef { return nil }

// Events returns nil — the MCP body does not emit sensory events.
func (b *Body) Events() <-chan sensory.Event { return nil }

// Start launches the MCP streamable HTTP server. It returns as soon as the
// server goroutine is running; ctx cancellation triggers graceful shutdown.
func (b *Body) Start(ctx context.Context) error {
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
func (b *Body) Stop() error {
	if b.cancel != nil {
		b.cancel()
	}
	return nil
}

// State returns a BodyState summary for the aggregator snapshot.
func (b *Body) State(_ context.Context) (sensory.BodyState, error) {
	b.mu.Lock()
	count := len(b.sessions)
	b.mu.Unlock()

	return sensory.BodyState{
		ID:      b.id,
		Type:    "mcp",
		Summary: fmt.Sprintf("[mcp: listening on :%d, %d active sessions]", b.port, count),
	}, nil
}

// Execute is a no-op — the MCP body handles requests via the MCP protocol.
func (b *Body) Execute(_ context.Context, name string, _ map[string]any) (string, error) {
	return "", fmt.Errorf("mcp body has no internal tools: %q", name)
}

// buildServer constructs and configures the MCP server with all tool handlers.
func (b *Body) buildServer() *gomcp.Server {
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

type stubOutput struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// ── Tool registration ───────────────────────────────────────

func (b *Body) registerTools(server *gomcp.Server) {
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
		Description: "Send a message via sending stone (not yet implemented).",
	}, b.handleStub)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "stone_receive",
		Description: "Receive messages from sending stone (not yet implemented).",
	}, b.handleStub)

	gomcp.AddTool(server, &gomcp.Tool{
		Name:        "quest_status",
		Description: "Check quest status (not yet implemented).",
	}, b.handleStub)
}

// ── Tool handlers ───────────────────────────────────────────

func (b *Body) handleRegisterSession(_ context.Context, _ *gomcp.CallToolRequest, input registerSessionInput) (*gomcp.CallToolResult, registerSessionOutput, error) {
	s := session{
		SessionID: input.SessionID,
		Provider:  input.Provider,
		Model:     input.Model,
		Harness:   input.Harness,
	}

	b.mu.Lock()
	b.sessions[input.SessionID] = s
	b.mu.Unlock()

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

func (b *Body) handleMemorySearch(_ context.Context, _ *gomcp.CallToolRequest, input memorySearchInput) (*gomcp.CallToolResult, any, error) {
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

func (b *Body) handleMemoryRead(_ context.Context, _ *gomcp.CallToolRequest, input memoryReadInput) (*gomcp.CallToolResult, any, error) {
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

func (b *Body) handleMemoryWrite(_ context.Context, _ *gomcp.CallToolRequest, input memoryWriteInput) (*gomcp.CallToolResult, memoryWriteOutput, error) {
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

func (b *Body) handleAttentionState(_ context.Context, _ *gomcp.CallToolRequest, _ struct{}) (*gomcp.CallToolResult, attentionStateOutput, error) {
	return nil, attentionStateOutput{
		Pool:   b.ledger.Pool(),
		Status: b.ledger.Status(),
	}, nil
}

type stubInput struct {
	// empty — stubs accept no meaningful input
}

func (b *Body) handleStub(_ context.Context, _ *gomcp.CallToolRequest, _ stubInput) (*gomcp.CallToolResult, stubOutput, error) {
	return nil, stubOutput{
		Status:  "not_implemented",
		Message: "This tool is not yet implemented. It will be wired in a future phase.",
	}, nil
}
