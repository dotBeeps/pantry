package soul

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/attention"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/persona"
)

func newTestLedger() *attention.Ledger {
	p := &persona.Persona{
		Attention: persona.AttentionConfig{
			Pool:  100,
			Rate:  0,
			Floor: 10,
		},
		Costs: persona.CostConfig{
			Beat: 5,
		},
	}
	return attention.New(p, slog.Default())
}

func TestAttentionAudit_ID(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)
	assert.Equal(t, "attention-honesty", audit.ID())
}

func TestAttentionAudit_NoActivity(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)

	audit.Snapshot()
	violation := audit.Verify()

	assert.Nil(t, violation, "no spends should produce no violation")
}

func TestAttentionAudit_ValidSpend(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)

	audit.Snapshot()
	require.NoError(t, ledger.Spend("think", 5))
	violation := audit.Verify()

	assert.Nil(t, violation, "a single valid spend should produce no violation")
}

func TestAttentionAudit_MultipleValidSpends(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)

	audit.Snapshot()
	require.NoError(t, ledger.Spend("think", 5))
	require.NoError(t, ledger.Spend("think", 5))
	violation := audit.Verify()

	assert.Nil(t, violation, "multiple valid spends should produce no violation")
}

func TestAttentionAudit_ZeroCostViolation(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)

	audit.Snapshot()
	// Spend with cost=0 succeeds (pool=100 >= 0) but is dishonest.
	require.NoError(t, ledger.Spend("noop", 0))
	violation := audit.Verify()

	require.NotNil(t, violation, "zero-cost spend must produce a violation")
	assert.Equal(t, "attention-honesty", violation.RuleID)
}

func TestAttentionAudit_DrainClearsState(t *testing.T) {
	ledger := newTestLedger()
	audit := newAttentionAudit("attention-honesty", ledger)

	// First cycle: valid spend, verify (drains audit trail).
	audit.Snapshot()
	require.NoError(t, ledger.Spend("think", 5))
	first := audit.Verify()
	assert.Nil(t, first, "first verify should be clean")

	// Second verify with no new spends: audit trail already drained, no double-report.
	second := audit.Verify()
	assert.Nil(t, second, "second verify with empty trail should be nil, not a double-report")
}
