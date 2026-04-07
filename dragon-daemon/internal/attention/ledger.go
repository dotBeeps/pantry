// Package attention implements the attention economy for a persona.
// Attention is a resource that regenerates over time and is spent on thought cycles.
package attention

import (
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/dotBeeps/hoard/dragon-daemon/internal/persona"
)

// Ledger tracks the current attention pool and handles regen + spending.
type Ledger struct {
	mu      sync.Mutex
	pool    float64 // current attention units (float for fractional regen)
	max     int     // maximum pool size (starting pool)
	floor   int     // minimum before ticker pauses
	rate    float64 // units per hour regeneration
	costs   persona.CostConfig
	lastRegen time.Time
	log     *slog.Logger
}

// New creates a Ledger initialised from a persona config.
func New(cfg *persona.Persona, log *slog.Logger) *Ledger {
	return &Ledger{
		pool:      float64(cfg.Attention.Pool),
		max:       cfg.Attention.Pool,
		floor:     cfg.Attention.Floor,
		rate:      float64(cfg.Attention.Rate),
		costs:     cfg.Costs,
		lastRegen: time.Now(),
		log:       log,
	}
}

// Pool returns the current attention (after applying regeneration since last call).
func (l *Ledger) Pool() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.regen()
	return int(l.pool)
}

// AboveFloor reports whether current attention is above the configured floor.
func (l *Ledger) AboveFloor() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.regen()
	return int(l.pool) >= l.floor
}

// Spend deducts cost units from the pool. Returns an error if the pool would go negative.
func (l *Ledger) Spend(action string, cost int) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.regen()
	if int(l.pool) < cost {
		return fmt.Errorf("insufficient attention for %s: have %d, need %d", action, int(l.pool), cost)
	}
	l.pool -= float64(cost)
	l.log.Info("attention spent",
		"action", action,
		"cost", cost,
		"pool_after", int(l.pool),
	)
	return nil
}

// SpendThink deducts the configured think cost.
func (l *Ledger) SpendThink() error { return l.Spend("think", l.costs.Think) }

// SpendSpeak deducts the configured speak cost.
func (l *Ledger) SpendSpeak() error { return l.Spend("speak", l.costs.Speak) }

// SpendRemember deducts the configured remember cost.
func (l *Ledger) SpendRemember() error { return l.Spend("remember", l.costs.Remember) }

// SpendSearch deducts the configured search cost.
func (l *Ledger) SpendSearch() error { return l.Spend("search", l.costs.Search) }

// SpendPerceive deducts the configured perceive cost.
func (l *Ledger) SpendPerceive() error { return l.Spend("perceive", l.costs.Perceive) }

// regen adds regenerated attention based on elapsed time.
// Must be called with l.mu held.
func (l *Ledger) regen() {
	now := time.Now()
	elapsed := now.Sub(l.lastRegen)
	if elapsed <= 0 {
		return
	}
	gained := l.rate * elapsed.Hours()
	l.pool += gained
	if l.pool > float64(l.max) {
		l.pool = float64(l.max)
	}
	l.lastRegen = now
}

// Status returns a human-readable summary of the current ledger state.
func (l *Ledger) Status() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.regen()
	return fmt.Sprintf("attention: %d/%d (floor: %d, regen: %.1f/hr)",
		int(l.pool), l.max, l.floor, l.rate)
}
