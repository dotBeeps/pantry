package soul

import (
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/attention"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/consent"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/memory"
	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
)

// Deps provides the runtime dependencies that audit and gate rules need.
type Deps struct {
	Ledger *attention.Ledger
	Vault  *memory.Vault
	// Consent is the dual-key consent state. Optional: if nil, consent-tier gates pass silently.
	Consent *consent.ConsentState
	// Cycle captures thought output for the framing audit. Optional: if nil, framing audit is skipped.
	Cycle OutputCapture
}

// Enforcer checks persona contracts before and after each thought cycle.
// It is the dragon-soul: the ethical core that gates and audits cognition.
type Enforcer struct {
	gates  []Gate
	audits []Audit
	log    *slog.Logger

	// attentionSnap is the pre-beat attention snapshot, if active.
	attentionSnap *attentionAudit
}

// NewEnforcer creates an Enforcer from the persona's contracts and runtime deps.
// Declarative rules are logged and acknowledged. Enforceable rules are activated
// based on available dependencies.
func NewEnforcer(contracts []persona.Contract, deps Deps, log *slog.Logger) (*Enforcer, error) {
	e := &Enforcer{log: log}

	for _, c := range contracts {
		if !c.Enabled {
			log.Info("dragon-soul: contract disabled", "id", c.ID)
			continue
		}

		// Try to parse as a pre-beat gate.
		gate, err := ParseGate(c.ID, c.Rule)
		switch {
		case err == nil:
			log.Info("dragon-soul: gate enforced", "id", c.ID)
			e.gates = append(e.gates, gate)
			continue
		case !errors.Is(err, ErrDeclarative):
			return nil, err
		}

		// Try to build as a dependency-aware pre-beat gate.
		dgate, gateErr := e.buildGate(c, deps)
		switch {
		case gateErr == nil:
			log.Info("dragon-soul: gate enforced", "id", c.ID)
			e.gates = append(e.gates, dgate)
			continue
		case !errors.Is(gateErr, ErrDeclarative):
			return nil, gateErr
		}

		// Try to build as a post-beat audit.
		audit := e.buildAudit(c, deps, log)
		if audit != nil {
			log.Info("dragon-soul: audit enforced", "id", c.ID)
			e.audits = append(e.audits, audit)
			continue
		}

		// Declarative — acknowledged but not mechanically enforced.
		log.Info("dragon-soul: declarative contract acknowledged", "id", c.ID, "rule", c.Rule)
	}

	return e, nil
}

// buildGate creates a dependency-aware pre-beat gate for known contract rules.
// Returns (nil, ErrDeclarative) when the rule is not recognised by this builder.
func (e *Enforcer) buildGate(c persona.Contract, deps Deps) (Gate, error) {
	g, err := parseConsentTierRule(c.ID, c.Rule)
	if errors.Is(err, ErrDeclarative) {
		return nil, ErrDeclarative
	}
	if err != nil {
		return nil, fmt.Errorf("parsing consent-tier rule: %w", err)
	}
	if deps.Consent != nil {
		g.state = deps.Consent
	}
	return g, nil
}

// buildAudit creates an audit rule for known contract IDs.
func (e *Enforcer) buildAudit(c persona.Contract, deps Deps, log *slog.Logger) Audit {
	switch c.ID {
	case "attention-honesty":
		if deps.Ledger == nil {
			return nil
		}
		a := newAttentionAudit(c.ID, deps.Ledger)
		e.attentionSnap = a // stash for pre-beat snapshot
		return a

	case "memory-transparency":
		if deps.Vault == nil {
			return nil
		}
		return newMemoryAudit(c.ID, deps.Vault, log)

	case "private-shelf":
		if deps.Vault == nil {
			return nil
		}
		return newPrivateShelfAudit(c.ID, deps.Vault, log)

	case "framing-honesty":
		if deps.Cycle == nil {
			return nil
		}
		return newFramingAudit(c.ID, deps.Cycle, parseFramingPatterns(c.Rule), log)
	}
	return nil
}

// Check evaluates all pre-beat gates at the current time.
// Returns the first violation found, or nil if all gates pass.
func (e *Enforcer) Check() *Violation {
	return e.CheckAt(time.Now())
}

// CheckAt evaluates all pre-beat gates at the given time.
func (e *Enforcer) CheckAt(now time.Time) *Violation {
	for _, g := range e.gates {
		if v := g.Check(now); v != nil {
			e.log.Info("dragon-soul: gate violation",
				"rule", v.RuleID,
				"message", v.Message,
			)
			return v
		}
	}
	return nil
}

// PreBeat takes pre-beat snapshots needed by audit rules.
// Call this right before the thought cycle runs.
func (e *Enforcer) PreBeat() {
	if e.attentionSnap != nil {
		e.attentionSnap.Snapshot()
	}
}

// Verify evaluates all post-beat audits.
// Returns the first violation found, or nil if all audits pass.
func (e *Enforcer) Verify() *Violation {
	for _, a := range e.audits {
		if v := a.Verify(); v != nil {
			e.log.Warn("dragon-soul: audit violation",
				"rule", v.RuleID,
				"message", v.Message,
			)
			return v
		}
	}
	return nil
}

// GateCount returns the number of active pre-beat gates.
func (e *Enforcer) GateCount() int { return len(e.gates) }

// AuditCount returns the number of active post-beat audits.
func (e *Enforcer) AuditCount() int { return len(e.audits) }
