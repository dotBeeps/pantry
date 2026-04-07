// Package heart implements the dragon-heart — the heartbeat timer that drives
// thought cycles. Beats on schedule with jitter, but can also be nudged by
// external events for immediate response.
package heart

import (
	"context"
	"log/slog"
	"math/rand"
	"time"
)

// BeatFunc is called on each heartbeat. If it returns an error, it's logged
// but the heart keeps beating.
type BeatFunc func(ctx context.Context) error

// Heart drives periodic thought cycles with jitter.
// It beats on schedule but can also be nudged by external events.
type Heart struct {
	interval time.Duration
	variance float64 // jitter as a fraction of interval, e.g. 0.2 = ±20%
	fn       BeatFunc
	log      *slog.Logger
	nudge    chan struct{} // event-driven trigger
}

// New creates a Heart with the given interval, variance, and beat function.
func New(interval time.Duration, variance float64, fn BeatFunc, log *slog.Logger) *Heart {
	return &Heart{
		interval: interval,
		variance: variance,
		fn:       fn,
		log:      log,
		nudge:    make(chan struct{}, 1), // buffered 1 for coalescing
	}
}

// Nudge triggers an immediate thought cycle outside the heartbeat schedule.
// Non-blocking: if a nudge is already pending, this one is absorbed.
func (h *Heart) Nudge() {
	select {
	case h.nudge <- struct{}{}:
		h.log.Debug("dragon-heart: nudge accepted")
	default:
		h.log.Debug("dragon-heart: nudge coalesced")
	}
}

// Run starts the heartbeat loop. It blocks until ctx is cancelled.
// The first beat fires immediately. Between beats, external events
// can trigger immediate beats via Nudge().
func (h *Heart) Run(ctx context.Context) {
	h.log.Info("dragon-heart started",
		"interval", h.interval,
		"variance", h.variance,
	)

	// Fire immediately on start.
	h.beat(ctx)

	for {
		next := h.nextInterval()
		h.log.Debug("dragon-heart: next beat", "in", next.Round(time.Second))

		timer := time.NewTimer(next)
		select {
		case <-ctx.Done():
			timer.Stop()
			h.log.Info("dragon-heart stopped")
			return
		case <-timer.C:
			h.beat(ctx)
		case <-h.nudge:
			timer.Stop()
			h.log.Info("dragon-heart: event-driven beat")
			h.beat(ctx)
		}
	}
}

// beat calls the beat function and logs any error.
func (h *Heart) beat(ctx context.Context) {
	if err := h.fn(ctx); err != nil {
		h.log.Error("heartbeat error", "err", err)
	}
}

// nextInterval returns the next beat duration with jitter applied.
// jitter = interval * variance * rand[-1, 1]
func (h *Heart) nextInterval() time.Duration {
	if h.variance == 0 {
		return h.interval
	}
	// rand.Float64() returns [0, 1); map to [-1, 1).
	jitter := (rand.Float64()*2 - 1) * h.variance //nolint:gosec // G404: jitter timing, not security-critical
	delta := time.Duration(float64(h.interval) * jitter)
	result := h.interval + delta
	// Never go below 10% of the base interval.
	floor := h.interval / 10
	if result < floor {
		result = floor
	}
	return result
}
