package soul

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory"
)

// memoryAudit enforces the "memory-transparency" contract by ensuring
// every vault write is recorded in an audit log and auto-journaled.
//
// Research basis: opt-out and self-governance are performative without
// real audit trails. Every memory write must be observable.
//
// Mechanical enforcement: write hook on the vault records every write,
// auto-journals to daily log, and Verify() confirms nothing was missed.
type memoryAudit struct {
	id  string
	log *slog.Logger

	mu      sync.Mutex
	writes  []memory.WriteRecord
	journal *memory.Vault // vault for auto-journaling
}

func newMemoryAudit(id string, vault *memory.Vault, log *slog.Logger) *memoryAudit {
	a := &memoryAudit{
		id:      id,
		log:     log,
		journal: vault,
	}

	// Register write hook — every vault write flows through here.
	vault.OnWrite(func(record memory.WriteRecord) {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.writes = append(a.writes, record)
		a.log.Debug("dragon-soul: vault write recorded",
			"key", record.Key,
			"kind", record.Kind,
		)
	})

	return a
}

// ID returns the contract identifier.
func (a *memoryAudit) ID() string { return a.id }

// Verify checks that all vault writes since the last verification
// were properly recorded. Drains the write log and auto-journals any
// that haven't been logged yet.
func (a *memoryAudit) Verify() *Violation {
	a.mu.Lock()
	writes := a.writes
	a.writes = nil
	a.mu.Unlock()

	if len(writes) == 0 {
		return nil // no writes, nothing to audit
	}

	// Auto-journal all writes to the daily log.
	journalKey := "daily-journal/" + writes[0].At.Format("2006-01-02")
	entries := formatJournalEntries(writes)

	_, err := a.journal.Append(journalKey, entries)
	if err != nil {
		return &Violation{
			RuleID:  a.id,
			Message: fmt.Sprintf("dragon-soul: failed to journal %d vault write(s): %v", len(writes), err),
		}
	}

	a.log.Info("dragon-soul: memory transparency enforced",
		"writes_journaled", len(writes),
		"journal_key", journalKey,
	)
	return nil
}

// formatJournalEntries builds the markdown list of vault writes for the daily journal.
//
//nolint:revive // strings.Builder.WriteString never returns a non-nil error
func formatJournalEntries(writes []memory.WriteRecord) string {
	var sb strings.Builder
	for _, w := range writes {
		sb.WriteString("- [")
		sb.WriteString(w.At.Format("15:04:05"))
		sb.WriteString("] wrote `")
		sb.WriteString(w.Key)
		sb.WriteString("` (")
		sb.WriteString(string(w.Kind))
		sb.WriteString(")\n")
	}
	return sb.String()
}
