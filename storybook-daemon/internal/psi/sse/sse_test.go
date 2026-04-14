package sse_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/psi/sse"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/sensory"
)

// stubCapture implements soul.OutputCapture for test use.
type stubCapture struct {
	hook func(string)
}

func (s *stubCapture) OnOutput(h func(string)) {
	s.hook = h
}

// fire delivers text via the registered hook, if any.
func (s *stubCapture) fire(text string) {
	if s.hook != nil {
		s.hook(text)
	}
}

// freePort grabs an ephemeral port and immediately releases it so the SSE
// server can bind to it. The kernel may reassign the port between Close and
// Listen; this is acceptable for tests.
func freePort(t *testing.T) int {
	t.Helper()

	lc := &net.ListenConfig{}
	ln, err := lc.Listen(context.Background(), "tcp", ":0")
	require.NoError(t, err)

	port := ln.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert // always TCPAddr here

	require.NoError(t, ln.Close())

	return port
}

// minimalLedger returns an attention ledger with safe zero-cost defaults.
func minimalLedger() *attention.Ledger {
	p := &persona.Persona{
		Attention: persona.AttentionConfig{
			Pool:  100,
			Rate:  10,
			Floor: 5,
		},
	}

	return attention.New(p, slog.Default())
}

// startTestIface starts a real SSE server on a free port and returns its base URL.
// The server is stopped via t.Cleanup.
func startTestIface(t *testing.T) string {
	t.Helper()

	_, base := startTestIfaceFull(t)

	return base
}

// startTestIfaceFull is like startTestIface but also returns the *sse.Interface so
// callers can call Wire or inspect it directly.
func startTestIfaceFull(t *testing.T) (*sse.Interface, string) {
	t.Helper()

	port := freePort(t)
	ledger := minimalLedger()
	agg := sensory.New(20)
	b := sse.New("test", port, ledger, agg, nil, slog.Default())

	require.NoError(t, b.Start(context.Background()))

	t.Cleanup(func() { _ = b.Stop() })

	base := fmt.Sprintf("http://localhost:%d", port)

	// Poll until the server is ready (max 200 ms).
	client := &http.Client{Timeout: 50 * time.Millisecond}

	for range 20 {
		resp, err := client.Get(base + "/state") //nolint:noctx // polling helper, context not needed
		if err == nil {
			_ = resp.Body.Close()

			return b, base
		}

		time.Sleep(10 * time.Millisecond)
	}

	t.Fatal("sse server did not start in time")

	return nil, ""
}

// TestSSE_GetState verifies that GET /state returns 200 with JSON containing
// an "attention" field.
func TestSSE_GetState(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	resp, err := http.Get(base + "/state") //nolint:noctx // test — no context needed
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")

	var payload map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&payload))
	assert.Contains(t, payload, "attention", "response body must have 'attention' field")
}

// TestSSE_GetState_MethodNotAllowed verifies that POST /state is rejected.
func TestSSE_GetState_MethodNotAllowed(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	resp, err := http.Post(base+"/state", "application/json", http.NoBody) //nolint:noctx // test
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
}

// TestSSE_PostMessage_OK verifies that a well-formed POST /message gets 204.
func TestSSE_PostMessage_OK(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	body := bytes.NewBufferString(`{"text":"hello world"}`)

	resp, err := http.Post(base+"/message", "application/json", body) //nolint:noctx // test
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

// TestSSE_PostMessage_EmptyText verifies that an empty text field yields 400.
func TestSSE_PostMessage_EmptyText(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	body := bytes.NewBufferString(`{"text":""}`)

	resp, err := http.Post(base+"/message", "application/json", body) //nolint:noctx // test
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestSSE_PostMessage_InvalidJSON verifies that malformed JSON yields 400.
func TestSSE_PostMessage_InvalidJSON(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	body := bytes.NewBufferString(`not json`)

	resp, err := http.Post(base+"/message", "application/json", body) //nolint:noctx // test
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// TestSSE_PostMessage_MethodNotAllowed verifies that GET /message is rejected.
func TestSSE_PostMessage_MethodNotAllowed(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	resp, err := http.Get(base + "/message") //nolint:noctx // test
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusMethodNotAllowed, resp.StatusCode)
}

// TestSSE_Stream_ReceivesThought connects to GET /stream, fires a thought via
// an OutputCapture hook, and asserts the SSE event carries it.
func TestSSE_Stream_ReceivesThought(t *testing.T) {
	t.Parallel()

	b, base := startTestIfaceFull(t)

	sc := &stubCapture{}
	b.Wire(sc)

	// Use a cancellable context so the SSE connection is cleaned up promptly.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/stream", http.NoBody)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	// Give the server a moment to register the SSE client before we fire.
	time.Sleep(20 * time.Millisecond)

	const wantText = "hello from the dragon"

	sc.fire(wantText)

	// Read SSE lines until we find a data line or the context expires.
	scanner := bufio.NewScanner(resp.Body)

	var gotData string

	for scanner.Scan() {
		line := scanner.Text()
		if after, ok := strings.CutPrefix(line, "data:"); ok {
			gotData = strings.TrimSpace(after)

			break
		}
	}

	require.NotEmpty(t, gotData, "expected a data line from SSE stream")

	var event map[string]any
	require.NoError(t, json.Unmarshal([]byte(gotData), &event), "SSE data must be valid JSON: %s", gotData)

	assert.Equal(t, "thought", event["type"], "SSE event type should be 'thought'")

	text, ok := event["text"].(string)
	require.True(t, ok, "SSE event must have a 'text' string field")
	assert.Equal(t, wantText, text)
}

// TestSSE_Stream_Headers checks that GET /stream sets the correct SSE headers
// and responds with 200.
func TestSSE_Stream_Headers(t *testing.T) {
	t.Parallel()

	base := startTestIface(t)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/stream", http.NoBody)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	defer func() {
		cancel() // cancel first so the read goroutine unblocks
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")
}
