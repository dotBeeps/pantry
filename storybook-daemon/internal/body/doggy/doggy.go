// Package doggy implements the HTTP+SSE body that exposes the daemon's
// thought stream, attention state, and direct-message ingestion over a local
// HTTP server. This is dot's control interface — her body in the system.
package doggy

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
	"github.com/dotBeeps/hoard/storybook-daemon/internal/body"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/soul"
)

// Body is the doggy HTTP+SSE body. It exposes the daemon's thought stream,
// attention state, and a direct-message channel to dot over a local HTTP server.
type Body struct {
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

// New creates a doggy Body. Wire must be called before Start to connect the
// thought stream.
func New(id string, port int, ledger *attention.Ledger, agg *sensory.Aggregator, log *slog.Logger) *Body {
	return &Body{
		id:      id,
		port:    port,
		ledger:  ledger,
		agg:     agg,
		log:     log,
		clients: make(map[chan string]struct{}),
	}
}

// Wire connects the doggy body to the thought cycle output stream.
// Call this after the thought cycle is created, before the heart starts.
func (b *Body) Wire(capture soul.OutputCapture) {
	capture.OnOutput(func(text string) {
		b.broadcastJSON(map[string]string{"type": "thought", "text": text})
	})
}

// ID returns the configured body identifier.
func (b *Body) ID() string { return b.id }

// Type returns the static discriminator string for this body kind.
func (b *Body) Type() string { return "doggy" }

// Tools returns nil — the doggy body exposes no agent tools.
func (b *Body) Tools() []body.ToolDef { return nil }

// Events returns nil — the doggy body does not emit sensory events.
func (b *Body) Events() <-chan sensory.Event { return nil }

// Start launches the HTTP server. It returns as soon as the server goroutine
// is running; ctx cancellation triggers a graceful shutdown.
func (b *Body) Start(ctx context.Context) error {
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
		b.log.Info("doggy: listening", "port", b.port)
		if err := b.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			b.log.Error("doggy: server error", "err", err)
		}
	}()

	go func() { //nolint:gosec // G118: independent goroutine manages graceful shutdown, not request-scoped
		<-serverCtx.Done()
		shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutCancel()
		if err := b.server.Shutdown(shutCtx); err != nil { //nolint:contextcheck // Stop() has no ctx param; shutdown needs its own budget
			b.log.Error("doggy: shutdown error", "err", err)
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
	return sensory.BodyState{
		ID:      b.id,
		Type:    "doggy",
		Summary: fmt.Sprintf("[doggy: listening on :%d]", b.port),
	}, nil
}

// Execute is a no-op — doggy exposes no tools.
func (b *Body) Execute(_ context.Context, name string, _ map[string]any) (string, error) {
	return "", fmt.Errorf("doggy body has no tools: %q", name)
}

// addClient registers a new SSE subscriber channel.
func (b *Body) addClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[ch] = struct{}{}
}

// removeClient deregisters and closes an SSE subscriber channel.
func (b *Body) removeClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
}

// broadcastJSON marshals v and fans it out to all connected SSE clients.
// Slow clients are skipped rather than blocked.
func (b *Body) broadcastJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		b.log.Error("doggy: broadcast marshal", "err", err)
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
func (b *Body) handleStream(w http.ResponseWriter, r *http.Request) {
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
func (b *Body) handleState(w http.ResponseWriter, r *http.Request) {
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
		b.log.Error("doggy: state encode", "err", err)
	}
}

type messageRequest struct {
	Text string `json:"text"`
}

// handleMessage accepts a POST with {"text":"..."} and enqueues a "message"
// sensory event so the next thought cycle sees dot's input.
func (b *Body) handleMessage(w http.ResponseWriter, r *http.Request) {
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
		Source:  "doggy",
		Kind:    "message",
		Content: req.Text,
		At:      time.Now(),
	})
	w.WriteHeader(http.StatusNoContent)
}
