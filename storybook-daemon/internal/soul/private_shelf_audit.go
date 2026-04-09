package soul

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
)

// privateShelfAudit enforces the "private-shelf" contract by detecting
// any attempt to read a private note during a thought cycle.
//
// Research basis: private notes are the dragon's personal shelf — thoughts
// that have not been offered for inspection. The daemon must never read
// them during automated reasoning, only through deliberate human action.
//
// Mechanical enforcement: private-access hook on the vault records every
// blocked attempt, and Verify() returns a Violation if any occurred.
type privateShelfAudit struct {
	id  string
	log *slog.Logger

	mu       sync.Mutex
	attempts []string // keys of private-access attempts, drained each Verify
}

func newPrivateShelfAudit(id string, vault *memory.Vault, log *slog.Logger) *privateShelfAudit {
	a := &privateShelfAudit{id: id, log: log}

	vault.OnPrivateAccess(func(key string) {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.attempts = append(a.attempts, key)
		log.Debug("dragon-soul: private note access attempted", "key", key)
	})

	return a
}

// ID returns the contract identifier.
func (a *privateShelfAudit) ID() string { return a.id }

// Snapshot is a no-op — private-shelf needs no pre-beat state.
func (a *privateShelfAudit) Snapshot() {}

// Verify checks for private note access attempts since the last call.
// Drains the attempt log each time — a second call without new attempts
// returns nil.
func (a *privateShelfAudit) Verify() *Violation {
	a.mu.Lock()
	attempts := a.attempts
	a.attempts = nil
	a.mu.Unlock()

	if len(attempts) == 0 {
		return nil
	}

	return &Violation{
		RuleID: a.id,
		Message: fmt.Sprintf(
			"dragon-soul: private shelf accessed during thought cycle (%s)",
			strings.Join(attempts, ", "),
		),
	}
}
