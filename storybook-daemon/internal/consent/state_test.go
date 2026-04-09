package consent

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
)

//nolint:revive // unnamed returns: userPath and agentPath are self-explanatory positionally
func newTestState(t *testing.T) (*ConsentState, string, string) {
	t.Helper()
	dir := t.TempDir()
	userPath := filepath.Join(dir, "consent.yaml")
	agentPath := filepath.Join(dir, "agent-consent.yaml")
	state, err := Load(userPath, agentPath, slog.Default())
	require.NoError(t, err)
	return state, userPath, agentPath
}

func TestLoad_MissingFiles(t *testing.T) {
	state, _, _ := newTestState(t)
	assert.False(t, state.IsActive("anything", memory.TierLow))
}

func TestLoad_ExistingFiles(t *testing.T) {
	dir := t.TempDir()
	userPath := filepath.Join(dir, "consent.yaml")
	agentPath := filepath.Join(dir, "agent-consent.yaml")

	yamlContent := `grants:
  - feature: observations
    tier: medium
    granted_at: 2025-01-15T00:00:00Z
`
	require.NoError(t, os.WriteFile(userPath, []byte(yamlContent), 0o600))
	require.NoError(t, os.WriteFile(agentPath, []byte(yamlContent), 0o600))

	state, err := Load(userPath, agentPath, slog.Default())
	require.NoError(t, err)
	assert.True(t, state.IsActive("observations", memory.TierMedium))
}

func TestIsActive_RequiresBothSides(t *testing.T) {
	t.Run("only user granted", func(t *testing.T) {
		state, _, _ := newTestState(t)
		require.NoError(t, state.UserGrant("obs", memory.TierMedium))
		assert.False(t, state.IsActive("obs", memory.TierMedium))
	})

	t.Run("only agent granted", func(t *testing.T) {
		state, _, _ := newTestState(t)
		require.NoError(t, state.AgentGrant("obs", memory.TierMedium))
		assert.False(t, state.IsActive("obs", memory.TierMedium))
	})

	t.Run("both granted", func(t *testing.T) {
		state, _, _ := newTestState(t)
		require.NoError(t, state.UserGrant("obs", memory.TierMedium))
		require.NoError(t, state.AgentGrant("obs", memory.TierMedium))
		assert.True(t, state.IsActive("obs", memory.TierMedium))
	})
}

func TestIsActive_HigherTierCoversLower(t *testing.T) {
	state, _, _ := newTestState(t)
	require.NoError(t, state.UserGrant("obs", memory.TierHigh))
	require.NoError(t, state.AgentGrant("obs", memory.TierHigh))
	assert.True(t, state.IsActive("obs", memory.TierMedium))
	assert.True(t, state.IsActive("obs", memory.TierHigh))
}

func TestIsActive_LowerTierDoesNotCoverHigher(t *testing.T) {
	state, _, _ := newTestState(t)
	require.NoError(t, state.UserGrant("obs", memory.TierLow))
	require.NoError(t, state.AgentGrant("obs", memory.TierLow))
	assert.False(t, state.IsActive("obs", memory.TierMedium))
	assert.False(t, state.IsActive("obs", memory.TierHigh))
}

func TestUserGrant_PersistsToDisk(t *testing.T) {
	state, userPath, agentPath := newTestState(t)
	require.NoError(t, state.UserGrant("obs", memory.TierLow))

	// Reload from same paths — agent has no grant, so IsActive is false
	state2, err := Load(userPath, agentPath, slog.Default())
	require.NoError(t, err)
	assert.False(t, state2.IsActive("obs", memory.TierLow))

	// Read YAML directly and verify the grant is present
	data, err := os.ReadFile(userPath)
	require.NoError(t, err)
	var f consentFile
	require.NoError(t, yaml.Unmarshal(data, &f))
	require.Len(t, f.Grants, 1)
	assert.Equal(t, "obs", f.Grants[0].Feature)
	assert.Equal(t, memory.TierLow, f.Grants[0].Tier)
}

func TestUserRevoke_RemovesGrant(t *testing.T) {
	state, userPath, _ := newTestState(t)
	require.NoError(t, state.UserGrant("obs", memory.TierLow))
	require.NoError(t, state.UserRevoke("obs"))

	// In-memory: IsActive should be false
	assert.False(t, state.IsActive("obs", memory.TierLow))

	// On disk: grants should be empty
	data, err := os.ReadFile(userPath)
	require.NoError(t, err)
	var f consentFile
	require.NoError(t, yaml.Unmarshal(data, &f))
	assert.Empty(t, f.Grants)
}

func TestAgentGrant_UpsertsExisting(t *testing.T) {
	state, _, agentPath := newTestState(t)
	require.NoError(t, state.AgentGrant("obs", memory.TierLow))
	require.NoError(t, state.AgentGrant("obs", memory.TierMedium))

	// Reload agent file and verify only one grant with updated tier
	data, err := os.ReadFile(agentPath)
	require.NoError(t, err)
	var f consentFile
	require.NoError(t, yaml.Unmarshal(data, &f))
	require.Len(t, f.Grants, 1)
	assert.Equal(t, "obs", f.Grants[0].Feature)
	assert.Equal(t, memory.TierMedium, f.Grants[0].Tier)
}
