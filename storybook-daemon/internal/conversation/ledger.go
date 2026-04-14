package conversation

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
)

// Ledger is an in-memory sliding window of conversational exchanges.
// When the token budget overflows, older entries are compacted into
// vault journal notes and replaced with one-liner summary references.
type Ledger struct {
	mu          sync.Mutex
	entries     []Entry
	summaries   []Summary
	tokenCount  int
	tokenBudget int
	sumBudget   int // max tokens for summaries section
	vault       *memory.Vault
	log         *slog.Logger
}

// New creates a Ledger with the given token budget.
// If budget is 0, defaults to 2000 tokens.
func New(budget int, vault *memory.Vault, log *slog.Logger) *Ledger {
	if budget <= 0 {
		budget = 2000
	}
	return &Ledger{
		tokenBudget: budget,
		sumBudget:   200,
		vault:       vault,
		log:         log,
	}
}

// Append adds an entry to the ledger. If the token budget is exceeded,
// the oldest ~40% of entries are compacted into a vault note.
func (l *Ledger) Append(e Entry) {
	if e.At.IsZero() {
		e.At = time.Now()
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	tokens := estimateTokens(e.Content)
	l.entries = append(l.entries, e)
	l.tokenCount += tokens

	if l.tokenCount > l.tokenBudget && len(l.entries) > 2 {
		l.compact()
	}
}

// Recent returns the last n entries (or all if n <= 0).
func (l *Ledger) Recent(n int) []Entry {
	l.mu.Lock()
	defer l.mu.Unlock()

	if n <= 0 || n >= len(l.entries) {
		out := make([]Entry, len(l.entries))
		copy(out, l.entries)
		return out
	}
	out := make([]Entry, n)
	copy(out, l.entries[len(l.entries)-n:])
	return out
}

// Summaries returns a copy of the compacted segment summaries.
func (l *Ledger) Summaries() []Summary {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([]Summary, len(l.summaries))
	copy(out, l.summaries)
	return out
}

// Render formats the conversation context for LLM injection.
func (l *Ledger) Render() string {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.entries) == 0 && len(l.summaries) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("### Recent Conversation\n\n")

	if len(l.summaries) > 0 {
		sb.WriteString("Earlier (in vault):\n")
		for _, s := range l.summaries {
			fmt.Fprintf(&sb, "- [%s–%s] %s → %s\n",
				s.From.Format("15:04"), s.To.Format("15:04"),
				s.OneLiner, s.VaultKey)
		}
		sb.WriteString("\n")
	}

	for _, e := range l.entries {
		fmt.Fprintf(&sb, "[%s] %s: %s\n", e.At.Format("15:04"), e.Role, e.Content)
	}
	sb.WriteString("\n")
	return sb.String()
}

// CompactAll forces compaction of all remaining entries to the vault.
// Called on graceful shutdown.
func (l *Ledger) CompactAll() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.entries) == 0 {
		return
	}
	l.compactBatch(l.entries)
	l.entries = nil
	l.tokenCount = 0
}

// compact moves the oldest ~40% of entries into a vault note.
// Must be called with l.mu held.
func (l *Ledger) compact() {
	cut := len(l.entries) * 2 / 5
	if cut < 1 {
		cut = 1
	}
	batch := l.entries[:cut]
	l.entries = l.entries[cut:]

	l.compactBatch(batch)
	l.recalcTokenCount()
	l.pruneSummaries()
}

// compactBatch writes a batch of entries to the vault and adds a summary reference.
// Must be called with l.mu held.
func (l *Ledger) compactBatch(batch []Entry) {
	if len(batch) == 0 {
		return
	}

	transcript := formatTranscript(batch)
	key := fmt.Sprintf("conversation/%s", batch[0].At.Format("2006-01-02-1504"))
	oneLiner := heuristicSummary(batch)

	if l.vault != nil {
		_, err := l.vault.Write(
			key, memory.KindJournal, transcript,
			[]string{"conversation", "auto-compacted"},
			false, memory.TierUnset,
		)
		if err != nil {
			l.log.Error("conversation: vault compaction failed", "key", key, "err", err)
			return
		}
		l.log.Info("conversation: compacted to vault", "key", key, "entries", len(batch))
	}

	l.summaries = append(l.summaries, Summary{
		VaultKey: key,
		OneLiner: oneLiner,
		From:     batch[0].At,
		To:       batch[len(batch)-1].At,
	})
}

// recalcTokenCount recomputes the token count from scratch.
// Must be called with l.mu held.
func (l *Ledger) recalcTokenCount() {
	total := 0
	for _, e := range l.entries {
		total += estimateTokens(e.Content)
	}
	l.tokenCount = total
}

// pruneSummaries drops oldest summaries if the summaries section exceeds its budget.
// Must be called with l.mu held.
func (l *Ledger) pruneSummaries() {
	total := 0
	for _, s := range l.summaries {
		total += estimateTokens(s.OneLiner) + estimateTokens(s.VaultKey) + 10 // overhead
	}
	for total > l.sumBudget && len(l.summaries) > 1 {
		dropped := l.summaries[0]
		total -= estimateTokens(dropped.OneLiner) + estimateTokens(dropped.VaultKey) + 10
		l.summaries = l.summaries[1:]
	}
}

// formatTranscript formats a batch of entries as a readable transcript.
func formatTranscript(entries []Entry) string {
	var sb strings.Builder
	for _, e := range entries {
		fmt.Fprintf(&sb, "[%s] %s: %s\n", e.At.Format("15:04"), e.Role, e.Content)
	}
	return sb.String()
}

// heuristicSummary generates a one-liner from a batch of entries.
// Takes the first content phrase from each entry's first sentence, joins with semicolons.
func heuristicSummary(entries []Entry) string {
	var parts []string
	for _, e := range entries {
		phrase := e.Content
		if idx := strings.IndexAny(phrase, ".!?\n"); idx > 0 {
			phrase = phrase[:idx]
		}
		if len(phrase) > 60 {
			phrase = phrase[:60] + "..."
		}
		if phrase != "" {
			parts = append(parts, phrase)
		}
		if len(parts) >= 3 {
			break
		}
	}
	result := strings.Join(parts, "; ")
	if len(result) > 100 {
		result = result[:100] + "..."
	}
	return result
}
