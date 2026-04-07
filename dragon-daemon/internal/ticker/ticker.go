// Package ticker implements the heartbeat timer that drives thought cycles.
// The interval has configurable variance (jitter) so the daemon doesn't feel mechanical.
package ticker

import (
	"context"
	"log/slog"
	"math/rand"
	"time"
)

// TickFunc is called on each tick. If it returns an error, it's logged but the ticker continues.
type TickFunc func(ctx context.Context) error

// Ticker drives periodic thought cycles with jitter.
type Ticker struct {
	interval time.Duration
	variance float64 // jitter as a fraction of interval, e.g. 0.2 = ±20%
	fn       TickFunc
	log      *slog.Logger
}

// New creates a Ticker with the given interval, variance, and tick function.
func New(interval time.Duration, variance float64, fn TickFunc, log *slog.Logger) *Ticker {
	return &Ticker{
		interval: interval,
		variance: variance,
		fn:       fn,
		log:      log,
	}
}

// Run starts the ticker loop. It blocks until ctx is cancelled.
// The first tick fires immediately.
func (t *Ticker) Run(ctx context.Context) {
	t.log.Info("ticker started",
		"interval", t.interval,
		"variance", t.variance,
	)

	// Fire immediately on start.
	t.tick(ctx)

	for {
		next := t.nextInterval()
		t.log.Debug("next tick scheduled", "in", next.Round(time.Second))

		select {
		case <-ctx.Done():
			t.log.Info("ticker stopped")
			return
		case <-time.After(next):
			t.tick(ctx)
		}
	}
}

// tick calls the tick function and logs any error.
func (t *Ticker) tick(ctx context.Context) {
	if err := t.fn(ctx); err != nil {
		t.log.Error("tick error", "err", err)
	}
}

// nextInterval returns the next tick duration with jitter applied.
// jitter = interval * variance * rand[-1, 1]
func (t *Ticker) nextInterval() time.Duration {
	if t.variance == 0 {
		return t.interval
	}
	// rand.Float64() returns [0, 1); map to [-1, 1).
	jitter := (rand.Float64()*2 - 1) * t.variance
	delta := time.Duration(float64(t.interval) * jitter)
	result := t.interval + delta
	// Never go below 10% of the base interval.
	min := t.interval / 10
	if result < min {
		result = min
	}
	return result
}
