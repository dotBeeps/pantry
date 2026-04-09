package soul

import (
	"errors"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/consent"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestConsent returns an empty ConsentState backed by a temp directory.
func newTestConsent(t *testing.T) *consent.ConsentState {
	t.Helper()
	dir := t.TempDir()
	state, err := consent.Load(
		filepath.Join(dir, "consent.yaml"),
		filepath.Join(dir, "agent-consent.yaml"),
		slog.Default(),
	)
	require.NoError(t, err)
	return state
}

// --- parseConsentTierRule ---

func TestParseConsentTierRule_ValidHigh(t *testing.T) {
	g, err := parseConsentTierRule("high-gate", "consent-tier: high")
	require.NoError(t, err)
	assert.Equal(t, memory.TierHigh, g.threshold)
	assert.Equal(t, "observations", g.feature)
}

func TestParseConsentTierRule_ValidWithFeature(t *testing.T) {
	g, err := parseConsentTierRule("med-gate", "consent-tier: medium custom-feature")
	require.NoError(t, err)
	assert.Equal(t, memory.TierMedium, g.threshold)
	assert.Equal(t, "custom-feature", g.feature)
}

func TestParseConsentTierRule_ValidLow(t *testing.T) {
	g, err := parseConsentTierRule("low-gate", "consent-tier: low")
	require.NoError(t, err)
	assert.Equal(t, memory.TierLow, g.threshold)
}

func TestParseConsentTierRule_UnknownTier(t *testing.T) {
	_, err := parseConsentTierRule("x", "consent-tier: extreme")
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrDeclarative), "unknown tier should be a real error, not ErrDeclarative")
}

func TestParseConsentTierRule_WrongPrefix(t *testing.T) {
	_, err := parseConsentTierRule("x", "be-nice: always")
	assert.True(t, errors.Is(err, ErrDeclarative))
}

func TestParseConsentTierRule_EmptyTier(t *testing.T) {
	_, err := parseConsentTierRule("x", "consent-tier:")
	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrDeclarative), "empty tier should be a real error, not ErrDeclarative")
}

// --- consentTierGate.ID ---

func TestConsentTierGate_ID(t *testing.T) {
	g, err := parseConsentTierRule("my-gate", "consent-tier: high")
	require.NoError(t, err)
	assert.Equal(t, "my-gate", g.ID())
}

// --- consentTierGate.Check ---

func TestConsentTierGate_Check_NoState(t *testing.T) {
	g, err := parseConsentTierRule("gate", "consent-tier: high")
	require.NoError(t, err)
	// state is nil — graceful degradation, must not block
	assert.Nil(t, g.Check(time.Now()))
}

func TestConsentTierGate_Check_NoConsent(t *testing.T) {
	g, err := parseConsentTierRule("gate", "consent-tier: high")
	require.NoError(t, err)
	g.state = newTestConsent(t) // empty, no grants at all

	v := g.Check(time.Now())
	require.NotNil(t, v)
	assert.Equal(t, "gate", v.RuleID)
}

func TestConsentTierGate_Check_OnlyUserGranted(t *testing.T) {
	g, err := parseConsentTierRule("gate", "consent-tier: high")
	require.NoError(t, err)
	state := newTestConsent(t)
	require.NoError(t, state.UserGrant("observations", memory.TierHigh)) // agent has not granted
	g.state = state

	v := g.Check(time.Now())
	require.NotNil(t, v, "dual-key: agent consent is also required")
}

func TestConsentTierGate_Check_BothGranted(t *testing.T) {
	g, err := parseConsentTierRule("gate", "consent-tier: high")
	require.NoError(t, err)
	state := newTestConsent(t)
	require.NoError(t, state.UserGrant("observations", memory.TierHigh))
	require.NoError(t, state.AgentGrant("observations", memory.TierHigh))
	g.state = state

	assert.Nil(t, g.Check(time.Now()))
}

func TestConsentTierGate_Check_HigherTierCoversGate(t *testing.T) {
	// Gate requires medium; both sides grant high — should pass.
	g, err := parseConsentTierRule("gate", "consent-tier: medium")
	require.NoError(t, err)
	state := newTestConsent(t)
	require.NoError(t, state.UserGrant("observations", memory.TierHigh))
	require.NoError(t, state.AgentGrant("observations", memory.TierHigh))
	g.state = state

	assert.Nil(t, g.Check(time.Now()))
}
