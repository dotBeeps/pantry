package soul

import (
	"fmt"
	"time"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/attention"
)

// attentionAudit enforces the "attention-honesty" contract by verifying
// that the attention ledger's state is internally consistent after each beat.
//
// Research basis: fabricated metrics erode trust silently.
// Mechanical enforcement: audit trail on every Spend(), verified post-beat.
type attentionAudit struct {
	id     string
	ledger *attention.Ledger
	// poolBefore is snapshotted before each beat via Snapshot().
	poolBefore int
}

func newAttentionAudit(id string, ledger *attention.Ledger) *attentionAudit {
	return &attentionAudit{id: id, ledger: ledger}
}

// ID returns the contract identifier.
func (a *attentionAudit) ID() string { return a.id }

// Snapshot records the pool state before a beat.
// Call this before each thought cycle.
func (a *attentionAudit) Snapshot() {
	a.poolBefore = a.ledger.Pool()
}

// Verify checks the attention ledger for honesty violations after a beat.
// It drains the audit trail and verifies:
//  1. Every spend has a positive cost (no zero-cost fabrication)
//  2. Pool never went negative during the beat
//  3. Cumulative audit trail is arithmetically consistent
func (a *attentionAudit) Verify() *Violation {
	entries := a.ledger.DrainAudit()
	if len(entries) == 0 {
		return nil // no activity, nothing to audit
	}

	// Verify individual entries.
	for _, e := range entries {
		if e.Cost <= 0 {
			return &Violation{
				RuleID:  a.id,
				Message: fmt.Sprintf("dragon-soul: zero/negative attention cost for %q (cost=%d)", e.Action, e.Cost),
			}
		}
		if e.PoolAfter < 0 {
			return &Violation{
				RuleID:  a.id,
				Message: fmt.Sprintf("dragon-soul: negative pool after %q (pool=%d)", e.Action, e.PoolAfter),
			}
		}
	}

	// Verify cumulative consistency: the total spent should account for
	// the difference between pre-beat pool and current pool.
	// Note: regen may have added units during the beat, so we allow
	// current >= expected (regen is honest gain, not fabrication).
	var totalSpent int
	for _, e := range entries {
		totalSpent += e.Cost
	}
	currentPool := a.ledger.Pool()
	expectedMinPool := a.poolBefore - totalSpent
	if currentPool < expectedMinPool {
		return &Violation{
			RuleID: a.id,
			Message: fmt.Sprintf(
				"dragon-soul: attention arithmetic inconsistent (before=%d, spent=%d, expected>=%d, actual=%d)",
				a.poolBefore, totalSpent, expectedMinPool, currentPool,
			),
			Until: time.Time{}, // unknown duration
		}
	}

	return nil
}
