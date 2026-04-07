package soul

import (
	"fmt"
	"log/slog"
	"strings"
	"sync"
)

// OutputCapture is implemented by anything that produces thought output.
// The framing audit uses this to observe text without importing the thought package.
type OutputCapture interface {
	OnOutput(hook func(text string))
}

// defaultFramingPatterns are high-precision corrective-framing markers.
// Each phrase indicates the agent is referencing past user behaviour
// in a surveillance or corrective way, violating ETHICS.md §3.5.
var defaultFramingPatterns = []string{
	"you used to",
	"you changed your",
	"you stopped",
	"you no longer",
	"i noticed you",
	"i've noticed you",
	"i notice you",
	"you were previously",
	"previously you",
	"you switched from",
}

// forwardPhrases are companion phrases that make corrective language acceptable.
// "You used to prefer X, from now on I'll suggest Y" is compliant framing.
var forwardPhrases = []string{
	"from now on",
	"going forward",
	"in future",
	"in the future",
	"will now",
	"next time",
}

// framingAudit enforces ETHICS.md §3.5: observations must be forward-looking,
// never corrective. Scans all thought output produced during a cycle.
type framingAudit struct {
	id       string
	patterns []string
	mu       sync.Mutex
	outputs  []string
	log      *slog.Logger
}

// newFramingAudit creates a framing audit and registers an output hook on the
// thought cycle. Every piece of text produced by the cycle is captured and
// scanned in Verify().
func newFramingAudit(id string, capture OutputCapture, patterns []string, log *slog.Logger) *framingAudit {
	a := &framingAudit{id: id, patterns: patterns, log: log}
	capture.OnOutput(func(text string) {
		a.mu.Lock()
		defer a.mu.Unlock()
		a.outputs = append(a.outputs, text)
	})
	return a
}

// parseFramingPatterns extracts comma-separated patterns from a rule string.
// Rule format: "framing-honesty: pattern one, pattern two, pattern three"
// If no patterns follow the colon, the defaultFramingPatterns are returned.
func parseFramingPatterns(rule string) []string {
	const prefix = "framing-honesty:"
	rest := strings.TrimSpace(strings.TrimPrefix(rule, prefix))
	if rest == "" {
		return defaultFramingPatterns
	}
	parts := strings.Split(rest, ",")
	patterns := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			patterns = append(patterns, t)
		}
	}
	if len(patterns) == 0 {
		return defaultFramingPatterns
	}
	return patterns
}

// ID returns the contract rule ID.
func (a *framingAudit) ID() string { return a.id }

// Snapshot is a no-op — framing audit requires no pre-beat state.
func (a *framingAudit) Snapshot() {}

// Verify drains collected output and scans for corrective-framing patterns.
// Returns a Violation if any pattern is found without a forward-looking companion.
func (a *framingAudit) Verify() *Violation {
	a.mu.Lock()
	outputs := a.outputs
	a.outputs = nil
	a.mu.Unlock()

	if len(outputs) == 0 {
		return nil
	}

	combined := strings.Join(outputs, " ")
	if found := a.scanForViolations(combined); len(found) > 0 {
		a.log.Warn("dragon-soul: framing violation detected",
			"patterns", found,
			"rule", "ETHICS.md §3.5",
		)
		return &Violation{
			RuleID:  a.id,
			Message: fmt.Sprintf("corrective framing detected in thought output (%d pattern(s)): %v", len(found), found),
		}
	}
	return nil
}

// scanForViolations returns corrective patterns found in text that are NOT
// followed by a forward-looking companion phrase within 100 characters.
func (a *framingAudit) scanForViolations(text string) []string {
	lower := strings.ToLower(text)
	var violations []string

	for _, pattern := range a.patterns {
		patLower := strings.ToLower(pattern)
		idx := strings.Index(lower, patLower)
		if idx < 0 {
			continue
		}
		afterIdx := idx + len(patLower)
		end := afterIdx + 100
		if end > len(lower) {
			end = len(lower)
		}
		after := lower[afterIdx:end]
		hasForward := false
		for _, fw := range forwardPhrases {
			if strings.Contains(after, fw) {
				hasForward = true
				break
			}
		}
		if !hasForward {
			violations = append(violations, pattern)
		}
	}
	return violations
}
