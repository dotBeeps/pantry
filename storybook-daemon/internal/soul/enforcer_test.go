package soul_test

import (
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/consent"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/soul"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testPersona returns a minimal persona for constructing ledgers.
func testPersona() *persona.Persona {
	return &persona.Persona{
		Attention: persona.AttentionConfig{Pool: 100, Rate: 0, Floor: 10},
		Costs:     persona.CostConfig{Beat: 5},
	}
}

// testLedgerE creates a real attention Ledger for testing.
func testLedgerE(t *testing.T) *attention.Ledger {
	t.Helper()
	return attention.New(testPersona(), slog.Default())
}

// testVaultE creates a real memory Vault in a temp directory for testing.
func testVaultE(t *testing.T) *memory.Vault {
	t.Helper()
	v, err := memory.Open(t.TempDir(), slog.Default())
	require.NoError(t, err)
	return v
}

// --- NewEnforcer construction tests ---

func TestNewEnforcer_Empty(t *testing.T) {
	e, err := soul.NewEnforcer(nil, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.GateCount())
	assert.Equal(t, 0, e.AuditCount())
}

func TestNewEnforcer_DisabledContract(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: 09:00-17:00", Enabled: false},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.GateCount())
}

func TestNewEnforcer_MinimumRestGate(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: 09:00-17:00", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 1, e.GateCount())
	assert.Equal(t, 0, e.AuditCount())
}

func TestNewEnforcer_MalformedGateRule(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: bad", Enabled: true},
	}
	_, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.Error(t, err)
}

func TestNewEnforcer_AttentionHonestyWithLedger(t *testing.T) {
	ledger := testLedgerE(t)
	contracts := []persona.Contract{
		{ID: "attention-honesty", Rule: "attention honesty", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Ledger: ledger}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.GateCount())
	assert.Equal(t, 1, e.AuditCount())
}

func TestNewEnforcer_AttentionHonestyWithoutLedger(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "attention-honesty", Rule: "attention honesty", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.AuditCount())
}

func TestNewEnforcer_MemoryTransparencyWithVault(t *testing.T) {
	vault := testVaultE(t)
	contracts := []persona.Contract{
		{ID: "memory-transparency", Rule: "memory transparency", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Vault: vault}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 1, e.AuditCount())
}

func TestNewEnforcer_MemoryTransparencyWithoutVault(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "memory-transparency", Rule: "memory transparency", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.AuditCount())
}

func TestNewEnforcer_DeclarativeContract(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "be-kind", Rule: "treat the user with respect", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.GateCount())
	assert.Equal(t, 0, e.AuditCount())
}

// --- CheckAt gate tests ---

func TestEnforcer_CheckAt_OutsideWindow(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: 09:00-17:00", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)

	// 08:00 UTC — before the 09:00 rest window
	ts := time.Date(2025, 1, 15, 8, 0, 0, 0, time.UTC)
	v := e.CheckAt(ts)
	assert.Nil(t, v)
}

func TestEnforcer_CheckAt_InsideWindow(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: 09:00-17:00", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)

	// 12:00 UTC — inside the 09:00-17:00 rest window
	ts := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	v := e.CheckAt(ts)
	require.NotNil(t, v)
	assert.Equal(t, "minimum-rest", v.RuleID)
}

// --- PreBeat / Verify audit tests ---

func TestEnforcer_PreBeatVerify_Clean(t *testing.T) {
	ledger := testLedgerE(t)
	contracts := []persona.Contract{
		{ID: "attention-honesty", Rule: "attention honesty", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Ledger: ledger}, slog.Default())
	require.NoError(t, err)

	// Take a snapshot before any spend.
	e.PreBeat()

	// No spends occurred — Verify should be clean.
	v := e.Verify()
	assert.Nil(t, v)
}

// --- Multiple contracts ---

func TestEnforcer_MultipleContracts(t *testing.T) {
	ledger := testLedgerE(t)
	vault := testVaultE(t)

	contracts := []persona.Contract{
		{ID: "minimum-rest", Rule: "minimum-rest: 09:00-17:00", Enabled: true},
		{ID: "attention-honesty", Rule: "attention honesty", Enabled: true},
		{ID: "memory-transparency", Rule: "memory transparency", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Ledger: ledger, Vault: vault}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 1, e.GateCount())
	assert.Equal(t, 2, e.AuditCount())
}

func TestNewEnforcer_PrivateShelfWithVault(t *testing.T) {
	vault := testVaultE(t)
	contracts := []persona.Contract{
		{ID: "private-shelf", Rule: "private shelf contract", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Vault: vault}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 1, e.AuditCount())
}

func TestNewEnforcer_PrivateShelfWithoutVault(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "private-shelf", Rule: "private shelf contract", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.AuditCount())
}

func TestNewEnforcer_ConsentTierGate(t *testing.T) {
	dir := t.TempDir()
	state, err := consent.Load(
		filepath.Join(dir, "consent.yaml"),
		filepath.Join(dir, "agent-consent.yaml"),
		slog.Default(),
	)
	require.NoError(t, err)

	contracts := []persona.Contract{
		{ID: "high-risk", Rule: "consent-tier: high", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Consent: state}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 1, e.GateCount())
}

// --- framing-honesty enforcer wiring tests ---

// testOutputCapture is a minimal soul.OutputCapture for enforcer wiring tests.
type testOutputCapture struct{}

func (c *testOutputCapture) OnOutput(_ func(string)) {}

func TestNewEnforcer_FramingHonestyWithCycle(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "framing-honesty", Rule: "framing-honesty:", Enabled: true},
	}
	tc := &testOutputCapture{}
	e, err := soul.NewEnforcer(contracts, soul.Deps{Cycle: tc}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.GateCount())
	assert.Equal(t, 1, e.AuditCount())
}

func TestNewEnforcer_FramingHonestyWithoutCycle(t *testing.T) {
	contracts := []persona.Contract{
		{ID: "framing-honesty", Rule: "framing-honesty:", Enabled: true},
	}
	e, err := soul.NewEnforcer(contracts, soul.Deps{}, slog.Default())
	require.NoError(t, err)
	assert.Equal(t, 0, e.AuditCount()) // skipped when no cycle wired
}
