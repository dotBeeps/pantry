package mcp_test

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"testing"
	"time"

	gomcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	mcpbody "github.com/dotBeeps/hoard/storybook-daemon/internal/body/mcp"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
)

func testPersona() *persona.Persona {
	return &persona.Persona{
		Persona: persona.Config{
			Name:   "test-dragon",
			Flavor: "test",
		},
		Attention: persona.AttentionConfig{
			Pool:  100,
			Floor: 10,
			Rate:  10,
		},
		Costs: persona.CostConfig{
			Think:    1,
			Speak:    1,
			Remember: 1,
			Search:   1,
			Perceive: 1,
		},
	}
}

func setupBody(t *testing.T) (*mcpbody.Body, int) {
	t.Helper()

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	p := testPersona()
	ledger := attention.New(p, log)

	vaultDir := t.TempDir()
	vault, err := memory.Open(vaultDir, log)
	require.NoError(t, err)

	// Use port 0 to let OS pick a free port — but the Body uses a fixed addr
	// string, so we pick a high ephemeral port to reduce collision risk.
	port := 19384
	b := mcpbody.New("test-mcp", port, vault, ledger, log)

	return b, port
}

func TestBody_StartStopClean(t *testing.T) {
	b, _ := setupBody(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	require.NoError(t, b.Start(ctx))
	assert.Equal(t, "mcp", b.Type())
	assert.Equal(t, "test-mcp", b.ID())
	assert.Nil(t, b.Tools())
	assert.Nil(t, b.Events())
	require.NoError(t, b.Stop())
}

func TestBody_RegisterSession(t *testing.T) {
	b, port := setupBody(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	require.NoError(t, b.Start(ctx))
	defer func() { require.NoError(t, b.Stop()) }()

	// Wait briefly for the HTTP server to be ready.
	addr := fmt.Sprintf("http://localhost:%d/mcp", port)
	waitForServer(t, addr, 2*time.Second)

	// Connect an MCP client.
	transport := &gomcp.StreamableClientTransport{Endpoint: addr}

	client := gomcp.NewClient(&gomcp.Implementation{
		Name:    "test-client",
		Version: "v0.1.0",
	}, nil)

	sess, err := client.Connect(ctx, transport, nil)
	require.NoError(t, err)
	defer func() { _ = sess.Close() }()

	// Call register_session.
	result, err := sess.CallTool(ctx, &gomcp.CallToolParams{
		Name: "register_session",
		Arguments: map[string]any{
			"session_id": "test-session-1",
			"provider":   "anthropic",
			"model":      "claude-sonnet-4-6",
			"harness":    "test",
		},
	})
	require.NoError(t, err)
	require.NotNil(t, result)

	// The structured output should contain the session_id.
	require.Len(t, result.Content, 1)
	textContent, ok := result.Content[0].(*gomcp.TextContent)
	require.True(t, ok, "expected TextContent, got %T", result.Content[0])
	assert.Contains(t, textContent.Text, "test-session-1")
}

func waitForServer(t *testing.T, url string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url) //nolint:noctx // test helper, no context needed
		if err == nil {
			_ = resp.Body.Close()
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("server at %s did not become ready within %s", url, timeout)
}
