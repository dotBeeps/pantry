package obsidian_test

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory/obsidian"
)

// fakeBinary writes a shell script that prints output and returns a path to it.
func fakeBinary(t *testing.T, output string, exitCode int) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "obsidian")
	script := fmt.Sprintf("#!/bin/sh\necho '%s'\nexit %d\n", output, exitCode)
	require.NoError(t, os.WriteFile(path, []byte(script), 0o755)) //nolint:gosec // test file, fixed permissions fine
	return path
}

func TestClient_Available_BinaryMissing(t *testing.T) {
	client := obsidian.NewClient("/nonexistent/obsidian", "", 5*time.Second, slog.Default())
	assert.False(t, client.Available())
}

func TestClient_Available_BinaryPresent(t *testing.T) {
	bin := fakeBinary(t, "1.12.0", 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	assert.True(t, client.Available())
}

func TestClient_SearchByTag_ParsesJSON(t *testing.T) {
	bin := fakeBinary(t, `["notes/work.md","notes/tasks.md"]`, 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	paths, err := client.SearchByTag(context.Background(), "consent/high", 0)
	require.NoError(t, err)
	require.Len(t, paths, 2)
	assert.Equal(t, "notes/work.md", paths[0])
	assert.Equal(t, "notes/tasks.md", paths[1])
}

func TestClient_SearchByTag_EmptyResult(t *testing.T) {
	bin := fakeBinary(t, `[]`, 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	paths, err := client.SearchByTag(context.Background(), "notag", 0)
	require.NoError(t, err)
	assert.Empty(t, paths)
}

func TestClient_Tags_ParsesJSON(t *testing.T) {
	bin := fakeBinary(t, `[{"name":"consent/high","count":3},{"name":"work","count":10}]`, 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	tags, err := client.Tags(context.Background())
	require.NoError(t, err)
	require.Len(t, tags, 2)
	assert.Equal(t, "consent/high", tags[0].Name)
	assert.Equal(t, 3, tags[0].Count)
}

func TestClient_SetProperty_Succeeds(t *testing.T) {
	bin := fakeBinary(t, "", 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	err := client.SetProperty(context.Background(), "notes/test.md", "tier", "high")
	require.NoError(t, err)
}

func TestClient_ReadProperty_ReturnsValue(t *testing.T) {
	bin := fakeBinary(t, "medium", 0)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	val, err := client.ReadProperty(context.Background(), "notes/test.md", "tier")
	require.NoError(t, err)
	assert.Equal(t, "medium", val)
}

func TestClient_Run_NonZeroExitReturnsError(t *testing.T) {
	bin := fakeBinary(t, "something went wrong", 1)
	client := obsidian.NewClient(bin, "", 5*time.Second, slog.Default())
	_, err := client.SearchByTag(context.Background(), "anytag", 0)
	require.Error(t, err)
}

func TestClient_NewClient_DefaultBinary(t *testing.T) {
	client := obsidian.NewClient("", "", 0, slog.Default())
	assert.NotNil(t, client)
	// Available() returns false since "obsidian" likely isn't installed in CI — that's fine
	_ = client.Available()
}
