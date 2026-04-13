// Package conversation implements the daemon-side conversation ledger
// that tracks exchanges between dot, the persona, and allies.
package conversation

import "time"

// Entry is a single conversational exchange in the ledger.
type Entry struct {
	Role    string // "dot", "ember", "ally:Grix", "system"
	Content string
	Source  string // "sse", "stone", "thought"
	At      time.Time
}

// Summary is a compacted reference to a vault-persisted conversation segment.
type Summary struct {
	VaultKey string // e.g. "conversation/2026-04-13-1432"
	OneLiner string // e.g. "discussed test failures, dispatched Grix"
	From     time.Time
	To       time.Time
}

// estimateTokens returns a rough token count using the ~4 chars/token heuristic.
func estimateTokens(s string) int {
	n := len(s) / 4
	if n == 0 && len(s) > 0 {
		n = 1
	}
	return n
}
