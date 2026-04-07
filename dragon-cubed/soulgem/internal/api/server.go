// Package api is the HTTP bridge between the pi extension and SoulGem.
// The pi extension calls these endpoints to get tool definitions, query state,
// and dispatch commands to Leylines.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"dev.dragoncubed/soulgem/internal/agent"
	"dev.dragoncubed/soulgem/internal/leylines"
	"dev.dragoncubed/soulgem/internal/prompt"
	"dev.dragoncubed/soulgem/internal/tools"
)

// Server is the HTTP API server for the pi extension.
type Server struct {
	addr       string
	session    *leylines.Session
	client     *leylines.Client
	dispatcher *agent.Dispatcher
	log        *slog.Logger
	srv        *http.Server
}

// New creates a Server. Call [Start] to begin listening.
func New(addr string, session *leylines.Session, client *leylines.Client, dispatcher *agent.Dispatcher, log *slog.Logger) *Server {
	s := &Server{
		addr:       addr,
		session:    session,
		client:     client,
		dispatcher: dispatcher,
		log:        log,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/status",         s.handleStatus)
	mux.HandleFunc("GET /api/tools",          s.handleTools)
	mux.HandleFunc("GET /api/state",          s.handleState)
	mux.HandleFunc("GET /api/context",        s.handleContext)
	mux.HandleFunc("POST /api/command",       s.handleCommand)
	mux.HandleFunc("GET /api/agents",         s.handleAgentList)
	mux.HandleFunc("POST /api/agents",        s.handleAgentDispatch)
	mux.HandleFunc("DELETE /api/agents/",     s.handleAgentKill)    // /api/agents/:id
	mux.HandleFunc("GET /api/agents/",        s.handleAgentLogs)    // /api/agents/:id/logs

	s.srv = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		// WriteTimeout intentionally generous — commands block until goal resolves.
		WriteTimeout: 120 * time.Second,
	}
	return s
}

// Start begins listening. Blocks until the server exits or ctx is cancelled.
func (s *Server) Start(ctx context.Context) error {
	s.log.Info("SoulGem API listening", "addr", s.addr)

	errCh := make(chan error, 1)
	go func() { errCh <- s.srv.ListenAndServe() }()

	select {
	case <-ctx.Done():
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.srv.Shutdown(shutCtx)
	case err := <-errCh:
		return err
	}
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /api/status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	hs, hasHandshake := s.session.SnapshotHandshake()
	respond(w, map[string]interface{}{
		"connected":        s.client.Connected(),
		"leylines_version": func() string {
			if hasHandshake {
				return hs.Version
			}
			return ""
		}(),
	})
}

// GET /api/tools — returns synthesized tool definitions for the pi extension.
func (s *Server) handleTools(w http.ResponseWriter, r *http.Request) {
	hs, ok := s.session.SnapshotHandshake()
	if !ok {
		http.Error(w, "Leylines not connected — no handshake received yet", http.StatusServiceUnavailable)
		return
	}
	respond(w, tools.SynthesizeFromHandshake(hs))
}

// GET /api/state — returns the current player state.
func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	state, ok := s.session.SnapshotState()
	if !ok {
		http.Error(w, "No state received from Leylines yet", http.StatusServiceUnavailable)
		return
	}
	respond(w, state)
}

// GET /api/context — returns the assembled LLM prompt context.
func (s *Server) handleContext(w http.ResponseWriter, r *http.Request) {
	state, _ := s.session.SnapshotState()
	events := s.session.RecentEvents()
	ctx := prompt.Build(state, events)
	respond(w, map[string]string{"context": ctx.Full})
}

// POST /api/command — dispatches a command to Leylines and blocks until resolved.
//
// Request body:
//
//	{ "capability": "d3-rumble", "action": "pathfind", "params": { "x": 0, "y": 64, "z": 0 } }
//
// Response:
//
//	{ "cmdId": "...", "completed": true, "event": "goal:completed", "data": {} }
func (s *Server) handleCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Capability string                 `json:"capability"`
		Action     string                 `json:"action"`
		Params     map[string]interface{} `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid request body: %s", err), http.StatusBadRequest)
		return
	}
	if req.Capability == "" || req.Action == "" {
		http.Error(w, "capability and action are required", http.StatusBadRequest)
		return
	}

	cmdID := newCmdID()

	// Register a result channel before sending — avoids race where Leylines
	// responds before we're listening.
	resultCh := s.session.RegisterPending(cmdID)

	cmd := leylines.NewCommand(cmdID, req.Capability, req.Action, req.Params)
	if err := s.client.SendCommand(r.Context(), cmd); err != nil {
		s.session.CancelPending(cmdID)
		http.Error(w, fmt.Sprintf("failed to send command to Leylines: %s", err), http.StatusBadGateway)
		return
	}

	s.log.Info("Command dispatched", "cmdId", cmdID, "capability", req.Capability, "action", req.Action)

	result, err := leylines.WaitForResult(resultCh)
	if err != nil {
		http.Error(w, fmt.Sprintf("command did not resolve: %s", err), http.StatusGatewayTimeout)
		return
	}

	respond(w, map[string]interface{}{
		"cmdId":     cmdID,
		"completed": result.Completed,
		"event":     result.Event.Event,
		"data":      result.Event.Data,
	})
}

// ── Agent endpoints ──────────────────────────────────────────────────────────

// GET /api/agents
func (s *Server) handleAgentList(w http.ResponseWriter, r *http.Request) {
	respond(w, s.dispatcher.List())
}

// POST /api/agents  { "goal": "..." }
func (s *Server) handleAgentDispatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Goal string `json:"goal"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Goal == "" {
		http.Error(w, "request body must contain non-empty \"goal\" string", http.StatusBadRequest)
		return
	}

	if !s.dispatcher.PiBinaryAvailable() {
		http.Error(w, "pi binary not found on PATH — is pi installed?", http.StatusServiceUnavailable)
		return
	}

	// Build context from live Leylines state
	state, _ := s.session.SnapshotState()
	events := s.session.RecentEvents()
	ctx := prompt.Build(state, events)

	snap, err := s.dispatcher.Dispatch(r.Context(), req.Goal, ctx.Full)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to dispatch agent: %s", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	respond(w, snap)
}

// DELETE /api/agents/:id
func (s *Server) handleAgentKill(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/agents/")
	if id == "" {
		http.Error(w, "agent id required", http.StatusBadRequest)
		return
	}
	if err := s.dispatcher.Kill(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/agents/:id/logs
func (s *Server) handleAgentLogs(w http.ResponseWriter, r *http.Request) {
	// Path: /api/agents/:id/logs  or  /api/agents/:id
	path := strings.TrimPrefix(r.URL.Path, "/api/agents/")
	id := strings.TrimSuffix(path, "/logs")
	if id == "" {
		http.Error(w, "agent id required", http.StatusBadRequest)
		return
	}

	if strings.HasSuffix(path, "/logs") {
		logs, ok := s.dispatcher.GetLogs(id)
		if !ok {
			http.Error(w, fmt.Sprintf("agent %q not found", id), http.StatusNotFound)
			return
		}
		respond(w, map[string]interface{}{"id": id, "logs": logs})
		return
	}

	snap, ok := s.dispatcher.Get(id)
	if !ok {
		http.Error(w, fmt.Sprintf("agent %q not found", id), http.StatusNotFound)
		return
	}
	respond(w, snap)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func newCmdID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func respond(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Response already started — can't send error status
		return
	}
}
