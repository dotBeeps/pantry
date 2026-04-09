package soul

import (
	"fmt"
	"strings"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/consent"
	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
)

// consentTierGate blocks beats when the dual-key consent system has not granted
// the required tier of implicit learning. Enforces ETHICS.md §3.1-3.2.
type consentTierGate struct {
	id        string
	threshold memory.ConsentTier
	feature   string                // default: "observations"
	state     *consent.ConsentState // nil = graceful: no violation
}

// parseConsentTierRule parses a rule string of the form:
//
//	"consent-tier: high"
//	"consent-tier: medium observations"
//	"consent-tier: low implicit-learning"
//
// Returns ErrDeclarative if the rule does not start with "consent-tier:".
func parseConsentTierRule(id, rule string) (*consentTierGate, error) {
	const prefix = "consent-tier:"
	if !strings.HasPrefix(rule, prefix) {
		return nil, ErrDeclarative
	}
	rest := strings.TrimSpace(strings.TrimPrefix(rule, prefix))
	if rest == "" {
		return nil, fmt.Errorf("consent-tier rule for %q is missing a tier value", id)
	}
	parts := strings.Fields(rest)
	tier := memory.ConsentTier(parts[0])
	switch tier {
	case memory.TierLow, memory.TierMedium, memory.TierHigh:
		// valid
	default:
		return nil, fmt.Errorf("consent-tier rule for %q: unknown tier %q (want low, medium, or high)", id, parts[0])
	}
	feature := "observations"
	if len(parts) > 1 {
		feature = parts[1]
	}
	return &consentTierGate{id: id, threshold: tier, feature: feature}, nil
}

// ID returns the contract rule ID.
func (g *consentTierGate) ID() string { return g.id }

// Check returns a Violation if consent is not active for this gate's feature and tier.
// Returns nil when no ConsentState is wired (graceful degradation for uninitialised systems).
func (g *consentTierGate) Check(_ time.Time) *Violation {
	if g.state == nil {
		return nil
	}
	if g.state.IsActive(g.feature, g.threshold) {
		return nil
	}
	return &Violation{
		RuleID: g.id,
		Message: fmt.Sprintf(
			"consent-tier gate blocked: %s-tier access for feature %q requires dual-key consent (ETHICS.md §3.1-3.2)",
			g.threshold, g.feature,
		),
	}
}
