// Package consent implements the dual-key consent system described in ETHICS.md §3.1-3.2.
// Both the user and the agent must independently grant a feature+tier pair for IsActive
// to return true. Higher tiers satisfy lower-tier requirements.
package consent

import (
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/dotBeeps/hoard/storybook-daemon/internal/memory"
	"gopkg.in/yaml.v3"
)

// tierOrder maps ConsentTier to a numeric level for threshold comparison.
var tierOrder = map[memory.ConsentTier]int{
	memory.TierUnset:  0,
	memory.TierLow:    1,
	memory.TierMedium: 2,
	memory.TierHigh:   3,
}

// grantRecord is the on-disk YAML representation of a single consent grant.
type grantRecord struct {
	Feature   string             `yaml:"feature"`
	Tier      memory.ConsentTier `yaml:"tier"`
	GrantedAt time.Time          `yaml:"granted_at"`
}

// consentFile is the on-disk YAML structure for a consent file.
type consentFile struct {
	Grants []grantRecord `yaml:"grants"`
}

// ConsentState holds dual-key consent grants from both the user and the agent.
// Both must independently grant a feature+tier pair for IsActive to return true.
// The zero value is not usable; obtain via Load.
// ConsentState manages the dual-key consent system (user + agent toggles).
//
//nolint:revive // name is intentionally ConsentState for clarity at the call site
type ConsentState struct {
	log       *slog.Logger
	userPath  string
	agentPath string
	// in-memory mirrors of the persisted grant sets, keyed by feature
	userGrants  map[string]grantRecord
	agentGrants map[string]grantRecord
}

// Load reads consent state from two YAML files: the user's consent file and the
// agent's consent file. Missing files are treated as empty consent (no grants).
func Load(userPath, agentPath string, log *slog.Logger) (*ConsentState, error) {
	cs := &ConsentState{
		log:         log,
		userPath:    userPath,
		agentPath:   agentPath,
		userGrants:  make(map[string]grantRecord),
		agentGrants: make(map[string]grantRecord),
	}
	if err := cs.loadFile(userPath, cs.userGrants); err != nil {
		return nil, fmt.Errorf("loading user consent: %w", err)
	}
	if err := cs.loadFile(agentPath, cs.agentGrants); err != nil {
		return nil, fmt.Errorf("loading agent consent: %w", err)
	}
	return cs, nil
}

func (cs *ConsentState) loadFile(path string, grants map[string]grantRecord) error {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil // missing file = no grants; normal on first run
	}
	if err != nil {
		return fmt.Errorf("reading %s: %w", path, err)
	}
	var cf consentFile
	if err := yaml.Unmarshal(data, &cf); err != nil {
		return fmt.Errorf("parsing %s: %w", path, err)
	}
	for _, g := range cf.Grants {
		if _, ok := tierOrder[g.Tier]; !ok {
			cs.log.Warn("consent: unknown tier in file, skipping", "feature", g.Feature, "tier", g.Tier)
			continue
		}
		// Last write wins; callers that care about ordering use Grant to upsert.
		grants[g.Feature] = g
	}
	return nil
}

func (cs *ConsentState) saveFile(path string, grants map[string]grantRecord) error {
	cf := consentFile{Grants: make([]grantRecord, 0, len(grants))}
	for _, g := range grants {
		cf.Grants = append(cf.Grants, g)
	}
	data, err := yaml.Marshal(&cf)
	if err != nil {
		return fmt.Errorf("marshalling consent: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}
	return nil
}

// UserGrant records that the user consents to the given feature at the given tier.
// If the feature already has a grant, it is replaced (upsert). Persists to disk.
func (cs *ConsentState) UserGrant(feature string, tier memory.ConsentTier) error {
	cs.userGrants[feature] = grantRecord{Feature: feature, Tier: tier, GrantedAt: time.Now()}
	if err := cs.saveFile(cs.userPath, cs.userGrants); err != nil {
		return fmt.Errorf("saving user grant: %w", err)
	}
	return nil
}

// AgentGrant records that the agent consents to the given feature at the given tier.
// If the feature already has a grant, it is replaced (upsert). Persists to disk.
func (cs *ConsentState) AgentGrant(feature string, tier memory.ConsentTier) error {
	cs.agentGrants[feature] = grantRecord{Feature: feature, Tier: tier, GrantedAt: time.Now()}
	if err := cs.saveFile(cs.agentPath, cs.agentGrants); err != nil {
		return fmt.Errorf("saving agent grant: %w", err)
	}
	return nil
}

// UserRevoke removes the user's consent grant for the given feature. Persists to disk.
func (cs *ConsentState) UserRevoke(feature string) error {
	delete(cs.userGrants, feature)
	if err := cs.saveFile(cs.userPath, cs.userGrants); err != nil {
		return fmt.Errorf("saving user revoke: %w", err)
	}
	return nil
}

// IsActive returns true if both the user and the agent have independently granted at
// least the threshold tier for the given feature. Higher tiers satisfy lower requirements.
func (cs *ConsentState) IsActive(feature string, threshold memory.ConsentTier) bool {
	needed, ok := tierOrder[threshold]
	if !ok {
		return false
	}
	userGrant, userOK := cs.userGrants[feature]
	if !userOK || tierOrder[userGrant.Tier] < needed {
		return false
	}
	agentGrant, agentOK := cs.agentGrants[feature]
	if !agentOK || tierOrder[agentGrant.Tier] < needed {
		return false
	}
	return true
}
